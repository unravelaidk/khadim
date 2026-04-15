import React from "react";
import type { WorkView, SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ─── Nav configuration ────────────────────────────────────────────── */

const ICONS: Record<WorkView, string> = {
  dashboard:    "ri-dashboard-3-line",
  agents:       "ri-robot-2-line",
  sessions:     "ri-chat-3-line",
  integrations: "ri-plug-line",
  environments: "ri-server-line",
  credentials:  "ri-key-2-line",
  memory:       "ri-brain-line",
  analytics:    "ri-bar-chart-box-line",
};

const LABELS: Record<WorkView, string> = {
  dashboard: "Overview",
  agents: "Agents",
  sessions: "Sessions",
  integrations: "Integrations",
  environments: "Environments",
  credentials: "Credentials",
  memory: "Memory",
  analytics: "Analytics",
};

const PRIMARY_NAV: WorkView[] = ["dashboard", "agents", "sessions"];
const SECONDARY_NAV: WorkView[] = ["integrations", "environments", "credentials", "memory", "analytics"];

/* ─── Work Sidebar ─────────────────────────────────────────────────── */

interface WorkPlatformSidebarProps {
  currentView: WorkView;
  onNavigate: (view: WorkView) => void;
  activeAgentCount: number;
  liveSessionCount: number;
  needsAttentionCount?: number;
  liveSessions?: SessionRecord[];
  onViewSession?: (id: string) => void;
}

export function WorkPlatformSidebar({
  currentView,
  onNavigate,
  activeAgentCount,
  liveSessionCount,
  needsAttentionCount = 0,
  liveSessions = [],
  onViewSession,
}: WorkPlatformSidebarProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <nav className="flex flex-col overflow-y-auto scrollbar-thin px-3 pb-2">
        {/* Primary nav */}
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((view) => (
            <NavItem
              key={view}
              view={view}
              active={currentView === view}
              badge={badgeFor(view, activeAgentCount, liveSessionCount, needsAttentionCount)}
              isAttention={view === "sessions" && needsAttentionCount > 0 && liveSessionCount === 0}
              onClick={() => onNavigate(view)}
            />
          ))}
        </div>

        {/* Secondary — platform config */}
        <div className="mt-5 flex flex-col gap-0.5">
          <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Platform
          </p>
          {SECONDARY_NAV.map((view) => (
            <NavItem
              key={view}
              view={view}
              active={currentView === view}
              onClick={() => onNavigate(view)}
            />
          ))}
        </div>

        {/* Live sessions — "Now" section */}
        {liveSessions.length > 0 && (
          <div className="mt-6 flex flex-col gap-0.5">
            <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Now
            </p>
            {liveSessions.slice(0, 4).map((session) => (
              <button
                key={session.id}
                onClick={() => onViewSession?.(session.id)}
                className="group flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg)]"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-pop)] status-pulse" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--text-primary)]">
                    {session.agentName ?? "Session"}
                  </span>
                  <span className="block truncate text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                    {session.startedAt ? formatTimeShort(session.startedAt) : "—"}
                    {session.resultSummary && (
                      <> · {session.resultSummary.slice(0, 24)}</>
                    )}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

/* ─── Nav Item ─────────────────────────────────────────────────────── */

function NavItem({
  view,
  active,
  badge,
  isAttention,
  onClick,
}: {
  view: WorkView;
  active: boolean;
  badge?: number | null;
  isAttention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-all duration-[var(--duration-fast)] ${
        active
          ? "depth-card-sm text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]/40 hover:text-[var(--text-primary)]"
      }`}
    >
      <i
        className={`${ICONS[view]} text-[16px] leading-none shrink-0 transition-colors ${
          active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
        }`}
      />
      <span className="flex-1 text-[13px] font-medium">{LABELS[view]}</span>

      {badge != null && badge > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none text-[var(--text-primary)]"
          style={{
            background: isAttention ? "var(--tint-rose)" : "var(--tint-warm)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function badgeFor(
  view: WorkView,
  activeAgentCount: number,
  liveSessionCount: number,
  needsAttentionCount: number,
): number | null {
  if (view === "agents" && activeAgentCount > 0) return activeAgentCount;
  if (view === "sessions" && liveSessionCount > 0) return liveSessionCount;
  if (view === "sessions" && needsAttentionCount > 0) return needsAttentionCount;
  return null;
}
