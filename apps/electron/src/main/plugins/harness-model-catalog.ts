import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginHarnessCatalog, PluginHarnessCommand, PluginHarnessId, PluginHarnessMode, PluginHarnessModel } from "../../shared/plugins";
import { parsePluginHarnessId } from "../../shared/plugins";
import type { PluginManager } from "./plugin-manager";
import { resolveWindowsClaudeShim, type ClaudeLaunchCommand } from "./claude-executable";
import { resolveExecutable } from "./executable-resolution";
import { CodexAppServerCatalogClient } from "./codex-app-server-catalog";
import { buildRunEnvironment } from "../run-environment";

interface OpenCodeModelRecord {
  id?: unknown;
  name?: unknown;
}

interface OpenCodeProviderRecord {
  id?: unknown;
  name?: unknown;
  models?: unknown;
}

export interface OpenCodeProviderList {
  connected?: unknown;
  all?: unknown;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

type RunCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: { env: NodeJS.ProcessEnv; cwd?: string },
) => Promise<CommandResult>;

export interface PluginHarnessModelCatalogOptions {
  runCommand?: RunCommand;
  fetch?: typeof fetch;
  resolveOpenCodeBinary?: (configured: string) => string;
  resolveClaudeLaunch?: (configured: string) => ClaudeLaunchCommand;
  codexCatalogClient?: Pick<CodexAppServerCatalogClient, "discover">;
}

