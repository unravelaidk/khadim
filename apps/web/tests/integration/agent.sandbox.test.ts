import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../app/lib/job-manager", () => ({
  getJobsByChatId: vi.fn(),
}));

const sandboxModule = await import("../../app/agent/sandbox");
const { ensureSandbox, scheduleSandboxCleanup } = sandboxModule;

const createMockSandbox = (overrides: Partial<{ extendLifetime: () => Promise<void>; kill: () => Promise<void> }> = {}) => ({
  id: "sandbox-1",
  extendLifetime: overrides.extendLifetime,
  kill: overrides.kill,
});

describe("ensureSandbox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new sandbox when no id provided", async () => {
    const sandboxInstance = createMockSandbox();
    const sandboxProvider = {
      create: vi.fn().mockResolvedValue(sandboxInstance),
      connect: vi.fn(),
    };

    const result = await ensureSandbox(null, sandboxProvider as any);

    expect(sandboxProvider.create).toHaveBeenCalledOnce();
    expect(result.sandboxId).toBe("sandbox-1");
    expect(result.reconnected).toBe(false);
  });

  it("reconnects when an existing sandbox is available", async () => {
    const sandboxInstance = createMockSandbox();
    const sandboxProvider = {
      create: vi.fn(),
      connect: vi.fn().mockResolvedValue(sandboxInstance),
    };

    const result = await ensureSandbox("existing-id", sandboxProvider as any);

    expect(sandboxProvider.connect).toHaveBeenCalledWith({ id: "existing-id" });
    expect(result.reconnected).toBe(true);
  });

  it("creates new sandbox when reconnect fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sandboxInstance = createMockSandbox();
    const sandboxProvider = {
      create: vi.fn().mockResolvedValue(sandboxInstance),
      connect: vi.fn().mockRejectedValue(new Error("nope")),
    };

    const result = await ensureSandbox("existing-id", sandboxProvider as any);

    expect(sandboxProvider.connect).toHaveBeenCalled();
    expect(sandboxProvider.create).toHaveBeenCalledOnce();
    expect(result.reconnected).toBe(false);
    warnSpy.mockRestore();
  });
});

describe("scheduleSandboxCleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("kills sandbox after grace period when no running job", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const kill = vi.fn().mockResolvedValue(undefined);
    const sandboxProvider = {
      connect: vi.fn().mockResolvedValue(createMockSandbox({ kill })),
    };
    const getJobs = vi.fn().mockResolvedValue([]);

    scheduleSandboxCleanup("chat-1", "sandbox-1", { graceMs: 10, getJobsByChatIdFn: getJobs, sandboxProvider: sandboxProvider as any });

    await vi.runAllTimersAsync();

    expect(getJobs).toHaveBeenCalledWith("chat-1");
    expect(sandboxProvider.connect).toHaveBeenCalledWith({ id: "sandbox-1" });
    expect(kill).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it("does not kill sandbox if job still running", async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    const sandboxProvider = {
      connect: vi.fn().mockResolvedValue(createMockSandbox({ kill })),
    };
    const getJobs = vi.fn().mockResolvedValue([{ status: "running" }]);

    scheduleSandboxCleanup("chat-1", "sandbox-1", { graceMs: 10, getJobsByChatIdFn: getJobs, sandboxProvider: sandboxProvider as any });

    await vi.runAllTimersAsync();

    expect(kill).not.toHaveBeenCalled();
  });
});
