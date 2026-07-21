import type { AgentStreamEvent, Conversation, TokenUsage, ToolCallActivity } from "./types";

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function updateToolCalls(current: ToolCallActivity[] = [], event: AgentStreamEvent): ToolCallActivity[] {
  if (!event.event_type.startsWith("step_")) return current;
  const metadata = event.metadata ?? {};
  const tool = typeof metadata.tool === "string" && metadata.tool.trim() ? metadata.tool : "tool";
  if (tool === "model") return current;
  const id = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id : `${tool}-${current.length}`;
  const existingIndex = current.findIndex((activity) => activity.id === id);
  const existing = existingIndex >= 0 ? current[existingIndex] : null;
  const title = typeof metadata.title === "string" && metadata.title.trim()
    ? metadata.title
    : event.content?.trim() || `Running ${tool}`;
  const status = event.event_type === "step_complete"
    ? metadata.is_error === true ? "error" : "complete"
    : "running";
  const next: ToolCallActivity = {
    id,
    tool,
    title,
    input: event.event_type === "step_update" ? event.content ?? existing?.input : existing?.input,
    result: event.event_type === "step_complete" ? (typeof metadata.result === "string" ? metadata.result : event.content ?? "") : existing?.result,
    metadata,
    status,
  };
  if (existingIndex < 0) return [...current, next];
  return current.map((activity, index) => index === existingIndex ? next : activity);
}

export function usageFromEvent(event: AgentStreamEvent): TokenUsage {
  const number = (key: string) => typeof event.metadata?.[key] === "number" ? event.metadata[key] as number : 0;
  return { input: number("input"), output: number("output"), cacheRead: number("cache_read"), cacheWrite: number("cache_write") };
}

export function addUsage(left: TokenUsage = EMPTY_USAGE, right: TokenUsage): TokenUsage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
  };
}

export function conversationUsage(conversation: Conversation | null): TokenUsage {
  return conversation?.messages.reduce((total, message) => addUsage(total, message.usage ?? EMPTY_USAGE), EMPTY_USAGE) ?? EMPTY_USAGE;
}

/**
 * Repair the durable cross-record invariant after a terminal event was saved
 * only partially. This can happen when the run record reaches disk before its
 * assistant message and the replayed terminal sequence is therefore a
 * duplicate. Returning a new conversation makes callers persist before ACK.
 */
export function reconcileTerminalAssistant(
  conversation: Conversation,
  runId: string,
  assistantMessageId: string,
  eventAt = new Date().toISOString(),
): Conversation {
  const run = conversation.runs?.find((candidate) => candidate.id === runId);
  if (!run || run.status === "running") return conversation;
  const assistantIndex = conversation.messages.findIndex((message) => (
    message.id === assistantMessageId && message.role === "assistant" && message.status === "streaming"
  ));
  if (assistantIndex < 0) return conversation;
  const messages = [...conversation.messages];
  const assistant = messages[assistantIndex];
  const complete = run.status === "complete";
  messages[assistantIndex] = {
    ...assistant,
    status: complete ? "complete" : "error",
    content: assistant.content || (complete ? "" : "The run ended before its final message could be saved."),
  };
  return { ...conversation, messages, updatedAt: eventAt };
}

function applyAgentEvent(
  conversation: Conversation,
  assistantMessageId: string,
  event: AgentStreamEvent,
  usageDelta: TokenUsage | null,
  eventAt: string,
): Conversation {
  const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId && message.role === "assistant");
  if (assistantIndex < 0) return conversation;
  const messages = [...conversation.messages];
  const assistant = messages[assistantIndex];
  if (event.event_type.startsWith("step_")) {
    messages[assistantIndex] = { ...assistant, toolCalls: updateToolCalls(assistant.toolCalls, event) };
  } else if (usageDelta) {
    messages[assistantIndex] = { ...assistant, usage: addUsage(assistant.usage, usageDelta) };
  } else if (event.event_type === "text_delta" && event.content) {
    messages[assistantIndex] = { ...assistant, content: assistant.content + event.content };
  } else if (event.event_type === "done") {
    messages[assistantIndex] = { ...assistant, status: "complete" };
  } else if (event.event_type === "error") {
    messages[assistantIndex] = {
      ...assistant,
      content: assistant.content || event.content || "Something went wrong while running Khadim.",
      status: "error",
    };
  } else {
    return conversation;
  }
  return { ...conversation, messages, updatedAt: eventAt };
}

/**
 * Applies one ordered engine event to its durable conversation snapshot.
 * Usage events contain cumulative snapshots for the current LLM call, so the
 * supplied state tracks the last snapshot and only adds its positive delta.
 */
export function applySequencedAgentEvent(
  conversation: Conversation,
  runId: string,
  assistantMessageId: string,
  sequence: number,
  event: AgentStreamEvent,
  usageState: Map<string, TokenUsage>,
  eventAt = new Date().toISOString(),
): Conversation {
  const run = conversation.runs?.find((candidate) => candidate.id === runId);
  if (!run) return conversation;
  if (event.event_type === "llm_call_start") usageState.set(runId, EMPTY_USAGE);
  const usageDelta = event.event_type === "usage" ? (() => {
    const snapshot = usageFromEvent(event);
    const previous = usageState.get(runId) ?? EMPTY_USAGE;
    usageState.set(runId, snapshot);
    return {
      input: Math.max(0, snapshot.input - previous.input),
      output: Math.max(0, snapshot.output - previous.output),
      cacheRead: Math.max(0, snapshot.cacheRead - previous.cacheRead),
      cacheWrite: Math.max(0, snapshot.cacheWrite - previous.cacheWrite),
    };
  })() : null;
  // Replayed usage snapshots still advance the per-call baseline even when the
  // conversation already contains that sequence. This prevents a later live
  // snapshot from counting the same tokens twice.
  if (sequence <= (run.lastEventSequence ?? 0)) return conversation;
  const updated = applyAgentEvent(conversation, assistantMessageId, event, usageDelta, eventAt);
  const terminal = event.event_type === "done" || event.event_type === "error";
  const stopped = event.event_type === "error" && event.metadata?.reason === "aborted";
  return {
    ...updated,
    runs: updated.runs?.map((candidate) => candidate.id === runId ? {
      ...candidate,
      lastEventSequence: sequence,
      ...(terminal ? {
        status: event.event_type === "done" ? "complete" as const : stopped ? "stopped" as const : "error" as const,
        completedAt: eventAt,
      } : {}),
    } : candidate),
  };
}
