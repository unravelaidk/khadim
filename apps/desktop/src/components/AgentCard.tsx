import React, { useState } from "react";
import type { AgentInstance } from "../lib/types";
import { agentStatusText, agentStatusColorClass } from "../lib/agent-utils";
import { StatusIndicator } from "./StatusIndicator";
import { MoreDotsIcon, CloseIcon } from "./shared/Icons";

interface AgentCardProps {
  agent: AgentInstance;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
  onManage: () => void;
}


export const AgentCard = React.memo(function AgentCard({ agent, isSelected, onClick, onRemove, onManage }: AgentCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const statusLabelText = agentStatusText(agent);

  return (
    <div
      className={`group cursor-pointer rounded-[var(--radius-md)] px-3 py-3 transition-colors duration-150 ${
        isSelected
          ? "bg-[var(--color-accent-subtle)]"
          : "bg-transparent hover:bg-[var(--glass-bg)]"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-center gap-3 min-w-0">
        <StatusIndicator status={agent.status} size="md" />
        <div className="flex-1 min-w-0">
          <span className={`block truncate text-[14px] font-medium leading-tight ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"}`}>
            {agent.label}
          </span>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-[12px] ${agentStatusColorClass(agent.status)}`}>
              {statusLabelText}
            </p>
            {agent.branch && (
              <span className="max-w-[100px] shrink-0 truncate rounded-md bg-[var(--surface-ink-4)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                {agent.branch}
              </span>
            )}
          </div>
        </div>

        <div className={`shrink-0 flex items-center gap-1 ${
          confirmRemove ? "" : ""
        }`}>
          {!confirmRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onManage(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
              title="Settings"
            >
              <MoreDotsIcon />
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
                ? "rounded-lg bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] text-[var(--color-danger)] px-2.5 py-1 text-[11px] font-semibold"
                : "w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
            }`}
            title={confirmRemove ? "Click again to confirm" : "Remove"}
          >
            {confirmRemove ? "Remove?" : (
              <CloseIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {agent.status === "running" && agent.streamPreview.length > 0 && (
        <div className="mt-2 ml-[34px] space-y-0.5">
          {agent.streamPreview.slice(-2).map((line, i) => (
            <p
              key={i}
              className="truncate font-mono text-[11px] leading-tight text-[var(--text-muted)]"
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
