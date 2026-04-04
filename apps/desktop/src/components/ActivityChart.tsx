import { useState, useMemo } from "react";
import type { AgentInstance } from "../lib/types";

type Period = "7D" | "4W" | "12M";

interface Bucket {
  label: string;
  completed: number;
  errors: number;
  total: number;
}

function buildBuckets(agents: AgentInstance[], period: Period): Bucket[] {
  const now = Date.now();

  if (period === "7D") {
    const DAY = 86_400_000;
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return Array.from({ length: 7 }).map((_, i) => {
      const dayStart = new Date(now - (6 - i) * DAY);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + DAY);
      const inDay = agents.filter((a) => {
        const ts = a.finishedAt ?? a.startedAt;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });
      return {
        label: i === 6 ? "Today" : DAYS[dayStart.getDay()],
        completed: inDay.filter((a) => a.status === "complete").length,
        errors: inDay.filter((a) => a.status === "error").length,
        total: inDay.length,
      };
    });
  }

  if (period === "4W") {
    const WEEK = 7 * 86_400_000;
    return Array.from({ length: 4 }).map((_, i) => {
      const weekStart = now - (3 - i) * WEEK;
      const weekEnd = weekStart + WEEK;
      const inWeek = agents.filter((a) => {
        const ts = a.finishedAt ?? a.startedAt;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return t >= weekStart && t < weekEnd;
      });
      return {
        label: i === 3 ? "This wk" : `${3 - i}w ago`,
        completed: inWeek.filter((a) => a.status === "complete").length,
        errors: inWeek.filter((a) => a.status === "error").length,
        total: inWeek.length,
      };
    });
  }

  // 12M
  return Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (11 - i));
    const monthStart = d.getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const inMonth = agents.filter((a) => {
      const ts = a.finishedAt ?? a.startedAt;
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return t >= monthStart && t < monthEnd;
    });
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return {
      label: MONTHS[d.getMonth()],
      completed: inMonth.filter((a) => a.status === "complete").length,
      errors: inMonth.filter((a) => a.status === "error").length,
      total: inMonth.length,
    };
  });
}

const ROWS = 8;

function DotMatrix({ buckets, empty }: { buckets: Bucket[]; empty: boolean }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <div className="flex gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {Array.from({ length: ROWS }).map((_, r) => (
                <span
                  key={r}
                  className="block rounded-full"
                  style={{ width: 5, height: 5, background: "var(--glass-border-strong)" }}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: "var(--text-muted)" }}>
          No runs yet — start an agent to see activity
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[5px] w-full">
      {buckets.map((bucket, col) => {
        const filledTotal = Math.round((bucket.total / max) * ROWS);
        const filledErr = Math.min(Math.round((bucket.errors / max) * ROWS), filledTotal);

        return (
          <div key={col} className="flex flex-col items-center gap-[3px] flex-1 min-w-0">
            {Array.from({ length: ROWS }).map((_, row) => {
              const dotIndex = ROWS - 1 - row; // 0 = bottom
              const isError = dotIndex < filledErr;
              const isFilled = dotIndex < filledTotal;
              return (
                <span
                  key={row}
                  className="block rounded-full shrink-0"
                  style={{
                    width: 5,
                    height: 5,
                    background: isError
                      ? "var(--color-danger)"
                      : isFilled
                      ? "var(--text-primary)"
                      : "var(--glass-border-strong)",
                    opacity: isFilled && !isError ? 0.4 + (dotIndex / ROWS) * 0.6 : 1,
                  }}
                />
              );
            })}
            <span
              className="font-mono uppercase mt-1 truncate w-full text-center"
              style={{ fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em" }}
            >
              {bucket.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ActivityChartProps {
  agents: AgentInstance[];
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "7D", label: "7D" },
  { key: "4W", label: "4W" },
  { key: "12M", label: "12M" },
];

export function ActivityChart({ agents }: ActivityChartProps) {
  const [period, setPeriod] = useState<Period>("7D");

  const buckets = useMemo(() => buildBuckets(agents, period), [agents, period]);

  const running = agents.filter((a) => a.status === "running").length;
  const completed = agents.filter((a) => a.status === "complete").length;
  const errors = agents.filter((a) => a.status === "error").length;
  const total = agents.length;
  const empty = total === 0;

  const periodCompleted = buckets.reduce((s, b) => s + b.completed, 0);
  const periodErrors = buckets.reduce((s, b) => s + b.errors, 0);
  const periodTotal = buckets.reduce((s, b) => s + b.total, 0);
  const successRate = periodTotal > 0 ? Math.round((periodCompleted / periodTotal) * 100) : null;

  return (
    <div
      className="w-full rounded-[20px] overflow-hidden"
      style={{ background: "var(--surface-card)", border: "1px solid var(--glass-border)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: stats */}
          <div className="flex flex-col gap-2 min-w-0">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: "var(--text-muted)" }}
            >
              Agent Runs
            </span>

            <div className="flex items-baseline gap-3">
              <span
                className="font-display text-3xl font-bold leading-none tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {empty ? "0" : periodTotal}
              </span>
              {!empty && (
                <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                  in period
                </span>
              )}
            </div>

            {/* Pill stats row */}
            <div className="flex items-center gap-2 flex-wrap">
              {running > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px]"
                  style={{ background: "var(--color-accent-muted)", color: "var(--text-primary)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse inline-block" />
                  {running} running
                </span>
              )}
              {completed > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px]"
                  style={{ background: "var(--color-success-muted)", color: "var(--color-success-text)" }}
                >
                  {completed} done
                </span>
              )}
              {errors > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px]"
                  style={{ background: "var(--color-danger-muted)", color: "var(--color-danger)" }}
                >
                  {errors} failed
                </span>
              )}
              {successRate !== null && periodErrors > 0 && (
                <span className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>
                  {successRate}% success
                </span>
              )}
            </div>
          </div>

          {/* Right: period tabs */}
          <div
            className="flex items-center rounded-lg overflow-hidden shrink-0 mt-0.5"
            style={{ border: "1px solid var(--glass-border)" }}
          >
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className="font-mono text-[8px] uppercase tracking-widest px-2.5 py-1.5 transition-colors"
                style={{
                  background: period === key ? "var(--glass-bg-strong)" : "transparent",
                  color: period === key ? "var(--text-primary)" : "var(--text-muted)",
                  fontWeight: period === key ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--glass-border)" }} />

      {/* Chart */}
      <div className="px-5 py-4">
        <DotMatrix buckets={buckets} empty={empty} />
      </div>

      {/* Legend — only shown when there are errors */}
      {!empty && periodErrors > 0 && (
        <div
          className="flex items-center gap-3 px-5 pb-3 -mt-1"
          style={{ borderTop: "none" }}
        >
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--text-primary)" }} />
            <span className="font-mono text-[8px]" style={{ color: "var(--text-muted)" }}>completed</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--color-danger)" }} />
            <span className="font-mono text-[8px]" style={{ color: "var(--text-muted)" }}>failed</span>
          </div>
        </div>
      )}
    </div>
  );
}
