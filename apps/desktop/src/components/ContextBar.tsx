import type { AgentInstance } from "../lib/types";
import { formatTokens } from "../lib/agent-utils";

/** Known model context windows in tokens. Matched via substring of modelLabel (case-insensitive). */
const MODEL_CONTEXT_WINDOWS: Array<{ match: string; limit: number; label: string }> = [
  { match: "gemini-1.5-pro",    limit: 2_097_152, label: "2M" },
  { match: "gemini-2.0-flash",  limit: 1_048_576, label: "1M" },
  { match: "gemini-1.5-flash",  limit: 1_048_576, label: "1M" },
  { match: "gemini",            limit: 1_048_576, label: "1M" },
  { match: "claude",            limit:   200_000, label: "200k" },
  { match: "o1",                limit:   200_000, label: "200k" },
  { match: "o3",                limit:   200_000, label: "200k" },
  { match: "gpt-4o",            limit:   128_000, label: "128k" },
  { match: "gpt-4",             limit:   128_000, label: "128k" },
];

function getContextWindow(modelLabel: string | null): { limit: number; label: string } | null {
  if (!modelLabel) return null;
  const lower = modelLabel.toLowerCase();
  return MODEL_CONTEXT_WINDOWS.find((m) => lower.includes(m.match)) ?? null;
}

function barColorClass(pct: number | null): string {
  if (pct === null) return "bg-[var(--text-muted)]";
  if (pct > 85) return "bg-[var(--color-danger)]";
  if (pct > 65) return "bg-[var(--color-pop)]";
  return "bg-[var(--color-success)]";
}

function barTextClass(pct: number | null): string {
  if (pct === null) return "text-[var(--text-muted)]";
  if (pct > 85) return "text-[var(--color-danger-text)]";
  if (pct > 65) return "text-[var(--color-pop)]";
  return "text-[var(--color-success-text)]";
}

interface ContextBarProps {
  agent: AgentInstance | null;
  isStreaming?: boolean;
}

export function ContextBar({ agent, isStreaming = false }: ContextBarProps) {
  if (!agent?.tokenUsage) return null;

  const { inputTokens, outputTokens, cacheReadTokens } = agent.tokenUsage;
  const ctx = getContextWindow(agent.modelLabel);

  const pct = ctx ? Math.min((inputTokens / ctx.limit) * 100, 100) : null;

  return (
    <div className="shrink-0 px-5 py-2 flex items-center gap-3 border-b border-[var(--glass-border)]">
      <span className="font-mono text-[8px] uppercase tracking-[0.15em] shrink-0 text-[var(--text-muted)]">
        Context
      </span>

      {pct !== null && (
        <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-[var(--glass-border-strong)]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColorClass(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <span className="font-mono text-[9px] shrink-0 tabular-nums text-[var(--text-secondary)]">
        {formatTokens(inputTokens)}
        {ctx ? ` / ${ctx.label}` : " ctx"}
        {pct !== null && (
          <span className="text-[var(--text-muted)]">
            {" "}· {pct.toFixed(0)}%
          </span>
        )}
      </span>

      <span className="font-mono text-[8px] shrink-0 tabular-nums text-[var(--text-muted)]">
        +{formatTokens(outputTokens)} out
      </span>

      {cacheReadTokens > 0 && (
        <span
          className="font-mono text-[8px] shrink-0 tabular-nums text-[var(--color-success-text)] opacity-80"
          title="Cache read tokens (cheaper)"
        >
          {formatTokens(cacheReadTokens)} cached
        </span>
      )}

      {isStreaming && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${barColorClass(pct)}`} />
      )}
    </div>
  );
}
