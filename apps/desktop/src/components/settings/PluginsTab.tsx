import { useCallback, useEffect, useState } from "react";
import type { PluginEntry, PluginToolInfo } from "../../lib/bindings";
import { commands } from "../../lib/bindings";

// ── Status badge ─────────────────────────────────────────────────────

function StatusBadge({ enabled, error }: { enabled: boolean; error: string | null }) {
  if (error) {
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[var(--color-danger)]/15 text-[var(--color-danger)]">
        Error
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        enabled
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"
      }`}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

// ── Permission pills ─────────────────────────────────────────────────

function PermissionPills({ permissions }: { permissions: PluginEntry["permissions"] }) {
  const pills: { label: string; active: boolean }[] = [
    { label: "Filesystem", active: permissions.fs },
    { label: "HTTP", active: permissions.http },
    { label: "Storage", active: permissions.store },
  ];

  const activePills = pills.filter((p) => p.active);
  if (activePills.length === 0) {
    return (
      <span className="text-[9px] text-[var(--text-muted)] italic">No permissions requested</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activePills.map((pill) => (
        <span
          key={pill.label}
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
        >
          {pill.label}
        </span>
      ))}
      {permissions.allowed_hosts.length > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)] bg-[var(--glass-bg)]"
          title={permissions.allowed_hosts.join(", ")}
        >
          {permissions.allowed_hosts.length} host{permissions.allowed_hosts.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Tool list inside expanded card ───────────────────────────────────

function PluginToolList({ pluginId, tools }: { pluginId: string; tools: PluginToolInfo[] }) {
  const pluginTools = tools.filter((t) => t.plugin_id === pluginId);
  if (pluginTools.length === 0) {
    return <p className="text-[10px] text-[var(--text-muted)] italic py-1">No tools exported</p>;
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
      {pluginTools.map((info) => (
        <div
          key={info.tool.name}
          className="flex items-start gap-2.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-2.5 py-2 hover:border-[var(--glass-border-strong)] transition-colors"
        >
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--glass-bg-strong)]">
            <svg className="w-3 h-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.107A.936.936 0 015 11.263V7.694a1 1 0 01.533-.906l5.385-3.108a1 1 0 01.97 0l5.384 3.108a1 1 0 01.534.906v3.569a.936.936 0 01-.036.8l-5.384 3.107a1 1 0 01-.97 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[var(--text-primary)] font-mono">
              {info.tool.name}
            </p>
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
              {info.tool.description}
            </p>
            {info.tool.params.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {info.tool.params.map((param) => (
                  <span
                    key={param.name}
                    className={`rounded px-1 py-px text-[8px] font-mono ${
                      param.required
                        ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"
                    }`}
                    title={`${param.name}: ${param.param_type}${param.required ? " (required)" : ""} — ${param.description}`}
                  >
                    {param.name}
                    <span className="opacity-60">:{param.param_type}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Config editor inside expanded card ───────────────────────────────

function PluginConfigEditor({
  pluginId,
  onError,
}: {
  pluginId: string;
  onError: (msg: string | null) => void;
}) {
  // For now we show a minimal hint — full config editing is wired but
  // we don't know the schema without loading the manifest separately.
  // The Tauri side already exposes plugin_set_config / plugin_get_config.
  return (
    <p className="text-[10px] text-[var(--text-muted)] italic py-1">
      Plugin configuration can be set via the CLI or plugin_set_config command.
    </p>
  );
}

// ── Single plugin card ───────────────────────────────────────────────

function PluginCard({
  plugin,
  tools,
  onToggle,
  onUninstall,
}: {
  plugin: PluginEntry;
  tools: PluginToolInfo[];
  onToggle: (id: string, enable: boolean) => Promise<void>;
  onUninstall: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(plugin.id, !plugin.enabled);
    } finally {
      setToggling(false);
    }
  }

  async function handleUninstall() {
    setUninstalling(true);
    try {
      await onUninstall(plugin.id);
    } finally {
      setUninstalling(false);
      setConfirmUninstall(false);
    }
  }

  return (
    <div className="rounded-xl glass-panel transition-all hover:border-[var(--glass-border-strong)]">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-[var(--surface-card-hover)] rounded-xl transition-colors"
        onClick={() => {
          setExpanded(!expanded);
          setConfirmUninstall(false);
        }}
      >
        {/* Icon */}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            plugin.enabled && !plugin.error
              ? "bg-gradient-to-br from-[var(--color-accent)]/20 to-[var(--color-accent)]/5 border border-[var(--color-accent)]/20"
              : "bg-[var(--glass-bg-strong)]"
          }`}
        >
          <svg
            className={`w-4 h-4 ${plugin.enabled && !plugin.error ? "text-[var(--color-accent)]" : "text-[var(--text-muted)]"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z"
            />
          </svg>
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
              {plugin.name}
            </p>
            <span className="text-[9px] font-mono text-[var(--text-muted)]">v{plugin.version}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
            {plugin.description || "No description"}
            {plugin.tool_count > 0 && (
              <span className="ml-1.5 opacity-70">
                · {plugin.tool_count} tool{plugin.tool_count !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge enabled={plugin.enabled} error={plugin.error} />
          <svg
            className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0">
          <div className="border-t border-[var(--glass-border)] pt-3 mt-0.5 space-y-3">
            {/* Error banner */}
            {plugin.error && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-danger)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-[var(--color-danger)]">Failed to load</p>
                  <p className="text-[9px] text-[var(--text-secondary)] mt-0.5 break-all">{plugin.error}</p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {plugin.author && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Author</p>
                  <p className="text-[10px] text-[var(--text-primary)] mt-0.5">{plugin.author}</p>
                </div>
              )}
              {plugin.license && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">License</p>
                  <p className="text-[10px] text-[var(--text-primary)] mt-0.5">{plugin.license}</p>
                </div>
              )}
            </div>

            {/* Permissions */}
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Permissions
              </p>
              <PermissionPills permissions={plugin.permissions} />
            </div>

            {/* Tools list */}
            {plugin.enabled && plugin.tool_count > 0 && (
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Tools
                </p>
                <PluginToolList pluginId={plugin.id} tools={tools} />
              </div>
            )}

            {/* Homepage link */}
            {plugin.homepage && (
              <a
                href={plugin.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline underline-offset-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Homepage
              </a>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => void handleToggle()}
                disabled={toggling}
                className="h-7 px-3.5 rounded-lg btn-glass text-[10px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {toggling ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 dot-spinner" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {plugin.enabled ? "Disabling..." : "Enabling..."}
                  </span>
                ) : plugin.enabled ? (
                  "Disable"
                ) : (
                  "Enable"
                )}
              </button>

              {!confirmUninstall ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmUninstall(true);
                  }}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
                  title="Uninstall plugin"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-[10px] text-[var(--text-muted)]">Remove?</span>
                  <button
                    onClick={() => void handleUninstall()}
                    disabled={uninstalling}
                    className="h-7 px-2.5 rounded-lg text-[10px] font-semibold bg-[var(--color-danger)] text-white hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {uninstalling ? "Removing..." : "Yes"}
                  </button>
                  <button
                    onClick={() => setConfirmUninstall(false)}
                    className="h-7 px-2.5 rounded-lg text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Install from directory ───────────────────────────────────────────

function InstallSection({ onInstalled }: { onInstalled: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleInstall() {
    setInstalling(true);
    setError(null);
    setSuccess(null);
    try {
      // Use Tauri dialog to pick a folder
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select plugin directory" });
      if (!selected) {
        setInstalling(false);
        return;
      }
      const result = await commands.pluginInstall(selected as string);
      setSuccess(`Installed "${result.name}" v${result.version} with ${result.tool_count} tool(s)`);
      onInstalled();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to install plugin";
      setError(message);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleInstall()}
          disabled={installing}
          className="h-8 px-4 rounded-xl btn-glass text-[11px] font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {installing ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Installing...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Install from folder
            </>
          )}
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[10px] text-emerald-300">{success}</span>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────

export function PluginsTab() {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [tools, setTools] = useState<PluginToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pluginsDir, setPluginsDir] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [discovered, allTools, dir] = await Promise.all([
        commands.pluginDiscover(),
        commands.pluginListTools(),
        commands.pluginDir(),
      ]);
      setPlugins(discovered);
      setTools(allTools);
      setPluginsDir(dir);
    } catch {
      // Silently handle — empty list is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(pluginId: string, enable: boolean) {
    try {
      if (enable) {
        await commands.pluginEnable(pluginId);
      } else {
        await commands.pluginDisable(pluginId);
      }
      await load();
    } catch (err: unknown) {
      console.error("Failed to toggle plugin", err);
      await load();
    }
  }

  async function handleUninstall(pluginId: string) {
    try {
      await commands.pluginUninstall(pluginId);
      await load();
    } catch (err: unknown) {
      console.error("Failed to uninstall plugin", err);
      await load();
    }
  }

  const enabledCount = plugins.filter((p) => p.enabled && !p.error).length;
  const totalToolCount = tools.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header card */}
      <div className="rounded-2xl glass-card-static p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Plugins</h2>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "dot-spinner" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Extend Khadim with WASM plugins that add custom tools to the agent.
        </p>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {enabledCount} enabled
          </span>
          <span className="h-px flex-1 bg-[var(--glass-border)]" />
          <span className="text-[10px] text-[var(--text-muted)]">
            {plugins.length} installed · {totalToolCount} tool{totalToolCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Install */}
        <InstallSection onInstalled={() => void load()} />
      </div>

      {/* Plugin list */}
      {loading && plugins.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl shimmer" />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <div className="rounded-2xl glass-card-static p-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-2xl bg-[var(--glass-bg-strong)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z"
                />
              </svg>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)] mb-1">No plugins installed</p>
          <p className="text-[10px] text-[var(--text-muted)] mb-1">
            Install a plugin from a folder or drop one into:
          </p>
          {pluginsDir && (
            <p className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--glass-bg)] rounded-lg px-3 py-1.5 inline-block mt-1 select-all">
              {pluginsDir}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              tools={tools}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
            />
          ))}
        </div>
      )}
    </div>
  );
}
