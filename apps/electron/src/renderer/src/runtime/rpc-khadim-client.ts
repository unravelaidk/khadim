import type {
  AgentApprovalDecision,
  AgentEventEnvelope,
  AgentQuestionAnswers,
  AgentRunRequest,
  Artifact,
  Conversation,
  DiscordSettings,
  DiscordSettingsUpdate,
  GoogleConnectRequest,
  KhadimClient,
  SearchSettingsUpdate,
  SettingsUpdate,
} from "../../../shared/types";

export type KhadimRpcMethod =
  | "agent.start" | "agent.abort" | "agent.answerQuestion" | "agent.answerApproval" | "agent.recover" | "agent.acknowledge"
  | "projects.list" | "projects.add" | "projects.open" | "projects.checkAvailability"
  | "projects.rename" | "projects.relocate" | "projects.remove" | "projects.chooseDirectory"
  | "conversations.list" | "conversations.save" | "conversations.remove" | "conversations.exportMarkdown"
  | "app.version" | "app.configDirectory"
  | "artifacts.list" | "artifacts.save" | "artifacts.exportPdf"
  | "settings.get" | "settings.save" | "settings.chooseWorkspace"
  | "models.catalog" | "models.syncCodex"
  | "auth.codexConnected" | "auth.startCodexLogin" | "auth.codexLoginStatus"
  | "search.get" | "search.save"
  | "google.get" | "google.connect" | "google.disconnect"
  | "discord.get" | "discord.save" | "discord.disconnect"
  | "skills.discover" | "skills.toggle"
  | "shell.openExternal"
  | "window.minimize" | "window.toggleMaximize" | "window.close";

export type KhadimPushEvent =
  | { type: "agent.event"; payload: AgentEventEnvelope }
  | { type: "discord.status"; payload: DiscordSettings };

export interface KhadimRpcTransport {
  invoke<T>(method: KhadimRpcMethod, args?: unknown[]): Promise<T>;
  subscribe(listener: (event: KhadimPushEvent) => void): () => void;
}

export interface KhadimClientOptions {
  platform?: string;
  nativeWindowControls?: boolean;
}

/** Builds the same client interface for local Deno bindings or remote HTTP/WebSocket transports. */
export function createRpcKhadimClient(transport: KhadimRpcTransport, options: KhadimClientOptions = {}): KhadimClient {
  const invoke = <T>(method: KhadimRpcMethod, ...args: unknown[]) => transport.invoke<T>(method, args);
  return {
    platform: options.platform,
    windowControls: options.nativeWindowControls ? {
      minimize: () => invoke("window.minimize"),
      toggleMaximize: () => invoke("window.toggleMaximize"),
      close: () => invoke("window.close"),
    } : undefined,
    agent: {
      start: (request: AgentRunRequest) => invoke("agent.start", request),
      abort: (runId: string) => invoke("agent.abort", runId),
      answerQuestion: (runId: string, requestId: string, answers: AgentQuestionAnswers) => invoke("agent.answerQuestion", runId, requestId, answers),
      answerApproval: (runId: string, requestId: string, decision: AgentApprovalDecision) => invoke("agent.answerApproval", runId, requestId, decision),
      recover: () => invoke("agent.recover"),
      acknowledge: (runId: string) => invoke("agent.acknowledge", runId),
      onEvent: (listener) => transport.subscribe((event) => { if (event.type === "agent.event") listener(event.payload); }),
    },
    projects: {
      list: () => invoke("projects.list"),
      add: (rootPath: string) => invoke("projects.add", rootPath),
      open: (projectId: string) => invoke("projects.open", projectId),
      checkAvailability: (projectId: string) => invoke("projects.checkAvailability", projectId),
      rename: (projectId: string, name: string) => invoke("projects.rename", projectId, name),
      relocate: (projectId: string, rootPath: string) => invoke("projects.relocate", projectId, rootPath),
      remove: (projectId: string) => invoke("projects.remove", projectId),
      chooseDirectory: () => invoke("projects.chooseDirectory"),
    },
    conversations: {
      list: (projectId: string) => invoke("conversations.list", projectId),
      save: (conversation: Conversation) => invoke("conversations.save", conversation),
      remove: (projectId: string, id: string) => invoke("conversations.remove", projectId, id),
      exportMarkdown: (suggestedName: string, markdown: string) => invoke("conversations.exportMarkdown", suggestedName, markdown),
    },
    app: {
      version: () => invoke("app.version"),
      configDirectory: () => invoke("app.configDirectory"),
    },
    artifacts: {
      list: (projectId: string) => invoke("artifacts.list", projectId),
      save: (projectId: string, artifacts: Artifact[]) => invoke("artifacts.save", projectId, artifacts),
      exportPdf: (projectId: string, artifactId: string) => invoke("artifacts.exportPdf", projectId, artifactId),
    },
    settings: {
      get: () => invoke("settings.get"),
      save: (settings: SettingsUpdate) => invoke("settings.save", settings),
      chooseWorkspace: () => invoke("settings.chooseWorkspace"),
    },
    models: {
      catalog: (refresh = false) => invoke("models.catalog", refresh),
      syncCodex: (activate = false) => invoke("models.syncCodex", activate),
    },
    auth: {
      codexConnected: () => invoke("auth.codexConnected"),
      startCodexLogin: () => invoke("auth.startCodexLogin"),
      codexLoginStatus: () => invoke("auth.codexLoginStatus"),
    },
    search: {
      get: () => invoke("search.get"),
      save: (update: SearchSettingsUpdate) => invoke("search.save", update),
    },
    google: {
      get: () => invoke("google.get"),
      connect: (request?: GoogleConnectRequest) => request
        ? invoke("google.connect", request)
        : invoke("google.connect"),
      disconnect: () => invoke("google.disconnect"),
    },
    discord: {
      get: () => invoke("discord.get"),
      save: (update: DiscordSettingsUpdate) => invoke("discord.save", update),
      disconnect: () => invoke("discord.disconnect"),
      onStatus: (listener) => transport.subscribe((event) => { if (event.type === "discord.status") listener(event.payload); }),
    },
    skills: {
      discover: () => invoke("skills.discover"),
      toggle: (skillId: string, enabled: boolean) => invoke("skills.toggle", skillId, enabled),
    },
    shell: { openExternal: (url: string) => invoke("shell.openExternal", url) },
  };
}
