import { useEffect, useMemo, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   Custom Agents — UI-only scaffold.
   Stores agent definitions in localStorage. Wiring to an actual runner
   lives in Work mode / ManagedAgent today; this surface is the simple,
   chat-first agent builder (system prompt + model hint).
   ═══════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "khadim:customAgents";

interface CustomAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelHint: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
}

function loadAgents(): CustomAgent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();
    return parsed as CustomAgent[];
  } catch {
    return seed();
  }
}

function saveAgents(list: CustomAgent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function seed(): CustomAgent[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      name: "Editor",
      description: "A sharp editor for prose and product copy.",
      systemPrompt:
        "You are a sharp, unsentimental editor. Cut hedge words, strengthen verbs, and rewrite for clarity without losing voice. Respond with the edit and a one-line rationale.",
      modelHint: "claude-sonnet-4-6",
      emoji: "✎",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Rubber duck",
      description: "Helps me think something through by asking questions.",
      systemPrompt:
        "You are a rubber duck. Ask one clarifying question at a time. Never volunteer answers until I explicitly ask — your job is to help me find the thought I'm missing.",
      modelHint: "claude-opus-4-6",
      emoji: "✦",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const EMOJI_POOL = ["✎", "✦", "☉", "⟡", "◈", "✧", "⌘", "◉", "⬡", "⌂"];

export function CustomAgentsView({
  onRequestChat,
}: {
  onRequestChat: (agent: { name: string; systemPrompt: string }) => void;
}) {
  const [agents, setAgents] = useState<CustomAgent[]>(() => loadAgents());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    saveAgents(agents);
  }, [agents]);

  const editing = useMemo(
    () => agents.find((a) => a.id === editingId) ?? null,
    [agents, editingId],
  );

  function handleCreate() {
    setIsCreating(true);
    setEditingId(null);
  }

  function handleSaveNew(data: Omit<CustomAgent, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const agent: CustomAgent = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    setAgents((prev) => [agent, ...prev]);
    setIsCreating(false);
  }

  function handleSaveEdit(id: string, data: Omit<CustomAgent, "id" | "createdAt" | "updatedAt">) {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a,
      ),
    );
    setEditingId(null);
  }

  function handleDelete(id: string) {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    if (editingId === id) setEditingId(null);
  }

  if (isCreating) {
    return (
      <AgentEditor
        onCancel={() => setIsCreating(false)}
        onSave={handleSaveNew}
      />
    );
  }

  if (editing) {
    return (
      <AgentEditor
        initial={editing}
        onCancel={() => setEditingId(null)}
        onSave={(data) => handleSaveEdit(editing.id, data)}
        onDelete={() => handleDelete(editing.id)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10 pb-16 xl:px-12">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Custom agents
            </p>
            <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)]">
              Your bench of assistants.
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Give each one a system prompt and a personality. Pick one when you
              start a chat — it'll set the tone for the whole conversation.
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full btn-accent px-4 text-[12px] font-semibold"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New agent
          </button>
        </header>

        {agents.length === 0 ? (
          <div className="mt-10 rounded-[18px] border border-dashed border-[var(--glass-border)] px-6 py-12 text-center">
            <p className="font-display text-[16px] font-medium text-[var(--text-primary)]">
              No agents yet
            </p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Create one to shape how Khadim responds in a conversation.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {agents.map((agent) => (
              <article
                key={agent.id}
                className="group flex flex-col gap-3 rounded-[18px] border border-[var(--glass-border)] bg-[var(--surface-card)] px-5 py-4 transition-colors hover:border-[var(--glass-border-strong)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg)] font-display text-[16px] text-[var(--text-primary)]">
                    {agent.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-semibold text-[var(--text-primary)]">
                      {agent.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--text-secondary)]">
                      {agent.description || "No description."}
                    </p>
                  </div>
                </div>

                <p className="line-clamp-3 rounded-[12px] bg-[var(--glass-bg)] px-3 py-2 font-mono text-[11px] leading-snug text-[var(--text-secondary)]">
                  {agent.systemPrompt}
                </p>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {agent.modelHint || "default model"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onRequestChat({ name: agent.name, systemPrompt: agent.systemPrompt })
                      }
                      className="inline-flex h-7 items-center rounded-full bg-[var(--glass-bg)] px-3 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                    >
                      Chat
                    </button>
                    <button
                      onClick={() => setEditingId(agent.id)}
                      className="inline-flex h-7 items-center rounded-full px-3 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Editor form ──────────────────────────────────────────────────── */

function AgentEditor({
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  initial?: CustomAgent;
  onCancel: () => void;
  onSave: (data: Omit<CustomAgent, "id" | "createdAt" | "updatedAt">) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [modelHint, setModelHint] = useState(initial?.modelHint ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? EMOJI_POOL[0]);

  const canSave = name.trim().length > 0 && systemPrompt.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl px-8 pt-10 pb-16">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to agents
        </button>

        <h1 className="mt-6 font-display text-[28px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">
          {initial ? "Edit agent" : "New agent"}
        </h1>

        <div className="mt-8 flex flex-col gap-6">
          {/* Identity row */}
          <div className="flex items-end gap-4">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Sigil
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EMOJI_POOL.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-display text-[15px] transition-colors ${
                      emoji === e
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                        : "bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sharp editor"
                className="glass-input mt-2 h-10 w-full rounded-[12px] px-4 text-[14px]"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Short description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line about what this agent does."
              className="glass-input mt-2 h-10 w-full rounded-[12px] px-4 text-[14px]"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              System prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe how the agent should respond. This is the whole instruction — keep it concrete."
              rows={8}
              className="glass-input mt-2 w-full resize-y rounded-[14px] px-4 py-3 font-mono text-[13px] leading-relaxed"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Model hint
            </label>
            <input
              value={modelHint}
              onChange={(e) => setModelHint(e.target.value)}
              placeholder="optional — e.g. claude-sonnet-4-6"
              className="glass-input mt-2 h-10 w-full rounded-[12px] px-4 text-[14px]"
            />
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Not enforced yet — the chat picker still owns model selection.
            </p>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          {onDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex h-9 items-center rounded-full px-4 text-[12px] font-medium text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger-muted)]"
            >
              Delete agent
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="inline-flex h-9 items-center rounded-full px-4 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              disabled={!canSave}
              onClick={() =>
                onSave({ name: name.trim(), description: description.trim(), systemPrompt: systemPrompt.trim(), modelHint: modelHint.trim(), emoji })
              }
              className="inline-flex h-9 items-center rounded-full btn-accent px-5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {initial ? "Save" : "Create agent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
