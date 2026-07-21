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
import { createServer, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { resolveBinaryPath } from "./resolve-binary.js";

const MAX_AGENT_EVENT_BYTES = 8 * 1024 * 1024;
const MAX_NATIVE_TOOL_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_BYTES = 128 * 1024;
const PARENT_WATCH_FD = 3;
const PARENT_WATCH_GRACE_MS = 1_000;

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
  systemPrompt?: string;
  harness?: string;
  signal?: AbortSignal;
  /**
   * API key injected into the child process environment.
   * When set alongside `provider`, the correct env var
   * (e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY) is populated
   * so the khadim binary can use it for LLM calls.
   * Safe — only affects the spawned child, not the parent.
   */
  apiKey?: string;
  nativeTools?: NativeToolBridge[];
  /**
   * Override the executable used to run Khadim. This is useful for embedding a
   * locally built binary or a process-boundary test double.
   */
  binaryPath?: string;
  /** Arguments inserted before Khadim's CLI arguments (for example, a script passed to Node). */
  binaryArgs?: string[];
}

export interface NativeToolBridge {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  promptSnippet?: string;
  execute: (input: Record<string, unknown>) => Promise<{ content: string; metadata?: Record<string, unknown> | null }>;
}

/** Maps provider IDs to the env var names khadim's Rust binary expects. */
const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-codex": "OPENAI_CODEX_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  "azure-openai-responses": "AZURE_OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  "google-vertex": "GEMINI_API_KEY",
  "amazon-bedrock": "AWS_BEARER_TOKEN_BEDROCK",
  cerebras: "CEREBRAS_API_KEY",
  huggingface: "HF_TOKEN",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  zai: "ZAI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  ollama: "",
};

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > MAX_NATIVE_TOOL_REQUEST_BYTES) {
      throw new RequestBodyTooLargeError(
        `Native tool request exceeds ${MAX_NATIVE_TOOL_REQUEST_BYTES} bytes`,
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

async function createNativeToolServer(tools: NativeToolBridge[] | undefined): Promise<{ env: Record<string, string>; close: () => Promise<void> }> {
  if (!tools || tools.length === 0) {
    return { env: {}, close: async () => {} };
  }

  const token = randomBytes(24).toString("hex");
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.writeHead(405).end("method not allowed");
        return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end("unauthorized");
        return;
      }
      const match = req.url?.match(/^\/tool\/([^/?#]+)$/);
      const tool = match ? toolMap.get(decodeURIComponent(match[1])) : null;
      if (!tool) {
        res.writeHead(404).end("tool not found");
        return;
      }
      const body = JSON.parse(await readRequestBody(req)) as { input?: Record<string, unknown> };
      const result = await tool.execute(body.input ?? {});
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      const tooLarge = error instanceof RequestBodyTooLargeError;
      res.writeHead(tooLarge ? 413 : 500, {
        "connection": tooLarge ? "close" : "keep-alive",
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ content: `Native tool failed: ${error instanceof Error ? error.message : String(error)}` }));
    }
  });
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Failed to start native tool RPC server");
  }

  const toolDefs = tools.map(({ name, description, parameters, promptSnippet }) => ({
    name,
    description,
    parameters,
    prompt_snippet: promptSnippet || `- ${name}: ${description}`,
  }));

  let closePromise: Promise<void> | undefined;

  return {
    env: {
      KHADIM_NATIVE_TOOL_RPC_URL: `http://127.0.0.1:${address.port}`,
      KHADIM_NATIVE_TOOL_RPC_TOKEN: token,
      KHADIM_NATIVE_TOOLS: JSON.stringify(toolDefs),
    },
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        // Do not let an in-flight or keep-alive native-tool request retain the
        // server after its owning agent stream has been abandoned.
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
      });
      return closePromise;
    },
  };
}

function buildEnv(opts: RunAgentOptions, extraEnv: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  if (opts.apiKey && opts.provider) {
    const envVar = PROVIDER_ENV_MAP[opts.provider];
    if (envVar) env[envVar] = opts.apiKey;
  }
  Object.assign(env, extraEnv);
  return env;
}

