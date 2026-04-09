import { memo, useEffect, useState } from "react";
import type { Environment, RuntimeSession, Workspace } from "../lib/bindings";
import {
  useCreateEnvironmentMutation,
  useDeleteEnvironmentMutation,
  useEnvironmentsQuery,
  useRuntimeSessionsQuery,
  useUpdateEnvironmentMutation,
} from "../lib/queries";
import { backendLabel, environmentSubstrateLabel, relTime } from "../lib/ui";
import { GlassSelect } from "./GlassSelect";

interface Props {
  workspace: Workspace;
}

/**
 * Environments tab — first-class isolation profiles inside a workspace.
 */
export function EnvironmentsTab({ workspace }: Props) {
  const { data: environments = [], isLoading } = useEnvironmentsQuery(workspace.id);
  const createMutation = useCreateEnvironmentMutation();
  const updateMutation = useUpdateEnvironmentMutation();
  const deleteMutation = useDeleteEnvironmentMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [substrate, setSubstrate] = useState<"local" | "docker" | "remote">("local");
  const [wasmEnabled, setWasmEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);

  useEffect(() => {
    if (environments.length === 0) {
      setSelectedEnvironmentId(null);
      return;
    }
    if (!selectedEnvironmentId || !environments.some((env) => env.id === selectedEnvironmentId)) {
      setSelectedEnvironmentId(environments[0].id);
    }
  }, [environments, selectedEnvironmentId]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      await createMutation.mutateAsync({
        workspace_id: workspace.id,
        name: name.trim() || undefined,
        backend: workspace.backend,
        substrate,
        wasm_enabled: wasmEnabled,
      });
      setName("");
      setSubstrate("local");
      setWasmEnabled(false);
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
      if (selectedEnvironmentId === env.id) setSelectedEnvironmentId(null);
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
            Configure execution substrates for this workspace. Agents are assigned to environments from the agents tab.
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
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Substrate</span>
              <GlassSelect
                value={substrate}
                onChange={(v) => setSubstrate(v as "local" | "docker" | "remote")}
                options={[
                  { value: "local", label: "Local" },
                  { value: "docker", label: "Docker sandbox" },
                  { value: "remote", label: "Remote sandbox" },
                ]}
                className="mt-1"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={wasmEnabled}
              onChange={(e) => setWasmEnabled(e.target.checked)}
              className="rounded"
            />
            Enable Wasm tools on top of this environment
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
            Create an environment to define the runtime substrate for agents in this workspace.
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
            selected={env.id === selectedEnvironmentId}
            onSelect={() => setSelectedEnvironmentId(env.id)}
            onDelete={() => void handleDelete(env)}
          />
        ))}
      </div>

      {selectedEnvironmentId && (
        <EnvironmentConfigPanel
          key={selectedEnvironmentId}
          env={environments.find((env) => env.id === selectedEnvironmentId) ?? null}
          onSave={(input) => updateMutation.mutateAsync(input)}
          onDelete={(env) => void handleDelete(env)}
        />
      )}
    </div>
  );
}

/* ── Single environment card ─────────────────────────────────────────── */

