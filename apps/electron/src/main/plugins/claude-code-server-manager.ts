import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { query as createClaudeQuery, type CanUseTool, type PermissionResult, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildRunEnvironment } from "../run-environment";
import { terminateProcessTree } from "../process-lifecycle";
import { resolveWindowsClaudeShim, type ClaudeLaunchCommand } from "./claude-executable";
import { resolveExecutable } from "./executable-resolution";
import type { NativeToolMcpEndpoint } from "../native-tool-mcp-host";

export interface PrepareClaudeCodeInput {
  pluginId: string;
  bundled: boolean;
  engineSessionKey: string;
  projectPath: string;
  config: Record<string, string | number | boolean>;
  nativeToolMcp?: NativeToolMcpEndpoint;
}

type SpawnProcess = (command: string, args: ReadonlyArray<string>, options: SpawnOptions) => ChildProcess;

export interface ClaudeCodeServerManagerOptions {
  spawnProcess?: SpawnProcess;
  terminate?: (child: ChildProcess) => Promise<void>;
  resolveBinary?: (configured: string) => string;
  createQuery?: typeof createClaudeQuery;
}

interface PendingClaudeQuestion {
  questions: Array<Record<string, unknown>>;
  resolve: (answers: Record<string, string[]>) => void;
}

type ClaudeApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

interface PendingClaudeApproval {
  resolve: (decision: ClaudeApprovalDecision) => void;
}

class ClaudePromptQueue {
  readonly #messages: SDKUserMessage[] = [];
  readonly #waiters: Array<(message: SDKUserMessage | null) => void> = [];
  #closed = false;

  push(message: SDKUserMessage): void {
    if (this.#closed) throw new Error("Claude Code input stream is closed.");
    const waiter = this.#waiters.shift();
    if (waiter) waiter(message);
    else this.#messages.push(message);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter(null);
  }

  async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = this.#messages.shift() ?? await new Promise<SDKUserMessage | null>((resolveNext) => this.#waiters.push(resolveNext));
      if (!next) return;
      yield next;
    }
  }
}

interface ClaudeSession {
  readonly id: string;
  readonly clients: Set<ServerResponse>;
  child?: ChildProcess;
  initialized: boolean;
  invalid: boolean;
  aborting: boolean;
  query?: Query;
  queryTask?: Promise<void>;
  promptQueue?: ClaudePromptQueue;
  readonly pendingQuestions: Map<string, PendingClaudeQuestion>;
  readonly pendingApprovals: Map<string, PendingClaudeApproval>;
}

interface ManagedBridge {
  projectPath: string;
  readonly server: Server;
  readonly origin: string;
  readonly token: string;
  readonly sessions: Map<string, ClaudeSession>;
  config: Record<string, string | number | boolean>;
  nativeToolMcp?: NativeToolMcpEndpoint;
}

interface PromptBody {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  mode?: string;
  runtimeMode?: "approval-required" | "auto-accept-edits" | "full-access";
}

const requestBodyLimit = 2 * 1024 * 1024;
const stderrLimit = 64 * 1024;
const stdoutLineLimit = 1024 * 1024;
const sseBufferLimit = 1024 * 1024;
const permissionModes = new Set(["acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"]);

function effectivePermissionMode(body: PromptBody, configured: string | undefined): string {
  // Plan and don't-ask are stricter interaction modes. Every other native mode
  // is capped by the explicit runtime access choice so a saved harness mode can
  // never silently widen the renderer's safety setting.
  if (body.mode === "plan" || body.mode === "dontAsk") return body.mode;
  if (body.runtimeMode === "full-access") return "bypassPermissions";
  if (body.runtimeMode === "auto-accept-edits") return "acceptEdits";
  if (body.runtimeMode === "approval-required") return "default";
  return body.mode ?? configured ?? "acceptEdits";
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function listen(server: Server): Promise<string> {
  return new Promise((resolveOrigin, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error("Claude Code bridge did not receive a loopback address."));
        return;
      }
      server.unref();
      resolveOrigin(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((cause) => cause ? reject(cause) : resolveClose());
  });
}

