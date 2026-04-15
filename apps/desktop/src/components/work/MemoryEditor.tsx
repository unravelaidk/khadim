import React, { useState } from "react";

/* ─── Memory Store Editor ──────────────────────────────────────────── */

export interface MemoryStoreEditorData {
  name: string;
  description: string;
}

interface MemoryStoreEditorProps {
  store: { id: string; name: string; description: string } | null;
  onSave: (data: MemoryStoreEditorData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function MemoryStoreEditor({
  store,
  onSave,
  onCancel,
  onDelete,
}: MemoryStoreEditorProps) {
  const [name, setName] = useState(store?.name ?? "");
  const [description, setDescription] = useState(store?.description ?? "");

  const canSave = name.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-8 py-4">
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        >
          <i className="ri-arrow-left-s-line text-base leading-none" />
        </button>
        <h1 className="flex-1 font-display text-[18px] font-medium tracking-tight text-[var(--text-primary)]">
          {store ? "Edit memory" : "New memory"}
        </h1>
        <div className="flex items-center gap-2">
          {onDelete && store && (
            <button
              onClick={onDelete}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => onSave({ name: name.trim(), description: description.trim() })}
            disabled={!canSave}
            className="btn-ink inline-flex h-8 items-center rounded-full px-5 text-[11px] font-medium disabled:opacity-40"
          >
            {store ? "Save" : "Create"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-xl px-8 py-6">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Knowledge, Customer Preferences"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
              autoFocus
            />
          </div>

          <div className="mt-4">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of things should be remembered here? (optional)"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-[var(--text-muted)]">
            You can link agents to this memory later from the agent editor.
          </p>

          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}

/* ─── Memory Entry Editor (inline add) ─────────────────────────────── */

export interface MemoryEntryEditorData {
  key: string;
  content: string;
}

interface MemoryEntryEditorProps {
  onSave: (data: MemoryEntryEditorData) => void;
  onCancel: () => void;
}

export function MemoryEntryEditor({ onSave, onCancel }: MemoryEntryEditorProps) {
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const canSave = key.trim().length > 0 && content.trim().length > 0;

  return (
    <div className="border-b border-[var(--glass-border)] px-10 py-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Key (e.g. vendor_x_format)"
            className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-8 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[11px]"
            autoFocus
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What should the agent remember?"
            rows={2}
            className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-2 w-full resize-y rounded-[var(--radius-sm)] px-3 py-2 text-[12px] leading-relaxed"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1 pt-0.5">
          <button
            onClick={() => onSave({ key: key.trim(), content: content.trim() })}
            disabled={!canSave}
            className="btn-ink inline-flex h-7 items-center rounded-full px-3 text-[10px] font-medium disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="inline-flex h-7 items-center rounded-full px-3 text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
