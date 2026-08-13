import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { buildRunEnvironment } from "../run-environment";
import { terminateProcessTree } from "../process-lifecycle";
import { resolveExecutable } from "./executable-resolution";
import type { NativeToolMcpEndpoint } from "../native-tool-mcp-host";

type CliHarnessKind = "codex" | "cursor" | "grok";
type SpawnProcess = (command: string, args: ReadonlyArray<string>, options: SpawnOptions) => ChildProcess;

interface RpcPending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (cause: Error) => void;
}

interface PendingQuestion {
  rpcId: string | number;
  method: string;
  params: Record<string, unknown>;
}

interface PendingApproval {
  rpcId: string | number;
  method: string;
  params: Record<string, unknown>;
}

interface CliSession {
  id: string;
  clients: Set<ServerResponse>;
  process?: ChildProcess;
  remoteSessionId?: string;
  nextRpcId: number;
  pending: Map<number, RpcPending>;
  questions: Map<string, PendingQuestion>;
  approvals: Map<string, PendingApproval>;
  stdoutBuffer: string;
  promptActive: boolean;
  model?: string;
  mode?: string;
  runtimeMode?: "approval-required" | "auto-accept-edits" | "full-access";
  supportsHttpMcp?: boolean;
}

interface CliBridge {
  key: string;
  kind: CliHarnessKind;
  projectPath: string;
  server: Server;
  origin: string;
  token: string;
  config: Record<string, string | number | boolean>;
  sessions: Map<string, CliSession>;
  nativeToolMcp?: NativeToolMcpEndpoint;
}

export interface PrepareCliHarnessInput {
  pluginId: string;
  bundled: boolean;
  engineSessionKey: string;
  projectPath: string;
  config: Record<string, string | number | boolean>;
  nativeToolMcp?: NativeToolMcpEndpoint;
}

export interface CliHarnessServerManagerOptions {
  spawnProcess?: SpawnProcess;
  terminate?: (child: ChildProcess) => Promise<void>;
  resolveBinary?: (configured: string) => string;
}

const pluginKinds: Record<string, CliHarnessKind | undefined> = {
  "khadim.codex": "codex",
  "khadim.cursor": "cursor",
  "khadim.grok": "grok",
};

function bridgeKey(kind: CliHarnessKind, engineSessionKey: string): string {
  return `${kind}\u0000${engineSessionKey}`;
}
const bodyLimit = 2 * 1024 * 1024;
const lineLimit = 2 * 1024 * 1024;

function listen(server: Server): Promise<string> {
  return new Promise((resolveOrigin, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo;
      server.unref();
      resolveOrigin(`http://127.0.0.1:${address.port}`);
    });
  });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > bodyLimit) throw new Error("Harness bridge request exceeded 2 MB.");
    chunks.push(value);
  }
  const parsed = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Harness bridge body must be an object.");
  return parsed as Record<string, unknown>;
}

function sessionRoute(pathname: string): { id: string; action?: "events" | "prompt" | "abort" | "question" | "approval"; requestId?: string } | null {
  const match = pathname.match(/^\/session\/([^/]+)(?:\/(events|prompt|abort)|\/(question|approval)\/([^/]+)\/reply)?$/);
  if (!match?.[1]) return null;
  try {
    return {
      id: decodeURIComponent(match[1]),
      ...(match[2] ? { action: match[2] as "events" | "prompt" | "abort" } : {}),
      ...(match[4] ? { action: match[3] as "question" | "approval", requestId: decodeURIComponent(match[4]) } : {}),
    };
  } catch { return null; }
}

function emit(session: CliSession, event: unknown): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of [...session.clients]) {
    if (client.destroyed || client.writableEnded) session.clients.delete(client);
    else client.write(frame);
  }
}

function finishTurn(session: CliSession, event: unknown): void {
  session.promptActive = false;
  emit(session, event);
  for (const client of session.clients) client.end();
  session.clients.clear();
}