async function terminateManagedProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  await terminateProcessTree(child, closed, { graceMs: 1_000, deadlineMs: 5_000 });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > requestBodyLimit) throw new Error("Claude Code bridge request exceeded 2 MB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function promptBody(value: unknown): PromptBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Claude Code prompt body must be an object.");
  const input = value as Record<string, unknown>;
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("Claude Code prompt is missing.");
  if (input.systemPrompt !== undefined && typeof input.systemPrompt !== "string") throw new Error("Claude Code system prompt must be a string.");
  if (input.model !== undefined && typeof input.model !== "string") throw new Error("Claude Code model must be a string.");
  if (input.mode !== undefined && (typeof input.mode !== "string" || !permissionModes.has(input.mode))) throw new Error("Claude Code mode is invalid.");
  if (input.runtimeMode !== undefined && !["approval-required", "auto-accept-edits", "full-access"].includes(String(input.runtimeMode))) throw new Error("Claude Code runtime mode is invalid.");
  return {
    prompt: input.prompt.trim(),
    ...(typeof input.systemPrompt === "string" && input.systemPrompt.trim() ? { systemPrompt: input.systemPrompt.trim() } : {}),
    ...(typeof input.model === "string" && input.model.trim() ? { model: input.model.trim() } : {}),
    ...(typeof input.mode === "string" && input.mode.trim() ? { mode: input.mode.trim() } : {}),
    ...(input.runtimeMode === "approval-required" || input.runtimeMode === "auto-accept-edits" || input.runtimeMode === "full-access" ? { runtimeMode: input.runtimeMode } : {}),
  };
}

function sessionPath(pathname: string): { id: string; action?: "events" | "prompt" | "abort" | "question" | "approval"; requestId?: string } | undefined {
  const match = pathname.match(/^\/session\/([^/]+)(?:\/(events|prompt|abort)|\/(question|approval)\/([^/]+)\/reply)?$/);
  if (!match?.[1]) return undefined;
  let id: string;
  try { id = decodeURIComponent(match[1]); }
  catch { return undefined; }
  let requestId: string | undefined;
  try { requestId = match[4] ? decodeURIComponent(match[4]) : undefined; }
  catch { return undefined; }
  return {
    id,
    ...(match[2] ? { action: match[2] as "events" | "prompt" | "abort" } : {}),
    ...(requestId ? { action: match[3] as "question" | "approval", requestId } : {}),
  };
}

function configuredString(config: Record<string, string | number | boolean>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configuredBoolean(config: Record<string, string | number | boolean>, key: string): boolean {
  return config[key] === true;
}

function expandedHomePath(value: string): string {
  if (value === "~") return homedir();
  return value.startsWith("~/") || value.startsWith("~\\") ? join(homedir(), value.slice(2)) : value;
}

function processFailureMessage(cause: unknown, stderr: string, code: number | null): string {
  const error = cause as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT" || error?.message?.includes("ENOENT")) {
    return "Claude Code CLI was not found. Install Claude Code and run `claude auth login`, or set the plugin’s Binary path in Apps.";
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (stderr.trim()) return stderr.trim();
  return `Claude Code exited before returning a result (${code === null ? "unknown exit" : `code ${code}`}).`;
}

function emit(session: ClaudeSession, event: unknown): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  const frameBytes = Buffer.byteLength(frame);
  for (const client of [...session.clients]) {
    if (client.destroyed || client.writableEnded) session.clients.delete(client);
    else if (client.writableLength + frameBytes > sseBufferLimit) {
      session.clients.delete(client);
      client.destroy(new Error("Claude Code event consumer could not keep up with the stream."));
    } else client.write(frame);
  }
}

function resultError(event: Record<string, unknown>): string {
  const errors = Array.isArray(event.errors) ? event.errors.find((value): value is string => typeof value === "string") : undefined;
  return errors ?? (typeof event.result === "string" ? event.result : "");
}

