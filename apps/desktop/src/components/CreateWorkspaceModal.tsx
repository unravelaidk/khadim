import { useEffect, useRef, useState } from "react";
import type { CreateWorkspaceInput } from "../lib/bindings";
import { useGitBranches } from "../hooks/useGitBranches";
import { GlassSelect } from "./GlassSelect";

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
  });
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { branches, localBranches, loading } = useGitBranches(form.repo_path || null, Boolean(form.repo_path));

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
      });
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!form.repo_path) return;
    const current = branches.find((branch) => branch.is_current);
    if (current) {
      setForm((prev) => ({ ...prev, branch: current.name }));
    }
  }, [branches, form.repo_path]);

  async function pickFolder() {
    if (!openDialog) {
      setError("Native dialog not available.");
      return;
    }
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: "Select git repository" });
      if (selected && typeof selected === "string") {
        setForm((prev) => ({ ...prev, repo_path: selected }));
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
        className="relative z-10 w-full max-w-[520px] mx-4 glass-panel-strong rounded-[var(--radius-xl)] animate-in zoom-in slide-in-from-bottom-4 duration-300"
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
            <h2 className="font-display text-lg font-medium text-[var(--text-primary)] mt-0.5">
              Create workspace
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-2xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close"
          >
            <i className="ri-close-line text-[16px] leading-none" />
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
              className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
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
                className="flex-1 rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
                placeholder="/path/to/repo"
              />
              <button
                type="button"
                onClick={() => void pickFolder()}
                className="shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-2xl btn-glass"
                title="Browse..."
              >
                <i className="ri-folder-3-line text-[16px] leading-none" />
              </button>
            </div>
          </label>

          {/* Backend + target row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Backend
              </span>
              <GlassSelect
                value={form.backend ?? "opencode"}
                onChange={(v) => setForm((prev) => ({ ...prev, backend: v }))}
                options={[
                  { value: "opencode", label: "OpenCode" },
                  { value: "khadim", label: "Khadim" },
                  { value: "claude_code", label: "Claude Code" },
                ]}
                className="mt-1.5"
              />
            </div>

            <div className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Execution target
              </span>
              <GlassSelect
                value={form.execution_target ?? "local"}
                onChange={(v) => setForm((prev) => ({ ...prev, execution_target: v }))}
                options={[
                  { value: "local", label: "Local" },
                  { value: "sandbox", label: "Sandbox" },
                ]}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Default branch */}
          <div className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Default branch {loading && <span className="text-[var(--text-muted)]">(loading...)</span>}
            </span>
            {localBranches.length > 0 ? (
              <GlassSelect
                value={form.branch ?? ""}
                onChange={(v) => setForm((prev) => ({ ...prev, branch: v || undefined }))}
                options={[
                  { value: "", label: "Use current branch" },
                  ...localBranches.map((b) => ({
                    value: b.name,
                    label: `${b.name}${b.is_current ? " (current)" : ""}`,
                  })),
                ]}
                className="mt-1.5"
              />
            ) : (
              <input
                value={form.branch ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
                className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
                placeholder="main"
              />
            )}
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              New agents will use this as their default base branch. You can change it later.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-[var(--color-danger-text-light)] bg-[var(--color-danger-bg-strong)] rounded-xl px-3 py-2 border border-[var(--color-danger-border)]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-2xl btn-glass text-[12px] font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={isCreating}
            className="h-9 px-5 rounded-2xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
