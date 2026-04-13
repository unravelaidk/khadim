import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  type Conversation,
  type GitHubAuthStatus,
  type OpenCodeConnection,
  type ProcessOutput,
  type RepoSlug,
  type Workspace,
} from "../lib/bindings";
import { useGitBranches } from "../hooks/useGitBranches";
import type { AgentInstance } from "../lib/types";
import { backendLabel, executionTargetLabel, relTime } from "../lib/ui";
import { agentStatusText, formatTokens } from "../lib/agent-utils";
import { StatusIndicator, StatusPill } from "./StatusIndicator";
import { GlassSelect } from "./GlassSelect";
import { GitHubTab } from "./GitHubTab";
import { BranchIcon } from "./shared/Icons";

/* ─── Helpers ──────────────────────────────────────────────────────── */

const statusText = agentStatusText;

/* ─── Props ────────────────────────────────────────────────────────── */

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
  onWorkspaceBranchChange: (branch: string) => Promise<void>;
  loading: boolean;
  githubAuthStatus: GitHubAuthStatus | null;
  githubSlug: RepoSlug | null;
  onNavigateToSettings: () => void;
  onGitHubSlugChange: (slug: RepoSlug) => void;
}

/* ─── Tabs ─────────────────────────────────────────────────────────── */
type WorkspaceTab = "agents" | "repository" | "config" | "github" | "logs";

