import { beforeEach, describe, expect, it, vi } from "vitest";

const handleAgentRpcMock = vi.fn();

vi.mock("../../app/lib/agent-rpc", () => ({
  handleAgentRpc: handleAgentRpcMock,
}));

const { agentRpcApp } = await import("../../app/lib/agent-rpc-hono");

describe("agent-rpc-hono", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rpc success payloads for job.start", async () => {
    handleAgentRpcMock.mockResolvedValue({ ok: true, result: { jobId: "job-1" } });

    const response = await agentRpcApp.request("/job/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    });

    expect(handleAgentRpcMock).toHaveBeenCalledWith({ method: "job.start", params: { prompt: "Hello" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, result: { jobId: "job-1" } });
  });

  it("maps rpc failures to the returned status", async () => {
    handleAgentRpcMock.mockResolvedValue({ ok: false, error: "jobId is required", status: 400 });

    const response = await agentRpcApp.request("/job/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "jobId is required", status: 400 });
  });

  it("forwards job.get params from path and query", async () => {
    handleAgentRpcMock.mockResolvedValue({ ok: true, result: { job: { id: "job-1" } } });

    const response = await agentRpcApp.request("/job/job-1?chatId=chat-1&sessionId=session-1");

    expect(handleAgentRpcMock).toHaveBeenCalledWith({
      method: "job.get",
      params: { jobId: "job-1", chatId: "chat-1", sessionId: "session-1" },
    });
    expect(response.status).toBe(200);
  });
});
