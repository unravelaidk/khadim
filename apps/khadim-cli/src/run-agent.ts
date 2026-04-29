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
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
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
  systemPrompt?: string;
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

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: `Native tool failed: ${error instanceof Error ? error.message : String(error)}` }));
    }
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

  return {
    env: {
      KHADIM_NATIVE_TOOL_RPC_URL: `http://127.0.0.1:${address.port}`,
      KHADIM_NATIVE_TOOL_RPC_TOKEN: token,
      KHADIM_NATIVE_TOOLS: JSON.stringify(toolDefs),
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
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
  const args: string[] = ["--json", "--prompt", opts.prompt];
  if (opts.cwd) args.unshift("--cwd", opts.cwd);
  if (opts.provider) args.unshift("--provider", opts.provider);
  if (opts.model) args.unshift("--model", opts.model);
  if (opts.session) args.unshift("--session", opts.session);
  if (opts.systemPrompt) args.unshift("--system-prompt", opts.systemPrompt);
  return args;
}

async function spawnBinary(opts: RunAgentOptions) {
  return spawn(await resolveBinaryPath(), buildArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: buildEnv(opts),
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
  const nativeToolServer = await createNativeToolServer(opts.nativeTools);
  const child = spawn(binaryPath, buildArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: buildEnv(opts, nativeToolServer.env),
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
  await nativeToolServer.close();

  if (exitCode !== 0) {
    throw new Error(`khadim exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`);
  }
}
