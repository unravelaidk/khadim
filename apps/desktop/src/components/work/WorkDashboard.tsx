import React, { useMemo, useRef, useState } from "react";
import type { ManagedAgent, SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ═══════════════════════════════════════════════════════════════════════
   Work Dashboard — a status room, not a metrics board.
   Ordered by urgency: what needs you, what's coming next, what just
   finished. The fleet lives in the right rail, grouped by health.
   Long-running metrics and charts live under Analytics.
   ═══════════════════════════════════════════════════════════════════════ */

type FleetHealth = "healthy" | "warning" | "idle" | "paused";

interface WorkDashboardProps {
  agents: ManagedAgent[];
  sessions: SessionRecord[];
  needsAttention: SessionRecord[];
  onViewSession: (id: string) => void;
  onNavigateAgents: () => void;
  onNavigateSessions: () => void;
  onCreateAgent: () => void;
  onRunAgent: (id: string) => void;
  onStartBuilder: (seed: string) => void;
  /** @deprecated — moved to Analytics. Kept to avoid breaking callers. */
  totalTokens?: number;
  /** @deprecated — moved to Analytics. */
  estimatedCost?: number;
  /** @deprecated — moved to Analytics. */
  dailySessions?: { date: string; count: number }[];
}

export function WorkDashboard({
  agents,
  sessions,
  needsAttention,
  onViewSession,
  onNavigateAgents,
  onNavigateSessions,
  onCreateAgent,
  onRunAgent,
  onStartBuilder,
}: WorkDashboardProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startBuilder = (seed: string) => {
    const trimmed = seed.trim();
    if (!trimmed) return;
    onStartBuilder(trimmed);
    setInput("");
  };

  /* ── Derived slices ─────────────────────────────────────────────── */
  const todayStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, []);

  const liveSessions = useMemo(
    () => sessions.filter((s) => s.status === "running"),
    [sessions],
  );
  const queuedSessions = useMemo(
    () => sessions.filter((s) => s.status === "pending" && s.trigger === "event"),
    [sessions],
  );
  const todaysRuns = useMemo(
    () =>
      sessions.filter((s) => {
        const ref = s.finishedAt ?? s.startedAt;
        return ref ? new Date(ref).getTime() >= todayStart : false;
      }),
    [sessions, todayStart],
  );
  const completedToday = useMemo(
    () => todaysRuns.filter((s) => s.status === "completed"),
    [todaysRuns],
  );
  const failedToday = useMemo(
    () =>
      todaysRuns.filter((s) => s.status === "failed" || s.status === "aborted"),
    [todaysRuns],
  );
  const scheduledAgents = useMemo(
    () => agents.filter((a) => a.triggerType === "schedule" && a.status === "active"),
    [agents],
  );
  const manualActiveAgents = useMemo(
    () => agents.filter((a) => a.status === "active" && a.triggerType === "manual"),
    [agents],
  );

  /* ── Fleet health — computed from recent run history per agent ── */
  const fleet = useMemo(() => {
    const groups: Record<FleetHealth, ManagedAgent[]> = {
      healthy: [],
      warning: [],
      idle: [],
      paused: [],
    };
    const lastRunByAgent = new Map<string, SessionRecord>();
    for (const s of sessions) {
      if (!s.agentId) continue;
      const prev = lastRunByAgent.get(s.agentId);
      const a = s.finishedAt ?? s.startedAt;
      const b = prev?.finishedAt ?? prev?.startedAt;
      if (!prev || (a && b && new Date(a).getTime() > new Date(b).getTime())) {
        lastRunByAgent.set(s.agentId, s);
      }
    }
    for (const agent of agents) {
      if (agent.status !== "active") {
        groups.paused.push(agent);
        continue;
      }
      const last = lastRunByAgent.get(agent.id);
      if (!last) {
        groups.idle.push(agent);
        continue;
      }
      if (last.status === "failed" || last.status === "aborted") {
        groups.warning.push(agent);
      } else if (last.status === "running" || last.status === "completed") {
        groups.healthy.push(agent);
      } else {
        groups.idle.push(agent);
      }
    }
    return groups;
  }, [agents, sessions]);

  const firstScheduled = scheduledAgents[0] ?? null;

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
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const headline = needsAttention.length > 0
    ? `${needsAttention.length === 1 ? "A run" : `${needsAttention.length} runs`} need${needsAttention.length === 1 ? "s" : ""} you.`
    : liveSessions.length > 0
      ? `${liveSessions.length === 1 ? "One agent is" : `${liveSessions.length} agents are`} working.`
      : scheduledAgents.length > 0
        ? "All quiet. Next run's on the calendar."
        : agents.length > 0
          ? "All quiet."
          : "Let's build something.";

  /* ── First-run: empty state ─────────────────────────────────────── */
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="max-w-lg px-12 py-16 stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {dateLabel}
          </p>
          <h1 className="mt-6 font-display font-medium leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]" style={{ fontSize: "clamp(2rem, 3vw + 1rem, 2.75rem)" }}>
            {greeting}.<br />
            <span className="text-[var(--text-secondary)]">Build your first agent.</span>
          </h1>
          <p className="mt-6 max-w-md text-[14px] leading-relaxed text-[var(--text-secondary)]">
            An agent is a persistent automation — give it instructions, pick its tools,
            and let it work on a schedule or whenever you trigger it.
          </p>
          <button
            onClick={onCreateAgent}
            className="btn-ink mt-8 h-11 rounded-full px-6 text-[14px] font-medium"
          >
            Create your first agent
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated ──────────────────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Main column — scrolls */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-8 pt-10 pb-16 xl:px-12">

          {/* ── Header ────────────────────────────────────────── */}
          <header
            className="stagger-in"
            style={{ "--stagger-delay": "0ms" } as React.CSSProperties}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {dateLabel}
            </p>
            <p className="mt-5 text-[14px] text-[var(--text-secondary)]">{greeting}.</p>
            <h1
              className="mt-1 font-display font-medium leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]"
              style={{ fontSize: "clamp(1.75rem, 2.5vw + 0.75rem, 2.5rem)" }}
            >
              {headline}
            </h1>
          </header>

          {/* ── Prompt bar ────────────────────────────────────── */}
          <div
            className="mt-8 stagger-in"
            style={{ "--stagger-delay": "80ms" } as React.CSSProperties}
          >
            <div className="group relative overflow-hidden depth-card transition-[box-shadow] duration-[var(--duration-base)] focus-within:shadow-[var(--shadow-depth-card-hover)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    startBuilder(input);
                  }
                }}
                placeholder="Describe what you want automated…"
                rows={1}
                className="block w-full resize-none bg-transparent px-6 pt-5 pb-3 text-[14px] leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                style={{ minHeight: "3.25rem", maxHeight: "40vh" }}
              />
              <div className="flex items-center justify-between px-4 pb-3 pt-0.5">
                <div className="flex items-center gap-1">
                  <PromptTool label="Context" icon="ri-attachment-2" />
                  <PromptTool label="Browser" icon="ri-computer-line" />
                  <PromptTool label="Tools"   icon="ri-tools-line" />
                </div>
                <button
                  onClick={() => startBuilder(input)}
                  disabled={!input.trim()}
                  aria-label="Design agent"
                  className="btn-accent inline-flex h-8 w-8 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-20 disabled:shadow-none"
                >
                  <i className="ri-arrow-up-line text-base leading-none" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <QuickAction label="New agent" onClick={onCreateAgent} />
              <QuickAction label="All runs"  onClick={onNavigateSessions} />
              {firstScheduled && (
                <QuickAction label={`Run ${firstScheduled.name}`} onClick={() => onRunAgent(firstScheduled.id)} />
              )}
            </div>
          </div>

          {/* ── Needs you ─────────────────────────────────────── */}
          <StatusSection
            title="Needs you"
            count={needsAttention.length + failedToday.length}
            tone={needsAttention.length > 0 ? "alert" : "default"}
            emptyLabel="Nothing's blocked on you."
            style={{ "--stagger-delay": "160ms" } as React.CSSProperties}
          >
            {needsAttention.slice(0, 4).map((s) => (
              <FeedItem
                key={s.id}
                tone="alert"
                flag="Needs input"
                title={s.agentName ?? "Run"}
                body={s.resultSummary ?? "Waiting for your decision."}
                time={s.startedAt ? relTime(s.startedAt) : undefined}
                action={{ label: "Review", onClick: () => onViewSession(s.id) }}
              />
            ))}
            {failedToday.slice(0, 3).map((s) => (
              <FeedItem
                key={s.id}
                tone="alert"
                flag={s.status === "aborted" ? "Aborted" : "Failed"}
                title={s.agentName ?? "Run"}
                body={s.errorMessage ?? s.resultSummary ?? "See log for details."}
                time={s.finishedAt ? relTime(s.finishedAt) : undefined}
                action={{ label: "Open log", onClick: () => onViewSession(s.id) }}
              />
            ))}
          </StatusSection>

          {/* ── Up next ───────────────────────────────────────── */}
          <StatusSection
            title="Up next"
            count={scheduledAgents.length + queuedSessions.length}
            emptyLabel="Nothing scheduled. Add a cron trigger to an agent."
            style={{ "--stagger-delay": "220ms" } as React.CSSProperties}
          >
            {queuedSessions.slice(0, 3).map((s) => (
              <FeedItem
                key={s.id}
                tone="upcoming"
                flag="Queued"
                title={s.agentName ?? "Run"}
                body={s.resultSummary ?? "Waiting to start."}
                time={s.startedAt ? relTime(s.startedAt) : undefined}
                action={{ label: "View", onClick: () => onViewSession(s.id) }}
              />
            ))}
            {scheduledAgents.slice(0, 4).map((a) => (
              <FeedItem
                key={a.id}
                tone="upcoming"
                flag="Scheduled"
                title={a.name}
                body={a.description || "Runs on its own schedule."}
                time={readableSchedule(a.triggerConfig)}
                action={{ label: "Run now", onClick: () => onRunAgent(a.id) }}
              />
            ))}
          </StatusSection>

          {/* ── Today ─────────────────────────────────────────── */}
          <StatusSection
            title="Today"
            count={liveSessions.length + completedToday.length}
            emptyLabel="No activity today yet."
            style={{ "--stagger-delay": "280ms" } as React.CSSProperties}
            trailing={
              todaysRuns.length > 4 ? (
                <button
                  onClick={onNavigateSessions}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  All runs →
                </button>
              ) : null
            }
          >
            {liveSessions.slice(0, 3).map((s) => (
              <FeedItem
                key={s.id}
                tone="live"
                flag="Running"
                title={s.agentName ?? "Run"}
                body={s.resultSummary ?? "In progress…"}
                time={s.startedAt ? relTime(s.startedAt) : undefined}
                action={{ label: "View", onClick: () => onViewSession(s.id) }}
              />
            ))}
            {completedToday.slice(0, 4).map((s) => (
              <FeedItem
                key={s.id}
                tone="done"
                flag="Done"
                title={s.agentName ?? "Run"}
                body={s.resultSummary ?? "Completed."}
                time={s.finishedAt ? relTime(s.finishedAt) : undefined}
                action={{ label: "View", onClick: () => onViewSession(s.id) }}
              />
            ))}
          </StatusSection>
        </div>
      </div>

      {/* ── Right rail — Fleet ────────────────────────────────── */}
      <aside className="hidden w-[300px] shrink-0 overflow-y-auto scrollbar-thin border-l border-[var(--glass-border)] xl:block">
        <div className="px-6 py-10">
          <div
            className="stagger-in"
            style={{ "--stagger-delay": "140ms" } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-[14px] font-medium text-[var(--text-primary)]">
                Fleet
              </h3>
              <button
                onClick={onNavigateAgents}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                All →
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-6">
              <FleetGroup
                label="Warning"
                agents={fleet.warning}
                tone="warning"
                onRunAgent={onRunAgent}
                onNavigateAgents={onNavigateAgents}
              />
              <FleetGroup
                label="Healthy"
                agents={fleet.healthy}
                tone="healthy"
                onRunAgent={onRunAgent}
                onNavigateAgents={onNavigateAgents}
              />
              <FleetGroup
                label="Idle"
                agents={[...fleet.idle, ...manualActiveAgents.filter(a => fleet.idle.every(i => i.id !== a.id) && fleet.healthy.every(h => h.id !== a.id) && fleet.warning.every(w => w.id !== a.id))]}
                tone="idle"
                onRunAgent={onRunAgent}
                onNavigateAgents={onNavigateAgents}
              />
              <FleetGroup
                label="Paused"
                agents={fleet.paused}
                tone="paused"
                onRunAgent={onRunAgent}
                onNavigateAgents={onNavigateAgents}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Status Section — the repeating unit of the status room ─────────── */

function StatusSection({
  title,
  count,
  tone = "default",
  emptyLabel,
  trailing,
  children,
  style,
}: {
  title: string;
  count: number;
  tone?: "default" | "alert";
  emptyLabel: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const isEmpty = count === 0;
  const countTone =
    tone === "alert" ? "text-[var(--color-danger-text)]" : "text-[var(--text-secondary)]";
  return (
    <section className="mt-12 stagger-in" style={style}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[14px] font-medium text-[var(--text-primary)]">
            {title}
          </h2>
          {!isEmpty && (
            <span className={`font-mono text-[11px] tabular-nums ${countTone}`}>
              {count}
            </span>
          )}
        </div>
        {trailing}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {isEmpty ? (
          <p className="py-2 text-[13px] text-[var(--text-muted)]">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/* ── Fleet group — agent cluster by health ──────────────────────────── */

function FleetGroup({
  label,
  agents,
  tone,
  onRunAgent,
  onNavigateAgents,
}: {
  label: string;
  agents: ManagedAgent[];
  tone: FleetHealth;
  onRunAgent: (id: string) => void;
  onNavigateAgents: () => void;
}) {
  if (agents.length === 0) return null;
  const dotCls =
    tone === "healthy" ? "bg-[var(--color-success)]" :
    tone === "warning" ? "bg-[var(--color-danger)]" :
    tone === "paused"  ? "bg-[var(--text-muted)] opacity-40" :
    "bg-[var(--text-muted)] opacity-70";
  const headerColor =
    tone === "warning" ? "text-[var(--color-danger-text)]" : "text-[var(--text-muted)]";

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
        <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${headerColor}`}>
          {label} · {agents.length}
        </p>
      </div>
      <ul className="mt-2 flex flex-col">
        {agents.slice(0, 4).map((a) => (
          <li key={a.id}>
            <button
              onClick={() => (tone === "paused" ? onNavigateAgents() : onRunAgent(a.id))}
              className="group flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-1 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg)]/50"
              title={tone === "paused" ? "Open agent" : "Run now"}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
                {a.name}
              </span>
              {tone !== "paused" && (
                <i className="ri-play-line shrink-0 text-[13px] leading-none text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          </li>
        ))}
        {agents.length > 4 && (
          <li>
            <button
              onClick={onNavigateAgents}
              className="mt-1 rounded-[var(--radius-xs)] px-1 py-1 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              + {agents.length - 4} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/* ── Prompt bar tool button ───────────────────────────────────────── */

function PromptTool({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
    >
      <i className={`${icon} text-base leading-none`} />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

/* ── Quick action ─────────────────────────────────────────────────── */

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all hover:text-[var(--text-primary)]"
      style={{ background: "var(--tint-warm)" }}
    >
      {label}
    </button>
  );
}

/* ── Feed item — status-room row ──────────────────────────────────── */

const TONE_STYLES = {
  alert: {
    dot: "bg-[var(--color-danger)]",
    flag: "text-[var(--color-danger-text)]",
  },
  live: {
    dot: "bg-[var(--color-pop)] status-pulse",
    flag: "text-[var(--color-accent)]",
  },
  upcoming: {
    dot: "bg-[var(--text-secondary)] opacity-60",
    flag: "text-[var(--text-secondary)]",
  },
  done: {
    dot: "bg-[var(--color-success)]",
    flag: "text-[var(--color-success-text)]",
  },
} as const;

function FeedItem({
  tone,
  flag,
  title,
  body,
  time,
  action,
}: {
  tone: keyof typeof TONE_STYLES;
  flag: string;
  title: string;
  body: string;
  time?: string;
  action?: { label: string; onClick: () => void };
}) {
  const s = TONE_STYLES[tone];
  const tintBg =
    tone === "alert" ? "var(--tint-rose)"
    : tone === "live" ? "var(--tint-amber)"
    : tone === "upcoming" ? "var(--tint-sky)"
    : "var(--tint-lime)";

  return (
    <div className="group depth-card-sm flex gap-3.5 p-4 transition-all hover:shadow-[var(--shadow-depth-card-hover)]">
      <div className="flex flex-col items-center pt-1.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {tone === "live" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-pop)] opacity-30" />
          )}
          <span className={`relative h-2.5 w-2.5 rounded-full ${s.dot}`} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${s.flag}`}
            style={{ background: tintBg }}
          >
            {flag}
          </span>
          {time && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {time}
            </span>
          )}
        </div>
        <p className="mt-2 text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {body}
        </p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            {action.label} →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function readableSchedule(cfg?: string | null): string | undefined {
  if (!cfg) return undefined;
  try {
    const parsed = JSON.parse(cfg) as { cron?: string; time?: string; interval?: string };
    if (parsed.time) return parsed.time;
    if (parsed.interval) return `Every ${parsed.interval}`;
    if (parsed.cron) return parsed.cron;
  } catch {
    return cfg.length > 20 ? cfg.slice(0, 20) + "…" : cfg;
  }
  return undefined;
}
