import { useState } from "react";
import type { Workspace } from "../lib/bindings";
import { backendLabel, executionTargetLabel, relTime } from "../lib/ui";

interface Props {
  workspaces: Workspace[];
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
}

export function WorkspaceList({ workspaces, onSelect, onCreateNew, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ minHeight: 0 }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">
            Workspaces
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Your workspaces
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Select a workspace to enter, or create a new one from a git repository.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Workspace cards */}
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="group relative text-left rounded-2xl glass-card p-4 flex flex-col cursor-pointer"
              onClick={() => onSelect(ws.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(ws.id); }}
              tabIndex={0}
              role="button"
            >
              {/* Delete button — top-right, visible on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDeleteId === ws.id) {
                    onDelete(ws.id);
                    setConfirmDeleteId(null);
                  } else {
                    setConfirmDeleteId(ws.id);
                  }
                }}
                onBlur={() => setConfirmDeleteId((prev) => (prev === ws.id ? null : prev))}
                className={`absolute top-2.5 right-2.5 z-10 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all duration-150 ${
                  confirmDeleteId === ws.id
                    ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)] border border-[var(--color-danger-border)] opacity-100"
                    : "opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] border border-transparent"
                }`}
                title={confirmDeleteId === ws.id ? "Click again to confirm" : "Delete workspace"}
              >
                {confirmDeleteId === ws.id ? (
                  "Delete?"
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>

              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "linear-gradient(135deg, var(--color-accent-subtle), var(--glass-bg))",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                  {relTime(ws.updated_at)}
                </span>
              </div>
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] leading-snug truncate mb-1">
                {ws.name}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {backendLabel(ws.backend)} · {executionTargetLabel(ws.execution_target)}
              </p>
              {ws.branch && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3H6m0-3h12a3 3 0 003-3V6a3 3 0 00-3-3H9a3 3 0 00-3 3v6z" />
                  </svg>
                  <span className="truncate">{ws.branch}</span>
                </p>
              )}
              <p className="text-[10px] text-[var(--text-muted)] mt-auto pt-3 truncate font-mono opacity-60">
                {ws.worktree_path ?? ws.repo_path}
              </p>
            </div>
          ))}

          {/* + New workspace card */}
          <button
            onClick={onCreateNew}
            className="group text-left rounded-2xl border-2 border-dashed border-[var(--glass-border-strong)] hover:border-[var(--color-accent-muted)] p-4 flex flex-col items-center justify-center min-h-[160px] transition-all duration-200 hover:bg-[var(--color-accent-subtle)]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--glass-bg)] group-hover:bg-[var(--color-accent-subtle)] border border-[var(--glass-border)] transition-colors">
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-[12px] font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] mt-3 transition-colors">
              New workspace
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              From a git repository
            </p>
          </button>
        </div>

        {/* Empty state — only when no workspaces at all */}
        {workspaces.length === 0 && (
          <div className="mt-4 rounded-2xl glass-card-static p-12 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-[var(--color-accent-subtle)] mb-4">
              <svg className="w-7 h-7 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No workspaces yet
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
              Create your first workspace from a local git repository to get started.
            </p>
            <button
              onClick={onCreateNew}
              className="mt-4 h-9 px-5 rounded-xl btn-ink text-[12px] font-semibold"
            >
              Create workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