function configured(config: Record<string, string | number | boolean>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function codexUsageMetadata(params: Record<string, unknown>): Record<string, number> | undefined {
  const usage = objectValue(params.tokenUsage);
  const total = objectValue(usage?.total);
  const last = objectValue(usage?.last);
  const contextUsed = nonNegativeNumber(last?.totalTokens);
  const contextSize = nonNegativeNumber(usage?.modelContextWindow);
  const totalProcessed = nonNegativeNumber(total?.totalTokens);
  if (contextUsed === undefined && contextSize === undefined && totalProcessed === undefined) return undefined;
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    ...(contextUsed === undefined ? {} : { context_used: contextUsed }),
    ...(contextSize === undefined ? {} : { context_size: contextSize }),
    ...(totalProcessed === undefined ? {} : { total_processed: totalProcessed }),
  };
}

function acpUsageMetadata(update: Record<string, unknown>): Record<string, number> | undefined {
  const contextUsed = nonNegativeNumber(update.used);
  const contextSize = nonNegativeNumber(update.size);
  if (contextUsed === undefined || contextSize === undefined || contextSize === 0) return undefined;
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    context_used: contextUsed,
    context_size: contextSize,
  };
}

function questionList(kind: CliHarnessKind, params: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = Array.isArray(params.questions) ? params.questions : [];
  return raw.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const question = value as Record<string, unknown>;
    const prompt = typeof question.question === "string" ? question.question : typeof question.prompt === "string" ? question.prompt : "";
    if (!prompt.trim()) return [];
    const id = typeof question.id === "string" && question.id.trim() ? question.id : prompt;
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.flatMap((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const record = option as Record<string, unknown>;
      if (typeof record.label !== "string" || !record.label.trim()) return [];
      return [{ label: record.label, description: typeof record.description === "string" ? record.description : record.label }];
    });
    return [{
      id,
      header: typeof question.header === "string" && question.header.trim() ? question.header : kind === "codex" ? `Question ${index + 1}` : "Question",
      question: prompt,
      options,
      multiSelect: question.multiSelect === true || question.multiple === true || question.allowMultiple === true,
    }];
  });
}

function approvalKind(method: string, params: Record<string, unknown>): "command" | "file-read" | "file-change" | "tool" {
  if (method.includes("commandExecution")) return "command";
  if (method.includes("fileRead")) return "file-read";
  if (method.includes("fileChange")) return "file-change";
  const toolCall = params.toolCall && typeof params.toolCall === "object" && !Array.isArray(params.toolCall) ? params.toolCall as Record<string, unknown> : {};
  const title = `${String(toolCall.title ?? "")} ${String(toolCall.kind ?? "")}`.toLowerCase();
  if (/command|terminal|shell|exec/.test(title)) return "command";
  if (/read/.test(title)) return "file-read";
  if (/edit|write|patch|change/.test(title)) return "file-change";
  return "tool";
}

