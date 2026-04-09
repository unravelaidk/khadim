import { memo } from "react";
import type { DesktopWorkspaceContext } from "../lib/bindings";

interface Props {
  context: DesktopWorkspaceContext | null;
  /** Optional label for the active agent (falls back to "Workspace"). */
  agentLabel?: string | null;
  /** Optional connection / activity indicator. */
  connected?: boolean;
  /** Whether the terminal dock is currently open. */
  terminalOpen?: boolean;
  /** Toggle the terminal dock open/closed. */
  onToggleTerminal?: () => void;
  /** Whether the git changes dock is currently open. */
  changesOpen?: boolean;
  /** Toggle the git changes dock open/closed. */
  onToggleChanges?: () => void;
  /** Open the file finder. */
  onOpenFinder?: () => void;
  /** Open the project in the default IDE. */
  onOpenInEditor?: () => void;
  className?: string;
}

/**
 * Compact, always-visible rail describing the active coding context:
 * workspace · backend · branch · worktree badge · cwd.
 *
 * This is the seed of the "top context header" from the native workspace
 * redesign — terminal, file finder, and diff will all read from the same
 * `DesktopWorkspaceContext` shape.
 */
export const WorkspaceContextRail = memo(function WorkspaceContextRail({
  context,
  agentLabel,
  connected,
  terminalOpen,
  onToggleTerminal,
  changesOpen,
  onToggleChanges,
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
      {/* Connection dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          connected ? "bg-[var(--color-success)]" : "bg-[var(--scrollbar-thumb)]"
        }`}
        title={connected ? "Backend connected" : "Backend idle"}
      />

      {/* Workspace + agent */}
      <span className="font-semibold text-[var(--text-primary)] truncate">
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
      <span className="inline-flex items-center gap-1 font-mono text-[var(--text-secondary)] truncate">
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
          Find
        </button>
      )}

      {/* Changes (diff) toggle button */}
      {onToggleChanges && (
        <button
          onClick={onToggleChanges}
          className={`ml-1 h-6 px-2 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
            changesOpen
              ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          }`}
          title={changesOpen ? "Hide changes panel" : "Show changes panel"}
        >
          <DiffIcon />
          Changes
        </button>
      )}

      {/* Terminal toggle button */}
      {onToggleTerminal && (
        <button
          onClick={onToggleTerminal}
          className={`ml-2 h-6 px-2 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
            terminalOpen
              ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          }`}
          title={terminalOpen ? "Close terminal (⌘`)" : "Open terminal (⌘`)"}
        >
          <TerminalIcon />
          Terminal
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

function DiffIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M3 8h10M8 3v10" />
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
