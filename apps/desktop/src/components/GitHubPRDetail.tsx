import { useState, useEffect } from "react";
import {
  commands,
  type GitHubPR,
  type GitHubComment,
  type GitHubCheckSuite,
  type RepoSlug,
} from "../lib/bindings";
import { relTime } from "../lib/ui";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface GitHubPRDetailProps {
  slug: RepoSlug;
  prNumber: number;
  onBack: () => void;
}

export function GitHubPRDetail({ slug, prNumber, onBack }: GitHubPRDetailProps) {
  const [pr, setPr] = useState<GitHubPR | null>(null);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [checks, setChecks] = useState<GitHubCheckSuite | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      commands.githubPrGet(slug.owner, slug.repo, prNumber),
      commands.githubPrComments(slug.owner, slug.repo, prNumber),
    ])
      .then(([prData, cmts]) => {
        if (!alive) return;
        setPr(prData);
        setComments(cmts);
        setLoading(false);
        // Load checks in background
        void commands.githubPrChecks(slug.owner, slug.repo, prData.head.sha)
          .then((c) => { if (alive) setChecks(c); })
          .catch(() => {});
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError((e as { message?: string })?.message ?? "Failed to load PR");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [slug.owner, slug.repo, prNumber]);

  async function addComment() {
    if (!commentBody.trim()) return;
    setCommenting(true);
    try {
      const newComment = await commands.githubPrComment(slug.owner, slug.repo, prNumber, commentBody);
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to add comment");
    } finally {
      setCommenting(false);
    }
  }

  async function closePR() {
    setActionBusy(true);
    try {
      const updated = await commands.githubPrClose(slug.owner, slug.repo, prNumber);
      setPr(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to close PR");
    } finally {
      setActionBusy(false);
    }
  }

  async function mergePR() {
    setActionBusy(true);
    try {
      await commands.githubPrMerge(slug.owner, slug.repo, prNumber, mergeMethod);
      // Refresh
      const updated = await commands.githubPrGet(slug.owner, slug.repo, prNumber);
      setPr(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Merge failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function loadDiff() {
    setShowDiff(true);
    if (diff) return;
    try {
      const d = await commands.githubPrDiff(slug.owner, slug.repo, prNumber);
      setDiff(d);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to load diff");
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full dot-spinner" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="py-12 text-center">
        <p className="text-[12px] text-[var(--color-danger-text)]">{error ?? "PR not found"}</p>
        <button onClick={onBack} className="mt-3 h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold">
          Back
        </button>
      </div>
    );
  }

  const isMerged = !!pr.merged_at;
  const isClosed = pr.state === "closed" && !isMerged;
  const isOpen = pr.state === "open";

  return (
    <div className="space-y-4">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 h-7 w-7 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
        >
          <i className="ri-arrow-left-s-line text-[14px] leading-none" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">#{pr.number}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isMerged
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                : isClosed
                  ? "bg-[var(--color-danger-muted)] text-[var(--color-danger-text)]"
                  : "bg-[var(--color-success-muted)] text-[var(--color-success-text)]"
            }`}>
              {isMerged ? "Merged" : pr.state}
            </span>
            {pr.draft && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-ink-5)] text-[var(--text-muted)]">
                Draft
              </span>
            )}
          </div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">{pr.title}</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {pr.user.login} wants to merge{" "}
            <span className="font-mono text-[var(--text-secondary)]">{pr.head.ref}</span>
            {" into "}
            <span className="font-mono text-[var(--text-secondary)]">{pr.base.ref}</span>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px]">
        {pr.commits != null && (
          <span className="text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{pr.commits}</span> commits
          </span>
        )}
        {pr.changed_files != null && (
          <span className="text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{pr.changed_files}</span> files
          </span>
        )}
        {pr.additions != null && (
          <span className="text-[var(--color-success-text)]">+{pr.additions}</span>
        )}
        {pr.deletions != null && (
          <span className="text-[var(--color-danger-text)]">-{pr.deletions}</span>
        )}
      </div>

      {/* Labels */}
      {pr.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pr.labels.map((label) => (
            <span
              key={label.id}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
              style={{
                color: `#${label.color}`,
                borderColor: `#${label.color}33`,
                backgroundColor: `#${label.color}15`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      {pr.body && (
        <div className="rounded-2xl glass-card-static p-4">
          <MarkdownRenderer content={pr.body} className="text-[12px]" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isOpen && (
          <>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--glass-border-strong)] overflow-hidden">
              <button
                onClick={() => void mergePR()}
                disabled={actionBusy}
                className="h-7 px-3 btn-ink text-[11px] font-semibold disabled:opacity-50 rounded-none"
              >
                {actionBusy ? "Merging..." : `Merge (${mergeMethod})`}
              </button>
              <select
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value as typeof mergeMethod)}
                className="h-7 bg-[var(--surface-ink-solid)] text-[var(--text-primary)] text-[10px] border-none border-l border-[var(--glass-border)] px-1 outline-none cursor-pointer"
              >
                <option value="merge">merge</option>
                <option value="squash">squash</option>
                <option value="rebase">rebase</option>
              </select>
            </div>
            <button
              onClick={() => void closePR()}
              disabled={actionBusy}
              className="h-7 px-3 rounded-xl text-[11px] font-semibold text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg-strong)] transition-colors disabled:opacity-50"
            >
              Close
            </button>
          </>
        )}
        <button
          onClick={() => void loadDiff()}
          className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold"
        >
          {showDiff ? "Hide diff" : "View diff"}
        </button>
        <button
          onClick={() => setShowChecks(!showChecks)}
          className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold"
        >
          Checks {checks ? `(${checks.total_count})` : ""}
        </button>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold inline-flex items-center"
        >
          Open on GitHub
        </a>
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-3">
          <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
        </div>
      )}

      {/* Checks */}
      {showChecks && checks && (
        <div className="rounded-2xl glass-card-static p-4 space-y-2">
          <h3 className="text-[12px] font-bold text-[var(--text-primary)]">
            Checks ({checks.total_count})
          </h3>
          {checks.check_runs.map((run) => (
            <div key={run.id} className="flex items-center gap-2 text-[11px]">
              <CheckIcon status={run.status} conclusion={run.conclusion} />
              <span className="font-medium text-[var(--text-primary)] truncate flex-1">{run.name}</span>
              <span className="text-[var(--text-muted)] capitalize">{run.conclusion ?? run.status}</span>
            </div>
          ))}
          {checks.check_runs.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">No checks</p>
          )}
        </div>
      )}

      {/* Diff */}
      {showDiff && (
        <div className="rounded-2xl bg-[var(--log-bg)] p-4 max-h-[500px] overflow-auto">
          {diff ? (
            <pre className="text-[11px] font-mono text-[var(--text-inverse)] whitespace-pre-wrap break-words">
              {diff}
            </pre>
          ) : (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full dot-spinner" />
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="space-y-3">
        <h3 className="text-[12px] font-bold text-[var(--text-primary)]">
          Comments ({comments.length})
        </h3>
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-2xl glass-card-static p-3">
            <div className="flex items-center gap-2 mb-2">
              <img
                src={comment.user.avatar_url}
                alt={comment.user.login}
                className="w-5 h-5 rounded-full"
              />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                {comment.user.login}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {relTime(comment.created_at)}
              </span>
            </div>
            <MarkdownRenderer content={comment.body} className="text-[12px]" />
          </div>
        ))}

        {/* Add comment */}
        <div className="space-y-2">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className="w-full rounded-xl glass-input px-3 py-2 text-[12px] resize-none font-sans"
          />
          <button
            onClick={() => void addComment()}
            disabled={commenting || !commentBody.trim()}
            className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
          >
            {commenting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (conclusion === "success") {
    return <span className="w-3 h-3 shrink-0 text-[var(--color-success-text)]">&#x2713;</span>;
  }
  if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out") {
    return <span className="w-3 h-3 shrink-0 text-[var(--color-danger-text)]">&#x2717;</span>;
  }
  if (status === "in_progress" || status === "queued") {
    return <span className="w-3 h-3 shrink-0 text-[var(--color-warning-text)]">&#x25CB;</span>;
  }
  return <span className="w-3 h-3 shrink-0 text-[var(--text-muted)]">&#x2022;</span>;
}
