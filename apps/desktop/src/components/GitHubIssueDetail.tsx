import { useState, useEffect } from "react";
import { commands, type GitHubIssue, type GitHubComment, type RepoSlug } from "../lib/bindings";
import { relTime } from "../lib/ui";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface GitHubIssueDetailProps {
  slug: RepoSlug;
  issueNumber: number;
  onBack: () => void;
}

export function GitHubIssueDetail({ slug, issueNumber, onBack }: GitHubIssueDetailProps) {
  const [issue, setIssue] = useState<GitHubIssue | null>(null);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      commands.githubIssueGet(slug.owner, slug.repo, issueNumber),
      commands.githubIssueComments(slug.owner, slug.repo, issueNumber),
    ])
      .then(([iss, cmts]) => {
        if (!alive) return;
        setIssue(iss);
        setComments(cmts);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError((e as { message?: string })?.message ?? "Failed to load issue");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [slug.owner, slug.repo, issueNumber]);

  async function addComment() {
    if (!commentBody.trim()) return;
    setCommenting(true);
    try {
      const newComment = await commands.githubIssueComment(slug.owner, slug.repo, issueNumber, commentBody);
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to add comment");
    } finally {
      setCommenting(false);
    }
  }

  async function toggleState() {
    if (!issue) return;
    setActionBusy(true);
    try {
      const updated = issue.state === "open"
        ? await commands.githubIssueClose(slug.owner, slug.repo, issueNumber)
        : await commands.githubIssueReopen(slug.owner, slug.repo, issueNumber);
      setIssue(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="py-12 text-center">
        <p className="text-[12px] text-[var(--color-danger-text)]">{error ?? "Issue not found"}</p>
        <button onClick={onBack} className="mt-3 h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 h-7 w-7 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">#{issue.number}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              issue.state === "open"
                ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]"
                : "bg-purple-500/10 text-purple-400"
            }`}>
              {issue.state}
            </span>
          </div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">{issue.title}</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Opened by {issue.user.login} {relTime(issue.created_at)}
          </p>
        </div>
      </div>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
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

      {/* Assignees */}
      {issue.assignees.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">Assigned to:</span>
          {issue.assignees.map((u) => (
            <span key={u.id} className="text-[11px] font-semibold text-[var(--text-secondary)]">
              @{u.login}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      {issue.body && (
        <div className="rounded-2xl glass-card-static p-4">
          <MarkdownRenderer content={issue.body} className="text-[12px]" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => void toggleState()}
          disabled={actionBusy}
          className={`h-7 px-3 rounded-xl text-[11px] font-semibold disabled:opacity-50 ${
            issue.state === "open"
              ? "text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg-strong)]"
              : "btn-ink"
          } transition-colors`}
        >
          {issue.state === "open" ? "Close issue" : "Reopen issue"}
        </button>
        <a
          href={issue.html_url}
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
