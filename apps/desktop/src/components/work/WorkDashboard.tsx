import React, { useMemo, useRef, useState } from "react";
import type { ManagedAgent, SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ═══════════════════════════════════════════════════════════════════════
   Work Dashboard — "I've got things moving."
   Greeting-led control surface inspired by conversational home screens,
   adapted for Khadim's managed-agent domain. Dark, typography-led,
   calm density. The chrome recedes; the work comes forward.
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
}: WorkDashboardProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
  }, []);

  const headline = liveSessions.length > 0
    ? "I've got things moving."
    : activeAgents.length > 0
      ? "Everything's ready."
      : "Let's build something.";

  const statLine = [
    liveSessions.length > 0 && `${liveSessions.length} live`,
    completedToday.length > 0 && `${completedToday.length} done today`,
    scheduledAgents.length > 0 && `${scheduledAgents.length} scheduled`,
  ].filter(Boolean).join(" · ") || "No runs yet today";

  /* ── First-run: unchanged empty state ───────────────────────────── */
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {dateLabel}
          </p>
          <h1 className="mt-6 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]">
            {greeting}<br />
            <span className="text-[var(--text-secondary)]">Let's build your first agent.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--text-secondary)]">
            An agent is a persistent automation — give it instructions, pick its tools,
            and let it work on a schedule or whenever you trigger it.
          </p>
          <button
            onClick={onCreateAgent}
            className="btn-accent mt-8 h-10 rounded-full px-5 text-[13px] font-semibold"
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

          {/* ── Header: date + greeting ───────────────────────── */}
          <header
            className="flex items-start justify-between gap-6 stagger-in"
            style={{ ["--stagger-delay" as string]: "0ms" }}
          >
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                {dateLabel}
              </p>
              <p className="mt-5 text-[15px] text-[var(--text-secondary)]">{greeting}</p>
              <h1 className="mt-1 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]">
                {headline}
              </h1>
              <p className="mt-3 text-[13px] text-[var(--text-muted)]">{statLine}</p>
            </div>

            {scheduledAgents.length > 0 && (
              <button
                onClick={onNavigateAgents}
                className="hidden shrink-0 items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-card)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--glass-border-strong)] hover:text-[var(--text-primary)] sm:inline-flex"
              >
                See full plan
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </header>

          {/* ── Status chip row ───────────────────────────────── */}
          <div
            className="mt-8 grid grid-cols-1 gap-2 stagger-in sm:grid-cols-3"
            style={{ ["--stagger-delay" as string]: "80ms" }}
          >
            <StatusTile
              label="In progress"
              tone="live"
              title={firstLive?.agentName ?? "No live runs"}
              meta={firstLive
                ? firstLive.resultSummary ?? "Running…"
                : "Trigger an agent to start."}
              subMeta={firstLive?.startedAt ? `Started ${relTime(firstLive.startedAt)}` : undefined}
              count={liveSessions.length}
              onClick={firstLive ? () => onViewSession(firstLive.id) : onNavigateSessions}
              clickable={Boolean(firstLive) || liveSessions.length > 0}
            />
            <StatusTile
              label="Done"
              tone="done"
              title={firstDone?.agentName ?? "Nothing yet today"}
              meta={firstDone
                ? firstDone.resultSummary ?? "Completed successfully"
                : "Completed sessions will land here."}
              subMeta={firstDone?.finishedAt ? `${relTime(firstDone.finishedAt)}` : undefined}
              count={completedToday.length}
              onClick={firstDone ? () => onViewSession(firstDone.id) : onNavigateSessions}
              clickable={completedToday.length > 0}
            />
            <StatusTile
              label="Upcoming"
              tone="upcoming"
              title={firstScheduled?.name ?? "No schedule set"}
              meta={firstScheduled
                ? firstScheduled.description || "Scheduled run"
                : "Give an agent a schedule trigger."}
              subMeta={firstScheduled ? readableSchedule(firstScheduled.triggerConfig) : undefined}
              count={scheduledAgents.length}
              onClick={firstScheduled ? () => onRunAgent(firstScheduled.id) : onNavigateAgents}
              clickable={scheduledAgents.length > 0}
            />
          </div>

          {/* ── Ad-hoc prompt ─────────────────────────────────── */}
          <div
            className="mt-8 stagger-in"
            style={{ ["--stagger-delay" as string]: "160ms" }}
          >
            <div className="group relative rounded-[22px] border border-[var(--glass-border)] bg-[var(--surface-card)] transition-colors duration-[var(--duration-base)] focus-within:border-[var(--color-accent-muted)] focus-within:shadow-[0_0_0_4px_var(--color-accent-subtle)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    onCreateAgent();
                  }
                }}
                placeholder="Ask Khadim. Or describe what you want automated."
                rows={1}
                className="block w-full resize-none bg-transparent px-6 pt-5 pb-3 text-[15px] leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                style={{ minHeight: "3.25rem", maxHeight: "40vh" }}
              />
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex items-center gap-1">
                  <InputPillButton ariaLabel="Attach context">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-6M9 15h6" />
                    </svg>
                  </InputPillButton>
                  <InputPillButton ariaLabel="Use the web">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
                    </svg>
                  </InputPillButton>
                  <InputPillButton ariaLabel="Choose tools" wide>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                    </svg>
                    <span className="text-[12px] font-medium">Tools</span>
                  </InputPillButton>
                </div>
                <button
                  onClick={onCreateAgent}
                  disabled={!input.trim()}
                  aria-label="Start an agent from this prompt"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full btn-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Action chips */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <ActionChip
                label="New agent"
                onClick={onCreateAgent}
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />}
              />
              <ActionChip
                label="Review sessions"
                onClick={onNavigateSessions}
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />}
              />
              <ActionChip
                label="Run agent"
                onClick={firstScheduled ? () => onRunAgent(firstScheduled.id) : onNavigateAgents}
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />}
              />
              <ActionChip
                label="Automate"
                onClick={onCreateAgent}
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />}
              />
            </div>
          </div>

          {/* ── "Your day, handled" — proactive stream ─────────── */}
          <section
            className="mt-14 stagger-in"
            style={{ ["--stagger-delay" as string]: "240ms" }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-[15px] font-medium text-[var(--text-primary)]">
                  Your day, handled
                </h2>
                <span className="rounded-full bg-[var(--glass-bg)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Proactive
                </span>
                <p className="hidden text-[12px] text-[var(--text-muted)] md:inline">
                  I'll keep working and surface what needs you.
                </p>
              </div>
              <button
                onClick={onNavigateSessions}
                className="text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                View timeline
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {needsAttention.slice(0, 1).map((s) => (
                <ProactiveCard
                  key={s.id}
                  flag="Needs your input"
                  flagTone="alert"
                  title={`Review: ${s.agentName ?? "session"}`}
                  body={s.resultSummary ?? "Waiting for a decision to continue."}
                  timestamp={s.startedAt ? `Since ${relTime(s.startedAt)}` : undefined}
                  primary={{ label: "Review", onClick: () => onViewSession(s.id) }}
                  secondary={{ label: "Not now" }}
                />
              ))}

              {liveSessions.filter((s) => !needsAttention.includes(s)).slice(0, 1).map((s) => (
                <ProactiveCard
                  key={s.id}
                  flag="Running in background"
                  flagTone="live"
                  title={s.agentName ?? "Session"}
                  body={s.resultSummary ?? "Step in progress…"}
                  timestamp={s.startedAt ? `Started ${relTime(s.startedAt)}` : undefined}
                  progress={0.42}
                  primary={{ label: "View progress", onClick: () => onViewSession(s.id) }}
                />
              ))}

              {firstScheduled && (
                <ProactiveCard
                  flag="Coming up"
                  flagTone="upcoming"
                  title={firstScheduled.name}
                  body={firstScheduled.description || "Scheduled automation ready to fire."}
                  timestamp={readableSchedule(firstScheduled.triggerConfig) ?? "Scheduled"}
                  primary={{ label: "Run now", onClick: () => onRunAgent(firstScheduled.id) }}
                  secondary={{ label: "Edit", onClick: onNavigateAgents }}
                />
              )}

              {needsAttention.length === 0 && liveSessions.length === 0 && !firstScheduled && (
                <div className="rounded-[18px] border border-dashed border-[var(--glass-border)] px-6 py-8 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Nothing needs you right now.
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    Triggered runs and schedule fires will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Right rail — today's plan + quick wins ───────────── */}
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto scrollbar-thin border-l border-[var(--glass-border)] px-6 py-10 xl:block">
        <div
          className="stagger-in"
          style={{ ["--stagger-delay" as string]: "120ms" }}
        >
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-medium text-[var(--text-primary)]">
              Today's schedule
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {scheduledAgents.slice(0, 4).map((agent, i) => (
              <AgendaRow
                key={agent.id}
                dot={AGENDA_DOT_COLORS[i % AGENDA_DOT_COLORS.length]}
                time={readableSchedule(agent.triggerConfig) ?? "Scheduled"}
                title={agent.name}
                meta={agent.description || "Managed automation"}
                onRun={() => onRunAgent(agent.id)}
              />
            ))}
            {scheduledAgents.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">
                No scheduled runs. Give an agent a cron trigger to plan your day.
              </p>
            )}
          </div>
        </div>

        <div
          className="mt-10 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-4 stagger-in"
          style={{ ["--stagger-delay" as string]: "200ms" }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success-muted)] text-[var(--color-success-text)]">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Runs on track</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {activeAgents.length} active agent{activeAgents.length === 1 ? "" : "s"} · {" "}
            {completedToday.length} completed today
          </p>
        </div>

        <div
          className="mt-8 stagger-in"
          style={{ ["--stagger-delay" as string]: "280ms" }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Quick wins</p>
            <span className="text-[11px] text-[var(--text-muted)]">Handled for you</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            <QuickWin text={`${sessions.length} total sessions logged`} />
            <QuickWin text={`${agents.length} managed agent${agents.length === 1 ? "" : "s"} configured`} />
            {completedToday.length > 0 && (
              <QuickWin text={`${completedToday.length} completion${completedToday.length === 1 ? "" : "s"} since midnight`} />
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/* ─── Status tile ──────────────────────────────────────────────────── */

function StatusTile({
  label,
  tone,
  title,
  meta,
  subMeta,
  count,
  onClick,
  clickable,
}: {
  label: string;
  tone: "live" | "done" | "upcoming";
  title: string;
  meta: string;
  subMeta?: string;
  count: number;
  onClick: () => void;
  clickable: boolean;
}) {
  const toneCls =
    tone === "live"
      ? "text-[var(--color-pop)]"
      : tone === "done"
        ? "text-[var(--color-success-text)]"
        : "text-[var(--text-secondary)]";
  const dotCls =
    tone === "live"
      ? "bg-[var(--color-pop)] status-pulse"
      : tone === "done"
        ? "bg-[var(--color-success)]"
        : "bg-[var(--text-secondary)] opacity-60";

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`group relative flex flex-col items-start gap-2 rounded-[18px] border border-[var(--glass-border)] bg-[var(--surface-card)] px-5 py-4 text-left transition-colors ${
        clickable ? "hover:border-[var(--glass-border-strong)] hover:bg-[var(--surface-card-hover)]" : "opacity-85"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className={`inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] ${toneCls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
          {label}
        </span>
        {count > 1 && (
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">×{count}</span>
        )}
      </div>
      <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="line-clamp-2 text-[12px] leading-snug text-[var(--text-secondary)]">{meta}</p>
      {subMeta && (
        <p className="mt-auto text-[11px] tabular-nums text-[var(--text-muted)]">{subMeta}</p>
      )}
      {clickable && (
        <svg
          className="absolute right-4 top-4 h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 transition-all duration-[var(--duration-base)] group-hover:translate-x-0.5 group-hover:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

/* ─── Input pill button ────────────────────────────────────────────── */

function InputPillButton({
  children,
  ariaLabel,
  wide,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] ${
        wide ? "h-8" : "h-8 w-8 justify-center px-0"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Action chip ──────────────────────────────────────────────────── */

function ActionChip({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-card)] px-4 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--glass-border-strong)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text-primary)]"
    >
      <svg className="h-3.5 w-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        {icon}
      </svg>
      {label}
    </button>
  );
}

/* ─── Proactive card ───────────────────────────────────────────────── */

function ProactiveCard({
  flag,
  flagTone,
  title,
  body,
  timestamp,
  progress,
  primary,
  secondary,
}: {
  flag: string;
  flagTone: "alert" | "live" | "upcoming";
  title: string;
  body: string;
  timestamp?: string;
  progress?: number;
  primary?: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void };
}) {
  const flagCls =
    flagTone === "alert"
      ? "bg-[var(--color-danger-muted)] text-[var(--color-danger-text)]"
      : flagTone === "live"
        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
        : "bg-[var(--glass-bg-strong)] text-[var(--text-secondary)]";

  return (
    <article className="rounded-[18px] border border-[var(--glass-border)] bg-[var(--surface-card)] px-6 py-5 transition-colors hover:border-[var(--glass-border-strong)]">
      <div className="flex items-start justify-between gap-4">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${flagCls}`}>
          {flag}
        </span>
        {timestamp && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {timestamp}
          </span>
        )}
      </div>
      <h4 className="mt-3 font-display text-[16px] font-medium leading-snug text-[var(--text-primary)]">
        {title}
      </h4>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{body}</p>

      {progress !== undefined && (
        <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[var(--glass-bg)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-700"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {(primary || secondary) && (
        <div className="mt-4 flex items-center gap-2">
          {primary && (
            <button
              onClick={primary.onClick}
              className="inline-flex h-8 items-center rounded-full btn-accent px-4 text-[12px] font-semibold"
            >
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="inline-flex h-8 items-center rounded-full px-4 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/* ─── Agenda row (right rail) ──────────────────────────────────────── */

const AGENDA_DOT_COLORS = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-pop)",
  "var(--text-secondary)",
];

function AgendaRow({
  dot,
  time,
  title,
  meta,
  onRun,
}: {
  dot: string;
  time: string;
  title: string;
  meta: string;
  onRun: () => void;
}) {
  return (
    <div className="group flex items-start gap-3">
      <div className="relative mt-1.5 flex h-full flex-col items-center">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {time}
        </p>
        <p className="mt-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
          {title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{meta}</p>
      </div>
      <button
        onClick={onRun}
        className="shrink-0 rounded-full border border-[var(--glass-border)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)] opacity-0 transition-all hover:border-[var(--glass-border-strong)] hover:text-[var(--text-primary)] group-hover:opacity-100"
      >
        Run
      </button>
    </div>
  );
}

/* ─── Quick win bullet ─────────────────────────────────────────────── */

function QuickWin({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-snug text-[var(--text-secondary)]">
      <svg className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success-text)]" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span>{text}</span>
    </li>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

/** Best-effort humanisation of a schedule triggerConfig (JSON). */
function readableSchedule(cfg?: string | null): string | undefined {
  if (!cfg) return undefined;
  try {
    const parsed = JSON.parse(cfg) as { cron?: string; time?: string; interval?: string };
    if (parsed.time) return parsed.time;
    if (parsed.interval) return `Every ${parsed.interval}`;
    if (parsed.cron) return parsed.cron;
  } catch {
    // Not JSON — fall through and return the raw string truncated.
    return cfg.length > 20 ? cfg.slice(0, 20) + "…" : cfg;
  }
  return undefined;
}
