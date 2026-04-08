import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionEventsSinceMock = vi.fn();
const getSessionSnapshotMock = vi.fn();
const subscribeToSessionMock = vi.fn();

vi.mock("../../app/lib/job-manager", () => ({
  getSessionEventsSince: getSessionEventsSinceMock,
  getSessionSnapshot: getSessionSnapshotMock,
  subscribeToSession: subscribeToSessionMock,
}));

const { connectSessionStream } = await import("../../app/agent/session-stream");

describe("connectSessionStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionEventsSinceMock.mockResolvedValue([]);
    getSessionSnapshotMock.mockResolvedValue({
      sessionId: "session-1",
      snapshotEventId: "174355-0",
      jobs: [],
      updatedAt: new Date().toISOString(),
    });
    subscribeToSessionMock.mockResolvedValue(() => {});
  });

  it("replays missed events after session_connected", async () => {
    getSessionEventsSinceMock.mockResolvedValue([
      {
        type: "text_delta",
        data: { content: "hello" },
        jobId: "job-1",
        chatId: "chat-1",
        sessionId: "session-1",
        eventId: "174356-0",
      },
    ]);

    const sent: Array<Record<string, unknown>> = [];

    await connectSessionStream({
      sessionId: "session-1",
      lastEventId: "174355-0",
      send: (event) => sent.push(event),
    });

    expect(getSessionEventsSinceMock).toHaveBeenCalledWith("session-1", "174355-0");
    expect(getSessionSnapshotMock).not.toHaveBeenCalled();
    expect(subscribeToSessionMock).toHaveBeenCalledWith("session-1", "174356-0", expect.any(Function));
    expect(sent).toEqual([
      { type: "session_connected", sessionId: "session-1" },
      {
        type: "text_delta",
        eventId: "174356-0",
        jobId: "job-1",
        chatId: "chat-1",
        sessionId: "session-1",
        content: "hello",
      },
    ]);
  });

  it("falls back to a snapshot when replay returns nothing", async () => {
    const sent: Array<Record<string, unknown>> = [];

    await connectSessionStream({
      sessionId: "session-1",
      lastEventId: "174355-0",
      send: (event) => sent.push(event),
    });

    expect(getSessionSnapshotMock).toHaveBeenCalledWith("session-1");
    expect(subscribeToSessionMock).toHaveBeenCalledWith("session-1", "174355-0", expect.any(Function));
    expect(sent).toEqual([
      { type: "session_connected", sessionId: "session-1" },
      expect.objectContaining({
        type: "session_snapshot",
        sessionId: "session-1",
        snapshotEventId: "174355-0",
      }),
    ]);
  });

  it("subscribes to live events after replay and cleans up", async () => {
    let onSessionEvent: ((event: Record<string, unknown>) => void) | null = null;
    const unsubscribe = vi.fn();
    subscribeToSessionMock.mockImplementation(async (_sessionId, _lastEventId, callback) => {
      onSessionEvent = callback;
      return unsubscribe;
    });

    const sent: Array<Record<string, unknown>> = [];
    const cleanup = await connectSessionStream({
      sessionId: "session-1",
      send: (event) => sent.push(event),
    });

    const liveEventHandler = onSessionEvent as ((event: Record<string, unknown>) => void) | null;
    expect(liveEventHandler).toBeTypeOf("function");
    liveEventHandler?.({
      type: "done",
      data: { content: "finished", previewUrl: null },
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      eventId: "174357-0",
    });

    cleanup();

    expect(sent.at(-1)).toEqual({
      type: "done",
      eventId: "174357-0",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
      content: "finished",
      previewUrl: null,
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
