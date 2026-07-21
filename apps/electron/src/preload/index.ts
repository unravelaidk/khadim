import { contextBridge, ipcRenderer } from "electron";
import type { AgentEventEnvelope, AgentRunRequest, ArtifactDraft, ArtifactPreviewRequest, Conversation, DiscordSettings, DiscordSettingsUpdate, GoogleConnectRequest, KhadimClient, SearchSettingsUpdate, SettingsUpdate } from "../shared/types";
import type { PluginConfigUpdate } from "../shared/plugins";

const api: KhadimClient = {
  platform: process.platform,
  windowControls: process.platform === "darwin" ? undefined : {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  agent: {
    start: (request: AgentRunRequest) => ipcRenderer.invoke("agent:start", request),
    abort: (runId: string) => ipcRenderer.invoke("agent:abort", runId),
    recover: () => ipcRenderer.invoke("agent:recover"),
    acknowledge: (runId: string) => ipcRenderer.invoke("agent:acknowledge", runId),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, envelope: AgentEventEnvelope) => listener(envelope);
      ipcRenderer.on("agent:event", handler);
      return () => ipcRenderer.removeListener("agent:event", handler);
    },
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    add: (rootPath: string) => ipcRenderer.invoke("projects:add", rootPath),
    open: (projectId: string) => ipcRenderer.invoke("projects:open", projectId),
    checkAvailability: (projectId: string) => ipcRenderer.invoke("projects:check-availability", projectId),
    rename: (projectId: string, name: string) => ipcRenderer.invoke("projects:rename", projectId, name),
    relocate: (projectId: string, rootPath: string) => ipcRenderer.invoke("projects:relocate", projectId, rootPath),
    remove: (projectId: string) => ipcRenderer.invoke("projects:remove", projectId),
    chooseDirectory: () => ipcRenderer.invoke("projects:choose-directory"),
  },
  conversations: {
    list: (projectId: string) => ipcRenderer.invoke("conversations:list", projectId),
    save: (conversation: Conversation) => ipcRenderer.invoke("conversations:save", conversation),
    remove: (projectId: string, id: string) => ipcRenderer.invoke("conversations:remove", projectId, id),
  },
  artifacts: {
    list: (projectId: string) => ipcRenderer.invoke("artifacts:list", projectId),
    save: (projectId: string, drafts: ArtifactDraft[]) => ipcRenderer.invoke("artifacts:save", projectId, drafts),
    exportPdf: (projectId: string, artifactId: string) => ipcRenderer.invoke("artifacts:export-pdf", projectId, artifactId),
    preview: (request: ArtifactPreviewRequest) => ipcRenderer.invoke("artifacts:preview", request),
    stopPreview: (projectId: string, artifactId: string) => ipcRenderer.invoke("artifacts:stop-preview", projectId, artifactId),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings: SettingsUpdate) => ipcRenderer.invoke("settings:save", settings),
    chooseWorkspace: () => ipcRenderer.invoke("settings:choose-workspace"),
  },
  models: {
    catalog: () => ipcRenderer.invoke("models:catalog"),
    syncCodex: (activate = false) => ipcRenderer.invoke("models:sync-codex", activate),
  },
  auth: {
    codexConnected: () => ipcRenderer.invoke("auth:codex-connected"),
    startCodexLogin: () => ipcRenderer.invoke("auth:codex-start"),
    codexLoginStatus: () => ipcRenderer.invoke("auth:codex-status"),
  },
  search: {
    get: () => ipcRenderer.invoke("search:get"),
    save: (update: SearchSettingsUpdate) => ipcRenderer.invoke("search:save", update),
  },
  google: {
    get: () => ipcRenderer.invoke("google:get"),
    connect: (request?: GoogleConnectRequest) => request
      ? ipcRenderer.invoke("google:connect", request)
      : ipcRenderer.invoke("google:connect"),
    disconnect: () => ipcRenderer.invoke("google:disconnect"),
  },
  discord: {
    get: () => ipcRenderer.invoke("discord:get"),
    save: (update: DiscordSettingsUpdate) => ipcRenderer.invoke("discord:save", update),
    disconnect: () => ipcRenderer.invoke("discord:disconnect"),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, settings: DiscordSettings) => listener(settings);
      ipcRenderer.on("discord:status", handler);
      return () => ipcRenderer.removeListener("discord:status", handler);
    },
  },
  skills: {
    discover: () => ipcRenderer.invoke("skills:discover"),
    toggle: (skillId: string, enabled: boolean) => ipcRenderer.invoke("skills:toggle", skillId, enabled),
  },
  plugins: {
    list: () => ipcRenderer.invoke("plugins:list"),
    harnesses: () => ipcRenderer.invoke("plugins:harnesses"),
    chooseAndInstall: () => ipcRenderer.invoke("plugins:choose-and-install"),
    setEnabled: (pluginId: string, enabled: boolean) => ipcRenderer.invoke("plugins:set-enabled", pluginId, enabled),
    configure: (pluginId: string, update: PluginConfigUpdate) => ipcRenderer.invoke("plugins:configure", pluginId, update),
    uninstall: (pluginId: string) => ipcRenderer.invoke("plugins:uninstall", pluginId),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  },
};

contextBridge.exposeInMainWorld("khadim", api);
