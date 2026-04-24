import React, { startTransition, useState, useRef, useEffect, useMemo } from "react";
import type { ChatMessage as StoredMessage, RunEventRecord, ThinkingStepData } from "../../lib/bindings";
import type { SessionRecord, SessionTurn } from "../../lib/types";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { relTime } from "../../lib/ui";
import { SessionLogView } from "./SessionLogView";


function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function toolTitle(toolName: string | null) {
  if (!toolName) return "Tool call";
  if (toolName === "bash") return "Running command";
  return toolName.replace(/_/g, " ");
}

function turnToMessage(turn: SessionTurn): StoredMessage & { thinkingSteps?: ThinkingStepData[] } {
  if (turn.role === "tool") {
    return {
      id: turn.id,
      conversation_id: turn.id,
      role: "assistant",
      content: "",
      metadata: null,
      created_at: turn.createdAt,
      thinkingSteps: [{
        id: `tool-${turn.id}`,
        title: toolTitle(turn.toolName),
        tool: turn.toolName ?? "tool",
        status: "complete",
        content: turn.content ?? undefined,
        result: turn.content ?? undefined,
      }],
    };
  }

  return {
    id: turn.id,
    conversation_id: turn.id,
    role: turn.role === "user" ? "user" : "assistant",
    content: turn.content ?? "",
    metadata: null,
    created_at: turn.createdAt,
  };
}

/* ─── Inline approval ─────────────────────────────────────────────── */

function InlineApproval({
  message,
  onApprove,
  onDeny,
}: {
  message: string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] px-4 py-3 my-4">
      <p className="text-sm text-[var(--text-primary)]">{message}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onApprove}
          className="h-7 rounded-full bg-[var(--color-success-muted)] px-4 text-xs font-medium text-[var(--color-success-text)] transition-colors hover:bg-[var(--color-success)] hover:text-[var(--text-inverse)]"
        >
          Allow
        </button>
        <button
          onClick={onDeny}
          className="h-7 rounded-full bg-[var(--color-danger-muted)] px-4 text-xs font-medium text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger)] hover:text-[var(--text-inverse)]"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

/* ─── Session Mode Switcher ────────────────────────────────────────── */
/* Segmented pill in the session header. Chat = transcript for humans.   */
/* Log = structured run_events for operators. Same session, different    */
/* lens. The inset rail creates a physical "track" feel; the active pill */
/* sits on top as a raised depth-card-sm.                                */

type SessionViewMode = "chat" | "log";

