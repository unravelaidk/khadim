import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { useGitBranches } from "../hooks/useGitBranches";
import { useGitHubIssuesQuery, useGitHubSlugQuery, useGitHubAuthStatusQuery } from "../lib/queries";
import { GlassSelect } from "./GlassSelect";

interface Props {
  isOpen: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** Called after worktree is created. Returns the branch name, worktree path, label, and optional issue URL. */
  onCreateAgent: (branch: string, worktreePath: string, label: string, issueUrl: string | null) => void;
  isCreating: boolean;
}

function extractIssueNumber(url: string): number | null {
  const match = url.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function NewAgentModal({ isOpen, workspace, onClose, onCreateAgent, isCreating }: Props) {
  const [baseBranch, setBaseBranch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branchMode, setBranchMode] = useState<"existing" | "new">("new");
  const [agentLabel, setAgentLabel] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const { branches, localBranches, loading } = useGitBranches(workspace.repo_path, isOpen);

  // GitHub integration
  const { data: githubSlug } = useGitHubSlugQuery(workspace.repo_path, isOpen);
  const { data: githubAuth } = useGitHubAuthStatusQuery(isOpen && !!githubSlug);
  const { data: issues = [] } = useGitHubIssuesQuery(
    githubSlug?.owner ?? null,
    githubSlug?.repo ?? null,
    "open",
    isOpen && !!githubSlug && !!githubAuth?.authenticated,
  );

  const hasGitHubIssues = !!githubSlug && !!githubAuth?.authenticated && issues.length > 0;

  // Load branches when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setNewBranchName("");
    setAgentLabel("");
    setIssueUrl("");
    setSelectedIssueNumber(null);
    setBranchMode("new");
    setCreating(false);

    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const current = branches.find((branch) => branch.is_current);
    const preferredBase = localBranches.find((branch) => branch.name === workspace.branch)?.name
      ?? current?.name
      ?? localBranches[0]?.name
      ?? workspace.branch
      ?? "main";
    setBaseBranch(preferredBase);
    setSelectedBranch(preferredBase);
  }, [branches, isOpen, localBranches, workspace.branch]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const selectedExistingBranch = useMemo(
    () => localBranches.find((branch) => branch.name === selectedBranch) ?? null,
    [localBranches, selectedBranch],
  );
  const reusableWorktreePath = branchMode === "existing"
    && selectedExistingBranch?.worktree_path
    && selectedExistingBranch.worktree_path !== workspace.repo_path
    ? selectedExistingBranch.worktree_path
    : null;

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

    // Determine issue URL from either selection or manual input
    let issue: string | null = null;
    if (selectedIssueNumber && githubSlug) {
      issue = `https://github.com/${githubSlug.owner}/${githubSlug.repo}/issues/${selectedIssueNumber}`;
    } else if (issueUrl.trim()) {
      issue = issueUrl.trim();
    }

    setError(null);
    setCreating(true);

    try {
      const isNew = branchMode === "new";
      const worktree = reusableWorktreePath
        ? { path: reusableWorktreePath }
        : await commands.gitCreateWorktree(
            workspace.repo_path,
            undefined,
            branch,
            isNew,
            baseBranch || undefined,
          );

      onCreateAgent(branch, worktree.path, label, issue);
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

  const baseBranchOptions = localBranches.map((b) => ({
    value: b.name,
    label: `${b.name}${b.name === workspace.branch ? " (workspace default)" : b.is_current ? " (current)" : ""}`,
  }));

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
        className="relative z-10 w-full max-w-[480px] mx-4 glass-panel-strong rounded-[var(--radius-xl)] animate-in zoom-in slide-in-from-bottom-4 duration-300"
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
            <h2 className="font-display text-lg font-medium text-[var(--text-primary)] mt-0.5">
              New agent
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-2xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
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
              className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
              placeholder="e.g. Fix auth flow"
            />
          </label>

          {/* Issue URL */}
          <div className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              GitHub issue <span className="text-[var(--text-muted)] font-normal">(optional)</span>
            </span>
            {hasGitHubIssues ? (
              <div className="mt-1.5">
                <GlassSelect
                  value={selectedIssueNumber?.toString() ?? ""}
                  onChange={(v) => {
                    setSelectedIssueNumber(v ? parseInt(v, 10) : null);
                    setIssueUrl("");
                  }}
                  options={[
                    { value: "", label: "Select an issue..." },
                    ...issues.map((issue) => ({
                      value: issue.number.toString(),
                      label: `#${issue.number} ${issue.title.slice(0, 50)}${issue.title.length > 50 ? "..." : ""}`,
                    })),
                  ]}
                />
                {selectedIssueNumber && (
                  <p className="text-[10px] text-[var(--color-accent)] mt-1.5">
                    #{selectedIssueNumber} will be loaded when the agent starts
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1.5">
                <input
                  value={issueUrl}
                  onChange={(e) => {
                    setIssueUrl(e.target.value);
                    setSelectedIssueNumber(null);
                  }}
                  className="w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                  placeholder="https://github.com/owner/repo/issues/123"
                />
                {!githubSlug && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    No GitHub remote detected for this repo
                  </p>
                )}
                {githubSlug && !githubAuth?.authenticated && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void commands.githubAuthLogin();
                      }}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Sign in to GitHub
                    </a>{" "}
                    to select issues from this repo
                  </p>
                )}
              </div>
            )}
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Agent will work on this issue automatically
            </p>
          </div>

          <div className="block">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Base branch {loading && <span className="text-[var(--text-muted)]">(loading...)</span>}
            </span>
            {baseBranchOptions.length > 0 ? (
              <GlassSelect
                value={baseBranch}
                onChange={(v) => setBaseBranch(v)}
                options={baseBranchOptions}
                className="mt-1.5"
              />
            ) : (
              <input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                placeholder="main"
              />
            )}
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              This is the workspace default branch. You can still change it here for this agent.
            </p>
            {reusableWorktreePath && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Reusing existing worktree: <span className="font-mono">{reusableWorktreePath}</span>
              </p>
            )}
          </div>

          {/* Branch mode toggle */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-2">
              Agent branch
            </span>
            <div className="flex gap-1 p-0.5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <button
                onClick={() => setBranchMode("new")}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-xl transition-all ${
                  branchMode === "new"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                New branch
              </button>
              <button
                onClick={() => setBranchMode("existing")}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-xl transition-all ${
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
                New branch name
              </span>
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                placeholder="feature/my-feature"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Will be created from <span className="font-mono font-semibold">{baseBranch || "HEAD"}</span>
              </p>
            </label>
          ) : (
            <div className="block">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Existing branch {loading && <span className="text-[var(--text-muted)]">(loading...)</span>}
              </span>
              {localBranches.length > 0 ? (
                <GlassSelect
                  value={selectedBranch}
                  onChange={(v) => setSelectedBranch(v)}
                  options={localBranches.map((b) => ({
                    value: b.name,
                    label: `${b.name}${b.is_current ? " (current)" : ""}`,
                  }))}
                  className="mt-1.5"
                />
              ) : (
                <input
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none font-mono"
                  placeholder="main"
                />
              )}
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--glass-bg)] rounded-2xl px-3 py-2.5 border border-[var(--glass-border)]">
            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Each agent gets its own worktree. Existing branches can be reused, and the worktree directory will be unique under <span className="font-mono text-[10px]">.khadim-worktrees/</span>
            </span>
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
            disabled={creating || isCreating}
            className="h-9 px-5 rounded-2xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {creating || isCreating ? "Creating..." : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
