import React from "react";

/* ─── Analytics ────────────────────────────────────────────────────── */

interface AnalyticsDashboardProps {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTokens: number;
  estimatedCost: number;
  agentBreakdown: { name: string; sessions: number }[];
  dailySessions: { date: string; count: number }[];
}

export function AnalyticsDashboard({
  totalSessions,
  completedSessions,
  failedSessions,
  totalTokens,
  estimatedCost,
  agentBreakdown,
  dailySessions,
}: AnalyticsDashboardProps) {
  const successRate = totalSessions > 0
    ? Math.round((completedSessions / totalSessions) * 100)
    : 0;
  const maxDaily = Math.max(...dailySessions.map((d) => d.count), 1);

  /* ── Empty ───────────────────────────────────────────────────── */
  if (totalSessions === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)]">
            Analytics
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Usage statistics, token costs, and success rates appear here
            once agents start running sessions.
          </p>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="w-full max-w-3xl px-10 pt-8 pb-16">
        <h1 className="font-display text-xl font-medium tracking-tight text-[var(--text-primary)]">
          Analytics
        </h1>

        {/* ── Key numbers — inline text, not metric cards ──────── */}
        <p className="mt-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{totalSessions.toLocaleString()}</span> sessions total,{" "}
          <span className={`font-medium ${
            successRate >= 90 ? "text-[var(--color-success-text)]" :
            successRate >= 70 ? "text-[var(--text-primary)]" :
            "text-[var(--color-danger-text)]"
          }`}>
            {successRate}%
          </span> success rate.{" "}
          {failedSessions > 0 && (
            <><span className="font-medium text-[var(--color-danger-text)]">{failedSessions}</span> failed. </>
          )}
          {totalTokens > 0 && (
            <><span className="font-medium text-[var(--text-primary)]">{Math.round(totalTokens / 1000)}k</span> tokens used</>
          )}
          {estimatedCost > 0 && (
            <> at an estimated <span className="font-medium text-[var(--text-primary)]">${estimatedCost.toFixed(2)}</span></>
          )}
          .
        </p>

        {/* ── Activity ─────────────────────────────────────────── */}
        {dailySessions.length > 0 && (
          <div className="mt-12">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">
              Last {dailySessions.length} days
            </h2>
            <div className="mt-4 flex items-end gap-[2px]" style={{ height: 64 }}>
              {dailySessions.map((day) => {
                const h = maxDaily > 0 ? (day.count / maxDaily) * 100 : 0;
                return (
                  <div
                    key={day.date}
                    className="group relative flex-1"
                    style={{ height: "100%" }}
                    title={`${day.date}: ${day.count}`}
                  >
                    <div
                      className="absolute bottom-0 w-full rounded-t-sm bg-[var(--text-muted)] opacity-25 transition-opacity group-hover:opacity-50"
                      style={{ height: `${Math.max(h, 3)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>{dailySessions[0]?.date}</span>
              <span>{dailySessions[dailySessions.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* ── By agent — horizontal bars ────────────────────────── */}
        {agentBreakdown.length > 0 && (
          <div className="mt-12">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">
              By agent
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {agentBreakdown.map((agent) => {
                const maxAgent = Math.max(...agentBreakdown.map((a) => a.sessions), 1);
                const pct = maxAgent > 0 ? (agent.sessions / maxAgent) * 100 : 0;
                return (
                  <div key={agent.name} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm text-[var(--text-primary)]">
                      {agent.name}
                    </span>
                    <div className="h-1 flex-1 rounded-full bg-[var(--surface-ink-4)]">
                      <div
                        className="h-1 rounded-full bg-[var(--text-muted)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">
                      {agent.sessions}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
