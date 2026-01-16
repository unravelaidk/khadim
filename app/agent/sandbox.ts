import { createCodeExecutionClient, type RemoteSandbox } from "@khadim/codeexecution-client";
import { getJobByChatId } from "../lib/job-manager";
import type { SandboxInstance } from "./tools";

const SANDBOX_GRACE_MS = 5 * 60 * 1000;
const SANDBOX_INIT_TIMEOUT_MS = Number(process.env.SANDBOX_INIT_TIMEOUT_MS ?? 20000);

function withTimeout<T>(promise: Promise<T>, action: string, timeoutMs = SANDBOX_INIT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Sandbox] ${action} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Create client singleton (configure URL via env)
const client = createCodeExecutionClient({
  url: process.env.SANDBOX_SERVER_URL || "http://localhost:4000",
  token: process.env.SANDBOX_TOKEN,
});

// Adapter type to maintain compatibility with existing code
type SandboxProvider = {
  create: (options: { lifetime: string }) => Promise<SandboxInstance>;
  connect: (options: { id: string }) => Promise<SandboxInstance>;
};

// Adapter to wrap RemoteSandbox with compatible interface
function wrapRemoteSandbox(sandbox: RemoteSandbox): SandboxInstance {
  return {
    id: sandbox.id,
    containerId: sandbox.containerId,
    writeFile: sandbox.writeFile.bind(sandbox),
    readFile: sandbox.readFile.bind(sandbox),
    exec: sandbox.exec.bind(sandbox),
    spawn: sandbox.spawn.bind(sandbox),
    exposeHttp: sandbox.exposeHttp?.bind(sandbox),
    kill: sandbox.kill.bind(sandbox),
  };
}

// Remote sandbox provider adapter
export const RemoteSandboxProvider: SandboxProvider = {
  async create(options: { lifetime: string }) {
    const sandbox = await client.sandbox.create(options);
    return wrapRemoteSandbox(sandbox);
  },
  async connect(options: { id: string }) {
    const sandbox = await client.sandbox.connect(options.id);
    return wrapRemoteSandbox(sandbox);
  },
};

// Export client for direct access when needed
export { client as sandboxClient };

export async function ensureSandbox(
  existingSandboxId?: string | null,
  sandboxProvider: SandboxProvider = RemoteSandboxProvider
) {
  if (!existingSandboxId) {
    const sandbox = await withTimeout(
      sandboxProvider.create({ lifetime: "15m" }),
      "sandbox create"
    );
    return { sandbox, sandboxId: sandbox.id, reconnected: false };
  }

  try {
    const sandbox = await withTimeout(
      sandboxProvider.connect({ id: existingSandboxId }),
      `sandbox connect (${existingSandboxId})`
    );
    // Note: Remote sandbox doesn't support extendLifetime - lifetime managed by server
    return { sandbox, sandboxId: existingSandboxId, reconnected: true };
  } catch (error) {
    console.warn(`[Sandbox] Failed to reconnect to ${existingSandboxId}:`, error);
    const sandbox = await withTimeout(
      sandboxProvider.create({ lifetime: "15m" }),
      "sandbox create"
    );
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
  const sandboxProvider = options?.sandboxProvider ?? RemoteSandboxProvider;

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
