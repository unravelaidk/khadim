import { createCodeExecutionClient, type RemoteSandbox } from "@khadim/codeexecution-client";
import { getJobsByChatId } from "../lib/job-manager";
import { loadEnv } from "../lib/load-env";
import { createFirecrackerSandboxProvider } from "./firecracker";
import type { SandboxBackend, SandboxProvider } from "./sandbox-types";
import type { SandboxInstance } from "./sandbox-types";

loadEnv();

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

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveSandboxBackend(value = process.env.SANDBOX_PROVIDER): SandboxBackend {
  if (value === "firecracker" || value === "vm") {
    return "firecracker";
  }
  return "remote";
}

function getFirecrackerSandboxProvider(): SandboxProvider {
  return createFirecrackerSandboxProvider({
    baseUrl: process.env.FIRECRACKER_SANDBOX_URL || "http://localhost:4100",
    token: process.env.FIRECRACKER_SANDBOX_TOKEN || process.env.SANDBOX_TOKEN,
    vmDefaults: {
      vcpuCount: parseOptionalNumber(process.env.FIRECRACKER_DEFAULT_VCPU),
      memoryMib: parseOptionalNumber(process.env.FIRECRACKER_DEFAULT_MEMORY_MIB),
      kernelImage: process.env.FIRECRACKER_KERNEL_IMAGE,
      rootfsImage: process.env.FIRECRACKER_ROOTFS_IMAGE,
      snapshotId: process.env.FIRECRACKER_SNAPSHOT_ID,
      networkPolicy: process.env.FIRECRACKER_NETWORK_POLICY,
    },
  });
}

export function getSandboxProvider(): SandboxProvider {
  const backend = resolveSandboxBackend();
  if (backend === "firecracker") {
    return getFirecrackerSandboxProvider();
  }

  return RemoteSandboxProvider;
}

function shouldTryFirecrackerFallback(error: unknown): boolean {
  if (resolveSandboxBackend() === "firecracker") {
    return false;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("connect")
  );
}

export async function withSandboxProviderFallback<T>(
  action: (provider: SandboxProvider) => Promise<T>
): Promise<T> {
  const primaryProvider = getSandboxProvider();

  try {
    return await action(primaryProvider);
  } catch (error) {
    if (!shouldTryFirecrackerFallback(error)) {
      throw error;
    }

    console.warn("[Sandbox] Primary provider unreachable, falling back to Firecracker", error);
    return action(getFirecrackerSandboxProvider());
  }
}

export async function ensureSandbox(
  existingSandboxId?: string | null,
  sandboxProvider: SandboxProvider = getSandboxProvider()
) {
  if (!existingSandboxId) {
    const sandbox = await withTimeout(
      withSandboxProviderFallback((provider) => provider.create({ lifetime: "15m" })),
      "sandbox create"
    );
    return { sandbox, sandboxId: sandbox.id, reconnected: false };
  }

  try {
    const sandbox = await withTimeout(
      withSandboxProviderFallback((provider) => provider.connect({ id: existingSandboxId })),
      `sandbox connect (${existingSandboxId})`
    );
    // Note: Remote sandbox doesn't support extendLifetime - lifetime managed by server
    return { sandbox, sandboxId: existingSandboxId, reconnected: true };
  } catch (error) {
    console.warn(`[Sandbox] Failed to reconnect to ${existingSandboxId}:`, error);
    const sandbox = await withTimeout(
      withSandboxProviderFallback((provider) => provider.create({ lifetime: "15m" })),
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
    getJobsByChatIdFn?: typeof getJobsByChatId;
    sandboxProvider?: SandboxProvider;
  }
): void {
  const graceMs = options?.graceMs ?? SANDBOX_GRACE_MS;
  const getJobs = options?.getJobsByChatIdFn ?? getJobsByChatId;
  const sandboxProvider = options?.sandboxProvider ?? getSandboxProvider();

  setTimeout(() => {
    void (async () => {
      try {
        const activeJobs = await getJobs(chatId);
        if (activeJobs.length > 0) {
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
