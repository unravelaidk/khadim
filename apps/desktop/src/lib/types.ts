import type { ThinkingStepData } from "./bindings";

/** Top-level interaction mode: chat (standalone LLM) vs work (platform) */
export type InteractionMode = "chat" | "work";

/** Sub-view within work mode — the platform nav */
export type WorkView = "dashboard" | "drafts" | "agents" | "sessions" | "environments" | "credentials" | "memory" | "integrations" | "analytics";

/** @deprecated — kept for compatibility during migration */
export type WorkHomeView = "workspaces";

/** A local-only chat conversation (no workspace, no backend yet) */
export interface LocalChatConversation {
  id: string;
  title: string;
  sessionId: string | null;
  messages: LocalChatMessage[];
  isProcessing: boolean;
  streamingContent: string;
  streamingSteps: ThinkingStepData[];
  createdAt: string;
  updatedAt: string;
}

/** A single message in a local chat conversation */
export interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Tool-call / thinking steps captured during streaming (assistant only). */
  thinkingSteps?: ThinkingStepData[];
}

/** A persisted Agent Builder chat ("draft"). Kept separate from standalone
 *  Chat mode conversations — these are drafts that produce managed agents. */
export interface BuilderChat {
  id: string;
  title: string;
  /** The original message that seeded this draft. Fired once on first open
   *  if messages is still empty. */
  seedMessage: string | null;
  messages: LocalChatMessage[];
  /** Khadim session id — reused across turns within a single draft. */
  sessionId: string | null;
  /** Set once the user saves the draft as a managed agent. */
  savedAgentId: string | null;
  savedAgentName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Creates a new blank builder chat (draft). */
export function createBuilderChat(seedMessage: string | null = null): BuilderChat {
  const now = new Date().toISOString();
  const seed = seedMessage?.trim() ?? null;
  return {
    id: crypto.randomUUID(),
    title: seed ? seed.slice(0, 60) : "New draft",
    seedMessage: seed && seed.length > 0 ? seed : null,
    messages: [],
    sessionId: null,
    savedAgentId: null,
    savedAgentName: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** GitHub sub-navigation within the workspace GitHub tab */
export type GitHubSubView =
  | { kind: "issues" }
  | { kind: "issue-detail"; issueNumber: number }
  | { kind: "issue-create" }
  | { kind: "prs" }
  | { kind: "pr-detail"; prNumber: number }
  | { kind: "pr-create" };

/** Status of an individual agent within a workspace */
export type AgentStatus = "idle" | "running" | "complete" | "error";

/* ═══════════════════════════════════════════════════════════════════════
   RPA Platform Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A managed agent definition */
export interface ManagedAgent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];             // enabled tool domain IDs
  triggerType: "manual" | "schedule" | "event";
  triggerConfig?: string;      // JSON
  approvalMode: "auto" | "ask" | "never";
  runnerType: "local" | "docker" | "cloud";
  harness: "khadim" | "opencode" | "claude_code" | "docker";
  status: "active" | "inactive" | "paused";
  /** Which model powers this agent */
  modelId: string | null;
  /** Optional runtime environment profile */
  environmentId: string | null;
  /** Max turns per session before auto-stopping */
  maxTurns: number;
  /** Max tokens per session */
  maxTokens: number;
  /** Template variables used in instructions (e.g. {{output_path}}) */
  variables: Record<string, string>;
  /** Agent version — incremented on each save */
  version: number;
  stats: {
    totalSessions: number;
    successRate: number;
    lastRunAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

/** A session (execution) record */
export interface SessionRecord {
  id: string;
  agentId: string | null;
  agentName: string | null;
  automationId: string | null;
  environmentId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  trigger: "manual" | "scheduled" | "event" | "chat";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
}

/** A turn within a session transcript */
export interface SessionTurn {
  id: string;
  turnNumber: number;
  role: "user" | "agent" | "tool";
  toolName: string | null;
  content: string | null;
  tokenInput: number | null;
  tokenOutput: number | null;
  durationMs: number | null;
  createdAt: string;
}

/** An environment configuration */
export interface Environment {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
  credentialIds: string[];
  runnerType: "local" | "docker" | "cloud";
  dockerImage: string | null;
  /** Absolute path on disk where local/docker runs execute — used to resolve session file paths. */
  workingDir: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A stored credential */
export interface Credential {
  id: string;
  name: string;
  type: "api_key" | "oauth" | "login" | "certificate";
  service: string | null;
  /** Non-secret metadata visible in UI (e.g. username, host) */
  metadata: Record<string, string>;
  lastUsedAt: string | null;
  usedByAgents: string[];  // agent names
  createdAt: string;
  updatedAt: string;
}

/** A memory store */
export interface MemoryStore {
  id: string;
  workspaceId: string | null;
  scopeType: "chat" | "agent" | "shared" | string;
  name: string;
  description: string;
  chatReadAccess: "none" | "read" | string;
  linkedAgentIds: string[];
  linkedAgentNames: string[];
  primaryForAgentIds: string[];
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A single memory entry */
export interface MemoryEntry {
  id: string;
  storeId: string;
  key: string;
  content: string;
  kind: string;
  sourceSessionId: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  confidence: number;
  recallCount: number;
  lastRecalledAt: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Represents a running or completed agent session inside a workspace.
 *  Each agent operates in its own git worktree branched off the main repo. */
export interface AgentInstance {
  /** Local ID — typically the conversation ID */
  id: string;
  /** Workspace ID this agent belongs to */
  workspaceId: string;
  /** Display label, e.g. "Agent 1" or conversation title */
  label: string;
  /** Current status */
  status: AgentStatus;
  /** Backend session ID from OpenCode */
  sessionId: string | null;
  /** Model being used (provider/model display string) */
  modelLabel: string | null;
  /** GitHub issue URL to work on */
  issueUrl: string | null;

  // ── Worktree / branch ─────────────────────────────────────────
  /** Git branch this agent's worktree is based on */
  branch: string | null;
  /** Absolute path to this agent's worktree directory */
  worktreePath: string | null;

  // ── Streaming state ───────────────────────────────────────────
  /** Last few lines of streaming output for sidebar preview */
  streamPreview: string[];
  /** Current tool/step activity label, e.g. "Reading file..." */
  currentActivity: string | null;
  /** Thinking steps tracked during streaming */
  streamingSteps: ThinkingStepData[];
  /** Accumulated streaming text content */
  streamingContent: string;

  // ── Timestamps / errors ───────────────────────────────────────
  /** Timestamp when the agent started running */
  startedAt: string | null;
  /** Timestamp when the agent completed or errored */
  finishedAt: string | null;
  /** Error message if status is "error" */
  errorMessage: string | null;

  // ── Token / context usage ─────────────────────────────────────
  /** Latest token usage reported by the model for this session. */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  } | null;
}

/** Creates a new local chat conversation */
export function createLocalConversation(title = "New chat"): LocalChatConversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    sessionId: null,
    messages: [],
    isProcessing: false,
    streamingContent: "",
    streamingSteps: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates a new local chat message */
export function createLocalMessage(role: "user" | "assistant", content: string): LocalChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

/** Creates a new blank agent instance */
export function createAgentInstance(
  id: string,
  workspaceId: string,
  label: string,
  sessionId: string | null,
  modelLabel: string | null,
  branch: string | null = null,
  worktreePath: string | null = null,
  issueUrl: string | null = null,
): AgentInstance {
  return {
    id,
    workspaceId,
    label,
    sessionId,
    status: "idle",
    modelLabel,
    branch,
    worktreePath,
    issueUrl,
    streamPreview: [],
    currentActivity: null,
    streamingSteps: [],
    streamingContent: "",
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    tokenUsage: null,
  };
}
