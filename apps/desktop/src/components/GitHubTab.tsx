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
          <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
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
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
              </svg>
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
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354z" />
              </svg>
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
            <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
            </svg>
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
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
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
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
                </svg>
                Create repository & push
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
