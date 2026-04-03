import React, { useState } from "react";
import type { AgentInstance } from "../lib/types";
import { relTime } from "../lib/ui";

interface AgentCardProps {
  agent: AgentInstance;
  isSelected: boolean;
  hue: number;
  onClick: () => void;
  onRemove: () => void;
  onManage: () => void;
}

function statusLabel(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) {
    return agent.currentActivity;
  }
  if (agent.status === "running") return "Working...";
  if (agent.status === "complete" && agent.finishedAt) {
    return `Done ${relTime(agent.finishedAt)}`;
  }
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

function statusDotClass(status: AgentInstance["status"]): string {
  if (status === "running") return "bg-[var(--color-accent)] animate-pulse";
  if (status === "complete") return "bg-[var(--color-success)]";
  if (status === "error") return "bg-[var(--color-danger)]";
  return "bg-[var(--scrollbar-thumb)]";
}

export const AgentCard = React.memo(function AgentCard({ agent, isSelected, hue, onClick, onRemove, onManage }: AgentCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="group relative">
      {/* Action buttons — top-right corner, hover-visible */}
      <div className={`absolute -top-1 -right-1 z-10 flex items-center gap-0.5 transition-opacity duration-150 ${
        confirmRemove ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}>
        {/* Manage (gear) button */}
        {!confirmRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onManage(); }}
            className="w-5 h-5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] border border-transparent transition-colors"
            title="Agent settings"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (agent.status === "running" && !confirmRemove) {
              setConfirmRemove(true);
              return;
            }
            if (confirmRemove) {
              onRemove();
              setConfirmRemove(false);
              return;
            }
            onRemove();
          }}
          onBlur={() => setConfirmRemove(false)}
          className={`rounded-md transition-all duration-150 ${
            confirmRemove
              ? "bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] text-[var(--color-danger)] px-1.5 py-0.5 text-[9px] font-semibold"
              : "w-5 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] border border-transparent"
          }`}
          title={confirmRemove ? "Click again to confirm" : "Remove agent"}
        >
          {confirmRemove ? (
            "Remove?"
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      </div>

      <button
        onClick={onClick}
        className={`w-full text-left rounded-xl transition-all duration-200 ${
          isSelected
            ? "bg-[var(--glass-bg-strong)] border border-[var(--glass-border-strong)] shadow-[var(--shadow-glass-sm)]"
            : "bg-transparent hover:bg-[var(--glass-bg)] border border-transparent"
        } p-2.5`}
      >
        {/* Top row: avatar + label + model badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Colored avatar */}
          <div
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold relative"
            style={{
              background: `hsl(${hue} 50% 92%)`,
              color: `hsl(${hue} 45% 35%)`,
            }}
          >
            {agent.label.charAt(0).toUpperCase()}
            {/* Status dot overlaid on avatar */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--surface-bg)] ${statusDotClass(agent.status)}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate flex-1 min-w-0">
                {agent.label}
              </span>
              {agent.modelLabel && (
                <span className="shrink-0 text-[9px] font-medium text-[var(--text-muted)] bg-[var(--surface-ink-5)] rounded-full px-1.5 py-0.5 truncate max-w-[80px]">
                  {agent.modelLabel}
                </span>
              )}
            </div>

            {/* Branch badge */}
            {agent.branch && (
              <div className="flex items-center gap-1 mt-0.5">
                <svg className="w-2.5 h-2.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3H6m0-3h12a3 3 0 003-3V6a3 3 0 00-3-3H9a3 3 0 00-3 3v6z" />
                </svg>
                <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                  {agent.branch}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Activity / status line */}
        <p className={`text-[10px] mt-1.5 ml-[38px] truncate ${
          agent.status === "error" ? "text-[var(--color-danger-text-light)]" : "text-[var(--text-muted)]"
        }`}>
          {statusLabel(agent)}
        </p>

        {/* Stream preview — last 2 lines */}
        {agent.status === "running" && agent.streamPreview.length > 0 && (
          <div className="mt-1.5 ml-[38px] space-y-0.5">
            {agent.streamPreview.slice(-2).map((line, i) => (
              <p
                key={i}
                className="text-[10px] font-mono text-[var(--text-muted)] truncate leading-tight"
                style={{ opacity: i === 0 && agent.streamPreview.length > 1 ? 0.5 : 0.8 }}
              >
                {line}
              </p>
            ))}
            {/* Shimmer bar */}
            <div className="h-[2px] w-full rounded-full overflow-hidden mt-1">
              <div
                className="h-full animate-shimmer rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, hsl(${hue} 50% 70% / 0.5), transparent)`,
                  backgroundSize: "200% 100%",
                }}
              />
            </div>
          </div>
        )}

        {/* Elapsed time for running agents */}
        {agent.status === "running" && agent.startedAt && (
          <p className="text-[9px] text-[var(--text-muted)] mt-1 ml-[38px] tabular-nums">
            {relTime(agent.startedAt)}
          </p>
        )}
      </button>
    </div>
  );
});
