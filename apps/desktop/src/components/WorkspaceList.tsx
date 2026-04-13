import { memo, useMemo, useState } from "react";
import type { Workspace } from "../lib/bindings";
import type { AgentInstance } from "../lib/types";
import { backendLabel, relTime } from "../lib/ui";
import { StatusPill } from "./StatusIndicator";
import { BranchIcon } from "./shared/Icons";

/* ─── Props ────────────────────────────────────────────────────────── */

interface Props {
  workspaces: Workspace[];
  agents: AgentInstance[];
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
}

/* ─── Component ────────────────────────────────────────────────────── */

export function WorkspaceList({ workspaces, agents, onSelect, onCreateNew, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Attach running agent counts per workspace
  const agentsByWorkspace = useMemo(() => {
    const map = new Map<string, { running: number; total: number }>();
    for (const agent of agents) {
      const prev = map.get(agent.workspaceId) ?? { running: 0, total: 0 };
      prev.total += 1;
      if (agent.status === "running") prev.running += 1;
      map.set(agent.workspaceId, prev);
    }
    return map;
  }, [agents]);

  // Global stats
  const totalRunning = agents.filter((a) => a.status === "running").length;

  /* ── Empty state ────────────────────────────────────────────────── */
  if (workspaces.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Work mode
          </p>
          <h1
            className="mt-3 font-display font-medium tracking-[-0.02em] text-[var(--text-primary)]"
            style={{ fontSize: "var(--text-2xl)", lineHeight: 1.15 }}
          >
            No workspaces yet
          </h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Create a workspace from a local git repository.
            Each workspace can run multiple agents in isolated worktrees.
          </p>
          <button
            onClick={onCreateNew}
            className="btn-accent mt-6 h-9 rounded-full px-5 text-[12px] font-semibold"
          >
            Create workspace
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated state ────────────────────────────────────────────── */
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8">

        {/* Header */}
        <div className="stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Work mode
              </p>
              <h1 className="mt-2 font-display text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
                Workspaces
              </h1>
              <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
                {totalRunning > 0 && (
                  <span className="text-[var(--color-accent)]"> · {totalRunning} agent{totalRunning !== 1 ? "s" : ""} running</span>
                )}
              </p>
            </div>
            <button
              onClick={onCreateNew}
              className="btn-accent mt-1 h-8 shrink-0 rounded-full px-4 text-[11px] font-semibold"
            >
              New workspace
            </button>
          </div>
        </div>

        {/* Separator */}
        <hr className="my-6 border-none h-px bg-[var(--glass-border)]" />

        {/* Workspace list — flat rows, not cards */}
        <div className="space-y-0">
          {workspaces.map((workspace, i) => {
            const agentInfo = agentsByWorkspace.get(workspace.id);
            return (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                agentCount={agentInfo?.total ?? 0}
                runningCount={agentInfo?.running ?? 0}
                confirmDelete={confirmDeleteId === workspace.id}
                onSelect={onSelect}
                onDelete={onDelete}
                onConfirmDeleteChange={setConfirmDeleteId}
                delay={60 + i * 40}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Workspace Row ────────────────────────────────────────────────── */

const WorkspaceRow = memo(function WorkspaceRow({
  workspace,
  agentCount,
  runningCount,
  confirmDelete,
  onSelect,
  onDelete,
  onConfirmDeleteChange,
  delay,
}: {
  workspace: Workspace;
  agentCount: number;
  runningCount: number;
  confirmDelete: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onConfirmDeleteChange: (id: string | null) => void;
  delay: number;
}) {
  return (
    <div
      className="group stagger-in flex items-center gap-4 border-t border-[var(--glass-border)] first:border-none py-4 px-2 -mx-2 rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-ink-3)] cursor-pointer"
      style={{ "--stagger-delay": `${delay}ms` } as React.CSSProperties}
      onClick={() => onSelect(workspace.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(workspace.id); }}
      tabIndex={0}
      role="button"
    >
      {/* Initial */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-ink-4)] font-display text-[15px] font-semibold text-[var(--text-primary)]">
        {workspace.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
            {workspace.name}
          </p>
          {runningCount > 0 && (
            <StatusPill status="running" label={`${runningCount} running`} />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>{backendLabel(workspace.backend)}</span>
          {workspace.branch && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                <BranchIcon />
                {workspace.branch}
              </span>
            </>
          )}
          {agentCount > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span>{agentCount} agent{agentCount !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span className="hidden sm:block shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
        {relTime(workspace.updated_at)}
      </span>

      {/* Path */}
      <span className="hidden lg:block shrink-0 max-w-[200px] truncate font-mono text-[10px] text-[var(--text-muted)] opacity-60">
        {workspace.worktree_path ?? workspace.repo_path}
      </span>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirmDelete) {
            onDelete(workspace.id);
            onConfirmDeleteChange(null);
          } else {
            onConfirmDeleteChange(workspace.id);
          }
        }}
        onBlur={() => { if (confirmDelete) onConfirmDeleteChange(null); }}
        className={`shrink-0 transition-all duration-150 ${
          confirmDelete
            ? "rounded-[var(--radius-xs)] bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] text-[var(--color-danger)] px-2 py-1 text-[10px] font-semibold opacity-100"
            : "opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
        }`}
        title={confirmDelete ? "Click again to confirm" : "Delete workspace"}
      >
        {confirmDelete ? "Delete?" : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </div>
  );
});
