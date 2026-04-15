import React, { memo, useMemo, useState } from "react";
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

export const WorkspaceList = memo(function WorkspaceList({ workspaces, agents, onSelect, onCreateNew, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const totalRunning = agents.filter((a) => a.status === "running").length;
  const totalAgents = agents.length;

  /* ── Empty state ────────────────────────────────────────────────── */
  if (workspaces.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="stagger-in max-w-sm text-center" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[16px] bg-[var(--surface-ink-4)]">
            <i className="ri-folder-3-line text-[24px] leading-none text-[var(--text-muted)]" />
          </div>
          <h1
            className="font-display font-medium tracking-[-0.02em] text-[var(--text-primary)]"
            style={{ fontSize: "var(--text-xl)" }}
          >
            No workspaces yet
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Create a workspace from a local git repository.
            Each workspace can run multiple agents in isolated worktrees.
          </p>
          <button
            onClick={onCreateNew}
            className="btn-ink mt-6 h-9 rounded-full px-5 text-[12px] font-semibold"
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
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Work mode
              </p>
              <h1 className="mt-2 font-display font-medium leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]" style={{ fontSize: "clamp(1.5rem, 2vw + 0.5rem, 1.75rem)" }}>
                Workspaces
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {/* Compact stats */}
              <div className="hidden sm:flex items-center gap-3 text-[11px] tabular-nums text-[var(--text-muted)]">
                <span>{workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}</span>
                {totalAgents > 0 && (
                  <>
                    <span className="opacity-30">·</span>
                    <span>{totalAgents} agent{totalAgents !== 1 ? "s" : ""}</span>
                  </>
                )}
                {totalRunning > 0 && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="text-[var(--color-accent)]">{totalRunning} running</span>
                  </>
                )}
              </div>
              <button
                onClick={onCreateNew}
                className="btn-ink h-8 shrink-0 rounded-full px-4 text-[11px] font-semibold"
              >
                New workspace
              </button>
            </div>
          </div>
        </div>

        {/* Separator */}
        <hr className="my-6 border-none h-px bg-[var(--glass-border)]" />

        {/* Workspace grid — two-column for wider screens, single for narrow */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {workspaces.map((workspace, i) => {
            const agentInfo = agentsByWorkspace.get(workspace.id);
            return (
              <WorkspaceCard
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
});

/* ─── Workspace Card ───────────────────────────────────────────────── */

const WorkspaceCard = memo(function WorkspaceCard({
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
  const initial = workspace.name.charAt(0).toUpperCase();

  // Generate a subtle hue from the workspace name for the initial badge
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < workspace.name.length; i++) h = (h + workspace.name.charCodeAt(i) * 37) % 360;
    return h;
  }, [workspace.name]);

  return (
    <div
      className="group stagger-in relative flex flex-col rounded-[16px] border border-[var(--glass-border)] bg-[var(--surface-card)] p-5 transition-[border-color,background] duration-[var(--duration-base)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--surface-card-hover)] cursor-pointer"
      style={{ "--stagger-delay": `${delay}ms` } as React.CSSProperties}
      onClick={() => onSelect(workspace.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(workspace.id); }}
      tabIndex={0}
      role="button"
    >
      {/* Top row: initial + name + status */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] font-display text-[14px] font-semibold"
          style={{
            background: `oklch(50% 0.04 ${hue} / 0.12)`,
            color: `oklch(75% 0.06 ${hue})`,
          }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
            {workspace.name}
          </p>
        </div>
        {runningCount > 0 && (
          <StatusPill status="running" label={`${runningCount} running`} />
        )}
      </div>

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
        <span>{backendLabel(workspace.backend)}</span>
        {workspace.branch && (
          <>
            <span className="opacity-30">·</span>
            <span className="inline-flex items-center gap-1 font-mono text-[10px]">
              <BranchIcon />
              {workspace.branch}
            </span>
          </>
        )}
        {agentCount > 0 && (
          <>
            <span className="opacity-30">·</span>
            <span>{agentCount} agent{agentCount !== 1 ? "s" : ""}</span>
          </>
        )}
      </div>

      {/* Footer: path + timestamp */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] text-[var(--text-muted)] opacity-50">
          {workspace.worktree_path ?? workspace.repo_path}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] opacity-60">
          {relTime(workspace.updated_at)}
        </span>
      </div>

      {/* Delete button — top-right, revealed on hover */}
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
        className={`absolute top-3 right-3 transition-all duration-150 ${
          confirmDelete
            ? "rounded-[var(--radius-xs)] bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] text-[var(--color-danger)] px-2 py-1 text-[10px] font-semibold opacity-100"
            : "opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
        }`}
        title={confirmDelete ? "Click again to confirm" : "Delete workspace"}
      >
        {confirmDelete ? "Delete?" : (
          <i className="ri-delete-bin-line text-[14px] leading-none" />
        )}
      </button>
    </div>
  );
});
