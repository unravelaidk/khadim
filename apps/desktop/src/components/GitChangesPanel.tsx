import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DiffFileEntry } from "../lib/bindings";
import { commands } from "../lib/bindings";

interface Props {
  repoPath: string | null;
  isStreaming: boolean;
  onOpenFile?: (absolutePath: string) => void;
  onClose: () => void;
}

const POLL_INTERVAL = 5000;

function statusMeta(s: string): { label: string; color: string } {
  switch (s) {
    case "A": return { label: "Added", color: "text-[var(--color-success)]" };
    case "D": return { label: "Deleted", color: "text-[var(--color-danger)]" };
    case "R": return { label: "Renamed", color: "text-[var(--color-pop)]" };
    case "C": return { label: "Copied", color: "text-[var(--text-muted)]" };
    case "?": return { label: "Untracked", color: "text-[var(--text-muted)]" };
    default:  return { label: "Modified", color: "text-[var(--color-pop)]" };
  }
}

function statusLetter(s: string): string {
  switch (s) {
    case "A": return "A";
    case "D": return "D";
    case "R": return "R";
    case "C": return "C";
    case "?": return "U";
    default:  return "M";
  }
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : "";
}

function GitChangesPanelInner({ repoPath, isStreaming, onOpenFile, onClose }: Props) {
  const [files, setFiles] = useState<DiffFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState("");
  const prevStreamingRef = useRef(isStreaming);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [nextFiles, status] = await Promise.all([
        commands.gitDiffFiles(repoPath),
        commands.gitStatus(repoPath),
      ]);
      setFiles(nextFiles);
      setGitStatus(status);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while streaming
  useEffect(() => {
    if (isStreaming) {
      intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isStreaming, refresh]);

  // Refresh once when streaming ends
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) void refresh();
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, refresh]);

  const totalIns = files.reduce((sum, f) => sum + (f.insertions ?? 0), 0);
  const totalDel = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const handleClick = (entry: DiffFileEntry) => {
    if (!onOpenFile || !repoPath) return;
    const base = repoPath.endsWith("/") ? repoPath : repoPath + "/";
    onOpenFile(base + entry.path);
  };

  return (
    <div className="h-full flex flex-col border-l border-[var(--glass-border)]" style={{ background: "var(--surface-bg-subtle)" }}>
      {/* Header */}
      <div className="shrink-0 h-8 px-3 flex items-center gap-2 border-b border-[var(--glass-border)] select-none" style={{ background: "var(--surface-bg-subtle)" }}>
        <button
          onClick={onClose}
          className="h-5 w-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
          title="Close changes panel"
        >
          <i className="ri-close-line text-[12px] leading-none" />
        </button>

        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <DiffIcon />
          Changes
        </div>

        {loading && (
          <i className="ri-loader-4-line text-[12px] leading-none dot-spinner text-[var(--text-muted)] ml-1" />
        )}

        <div className="ml-auto flex items-center gap-2 text-[10px]">
          {totalIns > 0 && <span className="font-mono font-medium text-[var(--color-success)]">+{totalIns}</span>}
          {totalDel > 0 && <span className="font-mono font-medium text-[var(--color-danger)]">&minus;{totalDel}</span>}
          <span className="font-mono text-[var(--text-muted)]">{files.length} file{files.length !== 1 ? "s" : ""}</span>
        </div>

        <button
          onClick={() => void refresh()}
          className="h-5 w-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
          title="Refresh"
        >
          <i className="ri-refresh-line text-[12px] leading-none" />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {files.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-muted)] px-4">
            <DiffIcon />
            <p className="text-[11px] text-center">No changes detected</p>
            <p className="text-[10px] text-center opacity-70">Working tree is clean</p>
          </div>
        ) : (
          <div className="py-1">
            {files.map((entry) => {
              const meta = statusMeta(entry.status);
              const letter = statusLetter(entry.status);
              const name = basename(entry.path);
              const dir = dirname(entry.path);
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => handleClick(entry)}
                  className="group w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg)]"
                >
                  <span className={`shrink-0 w-4 text-center font-mono text-[10px] font-bold ${meta.color}`}>
                    {letter}
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
                  <div className="flex items-center gap-1 shrink-0">
                    {entry.insertions != null && entry.insertions > 0 && (
                      <span className="font-mono text-[10px] font-medium text-[var(--color-success)]">+{entry.insertions}</span>
                    )}
                    {entry.deletions != null && entry.deletions > 0 && (
                      <span className="font-mono text-[10px] font-medium text-[var(--color-danger)]">&minus;{entry.deletions}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Git status footer */}
      {gitStatus && (
        <div className="shrink-0 border-t border-[var(--glass-border)] px-3 py-2">
          <pre className="text-[10px] font-mono text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto scrollbar-none">
            {gitStatus}
          </pre>
        </div>
      )}
    </div>
  );
}

export const GitChangesPanel = memo(GitChangesPanelInner);

function DiffIcon() {
  return (
    <i className="ri-add-line text-[12px] leading-none" />
  );
}
