import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const subscribeMock = vi.fn();
const createJobMock = vi.fn();
const getJobMock = vi.fn();
const getJobByChatIdMock = vi.fn();
const runAgentJobMock = vi.fn().mockResolvedValue(undefined);

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
  getJobByChatId: getJobByChatIdMock,
  failJob: vi.fn(),
  subscribe: subscribeMock,
}));

vi.mock("../../app/lib/job-cancel", () => ({
  registerJobAbortController: vi.fn(),
  unregisterJobAbortController: vi.fn(),
}));

vi.mock("../../app/agent/job-runner", () => ({
  runAgentJob: runAgentJobMock,
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

describe("api.agent streams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAgentJobMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("action survives duplicate close when an error event arrives after abort", async () => {
    const subscribers: Array<(event: any) => void> = [];
    subscribeMock.mockImplementation((_jobId: string, cb: (event: any) => void) => {
      subscribers.push(cb);
      return () => {};
    });

    createJobMock.mockResolvedValue({ id: "job-123", chatId: "default" });

    const formData = new FormData();
    formData.append("prompt", "Hello");

    const abortController = new AbortController();
    await action({
      request: new Request("http://local/api/agent", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      }),
    } as any);

    await new Promise((resolve) => setTimeout(resolve, 0));

    abortController.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subscribers[0]).toBeDefined();
    expect(() => subscribers[0]!({ type: "error", data: { message: "boom" } })).not.toThrow();
  });

  it("loader survives duplicate close when an error event arrives after abort", async () => {
    const subscribers: Array<(event: any) => void> = [];
    subscribeMock.mockImplementation((_jobId: string, cb: (event: any) => void) => {
      subscribers.push(cb);
      return () => {};
    });

    const now = new Date().toISOString();
    getJobMock.mockResolvedValue({
      id: "job-123",
      chatId: "default",
      status: "running",
      steps: [],
      finalContent: "",
      previewUrl: null,
      sandboxId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });

    const abortController = new AbortController();
    await loader({
      request: new Request("http://local/api/agent?jobId=job-123", {
        method: "GET",
        signal: abortController.signal,
      }),
    } as any);

    await new Promise((resolve) => setTimeout(resolve, 0));

    abortController.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subscribers[0]).toBeDefined();
    expect(() => subscribers[0]!({ type: "error", data: { message: "boom" } })).not.toThrow();
  });

  it("scopes loader lookups by session id", async () => {
    getJobByChatIdMock.mockResolvedValue(null);

    await loader({
      request: new Request("http://local/api/agent?chatId=chat-1&sessionId=session-1", {
        method: "GET",
      }),
    } as any);

    expect(getJobByChatIdMock).toHaveBeenCalledWith("chat-1", "session-1");
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

  it("keeps the job running after the client stream disconnects", async () => {
    let capturedSignal: AbortSignal | undefined;
    runAgentJobMock.mockImplementation(async (options: { abortSignal?: AbortSignal }) => {
      capturedSignal = options.abortSignal;
    });

    createJobMock.mockResolvedValue({ id: "job-123", chatId: "default", sessionId: "default" });

    const formData = new FormData();
    formData.append("prompt", "Hello");

    const abortController = new AbortController();
    await action({
      request: new Request("http://local/api/agent", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      }),
    } as any);

    await new Promise((resolve) => setTimeout(resolve, 0));
    abortController.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);
  });
});