function buildArgs(opts: RunAgentOptions): string[] {
  const args: string[] = [
    "--parent-watch-fd",
    String(PARENT_WATCH_FD),
    "--json",
    "--prompt",
    opts.prompt,
  ];
  if (opts.cwd) args.unshift("--cwd", opts.cwd);
  if (opts.provider) args.unshift("--provider", opts.provider);
  if (opts.model) args.unshift("--model", opts.model);
  if (opts.session) args.unshift("--session", opts.session);
  if (opts.systemPrompt) args.unshift("--system-prompt", opts.systemPrompt);
  if (opts.harness) args.unshift("--harness", opts.harness);
  return args;
}

interface BoundedByteTail {
  bytes: Buffer;
  truncated: boolean;
}

function appendBoundedTail(tail: BoundedByteTail, chunk: Buffer, limit: number): void {
  if (chunk.length >= limit) {
    tail.bytes = Buffer.from(chunk.subarray(chunk.length - limit));
    tail.truncated = true;
    return;
  }

  const combined = Buffer.concat([tail.bytes, chunk], tail.bytes.length + chunk.length);
  if (combined.length > limit) {
    tail.bytes = Buffer.from(combined.subarray(combined.length - limit));
    tail.truncated = true;
  } else {
    tail.bytes = combined;
  }
}

function formatStderr(tail: BoundedByteTail): string {
  const content = tail.bytes.toString("utf8").trim();
  if (!tail.truncated) return content;
  return `[stderr truncated to final ${MAX_STDERR_BYTES} bytes]${content ? `\n${content}` : ""}`;
}

function parseAgentEvent(line: Buffer): AgentStreamEvent | undefined {
  const withoutCarriageReturn = line.length > 0 && line[line.length - 1] === 0x0d
    ? line.subarray(0, line.length - 1)
    : line;
  const text = withoutCarriageReturn.toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as AgentStreamEvent;
  } catch {
    // Preserve the existing contract: non-JSON stdout lines are ignored.
    return undefined;
  }
}

async function* readAgentEvents(stdout: Readable): AsyncGenerator<AgentStreamEvent> {
  let pending = Buffer.allocUnsafe(64 * 1024);
  let pendingLength = 0;

  const append = (segment: Buffer) => {
    const nextLength = pendingLength + segment.length;
    if (nextLength > MAX_AGENT_EVENT_BYTES) {
      throw new Error(
        `khadim emitted an NDJSON event larger than ${MAX_AGENT_EVENT_BYTES} bytes without a newline`,
      );
    }
    if (nextLength > pending.length) {
      let capacity = pending.length;
      while (capacity < nextLength) capacity = Math.min(capacity * 2, MAX_AGENT_EVENT_BYTES);
      const grown = Buffer.allocUnsafe(capacity);
      pending.copy(grown, 0, 0, pendingLength);
      pending = grown;
    }
    segment.copy(pending, pendingLength);
    pendingLength = nextLength;
  };

  for await (const rawChunk of stdout) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(0x0a, start);
      const end = newline === -1 ? chunk.length : newline;
      append(chunk.subarray(start, end));
      if (newline === -1) break;

      const event = parseAgentEvent(pending.subarray(0, pendingLength));
      pendingLength = 0;
      if (event) yield event;
      start = newline + 1;
    }
  }

  if (pendingLength > 0) {
    const event = parseAgentEvent(pending.subarray(0, pendingLength));
    if (event) yield event;
  }
}

interface ChildOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

function observeChild(child: ReturnType<typeof spawn>): {
  outcome: Promise<ChildOutcome>;
  dispose: () => void;
} {
  let spawnError: Error | undefined;
  let resolveOutcome!: (outcome: ChildOutcome) => void;
  const outcome = new Promise<ChildOutcome>((resolve) => {
    resolveOutcome = resolve;
  });

  const onError = (error: Error) => {
    spawnError = error;
  };
  const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
    resolveOutcome({ code, signal, error: spawnError });
  };

  child.once("error", onError);
  child.once("close", onClose);

  return {
    outcome,
    dispose: () => {
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    },
  };
}

async function settlesWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function terminateAndReap(
  child: ReturnType<typeof spawn>,
  outcome: Promise<ChildOutcome>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    await outcome;
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // Escalation below handles kill races and unsupported graceful signals.
  }
  if (await settlesWithin(outcome, 3_000)) return;

  try {
    child.kill("SIGKILL");
  } catch {
    // The process may have exited between the deadline and escalation.
  }
  if (!(await settlesWithin(outcome, 3_000))) {
    throw new Error(`Failed to terminate and reap khadim process${child.pid ? ` ${child.pid}` : ""}`);
  }
}

