import { useState } from "react";
import { commands, type GitHubIssue, type RepoSlug } from "../lib/bindings";

interface GitHubIssueCreateProps {
  slug: RepoSlug;
  onCreated: (issue: GitHubIssue) => void;
  onCancel: () => void;
}

export function GitHubIssueCreate({ slug, onCreated, onCancel }: GitHubIssueCreateProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const issue = await commands.githubIssueCreate(slug.owner, slug.repo, title, body || undefined);
      onCreated(issue);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "Failed to create issue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-sm font-bold text-[var(--text-primary)]">New Issue</h2>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {slug.owner}/{slug.repo}
        </span>
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-3">
          <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            className="w-full h-8 rounded-xl glass-input px-3 text-[12px] font-sans"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
            Description
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the issue..."
            rows={8}
            className="w-full rounded-xl glass-input px-3 py-2 text-[12px] resize-none font-sans"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="h-8 px-4 rounded-xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create issue"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-4 rounded-xl btn-glass text-[12px] font-semibold"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
