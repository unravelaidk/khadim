import React, { useState } from "react";
import type { AgentInstance } from "../lib/types";
import { relTime } from "../lib/ui";
import { StatusIndicator } from "./StatusIndicator";

interface AgentCardProps {
  agent: AgentInstance;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
  onManage: () => void;
}

function statusLabel(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working…";
  if (agent.status === "complete" && agent.finishedAt) return `Done ${relTime(agent.finishedAt)}`;
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

function statusTextClass(status: AgentInstance["status"]): string {
  if (status === "running") return "text-[var(--color-accent)]";
  if (status === "error") return "text-[var(--color-danger-text-light)]";
  return "text-[var(--text-muted)]";
}

export const AgentCard = React.memo(function AgentCard({ agent, isSelected, onClick, onRemove, onManage }: AgentCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const statusLabelText = statusLabel(agent);

  return (
    <div
      className={`group cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors duration-150 ${
        isSelected
          ? "bg-[var(--color-accent-subtle)]"
          : "bg-transparent hover:bg-[var(--glass-bg)]"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <StatusIndicator status={agent.status} size="sm" />
        <div className="flex-1 min-w-0">
          <span className={`block truncate text-[12px] font-medium leading-tight ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"}`}>
            {agent.label}
          </span>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-[10px] ${statusTextClass(agent.status)}`}>
              {statusLabelText}
            </p>
            {agent.branch && (
              <span className="max-w-[100px] shrink-0 truncate rounded-md bg-[var(--surface-ink-4)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                {agent.branch}
              </span>
            )}
          </div>
        </div>

        <div className={`shrink-0 flex items-center gap-0.5 transition-opacity duration-150 ${
          confirmRemove ? "opacity-100" : "opacity-70 group-hover:opacity-100"
        }`}>
          {!confirmRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onManage(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
              title="Settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (agent.status === "running" && !confirmRemove) { setConfirmRemove(true); return; }
              if (confirmRemove) { onRemove(); setConfirmRemove(false); return; }
              onRemove();
            }}
            onBlur={() => setConfirmRemove(false)}
            className={`transition-all duration-150 ${
              confirmRemove
                ? "rounded-md bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] text-[var(--color-danger)] px-1.5 py-0.5 text-[9px] font-semibold"
                : "w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
            }`}
            title={confirmRemove ? "Click again to confirm" : "Remove"}
          >
            {confirmRemove ? "Remove?" : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {agent.status === "running" && agent.streamPreview.length > 0 && (
        <div className="mt-1.5 ml-[26px] space-y-0.5">
          {agent.streamPreview.slice(-2).map((line, i) => (
            <p
              key={i}
              className="truncate font-mono text-[9px] leading-tight text-[var(--text-muted)]"
              style={{ opacity: i === 0 && agent.streamPreview.length > 1 ? 0.55 : 0.85 }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});
