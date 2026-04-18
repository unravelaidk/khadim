import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BuilderChat } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ═══════════════════════════════════════════════════════════════════════
   Drafts View — list of Agent Builder chats (drafts). Mirrors the calm
   density of SessionList: header, search, filter pills, row-per-entry.
   ═══════════════════════════════════════════════════════════════════════ */

type DraftFilter = "all" | "unsaved" | "saved";

interface DraftsViewProps {
  drafts: BuilderChat[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  /** Optional: ids flagged as "stale" (session dropped on restart). */
  staleIds?: Set<string>;
}

export function DraftsView({ drafts, onOpen, onNew, onDelete, staleIds }: DraftsViewProps) {
  const [filter, setFilter] = useState<DraftFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BuilderChat | null>(null);

  const filtered = useMemo(() => {
    const pool =
      filter === "unsaved"
        ? drafts.filter((d) => !d.savedAgentId)
        : filter === "saved"
          ? drafts.filter((d) => !!d.savedAgentId)
          : drafts;

    const q = query.trim().toLowerCase();
    const searched = q
      ? pool.filter((d) => {
          if (d.title.toLowerCase().includes(q)) return true;
          if (d.seedMessage && d.seedMessage.toLowerCase().includes(q)) return true;
          if (d.savedAgentName && d.savedAgentName.toLowerCase().includes(q)) return true;
          return d.messages.some((m) => m.content.toLowerCase().includes(q));
        })
      : pool;

    return [...searched].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [drafts, filter, query]);

  const savedCount = drafts.filter((d) => d.savedAgentId).length;
  const unsavedCount = drafts.length - savedCount;

  const filters: { id: DraftFilter; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "unsaved", label: "In progress", count: unsavedCount || undefined },
    { id: "saved", label: "Saved", count: savedCount || undefined },
  ];

  /* ── Empty ───────────────────────────────────────────────────── */
  if (drafts.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Drafts
          </p>
          <h1
            className="mt-6 font-display font-medium leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]"
            style={{ fontSize: "clamp(2rem, 3vw + 1rem, 2.75rem)" }}
          >
            No drafts yet.
          </h1>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-[var(--text-secondary)]">
            Drafts are in-progress conversations with the Agent Builder. Start one from
            the dashboard prompt — it stays here until you save it as an agent.
          </p>
          <button
            onClick={onNew}
            className="btn-ink mt-8 h-11 rounded-full px-6 text-[14px] font-medium"
          >
            Start a draft
          </button>
          <p className="mt-6 text-[11px] text-[var(--text-muted)]">
            Tip: press{" "}
            <KbdKey>⌘</KbdKey>
            <KbdKey>N</KbdKey>
            {" "}to start a new draft from anywhere in this view.
          </p>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-10 pt-8 pb-4">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Agent Builder
            </p>
            <h1 className="mt-2 font-display text-xl font-medium tracking-tight text-[var(--text-primary)]">
              Drafts
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.id
                      ? "depth-card-sm text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {f.label}
                  {f.count != null && (
                    <span className="tabular-nums text-[var(--color-pop)]">{f.count}</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={onNew}
              className="btn-ink ml-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium"
              title="New draft (⌘N)"
            >
              <i className="ri-add-line text-base leading-none" />
              New draft
              <span className="hidden md:inline opacity-60 font-mono text-[10px] ml-0.5">⌘N</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4">
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-10">
        {filtered.length === 0 ? (
          <p className="py-12 text-sm text-[var(--text-muted)]">
            {query.trim()
              ? `No drafts matching "${query.trim()}".`
              : `No ${filter === "unsaved" ? "in-progress" : "saved"} drafts.`}
          </p>
        ) : (
          <div className="flex flex-col pb-8">
            {filtered.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                stale={staleIds?.has(draft.id) ?? false}
                onOpen={() => onOpen(draft.id)}
                onDelete={() => setPendingDelete(draft)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <DeleteDraftDialog
          draft={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Search Input ────────────────────────────────────────────────── */

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘F / Ctrl+F focuses the search, but only within this view —
      // skip when typing in another input/textarea.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative max-w-md">
      <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search drafts…"
        className="h-9 w-full rounded-full bg-[var(--glass-bg)]/50 pl-9 pr-9 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:bg-[var(--glass-bg)]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-secondary)]"
        >
          <i className="ri-close-line text-sm leading-none" />
        </button>
      )}
    </div>
  );
}

/* ─── Draft Row ────────────────────────────────────────────────────── */

function DraftRow({
  draft,
  stale,
  onOpen,
  onDelete,
}: {
  draft: BuilderChat;
  stale: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const userTurns = draft.messages.filter((m) => m.role === "user").length;
  const preview =
    draft.messages.find((m) => m.role === "user")?.content ??
    draft.seedMessage ??
    "Empty draft";

  const saved = !!draft.savedAgentId;
  const dotCls = saved
    ? "bg-[var(--color-success)]"
    : userTurns === 0
      ? "bg-[var(--text-muted)] opacity-30"
      : "bg-[var(--color-pop)]";

  return (
    <div
      className="group -mx-2 flex items-center gap-4 rounded-[var(--radius-md)] px-2 py-3 transition-all hover:bg-[var(--glass-bg)]/30"
    >
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`relative h-2 w-2 rounded-full ${dotCls}`} />
        </span>

        <span className="w-48 shrink-0 truncate text-sm font-medium text-[var(--text-primary)]">
          {draft.title || "Untitled draft"}
        </span>

        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
          {preview}
        </span>

        {stale && !saved && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-secondary)]"
            style={{ background: "var(--tint-warm)" }}
            title="Previous session ended when the app closed"
          >
            Paused
          </span>
        )}

        {saved && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-success-text)]"
            style={{ background: "var(--tint-lime)" }}
          >
            Saved
          </span>
        )}

        <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-muted)] md:inline">
          {userTurns} {userTurns === 1 ? "turn" : "turns"}
        </span>

        <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
          {relTime(draft.updatedAt)}
        </span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete draft"
        className="shrink-0 rounded-full p-1.5 text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--glass-bg)] hover:text-[var(--color-danger-text)] group-hover:opacity-100"
      >
        <i className="ri-delete-bin-line text-base leading-none" />
      </button>
    </div>
  );
}

