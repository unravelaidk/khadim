import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { WsHarness } from "../../support/ws-harness";

const connectSessionStreamMock = vi.fn();
const resolveLiveHostMock = vi.fn();
const runLiveHostInputMock = vi.fn();

vi.mock("../../../app/agent/session-stream", () => ({
  connectSessionStream: connectSessionStreamMock,
}));

vi.mock("../../../app/agent/live-session-commands", () => ({
  resolveLiveHost: resolveLiveHostMock,
  runLiveHostInput: runLiveHostInputMock,
}));

const { injectAgentWebSocket } = await import("../../../app/lib/agent-ws");

describe("agent-ws", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    injectAgentWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    baseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("responds to ping with pong", async () => {
    const harness = await WsHarness.connect<{ type: string }>(`${baseUrl}/api/agent/ws`);

    harness.send({ type: "ping" });
    await expect(harness.waitFor((message) => message.type === "pong")).resolves.toEqual({ type: "pong" });

    harness.close();
  });

  it("starts the session stream after session.connect", async () => {
    connectSessionStreamMock.mockImplementation(async ({ send }) => {
      send({ type: "session_connected", sessionId: "session-1" });
      return () => {};
    });

    const harness = await WsHarness.connect<{ type: string; sessionId?: string }>(`${baseUrl}/api/agent/ws`);

    harness.send({ type: "session.connect", sessionId: "session-1", lastEventId: "174355-0" });

    await expect(
      harness.waitFor((message) => message.type === "session_connected"),
    ).resolves.toEqual({ type: "session_connected", sessionId: "session-1" });
    expect(connectSessionStreamMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      lastEventId: "174355-0",
      send: expect.any(Function),
    });

    harness.close();
  });

  it("streams multiple session events in order", async () => {
    connectSessionStreamMock.mockImplementation(async ({ send }) => {
      send({ type: "session_connected", sessionId: "session-1" });
      send({ type: "session_snapshot", sessionId: "session-1", jobs: [], updatedAt: "now" });
      send({ type: "step_start", jobId: "job-1", chatId: "chat-1", sessionId: "session-1", id: "step-1", title: "Thinking" });
      return () => {};
    });

    const harness = await WsHarness.connect<Record<string, unknown>>(`${baseUrl}/api/agent/ws`);

    harness.send({ type: "session.connect", sessionId: "session-1" });

    await harness.waitFor((message) => message.type === "step_start");
    expect(harness.received).toEqual([
      { type: "session_connected", sessionId: "session-1" },
      { type: "session_snapshot", sessionId: "session-1", jobs: [], updatedAt: "now" },
      { type: "step_start", jobId: "job-1", chatId: "chat-1", sessionId: "session-1", id: "step-1", title: "Thinking" },
    ]);

    harness.close();
  });

  it("rejects commands sent before session.connect with a correlated command_error", async () => {
    const harness = await WsHarness.connect<Record<string, unknown>>(`${baseUrl}/api/agent/ws`);

    harness.send({ type: "job.followUp", prompt: "continue", chatId: "chat-1", requestId: "req-1" });

    await expect(
      harness.waitFor((message) => message.type === "command_error"),
    ).resolves.toEqual({
      type: "command_error",
      requestId: "req-1",
      command: "job.followUp",
      error: "session.connect required before commands",
    });

    harness.close();
  });

  it("correlates concurrent commands from different chats by requestId", async () => {
    connectSessionStreamMock.mockImplementation(async ({ send }) => {
      send({ type: "session_connected", sessionId: "session-1" });
      return () => {};
    });
    resolveLiveHostMock.mockImplementation(({ chatId }) =>
      chatId === "chat-1" ? { host: "chat-1" } : null,
    );
    runLiveHostInputMock.mockResolvedValue({ jobId: "job-1", chatId: "chat-1", sessionId: "session-1" });

    const harness = await WsHarness.connect<Record<string, unknown>>(`${baseUrl}/api/agent/ws`);
    harness.send({ type: "session.connect", sessionId: "session-1" });
    await harness.waitFor((message) => message.type === "session_connected");

    harness.send({ type: "job.followUp", prompt: "continue a", chatId: "chat-1", requestId: "req-a" });
    harness.send({ type: "job.followUp", prompt: "continue b", chatId: "chat-2", requestId: "req-b" });

    await expect(
      harness.waitFor((message) => message.type === "command_accepted"),
    ).resolves.toEqual({
      type: "command_accepted",
      requestId: "req-a",
      command: "job.followUp",
      jobId: "job-1",
      chatId: "chat-1",
      sessionId: "session-1",
    });
    await expect(
      harness.waitFor((message) => message.type === "command_error"),
    ).resolves.toEqual({
      type: "command_error",
      requestId: "req-b",
      command: "job.followUp",
      error: "No live session host found",
    });

    harness.close();
  });

  it("turns a live-host failure into command_error instead of an unhandled throw", async () => {
    connectSessionStreamMock.mockImplementation(async ({ send }) => {
      send({ type: "session_connected", sessionId: "session-1" });
      return () => {};
    });
    resolveLiveHostMock.mockReturnValue({ host: "chat-1" });
    runLiveHostInputMock.mockRejectedValue(new Error("host crashed"));

    const harness = await WsHarness.connect<Record<string, unknown>>(`${baseUrl}/api/agent/ws`);
    harness.send({ type: "session.connect", sessionId: "session-1" });
    await harness.waitFor((message) => message.type === "session_connected");

    harness.send({ type: "job.steer", prompt: "steer", chatId: "chat-1", requestId: "req-1" });

    await expect(
      harness.waitFor((message) => message.type === "command_error"),
    ).resolves.toEqual({
      type: "command_error",
      requestId: "req-1",
      command: "job.steer",
      error: "host crashed",
    });

    harness.close();
  });
});
