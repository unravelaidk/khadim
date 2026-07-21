import { parentPort, workerData } from "node:worker_threads";
import { callCorePlugin, inspectCorePlugin } from "./core-runtime";

interface WorkerInput {
  modulePath: string;
  operation: "inspect" | "call";
  call?: { operation: string; input: unknown };
}

async function run(input: WorkerInput): Promise<unknown> {
  if (input.operation === "inspect") return inspectCorePlugin(input.modulePath);
  if (!input.call) throw new Error("Plugin call input is missing.");
  return callCorePlugin(input.modulePath, input.call.operation, input.call.input);
}

void run(workerData as WorkerInput).then(
  (value) => parentPort?.postMessage({ ok: true, value }),
  (cause: unknown) => parentPort?.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }),
);
