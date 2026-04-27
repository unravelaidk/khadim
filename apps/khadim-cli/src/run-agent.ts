/**
 * @unravelai/khadim — programmatic agent API.
 *
 * Spawns the native khadim binary with --json and reads structured
 * AgentStreamEvent JSON objects from stdout.
 *
 * Usage:
 *   import { runAgent } from "@unravelai/khadim";
 *   for await (const event of runAgent({ prompt: "summarize this repo" })) {
 *     console.log(event.event_type, event.content);
 *   }
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

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const binaryPath = await resolveBinaryPath();
  const args: string[] = ["--json", "--prompt", opts.prompt];

  if (opts.cwd) args.unshift("--cwd", opts.cwd);
  if (opts.provider) args.unshift("--provider", opts.provider);
  if (opts.model) args.unshift("--model", opts.model);
  if (opts.session) args.unshift("--session", opts.session);

  const child = spawn(binaryPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const events: AgentStreamEvent[] = [];
  let output = "";

  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

  const readPromise = (async () => {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const event: AgentStreamEvent = JSON.parse(line);
        events.push(event);

        if (event.event_type === "text_delta" && event.content) {
          output += event.content;
        }
      } catch {
        // Skip non-JSON lines (e.g. log output to stdout)
      }
    }
  })();

  // Capture stderr for error reporting
  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => child.kill(), { once: true });
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

  await readPromise;

  if (exitCode !== 0) {
    throw new Error(`khadim exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`);
  }

  return { output, events };
}
