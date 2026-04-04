import React, { useState } from "react";
import type { AgentInstance } from "../lib/types";
import { relTime } from "../lib/ui";

interface AgentCardProps {
  agent: AgentInstance;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
  onManage: () => void;
}

function statusLabel(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working...";
  if (agent.status === "complete" && agent.finishedAt) return `Done ${relTime(agent.finishedAt)}`;
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

function statusTextClass(status: AgentInstance["status"]): string {
  if (status === "running") return "text-[var(--text-secondary)]";
  if (status === "error") return "text-[var(--color-danger-text-light)]";
  return "text-[var(--text-muted)]";
}

export const AgentCard = React.memo(function AgentCard({ agent, isSelected, onClick, onRemove, onManage }: AgentCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div
      className={`group rounded-xl transition-all duration-150 cursor-pointer ${
        isSelected
          ? "bg-[var(--glass-bg-strong)] border border-[var(--glass-border-strong)]"
          : "bg-transparent hover:bg-[var(--glass-bg)] border border-transparent"
      } px-2.5 py-2`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Label row + actions */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate block">
            {agent.label}
          </span>
        </div>

        {/* Actions — trailing edge, hover-revealed */}
        <div className={`shrink-0 flex items-center gap-0.5 transition-opacity duration-150 ${
          confirmRemove ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}>
          {!confirmRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onManage(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
              title="Settings"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <circle cx="12" cy="12" r="3" />
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

      {/* Status + branch row */}
      <div className="flex items-center gap-2 mt-0.5 min-w-0">
        <p className={`text-[10px] truncate flex-1 min-w-0 ${statusTextClass(agent.status)}`}>
          {statusLabel(agent)}
        </p>
        {agent.branch && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] truncate shrink-0 max-w-[100px]">
            {agent.branch}
          </span>
        )}
      </div>

      {/* Stream preview */}
      {agent.status === "running" && agent.streamPreview.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {agent.streamPreview.slice(-2).map((line, i) => (
            <p
              key={i}
              className="text-[10px] font-mono text-[var(--text-muted)] truncate leading-tight"
              style={{ opacity: i === 0 && agent.streamPreview.length > 1 ? 0.65 : 1 }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});
