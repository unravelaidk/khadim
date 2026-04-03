import { describe, expect, it } from "vitest";
import { toJobEventMessage } from "../../app/agent/session-stream";

describe("session stream event mapping", () => {
  it("preserves persisted event ids for replay cursors", () => {
    const payload = toJobEventMessage({
      type: "done",
      data: { content: "ok", previewUrl: null },
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      eventId: "123-0",
    });

    expect(payload).toEqual({
      type: "done",
      eventId: "123-0",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      content: "ok",
      previewUrl: null,
    });
  });

  it("keeps the transport payload shape consumed by the frontend", () => {
    const payload = toJobEventMessage({
      type: "step_start",
      data: { id: "step-1", title: "Write file", tool: "write" },
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
    });

    expect(payload).toEqual({
      type: "step_start",
      eventId: undefined,
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      id: "step-1",
      title: "Write file",
      tool: "write",
    });
  });
});
