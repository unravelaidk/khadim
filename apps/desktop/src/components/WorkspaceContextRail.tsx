import { memo } from "react";
import type { DesktopWorkspaceContext } from "../lib/bindings";
import { shortenPath } from "../lib/agent-utils";
import { StatusIndicator } from "./StatusIndicator";
import {
  BranchIcon,
  WorktreeIcon,
  EditorIcon,
  SearchIcon as FinderIcon,
  TerminalIcon,
  DiffIcon,
} from "./shared/Icons";

interface Props {
  context: DesktopWorkspaceContext | null;
  agentLabel?: string | null;
  connected?: boolean;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  onOpenFinder?: () => void;
  onOpenInEditor?: () => void;
  changesOpen?: boolean;
  onToggleChanges?: () => void;
  hasFocusedAgent?: boolean;
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
  changesOpen,
  onToggleChanges,
  hasFocusedAgent,
  className,
}: Props) {
  if (!context) return null;

  const branch = context.branch ?? "(no branch)";
  const cwdLabel = shortenPath(context.cwd);
  const worktreeLabel = context.worktree_path ? shortenPath(context.worktree_path) : null;

  return (
    <div
      className={`shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center gap-4 text-[12px] ${className ?? ""}`}
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
          className="ml-1 h-8 px-3 rounded-lg inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
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
          className="ml-1 h-8 px-3 rounded-lg inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Find file (⌘P)"
        >
          <FinderIcon />
          <span>Find</span>
          <kbd className="rounded bg-[var(--surface-ink-4)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">⌘P</kbd>
        </button>
      )}

      {/* Terminal toggle button */}
      {onToggleTerminal && (
        <button
          onClick={onToggleTerminal}
          className={`ml-1 h-8 px-3 rounded-lg inline-flex items-center gap-2 text-[12px] font-semibold transition-colors ${
            terminalOpen
              ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          }`}
          title={terminalOpen ? "Close terminal (⌘`)" : "Open terminal (⌘`)"}
        >
          <TerminalIcon />
          <span>Terminal</span>
          {!terminalOpen && (
            <kbd className="rounded bg-[var(--surface-ink-4)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">⌘`</kbd>
          )}
        </button>
      )}

      {/* Changes panel toggle — only when agent is focused */}
      {hasFocusedAgent && onToggleChanges && (
        <button
          onClick={onToggleChanges}
          className={`ml-1 h-8 px-3 rounded-lg inline-flex items-center gap-2 text-[12px] font-semibold transition-colors ${
            changesOpen
              ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          }`}
          title={changesOpen ? "Hide changes" : "Show changes"}
        >
          <DiffIcon />
          <span>Changes</span>
        </button>
      )}
    </div>
  );
});

function Sep() {
  return <span className="text-[var(--text-muted)] opacity-50">·</span>;
}
