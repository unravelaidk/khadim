import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, type IpcMainInvokeEvent } from "electron";
import type { AgentApprovalDecision, AgentQuestionAnswers, AgentRunRequest, AgentStreamEvent, AppSettings, ArtifactPreviewRequest, CodexAuthSession, CodexAuthStatus, DiscordSettings, DiscordSettingsUpdate, GoogleConnectRequest, ModelCatalogProvider, Project, SettingsUpdate, SkillEntry } from "../shared/types";
import { credentialPolicyArgs, executionPolicyArgs, processSupervisionArgs, skillRuntimeArgs } from "./agent-run-policy";
import { decodeModelCredential, hasSameCredentialScope } from "./domain/credential-policy";
import { createProjectActivationOperations } from "./application/project-activation";
import { terminateProcessTree, waitForSettlement } from "./process-lifecycle";
import { RunEventBuffer } from "./run-event-buffer";
import { buildRunEnvironment } from "./run-environment";
import { safeModelBaseUrl } from "./model-endpoint-policy";
import { applyShutdownRecovery } from "./shutdown-recovery";
import { handleWindowClose } from "./window-close-policy";
import { DiscordBridge, normalizeDiscordSessionState, type StoredDiscordSessionState, type StoredDiscordSettings } from "./discord-bridge";
import { SettingsService } from "./application/settings-service";
import { normalizeStoredSearchSettings, SearchSettingsService } from "./application/search-settings-service";
import type { ProjectDataRepository, SettingsRepository, SkillRepository } from "./domain/repositories";
import { ElectronCredentialVault } from "./infrastructure/electron-credential-vault";
import { FilesystemSkillRepository } from "./infrastructure/filesystem-skill-repository";
import { JsonDocumentRepository } from "./infrastructure/json-document-repository";
import type { StoredGoogleConnection, StoredSearchSettings } from "./domain/configuration";
import { DiscordSettingsService, normalizeStoredDiscordSettings } from "./application/discord-settings-service";
import { ProjectService } from "./application/project-service";
import type { StoredModelConfig, StoredSettings } from "./domain/settings";
import { FileProjectRepository } from "./infrastructure/file-project-repository";
import { FileSettingsRepository } from "./infrastructure/file-settings-repository";
import { normalizeSettingsUpdate } from "./settings-persistence";
import { installLiquidGlass, liquidGlassWindowOptions } from "./liquid-glass";
import { renderArtifactForPdf } from "../shared/artifact-export";
import { ArtifactPreviewRuntime } from "./artifact-preview-runtime";
import { createArtifactAgentTools } from "./artifact-agent-tools";
import { createNativeToolHost, type NativeTool, type NativeToolHost } from "./native-tool-host";
import { createGmailNativeTools } from "./gmail-native-tools";
import { createGoogleCalendarNativeTools, createGoogleDriveNativeTools } from "./google-workspace-native-tools";
import { googleWorkspaceServiceEnabled } from "../shared/google-workspace";
import { GoogleConnectionService, normalizeStoredGoogleConnection } from "./application/google-connection-service";
import { GoogleOAuthClient } from "./infrastructure/google-oauth-client";
import { isPluginHarnessId, type PluginConfigUpdate, type PluginHarnessId } from "../shared/plugins";
import { PluginManager, normalizePluginState, type StoredPluginState } from "./plugins/plugin-manager";
import { WasmPluginRuntime } from "./plugins/wasm-plugin";
import { PluginHarnessRunner, type ActivePluginHarnessRun } from "./plugins/harness-runner";
import { OpenCodeServerManager } from "./plugins/opencode-server-manager";
import { ClaudeCodeServerManager } from "./plugins/claude-code-server-manager";
import { CliHarnessServerManager } from "./plugins/cli-harness-server-manager";
import { PluginHarnessModelCatalog } from "./plugins/harness-model-catalog";
import { NativeToolMcpHostManager } from "./native-tool-mcp-host";

const currentDir = dirname(fileURLToPath(import.meta.url));
const activeRuns = new Map<string, ChildProcess>();
const activePluginRuns = new Map<string, ActivePluginHarnessRun>();
const runClosePromises = new Map<string, Promise<void>>();
const abortedRuns = new Set<string>();
const activeEngineSessions = new Map<string, string>();
const reservedEngineSessions = new Set<string>();
const deletingEngineSessions = new Set<string>();
const engineSessionByRun = new Map<string, string>();
const startingRuns = new Map<string, {
  projectId: string;
  cancelRequested: boolean;
  settled: Promise<void>;
  resolveSettled: () => void;
}>();
const runEventBuffer = new RunEventBuffer();
const artifactPreviewRuntime = new ArtifactPreviewRuntime();
const pluginNativeToolMcpHosts = new NativeToolMcpHostManager();
const criticalOperations = new Set<Promise<unknown>>();
let projectStore: ProjectDataRepository | null = null;
let settingsStore: SettingsRepository | null = null;
let mainWindow: BrowserWindow | null = null;
const credentialVault = new ElectronCredentialVault();
let skillRepository: SkillRepository | null = null;
let settingsService: SettingsService | null = null;
let searchSettingsService: SearchSettingsService | null = null;
let googleConnectionService: GoogleConnectionService | null = null;
let discordSettingsService: DiscordSettingsService | null = null;
let discordSessionStateRepository: JsonDocumentRepository<StoredDiscordSessionState> | null = null;
let projectService: ProjectService | null = null;
let pluginManager: PluginManager | null = null;
let pluginHarnessRunner: PluginHarnessRunner | null = null;
let openCodeServerManager: OpenCodeServerManager | null = null;
let claudeCodeServerManager: ClaudeCodeServerManager | null = null;
let cliHarnessServerManager: CliHarnessServerManager | null = null;
let pluginHarnessModelCatalog: PluginHarnessModelCatalog | null = null;
let pluginStateRepository: JsonDocumentRepository<StoredPluginState> | null = null;
let quitReady = false;
let isQuitting = false;
let shutdownPromise: Promise<void> | null = null;
let modelCatalogCache: { expiresAt: number; value: ModelCatalogProvider[] } | null = null;
let modelCatalogRequest: Promise<ModelCatalogProvider[]> | null = null;
let discordBridge: DiscordBridge | null = null;
let tray: Tray | null = null;
let codexLoginProcess: ChildProcess | null = null;
let codexLoginStatus: CodexAuthStatus = { status: "idle" };

if (process.env.KHADIM_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}

