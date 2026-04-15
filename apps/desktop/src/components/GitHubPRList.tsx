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
          className="h-7 px-3 rounded-xl btn-ink text-[11px] font-medium"
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
            className={`px-3 py-1 rounded-xl text-[11px] font-medium capitalize transition-all ${
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
          className="w-full text-left rounded-2xl depth-card-sm p-3 transition-all"
        >
          <div className="flex items-start gap-3">
            <PRStateIcon pr={pr} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">#{pr.number}</span>
                {pr.draft && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-ink-5)] text-[var(--text-muted)]">
                    Draft
                  </span>
                )}
                {pr.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border"
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
              <p className="text-[12px] font-medium text-[var(--text-primary)] mt-0.5 truncate">
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
                    <i className="ri-chat-1-line text-[12px] leading-none" />
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
            className="h-7 px-3 rounded-xl btn-glass text-[11px] font-medium disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-[11px] text-[var(--text-muted)]">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={prs.length < 30}
            className="h-7 px-3 rounded-xl btn-glass text-[11px] font-medium disabled:opacity-30"
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
      <i className="ri-git-pull-request-line text-base leading-none mt-0.5 text-[var(--color-accent)]" />
    );
  }
  if (pr.state === "closed") {
    return (
      <i className="ri-git-pull-request-line text-base leading-none mt-0.5 text-[var(--color-danger-text)]" />
    );
  }
  if (pr.draft) {
    return (
      <i className="ri-git-branch-line text-base leading-none mt-0.5 text-[var(--text-muted)]" />
    );
  }
  return (
    <i className="ri-git-merge-line text-base leading-none mt-0.5 text-[var(--color-success-text)]" />
  );
}
