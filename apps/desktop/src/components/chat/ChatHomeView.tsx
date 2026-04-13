import { useMemo } from "react";
import type { LocalChatConversation } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ═══════════════════════════════════════════════════════════════════════
   Chat Home — greeting + proactive suggestions + recent conversations
   Mirrors the Work dashboard's typographic register, scoped to chat data.
   ═══════════════════════════════════════════════════════════════════════ */

interface ChatHomeViewProps {
  conversations: LocalChatConversation[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onStartWith: (prompt: string) => void;
  onOpenMemory: () => void;
  onOpenAgents: () => void;
}

const STARTERS = [
  {
    title: "Summarise my day",
    prompt: "Give me a brief recap of what I've been working on today based on my recent chats.",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    title: "Draft an email",
    prompt: "Help me draft an email — I'll tell you the context and you give me three concise variants.",
    icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  {
    title: "Plan a feature",
    prompt: "I want to plan a new feature. Ask me clarifying questions, then propose a phased plan.",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    title: "Think out loud",
    prompt: "I want to think something through. Ask me questions and help me find the argument I'm missing.",
    icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  },
];

export function ChatHomeView({
  conversations,
  onSelectChat,
  onNewChat,
  onStartWith,
  onOpenMemory,
  onOpenAgents,
}: ChatHomeViewProps) {
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
  }, []);

  const recent = useMemo(
    () =>
      [...conversations]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [conversations],
  );
  const total = conversations.length;
  const todayStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, []);
  const startedToday = useMemo(
    () => conversations.filter((c) => new Date(c.createdAt).getTime() >= todayStart).length,
    [conversations, todayStart],
  );

  const headline = total === 0
    ? "Let's start a conversation."
    : "Pick up where you left off.";
  const statLine = total === 0
    ? "Your chats will appear here."
    : `${total} conversation${total === 1 ? "" : "s"} · ${startedToday} started today`;

  return (
    <div className="flex h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10 pb-16 xl:px-12">
        {/* Header */}
        <header
          className="stagger-in"
          style={{ ["--stagger-delay" as string]: "0ms" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {dateLabel}
          </p>
          <p className="mt-5 text-[15px] text-[var(--text-secondary)]">{greeting}</p>
          <h1 className="mt-1 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]">
            {headline}
          </h1>
          <p className="mt-3 text-[13px] text-[var(--text-muted)]">{statLine}</p>
        </header>

        {/* Starter chips */}
        <div
          className="mt-10 grid grid-cols-1 gap-2 sm:grid-cols-2 stagger-in"
          style={{ ["--stagger-delay" as string]: "80ms" }}
        >
          {STARTERS.map((s) => (
            <button
              key={s.title}
              onClick={() => onStartWith(s.prompt)}
              className="group flex items-start gap-3 rounded-[16px] border border-[var(--glass-border)] bg-[var(--surface-card)] px-4 py-3.5 text-left transition-colors hover:border-[var(--glass-border-strong)] hover:bg-[var(--surface-card-hover)]"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{s.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--text-secondary)]">
                  {s.prompt}
                </p>
              </div>
              <svg className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div
          className="mt-6 flex flex-wrap items-center gap-2 stagger-in"
          style={{ ["--stagger-delay" as string]: "160ms" }}
        >
          <ChipLink label="New chat" onClick={onNewChat} />
          <ChipLink label="Open memory" onClick={onOpenMemory} />
          <ChipLink label="Custom agents" onClick={onOpenAgents} />
        </div>

        {/* Recent conversations */}
        <section
          className="mt-14 stagger-in"
          style={{ ["--stagger-delay" as string]: "240ms" }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-medium text-[var(--text-primary)]">Recent</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {total} total
            </span>
          </div>

          {recent.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[var(--glass-border)] px-6 py-10 text-center">
              <p className="text-[13px] text-[var(--text-secondary)]">No conversations yet.</p>
              <button
                onClick={onNewChat}
                className="mt-4 inline-flex h-9 items-center rounded-full btn-accent px-5 text-[12px] font-semibold"
              >
                Start a conversation
              </button>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col">
              {recent.map((c) => {
                const last = c.messages[c.messages.length - 1];
                const preview = last?.content.slice(0, 120) ?? "Empty conversation";
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelectChat(c.id)}
                      className="group flex w-full items-baseline gap-4 border-t border-[var(--glass-border)] px-1 py-3 text-left transition-colors last:border-b hover:bg-[var(--glass-bg)]"
                    >
                      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {relTime(c.updatedAt)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-display text-[14px] font-medium text-[var(--text-primary)]">
                          {c.title || "Untitled"}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[var(--text-secondary)]">
                          {preview}
                        </span>
                      </span>
                      <svg className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChipLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--surface-card)] px-4 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--glass-border-strong)] hover:text-[var(--text-primary)]"
    >
      {label}
    </button>
  );
}
