import React from "react";
import type { WorkView, SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

/* ─── Nav configuration ────────────────────────────────────────────── */

const ICONS: Record<WorkView, string> = {
  dashboard:    "M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zm10-2a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z",
  agents:       "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V21",
  sessions:     "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  environments: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
  credentials:  "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  memory:       "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  analytics:    "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
};

const LABELS: Record<WorkView, string> = {
  dashboard: "Overview",
  agents: "Agents",
  sessions: "Sessions",
  environments: "Environments",
  credentials: "Credentials",
  memory: "Memory",
  analytics: "Analytics",
};

const PRIMARY_NAV: WorkView[] = ["dashboard", "agents", "sessions"];
const SECONDARY_NAV: WorkView[] = ["environments", "credentials", "memory", "analytics"];

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
        {/* Primary nav — the core surfaces */}
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
        <div className="mt-4 flex flex-col gap-0.5">
          <p className="px-3 pb-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
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

        {/* Live sessions — shown inline as "Today" */}
        {liveSessions.length > 0 && (
          <div className="mt-5 flex flex-col gap-1">
            <p className="px-3 pb-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Today
            </p>
            {liveSessions.slice(0, 4).map((session) => (
              <button
                key={session.id}
                onClick={() => onViewSession?.(session.id)}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg)]"
              >
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                  {session.startedAt ? formatTimeShort(session.startedAt) : "--:--"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
                  {session.agentName ?? "Session"}
                </span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-pop)] status-pulse" />
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
      className={`group flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors duration-[var(--duration-fast)] ${
        active
          ? "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
      }`}
    >
      <svg
        className={`h-[17px] w-[17px] shrink-0 ${
          active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
        }`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[view]} />
      </svg>
      <span className="flex-1 text-[13.5px] font-medium">{LABELS[view]}</span>

      {badge != null && badge > 0 && (
        <span
          className={`inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-none ${
            isAttention
              ? "bg-[var(--color-danger-muted)] text-[var(--color-danger-text)]"
              : "bg-[var(--glass-bg-strong)] text-[var(--text-secondary)]"
          }`}
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