/* ─── Delete Confirmation ──────────────────────────────────────────── */function DeleteDraftDialog({
  draft,
  onCancel,
  onConfirm,
}: {
  draft: BuilderChat;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => confirmRef.current?.focus());
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, onConfirm]);

  const saved = !!draft.savedAgentId;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === backdropRef.current) onCancel(); }}
    >
      <div className="absolute inset-0 bg-[var(--surface-ink-25)] backdrop-blur-sm" />

      <div
        className="relative z-10 mx-4 w-full max-w-[440px] depth-card rounded-[var(--radius-xl)] animate-in zoom-in slide-in-from-bottom-4 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Delete draft"
      >
        <div className="px-6 pt-6 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Delete draft
          </p>
          <h2 className="font-display text-lg font-medium text-[var(--text-primary)] mt-1">
            {draft.title || "Untitled draft"}?
          </h2>
        </div>

        <div className="px-6 pb-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {saved ? (
            <>
              This draft has been saved as the agent{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {draft.savedAgentName}
              </span>
              . Deleting the draft won&apos;t remove the agent, but the conversation history will be lost.
            </>
          ) : (
            <>
              This conversation and all of its messages will be permanently removed. This can&apos;t be undone.
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--glass-border)] px-4 py-3">
          <button
            onClick={onCancel}
            className="h-9 rounded-full px-4 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="h-9 rounded-full px-4 text-[13px] font-medium text-white transition-colors"
            style={{ background: "var(--color-danger)" }}
          >
            Delete draft
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Kbd ──────────────────────────────────────────────────────────── */

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1 font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}