if (!app.isPackaged) {
  app.setPath("userData", `${app.getPath("userData")}-development`);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  quitReady = true;
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function dataPath(name: string): string {
  return join(app.getPath("userData"), name);
}

function storedSettings(): SettingsRepository {
  settingsStore ??= new FileSettingsRepository(dataPath("settings.json"), {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    workspace: app.getPath("documents"),
    harness: "assistant",
    theme: "aura",
  });
  return settingsStore;
}

async function getStoredSettings(): Promise<StoredSettings> {
  return storedSettings().snapshot();
}

function projects(): ProjectDataRepository {
  if (!projectStore) throw new Error("The local project store is not ready.");
  return projectStore;
}

function applicationSettings(): SettingsService {
  if (!settingsService) throw new Error("The settings application is not ready.");
  return settingsService;
}

function applicationSearchSettings(): SearchSettingsService {
  if (!searchSettingsService) throw new Error("The search settings application is not ready.");
  return searchSettingsService;
}

function applicationGoogleConnection(): GoogleConnectionService {
  if (!googleConnectionService) throw new Error("The Google connection application is not ready.");
  return googleConnectionService;
}

function applicationDiscordSettings(): DiscordSettingsService {
  if (!discordSettingsService) throw new Error("The Discord settings application is not ready.");
  return discordSettingsService;
}

function applicationProjects(): ProjectService {
  if (!projectService) throw new Error("The project application is not ready.");
  return projectService;
}

function skills(): SkillRepository {
  if (!skillRepository) throw new Error("The skill repository is not ready.");
  return skillRepository;
}

function plugins(): PluginManager {
  if (!pluginManager) throw new Error("The plugin system is not ready.");
  return pluginManager;
}

function pluginHarnesses(): PluginHarnessRunner {
  if (!pluginHarnessRunner) throw new Error("The plugin harness runtime is not ready.");
  return pluginHarnessRunner;
}

function trackCriticalOperation<T>(operation: () => Promise<T>): Promise<T> {
  let tracked!: Promise<T>;
  tracked = operation().finally(() => criticalOperations.delete(tracked));
  criticalOperations.add(tracked);
  return tracked;
}

async function initializeProjectContext(): Promise<Project> {
  let activeProject: Project | undefined;
  await storedSettings().mutate(async (settings) => {
    let available = await projects().listProjects();
    if (available.length === 0) {
      const fallbackPath = existsSync(settings.workspace) ? settings.workspace : app.getPath("documents");
      await projects().migrateLegacyWorkspace(fallbackPath);
      available = await projects().listProjects();
    }
    const availability = await Promise.all(available.map((project) => projects().checkProjectAvailability(project.id)));
    const usableProjects = availability.filter((entry) => entry.available).map((entry) => entry.project);
    let active = usableProjects.find((project) => project.id === settings.activeProjectId)
      ?? usableProjects.find((project) => project.rootPath === resolve(settings.workspace));
    active ??= usableProjects[0];
    if (!active && existsSync(settings.workspace)) active = await projects().addProject(settings.workspace);
    if (!active) active = await projects().addProject(app.getPath("documents"));
    if (!active) throw new Error("Khadim could not initialize a local project.");
    activeProject = active;
    return settings.activeProjectId === active.id && settings.workspace === active.rootPath
      ? settings
      : { ...settings, activeProjectId: active.id, workspace: active.rootPath };
  });
  if (!activeProject) throw new Error("Khadim could not initialize a local project.");
  return activeProject;
}

function skillDirectories(): string[] {
  const home = app.getPath("home");
  return [join(home, ".agents", "skills"), join(home, ".claude", "skills"), join(home, ".pi", "agent", "skills")];
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function capabilityPrompt(request: AgentRunRequest, enabledSkills: SkillEntry[]): string {
  const sections = [request.systemPrompt?.trim() ?? ""];
  if (request.enabledTools) {
    const toolLabels: Record<string, string> = { web: "web research", files: "workspace files", apps: "connected applications" };
    const enabled = request.enabledTools
      .filter((id) => !(request.artifactId && id === "files"))
      .map((id) => toolLabels[id])
      .filter(Boolean);
    if (request.artifactId) enabled.push("selected Studio artifact");
    sections.push(enabled.length > 0
      ? `Enabled tool groups: ${enabled.join(", ")}. Use only tools that belong to these enabled groups.`
      : "No optional tool groups are enabled. Do not call optional tools; answer using reasoning only.");
  }
  if (request.enabledTools?.includes("apps") && request.enabledApps) {
    const appLabels = { gmail: "Gmail", drive: "Google Drive", calendar: "Google Calendar" } as const;
    sections.push(request.enabledApps.length > 0
      ? `Connected app allowlist: ${request.enabledApps.map((id) => appLabels[id]).join(", ")}. Do not use connected applications outside this list.`
      : "Connected applications are enabled as a group, but this agent has no individual apps allowed. Do not call connected app tools.");
  }
  if (request.artifactId) {
    sections.push(`The selected Studio artifact is bound to this run as ${request.artifactId}. Inspect it with artifact_read and update that same record with artifact_edit; never create a replacement artifact. Artifact paths such as /src/App.tsx are virtual paths accepted only by those artifact tools. Project file read/write/edit tools are unavailable for this run.`);
  }
  if (enabledSkills.length > 0) {
    sections.push([
      "The following skills provide specialized instructions for specific tasks.",
      "When the project-files read tool is enabled, load a skill's file when the task matches its description.",
      "When a skill references a relative path, resolve it against the directory containing SKILL.md.",
      "<available_skills>",
      ...enabledSkills.flatMap((skill) => [
        "  <skill>",
        `    <name>${escapeXml(skill.name)}</name>`,
        `    <description>${escapeXml(skill.description)}</description>`,
        `    <location>${escapeXml(join(skill.dir, "SKILL.md"))}</location>`,
        "  </skill>",
      ]),
      "</available_skills>",
    ].join("\n"));
  }
  return sections.filter(Boolean).join("\n\n");
}

function publicSettings(settings: StoredSettings): AppSettings {
  return applicationSettings().toPublic(settings);
}

function decryptApiKey(settings: StoredSettings, modelId?: string): string | undefined {
  const storedModel = modelId
    ? settings.models?.find((model) => model.id === modelId)
    : settings.models?.find((model) => model.isActive);
  const encryptedApiKey = storedModel?.encryptedApiKey ?? (!modelId ? settings.encryptedApiKey : undefined);
  if (!encryptedApiKey) return undefined;
  const decrypted = credentialVault.decrypt(encryptedApiKey);
  return storedModel && decrypted ? decodeModelCredential(storedModel, decrypted)?.secret : decrypted;
}

async function storedDiscordSettings(): Promise<StoredDiscordSettings> {
  return applicationDiscordSettings().getStored();
}

function decryptDiscordToken(settings: StoredDiscordSettings): string | undefined {
  return applicationDiscordSettings().decryptToken(settings);
}

function publishDiscordStatus(settings: DiscordSettings): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("discord:status", settings);
  }
  if (tray) tray.setToolTip(settings.connected ? `Khadim - Discord connected as ${settings.botName ?? "bot"}` : "Khadim");
}

function resolveKhadimBinary(): string {
  const executable = process.platform === "win32" ? "khadim-cli.exe" : "khadim-cli";
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, "bin", executable)]
    : [
        process.env.KHADIM_BINARY,
        resolve(currentDir, "../../../khadim-cli/target/debug", executable),
        resolve(currentDir, "../../../khadim-cli/target/release", executable),
      ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find(existsSync);
  if (!found) {
    throw new Error("Khadim harness binary not found. Build apps/khadim-cli or set KHADIM_BINARY.");
  }
  return found;
}

async function runCliJson<T>(args: string[]): Promise<T> {
  return new Promise<T>((resolveResult, rejectResult) => {
    const child = spawn(resolveKhadimBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      rejectResult(new Error("The model catalog request timed out."));
    }, 20_000);
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 16 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });
    child.once("error", (cause) => finish(() => rejectResult(cause)));
    child.once("close", (code) => finish(() => {
      if (code !== 0) {
        rejectResult(new Error(stderr.trim() || "Khadim CLI could not load the model catalog."));
        return;
      }
      try {
        resolveResult(JSON.parse(stdout) as T);
      } catch {
        rejectResult(new Error("Khadim CLI returned an invalid model catalog."));
      }
    }));
  });
}

async function codexAuthConnected(): Promise<boolean> {
  if (codexLoginStatus.status === "connected") return true;
  const result = await runCliJson<{ connected: boolean }>([
    "login",
    "codex",
    "--status",
    "--json",
  ]);
  return result.connected === true;
}

