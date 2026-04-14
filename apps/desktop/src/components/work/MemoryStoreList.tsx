import React from "react";
import type { MemoryStore, MemoryEntry } from "../../lib/types";

/* ─── Memory Store Detail ──────────────────────────────────────────── */

interface MemoryStoreDetailProps {
  store: MemoryStore;
  entries: MemoryEntry[];
  onBack: () => void;
  onAddEntry: () => void;
  onDeleteEntry: (id: string) => void;
  addEntrySlot?: React.ReactNode;
}

export function MemoryStoreDetail({
  store,
  entries,
  onBack,
  onAddEntry,
  onDeleteEntry,
  addEntrySlot,
}: MemoryStoreDetailProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-6 py-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        >
          <i className="ri-arrow-left-s-line text-[16px] leading-none" />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">{store.name}</span>
          {store.linkedAgentNames.length > 0 && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">{store.linkedAgentNames.join(", ")}</span>
          )}
        </div>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">{entries.length} entries</span>
        <button
          onClick={onAddEntry}
          className="text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Add entry
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {addEntrySlot}
        {entries.length === 0 && !addEntrySlot ? (
          <div className="px-10 py-16">
            <p className="text-sm text-[var(--text-muted)]">
              No entries yet. The agent will accumulate knowledge as it works.
            </p>
          </div>
        ) : (
          <div className="px-10 py-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group flex gap-4 border-b border-[var(--glass-border)] py-4 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-secondary)] font-mono">{entry.key}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-primary)]">
                    {entry.content}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                    <span>{Math.round(entry.confidence * 100)}% confidence</span>
                    {entry.sourceSessionId && (
                      <span className="font-mono">session {entry.sourceSessionId.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteEntry(entry.id)}
                  className="shrink-0 self-start text-xs text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-[var(--color-danger-text)]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Memory Store List ────────────────────────────────────────────── */

interface MemoryStoreListProps {
  stores: MemoryStore[];
  onCreateStore: () => void;
  onViewStore: (id: string) => void;
}

export function MemoryStoreList({
  stores,
  onCreateStore,
  onViewStore,
}: MemoryStoreListProps) {
  /* ── Empty ───────────────────────────────────────────────────── */
  if (stores.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Memory
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Memory stores let agents retain knowledge across sessions —
            facts like "Vendor X uses column B for totals" that make
            automations smarter over time.
          </p>
          <button
            onClick={onCreateStore}
            className="btn-accent mt-8 h-10 rounded-full px-6 text-sm font-semibold"
          >
            Create store
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated — each store as a clickable row ───────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Memory
          </h1>
          <button
            onClick={onCreateStore}
            className="btn-accent h-8 rounded-full px-4 text-xs font-semibold"
          >
            New store
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-10 pb-8">
        <div className="flex flex-col">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => onViewStore(store.id)}
              className="group flex items-center gap-4 border-b border-[var(--glass-border)] py-4 text-left last:border-0 -mx-3 px-3 rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--glass-bg)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{store.name}</p>
                {store.description && (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{store.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {store.scopeType === "chat"
                  ? "Chat"
                  : store.linkedAgentNames[0] ?? "Shared"}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                {store.entryCount} {store.entryCount === 1 ? "entry" : "entries"}
              </span>
              <i className="ri-arrow-right-s-line text-[14px] leading-none text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
