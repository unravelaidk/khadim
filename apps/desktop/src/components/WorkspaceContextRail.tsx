import { memo } from "react";
import type { DesktopWorkspaceContext } from "../lib/bindings";
import { StatusIndicator } from "./StatusIndicator";

interface Props {
  context: DesktopWorkspaceContext | null;
  agentLabel?: string | null;
  connected?: boolean;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  onOpenFinder?: () => void;
  onOpenInEditor?: () => void;
  className?: string;
}

export const WorkspaceContextRail = memo(function WorkspaceContextRail({
  context,
  agentLabel,
  connected,
  terminalOpen,
  onToggleTerminal,
  onOpenFinder,
  onOpenInEditor,
  className,
}: Props) {
  if (!context) return null;

  const branch = context.branch ?? "(no branch)";
  const cwdLabel = shortenPath(context.cwd);
  const worktreeLabel = context.worktree_path ? shortenPath(context.worktree_path) : null;

  return (
    <div
      className={`shrink-0 px-6 py-2 border-b border-[var(--glass-border)] flex items-center gap-3 text-[10px] ${className ?? ""}`}
    >
      {/* Connection indicator — uses StatusIndicator instead of raw dot */}
      <StatusIndicator
        status={connected ? "running" : "idle"}
        size="xs"
      />

      {/* Workspace + agent */}
      <span className="font-semibold text-[var(--text-primary)] truncate max-w-[140px]">
        {context.workspace_name}
      </span>
      {agentLabel && (
        <>
          <Sep />
          <span className="text-[var(--text-secondary)] truncate">{agentLabel}</span>
        </>
      )}

      {/* Backend */}
      <Sep />
      <span className="uppercase tracking-wide text-[var(--text-muted)]">
        {context.backend}
      </span>

      {/* Branch */}
      <Sep />
      <span className="inline-flex items-center gap-1 font-mono text-[var(--text-secondary)] truncate max-w-[160px]">
        <BranchIcon />
        {branch}
      </span>

      {/* Worktree badge */}
      {context.in_worktree && worktreeLabel && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]"
          title={`Agent worktree: ${context.worktree_path}`}
        >
          <WorktreeIcon />
          worktree
        </span>
      )}

      {/* cwd — pushed right */}
      <span
        className="ml-auto font-mono text-[var(--text-muted)] truncate max-w-[40%]"
        title={context.cwd}
      >
        {cwdLabel}
      </span>

      {/* Open in IDE button */}
      {onOpenInEditor && (
        <button
          onClick={onOpenInEditor}
          className="ml-1 h-6 px-2 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Open in editor"
        >
          <EditorIcon />
          IDE
        </button>
      )}

      {/* File finder button */}
      {onOpenFinder && (
        <button
          onClick={onOpenFinder}
          className="ml-1 h-6 px-2 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Find file (⌘P)"
        >
          <FinderIcon />
          <span>Find</span>
          <kbd className="rounded bg-[var(--surface-ink-4)] px-1 py-px font-mono text-[8px] text-[var(--text-muted)]">⌘P</kbd>
        </button>
      )}

      {/* Terminal toggle button */}
      {onToggleTerminal && (
        <button
          onClick={onToggleTerminal}
          className={`ml-1 h-6 px-2 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
            terminalOpen
              ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          }`}
          title={terminalOpen ? "Close terminal (⌘`)" : "Open terminal (⌘`)"}
        >
          <TerminalIcon />
          <span>Terminal</span>
          {!terminalOpen && (
            <kbd className="rounded bg-[var(--surface-ink-4)] px-1 py-px font-mono text-[8px] text-[var(--text-muted)]">⌘`</kbd>
          )}
        </button>
      )}
    </div>
  );
});

function Sep() {
  return <span className="text-[var(--text-muted)] opacity-50">·</span>;
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

function WorktreeIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h6l2 2h8v10a2 2 0 01-2 2H4z" />
    </svg>
  );
}

function EditorIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function FinderIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5l3 3-3 3M8 11h5" />
    </svg>
  );
}

function shortenPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const head = path.slice(0, 12);
  const tail = path.slice(-(max - head.length - 1));
  return `${head}…${tail}`;
}
