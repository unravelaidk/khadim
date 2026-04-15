import React, { memo, useState, useEffect } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import { AsciiEmptyState, AsciiDivider } from "./shared/AsciiArt";
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
          <i className="ri-arrow-down-s-line text-[10px] leading-none text-[var(--text-muted)]" />
        </span>
      </div>
      {mode === "chat" && (
        <button
          onClick={onNewChat}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          title="New chat"
          aria-label="New chat"
        >
          <i className="ri-edit-line text-[16px] leading-none" />
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
      icon: "ri-chat-1-line",
    },
    {
      id: "work",
      label: "Work",
      icon: "ri-apps-2-line",
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
              <i className={`${icon} text-[14px] leading-none shrink-0`} />
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
            <i className="ri-flashlight-line text-[14px] leading-none" />
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
            <i className="ri-sun-line text-[14px] leading-none" />
          ) : (
            <i className="ri-moon-line text-[15px] leading-none" />
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
          <i className="ri-more-2-line text-[14px] leading-none" />
        </button>
      </div>
    </aside>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Chat Sidebar — standalone LLM conversations
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Plugin Tab Strip ─────────────────────────────────────────────── */

/** Icon map: icon name from plugin.toml → remixicon class */
function PluginTabIcon({ icon }: { icon: string | null }) {
  const iconMap: Record<string, string> = {
    calendar: "ri-calendar-line",
    notes: "ri-file-text-line",
    tasks: "ri-task-line",
    search: "ri-search-line",
    settings: "ri-settings-3-line",
    bookmark: "ri-bookmark-line",
    chart: "ri-bar-chart-line",
    clock: "ri-time-line",
    timer: "ri-timer-line",
    grid: "ri-grid-line",
    puzzle: "ri-puzzle-line",
  };
  const cls = icon && iconMap[icon] ? iconMap[icon] : "ri-menu-line";
  return <i className={`${cls} text-[16px] leading-none shrink-0`} />;
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
  home:    "ri-home-4-line",
  chats:   "ri-chat-1-line",
  memory:  "ri-book-open-line",
  agents:  "ri-settings-3-line",
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
        <i
          className={`${icon} text-[17px] leading-none shrink-0 ${active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
        />
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
                <i className="ri-add-line text-[14px] leading-none" />
              </button>
            </div>

            {conversations.length === 0 ? (
              <AsciiEmptyState
                type="noChats"
                message="Start a conversation to see it here."
                className="px-3"
              />
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
        <i className="ri-delete-bin-line text-[14px] leading-none" />
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
          <i className="ri-add-line text-[16px] leading-none" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pb-2">
          <input
            value={workspaceQuery}
            onChange={(event) => setWorkspaceQuery(event.target.value)}
            placeholder="Filter workspaces"
            className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          {workspaces.length === 0 ? (
            <div className="px-2 py-12 text-center">
              <AsciiEmptyState type="noAgents" />
              <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                Open a project to start working<br />with agents in a branch.
              </p>
              <button
                onClick={onNewWorkspace}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-full btn-ink px-5 font-sans text-[13px] font-medium tracking-wide"
              >
                <i className="ri-add-line text-[14px] leading-none" />
                New workspace
              </button>
            </div>
          ) : visibleWorkspaces.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <AsciiEmptyState type="noResults" message="Try another workspace keyword." />
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
            <i className="ri-add-line text-[14px] leading-none" />
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
            <i className="ri-arrow-left-s-line text-[16px] leading-none" />
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
                <i className="ri-settings-3-line text-[16px] leading-none" />
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
            className="inline-flex h-9 items-center gap-1.5 rounded-full btn-ink px-4 text-[12px] font-semibold"
            title="New agent"
          >
            <i className="ri-add-line text-[14px] leading-none" />
            Agent
          </button>
        </div>

        <div className="px-3 pb-2">
          <input
            value={agentQuery}
            onChange={(event) => setAgentQuery(event.target.value)}
            placeholder="Filter agents"
            className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
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
                <AsciiEmptyState type="noAgents" message="Start with one agent. It gets its own branch and worktree." />
                <button
                  onClick={onNewAgent}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full btn-ink px-5 text-[13px] font-medium"
                >
                  <i className="ri-add-line text-[14px] leading-none" />
                  Create agent
                </button>
              </div>
            )}
            {workspaceAgents.length > 0 && visibleAgents.length === 0 && (
              <div className="px-3 py-8 text-center">
                <AsciiEmptyState type="noResults" message="Try another agent keyword." />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
