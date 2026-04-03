import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentId } from "../agents";
import {
  createAgentSessionTurn,
  formatDelegationPrompt,
  messageText,
  type AgentSessionConfig,
  type DelegationState,
  type StreamEvent,
} from "./agent-session";

export interface RunSubagentSessionParams {
  agent: AgentId;
  task: string;
  context?: string;
  signal?: AbortSignal;
}

export interface SubagentSessionResult {
  report: string;
  messages: AgentMessage[];
  control: DelegationState;
}

export async function runSubagentSession(
  config: AgentSessionConfig,
  params: RunSubagentSessionParams,
  emit: (event: StreamEvent) => void,
): Promise<SubagentSessionResult> {
  const turn = createAgentSessionTurn(
    config,
    {
      currentAgent: params.agent,
      messages: [formatDelegationPrompt("[Primary agent delegated to you]", params.task, params.context)],
      activeTask: params.context ? `${params.task}\nContext: ${params.context}` : params.task,
      signal: params.signal,
    },
  );

  for await (const event of turn.events) {
    emit(event);
  }

  const result = await turn.result;

  const lastMessage = result.messages[result.messages.length - 1];
  const report = messageText(lastMessage);

  return {
    report,
    messages: result.messages,
    control: result.control,
  };
}
