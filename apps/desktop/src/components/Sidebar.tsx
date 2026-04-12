import React, { memo, useState, useEffect } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import type { Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { backendLabel, relTime } from "../lib/ui";
import type { AgentInstance, InteractionMode, LocalChatConversation, WorkHomeView } from "../lib/types";
import type { ThemeMode } from "./SettingsPanel";
import { AgentCard } from "./AgentCard";
import { usePluginTabs } from "../hooks/usePluginTabs";
import { usePluginScripts } from "../hooks/usePluginScripts";
import type { PluginEntry } from "../lib/bindings";


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
    <div className="shrink-0 px-3 pt-3 pb-2">
      <div
        className="relative flex gap-0.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-[3px]"
      >
        {modes.map(({ id, label, icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              onClick={() => onSwitch(id)}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-[7px] font-sans text-[11px] font-medium tracking-[0.02em] transition-colors duration-[var(--duration-base)] ${
                active
                  ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <svg
                className="h-3 w-3 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span className="uppercase tracking-[0.14em]">{label}</span>
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
  /** Which plugin tab is active in the chat sidebar (null = built-in Chats) */
  activePluginTab: string | null;
  onSetPluginTab: (key: string | null) => void;

  // Work mode — home props
  workView: WorkHomeView | "workspace";
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onNavigateWork: (v: WorkHomeView) => void;
  onNewWorkspace: () => void;
  onNewAgentForWorkspace: (workspaceId: string) => void;
  onFocusAgentFromHome: (workspaceId: string, agentId: string) => void;
  agents: AgentInstance[];

  // Work mode — workspace props
  activeWorkspace: Workspace | null;
  onExitWorkspace: () => void;
  focusedAgentId: string | null;
  onFocusAgent: (id: string) => void;
  onNewAgent: () => void;
  onRemoveAgent: (id: string) => void;
  onManageWorkspace: () => void;
  onManageAgent: (id: string) => void;
  activeWorkspaceConnected: boolean;
  githubAuthenticated: boolean;

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
  activePluginTab,
  onSetPluginTab,
  workView,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNavigateWork,
  onNewWorkspace,
  onNewAgentForWorkspace,
  onFocusAgentFromHome,
  agents,
  activeWorkspace,
  onExitWorkspace,
  focusedAgentId,
  onFocusAgent,
  onNewAgent,
  onRemoveAgent,
  onManageWorkspace,
  onManageAgent,
  activeWorkspaceConnected,
  githubAuthenticated,
  themeMode,
  onToggleTheme,
  onOpenSettings,
  showSettings,
}: SidebarProps) {
  return (
    <aside className="relative z-50 w-[286px] shrink-0 py-3 pl-3">
      {/* Panel shell — quieter, one border, less blur */}
      <div className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--surface-card)] shadow-[var(--shadow-glass-sm)] backdrop-blur-xl">
        {/* Mode switcher at top */}
        <ModeSwitcher mode={mode} onSwitch={onSwitchMode} />

        {/* Mode-specific content */}
        {mode === "chat" ? (
          <ChatSidebar
            conversations={chatConversations}
            activeChatId={activeChatId}
            onSelectChat={onSelectChat}
            onNewChat={onNewChat}
            onDeleteChat={onDeleteChat}
            activePluginTab={activePluginTab}
            onSetPluginTab={onSetPluginTab}
          />
        ) : workView === "workspace" ? (
          <WorkspaceSidebar
            workspace={activeWorkspace}
            onExit={onExitWorkspace}
            agents={agents}
            focusedAgentId={focusedAgentId}
            onFocusAgent={onFocusAgent}
            onNewAgent={onNewAgent}
            onRemoveAgent={onRemoveAgent}
            onManageWorkspace={onManageWorkspace}
            onManageAgent={onManageAgent}
            connected={activeWorkspaceConnected}
            githubAuthenticated={githubAuthenticated}
          />
        ) : (
          <WorkHomeSidebar
            workspaces={workspaces}
            agents={agents}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            onFocusAgentFromHome={onFocusAgentFromHome}
            currentView={workView}
            onNavigate={onNavigateWork}
            onNewWorkspace={onNewWorkspace}
            onNewAgent={onNewAgentForWorkspace}
            activeWorkspaceConnected={activeWorkspaceConnected}
          />
        )}

        {/* Footer: logo + settings + theme toggle — flat, no nested card */}
        <div className="mt-auto shrink-0 border-t border-[var(--glass-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="logo-adaptive flex items-center gap-2 text-[var(--text-primary)]">
              <div className="h-5 w-5 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                <KhadimLogo />
              </div>
              <span className="font-display text-[14px] font-medium tracking-tight">Khadim</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={onOpenSettings}
                className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] ${
                  showSettings
                    ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
                }`}
                title="Settings"
              >
                <svg className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={1.8} />
                </svg>
              </button>
              <button
                onClick={onToggleTheme}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
                title={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {themeMode === "dark" ? (
                  <svg className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="4" />
                    <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
                  </svg>
                ) : (
                  <svg className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
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
  /** Controlled from outside so App.tsx can switch content area too */
  activePluginTab: string | null;
  onSetPluginTab: (tabKey: string | null) => void;
}

function ChatSidebar({
  conversations,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  activePluginTab,
  onSetPluginTab,
}: ChatSidebarProps) {
  const pluginTabs = usePluginTabs();

  // Collect all plugin entries that have a ui_js so we can inject scripts
  const [allPlugins, setAllPlugins] = useState<PluginEntry[]>([]);
  useEffect(() => {
    commands.pluginList().then(setAllPlugins);
  }, []);
  usePluginScripts(allPlugins);

  const activeTabEntry = pluginTabs.find(
    (t) => `${t.pluginId}:${t.tab.label}` === activePluginTab
  ) ?? null;

  return (
    <>
      {/* Header — small uppercase label, not a chunky title */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          {activeTabEntry ? activeTabEntry.tab.label : "Conversations"}
        </span>
        {!activeTabEntry && (
          <button
            onClick={onNewChat}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--color-accent)]"
            title="New chat"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Plugin tab strip — only shown when plugins register tabs */}
      {pluginTabs.length > 0 && (
        <div className="shrink-0 flex items-center gap-0.5 overflow-x-auto scrollbar-none px-3 pb-2">
          {/* Built-in "Chats" tab */}
          <button
            onClick={() => onSetPluginTab(null)}
            title="Chats"
            className={`flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 font-sans text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
              activePluginTab === null
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            Chats
          </button>

          {/* Plugin tabs */}
          {pluginTabs.map((entry) => {
            const key = `${entry.pluginId}:${entry.tab.label}`;
            const active = activePluginTab === key;
            return (
              <button
                key={key}
                onClick={() => onSetPluginTab(active ? null : key)}
                title={entry.tab.label}
                className={`flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 font-sans text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
                  active
                    ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
                }`}
              >
                <PluginTabIcon icon={entry.tab.icon} />
                {entry.tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content: plugin sidebar element OR built-in chats list */}
      {activeTabEntry && activeTabEntry.tab.sidebar_element ? (
        <div className="flex-1 overflow-hidden min-h-0" style={{ display: "flex", flexDirection: "column" }}>
          {/* Render the plugin's custom element — it owns this div fully */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(React as any).createElement(activeTabEntry.tab.sidebar_element, {
            "data-plugin-id": activeTabEntry.pluginId,
            style: { flex: 1, minHeight: 0, width: "100%" },
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
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
            {conversations.length === 0 && (
              <div className="px-2 py-12 text-center">
                <p className="font-display text-[15px] font-medium text-[var(--text-primary)]">
                  Nothing here yet
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
                  Start a conversation — your chats will<br />appear in this list.
                </p>
                <button
                  onClick={onNewChat}
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full btn-accent px-4 font-sans text-[11px] font-medium tracking-wide"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspaces</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{workspaces.length} total</p>
        </div>
        <button
          onClick={onNewWorkspace}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--color-accent)]"
          title="New workspace"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
            className="glass-input h-8 w-full rounded-[var(--radius-sm)] px-2.5 text-[11px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          {workspaces.length === 0 ? (
            <div className="px-2 py-12 text-center">
              <p className="font-display text-[15px] font-medium text-[var(--text-primary)]">
                No workspaces
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
                Open a project to start working<br />with agents in a branch.
              </p>
              <button
                onClick={onNewWorkspace}
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full btn-accent px-4 font-sans text-[11px] font-medium tracking-wide"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New workspace
              </button>
            </div>
          ) : visibleWorkspaces.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <p className="font-display text-[15px] font-medium text-[var(--text-primary)]">
                No matches
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">Try another workspace keyword.</p>
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
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] font-display text-[13px] font-semibold ${
              isSelected
                ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                : "bg-[var(--glass-bg)] text-[var(--text-primary)]"
            }`}
          >
            {workspace.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[13px] font-medium ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"}`}>
              {workspace.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
              {backendLabel(workspace.backend)} · updated {relTime(workspace.updated_at)}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] ${runningCount > 0 ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"}`}>
            {runningCount > 0 && <span className="h-1 w-1 rounded-full bg-[var(--color-accent)] animate-pulse" />}
            {agents.length}
          </span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onNewAgent();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-accent)]"
            title="New agent in workspace"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
            <p className="truncate text-[10px] text-[var(--text-muted)]">Latest agent</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-primary)]">{latestAgent.label}</p>
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
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
            title="Back to workspaces"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspace</span>
        </div>

        {workspace && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--surface-card)]/70 px-3 py-3">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] font-display text-[13px] font-semibold text-[var(--color-accent-ink)]">
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[16px] leading-tight text-[var(--text-primary)]">{workspace.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{workspace.repo_path}</p>
              </div>
              <button
                onClick={onManageWorkspace}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
                title="Workspace settings"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)]">
                {backendLabel(workspace.backend)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                {workspace.branch ?? "default"}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] ${connected ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]" : "bg-[var(--surface-ink-4)] text-[var(--text-muted)]"}`}>
                <span className={`h-1 w-1 rounded-full ${connected ? "bg-[var(--color-success)]" : "bg-[var(--scrollbar-thumb)]"}`} />
                {connected ? "connected" : "idle"}
              </span>
              {githubAuthenticated && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-ink-4)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
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
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Agents</p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {runningCount > 0 ? `${runningCount} running` : `${workspaceAgents.length} total`}
              {errorCount > 0 ? ` · ${errorCount} with issues` : ""}
            </p>
          </div>
          <button
            onClick={onNewAgent}
            className="inline-flex h-7 items-center gap-1 rounded-full btn-accent px-3 text-[10px] font-semibold"
            title="New agent"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
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
            className="glass-input h-8 w-full rounded-[var(--radius-sm)] px-2.5 text-[11px]"
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
                <p className="font-display text-[16px] font-medium text-[var(--text-primary)]">No agents yet</p>
                <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
                  Start with one agent. It gets its own branch and worktree.
                </p>
                <button
                  onClick={onNewAgent}
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full btn-accent px-4 text-[11px] font-medium"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create agent
                </button>
              </div>
            )}
            {workspaceAgents.length > 0 && visibleAgents.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="font-display text-[15px] font-medium text-[var(--text-primary)]">No matches</p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Try another agent keyword.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
