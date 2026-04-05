import { memo } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import type { Workspace } from "../lib/bindings";
import { backendLabel, executionTargetLabel, relTime } from "../lib/ui";
import type { AgentInstance, InteractionMode, LocalChatConversation, WorkHomeView } from "../lib/types";
import type { ThemeMode } from "./SettingsPanel";
import { AgentCard } from "./AgentCard";


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
    <div className="shrink-0 px-2 pt-2.5 pb-1">
      <div className="flex gap-0.5 rounded-2xl bg-[var(--glass-bg)] p-0.5 border border-[var(--glass-border)]">
        {modes.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onSwitch(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all duration-150 ${
              mode === id
                ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <svg
              className="w-3 h-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            {label}
          </button>
        ))}
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

  // Work mode — home props
  workView: WorkHomeView | "workspace";
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onNavigateWork: (v: WorkHomeView) => void;
  onNewWorkspace: () => void;

  // Work mode — workspace props
  activeWorkspace: Workspace | null;
  onExitWorkspace: () => void;
  agents: AgentInstance[];
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
  workView,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNavigateWork,
  onNewWorkspace,
  activeWorkspace,
  onExitWorkspace,
  agents,
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
    <aside className="relative z-50 shrink-0 w-[320px] py-3.5 pl-3.5">
      {/* Glass shell */}
      <div className="relative h-full glass-panel-strong flex flex-col rounded-3xl overflow-hidden border border-[var(--glass-border-strong)]">
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
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            currentView={workView}
            onNavigate={onNavigateWork}
            onNewWorkspace={onNewWorkspace}
            activeWorkspaceConnected={activeWorkspaceConnected}
          />
        )}

        {/* Footer: logo + settings + theme toggle */}
        <div className="shrink-0 mt-auto">
          <div className="mx-2 mb-2 flex items-center justify-between rounded-2xl bg-[var(--surface-elevated)] border border-[var(--glass-border-strong)] px-3 py-2">
            <div className="logo-adaptive flex items-center gap-2.5 text-[var(--text-primary)]">
              <div className="w-6 h-6 [&>svg]:w-full [&>svg]:h-full">
                <KhadimLogo />
              </div>
              <span className="text-[13px] font-bold tracking-tight">Khadim</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenSettings}
                className={`h-8 w-8 flex items-center justify-center rounded-xl transition-all ${
                  showSettings
                    ? "text-[var(--text-primary)] bg-[var(--glass-bg-strong)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                }`}
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={1.8} />
                </svg>
              </button>
              <button
                onClick={onToggleTheme}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all"
                title={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {themeMode === "dark" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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

interface ChatSidebarProps {
  conversations: LocalChatConversation[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
}

function ChatSidebar({
  conversations,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}: ChatSidebarProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
        <span className="text-[14px] font-bold tracking-tight text-[var(--text-primary)]">Chats</span>
        <button
          onClick={onNewChat}
          className="h-6 w-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
          title="New chat"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 py-1.5">
        <div className="flex flex-col gap-0.5">
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
            <div className="py-10 text-center">
              <div className="w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
                <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">No chats yet</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Start a conversation with the AI
              </p>
              <button
                onClick={onNewChat}
                className="mt-3 h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold"
              >
                New chat
              </button>
            </div>
          )}
        </div>
      </div>
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
        className={`w-full flex flex-col gap-0.5 px-3 py-2.5 pr-10 rounded-xl text-left transition-all duration-150 ${
          isSelected
            ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold truncate">{conversation.title}</span>
          <span className={`text-[10px] shrink-0 ${isSelected ? "text-[var(--text-inverse)] opacity-70" : "text-[var(--text-muted)]"}`}>
            {relTime(conversation.updatedAt)}
          </span>
        </div>
        <p className={`text-[11px] truncate ${isSelected ? "text-[var(--text-inverse)] opacity-70" : "text-[var(--text-muted)]"}`}>{preview}</p>
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDeleteChat(conversation.id);
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 h-6 w-6 flex items-center justify-center rounded-lg transition-all duration-150 ${
          isSelected
            ? "text-[var(--text-inverse)] opacity-60 hover:bg-white/10 hover:opacity-100 active:bg-white/20"
            : "text-[var(--text-muted)] hover:bg-[var(--color-danger-muted)] hover:text-[var(--color-danger-text)] active:bg-[var(--color-danger-bg-strong)]"
        }`}
        title="Delete chat"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  currentView: WorkHomeView;
  onNavigate: (v: WorkHomeView) => void;
  onNewWorkspace: () => void;
  activeWorkspaceConnected: boolean;
}

function WorkHomeSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  currentView,
  onNavigate,
  onNewWorkspace,
  activeWorkspaceConnected,
}: WorkHomeSidebarProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-[var(--glass-border)]">
        <span className="text-[14px] font-bold tracking-tight text-[var(--text-primary)]">Work</span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 border-b border-[var(--glass-border)] p-2">
        <button
          onClick={() => onNavigate("workspaces")}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 ${
            currentView === "workspaces"
              ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          <svg className="w-[15px] h-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="text-[13px] font-semibold">Workspaces</span>
        </button>
      </nav>

      {/* Workspace list */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Workspaces
          </span>
          <button
            onClick={onNewWorkspace}
            className="h-5 w-5 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            title="New workspace"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2">
          <div className="flex flex-col gap-0.5">
            {workspaces.map((workspace) => (
              <WorkspaceSidebarItem
                key={workspace.id}
                workspace={workspace}
                isSelected={workspace.id === selectedWorkspaceId}
                onSelectWorkspace={onSelectWorkspace}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const WorkspaceSidebarItem = memo(function WorkspaceSidebarItem({
  workspace,
  isSelected,
  onSelectWorkspace,
}: {
  workspace: Workspace;
  isSelected: boolean;
  onSelectWorkspace: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectWorkspace(workspace.id)}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all duration-150 ${
        isSelected
          ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      <div className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold ${isSelected ? "bg-[var(--surface-white-15)]" : "bg-[var(--glass-bg)]"}`}>
        {workspace.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate leading-tight">{workspace.name}</p>
        <p className={`text-[11px] mt-0.5 truncate ${isSelected ? "text-[var(--text-inverse)] opacity-70" : "text-[var(--text-muted)]"}`}>
          {backendLabel(workspace.backend)} · {executionTargetLabel(workspace.execution_target)}
        </p>
      </div>
    </button>
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
  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <>
      {/* Back bar */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <button
          onClick={onExit}
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Back to home"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Workspace
        </span>
      </div>

      {/* Workspace card */}
      {workspace && (
        <div className="px-2 pb-2">
          <button
            onClick={onManageWorkspace}
            className="group/ws w-full text-left rounded-2xl p-2.5 transition-all duration-200 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] hover:border-[var(--glass-border-strong)] hover:shadow-[var(--shadow-glass-sm)]"
          >
            <div className="flex items-center gap-2.5">
              {/* Monogram */}
              <div
                className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-[11px] font-extrabold bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--glass-border-strong)]"
              >
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[var(--text-primary)] truncate leading-tight">
                  {workspace.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                    {workspace.branch ?? "default branch"}
                  </span>
                  <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${connected ? "bg-[var(--color-success)] animate-pulse" : "bg-[var(--scrollbar-thumb)]"}`} />
                  {githubAuthenticated && (
                    <svg className="w-3 h-3 shrink-0 text-[var(--text-muted)]" viewBox="0 0 16 16" fill="currentColor" aria-label="GitHub connected">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                  )}
                </div>
              </div>
              <svg
                className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] opacity-0 group-hover/ws:opacity-50 transition-opacity duration-150"
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {/* Agents section */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 pt-1 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Agents
            </span>
            {runningCount > 0 && (
              <span className="text-[8px] font-bold text-[var(--color-accent-ink)] bg-[var(--color-accent)] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {runningCount}
              </span>
            )}
          </div>
          <button
            onClick={onNewAgent}
            className="h-5 w-5 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            title="New agent"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2">
          <div className="flex flex-col gap-1">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={focusedAgentId === agent.id}
                onClick={() => onFocusAgent(agent.id)}
                onRemove={() => onRemoveAgent(agent.id)}
                onManage={() => onManageAgent(agent.id)}
              />
            ))}
            {agents.length === 0 && (
              <div className="py-10 text-center">
                <div className="w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
                  <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">No agents yet</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Each agent works in its own branch
                </p>
                <button
                  onClick={onNewAgent}
                  className="mt-3 h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold"
                >
                  Create agent
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