function approvalDetail(params: Record<string, unknown>): string {
  for (const value of [params.command, params.reason, params.grantRoot, params.filePath, params.path]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const toolCall = params.toolCall && typeof params.toolCall === "object" && !Array.isArray(params.toolCall) ? params.toolCall as Record<string, unknown> : null;
  for (const value of [toolCall?.rawInput, toolCall?.title, toolCall?.content]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return JSON.stringify(params).slice(0, 8_000);
}

function approvalTitle(kind: ReturnType<typeof approvalKind>): string {
  if (kind === "command") return "Run this command?";
  if (kind === "file-read") return "Allow this file read?";
  if (kind === "file-change") return "Allow this file change?";
  return "Allow this tool?";
}

export class CliHarnessServerManager {
  readonly #bridges = new Map<string, CliBridge>();
  readonly #preparing = new Map<string, Promise<CliBridge>>();
  readonly #spawn: SpawnProcess;
  readonly #terminate: (child: ChildProcess) => Promise<void>;
  readonly #resolveBinary: (configured: string) => string;

  constructor(options: CliHarnessServerManagerOptions = {}) {
    this.#spawn = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, [...args], spawnOptions));
    this.#terminate = options.terminate ?? (async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
      await terminateProcessTree(child, closed, { graceMs: 1_000, deadlineMs: 5_000 });
    });
    this.#resolveBinary = options.resolveBinary ?? ((value) => resolveExecutable(value, { fallback: value }));
  }

  async prepare(input: PrepareCliHarnessInput): Promise<Record<string, string | number | boolean>> {
    const kind = pluginKinds[input.pluginId];
    if (!kind || !input.bundled) return input.config;
    const key = bridgeKey(kind, input.engineSessionKey);
    let bridge = this.#bridges.get(key);
    if (!bridge) {
      let preparing = this.#preparing.get(key);
      if (!preparing) {
        preparing = this.#createBridge(key, kind, input);
        this.#preparing.set(key, preparing);
      }
      try {
        bridge = await preparing;
      } finally {
        if (this.#preparing.get(key) === preparing) this.#preparing.delete(key);
      }
    }
    bridge.projectPath = input.projectPath;
    bridge.config = { ...input.config };
    bridge.nativeToolMcp = input.nativeToolMcp;
    return { ...input.config, bridgeUrl: bridge.origin, bridgeToken: bridge.token };
  }

  async stop(engineSessionKey: string): Promise<void> {
    const pending = [...this.#preparing.entries()]
      .filter(([key]) => key.split("\u0000")[1] === engineSessionKey)
      .map(([, preparation]) => preparation);
    if (pending.length > 0) await Promise.allSettled(pending);
    const matching = [...this.#bridges.entries()].filter(([, bridge]) => this.#bridgeSessionKey(bridge) === engineSessionKey);
    if (matching.length === 0) return;
    for (const [key] of matching) this.#bridges.delete(key);
    await Promise.all(matching.map(([, bridge]) => this.#stopBridge(bridge)));
  }

  async stopProject(projectPath: string): Promise<void> {
    if (this.#preparing.size > 0) await Promise.allSettled(this.#preparing.values());
    const matching = [...this.#bridges.entries()].filter(([, bridge]) => bridge.projectPath === projectPath);
    if (matching.length === 0) return;
    for (const [key] of matching) this.#bridges.delete(key);
    await Promise.all(matching.map(([, bridge]) => this.#stopBridge(bridge)));
  }

  async stopAll(): Promise<void> {
    if (this.#preparing.size > 0) await Promise.allSettled(this.#preparing.values());
    const bridges = [...this.#bridges.values()];
    this.#bridges.clear();
    await Promise.all(bridges.map((bridge) => this.#stopBridge(bridge)));
  }

  #bridgeSessionKey(bridge: CliBridge): string {
    return bridge.key.split("\u0000")[1] ?? "";
  }

  async #stopBridge(bridge: CliBridge): Promise<void> {
    await Promise.all([...bridge.sessions.values()].flatMap((session) => session.process ? [this.#terminate(session.process)] : []));
    for (const session of bridge.sessions.values()) for (const client of session.clients) client.end();
    bridge.server.closeAllConnections();
    await new Promise<void>((resolveClose) => bridge.server.close(() => resolveClose()));
  }

  async #createBridge(key: string, kind: CliHarnessKind, input: PrepareCliHarnessInput): Promise<CliBridge> {
    const token = randomBytes(32).toString("hex");
    let bridge!: CliBridge;
    const server = createServer((request, response) => void this.#handle(bridge, request, response).catch((cause) => {
      if (!response.headersSent) json(response, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      else response.end();
    }));
    try {
      const origin = await listen(server);
      bridge = {
        key,
        kind,
        projectPath: input.projectPath,
        server,
        origin,
        token,
        config: { ...input.config },
        sessions: new Map(),
        nativeToolMcp: input.nativeToolMcp,
      };
      this.#bridges.set(key, bridge);
      return bridge;
    } catch (cause) {
      server.close();
      throw cause;
    }
  }

  async #handle(bridge: CliBridge, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${bridge.token}`) { json(response, 401, { error: "Unauthorized" }); return; }
    const url = new URL(request.url ?? "/", bridge.origin);
    if (request.method === "GET" && url.pathname === "/health") { json(response, 200, { healthy: true, provider: bridge.kind }); return; }
    if (request.method === "POST" && url.pathname === "/session") {
      const id = randomUUID();
      bridge.sessions.set(id, { id, clients: new Set(), nextRpcId: 1, pending: new Map(), questions: new Map(), approvals: new Map(), stdoutBuffer: "", promptActive: false });
      json(response, 201, { id });
      return;
    }
    const route = sessionRoute(url.pathname);
    if (!route) { json(response, 404, { error: "Not found" }); return; }
    let session = bridge.sessions.get(route.id);
    if (!session && request.method === "GET" && !route.action) {
      session = { id: route.id, clients: new Set(), nextRpcId: 1, pending: new Map(), questions: new Map(), approvals: new Map(), stdoutBuffer: "", promptActive: false };
      bridge.sessions.set(route.id, session);
    }
    if (!session) { json(response, 404, { error: "Session not found" }); return; }
    if (request.method === "GET" && !route.action) { json(response, 200, { id: session.id }); return; }
    if (request.method === "GET" && route.action === "events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      response.flushHeaders();
      session.clients.add(response);
      response.once("close", () => session?.clients.delete(response));
      return;
    }
    if (request.method === "POST" && route.action === "prompt") {
      if (session.promptActive) { json(response, 409, { error: "Session is already running" }); return; }
      const body = await readJson(request);
      if (typeof body.prompt !== "string" || !body.prompt.trim()) { json(response, 400, { error: "Prompt is missing" }); return; }
      session.promptActive = true;
      session.model = typeof body.model === "string" ? body.model : undefined;
      session.mode = typeof body.mode === "string" && body.mode.trim() ? body.mode.trim() : undefined;
      session.runtimeMode = body.runtimeMode === "approval-required" || body.runtimeMode === "auto-accept-edits" || body.runtimeMode === "full-access"
        ? body.runtimeMode
        : "approval-required";
      void this.#prompt(bridge, session, body.prompt, typeof body.systemPrompt === "string" ? body.systemPrompt : undefined).catch((cause) => {
        finishTurn(session as CliSession, { type: "khadim.process_error", message: cause instanceof Error ? cause.message : String(cause) });
      });
      json(response, 202, { accepted: true });
      return;
    }
    if (request.method === "POST" && route.action === "abort") {
      if (session.process && session.remoteSessionId) {
        if (bridge.kind === "codex") await this.#rpc(session, "turn/interrupt", { threadId: session.remoteSessionId }).catch(() => undefined);
        else await this.#rpc(session, "session/cancel", { sessionId: session.remoteSessionId }).catch(() => undefined);
      }
      session.promptActive = false;
      for (const client of session.clients) client.end();
      session.clients.clear();
      json(response, 200, { aborted: true });
      return;
    }
    if (request.method === "POST" && route.action === "question" && route.requestId) {
      const pending = session.questions.get(route.requestId);
      if (!pending) { json(response, 404, { error: "Question is no longer pending" }); return; }
      const body = await readJson(request);
      const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as Record<string, unknown> : {};
      const answers = Object.fromEntries(Object.entries(rawAnswers).map(([key, value]) => [key, Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []]));
      session.questions.delete(route.requestId);
      let result: unknown;
      if (bridge.kind === "codex") result = { answers: Object.fromEntries(Object.entries(answers).map(([key, values]) => [key, { answers: values }])) };
      else if (bridge.kind === "cursor") result = { answers };
      else {
        const rawQuestions = Array.isArray(pending.params.questions) ? pending.params.questions : [];
        const normalized = rawQuestions.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const question = value as Record<string, unknown>;
          const prompt = typeof question.question === "string" ? question.question : "";
          const id = typeof question.id === "string" ? question.id : prompt;
          const values = answers[id] ?? [];
          if (!prompt || values.length === 0) return [];
          const rawOptions = Array.isArray(question.options) ? question.options : [];
          const optionLabels = new Set(rawOptions.flatMap((option) => {
            if (!option || typeof option !== "object" || Array.isArray(option)) return [];
            const label = (option as Record<string, unknown>).label;
            return typeof label === "string" ? [label] : [];
          }));
          const selected = values.filter((answer) => optionLabels.has(answer));
          const notes = values.filter((answer) => !optionLabels.has(answer));
          return [{ prompt, selected: selected.length > 0 ? selected : ["Other"], notes }];
        });
        const annotations = Object.fromEntries(normalized.flatMap((entry) => entry.notes.length > 0
          ? [[entry.prompt, { notes: entry.notes.join("\n") }]]
          : []));
        result = {
          outcome: "accepted",
          answers: Object.fromEntries(normalized.map((entry) => [entry.prompt, entry.selected])),
          ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
        };
      }
      this.#write(session, { jsonrpc: "2.0", id: pending.rpcId, result });
      json(response, 200, { accepted: true });
      return;
    }
    if (request.method === "POST" && route.action === "approval" && route.requestId) {
      const pending = session.approvals.get(route.requestId);
      if (!pending) { json(response, 404, { error: "Approval is no longer pending" }); return; }
      const body = await readJson(request);
      const decision = body.decision;
      if (decision !== "accept" && decision !== "acceptForSession" && decision !== "decline" && decision !== "cancel") {
        json(response, 400, { error: "Approval decision is invalid" });
        return;
      }
      session.approvals.delete(route.requestId);
      if (bridge.kind === "codex") {
        this.#write(session, { jsonrpc: "2.0", id: pending.rpcId, result: { decision } });
      } else {
        const options = Array.isArray(pending.params.options) ? pending.params.options : [];
        const wanted = decision === "acceptForSession" ? "allow_always" : decision === "accept" ? "allow_once" : "reject_once";
        const option = options.find((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === wanted) as Record<string, unknown> | undefined;
        const fallback = decision === "acceptForSession"
          ? options.find((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === "allow_once") as Record<string, unknown> | undefined
          : undefined;
        const optionId = typeof option?.optionId === "string" ? option.optionId : typeof fallback?.optionId === "string" ? fallback.optionId : undefined;
        this.#write(session, {
          jsonrpc: "2.0",
          id: pending.rpcId,
          result: decision === "cancel" || !optionId
            ? { outcome: { outcome: "cancelled" } }
            : { outcome: { outcome: "selected", optionId } },
        });
      }
      json(response, 200, { accepted: true });
      return;
    }
    json(response, 404, { error: "Not found" });
  }

  async #prompt(bridge: CliBridge, session: CliSession, prompt: string, systemPrompt?: string): Promise<void> {
    if (!session.process) await this.#startProcess(bridge, session, systemPrompt);
    if (bridge.kind !== "codex" && bridge.nativeToolMcp?.hasTools && !session.supportsHttpMcp) {
      throw new Error(`${bridge.kind} does not advertise ACP HTTP MCP support, so it cannot use this run's Studio or connected-app tools.`);
    }
    if (!session.remoteSessionId) throw new Error(`${bridge.kind} did not create a native session.`);
    if (bridge.kind === "codex") {
      await this.#rpc(session, "turn/start", {
        threadId: session.remoteSessionId,
        input: [{ type: "text", text: prompt }],
        ...(session.model ? { model: session.model } : {}),
        ...(session.runtimeMode === "approval-required" ? {
          approvalPolicy: "untrusted",
          sandboxPolicy: { type: "readOnly" },
        } : session.runtimeMode === "auto-accept-edits" ? {
          approvalPolicy: "on-request",
          sandboxPolicy: { type: "workspaceWrite" },
        } : {
          approvalPolicy: "never",
          sandboxPolicy: { type: "dangerFullAccess" },
        }),
        ...(session.mode ? {
          collaborationMode: {
            mode: session.mode,
            settings: {
              model: session.model ?? null,
              reasoning_effort: session.mode === "plan" ? "medium" : null,
              developer_instructions: null,
            },
          },
        } : {}),
      });
    } else {
      if (session.mode && session.mode !== "default") {
        await this.#rpc(session, "session/set_mode", { sessionId: session.remoteSessionId, modeId: session.mode });
      }
      const result = await this.#rpc(session, "session/prompt", { sessionId: session.remoteSessionId, prompt: [{ type: "text", text: prompt }] });
      if (session.promptActive) finishTurn(session, { type: "khadim.done", result });
    }
  }

  async #startProcess(bridge: CliBridge, session: CliSession, systemPrompt?: string): Promise<void> {
    const fallback = bridge.kind === "codex" ? "codex" : bridge.kind === "cursor" ? "cursor-agent" : "grok";
    const binary = this.#resolveBinary(configured(bridge.config, "binaryPath") ?? fallback);
    const args = bridge.kind === "codex" ? [
      "app-server",
      ...(bridge.nativeToolMcp ? [
        "-c", `mcp_servers.khadim.url=${JSON.stringify(bridge.nativeToolMcp.url)}`,
        "-c", "mcp_servers.khadim.bearer_token_env_var=\"KHADIM_NATIVE_MCP_TOKEN\"",
        "-c", "mcp_servers.khadim.required=true",
      ] : []),
    ] : bridge.kind === "cursor"
      ? [...(configured(bridge.config, "apiEndpoint") ? ["-e", configured(bridge.config, "apiEndpoint") as string] : []), "acp"]
      : ["agent", "stdio"];
    const provider = bridge.kind === "codex" ? "openai-codex" : bridge.kind === "grok" ? "xai" : "cursor";
    const environment = { ...buildRunEnvironment(process.env, provider) };
    if (bridge.nativeToolMcp) environment.KHADIM_NATIVE_MCP_TOKEN = bridge.nativeToolMcp.token;
    if (bridge.kind === "grok") environment.GROK_OAUTH2_REFERRER = "khadim";
    const child = this.#spawn(binary, args, { cwd: bridge.projectPath, env: environment, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    session.process = child;
    child.stdout?.on("data", (chunk: Buffer | string) => this.#consume(bridge, session, chunk.toString()));
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => { stderr = `${stderr}${chunk}`.slice(-64 * 1024); });
    child.once("error", (cause) => this.#processFailed(session, cause.message));
    child.once("close", (code) => {
      if (session.process === child) session.process = undefined;
      if (session.promptActive) finishTurn(session, { type: "khadim.process_error", message: stderr.trim() || `${bridge.kind} exited with code ${String(code)}.` });
      for (const pending of session.pending.values()) pending.reject(new Error(`${bridge.kind} process closed.`));
      session.pending.clear();
    });
    if (bridge.kind === "codex") {
      await this.#rpc(session, "initialize", { clientInfo: { name: "khadim", title: "Khadim", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      this.#write(session, { jsonrpc: "2.0", method: "initialized", params: {} });
      const started = await this.#rpc(session, "thread/start", {
        cwd: bridge.projectPath,
        approvalPolicy: session.runtimeMode === "approval-required" ? "untrusted" : session.runtimeMode === "auto-accept-edits" ? "on-request" : "never",
        sandbox: session.runtimeMode === "approval-required" ? "read-only" : session.runtimeMode === "auto-accept-edits" ? "workspace-write" : "danger-full-access",
        ...(session.model ? { model: session.model } : {}),
        ...(systemPrompt ? { developerInstructions: systemPrompt } : {}),
      }) as Record<string, unknown>;
      session.remoteSessionId = (started.thread as Record<string, unknown> | undefined)?.id as string | undefined ?? started.threadId as string | undefined;
    } else {
      const initialized = await this.#rpc(session, "initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "khadim", version: "0.1.0" } }) as Record<string, unknown>;
      const agentCapabilities = initialized.agentCapabilities && typeof initialized.agentCapabilities === "object" && !Array.isArray(initialized.agentCapabilities)
        ? initialized.agentCapabilities as Record<string, unknown>
        : {};
      const mcpCapabilities = agentCapabilities.mcpCapabilities && typeof agentCapabilities.mcpCapabilities === "object" && !Array.isArray(agentCapabilities.mcpCapabilities)
        ? agentCapabilities.mcpCapabilities as Record<string, unknown>
        : {};
      session.supportsHttpMcp = mcpCapabilities.http === true;
      const authMethod = configured(bridge.config, "authMethod") ?? (bridge.kind === "cursor" ? "cursor_login" : process.env.XAI_API_KEY ? "xai.api_key" : "cached_token");
      await this.#rpc(session, "authenticate", { methodId: authMethod }).catch(() => undefined);
      const mcpServers = bridge.nativeToolMcp && session.supportsHttpMcp ? [{
        type: "http",
        name: "khadim",
        url: bridge.nativeToolMcp.url,
        headers: [{ name: "Authorization", value: `Bearer ${bridge.nativeToolMcp.token}` }],
      }] : [];
      const started = await this.#rpc(session, "session/new", { cwd: bridge.projectPath, mcpServers }) as Record<string, unknown>;
      session.remoteSessionId = typeof started.sessionId === "string" ? started.sessionId : undefined;
      if (session.remoteSessionId && session.model) await this.#rpc(session, "session/set_model", { sessionId: session.remoteSessionId, modelId: session.model }).catch(() => undefined);
    }
  }

  #write(session: CliSession, message: unknown): void {
    if (!session.process?.stdin?.writable) throw new Error("Harness process input is unavailable.");
    session.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #rpc(session: CliSession, method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = session.nextRpcId++;
    return new Promise((resolve, reject) => {
      session.pending.set(id, { method, resolve, reject });
      try { this.#write(session, { jsonrpc: "2.0", id, method, params }); }
      catch (cause) { session.pending.delete(id); reject(cause); }
    });
  }

  #consume(bridge: CliBridge, session: CliSession, chunk: string): void {
    session.stdoutBuffer += chunk;
    if (session.stdoutBuffer.length > lineLimit) { this.#processFailed(session, "Harness emitted a JSON message larger than 2 MB."); return; }
    let newline = session.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = session.stdoutBuffer.slice(0, newline).trim();
      session.stdoutBuffer = session.stdoutBuffer.slice(newline + 1);
      if (line) {
        try { this.#message(bridge, session, JSON.parse(line) as Record<string, unknown>); }
        catch { /* Protocol diagnostics on stderr are intentionally ignored. */ }
      }
      newline = session.stdoutBuffer.indexOf("\n");
    }
  }

  #message(bridge: CliBridge, session: CliSession, message: Record<string, unknown>): void {
    if (typeof message.id === "number" && !message.method) {
      const pending = session.pending.get(message.id);
      if (!pending) return;
      session.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    const method = typeof message.method === "string" ? message.method : "";
    const params = message.params && typeof message.params === "object" && !Array.isArray(message.params) ? message.params as Record<string, unknown> : {};
    if (message.id !== undefined && (method === "item/tool/requestUserInput" || method === "cursor/ask_question" || method === "x.ai/ask_user_question" || method === "_x.ai/ask_user_question")) {
      const requestId = randomUUID();
      const actualParams = params.params && typeof params.params === "object" && !Array.isArray(params.params) ? params.params as Record<string, unknown> : params;
      session.questions.set(requestId, { rpcId: message.id as string | number, method, params: actualParams });
      emit(session, { type: "khadim.question", request_id: requestId, questions: questionList(bridge.kind, actualParams) });
      return;
    }
    if (bridge.kind === "cursor" && method === "cursor/task") {
      const task = params.params && typeof params.params === "object" && !Array.isArray(params.params)
        ? params.params as Record<string, unknown>
        : params;
      emit(session, {
        type: "khadim.step_complete",
        item: {
          ...task,
          id: typeof task.toolCallId === "string" ? task.toolCallId : randomUUID(),
          title: "Task",
          status: "completed",
        },
      });
      return;
    }
    const isCodexApproval = method === "item/commandExecution/requestApproval"
      || method === "item/fileRead/requestApproval"
      || method === "item/fileChange/requestApproval";
    if (message.id !== undefined && (isCodexApproval || method === "session/request_permission")) {
      const actualParams = params.params && typeof params.params === "object" && !Array.isArray(params.params) ? params.params as Record<string, unknown> : params;
      const kind = approvalKind(method, actualParams);
      const autoAccept = session.runtimeMode === "full-access"
        || (session.runtimeMode === "auto-accept-edits" && kind === "file-change");
      if (autoAccept) {
        if (isCodexApproval) {
          this.#write(session, { jsonrpc: "2.0", id: message.id, result: { decision: session.runtimeMode === "full-access" ? "acceptForSession" : "accept" } });
        } else {
          const options = Array.isArray(actualParams.options) ? actualParams.options : [];
          const option = options.find((value) => value && typeof value === "object" && !Array.isArray(value) && ["allow_always", "allow_once"].includes(String((value as Record<string, unknown>).kind))) as Record<string, unknown> | undefined;
          this.#write(session, {
            jsonrpc: "2.0",
            id: message.id,
            result: typeof option?.optionId === "string"
              ? { outcome: { outcome: "selected", optionId: option.optionId } }
              : { outcome: { outcome: "cancelled" } },
          });
        }
        return;
      }
      const requestId = randomUUID();
      session.approvals.set(requestId, { rpcId: message.id as string | number, method, params: actualParams });
      emit(session, {
        type: "khadim.approval",
        request_id: requestId,
        kind,
        title: approvalTitle(kind),
        detail: approvalDetail(actualParams),
      });
      return;
    }
    if (bridge.kind === "codex") this.#codexEvent(session, method, params);
    else this.#acpEvent(session, method, params);
  }

  #codexEvent(session: CliSession, method: string, params: Record<string, unknown>): void {
    if (method === "item/agentMessage/delta" && typeof params.delta === "string") emit(session, { type: "khadim.text_delta", text: params.delta });
    else if (method === "thread/tokenUsage/updated") {
      const usage = codexUsageMetadata(params);
      if (usage) emit(session, { type: "khadim.usage", usage });
    }
    else if (method === "item/started" || method === "item/completed") {
      const item = params.item && typeof params.item === "object" && !Array.isArray(params.item) ? params.item as Record<string, unknown> : {};
      if (item.type !== "agentMessage") emit(session, { type: method === "item/started" ? "khadim.step_start" : "khadim.step_complete", item });
    } else if (method === "turn/completed") finishTurn(session, { type: "khadim.done" });
    else if (method === "error") finishTurn(session, { type: "khadim.process_error", message: typeof params.message === "string" ? params.message : "Codex failed." });
  }

  #acpEvent(session: CliSession, method: string, params: Record<string, unknown>): void {
    if (method === "_x.ai/session/prompt_complete") { if (session.promptActive) finishTurn(session, { type: "khadim.done" }); return; }
    if (method !== "session/update") return;
    const update = params.update && typeof params.update === "object" && !Array.isArray(params.update) ? params.update as Record<string, unknown> : {};
    const kind = update.sessionUpdate;
    const content = update.content && typeof update.content === "object" && !Array.isArray(update.content) ? update.content as Record<string, unknown> : {};
    if ((kind === "agent_message_chunk" || kind === "agent_thought_chunk") && typeof content.text === "string") emit(session, { type: "khadim.text_delta", text: content.text });
    else if (kind === "tool_call") emit(session, { type: "khadim.step_start", item: update });
    else if (kind === "tool_call_update") emit(session, { type: update.status === "completed" || update.status === "failed" ? "khadim.step_complete" : "khadim.step_update", item: update });
    else if (kind === "usage_update") {
      const usage = acpUsageMetadata(update);
      if (usage) emit(session, { type: "khadim.usage", usage });
    }
  }

  #processFailed(session: CliSession, message: string): void {
    if (session.promptActive) finishTurn(session, { type: "khadim.process_error", message });
  }
}
