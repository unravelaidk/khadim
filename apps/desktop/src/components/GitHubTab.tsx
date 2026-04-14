import { useState } from "react";
import { commands, type GitHubAuthStatus, type RepoSlug } from "../lib/bindings";
import type { GitHubSubView } from "../lib/types";
import { GitHubIssueList } from "./GitHubIssueList";
import { GitHubIssueDetail } from "./GitHubIssueDetail";
import { GitHubIssueCreate } from "./GitHubIssueCreate";
import { GitHubPRList } from "./GitHubPRList";
import { GitHubPRDetail } from "./GitHubPRDetail";
import { GitHubPRCreate } from "./GitHubPRCreate";

interface GitHubTabProps {
  authStatus: GitHubAuthStatus | null;
  slug: RepoSlug | null;
  repoPath: string;
  onNavigateToSettings: () => void;
  onSlugChange: (slug: RepoSlug) => void;
}

export function GitHubTab({ authStatus, slug, repoPath, onNavigateToSettings, onSlugChange }: GitHubTabProps) {
  const [subView, setSubView] = useState<GitHubSubView>({ kind: "issues" });
  const authenticated = authStatus?.authenticated ?? false;

  // Not authenticated — nudge to settings
  if (!authenticated) {
    return (
      <div className="py-12 text-center">
        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
          <i className="ri-github-fill text-[20px] leading-none text-[var(--text-muted)]" />
        </div>
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">GitHub not connected</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
          Sign in to GitHub from Settings to use issues and pull requests.
        </p>
        <button
          onClick={onNavigateToSettings}
          className="mt-4 h-8 px-4 rounded-2xl btn-ink text-[12px] font-semibold"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  // No repo slug (no remote detected) — offer to create one
  if (!slug) {
    return (
      <CreateRepoPanel
        repoPath={repoPath}
        onCreated={onSlugChange}
      />
    );
  }

  // Authenticated + slug available — show sub-navigation
  return (
    <div className="space-y-4">
      {/* Sub-navigation for issues vs PRs */}
      {(subView.kind === "issues" || subView.kind === "prs") && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubView({ kind: "issues" })}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
              subView.kind === "issues"
                ? "btn-ink"
                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="ri-error-warning-line text-[14px] leading-none" />
              Issues
            </span>
          </button>
          <button
            onClick={() => setSubView({ kind: "prs" })}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
              subView.kind === "prs"
                ? "btn-ink"
                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <i className="ri-git-merge-line text-[14px] leading-none" />
              Pull Requests
            </span>
          </button>
          <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
            {slug.owner}/{slug.repo}
          </span>
        </div>
      )}

      {/* Sub-view content */}
      {subView.kind === "issues" && (
        <GitHubIssueList
          slug={slug}
          onSelectIssue={(num) => setSubView({ kind: "issue-detail", issueNumber: num })}
          onCreateIssue={() => setSubView({ kind: "issue-create" })}
        />
      )}

      {subView.kind === "issue-detail" && (
        <GitHubIssueDetail
          slug={slug}
          issueNumber={subView.issueNumber}
          onBack={() => setSubView({ kind: "issues" })}
        />
      )}

      {subView.kind === "issue-create" && (
        <GitHubIssueCreate
          slug={slug}
          onCreated={(issue) => setSubView({ kind: "issue-detail", issueNumber: issue.number })}
          onCancel={() => setSubView({ kind: "issues" })}
        />
      )}

      {subView.kind === "prs" && (
        <GitHubPRList
          slug={slug}
          onSelectPR={(num) => setSubView({ kind: "pr-detail", prNumber: num })}
          onCreatePR={() => setSubView({ kind: "pr-create" })}
        />
      )}

      {subView.kind === "pr-detail" && (
        <GitHubPRDetail
          slug={slug}
          prNumber={subView.prNumber}
          onBack={() => setSubView({ kind: "prs" })}
        />
      )}

      {subView.kind === "pr-create" && (
        <GitHubPRCreate
          slug={slug}
          repoPath={repoPath}
          onCreated={(pr) => setSubView({ kind: "pr-detail", prNumber: pr.number })}
          onCancel={() => setSubView({ kind: "prs" })}
        />
      )}
    </div>
  );
}

// ── Create Repo Panel ────────────────────────────────────────────────

interface CreateRepoPanelProps {
  repoPath: string;
  onCreated: (slug: RepoSlug) => void;
}

function CreateRepoPanel({ repoPath, onCreated }: CreateRepoPanelProps) {
  // Default repo name from folder name
  const folderName = repoPath.split("/").filter(Boolean).pop() ?? "my-repo";

  const [name, setName] = useState(folderName);
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setBusy(true);
    setError(null);
    try {
      const repo = await commands.githubCreateAndPush(
        repoPath,
        trimmedName,
        description.trim() || null,
        isPrivate,
      );
      onCreated({ owner: repo.full_name.split("/")[0], repo: repo.name });
    } catch (e: unknown) {
      const msg = typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : typeof e === "string" ? e : "Failed to create repository";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-8 flex justify-center">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
            <i className="ri-file-list-line text-[20px] leading-none text-[var(--text-muted)]" />
          </div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            Publish to GitHub
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Create a new repository and push your code.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl glass-card-static p-4 space-y-3">
          {error && (
            <div className="rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-3">
              <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
            </div>
          )}

          {/* Repo name */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Repository name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-repo"
              className="w-full glass-input h-8 px-3 rounded-xl text-[12px]"
              disabled={busy}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Description <span className="text-[var(--text-muted)] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description"
              className="w-full glass-input h-8 px-3 rounded-xl text-[12px]"
              disabled={busy}
            />
          </div>

          {/* Visibility toggle */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-2">
              Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                disabled={busy}
                className={`flex-1 h-8 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  isPrivate
                    ? "btn-ink"
                    : "glass-card-static text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <i className="ri-lock-line text-[14px] leading-none" />
                Private
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                disabled={busy}
                className={`flex-1 h-8 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  !isPrivate
                    ? "btn-ink"
                    : "glass-card-static text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <i className="ri-earth-line text-[14px] leading-none" />
                Public
              </button>
            </div>
          </div>

          {/* Source path */}
          <p className="text-[10px] text-[var(--text-muted)] font-mono truncate" title={repoPath}>
            {repoPath}
          </p>

          {/* Submit */}
          <button
            onClick={() => void handleCreate()}
            disabled={busy || !name.trim()}
            className="w-full h-9 rounded-xl btn-accent text-[12px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full dot-spinner" />
                Creating & pushing...
              </>
            ) : (
              <>
                <i className="ri-upload-line text-[16px] leading-none" />
                Create repository & push
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
