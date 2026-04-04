import { useEffect, useState } from "react";
import { commands, type Conversation, type GitHubAuthStatus, type OpenCodeConnection, type ProcessOutput, type RepoSlug, type Workspace } from "../lib/bindings";
import type { AgentInstance } from "../lib/types";
import { backendLabel, executionTargetLabel, relTime } from "../lib/ui";
import { GlassSelect } from "./GlassSelect";
import { ActivityChart } from "./ActivityChart";
import { GitHubTab } from "./GitHubTab";

type Tab = "overview" | "agents" | "logs" | "github";



function statusText(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working...";
  if (agent.status === "complete" && agent.finishedAt) return `Completed ${relTime(agent.finishedAt)}`;
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

interface WorkspaceViewProps {
  workspace: Workspace;
  conversations: Conversation[];
  connection: OpenCodeConnection | null;
  processOutput: ProcessOutput[];
  gitStatus: string;
  gitDiffStat: string;
  agents: AgentInstance[];
  onSelectConversation: (id: string) => void;
  onStartOpenCode: () => void;
  onStopOpenCode: () => void;
  onNewAgent: () => void;
  onFocusAgent: (id: string) => void;
  onManageAgent: (id: string) => void;
  onWorkspaceBranchChange: (branch: string) => Promise<void>;
  loading: boolean;
  githubAuthStatus: GitHubAuthStatus | null;
  githubSlug: RepoSlug | null;
  onNavigateToSettings: () => void;
  onGitHubSlugChange: (slug: RepoSlug) => void;
}

export function WorkspaceView({
  workspace,
  conversations,
  connection,
  processOutput,
  gitStatus,
  gitDiffStat,
  agents,
  onSelectConversation,
  onStartOpenCode,
  onStopOpenCode,
  onNewAgent,
  onFocusAgent,
  onManageAgent,
  onWorkspaceBranchChange,
  loading,
  githubAuthStatus,
  githubSlug,
  onNavigateToSettings,
  onGitHubSlugChange,
}: WorkspaceViewProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [branchOptions, setBranchOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [branchDraft, setBranchDraft] = useState(workspace.branch ?? "");
  const [branchBusy, setBranchBusy] = useState(false);
  const runningCount = agents.filter((a) => a.status === "running").length;

  useEffect(() => {
    setBranchDraft(workspace.branch ?? "");
  }, [workspace.branch, workspace.id]);

  useEffect(() => {
    let alive = true;
    void commands.gitListBranches(workspace.repo_path)
      .then((branches) => {
        if (!alive) return;
        setBranchOptions(branches.filter((branch) => !branch.is_remote).map((branch) => ({
          value: branch.name,
          label: `${branch.name}${branch.is_current ? " (current)" : ""}`,
        })));
      })
      .catch(() => {
        if (alive) setBranchOptions([]);
      });
    return () => { alive = false; };
  }, [workspace.repo_path]);

  async function handleBranchChange(nextBranch: string) {
    setBranchDraft(nextBranch);
    setBranchBusy(true);
    try {
      await onWorkspaceBranchChange(nextBranch);
    } finally {
      setBranchBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-[var(--color-accent-ink)]"
              style={{
                background: "var(--color-accent)",
                boxShadow: "var(--shadow-glow-accent)",
              }}
            >
              {workspace.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                {workspace.name}
              </h1>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                {backendLabel(workspace.backend)} · {executionTargetLabel(workspace.execution_target)} · {workspace.repo_path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onNewAgent}
              disabled={loading}
              className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-50"
            >
              New agent
            </button>
            {connection ? (
              <button
                onClick={onStopOpenCode}
                disabled={loading}
                className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={onStartOpenCode}
                disabled={loading || workspace.backend !== "opencode"}
                className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
              >
                Start
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(["overview", "agents", "github", "logs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-xl text-[11px] font-semibold capitalize transition-all ${
                tab === t
                  ? "btn-ink"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t}
              {t === "agents" && agents.length > 0 && (
                <span className="ml-1.5 text-[9px] opacity-70">{agents.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Activity chart — above tab content */}
      <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)]">
        <ActivityChart agents={agents} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4" style={{ minHeight: 0 }}>
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {/* Runtime card */}
            <section className="rounded-3xl glass-card-static p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Runtime</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  connection ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]" : "bg-[var(--surface-ink-5)] text-[var(--text-muted)]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connection ? "bg-[var(--color-success)]" : "bg-[var(--scrollbar-thumb)]"}`} />
                  {connection ? "connected" : "stopped"}
                </span>
              </div>
              <dl className="space-y-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Backend</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{backendLabel(workspace.backend)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Target</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{executionTargetLabel(workspace.execution_target)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Repository</dt>
                  <dd className="font-medium text-[var(--text-primary)] truncate font-mono text-[11px]">{workspace.repo_path}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Default branch</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{workspace.branch ?? "current repo branch"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Updated</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{relTime(workspace.updated_at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Agents</dt>
                  <dd className="font-medium text-[var(--text-primary)]">
                    {agents.length}{runningCount > 0 && <span className="text-[var(--color-accent)] ml-1">({runningCount} running)</span>}
                  </dd>
                </div>
              </dl>
              {connection && (
                <div className="mt-4 rounded-2xl bg-[var(--surface-ink-3)] p-3 text-[11px] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">OpenCode endpoint</p>
                  <p className="mt-1 break-all font-mono">{connection.base_url}</p>
                </div>
              )}
              <div className="mt-4 rounded-2xl bg-[var(--surface-ink-3)] p-3 text-[11px] text-[var(--text-secondary)]">
                <p className="font-semibold text-[var(--text-primary)]">Change default branch</p>
                {branchOptions.length > 0 ? (
                  <GlassSelect
                    value={branchDraft}
                    onChange={(value) => { void handleBranchChange(value); }}
                    options={branchOptions}
                    className="mt-2"
                  />
                ) : (
                  <p className="mt-1 font-mono">{workspace.branch ?? "current repo branch"}</p>
                )}
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  New agents use this as their base branch.{branchBusy ? " Saving..." : ""}
                </p>
              </div>
            </section>

            {/* Git snapshot — main repo */}
            <section className="rounded-3xl glass-card-static p-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Git snapshot (main repo)</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">Status</p>
                  <pre className="rounded-2xl bg-[var(--surface-ink-4)] p-3 text-[11px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                    {gitStatus || "Working tree clean"}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">Diff stat</p>
                  <pre className="rounded-2xl bg-[var(--surface-ink-4)] p-3 text-[11px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                    {gitDiffStat || "No diff"}
                  </pre>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "agents" && (
          <div className="space-y-3">
            {agents.map((agent) => {
              return (
                <div
                  key={agent.id}
                  className="rounded-2xl glass-card p-4 transition-all duration-200 hover:shadow-[var(--shadow-glass-sm)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {agent.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${agent.status === "error" ? "text-[var(--color-danger-text-light)]" : "text-[var(--text-muted)]"} truncate`}>
                          {agent.status === "running" && agent.currentActivity ? agent.currentActivity : agent.status === "running" ? "Working..." : agent.status === "complete" ? "Done" : agent.status === "error" ? (agent.errorMessage ?? "Error") : "Idle"}
                        </span>
                        {agent.branch && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                            {agent.branch}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onFocusAgent(agent.id)}
                        className="h-7 px-2.5 rounded-xl btn-glass text-[10px] font-semibold"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => onManageAgent(agent.id)}
                        className="h-7 w-7 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
                        title="Agent settings"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Status / activity line */}
                  <p className={`text-[10px] mt-2 ml-12 truncate ${
                    agent.status === "error" ? "text-[var(--color-danger-text-light)]" : "text-[var(--text-muted)]"
                  }`}>
                    {statusText(agent)}
                  </p>

                  {agent.worktreePath && (
                    <p className="text-[10px] font-mono text-[var(--text-muted)] opacity-75 mt-1 ml-12 truncate">
                      {agent.worktreePath}
                    </p>
                  )}

                  {/* Elapsed time for running agents */}
                  {agent.status === "running" && agent.startedAt && (
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 ml-12 tabular-nums">
                      Started {relTime(agent.startedAt)}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Conversation list as secondary section */}
            {conversations.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2 px-1">
                  Conversations
                </h3>
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => onSelectConversation(conversation.id)}
                    className="w-full rounded-2xl glass-card p-3 text-left mb-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                          {conversation.title ?? "Untitled conversation"}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          {backendLabel(conversation.backend)}{conversation.is_active ? " · active" : ""}
                        </p>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{relTime(conversation.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {agents.length === 0 && conversations.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-[var(--text-secondary)]">No agents yet</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
                  Create an agent to start working. Each agent gets its own worktree so it can work on a separate branch.
                </p>
                <button
                  onClick={onNewAgent}
                  disabled={loading}
                  className="mt-4 h-8 px-4 rounded-2xl btn-ink text-[12px] font-semibold disabled:opacity-50"
                >
                  Create first agent
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "github" && (
          <GitHubTab
            authStatus={githubAuthStatus}
            slug={githubSlug}
            repoPath={workspace.worktree_path ?? workspace.repo_path}
            onNavigateToSettings={onNavigateToSettings}
            onSlugChange={onGitHubSlugChange}
          />
        )}

        {tab === "logs" && (
          <div className="rounded-3xl bg-[var(--log-bg)] text-[var(--text-inverse)] p-4 min-h-[420px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--scrollbar-thumb)] mb-3">
              Process Output
            </div>
            <div className="space-y-1 font-mono text-[11px] leading-5">
              {processOutput.map((line, index) => (
                <div key={`${line.process_id}-${index}`} className="break-words">
                  <span className={line.stream === "stderr" ? "text-[var(--log-stderr)]" : "text-[var(--log-stdout)]"}>
                    [{line.stream}]
                  </span>{" "}
                  <span>{line.line}</span>
                </div>
              ))}
              {processOutput.length === 0 && (
                <div className="text-[var(--scrollbar-thumb)]">No process output yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
