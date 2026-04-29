/**
 * @unravelai/khadim — Khadim coding agent library.
 *
 * Programmatic entry point for headless agent execution.
 * Use this when you want to embed Khadim in your own Node.js application.
 *
 *   import { runAgent } from "@unravelai/khadim";
 *   const { output } = await runAgent({ prompt: "summarize this repo" });
 */

export { runAgent, runAgentStream } from "./run-agent";
export type { AgentStreamEvent, AgentResult, RunAgentOptions } from "./run-agent";
export { resolveBinaryPath } from "./resolve-binary";
