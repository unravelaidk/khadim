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
  | "backend_busy"
  | "github";

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
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  workspace_id: string;
  name: string;
  backend: string;
  substrate: "local" | "docker" | "remote";
  wasm_enabled: boolean;
  docker_image: string | null;
  docker_workdir: string | null;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_path: string | null;
  source_cwd: string;
  effective_cwd: string;
  sandbox_id: string | null;
  sandbox_root_path: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string;
}

export interface RuntimeSession {
  id: string;
  environment_id: string;
  backend: string;
  backend_session_id: string | null;
  backend_session_cwd: string | null;
  shared: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

/**
 * Effective desktop coding context resolved from the active workspace and
 * (optionally) the focused conversation/agent. Native tools (terminal, file
 * finder, diff) should drive their cwd from this single source of truth.
 */
export interface DesktopWorkspaceContext {
  workspace_id: string;
  workspace_name: string;
  backend: string;
  /** Conversation ID (= agent ID in the desktop model) when one is focused. */
  conversation_id: string | null;
  /** Stable repo path (the original git repo, never the worktree). */
  repo_path: string;
  /** Active branch — conversation branch first, then workspace branch. */
  branch: string | null;
  /** Effective working directory for native tools. Always exists on disk. */
  cwd: string;
  /** Worktree path when running inside a non-main worktree. */
  worktree_path: string | null;
  /** True when `cwd` is a non-main worktree (agent is sandboxed off main). */
  in_worktree: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  repo_path: string;
  branch?: string;
  backend?: string;
}

export interface CreateEnvironmentInput {
  workspace_id: string;
  name?: string;
  backend?: string;
  substrate?: "local" | "docker" | "remote";
  wasm_enabled?: boolean;
  docker_image?: string;
  docker_workdir?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_path?: string;
  source_cwd?: string;
}

export interface UpdateEnvironmentInput {
  id: string;
  name?: string;
  backend?: string;
  substrate?: "local" | "docker" | "remote";
  wasm_enabled?: boolean;
  docker_image?: string;
  docker_workdir?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_path?: string;
}

export interface CreateRuntimeSessionInput {
  environment_id: string;
  source_cwd?: string;
  shared?: boolean;
  status?: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  environment_id: string | null;
  runtime_session_id: string | null;
  backend: string;
  backend_session_id: string | null;
  backend_session_cwd: string | null;
  branch: string | null;
  worktree_path: string | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Cumulative input tokens (context sent to model) for this conversation. */
  input_tokens: number;
  /** Cumulative output tokens generated for this conversation. */
  output_tokens: number;
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
  /** Full (absolute or repo-relative) path to the file touched by this step. */
  filePath?: string;
  subagentType?: string;
  taskDescription?: string;
  taskPrompt?: string;
}

// ── Question types (from OpenCode's question tool) ───────────────────

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  /** When true (default), a "Type your own answer" free-text option is added. */
  custom?: boolean;
}

/** Payload delivered via the "question" stream event. */
export interface PendingQuestion {
  /** OpenCode question request ID or backend-specific correlation ID. */
  id: string;
  /** Backend session that is waiting on the user's answer. */
  sessionId: string;
  /** Workspace that emitted the question event. */
  workspaceId: string;
  /** Workspace conversation ID when available. */
  conversationId: string | null;
  /** Backend that emitted the question. */
  backend: "khadim" | "opencode";
  questions: QuestionItem[];
}

export interface PendingApproval {
  id: string;
  sessionId: string;
  workspaceId: string;
  conversationId: string | null;
  backend: "claude_code";
  toolName: string;
  displayName: string;
  title: string;
  description: string;
  blockedPath?: string | null;
  canRemember: boolean;
  input?: Record<string, unknown> | null;
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
  worktree_path: string | null;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  head: string;
  is_bare: boolean;
  is_main: boolean;
}