async function startCodexLogin(): Promise<CodexAuthSession> {
  if (codexLoginProcess && codexLoginStatus.status === "pending" && codexLoginStatus.authUrl) {
    return { authUrl: codexLoginStatus.authUrl };
  }
  if (codexLoginProcess) {
    codexLoginProcess.kill("SIGTERM");
    codexLoginProcess = null;
  }
  codexLoginStatus = { status: "pending" };

  return new Promise<CodexAuthSession>((resolveSession, rejectSession) => {
    const child = spawn(
      resolveKhadimBinary(),
      ["login", "codex", "--json", "--no-open-browser"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    codexLoginProcess = child;
    let stderr = "";
    let sessionSettled = false;
    const timeout = setTimeout(() => {
      if (sessionSettled) return;
      sessionSettled = true;
      child.kill("SIGTERM");
      codexLoginStatus = { status: "failed", error: "Codex login did not start in time." };
      rejectSession(new Error(codexLoginStatus.error));
    }, 20_000);
    const lines = createInterface({ input: child.stdout! });

    lines.on("line", (line) => {
      let event: { event?: unknown; authUrl?: unknown };
      try {
        event = JSON.parse(line) as { event?: unknown; authUrl?: unknown };
      } catch {
        return;
      }
      if (event.event === "authorization" && typeof event.authUrl === "string") {
        try {
          const url = new URL(event.authUrl);
          if (url.protocol !== "https:") throw new Error("unsafe URL");
          codexLoginStatus = { status: "pending", authUrl: url.toString() };
          if (!sessionSettled) {
            sessionSettled = true;
            clearTimeout(timeout);
            resolveSession({ authUrl: url.toString() });
          }
        } catch {
          child.kill("SIGTERM");
          codexLoginStatus = { status: "failed", error: "Khadim CLI returned an invalid Codex authorization URL." };
        }
      } else if (event.event === "connected") {
        codexLoginStatus = { status: "connected" };
        modelCatalogCache = null;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });
    child.once("error", (cause) => {
      if (codexLoginProcess === child) codexLoginProcess = null;
      codexLoginStatus = { status: "failed", error: cause.message };
      if (!sessionSettled) {
        sessionSettled = true;
        clearTimeout(timeout);
        rejectSession(cause);
      }
    });
    child.once("close", (code) => {
      lines.close();
      if (codexLoginProcess === child) codexLoginProcess = null;
      if (code !== 0 && codexLoginStatus.status !== "connected") {
        codexLoginStatus = {
          status: "failed",
          error: stderr.trim() || "OpenAI Codex login failed.",
        };
      }
      if (!sessionSettled) {
        sessionSettled = true;
        clearTimeout(timeout);
        rejectSession(new Error(codexLoginStatus.error ?? "OpenAI Codex login stopped before authorization began."));
      }
    });
  });
}

async function loadModelCatalog(): Promise<ModelCatalogProvider[]> {
  if (modelCatalogCache && modelCatalogCache.expiresAt > Date.now()) return modelCatalogCache.value;
  if (modelCatalogRequest) return modelCatalogRequest;
  modelCatalogRequest = fetchModelCatalog().finally(() => { modelCatalogRequest = null; });
  return modelCatalogRequest;
}

async function fetchModelCatalog(): Promise<ModelCatalogProvider[]> {
  const providers = await runCliJson<ModelCatalogProvider[]>(["--providers", "catalog"]);
  if (!Array.isArray(providers) || providers.length > 500 || providers.some((provider) => (
    !provider
    || typeof provider.id !== "string"
    || !provider.id.trim()
    || provider.id.length > 128
    || typeof provider.name !== "string"
    || !provider.name.trim()
    || provider.name.length > 160
    || !Array.isArray(provider.models)
    || provider.models.length > 5_000
    || provider.models.some((model) => (
      !model
      || typeof model.id !== "string"
      || !model.id.trim()
      || model.id.length > 512
      || typeof model.name !== "string"
      || !model.name.trim()
      || model.name.length > 240
    ))
  ))) throw new Error("Khadim CLI returned an invalid model catalog.");
  const validatedProviders: ModelCatalogProvider[] = [];
  for (const provider of providers) {
    const baseUrl = (provider as { baseUrl?: unknown }).baseUrl;
    if (baseUrl === null) {
      delete provider.baseUrl;
    } else if (baseUrl !== undefined) {
      if (typeof baseUrl !== "string") throw new Error("Khadim CLI returned an invalid provider endpoint.");
      try {
        provider.baseUrl = safeModelBaseUrl(baseUrl, "Khadim CLI returned an unsafe provider endpoint.");
      } catch {
        continue;
      }
    }
    if (provider.apiKeyRequired !== undefined && typeof provider.apiKeyRequired !== "boolean") {
      throw new Error("Khadim CLI returned invalid provider authentication metadata.");
    }
    if (provider.available !== undefined && typeof provider.available !== "boolean") {
      throw new Error("Khadim CLI returned invalid provider availability metadata.");
    }
    validatedProviders.push(provider);
  }
  modelCatalogCache = { expiresAt: Date.now() + 10 * 60_000, value: validatedProviders };
  return validatedProviders;
}

async function syncCodexModels(activate: boolean): Promise<AppSettings> {
  modelCatalogCache = null;
  const catalog = await loadModelCatalog();
  const provider = catalog.find((candidate) => candidate.id === "openai-codex");
  if (!provider || provider.models.length === 0) {
    await storedSettings().mutate((current) => {
      const models = current.models.filter((model) => model.provider !== "openai-codex");
      if (models.length === current.models.length) return current;
      if (models.length === 0) return { ...current, provider: "", model: "", models };
      const preferred = models.find((model) => model.isActive)
        ?? models.find((model) => model.isDefault)
        ?? models[0];
      return {
        ...current,
        provider: preferred.provider,
        model: preferred.model,
        models: models.map((model) => ({ ...model, isActive: model.id === preferred.id })),
      };
    });
    throw new Error("OpenAI Codex model discovery failed; stale Codex models were removed.");
  }
  const next = await storedSettings().mutate((current) => {
    const existingCodex = new Map(
      current.models
        .filter((model) => model.provider === "openai-codex")
        .map((model) => [model.model, model]),
    );
    const nonCodex = current.models.filter((model) => model.provider !== "openai-codex");
    const hadActiveCodex = current.models.some((model) => model.provider === "openai-codex" && model.isActive);
    const shouldActivate = activate || hadActiveCodex;
    const codexModels = provider.models.map((model, index): StoredModelConfig => {
      const existing = existingCodex.get(model.id);
      return {
        id: existing?.id ?? `openai-codex:${model.id}`,
        name: model.name,
        provider: "openai-codex",
        model: model.id,
        baseUrl: provider.baseUrl,
        temperature: existing?.temperature ?? "0.2",
        isDefault: existing?.isDefault ?? false,
        isActive: shouldActivate && index === 0,
        encryptedApiKey: existing?.encryptedApiKey,
      };
    });
    let models = [...nonCodex, ...codexModels];
    if (shouldActivate) {
      const activeId = codexModels[0].id;
      models = models.map((model) => ({ ...model, isActive: model.id === activeId }));
    } else if (!models.some((model) => model.isActive)) {
      models[0] = { ...models[0], isActive: true };
    }
    if (!models.some((model) => model.isDefault)) {
      models[0] = { ...models[0], isDefault: true };
    }
    const activeModel = models.find((model) => model.isActive)!;
    return {
      ...current,
      provider: activeModel.provider,
      model: activeModel.model,
      models,
    };
  });
  return publicSettings(next);
}

async function deleteCliSession(engineSessionKey: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]{1,180}$/.test(engineSessionKey)) throw new Error("Invalid chat session key");
  await new Promise<void>((resolveDelete, rejectDelete) => {
    const child = spawn(resolveKhadimBinary(), ["--json", "--delete-session", engineSessionKey], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      rejectDelete(new Error("The saved chat context could not be deleted in time."));
    }, 10_000);
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });
    child.once("error", (cause) => finish(() => rejectDelete(cause)));
    child.once("close", (code) => finish(() => {
      if (code === 0) resolveDelete();
      else rejectDelete(new Error(stderr.trim() || `The saved chat context could not be deleted (exit ${code ?? "unknown"}).`));
    }));
  });
}

