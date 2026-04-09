import { memo, useEffect, useMemo, useState } from "react";
import { type Conversation, type GitHubAuthStatus, type OpenCodeConnection, type ProcessOutput, type RepoSlug, type Workspace } from "../lib/bindings";
import { useGitBranches } from "../hooks/useGitBranches";
import type { AgentInstance } from "../lib/types";
import { backendLabel, relTime } from "../lib/ui";
import { GlassSelect } from "./GlassSelect";
import { ActivityChart } from "./ActivityChart";
import { GitHubTab } from "./GitHubTab";
import { EnvironmentsTab } from "./EnvironmentsTab";

type Tab = "monitor" | "environments" | "github";

function statusText(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working...";
  if (agent.status === "complete" && agent.finishedAt) return `Completed ${relTime(agent.finishedAt)}`;
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

function statusBadge(status: AgentInstance["status"]): { dot: string; text: string; label: string } {
  switch (status) {
    case "running":
      return { dot: "bg-[var(--color-accent)]", text: "text-[var(--color-accent-hover)]", label: "running" };
    case "complete":
      return { dot: "bg-[var(--color-success)]", text: "text-[var(--color-success-text)]", label: "done" };
    case "error":
      return { dot: "bg-[var(--color-danger)]", text: "text-[var(--color-danger-text-light)]", label: "error" };
    default:
      return { dot: "bg-[var(--scrollbar-thumb)]", text: "text-[var(--text-muted)]", label: "idle" };
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface WorkspaceViewProps {
  workspace: Workspace;
  conversations: Conversation[];
  connection: OpenCodeConnection | null;
  processOutput: ProcessOutput[];
  gitStatus: string;
  gitDiffStat: string;
  agents: AgentInstance[];

  onSelectConversation: (id: string) => void;
  onStartOpenCode: () => void;
  onStopOpenCode: () => void;
  onNewAgent: () => void;
  onFocusAgent: (id: string) => void;
  onManageAgent: (id: string) => void;
  /** Open the right-side git changes dock. */
  onOpenChanges?: () => void;
  /** Open the right-side terminal dock. */
  onOpenTerminal?: () => void;
  onWorkspaceBranchChange: (branch: string) => Promise<void>;
  loading: boolean;
  githubAuthStatus: GitHubAuthStatus | null;
  githubSlug: RepoSlug | null;
  onNavigateToSettings: () => void;
  onGitHubSlugChange: (slug: RepoSlug) => void;
}

export function WorkspaceView({
  workspace,
  conversations,
  connection,
  processOutput,
  gitStatus,
  gitDiffStat,
  agents,
  onSelectConversation,
  onStartOpenCode,
  onStopOpenCode,
  onNewAgent,
  onFocusAgent,
  onManageAgent,
  onOpenChanges,
  onOpenTerminal,
  onWorkspaceBranchChange,
  loading,
  githubAuthStatus,
  githubSlug,
  onNavigateToSettings,
  onGitHubSlugChange,
}: WorkspaceViewProps) {
  const [tab, setTab] = useState<Tab>("monitor");
  const [branchDraft, setBranchDraft] = useState(workspace.branch ?? "");
  const [branchBusy, setBranchBusy] = useState(false);
  const runningCount = agents.filter((a) => a.status === "running").length;
  const erroredCount = agents.filter((a) => a.status === "error").length;
  const { localBranches } = useGitBranches(workspace.repo_path, true);
  const branchOptions = useMemo(
    () => localBranches.map((branch) => ({
      value: branch.name,
      label: `${branch.name}${branch.is_current ? " (current)" : ""}`,
    })),
    [localBranches],
  );

  useEffect(() => {
    setBranchDraft(workspace.branch ?? "");
  }, [workspace.branch, workspace.id]);

  async function handleBranchChange(nextBranch: string) {
    setBranchDraft(nextBranch);
    setBranchBusy(true);
    try {
      await onWorkspaceBranchChange(nextBranch);
    } finally {
      setBranchBusy(false);
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
        {/* Header */}
        <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-[var(--color-accent-ink)]"
                style={{
                  background: "var(--color-accent)",
                  boxShadow: "var(--shadow-glow-accent)",
                }}
              >
                {workspace.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                  {workspace.name}
                </h1>
                <p className="text-[10px] text-[var(--text-muted)] truncate">
                  {backendLabel(workspace.backend)} · {workspace.repo_path}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onNewAgent}
                disabled={loading}
                className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-50"
              >
                New agent
              </button>
              {connection ? (
                <button
                  onClick={onStopOpenCode}
                  disabled={loading}
                  className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={onStartOpenCode}
                  disabled={loading || workspace.backend !== "opencode"}
                  className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
                >
                  Start
                </button>
              )}
            </div>
          </div>

          {/* Tabs + compact status strip */}
          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="flex gap-1">
              {(["monitor", "environments", "github"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-xl text-[11px] font-semibold capitalize transition-all ${
                    tab === t
                      ? "btn-ink"
                      : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t === "environments" ? "environments" : t}
                  {t === "monitor" && agents.length > 0 && (
                    <span className="ml-1.5 text-[9px] opacity-70">{agents.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* live status pill strip */}
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${connection ? "bg-[var(--color-success)]" : "bg-[var(--scrollbar-thumb)]"}`} />
                {connection ? "backend up" : "backend idle"}
              </span>
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--color-accent-hover)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                  {runningCount} running
                </span>
              )}
              {erroredCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--color-danger-text-light)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)]" />
                  {erroredCount} error{erroredCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Activity chart */}
        <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)]">
          <ActivityChart agents={agents} />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4" style={{ minHeight: 0 }}>
          {tab === "monitor" && (
            <MonitorView
              agents={agents}
              conversations={conversations}
              loading={loading}
              onNewAgent={onNewAgent}
              onFocusAgent={onFocusAgent}
              onManageAgent={onManageAgent}
              onOpenChanges={onOpenChanges}
              onOpenTerminal={onOpenTerminal}
              onSelectConversation={onSelectConversation}
            />
          )}

          {tab === "environments" && (
            <EnvironmentsTab workspace={workspace} />
          )}

          {tab === "github" && (
            <GitHubTab
              authStatus={githubAuthStatus}
              slug={githubSlug}
              repoPath={workspace.worktree_path ?? workspace.repo_path}
              onNavigateToSettings={onNavigateToSettings}
              onSlugChange={onGitHubSlugChange}
            />
          )}
        </div>
      </div>

      {/* ── Settings sidebar ──────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col overflow-hidden border-l border-[var(--glass-border)]">
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--glass-border)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            Workspace settings
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4" style={{ minHeight: 0 }}>
          {/* Runtime info */}
          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Runtime</p>
            <div className="rounded-2xl glass-card-static p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    connection
                      ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]"
                      : "bg-[var(--surface-ink-5)] text-[var(--text-muted)]"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${connection ? "bg-[var(--color-success)]" : "bg-[var(--scrollbar-thumb)]"}`} />
                  {connection ? "connected" : "stopped"}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{backendLabel(workspace.backend)}</span>
              </div>

              <dl className="space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)] shrink-0">Repository</dt>
                  <dd className="font-mono text-[10px] text-[var(--text-primary)] truncate text-right" title={workspace.repo_path}>
                    {workspace.repo_path.split("/").slice(-2).join("/")}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)] shrink-0">Agents</dt>
                  <dd className="font-medium text-[var(--text-primary)]">
                    {agents.length}
                    {runningCount > 0 && (
                      <span className="text-[var(--color-accent)] ml-1">({runningCount} running)</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)] shrink-0">Updated</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{relTime(workspace.updated_at)}</dd>
                </div>
              </dl>

              {connection && (
                <div className="rounded-xl bg-[var(--surface-ink-3)] p-2 text-[10px] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)] mb-0.5">Endpoint</p>
                  <p className="break-all font-mono text-[9px]">{connection.base_url}</p>
                </div>
              )}
            </div>
          </section>

          {/* Branch */}
          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Default branch</p>
            <div className="rounded-2xl glass-card-static p-3 space-y-2">
              {branchOptions.length > 0 ? (
                <GlassSelect
                  value={branchDraft}
                  onChange={(value) => { void handleBranchChange(value); }}
                  options={branchOptions}
                />
              ) : (
                <p className="text-[11px] font-mono text-[var(--text-primary)]">
                  {workspace.branch ?? "current repo branch"}
                </p>
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                New agents use this as their base branch.{branchBusy ? " Saving…" : ""}
              </p>
            </div>
          </section>

          {/* Git snapshot */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Git snapshot</p>
              {onOpenChanges && (
                <button
                  onClick={onOpenChanges}
                  className="h-5 px-2 rounded-lg btn-glass text-[9px] font-semibold"
                >
                  Open diff
                </button>
              )}
            </div>
            <div className="rounded-2xl glass-card-static p-3 space-y-2">
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1">Status</p>
                <pre className="rounded-xl bg-[var(--surface-ink-4)] p-2 text-[10px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap max-h-24 scrollbar-thin">
                  {gitStatus || "Working tree clean"}
                </pre>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1">Diff stat</p>
                <pre className="rounded-xl bg-[var(--surface-ink-4)] p-2 text-[10px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap max-h-24 scrollbar-thin">
                  {gitDiffStat || "No diff"}
                </pre>
              </div>
            </div>
          </section>

          {/* Process output */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Process output</p>
              {onOpenTerminal && (
                <button
                  onClick={onOpenTerminal}
                  className="h-5 px-2 rounded-lg btn-glass text-[9px] font-semibold"
                >
                  Terminal
                </button>
              )}
            </div>
            <div className="rounded-2xl bg-[var(--log-bg)] p-3 space-y-0.5 font-mono text-[10px] leading-5 max-h-48 overflow-y-auto scrollbar-thin">
              {processOutput.length === 0 ? (
                <div className="text-[var(--scrollbar-thumb)]">No output yet.</div>
              ) : (
                processOutput.map((line, index) => (
                  <div key={`${line.process_id}-${index}`} className="break-words">
                    <span className={line.stream === "stderr" ? "text-[var(--log-stderr)]" : "text-[var(--log-stdout)]"}>
                      [{line.stream}]
                    </span>{" "}
                    <span className="text-[var(--text-inverse)]">{line.line}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ── Monitor view ────────────────────────────────────────────────────── */

interface MonitorViewProps {
  agents: AgentInstance[];
  conversations: Conversation[];
  loading: boolean;
  onNewAgent: () => void;
  onFocusAgent: (id: string) => void;
  onManageAgent: (id: string) => void;
  onOpenChanges?: () => void;
  onOpenTerminal?: () => void;
  onSelectConversation: (id: string) => void;
}

function MonitorView({
  agents,
  conversations,
  loading,
  onNewAgent,
  onFocusAgent,
  onManageAgent,
  onOpenChanges,
  onOpenTerminal,
  onSelectConversation,
}: MonitorViewProps) {
  const sortedAgents = useMemo(() => {
    const order: Record<AgentInstance["status"], number> = {
      running: 0,
      error: 1,
      idle: 2,
      complete: 3,
    };
    return [...agents].sort((a, b) => {
      const byStatus = order[a.status] - order[b.status];
      if (byStatus !== 0) return byStatus;
      const at = a.finishedAt ?? a.startedAt ?? "";
      const bt = b.finishedAt ?? b.startedAt ?? "";
      return bt.localeCompare(at);
    });
  }, [agents]);

  if (agents.length === 0 && conversations.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)]">No agents yet</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
          Create an agent to start working. Each agent gets its own worktree so it can work on a separate branch.
        </p>
        <button
          onClick={onNewAgent}
          disabled={loading}
          className="mt-4 h-8 px-4 rounded-2xl btn-ink text-[12px] font-semibold disabled:opacity-50"
        >
          Create first agent
        </button>
      </div>
    );
  }

  const agentIds = new Set(agents.map((a) => a.id));
  const orphanConversations = conversations.filter((c) => !agentIds.has(c.id));

  return (
    <div className="space-y-4">
      {sortedAgents.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sortedAgents.map((agent) => (
            <AgentMonitorCard
              key={agent.id}
              agent={agent}
              onFocusAgent={onFocusAgent}
              onManageAgent={onManageAgent}
              onOpenChanges={onOpenChanges}
              onOpenTerminal={onOpenTerminal}
            />
          ))}
        </div>
      )}

      {orphanConversations.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2 px-1">
            Other conversations
          </h3>
          <div className="space-y-1.5">
            {orphanConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                onSelectConversation={onSelectConversation}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Agent monitor card ──────────────────────────────────────────────── */

interface AgentMonitorCardProps {
  agent: AgentInstance;
  onFocusAgent: (id: string) => void;
  onManageAgent: (id: string) => void;
  onOpenChanges?: () => void;
  onOpenTerminal?: () => void;
}

const AgentMonitorCard = memo(function AgentMonitorCard({
  agent,
  onFocusAgent,
  onManageAgent,
  onOpenChanges,
  onOpenTerminal,
}: AgentMonitorCardProps) {
  const badge = statusBadge(agent.status);
  const isRunning = agent.status === "running";
  const hasSteps = agent.streamingSteps.length > 0;
  const recentSteps = hasSteps ? agent.streamingSteps.slice(-3) : [];
  const totalTokens = agent.tokenUsage
    ? agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens
    : 0;

  return (
    <div
      className={`rounded-2xl glass-card p-4 transition-all duration-200 hover:shadow-[var(--shadow-glass-sm)] ${
        isRunning ? "ring-1 ring-[var(--color-accent)] ring-opacity-30" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => onFocusAgent(agent.id)}
          className="min-w-0 flex-1 text-left group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${badge.dot} ${isRunning ? "animate-pulse" : ""}`}
            />
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--color-accent-hover)] transition-colors">
              {agent.label}
            </p>
            <span className={`text-[9px] font-bold uppercase tracking-wider ${badge.text} shrink-0`}>
              {badge.label}
            </span>
          </div>
          <p
            className={`text-[11px] mt-1 truncate ${
              agent.status === "error"
                ? "text-[var(--color-danger-text-light)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {statusText(agent)}
          </p>
        </button>

        <button
          onClick={() => onManageAgent(agent.id)}
          className="h-7 w-7 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          title="Agent settings"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      {/* Badge row — branch, worktree, model */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {agent.branch && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)] max-w-[160px] truncate"
            title={`Branch: ${agent.branch}`}
          >
            <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="6" cy="6" r="2" />
              <circle cx="6" cy="18" r="2" />
              <circle cx="18" cy="9" r="2" />
              <path strokeLinecap="round" d="M6 8v8M18 11c0 4-6 3-6 7" />
            </svg>
            <span className="truncate">{agent.branch}</span>
          </span>
        )}
        {agent.worktreePath && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]"
            title={agent.worktreePath}
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h6l2 2h8v10a2 2 0 01-2 2H4z" />
            </svg>
            worktree
          </span>
        )}
        {agent.modelLabel && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-muted)] max-w-[160px] truncate"
            title={agent.modelLabel}
          >
            {agent.modelLabel}
          </span>
        )}
        {totalTokens > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-muted)] tabular-nums"
            title={`in ${agent.tokenUsage?.inputTokens ?? 0} · out ${agent.tokenUsage?.outputTokens ?? 0}`}
          >
            {formatTokens(totalTokens)} tok
          </span>
        )}
      </div>

      {/* Recent steps tail */}
      {recentSteps.length > 0 && (
        <div className="mt-3 rounded-xl bg-[var(--surface-ink-3)] px-2.5 py-2 space-y-0.5">
          {recentSteps.map((step, i) => (
            <div
              key={`${step.id ?? i}-${i}`}
              className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] truncate"
            >
              <span
                className={`w-1 h-1 rounded-full shrink-0 ${
                  step.status === "running"
                    ? "bg-[var(--color-accent)] animate-pulse"
                    : step.status === "error"
                      ? "bg-[var(--color-danger)]"
                      : "bg-[var(--scrollbar-thumb)]"
                }`}
              />
              <span className="font-mono truncate">
                {step.title ?? step.tool ?? "step"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-3">
        <button
          onClick={() => onFocusAgent(agent.id)}
          className="h-7 px-3 rounded-xl btn-ink text-[10px] font-semibold"
        >
          Open chat
        </button>
        {onOpenChanges && (
          <button
            onClick={onOpenChanges}
            className="h-7 px-2.5 rounded-xl btn-glass text-[10px] font-semibold"
            title="Show changes"
          >
            Diff
          </button>
        )}
        {onOpenTerminal && (
          <button
            onClick={onOpenTerminal}
            className="h-7 px-2.5 rounded-xl btn-glass text-[10px] font-semibold"
            title="Open terminal in this workspace"
          >
            Terminal
          </button>
        )}
        {agent.status === "running" && agent.startedAt && (
          <span className="ml-auto text-[9px] text-[var(--text-muted)] tabular-nums">
            started {relTime(agent.startedAt)}
          </span>
        )}
        {agent.status !== "running" && agent.finishedAt && (
          <span className="ml-auto text-[9px] text-[var(--text-muted)] tabular-nums">
            {relTime(agent.finishedAt)}
          </span>
        )}
      </div>
    </div>
  );
});

const ConversationRow = memo(function ConversationRow({
  conversation,
  onSelectConversation,
}: {
  conversation: Conversation;
  onSelectConversation: (id: string) => void;
}) {
  return (
    <button onClick={() => onSelectConversation(conversation.id)} className="w-full rounded-2xl glass-card p-3 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{conversation.title ?? "Untitled conversation"}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {backendLabel(conversation.backend)}{conversation.is_active ? " · active" : ""}
          </p>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">{relTime(conversation.updated_at)}</span>
      </div>
    </button>
  );
});
