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
import { GlassSelect } from "./GlassSelect";
import { GitHubTab } from "./GitHubTab";

/* ─── Helpers ──────────────────────────────────────────────────────── */

function statusText(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working…";
  if (agent.status === "complete" && agent.finishedAt) return `Done ${relTime(agent.finishedAt)}`;
  if (agent.status === "complete") return "Done";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

function statusColor(status: AgentInstance["status"]): string {
  if (status === "running") return "var(--color-accent)";
  if (status === "complete") return "var(--color-success)";
  if (status === "error") return "var(--color-danger)";
  return "var(--scrollbar-thumb)";
}

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
  const [branchDraft, setBranchDraft] = useState(workspace.branch ?? "");
  const [branchBusy, setBranchBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);

  const runningCount = agents.filter((a) => a.status === "running").length;

  const { localBranches } = useGitBranches(workspace.repo_path, true);
  const branchOptions = useMemo(
    () =>
      localBranches.map((b) => ({
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* GitHub slide-over — renders on top, preserving main scroll */}
      {showGitHub && (
        <div className="absolute inset-0 z-30 flex flex-col animate-in" style={{ background: "var(--surface-bg)" }}>
          <div className="shrink-0 border-b border-[var(--glass-border)] px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setShowGitHub(false)}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{workspace.name} · GitHub</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <GitHubTab
              authStatus={githubAuthStatus}
              slug={githubSlug}
              repoPath={workspace.worktree_path ?? workspace.repo_path}
              onNavigateToSettings={onNavigateToSettings}
              onSlugChange={onGitHubSlugChange}
            />
          </div>
        </div>
      )}
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8">

        {/* ── Workspace Identity ──────────────────────────────────── */}
        <div className="stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                {backendLabel(workspace.backend)} · {executionTargetLabel(workspace.execution_target)}
              </p>
              <h1 className="mt-2 font-display text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
                {workspace.name}
              </h1>
              <p className="mt-2 truncate font-mono text-[11px] text-[var(--text-muted)]">{workspace.repo_path}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-1">
              <button
                onClick={onNewAgent}
                disabled={loading}
                className="btn-accent h-8 rounded-full px-4 text-[11px] font-semibold disabled:opacity-50"
              >
                New agent
              </button>
              {connection ? (
                <button
                  onClick={onStopOpenCode}
                  disabled={loading}
                  className="btn-glass h-8 rounded-full px-3 text-[11px] font-semibold disabled:opacity-50"
                >
                  Stop
                </button>
              ) : workspace.backend === "opencode" ? (
                <button
                  onClick={onStartOpenCode}
                  disabled={loading}
                  className="btn-glass h-8 rounded-full px-3 text-[11px] font-semibold disabled:opacity-50"
                >
                  Start
                </button>
              ) : null}
            </div>
          </div>

          {/* Status pills — inline, compact */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: connection ? "var(--color-success)" : "var(--scrollbar-thumb)" }}
              />
              {connection ? "Connected" : "Idle"}
            </Pill>
            {workspace.branch && (
              <Pill mono>
                <BranchIcon />
                {workspace.branch}
              </Pill>
            )}
            <Pill>{agents.length} agent{agents.length !== 1 ? "s" : ""}</Pill>
            {runningCount > 0 && <Pill accent>{runningCount} running</Pill>}
          </div>
        </div>

        {/* ── Separator ──────────────────────────────────────────── */}
        <hr className="my-8 border-none h-px bg-[var(--glass-border)]" />

        {/* ── Agent Roster ───────────────────────────────────────── */}
        <div className="stagger-in" style={{ "--stagger-delay": "80ms" } as React.CSSProperties}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-[20px] font-medium text-[var(--text-primary)]">Agents</h2>
            {sortedAgents.length > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {runningCount > 0
                  ? `${runningCount} working right now`
                  : "All quiet"}
              </span>
            )}
          </div>

          {sortedAgents.length > 0 ? (
            <div className="mt-4 space-y-1">
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
            <div className="mt-6 text-center">
              <p className="font-display text-[16px] font-medium text-[var(--text-secondary)]">
                No agents yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[var(--text-muted)]">
                Each agent works in its own branch and worktree.
                Create one to start.
              </p>
              <button
                onClick={onNewAgent}
                disabled={loading}
                className="btn-accent mt-4 h-8 rounded-full px-5 text-[11px] font-semibold disabled:opacity-50"
              >
                Create first agent
              </button>
            </div>
          )}
        </div>

        {/* ── Repository Pulse ───────────────────────────────────── */}
        <div className="mt-10 stagger-in" style={{ "--stagger-delay": "160ms" } as React.CSSProperties}>
          <h2 className="font-display text-[20px] font-medium text-[var(--text-primary)]">
            Repository
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CodeBlock label="Status" content={gitStatus || "Working tree clean"} />
            <CodeBlock label="Diff" content={gitDiffStat || "No changes"} />
          </div>
        </div>

        {/* ── Workspace Configuration ────────────────────────────── */}
        <div className="mt-10 stagger-in" style={{ "--stagger-delay": "240ms" } as React.CSSProperties}>
          <h2 className="font-display text-[20px] font-medium text-[var(--text-primary)]">
            Configuration
          </h2>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Default branch */}
            <div>
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Default branch</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
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

            {/* Runtime info */}
            <div>
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Runtime</p>
              <dl className="mt-2 space-y-1.5 text-[11px]">
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

        {/* ── Quick Links ────────────────────────────────────────── */}
        <div className="mt-10 stagger-in" style={{ "--stagger-delay": "300ms" } as React.CSSProperties}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGitHub(true)}
              className="btn-glass h-8 rounded-full px-3.5 text-[11px] font-semibold inline-flex items-center gap-1.5"
            >
              <GitHubIcon />
              GitHub
            </button>
            <button
              onClick={() => setShowLogs((p) => !p)}
              className="btn-glass h-8 rounded-full px-3.5 text-[11px] font-semibold inline-flex items-center gap-1.5"
            >
              <LogIcon />
              {showLogs ? "Hide logs" : "Logs"}
            </button>
          </div>

          {/* Inline logs */}
          {showLogs && (
            <div className="mt-4 rounded-[var(--radius-md)] overflow-hidden animate-in" style={{ background: "var(--log-bg)" }}>
              <div className="px-4 py-2 flex items-center justify-between border-b border-[var(--glass-border)]">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--scrollbar-thumb)]">
                  Process output
                </span>
                <span className="font-mono text-[9px] text-[var(--scrollbar-thumb)]">
                  {processOutput.length} lines
                </span>
              </div>
              <div
                className="p-4 overflow-y-auto scrollbar-thin font-mono text-[11px] leading-5 space-y-0.5"
                style={{ maxHeight: 280 }}
              >
                {processOutput.length === 0 ? (
                  <p className="text-[var(--scrollbar-thumb)]">No output yet.</p>
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
          )}
        </div>

        {/* ── Recent Conversations ───────────────────────────────── */}
        {conversations.length > 0 && (
          <div className="mt-10 pb-8 stagger-in" style={{ "--stagger-delay": "360ms" } as React.CSSProperties}>
            <h2 className="font-display text-[20px] font-medium text-[var(--text-primary)]">
              Conversations
            </h2>
            <div className="mt-4 space-y-0">
              {conversations.slice(0, 8).map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conversation={conv}
                  onSelect={() => onSelectConversation(conv.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

/* ─── Agent Row ────────────────────────────────────────────────────── */

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
      className="group flex items-center gap-4 rounded-[var(--radius-sm)] px-3 py-3 transition-colors hover:bg-[var(--surface-ink-3)] cursor-pointer"
      onClick={onFocus}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFocus(); }}
    >
      {/* Status dot */}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: statusColor(agent.status) }}
      />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
            {agent.label}
          </p>
          {agent.branch && (
            <span className="truncate rounded-md bg-[var(--surface-ink-4)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              {agent.branch}
            </span>
          )}
        </div>
        <p
          className={`mt-0.5 truncate text-[11px] ${
            agent.status === "error"
              ? "text-[var(--color-danger-text-light)]"
              : "text-[var(--text-muted)]"
          }`}
        >
          {statusText(agent)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onFocus(); }}
          className="h-7 rounded-[var(--radius-xs)] px-2.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
        >
          Chat
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onManage(); }}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
          title="Settings"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>
      </div>
    </div>
  );
});

