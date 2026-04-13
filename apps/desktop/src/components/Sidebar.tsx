import React, { memo, useState, useEffect } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import type { Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { backendLabel, relTime } from "../lib/ui";
import type { AgentInstance, InteractionMode, LocalChatConversation, WorkHomeView, WorkView } from "../lib/types";
import type { ThemeMode } from "./SettingsPanel";
import { AgentCard } from "./AgentCard";
import { StatusIndicator, StatusPill } from "./StatusIndicator";
import { usePluginTabs } from "../hooks/usePluginTabs";
import { usePluginScripts } from "../hooks/usePluginScripts";
import type { PluginEntry } from "../lib/bindings";
import { WorkPlatformSidebar } from "./work/WorkPlatformSidebar";


/* ─── Brand Header ────────────────────────────────────────────────── */

function BrandHeader({
  onNewChat,
  mode,
}: {
  onNewChat: () => void;
  mode: InteractionMode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between px-4 pt-5 pb-3">
      <div className="flex items-center gap-2.5">
        <div className="logo-adaptive h-7 w-7 text-[var(--text-primary)] [&>svg]:h-full [&>svg]:w-full">
          <KhadimLogo />
        </div>
        <span className="font-display text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
          Khadim
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
          {__APP_VERSION__}
          <svg className="h-2.5 w-2.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {mode === "chat" && (
        <button
          onClick={onNewChat}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          title="New chat"
          aria-label="New chat"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ─── Mode Switcher ────────────────────────────────────────────────── */

function ModeSwitcher({
  mode,
  onSwitch,
}: {
  mode: InteractionMode;
  onSwitch: (m: InteractionMode) => void;
}) {
  const modes: { id: InteractionMode; label: string; icon: string }[] = [
    {
      id: "chat",
      label: "Chat",
      icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    },
    {
      id: "work",
      label: "Work",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
  ];

  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="relative flex gap-0.5 rounded-full bg-[var(--glass-bg)] p-1">
        {modes.map(({ id, label, icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              onClick={() => onSwitch(id)}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-sans text-[12px] font-medium transition-colors duration-[var(--duration-base)] ${
                active
                  ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* ─── Sidebar ──────────────────────────────────────────────────────── */

interface SidebarProps {
  mode: InteractionMode;
  onSwitchMode: (m: InteractionMode) => void;

  // Chat mode props
  chatConversations: LocalChatConversation[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  /** Active chat view: "home" | "chats" | "memory" | "agents" | "plugin:<id>:<label>" */
  chatView: string;
  onSetChatView: (view: string) => void;

  // Work mode — platform nav
  workView: WorkView;
  onNavigateWork: (v: WorkView) => void;
  activeAgentCount: number;
  liveSessionCount: number;

  // Legacy work mode props (kept for compatibility)
  /** @deprecated */ workspaces?: Workspace[];
  /** @deprecated */ selectedWorkspaceId?: string | null;
  /** @deprecated */ onSelectWorkspace?: (id: string) => void;
  /** @deprecated */ onNewWorkspace?: () => void;
  /** @deprecated */ onNewAgentForWorkspace?: (workspaceId: string) => void;
  /** @deprecated */ onFocusAgentFromHome?: (workspaceId: string, agentId: string) => void;
  /** @deprecated */ agents?: AgentInstance[];
  /** @deprecated */ activeWorkspace?: Workspace | null;
  /** @deprecated */ onExitWorkspace?: () => void;
  /** @deprecated */ focusedAgentId?: string | null;
  /** @deprecated */ onFocusAgent?: (id: string) => void;
  /** @deprecated */ onNewAgent?: () => void;
  /** @deprecated */ onRemoveAgent?: (id: string) => void;
  /** @deprecated */ onManageWorkspace?: () => void;
  /** @deprecated */ onManageAgent?: (id: string) => void;
  /** @deprecated */ activeWorkspaceConnected?: boolean;
  /** @deprecated */ githubAuthenticated?: boolean;

  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  showSettings: boolean;
}

export function Sidebar({
  mode,
  onSwitchMode,
  chatConversations,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  chatView,
  onSetChatView,
  workView,
  onNavigateWork,
  activeAgentCount,
  liveSessionCount,
  themeMode,
  onToggleTheme,
  onOpenSettings,
  showSettings,
}: SidebarProps) {
  return (
    <aside className="relative z-50 flex w-[272px] shrink-0 flex-col border-r border-[var(--glass-border)] bg-[var(--surface-bg-subtle)]">
      <BrandHeader onNewChat={onNewChat} mode={mode} />
      <ModeSwitcher mode={mode} onSwitch={onSwitchMode} />

      {/* Mode-specific content */}
      {mode === "chat" ? (
        <ChatSidebar
          conversations={chatConversations}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          onDeleteChat={onDeleteChat}
          chatView={chatView}
          onSetChatView={onSetChatView}
        />
      ) : (
        <WorkPlatformSidebar
          currentView={workView}
          onNavigate={onNavigateWork}
          activeAgentCount={activeAgentCount}
          liveSessionCount={liveSessionCount}
        />
      )}

      {/* Proactive mode card */}
      <div className="mt-auto shrink-0 px-3 pt-2">
        <div className="flex items-start gap-3 rounded-[14px] bg-[var(--glass-bg)] px-3 py-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-tight text-[var(--text-primary)]">Proactive mode</p>
            <p className="mt-0.5 truncate text-[11px] leading-snug text-[var(--text-muted)]">
              On · Khadim will update and act
            </p>
            <button
              onClick={onOpenSettings}
              className="mt-1 text-[11px] font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* User footer */}
      <div className="mt-2 flex shrink-0 items-center gap-3 px-3 pb-4 pt-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)] font-display text-[13px] font-semibold">
          K
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">Khadim user</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">Local workspace</p>
        </div>
        <button
          onClick={onToggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          title={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {themeMode === "dark" ? (
            <svg className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
            </svg>
          ) : (
            <svg className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            showSettings
              ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
              : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          }`}
          title="Settings"
          aria-label="Settings"
        >
          <svg className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.2" />
            <circle cx="12" cy="12" r="1.2" />
            <circle cx="12" cy="19" r="1.2" />
          </svg>
        </button>
      </div>
    </aside>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Chat Sidebar — standalone LLM conversations
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Plugin Tab Strip ─────────────────────────────────────────────── */

/** Icon map: icon name from plugin.toml → inline SVG path */
function PluginTabIcon({ icon }: { icon: string | null }) {
  const paths: Record<string, string> = {
    calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    notes: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    tasks: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    bookmark: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    timer: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    grid: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    puzzle: "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z",
  };
  const d = icon && paths[icon]
    ? paths[icon]
    : "M4 6h16M4 10h16M4 14h16M4 18h16"; // fallback: lines icon

  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

interface ChatSidebarProps {
  conversations: LocalChatConversation[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  chatView: string;
  onSetChatView: (view: string) => void;
}

/* ─── Nav icons for built-in chat views ────────────────────────────── */

const CHAT_NAV_ICONS: Record<string, string> = {
  home:   "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  chats:  "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  memory: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  agents: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const BUILTIN_CHAT_VIEWS: { view: string; label: string }[] = [
  { view: "home", label: "Home" },
  { view: "chats", label: "Chats" },
  { view: "memory", label: "Memory" },
  { view: "agents", label: "Agents" },
];

function ChatNavItem({
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  label: string;
  icon: string | React.ReactNode;
  active: boolean;
  badge?: number | null;
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
      {typeof icon === "string" ? (
        <svg
          className={`h-[17px] w-[17px] shrink-0 ${active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      ) : (
        <span className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center ${active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
          {icon}
        </span>
      )}
      <span className="flex-1 text-[13.5px] font-medium">{label}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--glass-bg-strong)] px-1.5 text-[11px] font-semibold tabular-nums leading-none text-[var(--text-secondary)]">
          {badge}
        </span>
      )}
    </button>
  );
}

function ChatSidebar({
  conversations,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  chatView,
  onSetChatView,
}: ChatSidebarProps) {
  const pluginTabs = usePluginTabs();

  // Collect all plugin entries that have a ui_js so we can inject scripts
  const [allPlugins, setAllPlugins] = useState<PluginEntry[]>([]);
  useEffect(() => {
    commands.pluginList().then(setAllPlugins);
  }, []);
  usePluginScripts(allPlugins);

  const showingChats = chatView === "chats";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <nav className="flex flex-col overflow-y-auto scrollbar-thin px-3 pb-2">
        <div className="flex flex-col gap-0.5">
          {BUILTIN_CHAT_VIEWS.map(({ view, label }) => (
            <ChatNavItem
              key={view}
              label={label}
              icon={CHAT_NAV_ICONS[view]}
              active={chatView === view}
              badge={view === "chats" ? conversations.length : null}
              onClick={() => onSetChatView(view)}
            />
          ))}
        </div>

        {/* Plugin tabs — appear as regular nav items below a divider */}
        {pluginTabs.length > 0 && (
          <div className="mt-4 flex flex-col gap-0.5">
            <p className="px-3 pb-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Plugins
            </p>
            {pluginTabs.map((entry) => {
              const key = `plugin:${entry.pluginId}:${entry.tab.label}`;
              return (
                <ChatNavItem
                  key={key}
                  label={entry.tab.label}
                  icon={<PluginTabIcon icon={entry.tab.icon} />}
                  active={chatView === key}
                  onClick={() => onSetChatView(key)}
                />
              );
            })}
          </div>
        )}

        {/* Conversations list — inline under Chats, only when that tab is active */}
        {showingChats && (
          <div className="mt-4 flex flex-col">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Recent
              </span>
              <button
                onClick={onNewChat}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--color-accent)]"
                title="New chat"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {conversations.length === 0 ? (
              <div className="px-3 py-6 text-left">
                <p className="text-[12px] leading-snug text-[var(--text-muted)]">
                  No conversations yet. Start one to see it here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {conversations.map((conversation) => (
                  <ChatSidebarItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={conversation.id === activeChatId}
                    onSelectChat={onSelectChat}
                    onDeleteChat={onDeleteChat}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

const ChatSidebarItem = memo(function ChatSidebarItem({
  conversation,
  isSelected,
  onSelectChat,
  onDeleteChat,
}: {
  conversation: LocalChatConversation;
  isSelected: boolean;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const preview = lastMessage
    ? lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? "..." : "")
    : "Empty conversation";

  return (
    <div className="group relative">
      <button
        onClick={() => onSelectChat(conversation.id)}
        className={`flex w-full flex-col gap-0.5 rounded-[var(--radius-sm)] px-3 py-2.5 pr-9 text-left transition-colors duration-[var(--duration-fast)] ${
          isSelected
            ? "bg-[var(--color-accent-subtle)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate font-sans text-[13px] font-medium leading-tight ${isSelected ? "text-[var(--color-accent)]" : ""}`}>
            {conversation.title}
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
            {relTime(conversation.updatedAt)}
          </span>
        </div>
        <p className="truncate font-sans text-[11px] leading-snug text-[var(--text-muted)]">{preview}</p>
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDeleteChat(conversation.id);
        }}
        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] opacity-0 transition-all duration-[var(--duration-fast)] hover:bg-[var(--color-danger-muted)] hover:text-[var(--color-danger-text)] focus:opacity-100 group-hover:opacity-100"
        title="Delete chat"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
});


/* ═══════════════════════════════════════════════════════════════════════
   Work Home Sidebar — workspace list + settings
   ═══════════════════════════════════════════════════════════════════════ */

interface WorkHomeSidebarProps {
  workspaces: Workspace[];
  agents: AgentInstance[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onFocusAgentFromHome: (workspaceId: string, agentId: string) => void;
  currentView: WorkHomeView;
  onNavigate: (v: WorkHomeView) => void;
  onNewWorkspace: () => void;
  onNewAgent: (workspaceId: string) => void;
  activeWorkspaceConnected: boolean;
}

function WorkHomeSidebar({
  workspaces,
  agents,
  selectedWorkspaceId,
  onSelectWorkspace,
  onFocusAgentFromHome,
  onNewWorkspace,
  onNewAgent,
}: WorkHomeSidebarProps) {
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const normalizedQuery = workspaceQuery.trim().toLowerCase();
  const visibleWorkspaces = normalizedQuery.length > 0
    ? workspaces.filter((workspace) => {
      const haystack = `${workspace.name} ${workspace.repo_path} ${workspace.branch ?? ""} ${workspace.backend}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    : workspaces;

  return (
    <>
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspaces</p>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{workspaces.length} total</p>
        </div>
        <button
          onClick={onNewWorkspace}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--color-accent)]"
          title="New workspace"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pb-2">
          <input
            value={workspaceQuery}
            onChange={(event) => setWorkspaceQuery(event.target.value)}
            placeholder="Filter workspaces"
            className="glass-input h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          {workspaces.length === 0 ? (
            <div className="px-2 py-12 text-center">
              <p className="font-display text-[16px] font-medium text-[var(--text-primary)]">
                No workspaces
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                Open a project to start working<br />with agents in a branch.
              </p>
              <button
                onClick={onNewWorkspace}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-full btn-accent px-5 font-sans text-[13px] font-medium tracking-wide"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New workspace
              </button>
            </div>
          ) : visibleWorkspaces.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <p className="font-display text-[16px] font-medium text-[var(--text-primary)]">
                No matches
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">Try another workspace keyword.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {visibleWorkspaces.map((workspace) => {
                const workspaceAgents = agents.filter((a) => a.workspaceId === workspace.id);
                return (
                  <WorkspaceSidebarItem
                    key={workspace.id}
                    workspace={workspace}
                    agents={workspaceAgents}
                    isSelected={workspace.id === selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                    onNewAgent={() => onNewAgent(workspace.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const WorkspaceSidebarItem = memo(function WorkspaceSidebarItem({
  workspace,
  agents,
  isSelected,
  onSelectWorkspace,
  onNewAgent,
}: {
  workspace: Workspace;
  agents: AgentInstance[];
  isSelected: boolean;
  onSelectWorkspace: (id: string) => void;
  onNewAgent: () => void;
}) {
  const runningCount = agents.filter((a) => a.status === "running").length;
  const latestAgent = agents[0] ?? null;

  return (
    <div
      className={`rounded-[var(--radius-sm)] border px-2.5 py-2 transition-colors duration-[var(--duration-fast)] ${
        isSelected
          ? "border-[var(--color-accent-muted)] bg-[var(--color-accent-subtle)]"
          : "border-[var(--glass-border)] bg-[var(--surface-card)]/40 hover:bg-[var(--glass-bg)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => onSelectWorkspace(workspace.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-display text-[14px] font-semibold ${
              isSelected
                ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                : "bg-[var(--glass-bg)] text-[var(--text-primary)]"
            }`}
          >
            {workspace.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[14px] font-medium ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"}`}>
              {workspace.name}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              {backendLabel(workspace.backend)} · updated {relTime(workspace.updated_at)}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] ${runningCount > 0 ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"}`}>
            {runningCount > 0 && <StatusIndicator status="running" size="xs" />}
            {agents.length}
          </span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onNewAgent();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-accent)]"
            title="New agent in workspace"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {latestAgent && (
        <div className="mt-2 border-t border-[var(--glass-border)] pt-2">
          <button
            onClick={() => onSelectWorkspace(workspace.id)}
            className="w-full rounded-[var(--radius-xs)] px-2 py-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)]"
          >
            <p className="truncate text-[12px] text-[var(--text-muted)]">Latest agent</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--text-primary)]">{latestAgent.label}</p>
          </button>
        </div>
      )}
    </div>
  );
});


/* ═══════════════════════════════════════════════════════════════════════
   Workspace Sidebar — inside an entered workspace
   ═══════════════════════════════════════════════════════════════════════ */

interface WorkspaceSidebarProps {
  workspace: Workspace | null;
  onExit: () => void;
  agents: AgentInstance[];
  focusedAgentId: string | null;
  onFocusAgent: (id: string) => void;
  onNewAgent: () => void;
  onRemoveAgent: (id: string) => void;
  onManageWorkspace: () => void;
  onManageAgent: (id: string) => void;
  connected: boolean;
  githubAuthenticated: boolean;
}

function WorkspaceSidebar({
  workspace,
  onExit,
  agents,
  focusedAgentId,
  onFocusAgent,
  onNewAgent,
  onRemoveAgent,
  onManageWorkspace,
  onManageAgent,
  connected,
  githubAuthenticated,
}: WorkspaceSidebarProps) {
  const [agentQuery, setAgentQuery] = useState("");
  const workspaceAgents = workspace
    ? agents.filter((a) => a.workspaceId === workspace.id)
    : [];
  const runningCount = workspaceAgents.filter((a) => a.status === "running").length;
  const errorCount = workspaceAgents.filter((a) => a.status === "error").length;
  const sortedAgents = [...workspaceAgents].sort((left, right) => {
    const rank = (status: AgentInstance["status"]): number => {
      if (status === "running") return 0;
      if (status === "error") return 1;
      if (status === "complete") return 2;
      return 3;
    };
    return rank(left.status) - rank(right.status);
  });

  const normalizedQuery = agentQuery.trim().toLowerCase();
  const visibleAgents = normalizedQuery.length > 0
    ? sortedAgents.filter((agent) => {
      const haystack = `${agent.label} ${agent.branch ?? ""} ${agent.currentActivity ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    : sortedAgents;

  return (
    <>
      <div className="border-b border-[var(--glass-border)] px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
            title="Back to workspaces"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspace</span>
        </div>

        {workspace && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--surface-card)]/70 px-3 py-3">
            <div className="flex items-start gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] font-display text-[14px] font-semibold text-[var(--color-accent-ink)]">
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[17px] leading-tight text-[var(--text-primary)]">{workspace.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{workspace.repo_path}</p>
              </div>
              <button
                onClick={onManageWorkspace}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
                title="Workspace settings"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                {backendLabel(workspace.backend)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                {workspace.branch ?? "default"}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${connected ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]" : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"}`}>
                <StatusIndicator status={connected ? "complete" : "idle"} size="xs" />
                {connected ? "connected" : "idle"}
              </span>
              {githubAuthenticated && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                  GitHub linked
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Agents</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {runningCount > 0 ? `${runningCount} running` : `${workspaceAgents.length} total`}
              {errorCount > 0 ? ` · ${errorCount} with issues` : ""}
            </p>
          </div>
          <button
            onClick={onNewAgent}
            className="inline-flex h-9 items-center gap-1.5 rounded-full btn-accent px-4 text-[12px] font-semibold"
            title="New agent"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Agent
          </button>
        </div>

        <div className="px-3 pb-2">
          <input
            value={agentQuery}
            onChange={(event) => setAgentQuery(event.target.value)}
            placeholder="Filter agents"
            className="glass-input h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          <div className="space-y-1">
            {visibleAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={focusedAgentId === agent.id}
                onClick={() => onFocusAgent(agent.id)}
                onRemove={() => onRemoveAgent(agent.id)}
                onManage={() => onManageAgent(agent.id)}
              />
            ))}
            {workspaceAgents.length === 0 && (
              <div className="px-3 py-12 text-center">
                <p className="font-display text-[17px] font-medium text-[var(--text-primary)]">No agents yet</p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                  Start with one agent. It gets its own branch and worktree.
                </p>
                <button
                  onClick={onNewAgent}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full btn-accent px-5 text-[13px] font-medium"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create agent
                </button>
              </div>
            )}
            {workspaceAgents.length > 0 && visibleAgents.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="font-display text-[16px] font-medium text-[var(--text-primary)]">No matches</p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">Try another agent keyword.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
