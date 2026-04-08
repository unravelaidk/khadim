import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DiffFileEntry } from "../lib/bindings";
import { commands } from "../lib/bindings";

interface Props {
  /** Workspace repo path (or worktree path) to run git diff against. */
  repoPath: string | undefined;
  /** Whether the agent is currently running — triggers a refresh on completion. */
  isStreaming: boolean;
  /** Called when the user clicks a file row. */
  onOpenFile?: (absolutePath: string) => void;
}

/** Map a git status letter to a human label + color class. */
function statusMeta(s: string): { label: string; color: string } {
  switch (s) {
    case "A":
      return { label: "A", color: "text-[var(--color-success)]" };
    case "D":
      return { label: "D", color: "text-[var(--color-danger)]" };
    case "R":
      return { label: "R", color: "text-[var(--color-pop)]" };
    case "C":
      return { label: "C", color: "text-[var(--text-muted)]" };
    case "?":
      return { label: "U", color: "text-[var(--text-muted)]" };
    default:
      return { label: "M", color: "text-[var(--color-pop)]" };
  }
}

/** Extract the filename from a path. */
function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

/** Extract the directory portion from a path. */
function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : "";
}

/** File type icon — keeps it minimal. */
function FileIcon({ status }: { status: string }) {
  if (status === "D") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2m-9 0v14h10V6H7Z" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
    </svg>
  );
}

function ModifiedFilesPanelInner({ repoPath, isStreaming, onOpenFile }: Props) {
  const [files, setFiles] = useState<DiffFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const prevStreamingRef = useRef(isStreaming);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const next = await commands.gitDiffFiles(repoPath);
      setFiles(next);
    } catch {
      // Silently ignore — repo may not be ready
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Initial load + refresh when repo changes
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while streaming (every 4s) so the list updates as the agent writes files
  useEffect(() => {
    if (isStreaming) {
      intervalRef.current = setInterval(() => void refresh(), 4000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isStreaming, refresh]);

  // Refresh once when streaming ends
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      void refresh();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, refresh]);

  if (files.length === 0 && !loading) return null;

  const totalInsertions = files.reduce((sum, f) => sum + (f.insertions ?? 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const handleClick = (entry: DiffFileEntry) => {
    if (!onOpenFile || !repoPath) return;
    const base = repoPath.endsWith("/") ? repoPath : repoPath + "/";
    onOpenFile(base + entry.path);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-card)]/50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-pop)]" />
        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          Modified files
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {files.length}
        </span>
        {loading && (
          <svg className="h-3 w-3 animate-spin text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 10v4m9-9h-4M7 12H3m15.364 6.364-2.828-2.828M8.464 8.464 5.636 5.636m12.728 0-2.828 2.828M8.464 15.536l-2.828 2.828" />
          </svg>
        )}
        <svg
          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${collapsed ? "-rotate-90" : "rotate-0"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {!collapsed && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 border-t border-[var(--glass-border)] px-3.5 py-1.5">
            {totalInsertions > 0 && (
              <span className="font-mono text-[10px] font-medium text-[var(--color-success)]">
                +{totalInsertions}
              </span>
            )}
            {totalDeletions > 0 && (
              <span className="font-mono text-[10px] font-medium text-[var(--color-danger)]">
                &minus;{totalDeletions}
              </span>
            )}
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* File list */}
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin border-t border-[var(--glass-border)]">
            {files.map((entry) => {
              const meta = statusMeta(entry.status);
              const name = basename(entry.path);
              const dir = dirname(entry.path);
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => handleClick(entry)}
                  className="group flex w-full items-center gap-2 px-3.5 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
                >
                  <span className={`${meta.color}`}>
                    <FileIcon status={entry.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent-hover)]">
                      {name}
                    </span>
                    {dir && (
                      <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                        {dir}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.insertions != null && entry.insertions > 0 && (
                      <span className="font-mono text-[10px] font-medium text-[var(--color-success)]">
                        +{entry.insertions}
                      </span>
                    )}
                    {entry.deletions != null && entry.deletions > 0 && (
                      <span className="font-mono text-[10px] font-medium text-[var(--color-danger)]">
                        &minus;{entry.deletions}
                      </span>
                    )}
                    <span className={`font-mono text-[10px] font-bold ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export const ModifiedFilesPanel = memo(ModifiedFilesPanelInner);
