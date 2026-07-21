/**
 * @unravelai/khadim — Khadim coding agent library.
 *
 * Programmatic entry point for headless agent execution.
 * Use this when you want to embed Khadim in your own Node.js application.
 *
 *   import { runAgent } from "@unravelai/khadim";
 *   const { output } = await runAgent({ prompt: "summarize this repo" });
 */

export { runAgent, runAgentStream } from "./run-agent.js";
export type {
  AgentStreamEvent,
  AgentResult,
  NativeToolBridge,
  RunAgentOptions,
} from "./run-agent.js";
export { resolveBinaryPath } from "./resolve-binary.js";
export { getProviders, getModels } from "./catalog.js";
export type { ProviderInfo, ModelInfo } from "./catalog.js";
