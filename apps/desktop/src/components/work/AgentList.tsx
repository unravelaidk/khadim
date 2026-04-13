import React, { useState } from "react";
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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Agents
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            An agent is a persistent automation persona — instructions, tools,
            and a trigger. It keeps working even when you close the app.
          </p>
          <button
            onClick={onCreateAgent}
            className="btn-accent mt-8 h-10 rounded-full px-6 text-sm font-semibold"
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
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Agents
            </h1>
            <span className="text-sm text-[var(--text-muted)]">
              {activeCount > 0 && `${activeCount} active`}
              {activeCount > 0 && pausedCount > 0 && ", "}
              {pausedCount > 0 && `${pausedCount} paused`}
              {activeCount === 0 && pausedCount === 0 && `${agents.length} total`}
            </span>
          </div>
          <button
            onClick={onCreateAgent}
            className="btn-accent h-8 rounded-full px-4 text-xs font-semibold"
          >
            New agent
          </button>
        </div>

        {agents.length > 5 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter agents…"
            className="glass-input mt-4 h-9 w-full max-w-xs rounded-[var(--radius-sm)] px-3 text-sm"
          />
        )}
      </div>

      {/* List — not a table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-10">
        <div className="flex flex-col pb-8">
          {visible.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              onConfigure={() => onConfigureAgent(agent.id)}
              onToggle={() => onToggleAgent(agent.id)}
              onRun={() => onRunAgent(agent.id)}
              onLogs={() => onViewAgentLogs(agent.id)}
            />
          ))}

          {visible.length === 0 && q && (
            <p className="py-12 text-sm text-[var(--text-muted)]">
              No agents match "{query}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Row ────────────────────────────────────────────────────── */

function AgentRow({
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

  return (
    <div className="group flex items-start gap-4 border-b border-[var(--glass-border)] py-4 last:border-0">
      {/* Status dot */}
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          isActive ? "bg-[var(--color-success)]" :
          isPaused ? "bg-[var(--color-pop)]" :
          "bg-[var(--text-muted)] opacity-30"
        }`}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">{agent.name}</p>
          <span className="text-xs text-[var(--text-muted)]">{statusLabel}</span>
        </div>
        {agent.description && (
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] max-w-lg">
            {agent.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>{triggerLabel}</span>
          {agent.stats.totalSessions > 0 && (
            <>
              <span>{agent.stats.totalSessions} sessions</span>
              <span
                className={
                  agent.stats.successRate >= 0.9 ? "text-[var(--color-success-text)]" :
                  agent.stats.successRate < 0.7 ? "text-[var(--color-danger-text)]" :
                  ""
                }
              >
                {Math.round(agent.stats.successRate * 100)}% success
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex shrink-0 items-center gap-1 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onRun}
          className="h-7 rounded-full bg-[var(--glass-bg)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        >
          Run
        </button>
        <button
          onClick={onConfigure}
          className="h-7 rounded-full px-3 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Configure
        </button>
        <button
          onClick={onLogs}
          className="h-7 rounded-full px-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Logs
        </button>
      </div>
    </div>
  );
}
