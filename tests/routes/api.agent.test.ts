import { describe, it, expect, vi, beforeEach } from "vitest";

const createJobMock = vi.fn();
const getJobMock = vi.fn();
const getJobsByChatIdMock = vi.fn();
const startJobMock = vi.fn();

vi.mock("../../app/agent/skills", () => ({
  loadSkills: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../app/agent/agents", () => ({
  getAgentConfig: vi.fn().mockReturnValue({ name: "Test Agent", systemPromptAddition: "" }),
}));

vi.mock("../../app/agent/router", () => ({
  selectAgent: vi.fn().mockReturnValue("chat"),
}));

vi.mock("../../app/lib/job-manager", () => ({
  createJob: createJobMock,
  getJob: getJobMock,
  getJobsByChatId: getJobsByChatIdMock,
}));

vi.mock("../../app/agent/stream-utils", () => ({
  startJob: startJobMock,
}));

vi.mock("../../app/lib/badges", () => ({
  decoratePromptWithBadges: vi.fn().mockReturnValue({
    prompt: "Hello",
    hasPremadeBadge: false,
    hasCategoryBadge: false,
  }),
}));

vi.mock("../../app/lib/chat-history", () => ({
  loadChatHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: () => "job-123",
}));

const { action, loader } = await import("../../app/routes/api.agent");

describe("api.agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active jobs scoped by session id", async () => {
    getJobsByChatIdMock.mockResolvedValue([]);

    await loader({
      request: new Request("http://local/api/agent?chatId=chat-1&sessionId=session-1", {
        method: "GET",
      }),
    } as any);

    expect(getJobsByChatIdMock).toHaveBeenCalledWith("chat-1", "session-1");
  });

  it("returns a specific job by id", async () => {
    getJobMock.mockResolvedValue({ id: "job-123", chatId: "chat-1", sessionId: "session-1" });

    const response = await loader({
      request: new Request("http://local/api/agent?jobId=job-123&sessionId=session-1", {
        method: "GET",
      }),
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: { id: "job-123", chatId: "chat-1", sessionId: "session-1" },
    });
  });

  it("creates jobs with the provided session id", async () => {
    createJobMock.mockResolvedValue({ id: "job-123", chatId: "chat-1", sessionId: "session-1" });

    const formData = new FormData();
    formData.append("prompt", "Hello");
    formData.append("chatId", "chat-1");
    formData.append("sessionId", "session-1");

    await action({
      request: new Request("http://local/api/agent", {
        method: "POST",
        body: formData,
      }),
    } as any);

    expect(createJobMock).toHaveBeenCalledWith("job-123", "chat-1", "session-1");
  });

  it("starts background jobs with explicit metadata", async () => {
    createJobMock.mockResolvedValue({ id: "job-123", chatId: "chat-1", sessionId: "session-1" });

    const formData = new FormData();
    formData.append("prompt", "Hello");
    formData.append("chatId", "chat-1");
    formData.append("sessionId", "session-1");

    await action({
      request: new Request("http://local/api/agent", {
        method: "POST",
        body: formData,
      }),
    } as any);

    expect(startJobMock).toHaveBeenCalledWith(
      "job-123",
      expect.objectContaining({
        jobId: "job-123",
        chatId: "chat-1",
        sessionId: "session-1",
      })
    );
  });

  it("returns json metadata for new jobs", async () => {
    createJobMock.mockResolvedValue({ id: "job-123", chatId: "chat-1", sessionId: "session-1" });

    const formData = new FormData();
    formData.append("prompt", "Hello");
    formData.append("chatId", "chat-1");
    formData.append("sessionId", "session-1");

    const response = await action({
      request: new Request("http://local/api/agent", {
        method: "POST",
        body: formData,
      }),
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        jobId: "job-123",
        chatId: "chat-1",
        sessionId: "session-1",
      })
    );
  });
});