export interface DiffFileEntry {
  /** Relative path within the repo. */
  path: string;
  /** Single-letter status: M, A, D, R, C, U, or ? for untracked. */
  status: string;
  /** Lines added (null for binary files). */
  insertions: number | null;
  /** Lines removed (null for binary files). */
  deletions: number | null;
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

export interface KhadimSessionCreated {
  id: string;
  cwd: string;
}

export interface KhadimModelOption {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  is_default: boolean;
}

export interface KhadimProviderOption {
  type: string;
  name: string;
  needs_base_url: boolean;
}

export interface KhadimProviderStatus {
  id: string;
  name: string;
  /** "active" | "configured" | "no_key" | "inactive" */
  status: string;
  has_api_key: boolean;
  /** True when the key comes from an environment variable (read-only, not deletable). */
  has_env_key: boolean;
  configured_models: number;
}

export interface KhadimConfiguredModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string | null;
  temperature: string | null;
  has_api_key: boolean;
  is_default: boolean;
  is_active: boolean;
}

export interface KhadimModelConfigInput {
  name: string;
  provider: string;
  model: string;
  api_key?: string | null;
  base_url?: string | null;
  temperature?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
}

export interface KhadimDiscoveredModel {
  id: string;
  name: string;
}

export interface KhadimBulkModelEntry {
  model_id: string;
  model_name: string;
}

export interface KhadimCodexSession {
  sessionId: string;
  authUrl: string;
}

export interface KhadimCodexStatus {
  status: "pending" | "connected" | "failed" | string;
  error: string | null;
  authUrl: string | null;
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

// ── Plugin types ─────────────────────────────────────────────────────

export interface PluginPermissionsSummary {
  fs: boolean;
  http: boolean;
  store: boolean;
  allowed_hosts: string[];
}

export interface PluginEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string | null;
  homepage: string | null;
  dir: string;
  enabled: boolean;
  tool_count: number;
  permissions: PluginPermissionsSummary;
  error: string | null;
}

export interface PluginToolParam {
  name: string;
  description: string;
  param_type: string;
  required: boolean;
  default_value: string | null;
}

export interface PluginToolDef {
  name: string;
  description: string;
  params: PluginToolParam[];
  prompt_snippet: string;
}

export interface PluginToolInfo {
  plugin_id: string;
  plugin_name: string;
  tool: PluginToolDef;
}

// ── Skill types ──────────────────────────────────────────────────────

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  dir: string;
  source_dir: string;
  enabled: boolean;
  author: string | null;
  version: string | null;
}

// ── File Finder types ─────────────────────────────────────────

export interface FileEntry {
  relative_path: string;
  name: string;
  status: string;
  is_dir: boolean;
}

export interface FileSearchResult {
  entry: FileEntry;
  score: number;
  matched_indices: number[];
}

export interface FileIndexStatus {
  root: string;
  file_count: number;
  built_at_ms: number;
  building: boolean;
}

export interface FilePreview {
  path: string;
  content: string;
  is_binary: boolean;
  size_bytes: number;
  line_count: number;
}

