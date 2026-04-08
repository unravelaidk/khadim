import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";
import { type AgentId } from "./agents";
import {
  createAgentSessionTurn,
  formatDelegationPrompt,
  type AgentSessionConfig,
  type StreamEvent,
} from "./core/agent-session";
import { runSubagentSession } from "./core/subagent-session";

export interface OrchestratorConfig extends AgentSessionConfig {
  model: Model<any>;
  tools: AgentTool<any>[];
  systemPrompt: string;
  apiKey?: string;
  temperature?: number;
}

export interface OrchestratorInputs {
  messages: Message[];
  currentAgent: AgentId;
  requestedMode?: AgentId;
}

async function* runPiOrchestrator(
  config: OrchestratorConfig,
  inputs: OrchestratorInputs,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  let messages: AgentMessage[] = [...inputs.messages];
  let currentAgent = inputs.requestedMode || inputs.currentAgent;
  let activeTask: string | null = null;
  let iterations = 0;

  while (iterations < 30) {
    iterations += 1;
    const turn = createAgentSessionTurn(config, {
      currentAgent,
      messages,
      activeTask,
      signal,
    });

    for await (const event of turn.events) {
      yield event;
    }

    const turnResult = await turn.result;
    messages = [...turnResult.messages];
    const activeControl = turnResult.control;

    if (activeControl && activeControl.kind === "ask_user") {
      break;
    }

    if (activeControl && activeControl.kind === "delegate_build") {
      currentAgent = "build";
      activeTask = activeControl.context ? `${activeControl.plan}\nContext: ${activeControl.context}` : activeControl.plan;
      messages.push(formatDelegationPrompt("[Plan agent delegated to you]", activeControl.plan, activeControl.context));
      continue;
    }

    if (activeControl && activeControl.kind === "delegate_agent") {
      const emittedEvents: StreamEvent[] = [];
      const subagentResult = await runSubagentSession(
        config,
        {
          agent: activeControl.agent,
          task: activeControl.task,
          context: activeControl.context,
          signal,
        },
        (event) => {
          emittedEvents.push(event);
        },
      );

      for (const event of emittedEvents) {
        yield event;
      }

      let report = subagentResult.report || `Subagent ${activeControl.agent} completed without a text report.`;
      if (subagentResult.control?.kind === "ask_user") {
        report = `Subagent ${activeControl.agent} needs clarification: ${subagentResult.control.payload.question}`;
      } else if (subagentResult.control?.kind === "delegate_build") {
        report = `Subagent ${activeControl.agent} attempted to delegate to build. Proposed plan:\n${subagentResult.control.plan}`;
      } else if (subagentResult.control?.kind === "delegate_agent") {
        report = `Subagent ${activeControl.agent} attempted nested delegation to ${subagentResult.control.agent}. Task:\n${subagentResult.control.task}`;
      }
      messages.push(formatDelegationPrompt(`[Subagent ${activeControl.agent} completed]`, report));
      currentAgent = inputs.currentAgent;
      activeTask = null;
      continue;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      break;
    }

    if (lastMessage?.role !== "toolResult") {
      break;
    }
  }

  yield {
    event: "on_chain_end",
    name: "PiAgent",
    data: { output: { messages } },
  };
}

export function createOrchestrator(config: OrchestratorConfig) {
  return {
    streamEvents(inputs: OrchestratorInputs, options?: { signal?: AbortSignal }) {
      return runPiOrchestrator(config, inputs, options?.signal);
    },
  };
}