interface CardProps {
  env: Environment;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const EnvironmentCard = memo(function EnvironmentCard({ env, selected, onSelect, onDelete }: CardProps) {
  const { data: sessions = [] } = useRuntimeSessionsQuery(env.id);
  const runningSessionCount = sessions.filter((s) => s.status === "running").length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl glass-card p-4 flex flex-col gap-3 text-left transition-all ${
        selected ? "ring-1 ring-[var(--color-accent)] shadow-[var(--shadow-glow-accent)]" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                runningSessionCount > 0 ? "bg-[var(--color-accent)] animate-pulse" : "bg-[var(--scrollbar-thumb)]"
              }`}
            />
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{env.name}</p>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {environmentSubstrateLabel(env.substrate)}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {backendLabel(env.backend)} · updated {relTime(env.updated_at)}
          </p>
        </div>
        <span className="h-7 px-2 rounded-xl flex items-center justify-center text-[var(--text-muted)] shrink-0 text-[10px] font-semibold">
          {selected ? "Configuring" : "Configure"}
        </span>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {env.wasm_enabled && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]">
            wasm
          </span>
        )}
        {env.sandbox_root_path && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-[var(--surface-ink-5)] text-[var(--text-secondary)]"
            title={env.sandbox_root_path}
          >
            sandbox
          </span>
        )}
      </div>

      {/* cwd */}
      <p className="text-[10px] font-mono text-[var(--text-muted)] break-all" title={env.effective_cwd}>
        {env.effective_cwd}
      </p>

      {/* Sessions stat */}
      <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--glass-border)]">
        <span>
          <span className="font-semibold text-[var(--text-secondary)]">{sessions.length}</span>{" "}
          session{sessions.length !== 1 ? "s" : ""}
        </span>
        {runningSessionCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[var(--color-accent-hover)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            {runningSessionCount} running
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="ml-auto h-6 px-2 rounded-lg text-[10px] font-semibold text-[var(--color-danger-text-light)] hover:bg-[var(--color-danger-bg-strong)] transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Session list (compact) */}
      {sessions.length > 0 && (
        <div className="space-y-1">
          {sessions.slice(0, 3).map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
          {sessions.length > 3 && (
            <p className="text-[10px] text-[var(--text-muted)] pl-2">+ {sessions.length - 3} more</p>
          )}
        </div>
      )}
    </button>
  );
});

function EnvironmentConfigPanel({
  env,
  onSave,
  onDelete,
}: {
  env: Environment | null;
  onSave: (input: import("../lib/bindings").UpdateEnvironmentInput) => Promise<Environment>;
  onDelete: (env: Environment) => void;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(env?.name ?? "");
  const [substrate, setSubstrate] = useState<"local" | "docker" | "remote">(env?.substrate ?? "local");
  const [wasmEnabled, setWasmEnabled] = useState(env?.wasm_enabled ?? false);
  const [dockerImage, setDockerImage] = useState(env?.docker_image ?? "");
  const [dockerWorkdir, setDockerWorkdir] = useState(env?.docker_workdir ?? "");
  const [sshHost, setSshHost] = useState(env?.ssh_host ?? "");
  const [sshPort, setSshPort] = useState(env?.ssh_port ? String(env.ssh_port) : "22");
  const [sshUser, setSshUser] = useState(env?.ssh_user ?? "");
  const [sshPath, setSshPath] = useState(env?.ssh_path ?? "");

  useEffect(() => {
    setSaveError(null);
    setName(env?.name ?? "");
    setSubstrate(env?.substrate ?? "local");
    setWasmEnabled(env?.wasm_enabled ?? false);
    setDockerImage(env?.docker_image ?? "");
    setDockerWorkdir(env?.docker_workdir ?? "");
    setSshHost(env?.ssh_host ?? "");
    setSshPort(env?.ssh_port ? String(env.ssh_port) : "22");
    setSshUser(env?.ssh_user ?? "");
    setSshPath(env?.ssh_path ?? "");
  }, [env]);

  if (!env) return null;
  const currentEnv = env;

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave({
        id: currentEnv.id,
        name,
        substrate,
        wasm_enabled: wasmEnabled,
        docker_image: dockerImage,
        docker_workdir: dockerWorkdir,
        ssh_host: sshHost,
        ssh_port: Number.isFinite(Number(sshPort)) ? Number(sshPort) : undefined,
        ssh_user: sshUser,
        ssh_path: sshPath,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl glass-card-static p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Configure: {currentEnv.name}</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          Set the substrate and connection details for this environment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Substrate</span>
          <GlassSelect
            value={substrate}
            onChange={(v) => setSubstrate(v as "local" | "docker" | "remote")}
            options={[
              { value: "local", label: "Local" },
              { value: "docker", label: "Docker sandbox" },
              { value: "remote", label: "Remote via SSH" },
            ]}
            className="mt-1"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={wasmEnabled}
          onChange={(e) => setWasmEnabled(e.target.checked)}
          className="rounded"
        />
        Enable Wasm tools on top of this environment
      </label>

      {substrate === "local" && (
        <div className="rounded-xl bg-[var(--surface-ink-3)] p-3 text-[11px] text-[var(--text-secondary)]">
          Agents run directly on this machine using the selected worktree or repo context.
        </div>
      )}

      {substrate === "docker" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Docker image</span>
            <input
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              placeholder="e.g. node:22-bookworm"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Container workdir</span>
            <input
              value={dockerWorkdir}
              onChange={(e) => setDockerWorkdir(e.target.value)}
              placeholder="e.g. /workspace"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
        </div>
      )}

      {substrate === "remote" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">SSH host</span>
            <input
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              placeholder="e.g. devbox.internal"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">SSH port</span>
            <input
              value={sshPort}
              onChange={(e) => setSshPort(e.target.value)}
              placeholder="22"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">SSH user</span>
            <input
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              placeholder="e.g. ubuntu"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Remote path</span>
            <input
              value={sshPath}
              onChange={(e) => setSshPath(e.target.value)}
              placeholder="e.g. /srv/app"
              className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-[12px] outline-none"
            />
          </label>
        </div>
      )}

      {saveError && <p className="text-[11px] text-[var(--color-danger-text-light)]">{saveError}</p>}

      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="h-8 px-4 rounded-xl btn-ink text-[11px] font-semibold disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save configuration"}
        </button>
      </div>
    </section>
  );
}

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
