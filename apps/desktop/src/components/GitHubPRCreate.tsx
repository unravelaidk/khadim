import { useState, useEffect } from "react";
import { commands, type GitHubPR, type RepoSlug, type BranchInfo } from "../lib/bindings";

interface GitHubPRCreateProps {
  slug: RepoSlug;
  repoPath: string;
  onCreated: (pr: GitHubPR) => void;
  onCancel: () => void;
}

export function GitHubPRCreate({ slug, repoPath, onCreated, onCancel }: GitHubPRCreateProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void commands.gitListBranches(repoPath)
      .then((brs) => {
        setBranches(brs.filter((b) => !b.is_remote));
        const current = brs.find((b) => b.is_current && !b.is_remote);
        if (current) setHead(current.name);
        // Default base to main or master
        const defaultBase = brs.find((b) => !b.is_remote && (b.name === "main" || b.name === "master"));
        if (defaultBase) setBase(defaultBase.name);
      })
      .catch(() => {});
  }, [repoPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !head || !base) return;
    setSubmitting(true);
    setError(null);
    try {
      const pr = await commands.githubPrCreate(slug.owner, slug.repo, title, body || undefined, head, base, draft);
      onCreated(pr);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "Failed to create PR");
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
          <i className="ri-arrow-left-s-line text-[14px] leading-none" />
        </button>
        <h2 className="text-sm font-bold text-[var(--text-primary)]">New Pull Request</h2>
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
        {/* Branch selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Head branch
            </label>
            <select
              value={head}
              onChange={(e) => setHead(e.target.value)}
              className="w-full h-8 rounded-xl glass-input px-3 text-[12px] font-mono"
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Base branch
            </label>
            <select
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="w-full h-8 rounded-xl glass-input px-3 text-[12px] font-mono"
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR title"
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
            placeholder="Describe the changes..."
            rows={6}
            className="w-full rounded-xl glass-input px-3 py-2 text-[12px] resize-none font-sans"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
            className="rounded border-[var(--glass-border-strong)]"
          />
          <span className="text-[11px] text-[var(--text-secondary)]">Create as draft</span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !title.trim() || !head || !base}
            className="h-8 px-4 rounded-xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create pull request"}
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
