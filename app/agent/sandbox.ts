import { Sandbox } from "@deno/sandbox";
import { getJobByChatId } from "../lib/job-manager";

const SANDBOX_GRACE_MS = 5 * 60 * 1000;

type SandboxProvider = {
  create: (options: { lifetime: string }) => Promise<SandboxInstance>;
  connect: (options: { id: string }) => Promise<SandboxInstance>;
};

type SandboxInstance = {
  id: string;
  extendLifetime?: (duration: string) => Promise<void>;
  kill?: () => Promise<void>;
};

export async function ensureSandbox(
  existingSandboxId?: string | null,
  sandboxProvider: SandboxProvider = Sandbox
) {
  if (!existingSandboxId) {
    const sandbox = await sandboxProvider.create({ lifetime: "15m" });
    return { sandbox, sandboxId: sandbox.id, reconnected: false };
  }

  try {
    const sandbox = await sandboxProvider.connect({ id: existingSandboxId });
    if (sandbox.extendLifetime) {
      await sandbox.extendLifetime("5m");
    }
    return { sandbox, sandboxId: existingSandboxId, reconnected: true };
  } catch (error) {
    console.warn(`[Sandbox] Failed to reconnect to ${existingSandboxId}:`, error);
    const sandbox = await sandboxProvider.create({ lifetime: "15m" });
    return { sandbox, sandboxId: sandbox.id, reconnected: false };
  }
}

export function scheduleSandboxCleanup(
  chatId: string,
  sandboxId: string,
  options?: {
    graceMs?: number;
    getJobByChatIdFn?: typeof getJobByChatId;
    sandboxProvider?: SandboxProvider;
  }
): void {
  const graceMs = options?.graceMs ?? SANDBOX_GRACE_MS;
  const getJob = options?.getJobByChatIdFn ?? getJobByChatId;
  const sandboxProvider = options?.sandboxProvider ?? Sandbox;

  setTimeout(() => {
    void (async () => {
      try {
        const activeJob = await getJob(chatId);
        if (activeJob && activeJob.status === "running") {
          return;
        }
        const sandbox = await sandboxProvider.connect({ id: sandboxId });
        if (sandbox.kill) {
          await sandbox.kill();
        }
        console.log(`[Sandbox] Killed sandbox ${sandboxId} after grace period.`);
      } catch (error) {
        console.error(`[Sandbox] Failed to cleanup sandbox ${sandboxId}:`, error);
      }
    })();
  }, graceMs);
}
