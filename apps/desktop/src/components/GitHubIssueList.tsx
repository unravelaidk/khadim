import { useState, useEffect } from "react";
import { commands, type GitHubIssue, type RepoSlug } from "../lib/bindings";
import { relTime } from "../lib/ui";

interface GitHubIssueListProps {
  slug: RepoSlug;
  onSelectIssue: (number: number) => void;
  onCreateIssue: () => void;
}

export function GitHubIssueList({ slug, onSelectIssue, onCreateIssue }: GitHubIssueListProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filter, slug.owner, slug.repo]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void commands
      .githubIssueList(slug.owner, slug.repo, filter, page, 30)
      .then((data) => {
        if (!alive) return;
        // Filter out pull requests (GitHub issues endpoint returns PRs too)
        setIssues(data.filter((i) => !i.pull_request));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError((e as { message?: string })?.message ?? "Failed to load issues");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [slug.owner, slug.repo, filter, page]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Issues</h2>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {slug.owner}/{slug.repo}
          </span>
        </div>
        <button
          onClick={onCreateIssue}
          className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold"
        >
          New issue
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["open", "closed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-xl text-[11px] font-semibold capitalize transition-all ${
              filter === f
                ? "btn-ink"
                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-3">
          <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-8 flex justify-center">
          <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full dot-spinner" />
        </div>
      )}

      {/* Issue list */}
      {!loading && issues.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-[12px] text-[var(--text-secondary)]">No {filter} issues</p>
        </div>
      )}

      {!loading && issues.map((issue) => (
        <button
          key={issue.number}
          onClick={() => onSelectIssue(issue.number)}
          className="w-full text-left rounded-2xl glass-card p-3 transition-all"
        >
          <div className="flex items-start gap-3">
            <IssueStateIcon state={issue.state} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">#{issue.number}</span>
                {issue.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
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
              <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {issue.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[var(--text-muted)]">
                  by {issue.user.login}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {relTime(issue.created_at)}
                </span>
                {issue.comments > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    {issue.comments}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {/* Pagination */}
      {!loading && issues.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-[11px] text-[var(--text-muted)]">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={issues.length < 30}
            className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function IssueStateIcon({ state }: { state: string }) {
  if (state === "open") {
    return (
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-success-text)]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
        <path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.28 6.78a.75.75 0 00-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z" />
      <path fillRule="evenodd" d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-1.5 0a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
    </svg>
  );
}
