import KhadimLogo from "../assets/Khadim-logo.svg";
import type { Workspace } from "../lib/bindings";
import { backendLabel, executionTargetLabel } from "../lib/ui";
import type { AgentInstance, AppMode, NavView } from "../lib/types";
import { AgentCard } from "./AgentCard";

/* ─── Helpers ──────────────────────────────────────────────────────── */

/** Deterministic hue from a string — used for agent avatar colors */
function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

/* ─── Sidebar ──────────────────────────────────────────────────────── */

interface SidebarProps {
  appMode: AppMode;
  // Home mode props
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  currentView: NavView;
  onNavigate: (v: NavView) => void;
  onNewWorkspace: () => void;
  // Workspace mode props
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
}

export function Sidebar({
  appMode,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  currentView,
  onNavigate,
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
}: SidebarProps) {
  return (
    <aside
      className="relative z-50 shrink-0 w-[280px] py-3.5 pl-3.5"
    >
      {/* Glass shell */}
      <div className="relative h-full glass-panel-strong flex flex-col rounded-2xl overflow-hidden border border-[var(--glass-border-strong)]">
        {appMode === "home" ? (
          <HomeSidebar
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            currentView={currentView}
            onNavigate={onNavigate}
            onNewWorkspace={onNewWorkspace}
            activeWorkspaceConnected={activeWorkspaceConnected}
          />
        ) : (
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
            hashHue={hashHue}
          />
        )}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Home Sidebar
   ═══════════════════════════════════════════════════════════════════════ */

interface HomeSidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  currentView: NavView;
  onNavigate: (v: NavView) => void;
  onNewWorkspace: () => void;
  activeWorkspaceConnected: boolean;
}

function HomeSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  currentView,
  onNavigate,
  onNewWorkspace,
  activeWorkspaceConnected,
}: HomeSidebarProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--glass-border)]">
        <div className="shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full w-7 h-7">
          <KhadimLogo />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
          Khadim
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 border-b border-[var(--glass-border)] p-2">
        {([
          { id: "workspaces" as const, label: "Workspaces", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
          { id: "chat" as const, label: "Chat", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
          { id: "settings" as const, label: "Settings", icon: "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" },
        ]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 ${
              currentView === id
                ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            }`}
          >
            <svg className="w-[15px] h-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              {id === "settings" && <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={1.8} />}
            </svg>
            <span className="text-[12px] font-semibold">{label}</span>
            {id === "chat" && activeWorkspaceConnected && (
              <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-[var(--color-success-text)] bg-[var(--color-success-muted)] rounded-full px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                live
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Workspace list */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Workspaces
          </span>
          <button
            onClick={onNewWorkspace}
            className="h-5 w-5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            title="New workspace"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2">
          <div className="flex flex-col gap-0.5">
            {workspaces.map((ws) => {
              const selected = ws.id === selectedWorkspaceId;
              return (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${
                    selected
                      ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    selected ? "bg-[var(--surface-white-15)]" : "bg-[var(--glass-bg)]"
                  }`}>
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate leading-tight">{ws.name}</p>
                    <p className={`text-[10px] mt-0.5 truncate ${selected ? "text-[var(--surface-white-50)]" : "text-[var(--text-muted)]"}`}>
                      {backendLabel(ws.backend)} · {executionTargetLabel(ws.execution_target)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Workspace Sidebar
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
  hashHue: (s: string) => number;
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
  hashHue,
}: WorkspaceSidebarProps) {
  const runningCount = agents.filter((a) => a.status === "running").length;

  /* ── Expanded state ───────────────────────────────────────────── */
  return (
    <>
      {/* Back bar */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <button
          onClick={onExit}
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Back to home"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Workspace
        </span>
      </div>

      {/* Workspace card */}
      {workspace && (
        <div className="px-2 pb-2">
          <button
            onClick={onManageWorkspace}
            className="group/ws w-full text-left rounded-xl p-2.5 transition-all duration-200 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] hover:border-[var(--glass-border-strong)] hover:shadow-[var(--shadow-glass-sm)]"
          >
            <div className="flex items-center gap-2.5">
              {/* Monogram */}
              <div
                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-[var(--color-accent-ink)]"
                style={{
                  background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))",
                  boxShadow: "0 3px 10px -3px rgba(169, 191, 0, 0.45)",
                }}
              >
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-[var(--text-primary)] truncate leading-tight">
                  {workspace.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                    {workspace.branch ?? "main"}
                  </span>
                  <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${connected ? "bg-[var(--color-success)] animate-pulse" : "bg-[var(--scrollbar-thumb)]"}`} />
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
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
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
            className="h-5 w-5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
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
                hue={hashHue(agent.id)}
                onClick={() => onFocusAgent(agent.id)}
                onRemove={() => onRemoveAgent(agent.id)}
                onManage={() => onManageAgent(agent.id)}
              />
            ))}
            {agents.length === 0 && (
              <div className="py-10 text-center">
                <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
                  <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-[11px] font-medium text-[var(--text-secondary)]">No agents yet</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Each agent works in its own branch
                </p>
                <button
                  onClick={onNewAgent}
                  className="mt-3 h-7 px-3 rounded-lg btn-ink text-[10px] font-semibold"
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
