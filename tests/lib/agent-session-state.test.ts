import { describe, expect, it } from "vitest";
import type { Message } from "../../app/types/chat";
import {
  appendMessages,
  applyStreamEvent,
  bindJobToMessage,
  createEmptyAgentSessionState,
  getChatStateKey,
  registerPendingAssistantMessage,
  selectSlideRuntime,
  selectChatRuntime,
} from "../../app/components/agent-builder/hooks/agent-session-state";

function assistantMessage(id: string): Message {
  return {
    id,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    thinkingSteps: [],
  };
}

describe("agent-session-state", () => {
  it("attaches early tool events to the pending assistant message", () => {
    const chatKey = getChatStateKey("chat-1");
    let state = createEmptyAgentSessionState();
    state = registerPendingAssistantMessage(state, chatKey, "assistant-1");
    state = appendMessages(state, chatKey, [assistantMessage("assistant-1")]);

    state = applyStreamEvent(state, {
      type: "step_start",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      id: "step-1",
      title: "Reasoning",
    });

    const runtime = selectChatRuntime(state, "chat-1");
    expect(runtime.messages).toHaveLength(1);
    expect(runtime.messages[0]?.id).toBe("assistant-1");
    expect(runtime.messages[0]?.thinkingSteps?.[0]).toMatchObject({
      id: "step-1",
      title: "Reasoning",
      status: "running",
    });
  });

  it("reconciles fallback job messages onto the visible assistant message", () => {
    const chatKey = getChatStateKey("chat-1");
    let state = createEmptyAgentSessionState();
    state = appendMessages(state, chatKey, [assistantMessage("assistant-1")]);

    state = applyStreamEvent(state, {
      type: "slide_content",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      fileContent: '<script id="slide-data">[]</script>',
    });

    state = bindJobToMessage(state, "job-1", "chat-1", "assistant-1");

    const runtime = selectChatRuntime(state, "chat-1");
    expect(runtime.messages).toHaveLength(1);
    expect(runtime.messages[0]?.id).toBe("assistant-1");
    expect(runtime.messages[0]?.fileContent).toContain('slide-data');
  });

  it("restores slide content from job snapshots", () => {
    let state = createEmptyAgentSessionState();

    state = applyStreamEvent(state, {
      type: "job_snapshot",
      id: "job-1",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      status: "running",
      steps: [],
      finalContent: "",
      previewUrl: null,
      fileContent: '<script id="slide-data">[]</script>',
      sandboxId: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const runtime = selectChatRuntime(state, "chat-1");
    expect(runtime.messages[0]?.fileContent).toContain('slide-data');
  });

  it("ignores duplicate or stale replay events by event id", () => {
    let state = createEmptyAgentSessionState();

    state = applyStreamEvent(state, {
      type: "text_delta",
      eventId: "10-0",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      content: "Hello",
    });

    state = applyStreamEvent(state, {
      type: "text_delta",
      eventId: "10-0",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      content: "Hello",
    });

    const runtime = selectChatRuntime(state, "chat-1");
    expect(runtime.messages[0]?.content).toBe("Hello");
  });

  it("derives slide runtime from normalized session state", () => {
    let state = createEmptyAgentSessionState();
    state = applyStreamEvent(state, {
      type: "job_snapshot",
      id: "job-1",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      status: "running",
      steps: [{ id: "step-1", title: "Write slides", status: "running", tool: "write_slides", content: "" }],
      finalContent: "",
      previewUrl: null,
      fileContent: '<script id="slide-data">[]</script>',
      sandboxId: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(selectSlideRuntime(state, "chat-1", true)).toEqual({
      content: '<script id="slide-data">[]</script>',
      isStreaming: true,
      isBuilding: true,
    });
  });

  it("keeps slide content renderable when slide events arrive out of sequence", () => {
    const chatKey = getChatStateKey("chat-1");
    let state = createEmptyAgentSessionState();
    state = registerPendingAssistantMessage(state, chatKey, "assistant-1");
    state = appendMessages(state, chatKey, [assistantMessage("assistant-1")]);

    state = applyStreamEvent(state, {
      type: "file_written",
      eventId: "100-1",
      sequence: 101,
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      filename: "index.html",
      content: '<script id="slide-data">[{"id":1,"type":"title","title":"Deck"}]</script>',
      isSlide: true,
    });

    state = applyStreamEvent(state, {
      type: "slide_content",
      eventId: "100-0",
      sequence: 100,
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      fileContent: '<script id="slide-data">[{"id":1,"type":"title","title":"Deck"}]</script>',
    });

    expect(selectSlideRuntime(state, "chat-1", true)).toEqual({
      content: '<script id="slide-data">[{"id":1,"type":"title","title":"Deck"}]</script>',
      isStreaming: false,
      isBuilding: true,
    });
  });

  it("keeps late slide artifacts renderable even after an error event", () => {
    const chatKey = getChatStateKey("chat-1");
    let state = createEmptyAgentSessionState();
    state = registerPendingAssistantMessage(state, chatKey, "assistant-1");
    state = appendMessages(state, chatKey, [assistantMessage("assistant-1")]);

    state = applyStreamEvent(state, {
      type: "error",
      eventId: "200-0",
      sequence: 200,
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      message: "Slide generation stalled before write_slides ran.",
    });

    state = applyStreamEvent(state, {
      type: "file_written",
      eventId: "201-0",
      sequence: 201,
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      filename: "index.html",
      content: '<script id="slide-data">[{"id":1,"type":"title","title":"Deck"}]</script>',
      isSlide: true,
    });

    expect(selectSlideRuntime(state, "chat-1", false)).toEqual({
      content: '<script id="slide-data">[{"id":1,"type":"title","title":"Deck"}]</script>',
      isStreaming: false,
      isBuilding: false,
    });
  });
});
