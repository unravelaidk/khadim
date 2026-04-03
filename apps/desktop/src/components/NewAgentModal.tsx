import { useEffect, useRef, useState } from "react";
import type { BranchInfo, Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";

interface Props {
  isOpen: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** Called after worktree is created. Returns the branch name and worktree path. */
  onCreateAgent: (branch: string, worktreePath: string, label: string) => void;
  isCreating: boolean;
}

export function NewAgentModal({ isOpen, workspace, onClose, onCreateAgent, isCreating }: Props) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchMode, setBranchMode] = useState<"existing" | "new">("new");
  const [agentLabel, setAgentLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Load branches when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNewBranchName("");
    setAgentLabel("");
    setBranchMode("new");
    setCreating(false);

    setLoadingBranches(true);
    commands.gitListBranches(workspace.repo_path)
      .then((list) => {
        setBranches(list);
        const current = list.find((b) => b.is_current);
        setSelectedBranch(current?.name ?? list[0]?.name ?? "main");
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));

    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, [isOpen, workspace.repo_path]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  async function submit() {
    const label = agentLabel.trim() || (branchMode === "new" ? newBranchName.trim() : selectedBranch);
    if (!label) {
      setError("Give the agent a name or branch.");
      return;
    }

    const branch = branchMode === "new" ? newBranchName.trim() : selectedBranch;
    if (!branch) {
      setError("Select or enter a branch name.");
      return;
    }

    setError(null);
    setCreating(true);

    try {
      // Build worktree path: <repo>/.khadim-worktrees/<branch-slug>
      const slug = branch.replace(/\//g, "-");
      const worktreePath = `${workspace.repo_path}/.khadim-worktrees/${slug}`;

      // Create the worktree
      const isNew = branchMode === "new";
      await commands.gitCreateWorktree(workspace.repo_path, worktreePath, branch, isNew);

      onCreateAgent(branch, worktreePath, label);
      onClose();
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : String(err);
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  if (!isOpen) return null;

  const localBranches = branches.filter((b) => !b.is_remote);

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
        className="relative z-10 w-full max-w-[480px] mx-4 glass-panel-strong rounded-3xl animate-in zoom-in slide-in-from-bottom-4 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="New agent"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {workspace.name}
            </p>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
              New agent
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

        <div className="h-px bg-[var(--glass-border)] mx-6" />

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Agent label */}
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Agent name
            </span>
            <input
              ref={labelInputRef}
              value={agentLabel}
              onChange={(e) => setAgentLabel(e.target.value)}
              className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
              placeholder="e.g. Fix auth flow"
            />
          </label>

          {/* Branch mode toggle */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-2">
              Worktree branch
            </span>
            <div className="flex gap-1 p-0.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <button
                onClick={() => setBranchMode("new")}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${
                  branchMode === "new"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                New branch
              </button>
              <button
                onClick={() => setBranchMode("existing")}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${
                  branchMode === "existing"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Existing branch
              </button>
            </div>
          </div>

          {/* Branch input */}
          {branchMode === "new" ? (
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Branch name
              </span>
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                placeholder="feature/my-feature"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Will be created from <span className="font-mono font-semibold">{selectedBranch || "HEAD"}</span>
              </p>
            </label>
          ) : (
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Branch {loadingBranches && <span className="text-[var(--text-muted)]">(loading...)</span>}
              </span>
              {localBranches.length > 0 ? (
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none"
                >
                  {localBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.is_current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="mt-1.5 w-full rounded-xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                  placeholder="main"
                />
              )}
            </label>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--glass-bg)] rounded-xl px-3 py-2.5 border border-[var(--glass-border)]">
            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Each agent gets its own worktree so it can work on a separate branch without conflicts.
              The worktree will be created at <span className="font-mono text-[10px]">.khadim-worktrees/</span>
            </span>
          </div>

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
            disabled={creating || isCreating}
            className="h-9 px-5 rounded-xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {creating || isCreating ? "Creating..." : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
