import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signalProcessTree, terminateProcessTree, type TerminationSignal, waitForSettlement } from "../../../src/main/process-lifecycle";

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, { pid: 42, exitCode: null, signalCode: null, kill: vi.fn(() => true) });
  return child;
}

function fakeCommand(): ChildProcess {
  return new EventEmitter() as ChildProcess;
}

afterEach(() => { vi.useRealTimers(); });

describe("process tree signaling", () => {
  it("uses taskkill tree mode for graceful Windows termination", async () => {
    const child = fakeChild();
    const killer = fakeCommand();
    const spawnCommand = vi.fn(() => killer);

    const signaling = signalProcessTree(child, "SIGTERM", "win32", { spawnCommand });

    expect(spawnCommand).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "42", "/T"],
      { windowsHide: true, stdio: "ignore" },
    );
    expect(child.kill).not.toHaveBeenCalled();
    killer.emit("close", 0);
    await signaling;
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("adds force mode for Windows kill termination", async () => {
    const child = fakeChild();
    const killer = fakeCommand();
    const spawnCommand = vi.fn(() => killer);

    const signaling = signalProcessTree(child, "SIGKILL", "win32", { spawnCommand });

    expect(spawnCommand).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "42", "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    killer.emit("close", 0);
    await signaling;
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("immediately retries a failed graceful Windows tree kill in force mode", async () => {
    const child = fakeChild();
    const gracefulKiller = fakeCommand();
    const forcedKiller = fakeCommand();
    const spawnCommand = vi
      .fn()
      .mockReturnValueOnce(gracefulKiller)
      .mockReturnValueOnce(forcedKiller);

    const signaling = signalProcessTree(child, "SIGTERM", "win32", { spawnCommand });
    gracefulKiller.emit("close", 1);
    await Promise.resolve();

    expect(spawnCommand).toHaveBeenNthCalledWith(
      2,
      "taskkill",
      ["/pid", "42", "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    forcedKiller.emit("close", 0);

    await expect(signaling).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("surfaces failure when both Windows tree-kill attempts fail", async () => {
    const child = fakeChild();
    const gracefulKiller = fakeCommand();
    const forcedKiller = fakeCommand();
    const spawnCommand = vi
      .fn()
      .mockReturnValueOnce(gracefulKiller)
      .mockReturnValueOnce(forcedKiller);

    const signaling = signalProcessTree(child, "SIGTERM", "win32", { spawnCommand });
    const assertion = expect(signaling).rejects.toThrow("forced tree cleanup failed");
    gracefulKiller.emit("error", new Error("graceful taskkill unavailable"));
    await Promise.resolve();
    forcedKiller.emit("close", 128);

    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("keeps waiting for Windows tree cleanup after the leader closes", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const killer = fakeCommand();
    const spawnCommand = vi.fn(() => killer);
    let closeLeader!: () => void;
    const leaderClosed = new Promise<void>((resolve) => { closeLeader = resolve; });
    let settled = false;
    const termination = terminateProcessTree(child, leaderClosed, {
      platform: "win32",
      signal: (target, signal, platform) => signalProcessTree(target, signal, platform, { spawnCommand }),
    }).then(() => { settled = true; });

    closeLeader();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    killer.emit("close", 0);
    await termination;
    expect(settled).toBe(true);
  });

  it("signals the POSIX process group and falls back to the leader", () => {
    const child = fakeChild();
    const killProcessGroup = vi.fn();

    signalProcessTree(child, "SIGTERM", "linux", { killProcessGroup });
    expect(killProcessGroup).toHaveBeenCalledWith(-42, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();

    killProcessGroup.mockImplementationOnce(() => { throw new Error("missing group"); });
    signalProcessTree(child, "SIGKILL", "darwin", { killProcessGroup });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("process lifecycle", () => {
  it("signals TERM immediately and waits for close-side terminal processing", async () => {
    const child = fakeChild();
    const signals: TerminationSignal[] = [];
    let finishClose!: () => void;
    const closed = new Promise<void>((resolve) => { finishClose = resolve; });
    let settled = false;
    const termination = terminateProcessTree(child, closed, {
      signal: (_child, signal) => { signals.push(signal); },
    }).then(() => { settled = true; });

    expect(signals).toEqual(["SIGTERM"]);
    await Promise.resolve();
    expect(settled).toBe(false);
    finishClose();
    await termination;
    expect(settled).toBe(true);
  });

  it("escalates to KILL after the grace period", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const signals: TerminationSignal[] = [];
    let finishClose!: () => void;
    const closed = new Promise<void>((resolve) => { finishClose = resolve; });
    const termination = terminateProcessTree(child, closed, {
      signal: (_child, signal) => { signals.push(signal); },
    });

    await vi.advanceTimersByTimeAsync(1_500);
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    finishClose();
    await termination;
  });

  it("rejects at a bounded deadline when a child never closes", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const termination = terminateProcessTree(child, new Promise<void>(() => undefined), {
      graceMs: 10,
      deadlineMs: 20,
      signal: () => undefined,
    });
    const assertion = expect(termination).rejects.toThrow("shutdown deadline");
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });

  it("still escalates and bounds close when the leader exited before its descendants", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    Object.assign(child, { exitCode: 0 });
    const signals: TerminationSignal[] = [];
    const termination = terminateProcessTree(child, new Promise<void>(() => undefined), {
      graceMs: 10,
      deadlineMs: 20,
      signal: (_child, signal) => { signals.push(signal); },
    });
    const assertion = expect(termination).rejects.toThrow("shutdown deadline");

    await vi.advanceTimersByTimeAsync(20);
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    await assertion;
  });

  it("observes a rejected tree signal before close-side processing finishes", async () => {
    const child = fakeChild();
    const closed = new Promise<void>(() => undefined);
    const signalFailure = Promise.reject(new Error("forced tree cleanup failed"));
    const termination = terminateProcessTree(child, closed, {
      signal: () => signalFailure,
    });
    const assertion = expect(termination).rejects.toThrow("forced tree cleanup failed");

    await assertion;
  });

  it("bounds a persistence queue that never settles", async () => {
    vi.useFakeTimers();
    const settled = waitForSettlement(new Promise<void>(() => undefined), 25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(settled).resolves.toBe(false);
    await expect(waitForSettlement(Promise.resolve(), 25)).resolves.toBe(true);
  });
});