const outputLimit = 8 * 1024 * 1024;
const commandTimeoutMs = 30_000;
const legacyDefaultOpenCodeUrl = "http://127.0.0.1:4096";
const claudeModels: ReadonlyArray<{ model: string; name: string; minimumVersion?: string }> = [
  { model: "claude-fable-5", name: "Claude Fable 5", minimumVersion: "2.1.169" },
  { model: "claude-opus-4-8", name: "Claude Opus 4.8", minimumVersion: "2.1.154" },
  { model: "claude-opus-4-7", name: "Claude Opus 4.7", minimumVersion: "2.1.111" },
  { model: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { model: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { model: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { model: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { model: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];
const claudeModes: ReadonlyArray<PluginHarnessMode> = [
  { id: "default", name: "Default", description: "Ask before sensitive operations." },
  { id: "acceptEdits", name: "Accept Edits", description: "Automatically approve file edits." },
  { id: "plan", name: "Plan", description: "Analyze and plan without making changes." },
  { id: "dontAsk", name: "Don't Ask", description: "Reject operations that require approval." },
  { id: "auto", name: "Auto", description: "Let Claude choose when approval is needed." },
  { id: "bypassPermissions", name: "Bypass Permissions", description: "Allow operations without approval prompts." },
];
const cursorModes: ReadonlyArray<PluginHarnessMode> = [
  { id: "ask", name: "Ask", description: "Answer questions and inspect code without implementing changes." },
  { id: "architect", name: "Architect", description: "Design an implementation plan before changing code." },
  { id: "code", name: "Code", description: "Implement changes in the project.", isDefault: true },
];

function configuredModels(value: unknown, provider: string, detail: string, fallback: string[]): PluginHarnessModel[] {
  const configured = typeof value === "string" ? value.split(",").map((model) => model.trim()).filter(Boolean) : [];
  return [...new Set(configured.length > 0 ? configured : fallback)].map((model) => ({
    id: model,
    name: model.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase()),
    provider,
    model,
    detail,
  }));
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseCliVersion(output: string): string | null {
  return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] ?? null;
}

export function claudeCodeModelsForVersion(version: string | null | undefined): PluginHarnessModel[] {
  return claudeModels
    .filter((entry) => !entry.minimumVersion || (version ? compareVersions(version, entry.minimumVersion) >= 0 : false))
    .map((entry) => ({
      id: entry.model,
      name: entry.name,
      provider: "anthropic",
      model: entry.model,
      detail: "Claude Code",
    }));
}

function modelOption(providerId: string, providerName: string, key: string, value: OpenCodeModelRecord): PluginHarnessModel | null {
  const model = typeof value.id === "string" && value.id.trim() ? value.id.trim() : key.trim();
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : model;
  if (!providerId || !model) return null;
  return { id: `${providerId}/${model}`, name, provider: providerId, model, detail: providerName || providerId };
}

function sorted(models: PluginHarnessModel[]): PluginHarnessModel[] {
  return models.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function flattenOpenCodeProviderList(value: OpenCodeProviderList): PluginHarnessModel[] {
  const connected = new Set(Array.isArray(value.connected) ? value.connected.filter((item): item is string => typeof item === "string") : []);
  if (!Array.isArray(value.all)) return [];
  const models: PluginHarnessModel[] = [];
  for (const rawProvider of value.all) {
    if (!rawProvider || typeof rawProvider !== "object" || Array.isArray(rawProvider)) continue;
    const provider = rawProvider as OpenCodeProviderRecord;
    const providerId = typeof provider.id === "string" ? provider.id.trim() : "";
    if (!providerId || !connected.has(providerId) || !provider.models || typeof provider.models !== "object" || Array.isArray(provider.models)) continue;
    const providerName = typeof provider.name === "string" ? provider.name.trim() : providerId;
    for (const [key, rawModel] of Object.entries(provider.models)) {
      if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) continue;
      const option = modelOption(providerId, providerName, key, rawModel as OpenCodeModelRecord);
      if (option) models.push(option);
    }
  }
  return sorted(models);
}

export function parseOpenCodeModelsCliOutput(stdout: string): PluginHarnessModel[] {
  const models: PluginHarnessModel[] = [];
  let slug: string | null = null;
  const jsonLines: string[] = [];
  const flush = (): void => {
    if (slug && jsonLines.length > 0) {
      const separator = slug.indexOf("/");
      if (separator > 0) {
        try {
          const parsed = JSON.parse(jsonLines.join("\n")) as OpenCodeModelRecord;
          const provider = slug.slice(0, separator);
          const option = modelOption(provider, provider, slug.slice(separator + 1), parsed);
          if (option) models.push(option);
        } catch {
          // OpenCode can print one malformed model without invalidating the rest of its inventory.
        }
      }
    }
    slug = null;
    jsonLines.length = 0;
  };
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(\S+\/\S+)\s*$/);
    if (match?.[1]) {
      flush();
      slug = match[1];
    } else if (slug) jsonLines.push(line);
  }
  flush();
  return sorted(models);
}

export function parseOpenCodeAgentsCliOutput(stdout: string): PluginHarnessMode[] {
  const modes: PluginHarnessMode[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*([^\s(][^(]*?)\s+\((primary|all|subagent)\)\s*$/i);
    if (!match?.[1] || match[2]?.toLowerCase() === "subagent") continue;
    const id = match[1].trim();
    if (!id || modes.some((mode) => mode.id === id)) continue;
    modes.push({
      id,
      name: id.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase()),
      isDefault: id === "build" || modes.length === 0,
    });
  }
  return modes.map((mode, index) => ({ ...mode, isDefault: mode.id === "build" || (!modes.some((item) => item.id === "build") && index === 0) }));
}

export function normalizeClaudeCommands(commands: ReadonlyArray<{ name: string; description?: string; argumentHint?: string; aliases?: string[] }>): PluginHarnessCommand[] {
  const normalized = commands.flatMap((command): PluginHarnessCommand[] => {
    const name = command.name.trim().replace(/^\/+/, "");
    if (!name || name.length > 160) return [];
    const description = command.description?.trim();
    const argumentHint = command.argumentHint?.trim();
    const aliases = command.aliases?.map((alias) => alias.trim().replace(/^\/+/, "")).filter(Boolean);
    return [{ name, ...(description ? { description } : {}), ...(argumentHint ? { argumentHint } : {}), ...(aliases?.length ? { aliases } : {}) }];
  });
  const unique = new Map<string, PluginHarnessCommand>();
  for (const command of normalized) {
    const key = command.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, command);
  }
  return [...unique.values()];
}

function defaultRunCommand(command: string, args: ReadonlyArray<string>, options: { env: NodeJS.ProcessEnv; cwd?: string }): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operation();
    };
    const append = (current: string, chunk: Buffer | string): string => {
      const next = `${current}${chunk.toString()}`;
      if (next.length > outputLimit) throw new Error("Model inventory exceeded 8 MB.");
      return next;
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`Model discovery timed out after ${commandTimeoutMs / 1_000} seconds.`)));
    }, commandTimeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      try { stdout = append(stdout, chunk); }
      catch (cause) { child.kill(); finish(() => reject(cause)); }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      try { stderr = append(stderr, chunk); }
      catch (cause) { child.kill(); finish(() => reject(cause)); }
    });
    child.once("error", (cause) => finish(() => reject(cause)));
    child.once("close", (code) => finish(() => code === 0
      ? resolveResult({ stdout, stderr })
      : reject(new Error(stderr.trim() || `${command} exited with code ${String(code)}.`))));
  });
}

function loopbackServerUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error("OpenCode model discovery only supports loopback server URLs.");
  }
  return url;
}

export class PluginHarnessModelCatalog {
  readonly #runCommand: RunCommand;
  readonly #fetch: typeof fetch;
  readonly #resolveOpenCodeBinary: (configured: string) => string;
  readonly #resolveClaudeLaunch: (configured: string) => ClaudeLaunchCommand;
  readonly #codexCatalogClient: Pick<CodexAppServerCatalogClient, "discover">;
  readonly #catalogCache = new Map<string, Promise<PluginHarnessCatalog>>();