function missingConversation(message: string): boolean {
  return /no conversation found|session.+not found/i.test(message);
}

function cleanupPromptDirectory(directory: string | undefined): void {
  if (!directory) return;
  try { rmSync(directory, { recursive: true, force: true }); }
  catch { /* Best-effort cleanup must not strand the process or event stream. */ }
}

function endStreams(session: ClaudeSession): void {
  for (const client of session.clients) client.end();
  session.clients.clear();
}

function claudeApprovalKind(toolName: string): "command" | "file-read" | "file-change" | "tool" {
  if (/bash|shell|terminal|command|exec/i.test(toolName)) return "command";
  if (/read|grep|glob|search/i.test(toolName)) return "file-read";
  if (/write|edit|patch|notebook/i.test(toolName)) return "file-change";
  return "tool";
}

function claudeApprovalDetail(toolName: string, input: Record<string, unknown>): string {
  for (const key of ["command", "file_path", "path", "notebook_path", "pattern", "query"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 8_000);
  }
  return `${toolName}\n${JSON.stringify(input, null, 2)}`.slice(0, 8_000);
}

export class ClaudeCodeServerManager {
  readonly #bridges = new Map<string, ManagedBridge>();
  readonly #starting = new Map<string, Promise<ManagedBridge>>();
  readonly #spawn: SpawnProcess;
  readonly #terminate: (child: ChildProcess) => Promise<void>;
  readonly #resolveLaunch: (configured: string) => ClaudeLaunchCommand;
  readonly #createQuery?: typeof createClaudeQuery;
  #stopping = false;

  constructor(options: ClaudeCodeServerManagerOptions = {}) {
    this.#spawn = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, [...args], spawnOptions));
    this.#terminate = options.terminate ?? terminateManagedProcess;
    this.#createQuery = options.createQuery ?? (options.spawnProcess ? undefined : createClaudeQuery);
    this.#resolveLaunch = options.resolveBinary
      ? (configured) => ({ command: options.resolveBinary!(configured), prefixArgs: [] })
      : (configured) => {
        const resolved = resolveExecutable(configured, {
          fallback: "claude",
          searchDirectories: [join(homedir(), ".claude", "local"), join(homedir(), ".claude", "bin")],
        });
        return process.platform === "win32"
          ? resolveWindowsClaudeShim(resolved, undefined, () => resolveExecutable("node", { fallback: "node" }))
          : { command: resolved, prefixArgs: [] };
      };
  }

