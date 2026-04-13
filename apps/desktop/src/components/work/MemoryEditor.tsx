import React, { useState } from "react";

/* ─── Memory Store Editor ──────────────────────────────────────────── */

export interface MemoryStoreEditorData {
  name: string;
  description: string;
  agentId: string | null;
  scopeType: "agent" | "shared";
}

interface MemoryStoreEditorProps {
  store: { id: string; name: string; description: string; agentId: string | null; scopeType: "agent" | "shared" } | null;
  availableAgents: { id: string; name: string }[];
  onSave: (data: MemoryStoreEditorData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function MemoryStoreEditor({
  store,
  availableAgents,
  onSave,
  onCancel,
  onDelete,
}: MemoryStoreEditorProps) {
  const [name, setName] = useState(store?.name ?? "");
  const [description, setDescription] = useState(store?.description ?? "");
  const [agentId, setAgentId] = useState<string | null>(store?.agentId ?? null);
  const scopeType = agentId ? "agent" : "shared";

  const canSave = name.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-8 py-4">
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 font-display text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
          {store ? "Edit memory store" : "New memory store"}
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
            onClick={() => onSave({ name: name.trim(), description: description.trim(), agentId, scopeType })}
            disabled={!canSave}
            className="btn-accent inline-flex h-8 items-center rounded-full px-5 text-[11px] font-semibold disabled:opacity-40"
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
              placeholder="e.g. Invoice Processing Knowledge"
              className="glass-input mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          <div className="mt-4">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of knowledge goes here? (optional)"
              className="glass-input mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          <div className="mt-6">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Scope</label>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Assign to a specific agent, or keep shared across all agents.
            </p>
            <div className="mt-2 flex flex-col gap-1">
              <button
                onClick={() => setAgentId(null)}
                className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                  agentId === null ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  agentId === null ? "border-[var(--text-primary)]" : "border-[var(--glass-border-strong)]"
                }`}>
                  {agentId === null && <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />}
                </span>
                <span className="text-[13px] text-[var(--text-primary)]">Shared (all agents)</span>
              </button>
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setAgentId(agent.id)}
                  className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                    agentId === agent.id ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    agentId === agent.id ? "border-[var(--text-primary)]" : "border-[var(--glass-border-strong)]"
                  }`}>
                    {agentId === agent.id && <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />}
                  </span>
                  <span className="text-[13px] text-[var(--text-primary)]">{agent.name}</span>
                </button>
              ))}
            </div>
          </div>

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
            className="glass-input h-8 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[11px]"
            autoFocus
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What should the agent remember?"
            rows={2}
            className="glass-input mt-2 w-full resize-y rounded-[var(--radius-sm)] px-3 py-2 text-[12px] leading-relaxed"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1 pt-0.5">
          <button
            onClick={() => onSave({ key: key.trim(), content: content.trim() })}
            disabled={!canSave}
            className="btn-accent inline-flex h-7 items-center rounded-full px-3 text-[10px] font-semibold disabled:opacity-40"
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
