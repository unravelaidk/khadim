/**
 * Typed bindings for Tauri IPC commands.
 * Mirrors the Rust commands defined in src-tauri/src/lib.rs.
 *
 * All commands that can fail return Promise<T> and throw AppError-shaped objects.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Error types ──────────────────────────────────────────────────────

export type ErrorKind =
  | "database"
  | "not_found"
  | "process_spawn"
  | "process_kill"
  | "health_check"
  | "git"
  | "io"
  | "invalid_input"
  | "backend_busy";

export interface AppError {
  kind: ErrorKind;
  message: string;
}

// ── Domain types ─────────────────────────────────────────────────────

export interface RuntimeSummary {
  platform: string;
  runtime: string;
  status: string;
  opencode_available: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  repo_path: string;
  worktree_path: string | null;
  branch: string | null;
  backend: "opencode" | "claude_code" | "khadim";
  execution_target: "local" | "sandbox";
  sandbox_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  repo_path: string;
  branch?: string;
  backend?: string;
  execution_target?: string;
  create_worktree?: boolean;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  backend: string;
  backend_session_id: string | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string | null;
  created_at: string;
}

export interface ThinkingStepData {
  id: string;
  title: string;
  status: "pending" | "running" | "complete" | "error";
  content?: string;
  tool?: string;
  result?: string;
  filename?: string;
  fileContent?: string;
}

// ── Git types ────────────────────────────────────────────────────────

export interface RepoInfo {
  path: string;
  current_branch: string | null;
  is_dirty: boolean;
  remote_url: string | null;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  commit: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  head: string;
  is_bare: boolean;
  is_main: boolean;
}

// ── OpenCode types ───────────────────────────────────────────────────

export interface OpenCodeConnection {
  workspace_id: string;
  base_url: string;
  username: string;
  password: string;
  process_id: string;
  healthy: boolean;
}

export interface OpenCodeStarted {
  workspace_id: string;
  base_url: string;
  event_stream_url: string;
  healthy: boolean;
}

export interface OpenCodeModelRef {
  provider_id: string;
  model_id: string;
}

export interface OpenCodeModelOption extends OpenCodeModelRef {
  provider_name: string;
  model_name: string;
  is_default: boolean;
}

// ── Process types ────────────────────────────────────────────────────

export interface ProcessInfo {
  id: string;
  label: string;
  pid: number | null;
  running: boolean;
}

export interface ProcessOutput {
  process_id: string;
  stream: "stdout" | "stderr";
  line: string;
}

// ── Streaming event types ─────────────────────────────────────────────

export interface AgentStreamEvent {
  workspace_id: string;
  session_id: string;
  event_type: "text_delta" | "step_start" | "step_update" | "step_complete" | "done" | "error" | string;
  content: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Commands ─────────────────────────────────────────────────────────

export const commands = {
  // Runtime
  getRuntimeSummary: () =>
    invoke<RuntimeSummary>("desktop_runtime_summary"),

  // Workspaces
  listWorkspaces: () =>
    invoke<Workspace[]>("list_workspaces"),

  getWorkspace: (id: string) =>
    invoke<Workspace>("get_workspace", { id }),

  createWorkspace: (input: CreateWorkspaceInput) =>
    invoke<Workspace>("create_workspace", { input }),

  deleteWorkspace: (id: string) =>
    invoke<void>("delete_workspace", { id }),

  // Git
  gitRepoInfo: (path: string) =>
    invoke<RepoInfo>("git_repo_info", { path }),

  gitListBranches: (repoPath: string) =>
    invoke<BranchInfo[]>("git_list_branches", { repoPath }),

  gitListWorktrees: (repoPath: string) =>
    invoke<WorktreeInfo[]>("git_list_worktrees", { repoPath }),

  gitStatus: (repoPath: string) =>
    invoke<string>("git_status", { repoPath }),

  gitDiffStat: (repoPath: string) =>
    invoke<string>("git_diff_stat", { repoPath }),

  gitCreateWorktree: (
    repoPath: string,
    worktreePath: string,
    branch: string,
    newBranch: boolean,
  ) =>
    invoke<WorktreeInfo>("git_create_worktree", {
      repoPath,
      worktreePath,
      branch,
      newBranch,
    }),

  gitRemoveWorktree: (
    repoPath: string,
    worktreePath: string,
    force: boolean,
  ) =>
    invoke<void>("git_remove_worktree", {
      repoPath,
      worktreePath,
      force,
    }),

  // Conversations
  listConversations: (workspaceId: string) =>
    invoke<Conversation[]>("list_conversations", { workspaceId }),

  getConversation: (id: string) =>
    invoke<Conversation>("get_conversation", { id }),

  createConversation: (workspaceId: string) =>
    invoke<Conversation>("create_conversation", { workspaceId }),

  deleteConversation: (id: string) =>
    invoke<void>("delete_conversation", { id }),

  setConversationBackendSession: (id: string, backendSessionId: string) =>
    invoke<void>("set_conversation_backend_session", {
      id,
      backendSessionId,
    }),

  // Messages
  listMessages: (conversationId: string) =>
    invoke<ChatMessage[]>("list_messages", { conversationId }),

  // OpenCode backend
  opencodeStart: (workspaceId: string) =>
    invoke<OpenCodeStarted>("opencode_start", { workspaceId }),

  opencodeStop: (workspaceId: string) =>
    invoke<void>("opencode_stop", { workspaceId }),

  opencodeCreateSession: (workspaceId: string) =>
    invoke<unknown>("opencode_create_session", { workspaceId }),

  opencodeListSessions: (workspaceId: string) =>
    invoke<unknown>("opencode_list_sessions", { workspaceId }),

  opencodeListModels: (workspaceId: string) =>
    invoke<OpenCodeModelOption[]>("opencode_list_models", { workspaceId }),

  opencodeSendMessage: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<unknown>("opencode_send_message", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  opencodeSendMessageAsync: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<void>("opencode_send_message_async", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  opencodeSendStreaming: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<void>("opencode_send_streaming", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  opencodeAbort: (workspaceId: string, sessionId: string) =>
    invoke<void>("opencode_abort", { workspaceId, sessionId }),

  opencodeListMessages: (workspaceId: string, sessionId: string) =>
    invoke<unknown>("opencode_list_messages", { workspaceId, sessionId }),

  opencodeGetDiff: (workspaceId: string, sessionId: string) =>
    invoke<unknown>("opencode_get_diff", { workspaceId, sessionId }),

  opencodeSessionStatuses: (workspaceId: string) =>
    invoke<unknown>("opencode_session_statuses", { workspaceId }),

  opencodeGetConnection: (workspaceId: string) =>
    invoke<OpenCodeConnection | null>("opencode_get_connection", {
      workspaceId,
    }),

  // Settings
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  // Processes
  listProcesses: () =>
    invoke<ProcessInfo[]>("list_processes"),
};

// ── Events ───────────────────────────────────────────────────────────

export const events = {
  /** Process stdout/stderr output lines. */
  onProcessOutput: (
    callback: (output: ProcessOutput) => void,
  ): Promise<UnlistenFn> =>
    listen<ProcessOutput>("process-output", (event) =>
      callback(event.payload),
    ),

  /** OpenCode backend ready for a workspace. */
  onOpencodeReady: (
    callback: (info: OpenCodeStarted) => void,
  ): Promise<UnlistenFn> =>
    listen<OpenCodeStarted>("opencode-ready", (event) =>
      callback(event.payload),
    ),

  /** Agent streaming events (text deltas, steps, done, error). */
  onAgentStream: (
    callback: (event: AgentStreamEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<AgentStreamEvent>("agent-stream", (event) =>
      callback(event.payload),
    ),
};
