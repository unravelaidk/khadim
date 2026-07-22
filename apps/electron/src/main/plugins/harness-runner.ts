import { createHash } from "node:crypto";
import type { AgentApprovalDecision, AgentQuestionAnswers, AgentRuntimeMode, AgentStreamEvent } from "../../shared/types";
import {
  parsePluginHarnessId,
  type PluginHarnessCallContext,
  type PluginHarnessEventResult,
  type PluginHarnessId,
  type PluginHttpRequest,
  type PluginNetworkPermissions,
} from "../../shared/plugins";
import type { PluginManager } from "./plugin-manager";
import type { NativeToolMcpEndpoint } from "../native-tool-mcp-host";

interface HarnessEndpoint {
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface PluginHarnessRunInput {
  harnessId: PluginHarnessId;
  projectPath: string;
  engineSessionKey: string;
  prompt: string;
  systemPrompt?: string;
  model: { provider: string; model: string };
  runtimeMode?: AgentRuntimeMode;
  interactionMode?: string;
  nativeToolMcp?: NativeToolMcpEndpoint;
}

export interface ActivePluginHarnessRun {
  abort: () => Promise<void>;
  respondToQuestion: (requestId: string, answers: AgentQuestionAnswers) => Promise<void>;
  respondToApproval: (requestId: string, decision: AgentApprovalDecision) => Promise<void>;
  closed: Promise<void>;
}

export interface PluginHarnessConfigurationPreparer {
  prepare(input: {
    pluginId: string;
    bundled: boolean;
    engineSessionKey: string;
    projectPath: string;
    config: Record<string, string | number | boolean>;
    nativeToolMcp?: NativeToolMcpEndpoint;
  }): Promise<Record<string, string | number | boolean>>;
}

interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const jsonBodyLimit = 8 * 1024 * 1024;
const sseEventLimit = 1024 * 1024;
const pluginEventTypes = new Set([
  "text_delta",
  "step_start",
  "step_update",
  "step_complete",
  "usage",
  "question",
  "approval",
  "done",
  "error",
]);

function sessionStoreKey(engineSessionKey: string): string {
  return `harness-session:v2:${createHash("sha256").update(engineSessionKey).digest("hex")}`;
}

function legacySessionStoreKey(projectPath: string, engineSessionKey: string): string {
  return `harness-session:${createHash("sha256").update(projectPath).update("\0").update(engineSessionKey).digest("hex")}`;
}

function hostMatches(host: string, pattern: string): boolean {
  return pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) && host !== pattern.slice(2) : host === pattern;
}

function normalizedHostname(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1).toLowerCase() : host.toLowerCase();
}

function resolveAllowedUrl(endpoint: HarnessEndpoint, request: PluginHttpRequest, permissions: PluginNetworkPermissions): URL {
  if (typeof endpoint.baseUrl !== "string") throw new Error("Plugin harness endpoint did not return a base URL.");
  if (typeof request.path !== "string" || !request.path.startsWith("/") || request.path.startsWith("//")) throw new Error("Plugin HTTP paths must be absolute paths on the configured origin.");
  const base = new URL(endpoint.baseUrl);
  if (base.username || base.password || base.search || base.hash) throw new Error("Plugin base URLs cannot contain credentials, query strings, or fragments.");
  if (base.protocol !== "https:" && !(base.protocol === "http:" && permissions.allowHttp)) throw new Error(`Plugin is not allowed to use ${base.protocol} endpoints.`);
  const host = normalizedHostname(base.hostname);
  if (!permissions.allowedHosts.some((pattern) => hostMatches(host, pattern.toLowerCase()))) throw new Error(`Plugin is not allowed to connect to ${host}.`);
  const url = new URL(request.path, base);
  if (url.origin !== base.origin) throw new Error("Plugin HTTP request escaped its configured origin.");
  return url;
}

function normalizedHeaders(endpoint: HarnessEndpoint, request: PluginHttpRequest): Headers {
  const headers = new Headers({ ...endpoint.headers, ...request.headers });
  for (const forbidden of ["host", "connection", "content-length", "transfer-encoding", "upgrade", "proxy-authorization"]) headers.delete(forbidden);
  if (request.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  return headers;
}

async function limitedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > jsonBodyLimit) throw new Error("Plugin HTTP response exceeded the 8 MB response limit.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(joined);
}