/* ─── Conversation Row ─────────────────────────────────────────────── */

const ConversationRow = memo(function ConversationRow({
  conversation,
  onSelect,
}: {
  conversation: Conversation;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group flex w-full items-center justify-between gap-4 border-t border-[var(--glass-border)] px-1 py-3 text-left transition-colors first:border-none hover:bg-[var(--surface-ink-3)]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
          {conversation.title ?? "Untitled"}
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
          {backendLabel(conversation.backend)}
          {conversation.is_active ? " · active" : ""}
        </p>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
        {relTime(conversation.updated_at)}
      </span>
    </button>
  );
});

/* ─── Atoms ────────────────────────────────────────────────────────── */

function Pill({
  children,
  mono,
  accent,
}: {
  children: React.ReactNode;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
        accent
          ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
          : "bg-[var(--surface-ink-4)] text-[var(--text-secondary)]"
      } ${mono ? "font-mono" : ""}`}
    >
      {children}
    </span>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className={`text-right text-[var(--text-primary)] ${mono ? "font-mono text-[10px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <pre
        className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--surface-ink-4)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]"
        style={{ maxHeight: 240 }}
      >
        {content}
      </pre>
    </div>
  );
}

function BranchIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path strokeLinecap="round" d="M6 8v8M18 11c0 4-6 3-6 7" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h6" />
    </svg>
  );
}