/* ─── Main Component ───────────────────────────────────────────────── */

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
  onWorkspaceBranchChange,
  loading,
  githubAuthStatus,
  githubSlug,
  onNavigateToSettings,
  onGitHubSlugChange,
}: WorkspaceViewProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("agents");
  const [branchDraft, setBranchDraft] = useState(workspace.branch ?? "");
  const [branchBusy, setBranchBusy] = useState(false);

  const runningCount = agents.filter((a) => a.status === "running").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  const { localBranches } = useGitBranches(workspace.repo_path, true);
  const branchOptions = useMemo(
    () => localBranches.map((b) => ({
      value: b.name,
      label: `${b.name}${b.is_current ? " (current)" : ""}`,
    })),
    [localBranches],
  );

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const rank = (s: AgentInstance["status"]): number => {
        if (s === "running") return 0;
        if (s === "error") return 1;
        if (s === "complete") return 2;
        return 3;
      };
      return rank(a.status) - rank(b.status);
    });
  }, [agents]);

  useEffect(() => {
    setBranchDraft(workspace.branch ?? "");
  }, [workspace.branch, workspace.id]);

  const handleBranchChange = useCallback(async (next: string) => {
    setBranchDraft(next);
    setBranchBusy(true);
    try {
      await onWorkspaceBranchChange(next);
    } finally {
      setBranchBusy(false);
    }
  }, [onWorkspaceBranchChange]);

  const repoPath = workspace.worktree_path ?? workspace.repo_path;

  const tabs: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: "agents", label: "Agents", count: agents.length },
    { id: "repository", label: "Repository" },
    { id: "config", label: "Config" },
    { id: "github", label: "GitHub" },
    { id: "logs", label: "Logs", count: processOutput.length > 0 ? processOutput.length : undefined },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Compact header with key info + actions ─────────────── */}
      <div className="shrink-0 px-6 py-5 border-b border-[var(--glass-border)]">
        <div className="flex items-start justify-between gap-4 max-w-5xl">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-medium tracking-[-0.01em] text-[var(--text-primary)]">
                {workspace.name}
              </h1>
              <div className="flex items-center gap-1.5">
                <StatusPill
                  status={connection ? "running" : "idle"}
                  label={connection ? "Connected" : "Idle"}
                />
                {runningCount > 0 && (
                  <StatusPill status="running" label={`${runningCount} running`} />
                )}
                {errorCount > 0 && (
                  <StatusPill status="error" label={`${errorCount} error${errorCount > 1 ? "s" : ""}`} />
                )}
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <span>{backendLabel(workspace.backend)}</span>
              <span className="opacity-40">·</span>
              <span>{executionTargetLabel(workspace.execution_target)}</span>
              {workspace.branch && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <BranchIcon />
                    {workspace.branch}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={onNewAgent}
              disabled={loading}
              className="btn-accent h-10 rounded-full px-5 text-[13px] font-semibold disabled:opacity-50"
            >
              New agent
            </button>
            {connection ? (
              <button
                onClick={onStopOpenCode}
                disabled={loading}
                className="btn-glass h-10 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
              >
                Stop
              </button>
            ) : workspace.backend === "opencode" ? (
              <button
                onClick={onStartOpenCode}
                disabled={loading}
                className="btn-glass h-10 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
              >
                Start
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────── */}
      <div className="shrink-0 px-6 border-b border-[var(--glass-border)]">
        <nav className="flex gap-1 -mb-px max-w-5xl" aria-label="Workspace sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-[13px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.count != null && (
                  <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                    activeTab === tab.id
                      ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                      : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-[var(--color-accent)]" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl px-6 py-6">

          {/* AGENTS TAB — the primary surface */}
          {activeTab === "agents" && (
            <div className="animate-in">
              {sortedAgents.length > 0 ? (
                <div className="space-y-1">
                  {sortedAgents.map((agent) => (
                    <AgentRow
                      key={agent.id}
                      agent={agent}
                      onFocus={() => onFocusAgent(agent.id)}
                      onManage={() => onManageAgent(agent.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyAgents onNewAgent={onNewAgent} loading={loading} />
              )}
            </div>
          )}

          {/* REPOSITORY TAB */}
          {activeTab === "repository" && (
            <div className="animate-in space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock label="Status" content={gitStatus || "Working tree clean"} />
                <CodeBlock label="Diff stat" content={gitDiffStat || "No changes"} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">
                  Repo path
                </p>
                <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                  {repoPath}
                </p>
              </div>
            </div>
          )}

          {/* CONFIG TAB */}
          {activeTab === "config" && (
            <div className="animate-in">
              <div className="grid gap-8 lg:grid-cols-2 max-w-3xl">
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-secondary)]">Default branch</p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                    New agents branch from here.
                  </p>
                  {branchOptions.length > 0 ? (
                    <GlassSelect
                      value={branchDraft}
                      onChange={(v) => { void handleBranchChange(v); }}
                      options={branchOptions}
                      className="mt-2"
                    />
                  ) : (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--surface-ink-4)] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                      {workspace.branch ?? "repo default"}
                    </p>
                  )}
                  {branchBusy && (
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">Saving…</p>
                  )}
                </div>

                <div>
                  <p className="text-[14px] font-medium text-[var(--text-secondary)]">Runtime</p>
                  <dl className="mt-2 space-y-3 text-[13px]">
                    <DetailRow label="Backend" value={backendLabel(workspace.backend)} />
                    <DetailRow label="Target" value={executionTargetLabel(workspace.execution_target)} />
                    <DetailRow label="Worktree root" value={workspace.worktree_path ?? "workspace root"} mono />
                    <DetailRow label="Updated" value={relTime(workspace.updated_at)} />
                    {connection && (
                      <DetailRow label="Endpoint" value={connection.base_url} mono />
                    )}
                  </dl>
                </div>
              </div>
            </div>
          )}

          {/* GITHUB TAB */}
          {activeTab === "github" && (
            <div className="animate-in">
              <GitHubTab
                authStatus={githubAuthStatus}
                slug={githubSlug}
                repoPath={repoPath}
                onNavigateToSettings={onNavigateToSettings}
                onSlugChange={onGitHubSlugChange}
              />
            </div>
          )}

          {/* LOGS TAB */}
          {activeTab === "logs" && (
            <div className="animate-in">
              <div className="rounded-[var(--radius-md)] overflow-hidden" style={{ background: "var(--log-bg)" }}>
                <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--glass-border)]">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scrollbar-thumb)]">
                    Process output
                  </span>
                  <span className="font-mono text-[11px] text-[var(--scrollbar-thumb)]">
                    {processOutput.length} lines
                  </span>
                </div>
                <div
                  className="p-4 overflow-y-auto scrollbar-thin font-mono text-[13px] leading-6 space-y-0.5"
                  style={{ maxHeight: "calc(100vh - 300px)" }}
                >
                  {processOutput.length === 0 ? (
                    <p className="text-[var(--scrollbar-thumb)]">No output yet. Start the backend to see logs here.</p>
                  ) : (
                    processOutput.map((line, i) => (
                      <div key={`${line.process_id}-${i}`} className="break-words">
                        <span className={line.stream === "stderr" ? "text-[var(--log-stderr)]" : "text-[var(--log-stdout)]"}>
                          [{line.stream}]
                        </span>{" "}
                        <span className="text-[var(--text-inverse)]">{line.line}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ─── Agent Row (redesigned) ───────────────────────────────────────── */

const AgentRow = memo(function AgentRow({
  agent,
  onFocus,
  onManage,
}: {
  agent: AgentInstance;
  onFocus: () => void;
  onManage: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-4 rounded-[var(--radius-md)] px-4 py-4 transition-colors hover:bg-[var(--surface-ink-3)] cursor-pointer"
      onClick={onFocus}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFocus(); }}
    >
      {/* Status indicator — shape + color */}
      <StatusIndicator status={agent.status} size="lg" />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">
            {agent.label}
          </p>
          {agent.branch && (
            <span className="truncate rounded-md bg-[var(--surface-ink-4)] px-2 py-1 font-mono text-[12px] text-[var(--text-muted)]">
              {agent.branch}
            </span>
          )}
        </div>
        <p
          className={`mt-1 truncate text-[13px] ${
            agent.status === "error"
              ? "text-[var(--color-danger-text-light)]"
              : agent.status === "running"
                ? "text-[var(--color-accent)]"
                : "text-[var(--text-muted)]"
          }`}
        >
          {statusText(agent)}
        </p>
      </div>

      {/* Token usage (if available) */}
      {agent.tokenUsage && (agent.tokenUsage.inputTokens > 0 || agent.tokenUsage.outputTokens > 0) && (
        <span className="hidden md:inline-flex shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
          {formatTokens(agent.tokenUsage.inputTokens)} in · {formatTokens(agent.tokenUsage.outputTokens)} out
        </span>
      )}

      {/* Actions — always visible, not hidden on hover */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onFocus(); }}
          className="h-9 rounded-[var(--radius-sm)] px-4 text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
        >
          Chat
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onManage(); }}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
          title="Settings"
        >
          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
});

/* ─── Empty Agents ─────────────────────────────────────────────────── */

function EmptyAgents({ onNewAgent, loading }: { onNewAgent: () => void; loading: boolean }) {
  return (
    <div className="py-20 text-center">
      <div className="mx-auto max-w-md">
        <p className="font-display text-xl font-medium text-[var(--text-primary)]">
          No agents yet
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
          Each agent works in its own branch and worktree.
          Give it a task and it'll get to work — you can run
          multiple agents in parallel.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={onNewAgent}
            disabled={loading}
            className="btn-accent h-11 rounded-full px-8 text-[14px] font-semibold disabled:opacity-50"
          >
            Create first agent
          </button>
          <div className="flex items-center gap-5 text-[12px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded bg-[var(--surface-ink-4)] px-2 py-1 font-mono text-[11px]">⌘P</kbd>
              Find files
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded bg-[var(--surface-ink-4)] px-2 py-1 font-mono text-[11px]">⌘`</kbd>
              Terminal
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Atoms ────────────────────────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className={`text-right text-[var(--text-primary)] ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <pre
        className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--surface-ink-4)] p-4 font-mono text-[13px] leading-relaxed text-[var(--text-secondary)]"
        style={{ maxHeight: 320 }}
      >
        {content}
      </pre>
    </div>
  );
}
