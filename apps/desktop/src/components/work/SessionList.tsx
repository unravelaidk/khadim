import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ChatMessage as StoredMessage, ThinkingStepData } from "../../lib/bindings";
import type { SessionRecord, SessionTurn } from "../../lib/types";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { relTime } from "../../lib/ui";


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

/* ─── Session Detail ───────────────────────────────────────────────── */

interface SessionDetailProps {
  session: SessionRecord;
  turns: SessionTurn[];
  pendingApproval?: { message: string } | null;
  liveStreamingContent?: string;
  liveStreamingSteps?: ThinkingStepData[];
  liveError?: string | null;
  onBack: () => void;
  onAbort: () => void;
  onRetry: () => void;
  onSendMessage: (content: string) => void;
  onRetryFromTurn?: (turnNumber: number) => void;
  onApprove?: () => void;
  onDeny?: () => void;
}

export function SessionDetail({
  session,
  turns,
  pendingApproval,
  liveStreamingContent = "",
  liveStreamingSteps = [],
  liveError = null,
  onBack,
  onAbort,
  onRetry,
  onSendMessage,
  onRetryFromTurn,
  onApprove,
  onDeny,
}: SessionDetailProps) {
  const [input, setInput] = useState("");
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
          <i className="ri-arrow-left-s-line text-[16px] leading-none" />
        </button>

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {session.agentName ?? "Session"}
          </span>
        </div>

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

      {/* ── Transcript ─────────────────────────────────────── */}
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

      {/* ── Input ──────────────────────────────────────────── */}
      {isLive && (
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
              <i className="ri-arrow-right-line text-[16px] leading-none" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Session List ─────────────────────────────────────────────────── */

type FilterStatus = "all" | "running" | "completed" | "failed";

interface SessionListProps {
  sessions: SessionRecord[];
  onViewSession: (id: string) => void;
}

export function SessionList({ sessions, onViewSession }: SessionListProps) {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filtered = filter === "all"
    ? sessions
    : sessions.filter((s) => s.status === filter);

  const sorted = [...filtered].sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return tb - ta;
  });

  const liveCount = sessions.filter((s) => s.status === "running").length;

  const filters: { id: FilterStatus; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "running", label: "Live", count: liveCount || undefined },
    { id: "completed", label: "Done" },
    { id: "failed", label: "Failed" },
  ];

  /* ── Empty ───────────────────────────────────────────────────── */
  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Sessions
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            When an agent runs — manually, on schedule, or from a trigger —
            the full transcript appears here. Every tool call, every decision.
          </p>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + filters */}
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Sessions
          </h1>
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
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-10">
        {sorted.length === 0 ? (
          <p className="py-12 text-sm text-[var(--text-muted)]">
            No {filter} sessions.
          </p>
        ) : (
          <div className="flex flex-col pb-8">
            {sorted.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onView={() => onViewSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Session Row ──────────────────────────────────────────────────── */

function SessionRow({
  session,
  onView,
}: {
  session: SessionRecord;
  onView: () => void;
}) {
  const dotCls =
    session.status === "running"   ? "bg-[var(--color-pop)]" :
    session.status === "completed" ? "bg-[var(--color-success)]" :
    session.status === "failed"    ? "bg-[var(--color-danger)]" :
    "bg-[var(--text-muted)] opacity-30";

  const tint =
    session.status === "running"   ? "var(--tint-amber)" :
    session.status === "completed" ? "var(--tint-lime)" :
    session.status === "failed"    ? "var(--tint-rose)" :
    "var(--tint-warm)";

  return (
    <button
      onClick={onView}
      className="group flex items-center gap-4 py-3 text-left transition-all -mx-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--glass-bg)]/30"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {session.status === "running" && <span className="absolute inset-0 rounded-full bg-[var(--color-pop)] animate-ping opacity-30" />}
        <span className={`relative h-2 w-2 rounded-full ${dotCls}`} />
      </span>

      <span className="w-36 shrink-0 truncate text-sm font-medium text-[var(--text-primary)]">
        {session.agentName ?? "Chat"}
      </span>

      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
        {session.resultSummary ?? session.errorMessage ?? session.status}
      </span>

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