async function httpJson(url: URL, endpoint: HarnessEndpoint, request: PluginHttpRequest, signal: AbortSignal): Promise<HttpResult> {
  const response = await fetch(url, {
    method: request.method,
    headers: normalizedHeaders(endpoint, request),
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    redirect: "manual",
    signal,
  });
  if (response.status >= 300 && response.status < 400) throw new Error("Plugin HTTP redirects are not allowed.");
  const text = await limitedText(response);
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text) as unknown; }
    catch { body = text; }
  }
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

function responseSummary(body: unknown): string {
  const value = typeof body === "string" ? body : JSON.stringify(body);
  if (!value) return "No response body.";
  return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
}

function assertRequest(value: unknown): PluginHttpRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Plugin harness did not return an HTTP request.");
  const request = value as Partial<PluginHttpRequest>;
  if (!request.method || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) throw new Error("Plugin harness returned an unsupported HTTP method.");
  if (typeof request.path !== "string") throw new Error("Plugin harness returned an invalid HTTP path.");
  return request as PluginHttpRequest;
}

async function* sseData(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new Error("Plugin event endpoint returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > sseEventLimit) throw new Error("Plugin event stream produced an oversized event.");
      let boundary = /(?:\r\n|\r|\n){2}/.exec(buffer);
      while (boundary?.index !== undefined) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block.split(/\r\n|\r|\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) yield data;
        boundary = /(?:\r\n|\r|\n){2}/.exec(buffer);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function assertMappedEvent(value: unknown): AgentStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Plugin returned an invalid stream event.");
  const event = value as AgentStreamEvent;
  if (typeof event.event_type !== "string" || !pluginEventTypes.has(event.event_type)) throw new Error(`Plugin returned unsupported stream event "${String(event.event_type)}".`);
  if (event.content !== undefined && event.content !== null && typeof event.content !== "string") throw new Error("Plugin stream event content must be a string.");
  if (event.metadata !== undefined && event.metadata !== null && (typeof event.metadata !== "object" || Array.isArray(event.metadata))) throw new Error("Plugin stream event metadata must be an object.");
  return event;
}

export class PluginHarnessRunner {
  readonly #configurationPreparers: ReadonlyArray<PluginHarnessConfigurationPreparer>;

  constructor(
    private readonly plugins: PluginManager,
    configurationPreparers: PluginHarnessConfigurationPreparer | ReadonlyArray<PluginHarnessConfigurationPreparer> = [],
  ) {
    this.#configurationPreparers = Array.isArray(configurationPreparers)
      ? configurationPreparers
      : [configurationPreparers as PluginHarnessConfigurationPreparer];
  }

  start(input: PluginHarnessRunInput, emit: (event: AgentStreamEvent) => void): ActivePluginHarnessRun {
    const controller = new AbortController();
    let remoteSessionId: string | undefined;
    let abortRequest: { endpoint: HarnessEndpoint; request: PluginHttpRequest; permissions: PluginNetworkPermissions } | undefined;
    let resolveQuestionResponder!: (responder: (requestId: string, answers: AgentQuestionAnswers) => Promise<void>) => void;
    const questionResponder = new Promise<(requestId: string, answers: AgentQuestionAnswers) => Promise<void>>((resolve) => {
      resolveQuestionResponder = resolve;
    });
    let resolveApprovalResponder!: (responder: (requestId: string, decision: AgentApprovalDecision) => Promise<void>) => void;
    const approvalResponder = new Promise<(requestId: string, decision: AgentApprovalDecision) => Promise<void>>((resolve) => {
      resolveApprovalResponder = resolve;
    });
    let aborted = false;
    const closed = this.execute(input, controller, emit, (sessionId, details, respondToQuestion, respondToApproval) => {
      remoteSessionId = sessionId;
      abortRequest = details;
      resolveQuestionResponder(respondToQuestion);
      resolveApprovalResponder(respondToApproval);
    }).catch((cause: unknown) => {
      resolveQuestionResponder(async () => { throw cause; });
      resolveApprovalResponder(async () => { throw cause; });
      const wasAbort = aborted;
      emit(wasAbort
        ? { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } }
        : { event_type: "error", content: cause instanceof Error ? cause.message : String(cause) });
    });
    return {
      closed,
      respondToQuestion: async (requestId, answers) => {
        if (aborted || controller.signal.aborted) throw new Error("This harness run is no longer accepting answers.");
        const respond = await questionResponder;
        await respond(requestId, answers);
      },
      respondToApproval: async (requestId, decision) => {
        if (aborted || controller.signal.aborted) throw new Error("This harness run is no longer accepting approval decisions.");
        const respond = await approvalResponder;
        await respond(requestId, decision);
      },
      abort: async () => {
        if (aborted) return closed;
        aborted = true;
        try {
          if (remoteSessionId && abortRequest) {
            const abortController = new AbortController();
            const timeout = setTimeout(() => abortController.abort(), 3_000);
            try {
              const url = resolveAllowedUrl(abortRequest.endpoint, abortRequest.request, abortRequest.permissions);
              const result = await httpJson(url, abortRequest.endpoint, abortRequest.request, abortController.signal);
              if (result.status < 200 || result.status >= 300) {
                throw new Error(`Harness abort failed with HTTP ${result.status}: ${responseSummary(result.body)}`);
              }
            } finally { clearTimeout(timeout); }
          }
        } catch (cause) {
          aborted = false;
          throw cause;
        }
        controller.abort();
        await closed;
      },
    };
  }

  private async execute(
    input: PluginHarnessRunInput,
    controller: AbortController,
    emit: (event: AgentStreamEvent) => void,
    ready: (
      sessionId: string,
      abort: { endpoint: HarnessEndpoint; request: PluginHttpRequest; permissions: PluginNetworkPermissions },
      respond: (requestId: string, answers: AgentQuestionAnswers) => Promise<void>,
      respondToApproval: (requestId: string, decision: AgentApprovalDecision) => Promise<void>,
    ) => void,
  ): Promise<void> {
    const { pluginId, capabilityId } = parsePluginHarnessId(input.harnessId);
    const plugin = await this.plugins.get(pluginId);
    if (!plugin.entry.harnesses.some((harness) => harness.capabilityId === capabilityId)) throw new Error(`Plugin "${pluginId}" does not provide harness "${capabilityId}".`);
    const permissions = plugin.entry.permissions.network;
    if (!permissions) throw new Error(`Plugin "${pluginId}" has no network permission for its harness.`);
    const savedConfig = await this.plugins.configuration(pluginId);
    let config = savedConfig;
    for (const preparer of this.#configurationPreparers) {
      config = await preparer.prepare({
        pluginId,
        bundled: plugin.entry.bundled,
        engineSessionKey: input.engineSessionKey,
        projectPath: input.projectPath,
        config,
        nativeToolMcp: input.nativeToolMcp,
      });
    }
    const baseContext: PluginHarnessCallContext = {
      harnessId: capabilityId,
      projectPath: input.projectPath,
      engineSessionKey: input.engineSessionKey,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      model: input.model,
      mode: input.interactionMode,
      runtimeMode: input.runtimeMode,
      config,
    };
    const endpoint = await this.plugins.call<HarnessEndpoint>(pluginId, "harness.endpoint", baseContext);
    const request = async (operation: string, context: PluginHarnessCallContext, allowFailure = false): Promise<HttpResult> => {
      const plan = assertRequest(await this.plugins.call(pluginId, operation, context));
      const url = resolveAllowedUrl(endpoint, plan, permissions);
      let result: HttpResult;
      try {
        result = await httpJson(url, endpoint, plan, controller.signal);
      } catch (cause) {
        if (controller.signal.aborted) throw cause;
        throw new Error(`Couldn't reach ${plugin.entry.name} at ${endpoint.baseUrl}. Check that the server is running and the URL is correct.`, { cause });
      }
      if (!allowFailure && (result.status < 200 || result.status >= 300)) throw new Error(`${plugin.entry.name} request failed with HTTP ${result.status}: ${responseSummary(result.body)}`);
      return result;
    };
    await request("harness.health", baseContext);
    const storeKey = sessionStoreKey(input.engineSessionKey);
    let sessionId = await this.plugins.storeGet(pluginId, storeKey);
    if (!sessionId) {
      sessionId = await this.plugins.storeGet(pluginId, legacySessionStoreKey(input.projectPath, input.engineSessionKey));
      if (sessionId) await this.plugins.storeSet(pluginId, storeKey, sessionId);
    }
    if (sessionId) {
      const existing = await request("harness.session.get", { ...baseContext, remoteSessionId: sessionId }, true);
      if (existing.status === 404) sessionId = undefined;
      else if (existing.status < 200 || existing.status >= 300) throw new Error(`${plugin.entry.name} could not resume its saved session (HTTP ${existing.status}).`);
    }
    if (!sessionId) {
      const created = await request("harness.session.create", baseContext);
      const parsed = await this.plugins.call<{ sessionId?: string }>(pluginId, "harness.session.parse", { ...baseContext, response: created });
      if (!parsed.sessionId || typeof parsed.sessionId !== "string") throw new Error(`${plugin.entry.name} returned no session id.`);
      sessionId = parsed.sessionId;
      await this.plugins.storeSet(pluginId, storeKey, sessionId);
    }
    const context = { ...baseContext, remoteSessionId: sessionId };
    const eventPlan = assertRequest(await this.plugins.call(pluginId, "harness.events", context));
    const eventUrl = resolveAllowedUrl(endpoint, eventPlan, permissions);
    const eventResponse = await fetch(eventUrl, {
      method: eventPlan.method,
      headers: normalizedHeaders(endpoint, eventPlan),
      redirect: "manual",
      signal: controller.signal,
    });
    if (!eventResponse.ok) throw new Error(`${plugin.entry.name} event stream failed with HTTP ${eventResponse.status}.`);
    const abortPlan = assertRequest(await this.plugins.call(pluginId, "harness.abort", context));
    const replyApproval = async (requestId: string, decision: AgentApprovalDecision): Promise<void> => {
      await request("harness.approval.reply", {
        ...context,
        approvalRequestId: requestId,
        approvalDecision: decision,
      });
    };
    ready(
      sessionId,
      { endpoint, request: abortPlan, permissions },
      async (requestId, answers) => {
        await request("harness.question.reply", {
          ...context,
          questionRequestId: requestId,
          questionAnswers: answers,
        });
      },
      replyApproval,
    );
    const abortRemote = async (): Promise<void> => {
      const url = resolveAllowedUrl(endpoint, abortPlan, permissions);
      const timeout = AbortSignal.timeout(7_000);
      const result = await httpJson(url, endpoint, abortPlan, timeout);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`${plugin.entry.name} abort failed with HTTP ${result.status}: ${responseSummary(result.body)}`);
      }
    };
    const consume = (async () => {
      let terminal = false;
      for await (const data of sseData(eventResponse, controller.signal)) {
        let rawEvent: unknown;
        try { rawEvent = JSON.parse(data) as unknown; }
        catch { continue; }
        const mapped = await this.plugins.call<PluginHarnessEventResult>(pluginId, "harness.event", { ...context, event: rawEvent });
        if (!mapped || !Array.isArray(mapped.events)) throw new Error(`${plugin.entry.name} returned an invalid event mapping.`);
        for (const event of mapped.events) {
          const normalized = assertMappedEvent(event);
          const requestId = normalized.event_type === "approval" && normalized.metadata?.resolved !== true
            ? normalized.metadata?.requestId
            : undefined;
          const kind = normalized.metadata?.kind;
          const automaticDecision = typeof requestId === "string"
            ? input.runtimeMode === "full-access"
              ? "acceptForSession"
              : input.runtimeMode === "auto-accept-edits" && kind === "file-change"
                ? "accept"
                : undefined
            : undefined;
          if (automaticDecision && typeof requestId === "string") {
            await replyApproval(requestId, automaticDecision);
            emit({ event_type: "approval", metadata: { ...normalized.metadata, requestId, decision: automaticDecision, automatic: true, resolved: true } });
          } else emit(normalized);
        }
        if (mapped.terminal) { terminal = true; controller.abort(); break; }
      }
      if (!terminal && !controller.signal.aborted) throw new Error(`${plugin.entry.name} event stream ended before the session completed.`);
    })();
    try {
      await request("harness.prompt", context);
      await consume;
    } catch (cause) {
      let abortCause: unknown;
      try {
        await abortRemote();
      } catch (error) {
        abortCause = error;
      }
      controller.abort();
      await consume.catch(() => undefined);
      if (abortCause) {
        throw new AggregateError([cause, abortCause], `${plugin.entry.name} failed and its process could not be stopped safely.`);
      }
      throw cause;
    }
  }
}