// ── LSP types ──────────────────────────────────────────────

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspHoverResult {
  contents: string;
  language: string | null;
  range: LspRange | null;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspSymbol {
  name: string;
  kind: string;
  detail: string | null;
  range: LspRange;
  selection_range: LspRange;
  children: LspSymbol[];
}

export interface LspWorkspaceSymbol {
  name: string;
  kind: string;
  container_name: string | null;
  location: LspLocation;
}

export interface LspServerStatus {
  language: string;
  root: string;
  server_command: string;
  running: boolean;
}

// ── Syntax Highlight types ─────────────────────────────────────

export interface SyntaxHighlightResult {
  /** Pre-tokenized HTML with <span class="ts-*"> wrappers. */
  html: string;
  /** Canonical language ID used. */
  language: string;
  /** Number of source lines. */
  line_count: number;
  /** True when tree-sitter parsed successfully. */
  parsed: boolean;
}

// ── Editor types ────────────────────────────────────────────

export interface DetectedEditor {
  id: string;
  name: string;
  binary: string;
  available: boolean;
}

// ── Terminal types ─────────────────────────────────────────

export interface TerminalSession {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  cwd: string;
  title: string;
  cols: number;
  rows: number;
  running: boolean;
}

export interface TerminalOutputEvent {
  session_id: string;
  data: string;
}

export interface TerminalExitEvent {
  session_id: string;
  code: number | null;
  message: string | null;
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
  event_type: "text_delta" | "step_start" | "step_update" | "step_complete" | "question" | "done" | "error" | string;
  content: string | null;
  metadata: Record<string, unknown> | null;
}

// ── GitHub types ─────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  state: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  milestone: GitHubMilestone | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubPRBranch {
  label: string;
  ref: string;
  sha: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  milestone: GitHubMilestone | null;
  head: GitHubPRBranch;
  base: GitHubPRBranch;
  merged: boolean | null;
  mergeable: boolean | null;
  draft: boolean | null;
  comments: number;
  commits: number | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubCheckSuite {
  total_count: number;
  check_runs: GitHubCheckRun[];
}

export interface GitHubAuthStatus {
  authenticated: boolean;
  user: GitHubUser | null;
}

export interface RepoSlug {
  owner: string;
  repo: string;
}

export interface GhCliInfo {
  installed: boolean;
  path: string | null;
  version: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
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

  setWorkspaceBranch: (id: string, branch?: string) =>
    invoke<void>("set_workspace_branch", { id, branch }),

  deleteWorkspace: (id: string) =>
    invoke<void>("delete_workspace", { id }),

  workspaceContextGet: (workspaceId: string, conversationId?: string | null) =>
    invoke<DesktopWorkspaceContext>("workspace_context_get", {
      workspaceId,
      conversationId: conversationId ?? null,
    }),

  // Environments
  listEnvironments: (workspaceId: string) =>
    invoke<Environment[]>("list_environments", { workspaceId }),

  getEnvironment: (id: string) =>
    invoke<Environment>("get_environment", { id }),

  createEnvironment: (input: CreateEnvironmentInput) =>
    invoke<Environment>("create_environment", { input }),

  updateEnvironment: (input: UpdateEnvironmentInput) =>
    invoke<Environment>("update_environment", { input }),

  ensureDefaultEnvironment: (workspaceId: string) =>
    invoke<Environment>("ensure_default_environment", { workspaceId }),

  deleteEnvironment: (id: string) =>
    invoke<void>("delete_environment", { id }),

  listRuntimeSessions: (environmentId: string) =>
    invoke<RuntimeSession[]>("list_runtime_sessions", { environmentId }),

  getRuntimeSession: (id: string) =>
    invoke<RuntimeSession>("get_runtime_session", { id }),

  createRuntimeSession: (input: CreateRuntimeSessionInput) =>
    invoke<RuntimeSession>("create_runtime_session", { input }),

  deleteRuntimeSession: (id: string) =>
    invoke<void>("delete_runtime_session", { id }),

  updateRuntimeSessionBackend: (
    id: string,
    backendSessionId?: string | null,
    backendSessionCwd?: string | null,
    status?: string | null,
  ) =>
    invoke<void>("update_runtime_session_backend", {
      input: {
        id,
        backend_session_id: backendSessionId ?? null,
        backend_session_cwd: backendSessionCwd ?? null,
        status: status ?? null,
      },
    }),

  // Terminal
  terminalCreate: (
    workspaceId: string,
    conversationId?: string | null,
    cwd?: string | null,
    cols?: number | null,
    rows?: number | null,
  ) =>
    invoke<TerminalSession>("terminal_create", {
      workspaceId,
      conversationId: conversationId ?? null,
      cwd: cwd ?? null,
      cols: cols ?? null,
      rows: rows ?? null,
    }),

  terminalWrite: (sessionId: string, data: string) =>
    invoke<void>("terminal_write", { sessionId, data }),

  terminalResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { sessionId, cols, rows }),

  terminalClose: (sessionId: string) =>
    invoke<void>("terminal_close", { sessionId }),

  terminalList: (workspaceId?: string | null) =>
    invoke<TerminalSession[]>("terminal_list", {
      workspaceId: workspaceId ?? null,
    }),

  // File Finder
  fileIndexBuild: (root: string) =>
    invoke<FileIndexStatus>("file_index_build", { root }),

  fileSearch: (root: string, query: string, maxResults?: number | null) =>
    invoke<FileSearchResult[]>("file_search", {
      root,
      query,
      maxResults: maxResults ?? null,
    }),

  fileReadPreview: (root: string, relativePath: string, maxBytes?: number | null) =>
    invoke<FilePreview>("file_read_preview", {
      root,
      relativePath,
      maxBytes: maxBytes ?? null,
    }),

  fileIndexStatus: (root: string) =>
    invoke<FileIndexStatus | null>("file_index_status", { root }),

  // LSP
  lspHover: (root: string, filePath: string, line: number, character: number) =>
    invoke<LspHoverResult | null>("lsp_hover", { root, filePath, line, character }),

  lspDefinition: (root: string, filePath: string, line: number, character: number) =>
    invoke<LspLocation[]>("lsp_definition", { root, filePath, line, character }),

  lspDocumentSymbols: (root: string, filePath: string) =>
    invoke<LspSymbol[]>("lsp_document_symbols", { root, filePath }),

  lspWorkspaceSymbols: (root: string, query: string, languageHint?: string | null) =>
    invoke<LspWorkspaceSymbol[]>("lsp_workspace_symbols", {
      root,
      query,
      languageHint: languageHint ?? null,
    }),

  lspListServers: () =>
    invoke<LspServerStatus[]>("lsp_list_servers"),

  lspStop: (root?: string | null) =>
    invoke<void>("lsp_stop", { root: root ?? null }),

  // Syntax Highlighting (tree-sitter, native speed)
  syntaxHighlight: (source: string, filename: string) =>
    invoke<SyntaxHighlightResult>("syntax_highlight", { source, filename }),

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

  gitDiffFiles: (repoPath: string) =>
    invoke<DiffFileEntry[]>("git_diff_files", { repoPath }),

  gitCreateWorktree: (
    repoPath: string,
    worktreePath: string | null | undefined,
    branch: string,
    newBranch: boolean,
    baseBranch?: string,
  ) =>
    invoke<WorktreeInfo>("git_create_worktree", {
      repoPath,
      worktreePath,
      branch,
      newBranch,
      baseBranch,
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

  setConversationBackendSession: (
    id: string,
    backendSessionId: string,
    backendSessionCwd?: string | null,
    branch?: string | null,
    worktreePath?: string | null,
  ) =>
    invoke<void>("set_conversation_backend_session", {
      id,
      backendSessionId,
      backendSessionCwd,
      branch,
      worktreePath,
    }),

  setConversationEnvironment: (
    id: string,
    environmentId?: string | null,
    runtimeSessionId?: string | null,
  ) =>
    invoke<void>("set_conversation_environment", {
      id,
      environmentId: environmentId ?? null,
      runtimeSessionId: runtimeSessionId ?? null,
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
    system?: string | null,
  ) =>
    invoke<unknown>("opencode_send_message", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
      system,
    }),

  opencodeSendMessageAsync: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
    system?: string | null,
  ) =>
    invoke<void>("opencode_send_message_async", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
      system,
    }),

  opencodeSendStreaming: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
    system?: string | null,
  ) =>
    invoke<void>("opencode_send_streaming", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
      system,
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

  opencodeReplyQuestion: (
    workspaceId: string,
    requestId: string,
    answers: string[][],
  ) =>
    invoke<void>("opencode_reply_question", {
      workspaceId,
      requestId,
      answers,
    }),

  opencodeRejectQuestion: (workspaceId: string, requestId: string) =>
    invoke<void>("opencode_reject_question", {
      workspaceId,
      requestId,
    }),

  // Claude Code backend
  claudeCodeCreateSession: (workspaceId: string, cwdOverride?: string | null) =>
    invoke<KhadimSessionCreated>("claude_code_create_session", { workspaceId, cwdOverride }),

  claudeCodeListModels: () =>
    invoke<OpenCodeModelOption[]>("claude_code_list_models"),

  claudeCodeSendStreaming: (
    workspaceId: string,
    sessionId: string,
    conversationId: string,
    content: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<void>("claude_code_send_streaming", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  claudeCodeAbort: (sessionId: string) =>
    invoke<void>("claude_code_abort", { sessionId }),

  claudeCodeRespondPermission: (
    sessionId: string,
    requestId: string,
    allow: boolean,
    remember = false,
  ) =>
    invoke<void>("claude_code_respond_permission", {
      sessionId,
      requestId,
      allow,
      remember,
    }),

  // Khadim backend
  khadimCreateSession: (workspaceId?: string | null, cwdOverride?: string | null) =>
    invoke<KhadimSessionCreated>("khadim_create_session", { workspaceId, cwdOverride }),

  khadimListModels: () =>
    invoke<KhadimModelOption[]>("khadim_list_models"),

  khadimListModelConfigs: () =>
    invoke<KhadimConfiguredModel[]>("khadim_list_model_configs"),

  khadimListProviders: () =>
    invoke<KhadimProviderOption[]>("khadim_list_providers"),

  khadimListProviderStatuses: () =>
    invoke<KhadimProviderStatus[]>("khadim_list_provider_statuses"),

  khadimSaveProviderApiKey: (provider: string, apiKey: string) =>
    invoke<void>("khadim_save_provider_api_key", { provider, apiKey }),

  khadimGetProviderApiKeyMasked: (provider: string) =>
    invoke<string | null>("khadim_get_provider_api_key_masked", { provider }),

  khadimGetProviderApiKey: (provider: string) =>
    invoke<string | null>("khadim_get_provider_api_key", { provider }),

  khadimDeleteProviderApiKey: (provider: string) =>
    invoke<void>("khadim_delete_provider_api_key", { provider }),

  khadimBulkCreateProviderModels: (provider: string, models: KhadimBulkModelEntry[]) =>
    invoke<number>("khadim_bulk_create_provider_models", { provider, models }),

  khadimRemoveProviderModels: (provider: string) =>
    invoke<number>("khadim_remove_provider_models", { provider }),

  khadimDiscoverModels: (provider: string, apiKey?: string | null, baseUrl?: string | null) =>
    invoke<KhadimDiscoveredModel[]>("khadim_discover_models", { provider, apiKey, baseUrl }),

  khadimCreateModelConfig: (input: KhadimModelConfigInput) =>
    invoke<KhadimConfiguredModel>("khadim_create_model_config", { input }),

  khadimUpdateModelConfig: (id: string, input: KhadimModelConfigInput) =>
    invoke<KhadimConfiguredModel>("khadim_update_model_config", { id, input }),

  khadimDeleteModelConfig: (id: string) =>
    invoke<void>("khadim_delete_model_config", { id }),

  khadimSetActiveModelConfig: (id: string) =>
    invoke<void>("khadim_set_active_model_config", { id }),

  khadimSetDefaultModelConfig: (id: string) =>
    invoke<void>("khadim_set_default_model_config", { id }),

  khadimActiveModel: () =>
    invoke<KhadimModelOption | null>("khadim_active_model"),

  khadimCodexAuthConnected: () =>
    invoke<boolean>("khadim_codex_auth_connected"),

  khadimCodexAuthStart: () =>
    invoke<KhadimCodexSession>("khadim_codex_auth_start"),

  khadimCodexAuthStatus: (sessionId: string) =>
    invoke<KhadimCodexStatus>("khadim_codex_auth_status", { sessionId }),

  khadimCodexAuthComplete: (sessionId: string, code: string) =>
    invoke<void>("khadim_codex_auth_complete", { sessionId, code }),

  khadimSendStreaming: (
    workspaceId: string,
    sessionId: string,
    conversationId?: string | null,
    content?: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<void>("khadim_send_streaming", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  khadimSendMessage: (
    workspaceId: string,
    sessionId: string,
    conversationId?: string | null,
    content?: string,
    model?: OpenCodeModelRef | null,
  ) =>
    invoke<string>("khadim_send_message", {
      workspaceId,
      sessionId,
      conversationId,
      content,
      model,
    }),

  khadimAbort: (sessionId: string) =>
    invoke<void>("khadim_abort", { sessionId }),
  khadimAnswerQuestion: (sessionId: string, answer: string) =>
    invoke<void>("khadim_answer_question", { sessionId, answer }),

  // Settings
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  // Processes
  listProcesses: () =>
    invoke<ProcessInfo[]>("list_processes"),

  // Plugins
  pluginList: () =>
    invoke<PluginEntry[]>("plugin_list"),

  pluginGet: (pluginId: string) =>
    invoke<PluginEntry>("plugin_get", { pluginId }),

  pluginEnable: (pluginId: string, workspaceRoot?: string) =>
    invoke<PluginEntry>("plugin_enable", { pluginId, workspaceRoot }),

  pluginDisable: (pluginId: string) =>
    invoke<PluginEntry>("plugin_disable", { pluginId }),

  pluginInstall: (sourceDir: string, workspaceRoot?: string) =>
    invoke<PluginEntry>("plugin_install", { sourceDir, workspaceRoot }),

  pluginUninstall: (pluginId: string) =>
    invoke<void>("plugin_uninstall", { pluginId }),

  pluginListTools: () =>
    invoke<PluginToolInfo[]>("plugin_list_tools"),

  pluginSetConfig: (pluginId: string, key: string, value: string) =>
    invoke<void>("plugin_set_config", { pluginId, key, value }),

  pluginGetConfig: (pluginId: string, key: string) =>
    invoke<string | null>("plugin_get_config", { pluginId, key }),

  pluginDiscover: (workspaceRoot?: string) =>
    invoke<PluginEntry[]>("plugin_discover", { workspaceRoot }),

  pluginDir: () =>
    invoke<string>("plugin_dir"),

  // Skills
  skillDiscover: () =>
    invoke<SkillEntry[]>("skill_discover"),

  skillToggle: (skillId: string, enabled: boolean) =>
    invoke<void>("skill_toggle", { skillId, enabled }),

  skillListDirs: () =>
    invoke<string[]>("skill_list_dirs"),

  skillAddDir: (dir: string) =>
    invoke<string[]>("skill_add_dir", { dir }),

  skillRemoveDir: (dir: string) =>
    invoke<string[]>("skill_remove_dir", { dir }),

  // Editor
  detectEditors: () =>
    invoke<DetectedEditor[]>("detect_editors"),

  openInEditor: (filePath: string, editorId?: string | null) =>
    invoke<void>("open_in_editor", { filePath, editorId: editorId ?? null }),

  openProjectInEditor: (projectPath: string) =>
    invoke<void>("open_project_in_editor", { projectPath }),

  // GitHub Auth
  githubAuthStatus: () =>
    invoke<GitHubAuthStatus>("github_auth_status"),

  githubAuthLogin: () =>
    invoke<void>("github_auth_login"),

  githubAuthLogout: () =>
    invoke<void>("github_auth_logout"),

  // GitHub Repo Slug
  githubRepoSlug: (remoteUrl: string) =>
    invoke<RepoSlug | null>("github_repo_slug", { remoteUrl }),

  // GitHub Issues
  githubIssueList: (
    owner: string,
    repo: string,
    issueState?: string,
    page?: number,
    perPage?: number,
  ) =>
    invoke<GitHubIssue[]>("github_issue_list", {
      owner,
      repo,
      issueState,
      page,
      perPage,
    }),

  githubIssueGet: (owner: string, repo: string, number: number) =>
    invoke<GitHubIssue>("github_issue_get", { owner, repo, number }),

  githubIssueCreate: (
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[],
  ) =>
    invoke<GitHubIssue>("github_issue_create", {
      owner,
      repo,
      title,
      body,
      labels,
      assignees,
    }),

  githubIssueEdit: (
    owner: string,
    repo: string,
    number: number,
    title?: string,
    body?: string,
    issueState?: string,
    labels?: string[],
    assignees?: string[],
  ) =>
    invoke<GitHubIssue>("github_issue_edit", {
      owner,
      repo,
      number,
      title,
      body,
      issueState,
      labels,
      assignees,
    }),

  githubIssueClose: (owner: string, repo: string, number: number) =>
    invoke<GitHubIssue>("github_issue_close", { owner, repo, number }),

  githubIssueReopen: (owner: string, repo: string, number: number) =>
    invoke<GitHubIssue>("github_issue_reopen", { owner, repo, number }),

  githubIssueComment: (
    owner: string,
    repo: string,
    number: number,
    body: string,
  ) =>
    invoke<GitHubComment>("github_issue_comment", {
      owner,
      repo,
      number,
      body,
    }),

  githubIssueComments: (
    owner: string,
    repo: string,
    number: number,
    page?: number,
    perPage?: number,
  ) =>
    invoke<GitHubComment[]>("github_issue_comments", {
      owner,
      repo,
      number,
      page,
      perPage,
    }),

  githubLabelList: (owner: string, repo: string) =>
    invoke<GitHubLabel[]>("github_label_list", { owner, repo }),

  // GitHub PRs
  githubPrList: (
    owner: string,
    repo: string,
    prState?: string,
    page?: number,
    perPage?: number,
  ) =>
    invoke<GitHubPR[]>("github_pr_list", {
      owner,
      repo,
      prState,
      page,
      perPage,
    }),

  githubPrGet: (owner: string, repo: string, number: number) =>
    invoke<GitHubPR>("github_pr_get", { owner, repo, number }),

  githubPrCreate: (
    owner: string,
    repo: string,
    title: string,
    body?: string,
    head?: string,
    base?: string,
    draft?: boolean,
  ) =>
    invoke<GitHubPR>("github_pr_create", {
      owner,
      repo,
      title,
      body,
      head,
      base,
      draft,
    }),

  githubPrEdit: (
    owner: string,
    repo: string,
    number: number,
    title?: string,
    body?: string,
    prState?: string,
    base?: string,
  ) =>
    invoke<GitHubPR>("github_pr_edit", {
      owner,
      repo,
      number,
      title,
      body,
      prState,
      base,
    }),

  githubPrClose: (owner: string, repo: string, number: number) =>
    invoke<GitHubPR>("github_pr_close", { owner, repo, number }),

  githubPrComment: (
    owner: string,
    repo: string,
    number: number,
    body: string,
  ) =>
    invoke<GitHubComment>("github_pr_comment", {
      owner,
      repo,
      number,
      body,
    }),

  githubPrComments: (
    owner: string,
    repo: string,
    number: number,
    page?: number,
    perPage?: number,
  ) =>
    invoke<GitHubComment[]>("github_pr_comments", {
      owner,
      repo,
      number,
      page,
      perPage,
    }),

  githubPrMerge: (
    owner: string,
    repo: string,
    number: number,
    mergeMethod?: string,
    commitTitle?: string,
    commitMessage?: string,
  ) =>
    invoke<unknown>("github_pr_merge", {
      owner,
      repo,
      number,
      mergeMethod,
      commitTitle,
      commitMessage,
    }),

  githubPrDiff: (owner: string, repo: string, number: number) =>
    invoke<string>("github_pr_diff", { owner, repo, number }),

  githubPrChecks: (owner: string, repo: string, prRef: string) =>
    invoke<GitHubCheckSuite>("github_pr_checks", { owner, repo, prRef }),

  githubPrReview: (
    owner: string,
    repo: string,
    number: number,
    event: string,
    body?: string,
  ) =>
    invoke<unknown>("github_pr_review", {
      owner,
      repo,
      number,
      event,
      body,
    }),

  // gh CLI
  githubGhCliInfo: () =>
    invoke<GhCliInfo>("github_gh_cli_info"),

  githubGhSetupGit: () =>
    invoke<void>("github_gh_setup_git"),

  // GitHub Repo creation
  githubCreateAndPush: (
    repoPath: string,
    name: string,
    description: string | null,
    isPrivate: boolean,
  ) =>
    invoke<GitHubRepo>("github_create_and_push", {
      repoPath,
      name,
      description,
      private: isPrivate,
    }),
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

  /** PTY-backed terminal output chunks. */
  onTerminalOutput: (
    callback: (event: TerminalOutputEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<TerminalOutputEvent>("terminal-output", (event) =>
      callback(event.payload),
    ),

  /** PTY-backed terminal exit notifications. */
  onTerminalExit: (
    callback: (event: TerminalExitEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<TerminalExitEvent>("terminal-exit", (event) =>
      callback(event.payload),
    ),
};
