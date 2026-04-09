import { memo, useMemo, useState } from "react";
import type { Environment, RuntimeSession, Workspace } from "../lib/bindings";
import type { AgentInstance } from "../lib/types";
import {
  useCreateEnvironmentMutation,
  useDeleteEnvironmentMutation,
  useEnvironmentsQuery,
  useRuntimeSessionsQuery,
} from "../lib/queries";
import { backendLabel, executionTargetLabel, relTime } from "../lib/ui";
import { GlassSelect } from "./GlassSelect";

interface Props {
  workspace: Workspace;
  agents: AgentInstance[];
  onNewAgentInEnvironment?: (environmentId: string) => void;
}

/**
 * Environments tab — first-class execution contexts inside a workspace.
 *
 * An environment owns: cwd, worktree, sandbox, execution target, backend.
 * A runtime session owns: backend session identity + shared/dedicated flag.
 * Agents (conversations) attach to an environment and a runtime session.
 */
export function EnvironmentsTab({ workspace, agents, onNewAgentInEnvironment }: Props) {
  const { data: environments = [], isLoading } = useEnvironmentsQuery(workspace.id);
  const createMutation = useCreateEnvironmentMutation();
  const deleteMutation = useDeleteEnvironmentMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<"local" | "sandbox">(workspace.execution_target);
  const [branch, setBranch] = useState<string>(workspace.branch ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      await createMutation.mutateAsync({
        workspace_id: workspace.id,
        name: name.trim() || undefined,
        backend: workspace.backend,
        execution_target: target,
        branch: branch.trim() || undefined,
      });
      setName("");
      setBranch(workspace.branch ?? "");
      setTarget(workspace.execution_target);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(env: Environment) {
    if (!confirm(`Delete environment "${env.name}"? This will detach any agents using it.`)) return;
    try {
      await deleteMutation.mutateAsync({ workspaceId: workspace.id, id: env.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Environments</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Durable execution contexts. Agents attach to an environment for cwd, worktree, sandbox, and backend.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="h-7 px-3 rounded-xl btn-ink text-[11px] font-semibold"
        >
          {showCreate ? "Cancel" : "New environment"}
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="rounded-2xl glass-card-static p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. feature-auth"
                className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Execution target</span>
              <GlassSelect
                value={target}
                onChange={(v) => setTarget(v as "local" | "sandbox")}
                options={[
                  { value: "local", label: "Direct" },
                  { value: "sandbox", label: "Sandbox" },
                ]}
                className="mt-1"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Branch (optional)</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={workspace.branch ?? "main"}
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none font-mono"
            />
          </label>
          {error && (
            <p className="text-[11px] text-[var(--color-danger-text-light)]">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setError(null); }}
              className="h-8 px-3 rounded-xl btn-glass text-[11px] font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="h-8 px-4 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create environment"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading && environments.length === 0 && (
        <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">Loading environments…</div>
      )}

      {!isLoading && environments.length === 0 && !showCreate && (
        <div className="py-12 text-center rounded-2xl glass-card-static">
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">No environments yet</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            Create an environment to group agents sharing the same branch, worktree, sandbox, or session.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 h-8 px-4 rounded-2xl btn-ink text-[11px] font-semibold"
          >
            Create first environment
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {environments.map((env) => (
          <EnvironmentCard
            key={env.id}
            env={env}
            agents={agents}
            onDelete={() => void handleDelete(env)}
            onNewAgent={onNewAgentInEnvironment ? () => onNewAgentInEnvironment(env.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Single environment card ─────────────────────────────────────────── */

interface CardProps {
  env: Environment;
  agents: AgentInstance[];
  onDelete: () => void;
  onNewAgent?: () => void;
}

const EnvironmentCard = memo(function EnvironmentCard({ env, agents, onDelete, onNewAgent }: CardProps) {
  const { data: sessions = [] } = useRuntimeSessionsQuery(env.id);

  const attachedAgents = useMemo(
    () => agents.filter((a) => a.worktreePath === env.worktree_path || a.branch === env.branch),
    [agents, env.branch, env.worktree_path],
  );
  const runningCount = attachedAgents.filter((a) => a.status === "running").length;

  return (
    <div className="rounded-2xl glass-card p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{env.name}</p>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {executionTargetLabel(env.execution_target)}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {backendLabel(env.backend)} · updated {relTime(env.updated_at)}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="h-7 w-7 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--color-danger-bg-strong)] hover:text-[var(--color-danger-text-light)] transition-colors shrink-0"
          title="Delete environment"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {env.branch && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)] max-w-[200px] truncate" title={env.branch}>
            {env.branch}
          </span>
        )}
        {env.worktree_path && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]" title={env.worktree_path}>
            worktree
          </span>
        )}
        {env.sandbox_root_path && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]" title={env.sandbox_root_path}>
            sandbox
          </span>
        )}
      </div>

      {/* cwd */}
      <p
        className="text-[10px] font-mono text-[var(--text-muted)] break-all"
        title={env.effective_cwd}
      >
        {env.effective_cwd}
      </p>

      {/* Sessions + agents stats */}
      <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--glass-border)]">
        <span>
          <span className="font-semibold text-[var(--text-secondary)]">{sessions.length}</span> session{sessions.length !== 1 ? "s" : ""}
        </span>
        <span>
          <span className="font-semibold text-[var(--text-secondary)]">{attachedAgents.length}</span> agent{attachedAgents.length !== 1 ? "s" : ""}
        </span>
        {runningCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[var(--color-accent-hover)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            {runningCount} running
          </span>
        )}
        {onNewAgent && (
          <button
            onClick={onNewAgent}
            className="ml-auto h-6 px-2 rounded-lg btn-glass text-[10px] font-semibold"
          >
            New agent
          </button>
        )}
      </div>

      {/* Session list (compact) */}
      {sessions.length > 0 && (
        <div className="space-y-1">
          {sessions.slice(0, 4).map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
          {sessions.length > 4 && (
            <p className="text-[10px] text-[var(--text-muted)] pl-2">+ {sessions.length - 4} more</p>
          )}
        </div>
      )}
    </div>
  );
});

function SessionRow({ session }: { session: RuntimeSession }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-ink-3)] px-2 py-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          session.status === "running" ? "bg-[var(--color-accent)] animate-pulse" : "bg-[var(--scrollbar-thumb)]"
        }`}
      />
      <span className="font-mono text-[10px] text-[var(--text-secondary)] truncate flex-1">
        {session.backend_session_id ?? session.id.slice(0, 8)}
      </span>
      {session.shared && (
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--color-accent)] text-[var(--color-accent-ink)]">
          shared
        </span>
      )}
      <span className="text-[9px] text-[var(--text-muted)]">{session.status}</span>
    </div>
  );
}