async function terminateRun(runId: string): Promise<void> {
  const starting = startingRuns.get(runId);
  if (starting) {
    abortedRuns.add(runId);
    starting.cancelRequested = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        starting.settled,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(
            "Khadim could not cancel startup before the shutdown deadline.",
          )), 7_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  const child = activeRuns.get(runId);
  const pluginRun = activePluginRuns.get(runId);
  if (pluginRun) {
    abortedRuns.add(runId);
    await pluginRun.abort();
    return;
  }
  if (!child) return;
  abortedRuns.add(runId);
  const closed = runClosePromises.get(runId);
  if (!closed) throw new Error("The running process has no close barrier.");
  await terminateProcessTree(child, closed);
}

async function answerRunQuestion(runId: string, requestId: string, answers: AgentQuestionAnswers): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid run ID");
  if (!requestId.trim() || requestId.length > 512) throw new Error("Invalid question request ID");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Invalid question answers");
  const normalized: AgentQuestionAnswers = {};
  for (const [questionId, values] of Object.entries(answers)) {
    if (!questionId.trim() || questionId.length > 512 || !Array.isArray(values) || values.length > 32) {
      throw new Error("Invalid question answers");
    }
    normalized[questionId] = values.map((value) => {
      if (typeof value !== "string" || value.length > 16_384) throw new Error("Invalid question answer");
      return value;
    });
  }
  const run = activePluginRuns.get(runId);
  if (!run) throw new Error("This question is no longer active.");
  await run.respondToQuestion(requestId, normalized);
  emitTo(runId, { event_type: "question", metadata: { requestId, resolved: true } });
}

async function answerRunApproval(runId: string, requestId: string, decision: AgentApprovalDecision): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid run ID");
  if (!requestId.trim() || requestId.length > 512) throw new Error("Invalid approval request ID");
  if (decision !== "accept" && decision !== "acceptForSession" && decision !== "decline" && decision !== "cancel") {
    throw new Error("Invalid approval decision");
  }
  const run = activePluginRuns.get(runId);
  if (!run) throw new Error("This approval is no longer active.");
  await run.respondToApproval(requestId, decision);
  emitTo(runId, { event_type: "approval", metadata: { requestId, decision, resolved: true } });
}

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed()) throw new Error("The app window is no longer available.");
  return owner;
}

function emitTo(runId: string, event: AgentStreamEvent): void {
  const sequence = runEventBuffer.append(runId, event);
  if (event.event_type === "done" || event.event_type === "error") runEventBuffer.markTerminal(runId);
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("agent:event", { runId, sequence, event });
  }
  discordBridge?.handleAgentEvent({ runId, sequence, event });
}