interface DestroyableStream {
  destroy: () => void;
  destroyed?: boolean;
}

function closeParentWatch(parentWatch: DestroyableStream | undefined): void {
  if (!parentWatch?.destroyed) parentWatch?.destroy();
}

async function terminateManagedTreeAndReap(
  child: ReturnType<typeof spawn>,
  outcome: Promise<ChildOutcome>,
  parentWatch: DestroyableStream | undefined,
): Promise<void> {
  closeParentWatch(parentWatch);

  // Give the Rust watcher time to observe EOF and hard-stop its process
  // group/job. Directly signalling the CLI first can race that watcher on
  // Unix and strand descendants in the managed group.
  if (parentWatch && child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
    if (await settlesWithin(outcome, PARENT_WATCH_GRACE_MS)) return;
  }
  await terminateAndReap(child, outcome);
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
  opts.signal?.throwIfAborted();
  const binaryPath = opts.binaryPath ?? await resolveBinaryPath();
  opts.signal?.throwIfAborted();

  let nativeToolServer: Awaited<ReturnType<typeof createNativeToolServer>> | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  let childObservation: ReturnType<typeof observeChild> | undefined;
  let parentWatch: DestroyableStream | undefined;
  let abortHandler: (() => void) | undefined;
  let termination: Promise<void> | undefined;
  const stderr: BoundedByteTail = { bytes: Buffer.alloc(0), truncated: false };
  let stderrHandler: ((chunk: Buffer) => void) | undefined;

  try {
    nativeToolServer = await createNativeToolServer(opts.nativeTools);
    opts.signal?.throwIfAborted();

    child = spawn(binaryPath, [...(opts.binaryArgs ?? []), ...buildArgs(opts)], {
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      env: buildEnv(opts, nativeToolServer.env),
    });
    childObservation = observeChild(child);
    const inheritedWatch = child.stdio[PARENT_WATCH_FD];
    if (!inheritedWatch || typeof inheritedWatch.destroy !== "function") {
      throw new Error(`Failed to create parent lifecycle pipe on descriptor ${PARENT_WATCH_FD}`);
    }
    parentWatch = inheritedWatch;
    stderrHandler = (chunk: Buffer) => {
      appendBoundedTail(stderr, chunk, MAX_STDERR_BYTES);
    };
    child.stderr!.on("data", stderrHandler);

    abortHandler = () => {
      termination ??= terminateManagedTreeAndReap(
        child!,
        childObservation!.outcome,
        parentWatch,
      );
      // Observe the cleanup promise immediately; the generator awaits and
      // reports it below after the stdout iterator has unwound.
      void termination.catch(() => {});
    };
    if (opts.signal) {
      opts.signal.addEventListener("abort", abortHandler, { once: true });
      // Close the check/listener race if the signal aborted synchronously.
      if (opts.signal.aborted) abortHandler();
    }

    for await (const event of readAgentEvents(child.stdout!)) {
      yield event;
    }

    const outcome = await childObservation.outcome;
    opts.signal?.throwIfAborted();
    if (outcome.error) throw outcome.error;
    if (outcome.code !== 0) {
      const description = outcome.signal ? `signal ${outcome.signal}` : `code ${outcome.code ?? 1}`;
      const stderrText = formatStderr(stderr);
      throw new Error(`khadim exited with ${description}${stderrText ? `: ${stderrText}` : ""}`);
    }
  } finally {
    if (opts.signal && abortHandler) {
      opts.signal.removeEventListener("abort", abortHandler);
    }
    let cleanupError: unknown;
    if (child && childObservation) {
      try {
        await (termination ?? terminateManagedTreeAndReap(
          child,
          childObservation.outcome,
          parentWatch,
        ));
      } catch (error) {
        cleanupError = error;
      } finally {
        if (stderrHandler) child.stderr?.removeListener("data", stderrHandler);
        childObservation.dispose();
      }
    } else {
      closeParentWatch(parentWatch);
    }
    if (nativeToolServer) {
      try {
        await nativeToolServer.close();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) throw cleanupError;
  }
}