  async prepare(input: PrepareClaudeCodeInput): Promise<Record<string, string | number | boolean>> {
    if (input.pluginId !== "khadim.claude-code" || !input.bundled) return input.config;
    if (this.#stopping) throw new Error("Khadim is shutting down and cannot start Claude Code.");
    let current = this.#bridges.get(input.engineSessionKey);
    if (!current) {
      let starting = this.#starting.get(input.engineSessionKey);
      if (!starting) {
        starting = this.#createBridge(input);
        this.#starting.set(input.engineSessionKey, starting);
      }
      try {
        current = await starting;
      } finally {
        if (this.#starting.get(input.engineSessionKey) === starting) this.#starting.delete(input.engineSessionKey);
      }
    }
    if (current) {
      if (current.projectPath !== input.projectPath) {
        if ([...current.sessions.values()].some((session) => session.child)) {
          throw new Error("Stop the active Claude Code run before relocating this project.");
        }
        current.projectPath = input.projectPath;
      }
      current.config = { ...input.config };
      current.nativeToolMcp = input.nativeToolMcp;
      return { ...input.config, bridgeUrl: current.origin, bridgeToken: current.token };
    }
    throw new Error("Claude Code bridge did not start.");
  }

  async stop(engineSessionKey: string): Promise<void> {
    const bridge = this.#bridges.get(engineSessionKey)
      ?? await this.#starting.get(engineSessionKey)?.catch(() => undefined);
    if (!bridge) return;
    this.#starting.delete(engineSessionKey);
    await this.#stopBridge(bridge);
    if (this.#bridges.get(engineSessionKey) === bridge) this.#bridges.delete(engineSessionKey);
  }

  async stopAll(): Promise<void> {
    this.#stopping = true;
    await Promise.allSettled(this.#starting.values());
    this.#starting.clear();
    await Promise.allSettled([...this.#bridges.keys()].map((engineSessionKey) => this.stop(engineSessionKey)));
  }

  async #createBridge(input: PrepareClaudeCodeInput): Promise<ManagedBridge> {
    const token = randomBytes(32).toString("hex");
    const sessions = new Map<string, ClaudeSession>();
    let bridge!: ManagedBridge;
    const server = createServer((request, response) => {
      void this.#handleRequest(bridge, request, response).catch((cause: unknown) => {
        if (!response.headersSent) json(response, 500, { error: cause instanceof Error ? cause.message : String(cause) });
        else response.end();
      });
    });
    const origin = await listen(server);
    bridge = {
      projectPath: input.projectPath,
      server,
      origin,
      token,
      sessions,
      config: { ...input.config },
      nativeToolMcp: input.nativeToolMcp,
    };
    if (this.#stopping) {
      server.closeAllConnections();
      await closeServer(server);
      throw new Error("Khadim is shutting down and cannot start Claude Code.");
    }
    this.#bridges.set(input.engineSessionKey, bridge);
    return bridge;
  }

  async #handleRequest(bridge: ManagedBridge, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${bridge.token}`) {
      json(response, 401, { error: "Unauthorized" });
      return;
    }
    const url = new URL(request.url ?? "/", bridge.origin);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { healthy: true, provider: "claude-code" });
      return;
    }
    if (request.method === "POST" && url.pathname === "/session") {
      const id = randomUUID();
      bridge.sessions.set(id, { id, clients: new Set(), initialized: false, invalid: false, aborting: false, pendingQuestions: new Map(), pendingApprovals: new Map() });
      json(response, 201, { id });
      return;
    }