function SessionModeSwitcher({
  mode,
  onChange,
}: {
  mode: SessionViewMode;
  onChange: (mode: SessionViewMode) => void;
}) {
  const options: { id: SessionViewMode; label: string; icon: string }[] = [
    { id: "chat", label: "Chat", icon: "ri-chat-3-line" },
    { id: "log",  label: "Log",  icon: "ri-align-justify" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Session view mode"
      className="depth-inset inline-flex items-center gap-0.5 rounded-full p-[3px]"
    >
      {options.map((opt) => {
        const active = mode === opt.id;
        return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                startTransition(() => onChange(opt.id));
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                active
                  ? "depth-card-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <i className={`${opt.icon} text-[13px] leading-none`} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Session Detail ───────────────────────────────────────────────── */

interface SessionDetailProps {
  session: SessionRecord;
  turns: SessionTurn[];
  /** Persisted run_events — the structured audit stream for Log mode. */
  events?: RunEventRecord[];
  pendingApproval?: { message: string } | null;
  liveStreamingContent?: string;
  liveStreamingSteps?: ThinkingStepData[];
  liveError?: string | null;
  /** Working directory of the session's environment. Enables the Files button when present. */
  envWorkingDir?: string | null;
  onBack: () => void;
  onAbort: () => void;
  onRetry: () => void;
  onSendMessage: (content: string) => void;
  onRetryFromTurn?: (turnNumber: number) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  /** Invoked when the user clicks the Files button. */
  onOpenFiles?: () => void;
  /** Optional right-side panel (artifacts / approvals / source). */
  rightPanel?: React.ReactNode;
}

export function SessionDetail({
  session,
  turns,
  events = [],
  pendingApproval,
  liveStreamingContent = "",
  liveStreamingSteps = [],
  liveError = null,
  envWorkingDir = null,
  onBack,
  onAbort,
  onRetry,
  onSendMessage,
  onRetryFromTurn,
  onApprove,
  onDeny,
  onOpenFiles,
  rightPanel,
}: SessionDetailProps) {
  const [input, setInput] = useState("");
  const [viewMode, setViewMode] = useState<SessionViewMode>("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const displayMessages = useMemo(
    () => turns.map(turnToMessage),
    [turns],
  );

  const isLive = session.status === "running" || session.status === "pending";
  const hasPersistedAgentTurn = turns.some((turn) => turn.role === "agent");
  const hasLiveStreamingMessage = isLive && !hasPersistedAgentTurn && (liveStreamingContent.trim().length > 0 || liveStreamingSteps.length > 0);
  const liveMessage: (StoredMessage & { thinkingSteps?: ThinkingStepData[] }) | null = hasLiveStreamingMessage
    ? {
        id: `live-${session.id}`,
        conversation_id: session.id,
        role: "assistant",
        content: liveStreamingContent,
        metadata: null,
        created_at: new Date().toISOString(),
        thinkingSteps: liveStreamingSteps,
      }
    : null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, liveStreamingContent, liveStreamingSteps.length, pendingApproval]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-6 py-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        >
          <i className="ri-arrow-left-s-line text-base leading-none" />
        </button>

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {session.agentName ?? "Session"}
          </span>
        </div>

        <SessionModeSwitcher mode={viewMode} onChange={setViewMode} />

        {isLive && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-pop)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current status-pulse" />
            Live
          </span>
        )}

        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          {session.durationMs != null && <span>{fmtDuration(session.durationMs)}</span>}
          {session.tokenUsage && (
            <span className="tabular-nums">
              {Math.round((session.tokenUsage.inputTokens + session.tokenUsage.outputTokens) / 1000)}k tokens
            </span>
          )}
        </div>

        {onOpenFiles && (
          <button
            onClick={onOpenFiles}
            disabled={!envWorkingDir}
            title={envWorkingDir ?? "Set a working directory on this session's environment to browse files"}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors enabled:hover:bg-[var(--glass-bg)] enabled:hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <i className="ri-folder-open-line text-sm leading-none" />
            Files
          </button>
        )}

        {isLive && (
          <button
            onClick={onAbort}
            className="text-xs font-medium text-[var(--color-danger-text)] transition-colors hover:text-[var(--color-danger)]"
          >
            Stop
          </button>
        )}
        {(session.status === "failed" || session.status === "aborted") && (
          <button
            onClick={onRetry}
            className="text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Retry
          </button>
        )}
      </div>

      {/* ── Body: Chat or Log + optional insights panel ───── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {viewMode === "log" ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <SessionLogView events={events} isLive={isLive} />
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-2xl px-6 py-6">
          {displayMessages.length === 0 && !liveMessage && (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              {isLive ? "Waiting for the first update…" : "Empty session."}
            </p>
          )}

          <div className="space-y-6">
            {displayMessages.map((message, index) => {
              const turn = turns[index];
              const isFailed = session.status === "failed" || session.status === "aborted";
              const canRetry = isFailed && onRetryFromTurn != null && turn?.role === "tool";

              return (
                <div key={message.id}>
                  <ChatMessage message={message} backend="khadim" />
                  {(turn?.tokenInput != null || turn?.durationMs != null || canRetry) && (
                    <div className="pl-8 pt-1.5 md:pl-9">
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        {turn.tokenInput != null && (
                          <span className="tabular-nums">{(turn.tokenInput / 1000).toFixed(1)}k in</span>
                        )}
                        {turn.tokenOutput != null && (
                          <span className="tabular-nums">{turn.tokenOutput} out</span>
                        )}
                        {turn.durationMs != null && (
                          <span>{fmtDuration(turn.durationMs)}</span>
                        )}
                        {canRetry && (
                          <button
                            onClick={() => onRetryFromTurn!(turn.turnNumber)}
                            className="transition-colors hover:text-[var(--text-primary)]"
                          >
                            Retry from here
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {liveMessage && (
              <div key={liveMessage.id}>
                <ChatMessage message={liveMessage} backend="khadim" />
              </div>
            )}
          </div>

          {pendingApproval && onApprove && onDeny && (
            <InlineApproval
              message={pendingApproval.message}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          )}

          {isLive && !pendingApproval && (!liveMessage || liveStreamingSteps.some((step) => step.status === "running")) && (
            <TypingIndicator backend="khadim" />
          )}

          {(session.status === "failed" || liveError) && (session.errorMessage || liveError) && (
            <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--color-danger-text)]">Error</p>
              <p className="mt-1 text-sm text-[var(--color-danger-text)]">
                {session.errorMessage ?? liveError}
              </p>
            </div>
          )}
        </div>
      </div>
      )}

      {rightPanel && (
        <aside className="hidden w-80 shrink-0 border-l border-[var(--glass-border)] overflow-y-auto scrollbar-thin lg:block">
          {rightPanel}
        </aside>
      )}
      </div>

      {/* ── Input ──────────────────────────────────────────── */}
      {isLive && viewMode === "chat" && (
        <div className="shrink-0 border-t border-[var(--glass-border)] px-6 py-3">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the agent…"
              rows={1}
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[36px] max-h-[120px] flex-1 resize-none rounded-[var(--radius-sm)] px-3 py-2 text-sm leading-relaxed outline-none"
              style={{ height: input.includes("\n") ? "auto" : "36px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors enabled:hover:bg-[var(--glass-bg)] enabled:hover:text-[var(--text-primary)] disabled:opacity-30"
            >
              <i className="ri-arrow-right-line text-base leading-none" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Run List (née Session List) ──────────────────────────────────── */
/* Sessions are now framed as "Runs" — a single unit of work that can be  */
/* live, queued, waiting on approval, or finished. One segmented control  */
/* spans the whole lifecycle; queued runs render as inset inbox cards.    */

type RunFilter = "all" | "live" | "queued" | "approval" | "done";

function triggerBadge(trigger: SessionRecord["trigger"]): { label: string; tint: string; icon: string } {
  switch (trigger) {
    case "scheduled": return { label: "Scheduled",  tint: "var(--tint-sky)",    icon: "ri-time-line" };
    case "event":     return { label: "Queue",      tint: "var(--tint-violet)", icon: "ri-inbox-line" };
    case "chat":      return { label: "Chat",       tint: "var(--tint-warm)",   icon: "ri-chat-3-line" };
    case "manual":
    default:          return { label: "Manual",     tint: "var(--tint-amber)",  icon: "ri-cursor-line" };
  }
}

function isQueuedRun(s: SessionRecord): boolean {
  return s.status === "pending" && s.trigger === "event";
}
function isLiveRun(s: SessionRecord): boolean {
  return s.status === "running" || (s.status === "pending" && s.trigger !== "event");
}
function isDoneRun(s: SessionRecord): boolean {
  return s.status === "completed" || s.status === "failed" || s.status === "aborted";
}

interface SessionListProps {
  sessions: SessionRecord[];
  onViewSession: (id: string) => void;
  /** Run IDs with at least one pending approval. Populated by the parent
   *  from approval queries; empty set is a valid default. */
  pendingApprovalRunIds?: ReadonlySet<string>;
}

export function SessionList({
  sessions,
  onViewSession,
  pendingApprovalRunIds,
}: SessionListProps) {
  const [filter, setFilter] = useState<RunFilter>("all");
  const needsApproval = pendingApprovalRunIds ?? (new Set() as ReadonlySet<string>);

  const counts = useMemo(() => {
    let live = 0, queued = 0, approval = 0;
    for (const s of sessions) {
      if (isLiveRun(s)) live++;
      if (isQueuedRun(s)) queued++;
      if (needsApproval.has(s.id)) approval++;
    }
    return { live, queued, approval };
  }, [sessions, needsApproval]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "live":     return sessions.filter(isLiveRun);
      case "queued":   return sessions.filter(isQueuedRun);
      case "approval": return sessions.filter((s) => needsApproval.has(s.id));
      case "done":     return sessions.filter(isDoneRun);
      default:         return sessions;
    }
  }, [sessions, filter, needsApproval]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });
  }, [filtered]);

  const filters: { id: RunFilter; label: string; count?: number; tone?: "pop" | "alert" }[] = [
    { id: "all",      label: "All" },
    { id: "live",     label: "Live",          count: counts.live     || undefined, tone: "pop" },
    { id: "queued",   label: "Queued",        count: counts.queued   || undefined },
    { id: "approval", label: "Needs approval",count: counts.approval || undefined, tone: "alert" },
    { id: "done",     label: "Done" },
  ];

  /* ── Empty ───────────────────────────────────────────────────── */
  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="max-w-lg px-12 py-16">
          <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)]">
            Runs
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Every execution lands here — live runs, queued triggers, anything
            waiting on your approval, and everything that's finished. One place
            for the whole lifecycle.
          </p>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  const emptyMessageFor = (f: RunFilter): string => {
    switch (f) {
      case "live":     return "Nothing running right now.";
      case "queued":   return "The queue is empty.";
      case "approval": return "No runs waiting on you.";
      case "done":     return "No finished runs yet.";
      default:         return "No runs.";
    }
  };

  /* Group the visible runs: queued separately, the rest on the main timeline. */
  const queuedVisible = sorted.filter(isQueuedRun);
  const timelineVisible = sorted.filter((s) => !isQueuedRun(s));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + filters */}
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between gap-6">
          <h1 className="font-display text-xl font-medium tracking-tight text-[var(--text-primary)]">
            Runs
          </h1>
          <div className="flex flex-wrap items-center gap-1">
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
                  <span
                    className={`tabular-nums ${
                      f.tone === "alert" ? "text-[var(--color-danger-text)]" :
                      f.tone === "pop"   ? "text-[var(--color-pop)]" :
                      "text-[var(--text-secondary)]"
                    }`}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-10">
        {sorted.length === 0 ? (
          <p className="py-12 text-sm text-[var(--text-muted)]">
            {emptyMessageFor(filter)}
          </p>
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            {/* Queued inbox — surfaces the queue as its own visually distinct
                strata. Only rendered on "all" and "queued" views. */}
            {queuedVisible.length > 0 && (filter === "all" || filter === "queued") && (
              <section className="flex flex-col gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Queued · {queuedVisible.length}
                </p>
                <ul className="flex flex-col gap-2">
                  {queuedVisible.map((s) => (
                    <li key={s.id}>
                      <QueuedRunCard
                        session={s}
                        needsApproval={needsApproval.has(s.id)}
                        onView={() => onViewSession(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Timeline — live + done + approval rows mix chronologically. */}
            {timelineVisible.length > 0 && (
              <div className="flex flex-col">
                {timelineVisible.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    needsApproval={needsApproval.has(session.id)}
                    onView={() => onViewSession(session.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Queued Run Card ──────────────────────────────────────────────── */
/* Queued runs are intentionally heavier than a timeline row — they're    */
/* waiting for attention, so they earn the inbox-card treatment.          */

function QueuedRunCard({
  session,
  needsApproval,
  onView,
}: {
  session: SessionRecord;
  needsApproval: boolean;
  onView: () => void;
}) {
  const trig = triggerBadge(session.trigger);
  return (
    <button
      type="button"
      onClick={onView}
      className="depth-inset group flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: trig.tint }}
      >
        <i className={`${trig.icon} text-[13px] leading-none text-[var(--text-primary)]`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {session.agentName ?? "Unnamed agent"}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {trig.label} · waiting
          {session.startedAt ? ` · ${relTime(session.startedAt)}` : ""}
        </p>
      </div>
      {needsApproval && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-danger-text)]"
          style={{ background: "var(--tint-rose)" }}
        >
          approval
        </span>
      )}
      <i className="ri-arrow-right-s-line shrink-0 text-base leading-none text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]" />
    </button>
  );
}

/* ─── Session Row ──────────────────────────────────────────────────── */

function SessionRow({
  session,
  needsApproval,
  onView,
}: {
  session: SessionRecord;
  needsApproval: boolean;
  onView: () => void;
}) {
  const dotCls =
    session.status === "running"   ? "bg-[var(--color-pop)]" :
    session.status === "completed" ? "bg-[var(--color-success)]" :
    session.status === "failed"    ? "bg-[var(--color-danger)]" :
    session.status === "aborted"   ? "bg-[var(--text-muted)]" :
    "bg-[var(--text-muted)] opacity-30";
  const trig = triggerBadge(session.trigger);

  return (
    <button
      onClick={onView}
      className="group -mx-2 flex items-center gap-4 rounded-[var(--radius-md)] px-2 py-3 text-left transition-all hover:bg-[var(--glass-bg)]/30"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {session.status === "running" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-pop)] opacity-30" />
        )}
        <span className={`relative h-2 w-2 rounded-full ${dotCls}`} />
      </span>

      <span className="w-36 shrink-0 truncate text-sm font-medium text-[var(--text-primary)]">
        {session.agentName ?? "Chat"}
      </span>

      <span
        className="hidden shrink-0 items-center gap-1 rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-primary)] sm:inline-flex"
        style={{ background: trig.tint }}
        title={`${trig.label} trigger`}
      >
        <i className={`${trig.icon} text-[10px] leading-none`} />
        {trig.label}
      </span>

      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
        {session.resultSummary ?? session.errorMessage ?? session.status}
      </span>

      {needsApproval && (
        <span
          className="shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-danger-text)]"
          style={{ background: "var(--tint-rose)" }}
        >
          approval
        </span>
      )}

      {session.status === "running" && (
        <span className="shrink-0 text-xs font-medium text-[var(--color-pop)] opacity-0 transition-opacity group-hover:opacity-100">
          Open
        </span>
      )}

      {session.durationMs != null && (
        <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-muted)] md:inline">
          {fmtDuration(session.durationMs)}
        </span>
      )}

      <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
        {session.startedAt ? relTime(session.startedAt) : ""}
      </span>
    </button>
  );
}