async function startAgent(request: AgentRunRequest): Promise<{ runId: string }> {
  if (isQuitting) throw new Error("Khadim is shutting down and cannot start another run.");
  if (!request.prompt.trim()) throw new Error("Prompt is required");
  if (!/^[a-zA-Z0-9._-]{1,180}$/.test(request.engineSessionKey)) throw new Error("Invalid chat session key");
  const runId = request.runId;
  if (!/^[0-9a-f-]{36}$/i.test(runId) || activeRuns.has(runId) || activePluginRuns.has(runId) || startingRuns.has(runId)) throw new Error("Invalid or duplicate run ID");
  if (applicationProjects().isMutating(request.projectId)) throw new Error("This project is being changed. Try the run again when it finishes.");
  if (deletingEngineSessions.has(request.engineSessionKey)) throw new Error("This chat is being deleted.");
  if (activeEngineSessions.has(request.engineSessionKey) || reservedEngineSessions.has(request.engineSessionKey)) {
    throw new Error("This chat already has a run in progress.");
  }
  let resolveSettled!: () => void;
  const starting = {
    projectId: request.projectId,
    cancelRequested: false,
    settled: new Promise<void>((resolve) => { resolveSettled = resolve; }),
    resolveSettled: () => resolveSettled(),
  };
  startingRuns.set(runId, starting);
  reservedEngineSessions.add(request.engineSessionKey);

  try {
    const project = await projects().getProject(request.projectId);
    const conversation = (await projects().listConversations(project.id)).find((candidate) => candidate.id === request.conversationId);
    if (!conversation || conversation.engineSessionKey !== request.engineSessionKey) throw new Error("The chat no longer belongs to this project.");
    const assistantMessage = conversation.messages.find((message) => message.id === request.assistantMessageId);
    if (!assistantMessage || assistantMessage.runId !== request.runId || assistantMessage.role !== "assistant") {
      throw new Error("The chat run could not be verified.");
    }
    const run = conversation.runs?.find((candidate) => candidate.id === request.runId);
    if (!run
      || run.projectId !== project.id
      || run.conversationId !== conversation.id
      || run.assistantMessageId !== assistantMessage.id
      || run.status !== "running") {
      throw new Error("The saved run configuration could not be verified.");
    }
    const artifactId = request.artifactId?.trim();
    if ((request.artifactId !== undefined && !artifactId) || run.artifactId !== artifactId) {
      throw new Error("The selected artifact binding could not be verified.");
    }
    if (artifactId) {
      const artifact = (await projects().listArtifacts(project.id)).find((candidate) => candidate.id === artifactId && !candidate.deletedAt);
      if (!artifact) throw new Error("The selected artifact is no longer available.");
    }
    if (!existsSync(project.rootPath)) throw new Error("The project's local folder is no longer available.");

    const finishCancelledStart = (): boolean => {
      if (!starting.cancelRequested) return false;
      runEventBuffer.register({
        runId,
        projectId: project.id,
        conversationId: conversation.id,
        assistantMessageId: assistantMessage.id,
        engineSessionKey: request.engineSessionKey,
      });
      emitTo(runId, { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } });
      abortedRuns.delete(runId);
      return true;
    };
    if (finishCancelledStart()) return { runId };

    const nativeTools: NativeTool[] = [];
    if (run.enabledTools.includes("apps")) {
      const allowedApps = new Set(run.enabledApps ?? ["gmail", "drive", "calendar"]);
      if (allowedApps.size > 0) {
        const google = await applicationGoogleConnection().get();
        if (!google.connected) throw new Error("Connect Google Workspace in Apps before enabling connected applications.");
        if (allowedApps.has("gmail") && googleWorkspaceServiceEnabled(google.scopes, "gmail")) nativeTools.push(...createGmailNativeTools(applicationGoogleConnection()));
        if (allowedApps.has("drive") && googleWorkspaceServiceEnabled(google.scopes, "drive")) nativeTools.push(...createGoogleDriveNativeTools(applicationGoogleConnection()));
        if (allowedApps.has("calendar") && googleWorkspaceServiceEnabled(google.scopes, "calendar")) nativeTools.push(...createGoogleCalendarNativeTools(applicationGoogleConnection()));
        if (nativeTools.length === 0) throw new Error("Update Google Workspace access in Apps before using this agent's connected applications.");
      }
    }
    if (artifactId) nativeTools.push(...await createArtifactAgentTools(projects(), { projectId: project.id, artifactId }));
    if (finishCancelledStart()) return { runId };

    if (isPluginHarnessId(run.harness)) {
      const enabledSkills = (await skills().discover()).filter((skill) => skill.enabled);
      if (finishCancelledStart()) return { runId };
      const nativeToolMcp = await pluginNativeToolMcpHosts.prepare(request.engineSessionKey, nativeTools);
      if (finishCancelledStart()) {
        await pluginNativeToolMcpHosts.clear(request.engineSessionKey);
        return { runId };
      }
      const systemPrompt = capabilityPrompt(
        { ...request, systemPrompt: run.agent.systemPrompt, enabledTools: run.enabledTools, enabledApps: run.enabledApps },
        enabledSkills,
      );
      runEventBuffer.register({
        runId,
        projectId: project.id,
        conversationId: conversation.id,
        assistantMessageId: assistantMessage.id,
        engineSessionKey: request.engineSessionKey,
      });
      const handle = pluginHarnesses().start({
        harnessId: run.harness as PluginHarnessId,
        projectPath: project.rootPath,
        engineSessionKey: request.engineSessionKey,
        prompt: request.prompt.trim(),
        systemPrompt: systemPrompt || undefined,
        model: { provider: run.model.provider, model: run.model.model },
        runtimeMode: run.runtimeMode ?? "approval-required",
        interactionMode: run.interactionMode,
        nativeToolMcp,
      }, (event) => emitTo(runId, event));
      const closed = handle.closed.finally(() => pluginNativeToolMcpHosts.clear(request.engineSessionKey));
      const managedHandle: ActivePluginHarnessRun = {
        ...handle,
        closed,
        abort: async () => {
          await handle.abort();
          await closed;
        },
      };
      activePluginRuns.set(runId, managedHandle);
      runClosePromises.set(runId, closed);
      activeEngineSessions.set(request.engineSessionKey, runId);
      engineSessionByRun.set(runId, request.engineSessionKey);
      void closed.finally(() => {
        activePluginRuns.delete(runId);
        runClosePromises.delete(runId);
        activeEngineSessions.delete(request.engineSessionKey);
        engineSessionByRun.delete(runId);
        abortedRuns.delete(runId);
      });
      return { runId };
    }

    const args = [
      "--json",
      ...credentialPolicyArgs(),
      ...processSupervisionArgs(),
      "--cwd", project.rootPath,
      "--provider", run.model.provider,
      "--model", run.model.model,
      "--harness", run.harness,
      "--session", request.engineSessionKey,
      ...executionPolicyArgs(run, { artifactTools: Boolean(artifactId) }),
    ];
    const enabledSkills = (await skills().discover()).filter((skill) => skill.enabled);
    if (finishCancelledStart()) return { runId };
    args.push(...skillRuntimeArgs(enabledSkills));
    const systemPrompt = capabilityPrompt(
      { ...request, systemPrompt: run.agent.systemPrompt, enabledTools: run.enabledTools, enabledApps: run.enabledApps },
      enabledSkills,
    );
    const search = run.enabledTools.includes("web") ? await applicationSearchSettings().runConfiguration() : null;
    if (search) args.push("--search-provider", search.provider);
    // Prompt bodies, attachment text, and enabled-skill context can all exceed
    // platform argv limits. The CLI reads this exact request envelope from stdin.
    args.push("--request-stdin");

    // Take this serialized snapshot at the last async boundary before spawn.
    // A credential edit that completed during project/skill discovery must be
    // reflected here, and no later await may reintroduce a time-of-check race.
    const settings = await getStoredSettings();
    if (finishCancelledStart()) return { runId };
    const storedRunModel = settings.models.find((model) => model.id === run.model.id);
    if (!storedRunModel || !hasSameCredentialScope(storedRunModel, run.model)) {
      throw new Error("This model changed after the run was prepared. Retry with the current model settings.");
    }
    const apiKey = decryptApiKey(settings, run.model.id);
    if (storedRunModel?.encryptedApiKey && !apiKey) {
      throw new Error("The saved credential for this model could not be unlocked. Re-enter it in Settings and try again.");
    }
    const env = buildRunEnvironment(process.env, run.model.provider, apiKey, run.model.baseUrl);
    if (search) Object.assign(env, search.env);
    let nativeToolHost: NativeToolHost | null = nativeTools.length > 0 ? await createNativeToolHost(nativeTools) : null;
    if (nativeToolHost) Object.assign(env, nativeToolHost.env);

    runEventBuffer.register({
      runId,
      projectId: project.id,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      engineSessionKey: request.engineSessionKey,
    });
    if (search?.warning) {
      emitTo(runId, {
        event_type: "step_complete",
        content: search.warning,
        metadata: {
          id: `search-config-${runId}`,
          tool: "web_search",
          title: "Web search fell back to DuckDuckGo",
          degraded: true,
          result: search.warning,
        },
      });
    }
    let child: ChildProcessByStdio<Writable, Readable, Readable>;
    try {
      child = spawn(resolveKhadimBinary(), args, {
        // Keep the sidecar's real OS cwd aligned with the validated project.
        // Some native/RPA helpers and child commands resolve relative paths
        // independently of the CLI's logical `--cwd` argument.
        cwd: project.rootPath,
        detached: process.platform !== "win32",
        env,
        // fd 3 is deliberately kept open and unwritten. The CLI treats EOF as
        // proof that Electron died and tears down its entire owned process tree.
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      });
      const parentWatchPipe = child.stdio[3];
      if (!parentWatchPipe) {
        child.kill("SIGKILL");
        throw new Error("The Khadim harness could not create its lifecycle supervision pipe.");
      }
      parentWatchPipe.on("error", () => {
        // Child exit closes its endpoint; the process close event is the run's
        // authoritative terminal barrier.
      });
    } catch (cause) {
      await nativeToolHost?.close();
      const message = cause instanceof Error ? cause.message : "The Khadim harness could not be started.";
      emitTo(runId, { event_type: "error", content: message });
      throw cause;
    }
    child.stdin.on("error", () => {
      // Parser/startup failures are reported through stderr and the close event.
    });
    child.stdin.end(JSON.stringify({
      prompt: request.prompt.trim(),
      ...(systemPrompt ? { systemPrompt } : {}),
    }));
    activeRuns.set(runId, child);
    let resolveRunClosed!: () => void;
    runClosePromises.set(runId, new Promise<void>((resolve) => { resolveRunClosed = resolve; }));
    activeEngineSessions.set(request.engineSessionKey, runId);
    engineSessionByRun.set(runId, request.engineSessionKey);
    let stderr = "";
    let pendingTerminalEvent: AgentStreamEvent | null = null;

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 256 * 1024) stderr = stderr.slice(-256 * 1024);
    });

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as AgentStreamEvent;
        if (event.event_type === "done" || event.event_type === "error") {
          pendingTerminalEvent ??= event;
        } else if (!pendingTerminalEvent) {
          emitTo(runId, event);
        }
      } catch {
        // The harness may print diagnostics; only JSONL is part of the IPC contract.
      }
    });

    child.on("error", (error) => {
      pendingTerminalEvent ??= { event_type: "error", content: error.message };
    });
    child.on("close", (code) => {
      activeRuns.delete(runId);
      activeEngineSessions.delete(request.engineSessionKey);
      engineSessionByRun.delete(runId);
      const aborted = abortedRuns.has(runId);
      const event = aborted
        ? { event_type: "error" as const, content: "Run stopped.", metadata: { reason: "aborted" } }
        : pendingTerminalEvent?.event_type === "error"
          ? pendingTerminalEvent
          : pendingTerminalEvent?.event_type === "done" && code === 0
            ? pendingTerminalEvent
            : code === 0
              ? { event_type: "done" as const, content: pendingTerminalEvent?.content || "Run completed." }
              : { event_type: "error" as const, content: stderr.trim() || `Khadim exited with code ${code ?? "unknown"}` };
      try {
        emitTo(runId, event);
      } finally {
        abortedRuns.delete(runId);
        runClosePromises.delete(runId);
        if (nativeToolHost) void nativeToolHost.close().finally(resolveRunClosed);
        else resolveRunClosed();
      }
    });
    return { runId };
  } finally {
    startingRuns.delete(runId);
    starting.resolveSettled();
    reservedEngineSessions.delete(request.engineSessionKey);
    if (!activeRuns.has(runId) && !activePluginRuns.has(runId)) abortedRuns.delete(runId);
  }
}