    const route = sessionPath(url.pathname);
    if (!route || !uuidPattern.test(route.id)) {
      json(response, 404, { error: "Not found" });
      return;
    }
    let session = bridge.sessions.get(route.id);
    if (request.method === "GET" && !route.action && !session) {
      session = { id: route.id, clients: new Set(), initialized: true, invalid: false, aborting: false, pendingQuestions: new Map(), pendingApprovals: new Map() };
      bridge.sessions.set(route.id, session);
    }
    if (!session || session.invalid) {
      json(response, 404, { error: "Claude Code session not found" });
      return;
    }
    if (request.method === "GET" && !route.action) {
      json(response, 200, { id: session.id });
      return;
    }
    if (request.method === "GET" && route.action === "events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      response.flushHeaders();
      session.clients.add(response);
      response.once("close", () => session?.clients.delete(response));
      return;
    }
    if (request.method === "POST" && route.action === "prompt") {
      if (session.child) {
        json(response, 409, { error: "Claude Code session is already running" });
        return;
      }
      const body = promptBody(await readJson(request));
      session.aborting = false;
      if (this.#createQuery) this.#startClaudeSdk(bridge, session, body);
      else this.#startClaude(bridge, session, body);
      json(response, 202, { accepted: true });
      return;
    }
    if (request.method === "POST" && route.action === "abort") {
      if (session.query) {
        session.aborting = true;
        await session.query.interrupt();
        session.aborting = false;
        json(response, 200, { aborted: true });
        return;
      }
      const child = session.child;
      if (child) {
        session.aborting = true;
        try {
          await this.#terminate(child);
        } catch (cause) {
          session.aborting = false;
          throw cause;
        }
      }
      json(response, 200, { aborted: Boolean(child) });
      return;
    }
    if (request.method === "POST" && route.action === "question" && route.requestId) {
      const pending = session.pendingQuestions.get(route.requestId);
      if (!pending) {
        json(response, 404, { error: "Claude Code question is no longer pending" });
        return;
      }
      const input = await readJson(request) as { answers?: unknown };
      if (!input.answers || typeof input.answers !== "object" || Array.isArray(input.answers)) {
        json(response, 400, { error: "Question answers are missing" });
        return;
      }
      const answers = Object.fromEntries(Object.entries(input.answers).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((answer): answer is string => typeof answer === "string") : [],
      ]));
      session.pendingQuestions.delete(route.requestId);
      pending.resolve(answers);
      json(response, 200, { accepted: true });
      return;
    }
    if (request.method === "POST" && route.action === "approval" && route.requestId) {
      const pending = session.pendingApprovals.get(route.requestId);
      if (!pending) {
        json(response, 404, { error: "Claude Code approval is no longer pending" });
        return;
      }
      const input = await readJson(request) as { decision?: unknown };
      if (input.decision !== "accept" && input.decision !== "acceptForSession" && input.decision !== "decline" && input.decision !== "cancel") {
        json(response, 400, { error: "Approval decision is invalid" });
        return;
      }
      session.pendingApprovals.delete(route.requestId);
      pending.resolve(input.decision);
      json(response, 200, { accepted: true });
      return;
    }
    json(response, 404, { error: "Not found" });
  }

  #startClaudeSdk(bridge: ManagedBridge, session: ClaudeSession, body: PromptBody): void {
    if (!this.#createQuery) throw new Error("Claude Agent SDK is unavailable.");
    const existingQuery = Boolean(session.query);
    if (!session.query) {
      const configuredBinary = configuredString(bridge.config, "binaryPath") ?? "claude";
      const launch = this.#resolveLaunch(configuredBinary);
      const permissionMode = effectivePermissionMode(body, configuredString(bridge.config, "permissionMode"));
      if (!permissionModes.has(permissionMode)) throw new Error(`Claude Code permission mode "${permissionMode}" is invalid.`);
      const environment = {
        ...process.env,
        ...buildRunEnvironment(process.env, "anthropic"),
        ...buildRunEnvironment(process.env, "amazon-bedrock"),
        ...buildRunEnvironment(process.env, "google-vertex"),
      };
      delete environment.KHADIM_API_KEY;
      delete environment.KHADIM_RUN_API_KEY;
      const queue = new ClaudePromptQueue();
      session.promptQueue = queue;
      const canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
        if (toolName === "AskUserQuestion") {
          const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
          const questions = rawQuestions.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
          const requestId = options.requestId || options.toolUseID || randomUUID();
          const answers = await new Promise<Record<string, string[]>>((resolveAnswers) => {
            session.pendingQuestions.set(requestId, { questions, resolve: resolveAnswers });
            const onAbort = () => {
              if (!session.pendingQuestions.delete(requestId)) return;
              resolveAnswers({});
            };
            options.signal.addEventListener("abort", onAbort, { once: true });
            emit(session, { type: "khadim.question", session_id: session.id, request_id: requestId, questions });
          });
          if (options.signal.aborted) return { behavior: "deny", message: "User cancelled the question." };
          const sdkAnswers = Object.fromEntries(Object.entries(answers).map(([key, values]) => [key, values.length <= 1 ? (values[0] ?? "") : values]));
          return { behavior: "allow", updatedInput: { questions: input.questions, answers: sdkAnswers } };
        }
        if (body.runtimeMode === "full-access") return { behavior: "allow", updatedInput: input };
        const kind = claudeApprovalKind(toolName);
        if (body.runtimeMode === "auto-accept-edits" && kind === "file-change") return { behavior: "allow", updatedInput: input };
        const requestId = options.requestId || options.toolUseID || randomUUID();
        const decision = await new Promise<ClaudeApprovalDecision>((resolveDecision) => {
          session.pendingApprovals.set(requestId, { resolve: resolveDecision });
          const onAbort = () => {
            if (!session.pendingApprovals.delete(requestId)) return;
            resolveDecision("cancel");
          };
          options.signal.addEventListener("abort", onAbort, { once: true });
          emit(session, {
            type: "khadim.approval",
            request_id: requestId,
            kind,
            title: kind === "command" ? "Run this command?" : kind === "file-read" ? "Allow this file read?" : kind === "file-change" ? "Allow this file change?" : `Allow ${toolName}?`,
            detail: claudeApprovalDetail(toolName, input),
          });
        });
        if (decision === "accept" || decision === "acceptForSession") {
          return {
            behavior: "allow",
            updatedInput: input,
            ...(decision === "acceptForSession" && options.suggestions ? { updatedPermissions: [...options.suggestions] } : {}),
          };
        }
        return { behavior: "deny", message: decision === "cancel" ? "User cancelled tool execution." : "User declined tool execution." };
      };
      const tools = configuredString(bridge.config, "tools")?.split(",").map((value) => value.trim()).filter(Boolean);
      const allowedTools = (configuredString(bridge.config, "preapprovedTools") ?? configuredString(bridge.config, "allowedTools"))
        ?.split(",").map((value) => value.trim()).filter(Boolean);
      const effectiveAllowedTools = [...new Set([
        ...(allowedTools ?? []),
        ...(bridge.nativeToolMcp ? ["mcp__khadim__*"] : []),
      ])];
      const disallowedTools = configuredString(bridge.config, "disallowedTools")?.split(",").map((value) => value.trim()).filter(Boolean);
      session.query = this.#createQuery({
        prompt: queue.stream(),
        options: {
          cwd: bridge.projectPath,
          pathToClaudeCodeExecutable: launch.command,
          ...(body.model ? { model: body.model } : {}),
          ...(body.systemPrompt ? { systemPrompt: { type: "preset", preset: "claude_code", append: body.systemPrompt } } : {}),
          permissionMode: permissionMode as "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan" | "auto",
          ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
          settingSources: configuredBoolean(bridge.config, "loadProjectSettings") ? ["user", "project", "local"] : ["user"],
          includePartialMessages: true,
          canUseTool,
          env: environment,
          ...(bridge.nativeToolMcp ? { mcpServers: { khadim: {
            type: "http" as const,
            url: bridge.nativeToolMcp.url,
            headers: { Authorization: `Bearer ${bridge.nativeToolMcp.token}` },
            alwaysLoad: true,
          } } } : {}),
          ...(tools ? { tools } : {}),
          ...(effectiveAllowedTools.length > 0 ? { allowedTools: effectiveAllowedTools } : {}),
          ...(disallowedTools ? { disallowedTools } : {}),
          ...(session.initialized ? { resume: session.id } : { sessionId: session.id }),
        },
      });
      session.queryTask = (async () => {
        try {
          for await (const message of session.query as Query) {
            const record = message as unknown as Record<string, unknown>;
            if (record.type === "system" && record.subtype === "init") session.initialized = true;
            emit(session, message);
            if (record.type === "result") {
              if (record.subtype === "success") session.initialized = true;
              endStreams(session);
            }
          }
        } catch (cause) {
          emit(session, { type: "khadim.process_error", message: processFailureMessage(cause, "", null) });
          endStreams(session);
        }
      })();
    }
    const pushPrompt = (): void => session.promptQueue?.push({
      type: "user",
      message: { role: "user", content: body.prompt },
      parent_tool_use_id: null,
      session_id: session.id,
    });
    if (existingQuery && session.query && (body.mode || body.runtimeMode)) {
      void session.query.setPermissionMode(effectivePermissionMode(body, configuredString(bridge.config, "permissionMode")) as "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan" | "auto").then(pushPrompt).catch((cause) => {
        emit(session, { type: "khadim.process_error", message: cause instanceof Error ? cause.message : String(cause) });
        endStreams(session);
      });
    } else pushPrompt();
  }

  #startClaude(bridge: ManagedBridge, session: ClaudeSession, body: PromptBody): void {
    const configuredBinary = configuredString(bridge.config, "binaryPath") ?? "claude";
    if (configuredBinary.includes("\0") || configuredBinary.length > 4_096) throw new Error("Claude Code Binary path is invalid.");
    const launch = this.#resolveLaunch(configuredBinary);
    const permissionMode = effectivePermissionMode(body, configuredString(bridge.config, "permissionMode"));
    if (!permissionModes.has(permissionMode)) throw new Error(`Claude Code permission mode "${permissionMode}" is invalid.`);
    const configuredModel = configuredString(bridge.config, "model");
    const model = configuredModel ?? body.model;
    let promptDirectory: string | undefined;
    let systemPromptPath: string | undefined;
    if (body.systemPrompt) {
      try {
        promptDirectory = mkdtempSync(join(tmpdir(), "khadim-claude-prompt-"));
        systemPromptPath = join(promptDirectory, "system-prompt.txt");
        writeFileSync(systemPromptPath, body.systemPrompt, { encoding: "utf8", mode: 0o600 });
      } catch (cause) {
        cleanupPromptDirectory(promptDirectory);
        throw cause;
      }
    }
    const preapprovedTools = configuredString(bridge.config, "preapprovedTools")
      ?? configuredString(bridge.config, "allowedTools");
    let mcpConfigPath: string | undefined;
    if (bridge.nativeToolMcp) {
      try {
        promptDirectory ??= mkdtempSync(join(tmpdir(), "khadim-claude-prompt-"));
        mcpConfigPath = join(promptDirectory, "mcp.json");
        writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: { khadim: {
          type: "http",
          url: bridge.nativeToolMcp.url,
          headers: { Authorization: `Bearer ${bridge.nativeToolMcp.token}` },
        } } }), { encoding: "utf8", mode: 0o600 });
      } catch (cause) {
        cleanupPromptDirectory(promptDirectory);
        throw cause;
      }
    }
    const effectivePreapprovedTools = [preapprovedTools, bridge.nativeToolMcp ? "mcp__khadim__*" : undefined]
      .filter((value): value is string => Boolean(value))
      .join(",");
    const args = [
      "--print",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode", permissionMode,
      ...(permissionMode === "bypassPermissions" ? ["--dangerously-skip-permissions"] : []),
      ...(model ? ["--model", model] : []),
      ...(systemPromptPath ? ["--append-system-prompt-file", systemPromptPath] : []),
      "--setting-sources", configuredBoolean(bridge.config, "loadProjectSettings") ? "user,project,local" : "user",
      ...(configuredString(bridge.config, "tools") ? ["--tools", configuredString(bridge.config, "tools") as string] : []),
      ...(effectivePreapprovedTools ? ["--allowedTools", effectivePreapprovedTools] : []),
      ...(mcpConfigPath ? ["--mcp-config", mcpConfigPath] : []),
      ...(configuredString(bridge.config, "disallowedTools") ? ["--disallowedTools", configuredString(bridge.config, "disallowedTools") as string] : []),
      ...(configuredString(bridge.config, "effort") ? ["--effort", configuredString(bridge.config, "effort") as string] : []),
      ...(session.initialized ? ["--resume", session.id] : ["--session-id", session.id]),
    ];
    const environment = {
      ...buildRunEnvironment(process.env, "anthropic"),
      ...buildRunEnvironment(process.env, "amazon-bedrock"),
      ...buildRunEnvironment(process.env, "google-vertex"),
    };
    for (const name of [
      "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
      "http_proxy", "https_proxy", "no_proxy", "all_proxy",
      "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
      "ANTHROPIC_FOUNDRY_RESOURCE", "ANTHROPIC_FOUNDRY_API_KEY",
    ]) {
      if (process.env[name] !== undefined) environment[name] = process.env[name];
    }
    delete environment.KHADIM_API_KEY;
    delete environment.KHADIM_RUN_API_KEY;
    const claudeHome = configuredString(bridge.config, "claudeHome");
    if (claudeHome) {
      const expanded = expandedHomePath(claudeHome);
      const configDirectory = isAbsolute(expanded) ? expanded : resolve(bridge.projectPath, expanded);
      mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
      environment.CLAUDE_CONFIG_DIR = configDirectory;
    }
    const wasResume = session.initialized;
    let child: ChildProcess;
    let stdinFailure: Error | undefined;
    try {
      child = this.#spawn(launch.command, [...launch.prefixArgs, ...args], {
        cwd: bridge.projectPath,
        detached: process.platform !== "win32",
        env: environment,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      child.stdin?.once("error", (cause) => {
        stdinFailure = cause instanceof Error ? cause : new Error(String(cause));
      });
      child.stdin?.end(body.prompt);
    } catch (cause) {
      cleanupPromptDirectory(promptDirectory);
      throw cause;
    }
    session.child = child;
    let stderr = "";
    let sawResult = false;
    let staleResume = false;
    let streamFailure: Error | undefined;
    let terminalEvent: unknown;
    let settled = false;

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`;
      if (stderr.length > stderrLimit) stderr = stderr.slice(-stderrLimit);
    });
    const handleLine = (line: string): void => {
      if (!line.trim()) return;
      let event: unknown;
      try { event = JSON.parse(line) as unknown; }
      catch { return; }
      const record = event && typeof event === "object" && !Array.isArray(event) ? event as Record<string, unknown> : undefined;
      if (record?.type === "system" && record.subtype === "init" && record.session_id === session.id) {
        session.initialized = true;
      }
      if (record?.type === "result") {
        sawResult = true;
        if (wasResume && missingConversation(resultError(record))) {
          staleResume = true;
          return;
        }
        if (record.subtype === "success") session.initialized = true;
        terminalEvent = event;
        return;
      }
      emit(session, event);
    };
    let stdoutBuffer = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      if (streamFailure) return;
      stdoutBuffer += chunk.toString();
      if (stdoutBuffer.length > stdoutLineLimit) {
        streamFailure = new Error("Claude Code emitted a JSON event larger than 1 MB.");
        void this.#terminate(child).catch(() => undefined);
        return;
      }
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(stdoutBuffer.slice(0, newline));
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        newline = stdoutBuffer.indexOf("\n");
      }
    });

    const finish = (code: number | null, cause?: unknown): void => {
      if (settled) return;
      settled = true;
      if (session.child === child) session.child = undefined;
      cleanupPromptDirectory(promptDirectory);
      if (staleResume && !session.aborting) {
        session.initialized = false;
        try {
          this.#startClaude(bridge, session, body);
        } catch (retryCause) {
          emit(session, { type: "khadim.process_error", message: processFailureMessage(retryCause, "", null) });
          endStreams(session);
        }
        return;
      }
      if (session.aborting) {
        endStreams(session);
        return;
      }
      const detail = processFailureMessage(streamFailure ?? stdinFailure ?? cause, stderr, code);
      if (!sawResult) {
        if (missingConversation(detail)) session.invalid = true;
        emit(session, {
          type: "khadim.process_error",
          message: detail,
        });
      } else if (terminalEvent) {
        emit(session, terminalEvent);
      }
      endStreams(session);
    };
    child.once("error", (cause) => finish(child.exitCode, cause));
    child.once("close", (code) => finish(code));
  }

  async #stopBridge(bridge: ManagedBridge): Promise<void> {
    const children: ChildProcess[] = [];
    for (const session of bridge.sessions.values()) {
      if (session.child) children.push(session.child);
      session.promptQueue?.close();
      session.query?.close();
    }
    await Promise.all(children.map((child) => this.#terminate(child)));
    for (const session of bridge.sessions.values()) endStreams(session);
    bridge.server.closeAllConnections();
    await closeServer(bridge.server);
  }
}
