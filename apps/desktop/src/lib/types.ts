import type { ThinkingStepData } from "./bindings";

/** Top-level app mode: home (no workspace) vs workspace (entered a workspace) */
export type AppMode = "home" | "workspace";

/** Navigation tabs visible in home mode */
export type NavView = "workspaces" | "chat" | "settings";

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
  };
}
