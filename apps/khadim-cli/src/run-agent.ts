/**
 * @unravelai/khadim — programmatic agent API.
 *
 * Spawns the native khadim binary with --json and reads structured
 * AgentStreamEvent JSON objects from stdout.
 *
 * Usage:
 *   import { runAgent } from "@unravelai/khadim";
 *   const { output, events } = await runAgent({ prompt: "summarize this repo" });
 *
 *   // Streaming variant:
 *   for await (const event of runAgentStream({ prompt: "..." })) { ... }
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolveBinaryPath } from "./resolve-binary";

export interface AgentStreamEvent {
  workspace_id?: string | null;
  session_id?: string | null;
  event_type: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AgentResult {
  output: string;
  events: AgentStreamEvent[];
}

export interface RunAgentOptions {
  prompt: string;
  cwd?: string;
  provider?: string;
  model?: string;
  session?: string;
  signal?: AbortSignal;
}

function buildArgs(opts: RunAgentOptions): string[] {
  const args: string[] = ["--json", "--prompt", opts.prompt];
  if (opts.cwd) args.unshift("--cwd", opts.cwd);
  if (opts.provider) args.unshift("--provider", opts.provider);
  if (opts.model) args.unshift("--model", opts.model);
  if (opts.session) args.unshift("--session", opts.session);
  return args;
}

function spawnBinary(opts: RunAgentOptions) {
  return spawn(resolveBinaryPath, buildArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

/** Run agent and collect all events. Returns accumulated output + event list. */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const events: AgentStreamEvent[] = [];
  let output = "";

  for await (const event of runAgentStream(opts)) {
    events.push(event);
    if (event.event_type === "text_delta" && event.content) {
      output += event.content;
    }
  }

  return { output, events };
}

/** Run agent as an async generator, yielding events as they arrive from stdout. */
export async function* runAgentStream(opts: RunAgentOptions): AsyncGenerator<AgentStreamEvent> {
  const binaryPath = await resolveBinaryPath();
  const child = spawn(binaryPath, buildArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stderr = "";

  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => child.kill(), { once: true });
  }

  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
  const exitPromise = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as AgentStreamEvent;
    } catch {
      // Skip non-JSON lines
    }
  }

  const exitCode = await exitPromise;

  if (exitCode !== 0) {
    throw new Error(`khadim exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`);
  }
}
