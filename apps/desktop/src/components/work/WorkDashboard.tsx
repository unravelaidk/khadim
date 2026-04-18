import React, { useMemo, useRef, useState } from "react";
import type { ManagedAgent, SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ═══════════════════════════════════════════════════════════════════════
   Work Dashboard — mission control for Khadim's managed agent surface.
   Typography-driven, asymmetric, calm density.
   ═══════════════════════════════════════════════════════════════════════ */

interface WorkDashboardProps {
  agents: ManagedAgent[];
  sessions: SessionRecord[];
  needsAttention: SessionRecord[];
  onViewSession: (id: string) => void;
  onNavigateAgents: () => void;
  onNavigateSessions: () => void;
  onCreateAgent: () => void;
  onRunAgent: (id: string) => void;
  /** Start a new Agent Builder draft with the given seed prompt. */
  onStartBuilder: (seed: string) => void;
  totalTokens?: number;
  estimatedCost?: number;
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
  const liveSessions = useMemo(
    () => sessions.filter((s) => s.status === "running" || s.status === "pending"),
    [sessions],
  );
  const todayStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, []);
  const completedToday = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.status === "completed" &&
          s.finishedAt &&
          new Date(s.finishedAt).getTime() >= todayStart,
      ),
    [sessions, todayStart],
  );
  const scheduledAgents = useMemo(
    () => agents.filter((a) => a.triggerType === "schedule" && a.status === "active"),
    [agents],
  );
  const activeAgents = useMemo(
    () => agents.filter((a) => a.status === "active"),
    [agents],
  );

  const firstLive = liveSessions[0] ?? null;
  const firstDone = completedToday[0] ?? null;
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

  const headline = liveSessions.length > 0
    ? "Things are moving."
    : activeAgents.length > 0
      ? "Everything's ready."
      : "Let's build something.";

  /* ── First-run: empty state ─────────────────────────────────────── */
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg stagger-in" style={{ "--stagger-delay": "0ms" } as React.CSSProperties}>
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
        <div className="mx-auto w-full max-w-4xl px-8 pt-10 pb-16 xl:px-12">

          {/* ── Header ────────────────────────────────────────── */}
          <header
            className="stagger-in"
            style={{ "--stagger-delay": "0ms" } as React.CSSProperties}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {dateLabel}
            </p>
            <div className="mt-5 flex items-end justify-between gap-8">
              <div className="min-w-0">
                <p className="text-[14px] text-[var(--text-secondary)]">{greeting}.</p>
                <h1
                  className="mt-1 font-display font-medium leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]"
                  style={{ fontSize: "clamp(1.75rem, 2.5vw + 0.75rem, 2.5rem)" }}
                >
                  {headline}
                </h1>
              </div>
              {scheduledAgents.length > 0 && (
                <button
                  onClick={onNavigateAgents}
                  className="hidden shrink-0 items-center gap-2 depth-card-sm px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-all hover:shadow-[var(--shadow-depth-card-hover)] hover:text-[var(--text-primary)] sm:inline-flex"
                >
                  Full plan
                  <i className="ri-arrow-right-s-line text-base leading-none" />
                </button>
              )}
            </div>
          </header>

          {/* ── Live pulse strip — asymmetric, not a grid ─────── */}
          <div
            className="mt-10 stagger-in"
            style={{ "--stagger-delay": "60ms" } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <PulseCounter
                n={liveSessions.length}
                label="live"
                tone="live"
                onClick={firstLive ? () => onViewSession(firstLive.id) : onNavigateSessions}
              />
              <PulseCounter
                n={completedToday.length}
                label="done today"
                tone="done"
                onClick={firstDone ? () => onViewSession(firstDone.id) : onNavigateSessions}
              />
              <PulseCounter
                n={scheduledAgents.length}
                label="scheduled"
                tone="muted"
                onClick={firstScheduled ? () => onRunAgent(firstScheduled.id) : onNavigateAgents}
              />
              <span className="flex-1" />
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {activeAgents.length} agent{activeAgents.length === 1 ? "" : "s"} active
              </span>
            </div>
          </div>

          {/* ── Prompt bar ────────────────────────────────────── */}
          <div
            className="mt-8 stagger-in"
            style={{ "--stagger-delay": "120ms" } as React.CSSProperties}
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
              <PromptTool label="Tools" icon="ri-tools-line" />
                </div>
                <button
                  onClick={() => startBuilder(input)}
                  disabled={!input.trim()}
                  aria-label="Design agent"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full btn-accent disabled:cursor-not-allowed disabled:opacity-20 disabled:shadow-none"
                >
                  <i className="ri-arrow-up-line text-base leading-none" />
                </button>
              </div>
            </div>

            {/* Quick actions — inline, not chips */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <QuickAction label="New agent" onClick={onCreateAgent} />
              <QuickAction label="Review sessions" onClick={onNavigateSessions} />
              {firstScheduled && (
                <QuickAction label={`Run ${firstScheduled.name}`} onClick={() => onRunAgent(firstScheduled.id)} />
              )}
            </div>
          </div>

          {/* ── Feed — proactive surface ──────────────────────── */}
          <section
            className="mt-14 stagger-in"
            style={{ "--stagger-delay": "200ms" } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-[14px] font-medium text-[var(--text-primary)]">
                Feed
              </h2>
              <button
                onClick={onNavigateSessions}
                className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                All sessions →
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {/* Needs attention — most urgent first */}
              {needsAttention.slice(0, 2).map((s) => (
                <FeedItem
                  key={s.id}
                  tone="alert"
                  flag="Needs input"
                  title={s.agentName ?? "Session"}
                  body={s.resultSummary ?? "Waiting for your decision."}
                  time={s.startedAt ? relTime(s.startedAt) : undefined}
                  action={{ label: "Review", onClick: () => onViewSession(s.id) }}
                />
              ))}

              {/* Live sessions */}
              {liveSessions
                .filter((s) => !needsAttention.includes(s))
                .slice(0, 2)
                .map((s) => (
                  <FeedItem
                    key={s.id}
                    tone="live"
                    flag="Running"
                    title={s.agentName ?? "Session"}
                    body={s.resultSummary ?? "In progress…"}
                    time={s.startedAt ? relTime(s.startedAt) : undefined}
                    action={{ label: "View", onClick: () => onViewSession(s.id) }}
                  />
                ))}

              {/* Next scheduled */}
              {firstScheduled && (
                <FeedItem
                  tone="upcoming"
                  flag="Upcoming"
                  title={firstScheduled.name}
                  body={firstScheduled.description || "Scheduled automation."}
                  time={readableSchedule(firstScheduled.triggerConfig)}
                  action={{ label: "Run now", onClick: () => onRunAgent(firstScheduled.id) }}
                />
              )}

              {/* Completed today — last 2 */}
              {completedToday.slice(0, 2).map((s) => (
                <FeedItem
                  key={s.id}
                  tone="done"
                  flag="Done"
                  title={s.agentName ?? "Session"}
                  body={s.resultSummary ?? "Completed."}
                  time={s.finishedAt ? relTime(s.finishedAt) : undefined}
                  action={{ label: "View", onClick: () => onViewSession(s.id) }}
                />
              ))}

              {needsAttention.length === 0 && liveSessions.length === 0 && !firstScheduled && completedToday.length === 0 && (
                <div className="depth-well px-6 py-10 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Nothing yet today.
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    Triggered runs and schedules will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Right rail — schedule + stats ─────────────────────── */}
      <aside className="hidden w-[300px] shrink-0 overflow-y-auto scrollbar-thin border-l border-[var(--glass-border)] xl:block">
        <div className="px-6 py-10">
          {/* Schedule */}
          <div
            className="stagger-in"
            style={{ "--stagger-delay": "100ms" } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-[14px] font-medium text-[var(--text-primary)]">
                Schedule
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-0">
              {scheduledAgents.slice(0, 5).map((agent, i) => (
                <ScheduleRow
                  key={agent.id}
                  index={i}
                  time={readableSchedule(agent.triggerConfig) ?? "Scheduled"}
                  name={agent.name}
                  desc={agent.description || "Managed agent"}
                  onRun={() => onRunAgent(agent.id)}
                />
              ))}
              {scheduledAgents.length === 0 && (
                <p className="py-4 text-[12px] text-[var(--text-muted)]">
                  No scheduled runs. Add a cron trigger to an agent.
                </p>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div
            className="mt-10 stagger-in"
            style={{ "--stagger-delay": "180ms" } as React.CSSProperties}
          >
            <h3 className="font-display text-[14px] font-medium text-[var(--text-primary)]">
              Stats
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
              <StatCell label="Active agents" value={activeAgents.length} />
              <StatCell label="Done today" value={completedToday.length} />
              <StatCell label="Total sessions" value={sessions.length} />
              <StatCell label="Scheduled" value={scheduledAgents.length} />
            </dl>
          </div>

          {/* Health */}
          {activeAgents.length > 0 && (
            <div
              className="mt-10 stagger-in"
              style={{ "--stagger-delay": "260ms" } as React.CSSProperties}
            >
              <div className="depth-card-sm p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--tint-lime)" }}>
                  <i className="ri-check-line text-base leading-none text-[var(--text-primary)]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">All systems nominal</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    {activeAgents.length} agent{activeAgents.length === 1 ? "" : "s"} ready ·{" "}
                    {completedToday.length} completed today
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components — each earns its place
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Pulse counter — compact inline metric with colored dot ───────── */

function PulseCounter({
  n,
  label,
  tone,
  onClick,
}: {
  n: number;
  label: string;
  tone: "live" | "done" | "muted";
  onClick: () => void;
}) {
  const dotCls =
    tone === "live"
      ? "bg-[var(--color-pop)] status-pulse"
      : tone === "done"
        ? "bg-[var(--color-success)]"
        : "bg-[var(--text-muted)] opacity-50";

  return (
    <button
      onClick={onClick}
      className="depth-card-sm inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] tabular-nums text-[var(--text-secondary)] transition-all hover:shadow-[var(--shadow-depth-card-hover)] hover:text-[var(--text-primary)]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
      <span className="font-medium text-[var(--text-primary)]">{n}</span>
      <span>{label}</span>
    </button>
  );
}

/* ── Prompt bar tool button ───────────────────────────────────────── */

function PromptTool({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
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

/* ── Quick action — text link style, not pill ─────────────────────── */

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all hover:text-[var(--text-primary)]" style={{ background: "var(--tint-warm)" }}
    >
      {label}
    </button>
  );
}

/* ── Feed item — the core proactive unit ──────────────────────────── */

const TONE_STYLES = {
  alert: {
    dot: "bg-[var(--color-danger)]",
    flag: "text-[var(--color-danger-text)]",
    flagBg: "bg-[var(--color-danger-muted)]",
  },
  live: {
    dot: "bg-[var(--color-pop)] status-pulse",
    flag: "text-[var(--color-accent)]",
    flagBg: "bg-[var(--color-accent-subtle)]",
  },
  upcoming: {
    dot: "bg-[var(--text-secondary)] opacity-60",
    flag: "text-[var(--text-secondary)]",
    flagBg: "bg-[var(--glass-bg-strong)]",
  },
  done: {
    dot: "bg-[var(--color-success)]",
    flag: "text-[var(--color-success-text)]",
    flagBg: "bg-[var(--color-success-muted)]",
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
    <div className="group flex gap-3.5 depth-card-sm p-4 mb-2 transition-all hover:shadow-[var(--shadow-depth-card-hover)]">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {tone === "live" && <span className="absolute inset-0 rounded-full bg-[var(--color-pop)] animate-ping opacity-30" />}
          <span className={`relative h-2.5 w-2.5 rounded-full ${s.dot}`} />
        </span>
        <span className="mt-2 w-px flex-1 bg-[var(--glass-border)]" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${s.flag}`} style={{ background: tintBg }}>
            {flag}
          </span>
          {time && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {time}
            </span>
          )}
        </div>
        <p className="mt-2 text-[14px] font-medium text-[var(--text-primary)]">
          {title}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
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

/* ── Schedule row — right rail timeline ───────────────────────────── */

const SCHED_ACCENTS = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-pop)",
  "var(--text-secondary)",
  "var(--color-accent)",
];

function ScheduleRow({
  index,
  time,
  name,
  desc,
  onRun,
}: {
  index: number;
  time: string;
  name: string;
  desc: string;
  onRun: () => void;
}) {
  const accent = SCHED_ACCENTS[index % SCHED_ACCENTS.length];

  return (
    <div className="group flex items-start gap-3 border-b border-[var(--glass-border)] py-3.5 last:border-none">
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {time}
        </p>
        <p className="mt-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
          {name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{desc}</p>
      </div>
      <button
        onClick={onRun}
        className="shrink-0 rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] opacity-0 transition-all hover:border-[var(--glass-border-strong)] hover:text-[var(--text-primary)] group-hover:opacity-100"
      >
        Run
      </button>
    </div>
  );
}

/* ── Stat cell — small label / big number ─────────────────────────── */

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-display text-[22px] font-medium tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
        {value}
      </dd>
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
