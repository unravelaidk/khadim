import { useEffect, useRef, useState } from "react";
import type { OpenCodeModelOption } from "../lib/bindings";
import type { AgentInstance } from "../lib/types";
import { agentStatusColorClass, agentStatusWord } from "../lib/agent-utils";
import { ModelSelector } from "./ModelSelector";
import { CloseIcon } from "./shared/Icons";

interface Props {
  isOpen: boolean;
  agent: AgentInstance;
  onClose: () => void;
  onRename: (agentId: string, newLabel: string) => void;
  onDelete: (agentId: string, deleteWorktree: boolean) => void;
  availableModels?: OpenCodeModelOption[];
  selectedModelKey?: string | null;
  onSelectModel?: (key: string) => void;
}

export function AgentSettingsModal({ isOpen, agent, onClose, onRename, onDelete, availableModels, selectedModelKey, onSelectModel }: Props) {
  const [label, setLabel] = useState(agent.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWorktree, setDeleteWorktree] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(agent.label);
    setConfirmDelete(false);
    setDeleteWorktree(true);
    setDeleting(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen, agent.id, agent.label]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  function handleSave() {
    const trimmed = label.trim();
    if (trimmed && trimmed !== agent.label) {
      onRename(agent.id, trimmed);
    }
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    onDelete(agent.id, deleteWorktree);
  }

  if (!isOpen) return null;

  const statusColor = agentStatusColorClass(agent.status);
  const statusText = agentStatusWord(agent.status);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="absolute inset-0 bg-[var(--surface-ink-25)] backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-[440px] mx-4 glass-panel-strong rounded-[var(--radius-xl)] animate-in zoom-in slide-in-from-bottom-4 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Agent settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0"
              style={{
                background: `oklch(90% 0.04 ${hashStr(agent.id)})`,
                color: `oklch(35% 0.06 ${hashStr(agent.id)})`,
              }}
            >
              {agent.label.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold text-[var(--text-primary)] truncate tracking-tight">
                Agent Settings
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  agent.status === "running" ? "bg-[var(--color-accent)] animate-pulse"
                  : agent.status === "complete" ? "bg-[var(--color-success)]"
                  : agent.status === "error" ? "bg-[var(--color-danger)]"
                  : "bg-[var(--scrollbar-thumb)]"
                }`} />
                <span className={`text-[10px] font-medium ${
                  agent.status === "running" ? "text-[var(--color-accent)]"
                  : agent.status === "complete" ? "text-[var(--color-success-strong)]"
                  : agent.status === "error" ? "text-[var(--color-danger-text-light)]"
                  : "text-[var(--text-muted)]"
                }`}>
                  {statusText}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="h-px bg-[var(--glass-border)] mx-6" />

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Name
            </span>
            <input
              ref={inputRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
              placeholder="Agent name"
            />
          </label>

          {/* Model selector */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Model
            </span>
            {availableModels && availableModels.length > 0 && onSelectModel ? (
              <div className="mt-1.5">
                <ModelSelector
                  models={availableModels}
                  selectedModelKey={selectedModelKey ?? null}
                  onSelectModel={onSelectModel}
                  disabled={agent.status === "running"}
                  direction="down"
                  className="w-full"
                />
              </div>
            ) : (
              <div className="mt-1.5 rounded-2xl glass-input px-3 py-2.5 text-sm text-[var(--text-primary)]">
                {agent.modelLabel ?? "Default"}
              </div>
            )}
          </label>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Status */}
            <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] block mb-0.5">
                Status
              </span>
              <span className={`text-[11px] font-medium truncate block ${statusColor}`}>
                {statusText}
              </span>
            </div>

            {/* Branch */}
            {agent.branch && (
              <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-2.5 col-span-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] block mb-0.5">
                  Branch
                </span>
                <div className="flex items-center gap-1.5">
                  <i className="ri-git-branch-line text-[12px] leading-none text-[var(--text-muted)]" />
                  <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] truncate">
                    {agent.branch}
                  </span>
                </div>
              </div>
            )}

            {/* Worktree */}
            {agent.worktreePath && (
              <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-2.5 col-span-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] block mb-0.5">
                  Worktree
                </span>
                <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate block">
                  {agent.worktreePath}
                </span>
              </div>
            )}
          </div>

          {/* Timestamps */}
          {(agent.startedAt || agent.finishedAt) && (
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
              {agent.startedAt && (
                <span>Started {new Date(agent.startedAt).toLocaleString()}</span>
              )}
              {agent.finishedAt && (
                <span>Finished {new Date(agent.finishedAt).toLocaleString()}</span>
              )}
            </div>
          )}

          {/* Error message */}
          {agent.status === "error" && agent.errorMessage && (
            <div className="rounded-xl bg-[var(--color-danger-bg-strong)] border border-[var(--color-danger-border)] p-3">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-danger)] block mb-0.5">
                Error
              </span>
              <p className="text-[11px] text-[var(--color-danger-text)] leading-relaxed">
                {agent.errorMessage}
              </p>
            </div>
          )}

          {/* Danger zone */}
          <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-subtle)] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-danger-text-light)] mb-2">
              Danger zone
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mb-3">
              Permanently delete this agent and its conversation history.
              {agent.status === "running" && " The agent is currently running and will be stopped."}
            </p>

            {/* Worktree option */}
            {agent.worktreePath && (
              <label className="flex items-start gap-2.5 mb-3 cursor-pointer group/wt">
                <input
                  type="checkbox"
                  checked={deleteWorktree}
                  onChange={(e) => setDeleteWorktree(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-[var(--color-danger-border)] text-[var(--color-danger-text-light)] accent-[var(--color-danger-text-light)] cursor-pointer"
                />
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] block">
                    Also delete worktree
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono truncate block mt-0.5">
                    {agent.worktreePath}
                  </span>
                  {!deleteWorktree && (
                    <span className="text-[10px] text-[var(--color-warning-text)] block mt-1">
                      The worktree directory and branch will be kept on disk.
                    </span>
                  )}
                </div>
              </label>
            )}

            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`h-8 px-4 rounded-2xl text-[11px] font-semibold transition-all ${
                confirmDelete
                  ? "bg-[var(--color-danger-strong)] text-[var(--text-inverse)] hover:bg-[var(--color-danger-hover)] shadow-sm"
                  : "bg-[var(--color-danger-muted)] text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]"
              } disabled:opacity-50`}
            >
              {deleting ? "Deleting..." : confirmDelete ? "Confirm delete" : "Delete agent"}
            </button>
            {confirmDelete && !deleting && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="ml-2 h-8 px-3 rounded-2xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-1">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-2xl btn-glass text-[12px] font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 rounded-2xl btn-ink text-[12px] font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Deterministic hue from a string */
function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}
