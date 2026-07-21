import { describe, expect, it } from "vitest";
import type { AgentRunRecoverySnapshot, Conversation } from "../../../src/shared/types";
import { applyShutdownRecovery } from "../../../src/main/shutdown-recovery";

const conversation: Conversation = {
  id: "chat-1",
  projectId: "project-1",
  engineSessionKey: "electron.v1.chat-1",
  title: "Shutdown chat",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  messages: [
    { id: "user-1", role: "user", content: "Go", createdAt: "2026-07-14T00:00:00.000Z", status: "complete" },
    {
      id: "assistant-1",
      role: "assistant",
      content: "Hello",
      createdAt: "2026-07-14T00:00:00.000Z",
      status: "streaming",
      runId: "run-1",
      toolCalls: [{ id: "tool-1", tool: "shell", title: "Working", status: "running" }],
    },
  ],
  runs: [{
    id: "run-1",
    projectId: "project-1",
    conversationId: "chat-1",
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    status: "running",
    createdAt: "2026-07-14T00:00:00.000Z",
    lastEventSequence: 1,
    agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
    model: { id: "model-1", name: "Model", provider: "openai", model: "gpt-5" },
    harness: "assistant",
    enabledTools: ["files"],
  }],
};

function snapshot(events: AgentRunRecoverySnapshot["events"], terminal = true): AgentRunRecoverySnapshot {
  return {
    runId: "run-1",
    projectId: "project-1",
    conversationId: "chat-1",
    assistantMessageId: "assistant-1",
    engineSessionKey: "electron.v1.chat-1",
    events,
    terminal,
    droppedEventCount: 0,
    nextSequence: Math.max(1, ...events.map((event) => event.sequence + 1)),
  };
}

describe("shutdown recovery", () => {
  it("applies only unseen text and persists an aborted terminal state", () => {
    const recovered = applyShutdownRecovery(conversation, snapshot([
      { sequence: 1, event: { event_type: "text_delta", content: "Hello" } },
      { sequence: 2, event: { event_type: "text_delta", content: " world" } },
      { sequence: 3, event: { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } } },
    ]), "2026-07-14T00:01:00.000Z");

    expect(recovered?.messages[1]).toEqual(expect.objectContaining({ content: "Hello world", status: "error" }));
    expect(recovered?.messages[1]?.toolCalls?.[0]).toEqual(expect.objectContaining({ status: "error" }));
    expect(recovered?.runs?.[0]).toEqual(expect.objectContaining({ status: "stopped", lastEventSequence: 3 }));
  });

  it("marks a nonterminal process snapshot stopped instead of leaving it running", () => {
    const recovered = applyShutdownRecovery(conversation, snapshot([
      { sequence: 2, event: { event_type: "text_delta", content: " again" } },
    ], false), "2026-07-14T00:01:00.000Z");

    expect(recovered?.messages[1]).toEqual(expect.objectContaining({ content: "Hello again", status: "error" }));
    expect(recovered?.runs?.[0]).toEqual(expect.objectContaining({ status: "stopped", completedAt: "2026-07-14T00:01:00.000Z" }));
  });

  it("persists unseen tool activity and cumulative usage before completing the run", () => {
    const partiallyPersisted: Conversation = {
      ...conversation,
      messages: conversation.messages.map((message) => message.id === "assistant-1"
        ? { ...message, usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 1 } }
        : message),
      runs: conversation.runs?.map((run) => ({ ...run, lastEventSequence: 3 })),
    };
    const recovered = applyShutdownRecovery(partiallyPersisted, snapshot([
      { sequence: 2, event: { event_type: "llm_call_start" } },
      { sequence: 3, event: { event_type: "usage", metadata: { input: 10, output: 2, cache_read: 3, cache_write: 1 } } },
      { sequence: 4, event: { event_type: "step_start", content: "Searching", metadata: { id: "tool-2", tool: "web", title: "Search the web" } } },
      { sequence: 5, event: { event_type: "step_update", content: "query=khadim", metadata: { id: "tool-2", tool: "web" } } },
      { sequence: 6, event: { event_type: "step_complete", content: "Found it", metadata: { id: "tool-2", tool: "web", result: "One result" } } },
      { sequence: 7, event: { event_type: "usage", metadata: { input: 12, output: 5, cache_read: 4, cache_write: 1 } } },
      { sequence: 8, event: { event_type: "done" } },
    ]), "2026-07-14T00:01:00.000Z");

    expect(recovered?.messages[1]?.toolCalls).toContainEqual(expect.objectContaining({
      id: "tool-2",
      tool: "web",
      input: "query=khadim",
      result: "One result",
      status: "complete",
    }));
    expect(recovered?.messages[1]?.usage).toEqual({ input: 12, output: 5, cacheRead: 4, cacheWrite: 1 });
    expect(recovered?.messages[1]?.status).toBe("complete");
    expect(recovered?.runs?.[0]).toEqual(expect.objectContaining({ status: "complete", lastEventSequence: 8 }));
  });

  it("repairs a terminal run whose assistant status was not committed before shutdown", () => {
    const inconsistent: Conversation = {
      ...conversation,
      runs: conversation.runs?.map((run) => ({
        ...run,
        status: "complete" as const,
        completedAt: "2026-07-14T00:00:30.000Z",
        lastEventSequence: 2,
      })),
    };
    const recovered = applyShutdownRecovery(inconsistent, snapshot([
      { sequence: 2, event: { event_type: "done" } },
    ]), "2026-07-14T00:01:00.000Z");

    expect(recovered?.messages[1]?.status).toBe("complete");
    expect(recovered?.runs?.[0]?.status).toBe("complete");
  });

  it("refuses a snapshot that does not belong to the conversation", () => {
    expect(applyShutdownRecovery(conversation, { ...snapshot([]), projectId: "other" }, "now")).toBeNull();
  });
});
