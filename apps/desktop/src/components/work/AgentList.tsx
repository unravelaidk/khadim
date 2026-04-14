import React, { useState, useMemo } from "react";
import type { ManagedAgent } from "../../lib/types";

/* ─── Agent List ───────────────────────────────────────────────────── */

interface AgentListProps {
  agents: ManagedAgent[];
  onCreateAgent: () => void;
  onConfigureAgent: (id: string) => void;
  onToggleAgent: (id: string) => void;
  onRunAgent: (id: string) => void;
  onViewAgentLogs: (id: string) => void;
}

export function AgentList({
  agents,
  onCreateAgent,
  onConfigureAgent,
  onToggleAgent,
  onRunAgent,
  onViewAgentLogs,
}: AgentListProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q))
    : agents;

  const activeCount = agents.filter((a) => a.status === "active").length;
  const pausedCount = agents.filter((a) => a.status === "paused").length;

  /* ── Empty ───────────────────────────────────────────────────── */
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--surface-ink-4)]">
            <i className="ri-robot-2-line text-[20px] leading-none text-[var(--text-muted)]" />
          </div>
          <h1 className="font-display text-xl font-medium tracking-[-0.01em] text-[var(--text-primary)]">
            Agents
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)] max-w-md">
            An agent is a persistent automation persona — instructions, tools,
            and a trigger. It keeps working even when you close the app.
          </p>
          <button
            onClick={onCreateAgent}
            className="btn-accent mt-7 h-10 rounded-full px-6 text-[13px] font-semibold"
          >
            Create agent
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-6 xl:px-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[18px] font-medium tracking-[-0.01em] text-[var(--text-primary)]">
              Agents
            </h1>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              {[
                activeCount > 0 && `${activeCount} active`,
                pausedCount > 0 && `${pausedCount} paused`,
                activeCount === 0 && pausedCount === 0 && `${agents.length} total`,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            onClick={onCreateAgent}
            className="btn-accent h-8 rounded-full px-4 text-[11px] font-semibold"
          >
            New agent
          </button>
        </div>

        {agents.length > 5 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter agents…"
            className="glass-input mt-4 h-9 w-full max-w-xs rounded-[var(--radius-sm)] px-3 text-[13px]"
          />
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-8 xl:px-10">
        <div className="grid grid-cols-1 gap-2 pb-8 lg:grid-cols-2">
          {visible.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onConfigure={() => onConfigureAgent(agent.id)}
              onToggle={() => onToggleAgent(agent.id)}
              onRun={() => onRunAgent(agent.id)}
              onLogs={() => onViewAgentLogs(agent.id)}
            />
          ))}

          {visible.length === 0 && q && (
            <p className="col-span-full py-12 text-[13px] text-[var(--text-muted)]">
              No agents match "{query}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Card ───────────────────────────────────────────────────── */

function AgentCard({
  agent,
  onConfigure,
  onToggle,
  onRun,
  onLogs,
}: {
  agent: ManagedAgent;
  onConfigure: () => void;
  onToggle: () => void;
  onRun: () => void;
  onLogs: () => void;
}) {
  const isActive = agent.status === "active";
  const isPaused = agent.status === "paused";
  const statusLabel = isActive ? "Active" : isPaused ? "Paused" : "Inactive";
  const triggerLabel =
    agent.triggerType === "schedule" ? "Scheduled" :
    agent.triggerType === "event" ? "On event" : "Manual";

  // Name-derived hue for initial badge
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < agent.name.length; i++) h = (h + agent.name.charCodeAt(i) * 37) % 360;
    return h;
  }, [agent.name]);

  return (
    <div className="group relative flex flex-col rounded-[14px] border border-[var(--glass-border)] bg-[var(--surface-card)] p-4 transition-[border-color,background] duration-[var(--duration-base)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--surface-card-hover)]">
      {/* Top row: badge + name + status */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] font-display text-[13px] font-semibold"
          style={{
            background: `oklch(50% 0.04 ${hue} / 0.12)`,
            color: `oklch(75% 0.06 ${hue})`,
          }}
        >
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
            {agent.name}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isActive
              ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]"
              : isPaused
                ? "bg-[var(--glass-bg-strong)] text-[var(--color-pop)]"
                : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-[var(--color-success)]" :
            isPaused ? "bg-[var(--color-pop)]" :
            "bg-[var(--text-muted)] opacity-30"
          }`} />
          {statusLabel}
        </span>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)] line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
        <span>{triggerLabel}</span>
        {agent.stats.totalSessions > 0 && (
          <>
            <span className="opacity-30">·</span>
            <span>{agent.stats.totalSessions} sessions</span>
            <span className="opacity-30">·</span>
            <span
              className={
                agent.stats.successRate >= 0.9 ? "text-[var(--color-success-text)]" :
                agent.stats.successRate < 0.7 ? "text-[var(--color-danger-text)]" :
                ""
              }
            >
              {Math.round(agent.stats.successRate * 100)}%
            </span>
          </>
        )}
      </div>

      {/* Actions — bottom-right, hover reveal */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onRun}
          className="h-7 rounded-full bg-[var(--glass-bg)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        >
          Run
        </button>
        <button
          onClick={onConfigure}
          className="h-7 rounded-full px-2.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Edit
        </button>
        <button
          onClick={onLogs}
          className="h-7 rounded-full px-2 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Logs
        </button>
      </div>
    </div>
  );
}