  constructor(private readonly plugins: PluginManager, options: PluginHarnessModelCatalogOptions = {}) {
    this.#runCommand = options.runCommand ?? defaultRunCommand;
    this.#fetch = options.fetch ?? fetch;
    this.#codexCatalogClient = options.codexCatalogClient ?? new CodexAppServerCatalogClient();
    this.#resolveOpenCodeBinary = options.resolveOpenCodeBinary ?? ((configured) => resolveExecutable(configured, {
      fallback: "opencode",
      searchDirectories: [join(homedir(), ".opencode", "bin")],
    }));
    this.#resolveClaudeLaunch = options.resolveClaudeLaunch ?? ((configured) => {
      const resolved = resolveExecutable(configured, {
        fallback: "claude",
        searchDirectories: [join(homedir(), ".claude", "local"), join(homedir(), ".claude", "bin")],
      });
      return process.platform === "win32"
        ? resolveWindowsClaudeShim(resolved, undefined, () => resolveExecutable("node", { fallback: "node" }))
        : { command: resolved, prefixArgs: [] };
    });
  }

  async models(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessModel[]> {
    return (await this.catalog(harnessId, projectPath)).models;
  }

  async modes(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessMode[]> {
    return (await this.catalog(harnessId, projectPath)).modes;
  }

  async commands(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessCommand[]> {
    return (await this.catalog(harnessId, projectPath)).commands ?? [];
  }

  async catalog(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessCatalog> {
    const key = `${harnessId}\0${projectPath}`;
    const existing = this.#catalogCache.get(key);
    if (existing) return existing;
    const pending = this.#catalog(harnessId, projectPath).catch((cause) => {
      this.#catalogCache.delete(key);
      throw cause;
    });
    this.#catalogCache.set(key, pending);
    return pending;
  }

  async refresh(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessCatalog> {
    this.#catalogCache.delete(`${harnessId}\0${projectPath}`);
    return this.catalog(harnessId, projectPath);
  }

  async #catalog(harnessId: PluginHarnessId, projectPath: string): Promise<PluginHarnessCatalog> {
    const { pluginId, capabilityId } = parsePluginHarnessId(harnessId);
    const harness = (await this.plugins.harnesses()).find((candidate) => candidate.id === harnessId);
    if (!harness || harness.pluginId !== pluginId || harness.capabilityId !== capabilityId) {
      throw new Error(`Plugin harness "${harnessId}" is not enabled.`);
    }
    const config = await this.plugins.configuration(pluginId);
    if (pluginId === "khadim.opencode" && capabilityId === "opencode") return {
      models: await this.#openCodeModels(config, projectPath),
      modes: await this.#openCodeModes(config, projectPath),
    };
    if (pluginId === "khadim.claude-code" && capabilityId === "claude-code") return {
      models: await this.#claudeModels(config),
      modes: claudeModes.map((mode) => ({
        ...mode,
        isDefault: mode.id === (typeof config.permissionMode === "string" && claudeModes.some((candidate) => candidate.id === config.permissionMode)
          ? config.permissionMode
          : "acceptEdits"),
      })),
      commands: await this.#claudeCommands(config, projectPath),
    };
    if (pluginId === "khadim.codex" && capabilityId === "codex") {
      const configuredBinary = typeof config.binaryPath === "string" && config.binaryPath.trim() ? config.binaryPath.trim() : "codex";
      const binary = resolveExecutable(configuredBinary, { fallback: "codex" });
      return this.#codexCatalogClient.discover({ binary, cwd: projectPath, environment: buildRunEnvironment(process.env, "openai-codex") });
    }
    if (pluginId === "khadim.cursor" && capabilityId === "cursor") return {
      models: configuredModels(config.customModels, "cursor", "Cursor", ["auto"]),
      modes: cursorModes.map((mode) => ({ ...mode })),
    };
    if (pluginId === "khadim.grok" && capabilityId === "grok") return {
      models: configuredModels(config.customModels, "xai", "Grok", ["grok-build"]),
      modes: [{ id: "default", name: "Default", isDefault: true }],
    };
    throw new Error(`${harness.name} does not provide a model catalog.`);
  }

  async #openCodeModes(config: Record<string, string | number | boolean>, projectPath: string): Promise<PluginHarnessMode[]> {
    const configuredAgent = typeof config.agent === "string" && config.agent.trim() ? config.agent.trim() : undefined;
    const configuredUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim().replace(/\/$/, "") : "";
    if (configuredUrl && configuredUrl !== legacyDefaultOpenCodeUrl) {
      const url = new URL("agent", `${loopbackServerUrl(configuredUrl).toString().replace(/\/$/, "")}/`);
      const headers: Record<string, string> = { "x-opencode-directory": encodeURIComponent(projectPath) };
      const password = typeof config.password === "string" ? config.password : "";
      const username = typeof config.username === "string" && config.username.trim() ? config.username.trim() : "opencode";
      if (password) headers.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
      const response = await this.#fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`OpenCode agent discovery failed with HTTP ${response.status}.`);
      const body = await response.json() as unknown;
      const entries = Array.isArray(body) ? body : body && typeof body === "object" ? Object.values(body as Record<string, unknown>) : [];
      const modes = entries.flatMap((entry): PluginHarnessMode[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        const id = typeof item.name === "string" ? item.name.trim() : "";
        if (!id || item.mode === "subagent") return [];
        const description = typeof item.description === "string" && item.description.trim() ? item.description.trim() : undefined;
        return [{ id, name: id.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase()), ...(description ? { description } : {}), isDefault: configuredAgent ? id === configuredAgent : id === "build" }];
      });
      return modes.length > 0 ? modes : [{ id: configuredAgent ?? "build", name: configuredAgent ?? "Build", isDefault: true }];
    }
    const configured = typeof config.binaryPath === "string" && config.binaryPath.trim() ? config.binaryPath.trim() : "opencode";
    const binary = this.#resolveOpenCodeBinary(configured);
    const result = await this.#runCommand(binary, ["agent", "list"], { env: process.env, cwd: projectPath });
    const modes = parseOpenCodeAgentsCliOutput(result.stdout);
    return modes.length > 0 ? modes : [{ id: configuredAgent ?? "build", name: configuredAgent ?? "Build", isDefault: true }];
  }

  async #claudeModels(config: Record<string, string | number | boolean>): Promise<PluginHarnessModel[]> {
    const configured = typeof config.binaryPath === "string" && config.binaryPath.trim() ? config.binaryPath.trim() : "claude";
    const launch = this.#resolveClaudeLaunch(configured);
    if (launch.prefixArgs.length > 0) return [];
    let result: CommandResult;
    try {
      result = await this.#runCommand(launch.command, [...launch.prefixArgs, "--version"], { env: process.env });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Claude Code models could not be loaded: ${detail}`);
    }
    const version = parseCliVersion(`${result.stdout}\n${result.stderr}`);
    if (!version) throw new Error("Claude Code models could not be loaded because its CLI version was not recognized.");
    return claudeCodeModelsForVersion(version);
  }

  async #claudeCommands(config: Record<string, string | number | boolean>, projectPath: string): Promise<PluginHarnessCommand[]> {
    const configured = typeof config.binaryPath === "string" && config.binaryPath.trim() ? config.binaryPath.trim() : "claude";
    const launch = this.#resolveClaudeLaunch(configured);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 25_000);
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const prompt = (async function* () {
        await new Promise<void>((resolveWait) => abortController.signal.addEventListener("abort", () => resolveWait(), { once: true }));
      })();
      const session = query({
        prompt,
        options: {
          cwd: projectPath,
          persistSession: false,
          pathToClaudeCodeExecutable: launch.command,
          abortController,
          settingSources: ["user", "project", "local"],
          allowedTools: [],
          env: buildRunEnvironment(process.env, "anthropic"),
          stderr: () => {},
        },
      });
      const result = await session.initializationResult();
      return normalizeClaudeCommands(result.commands);
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
      abortController.abort();
    }
  }

  async #openCodeModels(config: Record<string, string | number | boolean>, projectPath: string): Promise<PluginHarnessModel[]> {
    const configuredUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim().replace(/\/$/, "") : "";
    if (configuredUrl && configuredUrl !== legacyDefaultOpenCodeUrl) {
      const url = new URL("provider", `${loopbackServerUrl(configuredUrl).toString().replace(/\/$/, "")}/`);
      const headers: Record<string, string> = { "x-opencode-directory": encodeURIComponent(projectPath) };
      const password = typeof config.password === "string" ? config.password : "";
      const username = typeof config.username === "string" && config.username.trim() ? config.username.trim() : "opencode";
      if (password) headers.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
      const response = await this.#fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`OpenCode model discovery failed with HTTP ${response.status}.`);
      return flattenOpenCodeProviderList(await response.json() as OpenCodeProviderList);
    }

    const configured = typeof config.binaryPath === "string" && config.binaryPath.trim() ? config.binaryPath.trim() : "opencode";
    const binary = this.#resolveOpenCodeBinary(configured);
    let result: CommandResult;
    try {
      result = await this.#runCommand(binary, ["models", "--verbose"], { env: process.env });
    } catch {
      // Match T3 Code's single retry for transient inventory failures such as a locked SQLite store.
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
      result = await this.#runCommand(binary, ["models", "--verbose"], { env: process.env });
    }
    return parseOpenCodeModelsCliOutput(result.stdout);
  }
}
