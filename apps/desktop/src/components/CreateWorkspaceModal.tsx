import { useEffect, useRef, useState } from "react";
import type { BranchInfo, CreateWorkspaceInput } from "../lib/bindings";
import { commands } from "../lib/bindings";

let openDialog: typeof import("@tauri-apps/plugin-dialog").open | null = null;
import("@tauri-apps/plugin-dialog").then((mod) => { openDialog = mod.open; }).catch(() => {});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateWorkspaceInput) => Promise<void>;
  isCreating: boolean;
}

export function CreateWorkspaceModal({ isOpen, onClose, onCreate, isCreating }: Props) {
  const [form, setForm] = useState<CreateWorkspaceInput>({
    name: "",
    repo_path: "",
    backend: "opencode",
    execution_target: "local",
    create_worktree: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        name: "",
        repo_path: "",
        backend: "opencode",
        execution_target: "local",
        create_worktree: false,
      });
      setError(null);
      setBranches([]);
    }
  }, [isOpen]);

  async function pickFolder() {
    if (!openDialog) {
      setError("Native dialog not available.");
      return;
    }
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: "Select git repository" });
      if (selected && typeof selected === "string") {
        setForm((prev) => ({ ...prev, repo_path: selected }));
        setLoadingBranches(true);
        setBranches([]);
        try {
          const branchList = await commands.gitListBranches(selected);
          setBranches(branchList);
          const current = branchList.find((b) => b.is_current);
          if (current) {
            setForm((prev) => ({ ...prev, branch: current.name }));
          }
        } catch {
          // Not a valid repo — branches stay empty
        } finally {
          setLoadingBranches(false);
        }
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function submit() {
    if (!form.name?.trim() || !form.repo_path?.trim()) {
      setError("Workspace name and repository path are required.");
      return;
    }
    setError(null);
    try {
      await onCreate({
        ...form,
        name: form.name.trim(),
        repo_path: form.repo_path.trim(),
        branch: form.branch?.trim() || undefined,
      });
      onClose();
    } catch {
      // Error is handled by the parent via setError
    }
  }

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--surface-ink-25)] backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-[520px] mx-4 glass-panel-strong rounded-3xl animate-in zoom-in slide-in-from-bottom-4 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Create workspace"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              New workspace
            </p>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
              Create workspace
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--glass-border)] mx-6" />

        {/* Form body */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Workspace name
            </span>
            <input
              ref={nameInputRef}
              value={form.name ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
              placeholder="my-project"
            />
          </label>

          {/* Repo path */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Repository path
            </span>
            <div className="mt-1.5 flex gap-2">
              <input
                value={form.repo_path ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, repo_path: e.target.value }))}
                className="flex-1 rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
                placeholder="/path/to/repo"
              />
              <button
                type="button"
                onClick={() => void pickFolder()}
                className="shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-xl btn-glass"
                title="Browse..."
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
          </label>

          {/* Backend + target row */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Backend
              </span>
              <select
                value={form.backend}
                onChange={(e) => setForm((prev) => ({ ...prev, backend: e.target.value }))}
                className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
              >
                <option value="opencode">OpenCode</option>
                <option value="khadim">Khadim</option>
                <option value="claude_code">Claude Code</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Execution target
              </span>
              <select
                value={form.execution_target}
                onChange={(e) => setForm((prev) => ({ ...prev, execution_target: e.target.value }))}
                className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
              >
                <option value="local">Local</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </label>
          </div>

          {/* Branch */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Branch {loadingBranches && <span className="text-[var(--text-muted)]">(loading...)</span>}
            </span>
            {branches.length > 0 ? (
              <select
                value={form.branch ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value || undefined }))}
                className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Current branch</option>
                {branches.filter((b) => !b.is_remote).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}{b.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.branch ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
                className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
                placeholder="main"
              />
            )}
          </label>

          {/* Worktree checkbox */}
          <label className="flex items-center gap-2.5 text-[12px] text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(form.create_worktree)}
              onChange={(e) => setForm((prev) => ({ ...prev, create_worktree: e.target.checked }))}
              className="accent-[var(--color-accent)] w-4 h-4"
            />
            Create a dedicated git worktree
          </label>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-[var(--color-danger-text-light)] bg-[var(--color-danger-bg-strong)] rounded-lg px-3 py-2 border border-[var(--color-danger-border)]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl btn-glass text-[12px] font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={isCreating}
            className="h-9 px-5 rounded-xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
