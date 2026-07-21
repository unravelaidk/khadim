import type { AgentRunRecoverySnapshot, Conversation, TokenUsage, ToolCallActivity } from "../shared/types";
import { applySequencedAgentEvent, reconcileTerminalAssistant } from "../shared/agent-event-reducer";

function finishRunningTools(toolCalls: ToolCallActivity[] | undefined): ToolCallActivity[] | undefined {
  return toolCalls?.map((tool) => tool.status === "running"
    ? { ...tool, status: "error" as const, result: tool.result || "Interrupted while Khadim was closing." }
    : tool);
}

/**
 * Main-process safety net used only when the renderer did not acknowledge a
 * shutdown run. It preserves unseen text and guarantees no durable run remains
 * falsely "running" after its process has been stopped.
 */
export function applyShutdownRecovery(
  conversation: Conversation,
  snapshot: AgentRunRecoverySnapshot,
  completedAt: string,
): Conversation | null {
  if (conversation.id !== snapshot.conversationId || conversation.projectId !== snapshot.projectId) return null;
  const run = conversation.runs?.find((candidate) => candidate.id === snapshot.runId);
  const assistant = conversation.messages.find((message) => message.id === snapshot.assistantMessageId && message.role === "assistant");
  if (!run || !assistant || run.assistantMessageId !== assistant.id) return null;

  let recovered = conversation;
  const usageState = new Map<string, TokenUsage>();
  for (const { sequence, event } of [...snapshot.events].sort((left, right) => left.sequence - right.sequence)) {
    recovered = applySequencedAgentEvent(recovered, run.id, assistant.id, sequence, event, usageState, completedAt);
  }
  recovered = reconcileTerminalAssistant(recovered, run.id, assistant.id, completedAt);

  const recoveredRun = recovered.runs?.find((candidate) => candidate.id === run.id) ?? run;
  const recoveredAssistant = recovered.messages.find((message) => message.id === assistant.id) ?? assistant;
  let content = recoveredAssistant.content;
  let messageStatus = recoveredAssistant.status;
  let runStatus = recoveredRun.status;
  const sawTerminal = recoveredRun.status !== "running";
  if (!sawTerminal) {
    messageStatus = "error";
    runStatus = "stopped";
    if (!content.trim()) content = "Run stopped while Khadim was closing.";
  }

  return {
    ...recovered,
    updatedAt: completedAt,
    messages: recovered.messages.map((message) => message.id === assistant.id ? {
      ...message,
      content,
      status: messageStatus,
      toolCalls: finishRunningTools(message.toolCalls),
    } : message),
    runs: recovered.runs?.map((candidate) => candidate.id === run.id ? {
      ...candidate,
      status: runStatus,
      completedAt: candidate.completedAt ?? completedAt,
    } : candidate),
  };
}
