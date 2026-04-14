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
          ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]"
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
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--color-pop)]/10 text-[var(--color-pop)] border border-[var(--color-pop)]/20"
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
            <i className="ri-tools-line text-[12px] leading-none text-[var(--text-muted)]" />
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
                        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border border-[var(--color-accent)]/20"
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
          <i className="ri-puzzle-line text-[16px] leading-none" />
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
          <i className="ri-arrow-down-s-line text-[12px] leading-none" />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0">
          <div className="border-t border-[var(--glass-border)] pt-3 mt-0.5 space-y-3">
            {/* Error banner */}
            {plugin.error && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-3 py-2">
                <i className="ri-error-warning-line text-[14px] leading-none mt-0.5 text-[var(--color-danger)]" />
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
                <i className="ri-external-link-line text-[12px] leading-none" />
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
                    <i className="ri-loader-4-line text-[12px] leading-none dot-spinner" />
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
                  <i className="ri-delete-bin-line text-[14px] leading-none" />
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
              <i className="ri-loader-4-line text-[14px] leading-none animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <i className="ri-add-line text-[14px] leading-none" />
              Install from folder
            </>
          )}
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success-muted)] border border-[var(--color-success)]/20 px-3 py-2">
          <i className="ri-check-line text-[14px] leading-none text-[var(--color-success-text)]" />
          <span className="text-[10px] text-[var(--color-success-text)]">{success}</span>
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
            <i className="ri-loader-4-line text-[14px] leading-none" />
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
              <i className="ri-puzzle-line text-[20px] leading-none text-[var(--text-muted)]" />
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
