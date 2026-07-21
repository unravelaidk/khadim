import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { PluginCapabilities, PluginInfo } from "../../shared/plugins";

interface InspectResult {
  info: PluginInfo;
  capabilities: PluginCapabilities;
}

export class WasmPluginRuntime {
  constructor(
    private readonly workerDirectory: string,
    private readonly timeoutMs = 5_000,
  ) {}

  inspect(modulePath: string): Promise<InspectResult> {
    return this.run<InspectResult>(modulePath, { operation: "inspect" });
  }

  call<T>(modulePath: string, operation: string, input: unknown, timeoutMs = this.timeoutMs): Promise<T> {
    return this.run<T>(modulePath, { operation: "call", call: { operation, input } }, timeoutMs);
  }

  private run<T>(modulePath: string, input: Record<string, unknown>, timeoutMs = this.timeoutMs): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(join(this.workerDirectory, "plugin-worker.js"), {
        workerData: { modulePath, ...input },
        resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
      });
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        reject(new Error(`Plugin call exceeded its ${timeoutMs} ms execution deadline.`));
      }, timeoutMs);
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        callback();
      };
      worker.once("message", (message: { ok: boolean; value?: T; error?: string }) => finish(() => {
        if (message.ok) resolve(message.value as T);
        else reject(new Error(message.error || "Plugin execution failed."));
      }));
      worker.once("error", (cause) => finish(() => reject(cause)));
      worker.once("exit", (code) => {
        if (code !== 0) finish(() => reject(new Error(`Plugin worker exited with code ${code}.`)));
      });
    });
  }
}
