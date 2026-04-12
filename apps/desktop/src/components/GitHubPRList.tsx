import { useState, useEffect } from "react";
import { commands, type GitHubPR, type RepoSlug } from "../lib/bindings";
import { relTime } from "../lib/ui";

interface GitHubPRListProps {
  slug: RepoSlug;
  onSelectPR: (number: number) => void;
  onCreatePR: () => void;
}

export function GitHubPRList({ slug, onSelectPR, onCreatePR }: GitHubPRListProps) {
  const [prs, setPrs] = useState<GitHubPR[]>([]);
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
      .githubPrList(slug.owner, slug.repo, filter, page, 30)
      .then((data) => {
        if (!alive) return;
        setPrs(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError((e as { message?: string })?.message ?? "Failed to load PRs");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [slug.owner, slug.repo, filter, page]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Pull Requests</h2>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {slug.owner}/{slug.repo}
          </span>
        </div>
        <button
          onClick={onCreatePR}
          className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold"
        >
          New PR
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
          <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin" />
        </div>
      )}

      {/* PR list */}
      {!loading && prs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-[12px] text-[var(--text-secondary)]">No {filter} pull requests</p>
        </div>
      )}

      {!loading && prs.map((pr) => (
        <button
          key={pr.number}
          onClick={() => onSelectPR(pr.number)}
          className="w-full text-left rounded-2xl glass-card p-3 transition-all"
        >
          <div className="flex items-start gap-3">
            <PRStateIcon pr={pr} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">#{pr.number}</span>
                {pr.draft && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--surface-ink-5)] text-[var(--text-muted)]">
                    Draft
                  </span>
                )}
                {pr.labels.slice(0, 3).map((label) => (
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
                {pr.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[var(--text-muted)]">by {pr.user.login}</span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {pr.head.ref} &rarr; {pr.base.ref}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{relTime(pr.created_at)}</span>
                {pr.comments > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    {pr.comments}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {/* Pagination */}
      {!loading && prs.length > 0 && (
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
            disabled={prs.length < 30}
            className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function PRStateIcon({ pr }: { pr: GitHubPR }) {
  if (pr.merged_at) {
    return (
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-accent)]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8-9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM4.25 4a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
      </svg>
    );
  }
  if (pr.state === "closed") {
    return (
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-danger-text)]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75zm-2.03-5.273a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1-1.06 1.06L12 3.56l-.72.72a.75.75 0 0 1-1.06-1.06l2-2z" />
      </svg>
    );
  }
  if (pr.draft) {
    return (
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-muted)]" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M2.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zM3.25 1a2.25 2.25 0 0 0-.75 4.372v5.256a2.251 2.251 0 1 0 1.5 0V5.372A2.251 2.251 0 0 0 3.25 1zm0 11a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-success-text)]" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354zM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0z" />
    </svg>
  );
}