function createWindow(): BrowserWindow {
  const auditWidth = Math.max(560, Number.parseInt(process.env.KHADIM_AUDIT_WIDTH ?? "1320", 10) || 1320);
  const auditHeight = Math.max(620, Number.parseInt(process.env.KHADIM_AUDIT_HEIGHT ?? "860", 10) || 860);
  const window = new BrowserWindow({
    width: process.env.KHADIM_HEADLESS_AUDIT === "1" ? auditWidth : 1320,
    height: process.env.KHADIM_HEADLESS_AUDIT === "1" ? auditHeight : 860,
    // Keep the 841px navigation drawer and sub-760px touch layout reachable.
    minWidth: 560,
    minHeight: 620,
    show: process.env.KHADIM_HEADLESS_AUDIT !== "1",
    frame: process.platform === "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...liquidGlassWindowOptions(),
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : resolve(currentDir, "../../resources/icon.png"),
    webPreferences: {
      preload: join(currentDir, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.platform === "darwin") window.setWindowButtonVisibility(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow = window;
  window.once("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.on("close", (event) => {
    handleWindowClose(event, quitReady || isQuitting, () => app.quit());
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else window.loadFile(join(currentDir, "../renderer/index.html"));
  window.webContents.once("did-finish-load", () => {
    void installLiquidGlass(window).then((installed) => {
      if (!installed || window.isDestroyed()) return;
      void window.webContents.executeJavaScript("document.documentElement.dataset.liquidGlass = 'true'");
    });
  });
  const auditScreenshot = process.env.KHADIM_AUDIT_SCREENSHOT;
  if (process.env.KHADIM_HEADLESS_AUDIT === "1" && auditScreenshot) {
    window.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        // Hidden Wayland windows may never produce a composited frame. Showing
        // the isolated audit window without activating it makes capturePage
        // deterministic while leaving normal application startup unchanged.
        if (!window.isVisible()) window.showInactive();
        window.webContents.invalidate();
        // did-finish-load fires before React has necessarily committed the
        // navigation controls. Give the renderer one frame budget plus its
        // persisted-state hydration before driving the audit route.
        await new Promise((resolveCapture) => setTimeout(resolveCapture, 750));
        const theme = process.env.KHADIM_AUDIT_THEME;
        if (theme === "light" || theme === "dark") {
          await window.webContents.executeJavaScript(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
        }
        const view = process.env.KHADIM_AUDIT_VIEW;
        if (view) {
          await window.webContents.executeJavaScript(`(() => {
            const label = ${JSON.stringify(view)};
            const target = document.querySelector(\`button[title="\${CSS.escape(label)}"]\`) ?? Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim().startsWith(label));
            target?.click();
          })()`);
          await new Promise((resolveCapture) => setTimeout(resolveCapture, 1_000));
        }
        const auditClick = process.env.KHADIM_AUDIT_CLICK;
        if (auditClick) {
          await window.webContents.executeJavaScript(`(() => {
            const label = ${JSON.stringify(auditClick)};
            const target = Array.from(document.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label);
            target?.scrollIntoView({ block: "center" });
            target?.click();
          })()`);
          await new Promise((resolveCapture) => setTimeout(resolveCapture, 500));
        }
        const artifactKind = process.env.KHADIM_AUDIT_ARTIFACT_KIND;
        if (artifactKind) {
          let opened = await window.webContents.executeJavaScript(`(() => {
            const target = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === ${JSON.stringify(artifactKind)});
            target?.click();
            return Boolean(target);
          })()`);
          if (!opened) {
            await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim().startsWith("Create artifact"))?.click()`);
            await new Promise((resolveCapture) => setTimeout(resolveCapture, 200));
            opened = await window.webContents.executeJavaScript(`(() => {
              const target = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim().startsWith(${JSON.stringify(artifactKind)}));
              target?.click();
              return Boolean(target);
            })()`);
          }
          if (opened) await new Promise((resolveCapture) => setTimeout(resolveCapture, 1_500));
        }
        if (theme === "light" || theme === "dark") {
          await window.webContents.executeJavaScript(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
        }
        window.webContents.invalidate();
        await new Promise((resolveCapture) => setTimeout(resolveCapture, 250));
        const image = await window.webContents.capturePage();
        await writeFile(auditScreenshot, image.toPNG());
        app.exit(0);
      }, 250);
    });
  }
  return window;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const icon = app.isPackaged ? join(process.resourcesPath, "icon.png") : resolve(currentDir, "../../resources/icon.png");
  tray = new Tray(icon);
  tray.setToolTip("Khadim");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Khadim", click: showMainWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("click", showMainWindow);
}

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  projectStore = new FileProjectRepository(app.getPath("userData"));
  skillRepository = new FilesystemSkillRepository(
    skillDirectories,
    new JsonDocumentRepository(dataPath("skills.json"), () => ({}), (value) => (
      value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, boolean> : {}
    )),
  );
  searchSettingsService = new SearchSettingsService(
    new JsonDocumentRepository<StoredSearchSettings>(
      dataPath("search-settings.json"),
      () => ({ activeProvider: "duckduckgo", encryptedApiKeys: {} }),
      normalizeStoredSearchSettings,
    ),
    credentialVault,
  );
  googleConnectionService = new GoogleConnectionService(
    new JsonDocumentRepository<StoredGoogleConnection>(
      dataPath("google-connection.json"),
      () => normalizeStoredGoogleConnection(null),
      normalizeStoredGoogleConnection,
    ),
    credentialVault,
    new GoogleOAuthClient(
      process.env.KHADIM_GOOGLE_CLIENT_ID ?? "",
      (url) => shell.openExternal(url),
      fetch,
      process.env.KHADIM_GOOGLE_CLIENT_SECRET ?? "",
    ),
  );
  settingsService = new SettingsService({
    settings: storedSettings(),
    projects: projectStore,
    credentials: credentialVault,
    ensureProjectContext: initializeProjectContext,
    normalizeUpdate: normalizeSettingsUpdate,
  });
  discordSettingsService = new DiscordSettingsService(
    new JsonDocumentRepository<StoredDiscordSettings>(
      dataPath("discord-settings.json"),
      () => normalizeStoredDiscordSettings(null),
      normalizeStoredDiscordSettings,
    ),
    projectStore,
    credentialVault,
    () => discordBridge,
  );
  discordSessionStateRepository = new JsonDocumentRepository<StoredDiscordSessionState>(
    dataPath("discord-session-state.json"),
    () => normalizeDiscordSessionState(null),
    normalizeDiscordSessionState,
  );
  projectService = new ProjectService({
    projects: projectStore,
    settings: storedSettings(),
    runs: {
      hasActiveRun: (projectId) => Array.from(startingRuns.values()).some((run) => run.projectId === projectId)
        || runEventBuffer.listRecoverable().some((run) => run.projectId === projectId && !run.terminal),
      terminalRunIds: (projectId) => runEventBuffer.listRecoverable()
        .filter((run) => run.projectId === projectId && run.terminal)
        .map((run) => run.runId),
      acknowledge: (runId) => runEventBuffer.acknowledge(runId),
    },
    defaultProjectPath: () => app.getPath("documents"),
    isQuitting: () => isQuitting,
    trackCriticalOperation,
  });
  pluginStateRepository = new JsonDocumentRepository<StoredPluginState>(
    dataPath("plugins.json"),
    () => normalizePluginState(null),
    normalizePluginState,
  );
  pluginManager = new PluginManager(
    dataPath("plugins"),
    app.isPackaged ? join(process.resourcesPath, "plugins") : resolve(currentDir, "../../plugins/builtin"),
    pluginStateRepository,
    credentialVault,
    new WasmPluginRuntime(currentDir),
  );
  openCodeServerManager = new OpenCodeServerManager();
  claudeCodeServerManager = new ClaudeCodeServerManager();
  cliHarnessServerManager = new CliHarnessServerManager();
  pluginHarnessModelCatalog = new PluginHarnessModelCatalog(pluginManager);
  pluginHarnessRunner = new PluginHarnessRunner(pluginManager, [openCodeServerManager, claudeCodeServerManager, cliHarnessServerManager]);
  await pluginManager.discover();
  await initializeProjectContext();
  createWindow();
  createTray();
  discordBridge = new DiscordBridge({
    getConfig: storedDiscordSettings,
    getToken: decryptDiscordToken,
    loadSessionState: () => discordSessionStateRepository!.read(),
    saveSessionState: (state) => discordSessionStateRepository!.write(state),
    listProjects: () => projects().listProjects(),
    getProject: (projectId) => projects().getProject(projectId),
    getAppSettings: async () => publicSettings(await getStoredSettings()),
    listConversations: (projectId) => projects().listConversations(projectId),
    saveConversation: (conversation) => projects().saveConversation(conversation),
    startAgent,
    stopAgent: terminateRun,
    acknowledgeRun: (runId) => runEventBuffer.acknowledge(runId),
    publishStatus: publishDiscordStatus,
  });
  void discordBridge.start().catch((cause: unknown) => {
    console.error("Could not initialize Discord", cause);
  });
  const projectActivation = createProjectActivationOperations({
    store: projects(),
    settings: storedSettings(),
    isQuitting: () => isQuitting,
    trackCriticalOperation,
  });
  ipcMain.handle("agent:start", (_event, request: AgentRunRequest) => startAgent(request));
  ipcMain.handle("agent:abort", (_event, runId: string) => terminateRun(runId));
  ipcMain.handle("agent:answer-question", (_event, runId: string, requestId: string, answers: AgentQuestionAnswers) => answerRunQuestion(runId, requestId, answers));
  ipcMain.handle("agent:answer-approval", (_event, runId: string, requestId: string, decision: AgentApprovalDecision) => answerRunApproval(runId, requestId, decision));
  ipcMain.handle("agent:recover", () => runEventBuffer.listRecoverable());
  ipcMain.handle("agent:acknowledge", (_event, runId: string) => {
    runEventBuffer.acknowledge(runId);
  });
  ipcMain.handle("projects:list", () => projects().listProjects());
  ipcMain.handle("projects:add", (_event, rootPath: string) => projectActivation.add(rootPath));
  ipcMain.handle("projects:open", (_event, projectId: string) => projectActivation.open(projectId));
  ipcMain.handle("projects:check-availability", (_event, projectId: string) => projects().checkProjectAvailability(projectId));
  ipcMain.handle("projects:rename", (_event, projectId: string, name: string) => projects().renameProject(projectId, name));
  ipcMain.handle("projects:relocate", async (_event, projectId: string, rootPath: string) => {
    const conversations = await projects().listConversations(projectId);
    const result = await applicationProjects().relocate(projectId, rootPath);
    await Promise.all(conversations.flatMap(({ engineSessionKey }) => [
      openCodeServerManager?.stop(engineSessionKey),
      claudeCodeServerManager?.stop(engineSessionKey),
      cliHarnessServerManager?.stop(engineSessionKey),
      pluginNativeToolMcpHosts.stop(engineSessionKey),
    ]));
    return result;
  });
  ipcMain.handle("projects:remove", async (_event, projectId: string) => {
    const conversations = await projects().listConversations(projectId);
    const result = await applicationProjects().remove(projectId);
    await Promise.all(conversations.flatMap(({ engineSessionKey }) => [
      openCodeServerManager?.stop(engineSessionKey),
      claudeCodeServerManager?.stop(engineSessionKey),
      cliHarnessServerManager?.stop(engineSessionKey),
      pluginNativeToolMcpHosts.stop(engineSessionKey),
    ]));
    return result;
  });
  ipcMain.handle("projects:choose-directory", async (event) => {
    const result = await dialog.showOpenDialog(ownerWindow(event), { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("conversations:list", (_event, projectId: string) => projects().listConversations(projectId));
  ipcMain.handle("conversations:save", (_event, conversation) => projects().saveConversation(conversation));
  ipcMain.handle("conversations:remove", (_event, projectId: string, id: string) => trackCriticalOperation(async () => {
    if (isQuitting) throw new Error("Khadim is shutting down and cannot delete a chat.");
    const conversation = (await projects().listConversations(projectId)).find((candidate) => candidate.id === id);
    if (!conversation) throw new Error("The chat no longer exists.");
    const engineSessionKey = conversation.engineSessionKey;
    const bufferedRuns = runEventBuffer.listRecoverable().filter((run) => (
      run.projectId === projectId && run.conversationId === id
    ));
    if (bufferedRuns.some((run) => !run.terminal)) {
      throw new Error("Stop this chat's active run before deleting it.");
    }
    if (activeEngineSessions.has(engineSessionKey) || reservedEngineSessions.has(engineSessionKey)) {
      throw new Error("Stop this chat's active run before deleting it.");
    }
    if (deletingEngineSessions.has(engineSessionKey)) throw new Error("This chat is already being deleted.");
    deletingEngineSessions.add(engineSessionKey);
    try {
      if (activeEngineSessions.has(engineSessionKey) || reservedEngineSessions.has(engineSessionKey)) {
        throw new Error("Stop this chat's active run before deleting it.");
      }
      await deleteCliSession(engineSessionKey);
      await openCodeServerManager?.stop(engineSessionKey);
      await claudeCodeServerManager?.stop(engineSessionKey);
      await cliHarnessServerManager?.stop(engineSessionKey);
      await pluginNativeToolMcpHosts.stop(engineSessionKey);
      await projects().removeConversation(projectId, id);
      for (const run of bufferedRuns) runEventBuffer.acknowledge(run.runId);
    } finally {
      deletingEngineSessions.delete(engineSessionKey);
    }
  }));
  ipcMain.handle("conversations:export-markdown", async (_event, suggestedName: string, markdown: string) => {
    if (typeof suggestedName !== "string" || typeof markdown !== "string" || markdown.length > 20_000_000) throw new Error("Invalid conversation export");
    const safeName = suggestedName.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 120) || "khadim-conversation";
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${safeName}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, markdown, "utf8");
    return result.filePath;
  });
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:config-directory", () => app.getPath("userData"));
  ipcMain.handle("artifacts:list", (_event, projectId: string) => projects().listArtifacts(projectId));
  ipcMain.handle("artifacts:save", (_event, projectId: string, drafts) => projects().saveArtifacts(projectId, drafts));
  ipcMain.handle("artifacts:preview", (_event, request: ArtifactPreviewRequest) => artifactPreviewRuntime.start(request));
  ipcMain.handle("artifacts:stop-preview", (_event, projectId: string, artifactId: string) => artifactPreviewRuntime.stop(projectId, artifactId));
  ipcMain.handle("artifacts:export-pdf", async (event, projectId: string, artifactId: string) => {
    if (typeof projectId !== "string" || typeof artifactId !== "string" || !projectId || !artifactId) throw new Error("Invalid artifact export request.");
    const artifact = (await projects().listArtifacts(projectId)).find((candidate) => candidate.id === artifactId && !candidate.deletedAt);
    if (!artifact) throw new Error("The artifact is no longer available.");
    const owner = ownerWindow(event);
    const safeName = artifact.title.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "khadim-artifact";
    const destination = await dialog.showSaveDialog(owner, {
      title: "Export artifact as PDF",
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (destination.canceled || !destination.filePath) return { canceled: true };

    const printWindow = new BrowserWindow({
      show: false,
      parent: owner,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: `artifact-pdf-${artifact.id}-${Date.now()}`,
      },
    });
    printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    printWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    try {
      const html = renderArtifactForPdf(artifact);
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        landscape: artifact.kind === "canvas",
      });
      await writeFile(destination.filePath, pdf);
      return { canceled: false, filePath: destination.filePath };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  });
  ipcMain.handle("settings:get", () => applicationSettings().get());
  ipcMain.handle("settings:save", (_event, update: SettingsUpdate) => applicationSettings().save(update));
  ipcMain.handle("settings:choose-workspace", async (event) => {
    const result = await dialog.showOpenDialog(ownerWindow(event), { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("models:catalog", (_event, refresh = false) => {
    if (refresh === true) modelCatalogCache = null;
    return loadModelCatalog();
  });
  ipcMain.handle("models:sync-codex", (_event, activate: boolean) => {
    if (typeof activate !== "boolean") throw new Error("Invalid Codex activation state.");
    return syncCodexModels(activate);
  });
  ipcMain.handle("auth:codex-connected", () => codexAuthConnected());
  ipcMain.handle("auth:codex-start", () => startCodexLogin());
  ipcMain.handle("auth:codex-status", () => codexLoginStatus);
  ipcMain.handle("search:get", () => applicationSearchSettings().get());
  ipcMain.handle("search:save", (_event, update) => applicationSearchSettings().save(update));
  ipcMain.handle("google:get", () => applicationGoogleConnection().get());
  ipcMain.handle("google:connect", (_event, request?: GoogleConnectRequest) => applicationGoogleConnection().connect(request));
  ipcMain.handle("google:disconnect", () => applicationGoogleConnection().disconnect());
  ipcMain.handle("discord:get", () => applicationDiscordSettings().get());
  ipcMain.handle("discord:save", (_event, update: DiscordSettingsUpdate) => applicationDiscordSettings().save(update));
  ipcMain.handle("discord:disconnect", () => applicationDiscordSettings().disconnect());
  ipcMain.handle("skills:discover", () => skills().discover());
  ipcMain.handle("skills:toggle", (_event, skillId: string, enabled: boolean) => skills().setEnabled(skillId, enabled));
  ipcMain.handle("plugins:list", () => plugins().list());
  ipcMain.handle("plugins:harnesses", () => plugins().harnesses());
  ipcMain.handle("plugins:models", (_event, harnessId: PluginHarnessId, projectPath: string) => {
    if (!isPluginHarnessId(harnessId)) throw new Error("Invalid plugin harness id.");
    if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("A project path is required for model discovery.");
    if (!pluginHarnessModelCatalog) throw new Error("Plugin model discovery is not ready.");
    return pluginHarnessModelCatalog.models(harnessId, projectPath);
  });
  ipcMain.handle("plugins:modes", (_event, harnessId: PluginHarnessId, projectPath: string) => {
    if (!isPluginHarnessId(harnessId)) throw new Error("Invalid plugin harness id.");
    if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("A project path is required for mode discovery.");
    if (!pluginHarnessModelCatalog) throw new Error("Plugin mode discovery is not ready.");
    return pluginHarnessModelCatalog.modes(harnessId, projectPath);
  });
  ipcMain.handle("plugins:commands", (_event, harnessId: PluginHarnessId, projectPath: string) => {
    if (!isPluginHarnessId(harnessId)) throw new Error("Invalid plugin harness id.");
    if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("A project path is required for command discovery.");
    if (!pluginHarnessModelCatalog) throw new Error("Plugin command discovery is not ready.");
    return pluginHarnessModelCatalog.commands(harnessId, projectPath);
  });
  ipcMain.handle("plugins:refresh-catalog", (_event, harnessId: PluginHarnessId, projectPath: string) => {
    if (!isPluginHarnessId(harnessId)) throw new Error("Invalid plugin harness id.");
    if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("A project path is required for catalog discovery.");
    if (!pluginHarnessModelCatalog) throw new Error("Plugin catalog discovery is not ready.");
    return pluginHarnessModelCatalog.refresh(harnessId, projectPath);
  });
  ipcMain.handle("plugins:choose-and-install", async (event) => {
    const result = await dialog.showOpenDialog(ownerWindow(event), { properties: ["openDirectory"], title: "Install Khadim plugin" });
    return result.canceled || !result.filePaths[0] ? null : plugins().install(result.filePaths[0]);
  });
  ipcMain.handle("plugins:set-enabled", (_event, pluginId: string, enabled: boolean) => {
    if (typeof enabled !== "boolean") throw new Error("Invalid plugin enabled state.");
    return plugins().setEnabled(pluginId, enabled);
  });
  ipcMain.handle("plugins:configure", (_event, pluginId: string, update: PluginConfigUpdate) => plugins().configure(pluginId, update));
  ipcMain.handle("plugins:uninstall", (_event, pluginId: string) => plugins().uninstall(pluginId));
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsupported URL protocol");
    await shell.openExternal(parsed.toString());
  });
  ipcMain.handle("window:minimize", (event) => ownerWindow(event).minimize());
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = ownerWindow(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", (event) => ownerWindow(event).close());

  app.on("activate", () => {
    showMainWindow();
  });
}).catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  dialog.showErrorBox("Khadim could not start", message);
  quitReady = true;
  app.quit();
});

async function waitForTerminalAcknowledgements(runIds: Set<string>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!runEventBuffer.hasAny(runIds)) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
}

async function waitForCriticalOperations(timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (criticalOperations.size > 0 && Date.now() < deadline) {
    const remaining = Math.max(0, deadline - Date.now());
    await Promise.race([
      Promise.allSettled([...criticalOperations]),
      new Promise<void>((resolveWait) => setTimeout(resolveWait, remaining)),
    ]);
  }
}

async function persistUnacknowledgedRuns(runIds: Set<string>): Promise<void> {
  const snapshots = runEventBuffer.listRecoverable().filter((snapshot) => runIds.has(snapshot.runId));
  for (const snapshot of snapshots) {
    try {
      const conversation = (await projects().listConversations(snapshot.projectId))
        .find((candidate) => candidate.id === snapshot.conversationId);
      if (conversation) {
        const recovered = applyShutdownRecovery(conversation, snapshot, new Date().toISOString());
        if (recovered) await projects().saveConversation(recovered);
      }
      if (snapshot.terminal) runEventBuffer.acknowledge(snapshot.runId);
    } catch (cause) {
      // Keep shutdown bounded. Atomic project writes have already preserved the
      // previous record; startup reconciliation will mark any survivor stopped.
      console.error("Could not persist shutdown run recovery", cause);
    }
  }
}

async function drainForShutdown(): Promise<void> {
  isQuitting = true;
  googleConnectionService?.cancel();
  codexLoginProcess?.kill("SIGTERM");
  codexLoginProcess = null;
  await artifactPreviewRuntime.stopAll();
  await discordBridge?.stop();
  const runIds = new Set([
    ...startingRuns.keys(),
    ...activeRuns.keys(),
    ...activePluginRuns.keys(),
    ...runEventBuffer.listRecoverable().map((run) => run.runId),
  ]);
  await Promise.allSettled(Array.from(runIds, (runId) => terminateRun(runId)));
  await openCodeServerManager?.stopAll();
  await claudeCodeServerManager?.stopAll();
  await cliHarnessServerManager?.stopAll();
  await pluginNativeToolMcpHosts.stopAll();
  await waitForCriticalOperations();
  // Renderer acknowledgement is sent only after the terminal conversation
  // save completes. Keeping the window alive until here prevents quit-time
  // events from being lost between child close and the project-store queue.
  await waitForTerminalAcknowledgements(runIds);
  await waitForSettlement(persistUnacknowledgedRuns(runIds), 10_000);
  await waitForSettlement(Promise.allSettled([
    projectStore?.flush() ?? Promise.resolve(),
    settingsStore?.flush() ?? Promise.resolve(),
    skillRepository?.flush() ?? Promise.resolve(),
    searchSettingsService?.flush() ?? Promise.resolve(),
    googleConnectionService?.flush() ?? Promise.resolve(),
    discordSettingsService?.flush() ?? Promise.resolve(),
    discordSessionStateRepository?.flush() ?? Promise.resolve(),
    pluginStateRepository?.flush() ?? Promise.resolve(),
  ]), 10_000);
}

app.on("before-quit", (event) => {
  if (quitReady) return;
  event.preventDefault();
  shutdownPromise ??= drainForShutdown();
  void shutdownPromise.finally(() => {
    quitReady = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (!isQuitting) app.quit();
});
