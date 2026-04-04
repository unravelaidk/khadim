import type { AgentInstance } from "../lib/types";

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return String(n);
}

interface ContextBarProps {
  agent: AgentInstance | null;
  isStreaming?: boolean;
}

export function ContextBar({ agent, isStreaming = false }: ContextBarProps) {
  if (!agent?.tokenUsage) return null;

  const { inputTokens, outputTokens, cacheReadTokens } = agent.tokenUsage;
  const ctx = getContextWindow(agent.modelLabel);

  const totalUsed = inputTokens + outputTokens;
  const pct = ctx ? Math.min((inputTokens / ctx.limit) * 100, 100) : null;

  const barColor =
    pct === null    ? "var(--text-muted)"
    : pct > 85      ? "var(--color-danger)"
    : pct > 65      ? "var(--color-pop)"
    : "var(--color-success)";

  return (
    <div
      className="shrink-0 px-5 py-2 flex items-center gap-3 border-b border-[var(--glass-border)]"
      style={{ background: "var(--surface-bg-subtle)" }}
    >
      {/* Label */}
      <span
        className="font-mono text-[8px] uppercase tracking-[0.15em] shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        Context
      </span>

      {/* Bar */}
      {pct !== null && (
        <div
          className="flex-1 rounded-full overflow-hidden"
          style={{ height: 3, background: "var(--glass-border-strong)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      )}

      {/* Tokens used / limit */}
      <span
        className="font-mono text-[9px] shrink-0 tabular-nums"
        style={{ color: "var(--text-secondary)" }}
      >
        {formatTokens(inputTokens)}
        {ctx ? ` / ${ctx.label}` : " ctx"}
        {pct !== null && (
          <span style={{ color: "var(--text-muted)" }}>
            {" "}· {pct.toFixed(0)}%
          </span>
        )}
      </span>

      {/* Output tokens pill */}
      <span
        className="font-mono text-[8px] shrink-0 tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        +{formatTokens(outputTokens)} out
      </span>

      {/* Cache read — shown when non-zero (indicates cost savings) */}
      {cacheReadTokens > 0 && (
        <span
          className="font-mono text-[8px] shrink-0 tabular-nums"
          style={{ color: "var(--color-success-text)", opacity: 0.8 }}
          title="Cache read tokens (cheaper)"
        >
          {formatTokens(cacheReadTokens)} cached
        </span>
      )}

      {/* Live pulse */}
      {isStreaming && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
          style={{ background: barColor }}
        />
      )}
    </div>
  );
}
