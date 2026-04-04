import type { ThinkingStepData } from "./bindings";

/** Top-level interaction mode: chat (standalone LLM) vs work (workspace/agents) */
export type InteractionMode = "chat" | "work";

/** Sub-view within work mode when no workspace is entered yet */
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

/** Represents a running or completed agent session inside a workspace.
 *  Each agent operates in its own git worktree branched off the main repo. */
export interface AgentInstance {
  /** Local ID — typically the conversation ID */
  id: string;
  /** Display label, e.g. "Agent 1" or conversation title */
  label: string;
  /** Current status */
  status: AgentStatus;
  /** Backend session ID from OpenCode */
  sessionId: string | null;
  /** Model being used (provider/model display string) */
  modelLabel: string | null;

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
  label: string,
  sessionId: string | null,
  modelLabel: string | null,
  branch: string | null = null,
  worktreePath: string | null = null,
): AgentInstance {
  return {
    id,
    label,
    sessionId,
    status: "idle",
    modelLabel,
    branch,
    worktreePath,
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
