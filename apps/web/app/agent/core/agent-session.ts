import { Agent, type AgentMessage, type AgentTool } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Message, Model, ToolResultMessage } from "@mariozechner/pi-ai";
import { defaultConvertToLlm } from "../pi-convert-to-llm";
import { filterToolsForAgent, getAgentConfig, type AgentId } from "../agents";
import { parseAskUserResponse, type AskUserPayload } from "../tools/ask-user";
import { parseDelegateResponse } from "../tools/delegate-build";
import { parseDelegateAgentResponse } from "../tools/delegate-agent";

export type StreamEvent = {
  event: string;
  name?: string;
  data?: Record<string, unknown>;
};

type StreamQueue = {
  push: (event: StreamEvent) => void;
  close: () => void;
  fail: (error: unknown) => void;
  next: () => Promise<IteratorResult<StreamEvent>>;
};

export type DelegationState =
  | { kind: "ask_user"; payload: AskUserPayload }
  | { kind: "delegate_build"; plan: string; context: string }
  | { kind: "delegate_agent"; agent: AgentId; task: string; context: string }
  | null;

export interface AgentSessionConfig {
  model: Model<any>;
  tools: AgentTool<any>[];
  systemPrompt: string;
  apiKey?: string;
  temperature?: number;
}

export interface RunAgentSessionTurnParams {
  currentAgent: AgentId;
  messages: AgentMessage[];
  activeTask?: string | null;
  signal?: AbortSignal;
}

export interface AgentSessionTurnResult {
  messages: AgentMessage[];
  control: DelegationState;
}

export interface AgentSessionTurnHandle {
  events: AsyncGenerator<StreamEvent>;
  result: Promise<AgentSessionTurnResult>;
}

export function messageText(message: AgentMessage | ToolResultMessage | AssistantMessage | undefined): string {
  if (!message || !Array.isArray((message as any).content)) {
    return typeof (message as any)?.content === "string" ? (message as any).content : "";
  }
  return (message as any).content
    .map((block: any) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("\n");
}

export function formatDelegationPrompt(prefix: string, task: string, context?: string): Message {
  return {
    role: "user",
    content: `${prefix}\nTask: ${task}${context ? `\nContext: ${context}` : ""}`,
    timestamp: Date.now(),
  };
}

function createStreamQueue(): StreamQueue {
  const events: StreamEvent[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<StreamEvent>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let done = false;

  return {
    push(event) {
      if (done) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value: event, done: false });
        return;
      }
      events.push(event);
    },
    close() {
      done = true;
      while (waiters.length > 0) {
        waiters.shift()?.resolve({ value: undefined, done: true });
      }
    },
    fail(error) {
      done = true;
      while (waiters.length > 0) {
        waiters.shift()?.reject(error);
      }
    },
    async next() {
      if (events.length > 0) {
        return { value: events.shift() as StreamEvent, done: false };
      }
      if (done) {
        return { value: undefined, done: true };
      }
      return new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}

export function createAgentSessionTurn(
  config: AgentSessionConfig,
  params: RunAgentSessionTurnParams,
): AgentSessionTurnHandle {
  const { currentAgent, messages, activeTask, signal } = params;
  const agentConfig = getAgentConfig(currentAgent);
  const agent = new Agent({
    initialState: {
      systemPrompt: `${config.systemPrompt}\n\n${agentConfig.systemPromptAddition}\n\nAssigned task: ${activeTask || "No specific task assigned."}`,
      model: config.model,
      tools: filterToolsForAgent(config.tools, currentAgent),
      messages: [...messages],
    },
    convertToLlm: defaultConvertToLlm,
    getApiKey: () => config.apiKey,
  });

  const eventQueue = createStreamQueue();
  let control: DelegationState = null;

  const unsubscribe = agent.subscribe((event: any) => {
    if (event.type === "message_start" && event.message.role === "assistant") {
      eventQueue.push({ event: "on_chat_model_start", name: currentAgent, data: {} });
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
      const delta = event.assistantMessageEvent.delta;
      if (delta) {
        eventQueue.push({
          event: "on_chat_model_stream",
          name: currentAgent,
          data: { chunk: { content: delta } },
        });
      }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      const delta = event.assistantMessageEvent.delta;
      if (delta) {
        eventQueue.push({ event: "text_delta", name: currentAgent, data: { content: delta } });
      }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_start") {
      eventQueue.push({
        event: "on_toolcall_start",
        name: currentAgent,
        data: { partial: event.assistantMessageEvent.partial },
      });
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_delta") {
      eventQueue.push({
        event: "on_toolcall_delta",
        name: currentAgent,
        data: {
          delta: event.assistantMessageEvent.delta,
          partial: event.assistantMessageEvent.partial,
        },
      });
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_end") {
      eventQueue.push({
        event: "on_toolcall_end",
        name: currentAgent,
        data: {
          toolCall: event.assistantMessageEvent.toolCall,
          partial: event.assistantMessageEvent.partial,
        },
      });
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      eventQueue.push({ event: "on_chat_model_end", name: currentAgent, data: { output: event.message } });
    }

    if (event.type === "tool_execution_start") {
      eventQueue.push({
        event: "on_tool_start",
        name: event.toolName,
        data: { input: event.args },
      });
    }

    if (event.type === "tool_execution_end") {
      const output = messageText({
        role: "toolResult",
        content: event.result.content,
        toolCallId: "",
        toolName: event.toolName,
        isError: event.isError,
        timestamp: Date.now(),
      });
      eventQueue.push({
        event: "on_tool_end",
        name: event.toolName,
        data: { output, result: event.result, isError: event.isError },
      });

      if (event.toolName === "ask_user") {
        const parsed = parseAskUserResponse(output);
        if (parsed) {
          control = { kind: "ask_user", payload: parsed };
          agent.abort();
        }
      }

      if (event.toolName === "delegate_to_build") {
        const parsed = parseDelegateResponse(output);
        if (parsed) {
          control = { kind: "delegate_build", plan: parsed.plan, context: parsed.context };
          agent.abort();
        }
      }

      if (event.toolName === "delegate_to_agent") {
        const parsed = parseDelegateAgentResponse(output);
        if (parsed) {
          control = {
            kind: "delegate_agent",
            agent: parsed.agent,
            task: parsed.task,
            context: parsed.context,
          };
          agent.abort();
        }
      }
    }

    if (event.type === "tool_execution_update") {
      eventQueue.push({
        event: "on_tool_update",
        name: event.toolName,
        data: {
          toolCallId: event.toolCallId,
          args: event.args,
          partialResult: event.partialResult,
        },
      });
    }
  });

  const runPromise = agent.continue()
    .catch((error) => {
      if (!signal?.aborted) {
        eventQueue.fail(error);
        throw error;
      }
    })
    .finally(() => {
      unsubscribe();
      eventQueue.close();
    });

  async function* events(): AsyncGenerator<StreamEvent> {
    while (true) {
      const nextEvent = await eventQueue.next();
      if (nextEvent.done) break;
      yield nextEvent.value;
    }
  }

  const result = runPromise.then(() => ({
    messages: [...agent.state.messages],
    control,
  }));

  return { events: events(), result };
}
