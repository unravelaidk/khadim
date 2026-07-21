import { spawn, type ChildProcess } from "node:child_process";

export type TerminationSignal = "SIGTERM" | "SIGKILL";

type ProcessTreeCommand = Pick<ChildProcess, "once">;

export interface SignalProcessTreeOptions {
  spawnCommand?: (
    command: string,
    args: string[],
    options: { windowsHide: true; stdio: "ignore" },
  ) => ProcessTreeCommand;
  killProcessGroup?: (pid: number, signal: TerminationSignal) => void;
}

function runWindowsTaskkill(
  pid: number,
  force: boolean,
  spawnCommand: NonNullable<SignalProcessTreeOptions["spawnCommand"]>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["/pid", String(pid), "/T"];
    if (force) args.push("/F");

    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    let killer: ProcessTreeCommand;
    try {
      killer = spawnCommand("taskkill", args, { windowsHide: true, stdio: "ignore" });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    killer.once("error", (error) => finish(
      error instanceof Error ? error : new Error(String(error)),
    ));
    killer.once("close", (code) => finish(
      code === 0 ? undefined : new Error(`taskkill exited with status ${String(code)}`),
    ));
  });
}

async function signalWindowsProcessTree(
  child: ChildProcess,
  signal: TerminationSignal,
  spawnCommand: NonNullable<SignalProcessTreeOptions["spawnCommand"]>,
): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  try {
    await runWindowsTaskkill(pid, signal === "SIGKILL", spawnCommand);
    return;
  } catch (initialError) {
    if (signal === "SIGTERM") {
      try {
        await runWindowsTaskkill(pid, true, spawnCommand);
        return;
      } catch (forcedError) {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill("SIGKILL"); } catch { /* best-effort leader fallback */ }
        }
        throw new Error(
          `Windows forced tree cleanup failed after graceful taskkill failed: ${String(forcedError)}`,
          { cause: initialError },
        );
      }
    }

    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGKILL"); } catch { /* best-effort leader fallback */ }
    }
    throw new Error(`Windows forced tree cleanup failed: ${String(initialError)}`);
  }
}

type SignalOutcome = { ok: true } | { ok: false; error: unknown };

function observeSignal(invoke: () => void | Promise<void>): Promise<SignalOutcome> {
  try {
    return Promise.resolve(invoke()).then(
      () => ({ ok: true }),
      (error: unknown) => ({ ok: false, error }),
    );
  } catch (error) {
    return Promise.resolve({ ok: false, error });
  }
}

/** Signal the CLI and, where the platform permits it, every process it owns. */
export function signalProcessTree(
  child: ChildProcess,
  signal: TerminationSignal,
  platform: NodeJS.Platform = process.platform,
  {
    spawnCommand = spawn,
    killProcessGroup = process.kill,
  }: SignalProcessTreeOptions = {},
): void | Promise<void> {
  if (!child.pid) return;
  if (platform === "win32") {
    return signalWindowsProcessTree(child, signal, spawnCommand);
  }

  try {
    // Khadim sidecars are spawned as their own process group on POSIX.
    killProcessGroup(-child.pid, signal);
  } catch {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

export interface TerminateProcessOptions {
  graceMs?: number;
  deadlineMs?: number;
  platform?: NodeJS.Platform;
  signal?: (child: ChildProcess, signal: TerminationSignal, platform: NodeJS.Platform) => void | Promise<void>;
}

/**
 * Wait for the caller-owned close promise, escalating once and bounding the
 * wait. The close promise is deliberately supplied by main so it resolves only
 * after the terminal event has been buffered.
 */
export async function terminateProcessTree(
  child: ChildProcess,
  closed: Promise<void>,
  {
    graceMs = 1_500,
    deadlineMs = 7_000,
    platform = process.platform,
    signal = signalProcessTree,
  }: TerminateProcessOptions = {},
): Promise<void> {
  let rejectSignalFailure!: (error: unknown) => void;
  const signalFailure = new Promise<never>((_resolve, reject) => {
    rejectSignalFailure = reject;
  });
  const observeLifecycleSignal = (invoke: () => void | Promise<void>): Promise<SignalOutcome> => {
    const outcome = observeSignal(invoke);
    void outcome.then((result) => {
      if (!result.ok) rejectSignalFailure(result.error);
    });
    return outcome;
  };
  // Attach both fulfillment and rejection handlers synchronously. A Windows
  // taskkill failure may arrive before the leader's close-side persistence,
  // and must not become an unhandled rejection while `closed` is pending.
  const gracefulSignal = observeLifecycleSignal(() => signal(child, "SIGTERM", platform));
  let forceStarted = false;
  let forceSignal: Promise<SignalOutcome> = Promise.resolve({ ok: true });
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await closed;
        const gracefulOutcome = await gracefulSignal;
        if (!gracefulOutcome.ok) throw gracefulOutcome.error;
        if (forceStarted) {
          const forceOutcome = await forceSignal;
          if (!forceOutcome.ok) throw forceOutcome.error;
        }
      })(),
      signalFailure,
      new Promise<never>((_resolve, reject) => {
        forceTimer = setTimeout(() => {
          forceStarted = true;
          forceSignal = observeLifecycleSignal(() => signal(child, "SIGKILL", platform));
        }, graceMs);
        deadlineTimer = setTimeout(() => reject(new Error(
          "Khadim could not stop the running process before the shutdown deadline.",
        )), deadlineMs);
      }),
    ]);
  } finally {
    if (forceTimer) clearTimeout(forceTimer);
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

/** Await persistence or teardown without making application quit unbounded. */
export async function waitForSettlement(task: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task.then(() => true, () => true),
      new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
