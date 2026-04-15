import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { KhadimCodexSession, KhadimCodexStatus, KhadimConfiguredModel, KhadimProviderStatus } from "../../lib/bindings";
import { commands } from "../../lib/bindings";
import { getProviderIconUrl, isMonochromeProvider } from "../../assets/model-icons";
import { desktopQueryKeys, useProviderStatusesQuery } from "../../lib/queries";

const STATUS_META: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: "Active", color: "text-[var(--color-success-text)]", bgColor: "bg-[var(--color-success-muted)]" },
  configured: { label: "Key Only", color: "text-[var(--color-accent)]", bgColor: "bg-[var(--color-accent-subtle)]" },
  no_key: { label: "No Key", color: "text-[var(--color-pop)]", bgColor: "bg-[var(--color-pop)]/15" },
  inactive: { label: "Inactive", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--glass-bg)]" },
};

export function ProvidersTab() {
  const { data: statuses = [], isLoading: loading, refetch } = useProviderStatusesQuery();

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const activeProviders = statuses.filter((provider) => provider.status === "active");
  const configuredProviders = statuses.filter((provider) => provider.status === "configured");
  const otherProviders = statuses.filter((provider) => provider.status !== "active" && provider.status !== "configured");

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
            Overview of all available AI providers and their connection status.
          </p>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <i className="ri-loader-4-line text-base leading-none" />
          </button>
        </div>
      </div>

        {loading && statuses.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-16 rounded-xl shimmer" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                {activeProviders.length} active
              </span>
              <span className="h-px flex-1 bg-[var(--glass-border)]" />
              <span className="text-[10px] text-[var(--text-muted)]">
                {statuses.length} total
              </span>
            </div>
            {statuses.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">
                No providers available.
              </p>
            ) : (
              <>
                {activeProviders.length > 0 && <ProviderGroup label="Active" providers={activeProviders} onRefresh={refresh} />}
                {configuredProviders.length > 0 && <ProviderGroup label="Key Configured" providers={configuredProviders} onRefresh={refresh} />}
                {otherProviders.length > 0 && <ProviderGroup label="Available" providers={otherProviders} onRefresh={refresh} />}
              </>
            )}
          </div>
        )}
    </div>
  );
}

function ProviderGroup({ label, providers, onRefresh }: { label: string; providers: KhadimProviderStatus[]; onRefresh: () => Promise<void> }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-2">{label}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {providers.map((provider) => (
          <ProviderStatusCard key={provider.id} provider={provider} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

function invalidateModelQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: desktopQueryKeys.providerStatuses }),
    queryClient.invalidateQueries({ queryKey: desktopQueryKeys.khadimActiveModel }),
    queryClient.invalidateQueries({ queryKey: ["workspace-models"] }),
  ]);
}

function ProviderStatusCard({ provider, onRefresh }: { provider: KhadimProviderStatus; onRefresh: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const meta = STATUS_META[provider.status] ?? STATUS_META.inactive;
  const iconUrl = getProviderIconUrl(provider.id);
  const isMono = isMonochromeProvider(provider.id);
  const isCodexProvider = provider.id === "openai-codex";
  const effectiveMeta = isCodexProvider && (provider.status === "no_key" || provider.status === "inactive")
    ? { label: "Not Connected", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--glass-bg)]" }
    : isCodexProvider && provider.status === "configured"
    ? { label: "Connected", color: "text-[var(--color-success-text)]", bgColor: "bg-[var(--color-success-muted)]" }
    : meta;

  const [expanded, setExpanded] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [savedKeyDisplay, setSavedKeyDisplay] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState(false);
  const [autoActivate, setAutoActivate] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<{ created: number; total: number } | null>(null);
  const [providerModels, setProviderModels] = useState<KhadimConfiguredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [removingModel, setRemovingModel] = useState<string | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexSession, setCodexSession] = useState<KhadimCodexSession | null>(null);
  const [codexStatus, setCodexStatus] = useState<KhadimCodexStatus | null>(null);
  const [manualCode, setManualCode] = useState("");

  const hasSavedKey = provider.has_api_key && !provider.has_env_key;
  const hasEnvKeyOnly = provider.has_env_key && !hasSavedKey;

  useEffect(() => {
    if (!expanded || !provider.has_api_key || isCodexProvider) {
      setSavedKeyDisplay(null);
      setRevealedKey(false);
      return;
    }
    void commands.khadimGetProviderApiKeyMasked(provider.id).then((masked) => {
      setSavedKeyDisplay(masked);
    });
  }, [expanded, provider.has_api_key, provider.id, isCodexProvider]);

  useEffect(() => {
    if (!isCodexProvider || !expanded) return;
    void commands.khadimCodexAuthConnected().then(setCodexConnected);
  }, [isCodexProvider, expanded]);

  const loadProviderModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const all = await commands.khadimListModelConfigs();
      setProviderModels(all.filter((model) => model.provider === provider.id));
    } finally {
      setLoadingModels(false);
    }
  }, [provider.id]);

  useEffect(() => {
    if (expanded) {
      void loadProviderModels();
    }
  }, [expanded, loadProviderModels]);

  useEffect(() => {
    if (!codexSession?.sessionId) return;
    const interval = window.setInterval(() => {
      void commands.khadimCodexAuthStatus(codexSession.sessionId)
        .then(async (status) => {
          setCodexStatus(status);
          if (status.status === "connected") {
            setCodexConnected(true);
            setCodexConnecting(false);
            setCodexSession(null);
            setManualCode("");
            if (autoActivate) {
              await handleAutoDiscover();
            }
            await onRefresh();
            void loadProviderModels();
          }
          if (status.status === "failed") {
            setCodexConnecting(false);
            setError(status.error ?? "Codex authentication failed");
          }
        })
        .catch(() => {
          setCodexConnecting(false);
        });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [autoActivate, codexSession?.sessionId, loadProviderModels, onRefresh]);

  async function handleAutoDiscover() {
    setDiscovering(true);
    setDiscoveryResult(null);
    try {
      const discovered = await commands.khadimDiscoverModels(provider.id);
      if (discovered.length > 0) {
        const models = discovered.map((model) => ({ model_id: model.id, model_name: model.name }));
        const created = await commands.khadimBulkCreateProviderModels(provider.id, models);
        setDiscoveryResult({ created, total: discovered.length });
      } else {
        setDiscoveryResult({ created: 0, total: 0 });
      }
    } catch (discoverErr: unknown) {
      const message = discoverErr && typeof discoverErr === "object" && "message" in discoverErr
        ? (discoverErr as { message: string }).message
        : "Model discovery failed";
      setError(`Connected, but model discovery failed: ${message}`);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimSaveProviderApiKey(provider.id, keyInput.trim());

      if (autoActivate) {
        setDiscovering(true);
        try {
          const discovered = await commands.khadimDiscoverModels(provider.id, keyInput.trim());
          if (discovered.length > 0) {
            const models = discovered.map((model) => ({ model_id: model.id, model_name: model.name }));
            const created = await commands.khadimBulkCreateProviderModels(provider.id, models);
            setDiscoveryResult({ created, total: discovered.length });
          } else {
            setDiscoveryResult({ created: 0, total: 0 });
          }
        } catch (discoverErr: unknown) {
          const message = discoverErr && typeof discoverErr === "object" && "message" in discoverErr
            ? (discoverErr as { message: string }).message
            : "Model discovery failed";
          setError(`Key saved, but model discovery failed: ${message}`);
        } finally {
          setDiscovering(false);
        }
      }

      setKeyInput("");
      await invalidateModelQueries(queryClient);
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to save key";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimDeleteProviderApiKey(provider.id);
      setKeyInput("");
      setConfirmRemoveAll(false);
      await invalidateModelQueries(queryClient);
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to delete key";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteKeyAndModels() {
    setDeleting(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimRemoveProviderModels(provider.id);
      await commands.khadimDeleteProviderApiKey(provider.id);
      setKeyInput("");
      setConfirmRemoveAll(false);
      setExpanded(false);
      await invalidateModelQueries(queryClient);
      await onRefresh();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to remove";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemoveModel(modelId: string) {
    setRemovingModel(modelId);
    try {
      await commands.khadimDeleteModelConfig(modelId);
      await invalidateModelQueries(queryClient);
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to remove model";
      setError(message);
    } finally {
      setRemovingModel(null);
    }
  }

  function handleCodexConnect() {
    setCodexConnecting(true);
    setError(null);
    void commands.khadimCodexAuthStart().then((session) => {
      setCodexSession(session);
      setCodexStatus({ status: "pending", error: null, authUrl: session.authUrl });
      window.open(session.authUrl, "_blank", "noopener,noreferrer");
    }).catch((err: unknown) => {
      setCodexConnecting(false);
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to start Codex auth";
      setError(message);
    });
  }

  function handleCodexManualComplete() {
    if (!codexSession?.sessionId || !manualCode.trim()) return;
    void commands.khadimCodexAuthComplete(codexSession.sessionId, manualCode.trim()).then(async () => {
      setManualCode("");
      setCodexConnected(true);
      setCodexConnecting(false);
      setCodexSession(null);
      if (autoActivate) {
        await handleAutoDiscover();
      }
      await onRefresh();
      void loadProviderModels();
    }).catch((err: unknown) => {
      const message = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to complete Codex auth";
      setError(message);
    });
  }

  return (
    <div className="depth-card-sm transition-all hover:shadow-[var(--shadow-depth-card-hover)]">
      <div
        className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-[var(--glass-bg)]/30 rounded-[var(--radius-md)] transition-colors"
        onClick={() => { setExpanded(!expanded); setError(null); setDiscoveryResult(null); setConfirmRemoveAll(false); }}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg`} style={{ background: provider.status === "active" ? "var(--tint-lime, var(--color-success-muted))" : "var(--depth-inset-bg, var(--surface-bg-subtle))", boxShadow: provider.status === "active" ? undefined : "var(--shadow-depth-inset, inset 0 1px 3px oklch(0% 0 0 / 0.08))" }}>
          {iconUrl ? (
            <img src={iconUrl} alt="" className={`h-4.5 w-4.5 shrink-0 object-contain ${isMono ? "model-icon-mono" : ""}`} />
          ) : (
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{provider.name.slice(0, 2)}</span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{provider.name}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {provider.configured_models > 0 ? `${provider.configured_models} model${provider.configured_models > 1 ? "s" : ""} configured` : "No models configured"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {provider.has_api_key && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]" title={provider.has_env_key ? "Key from environment variable" : isCodexProvider ? "OAuth connected" : "Saved API key"}>
              <i className="ri-key-2-line text-[12px] leading-none" />
              {provider.has_env_key && <span className="text-[9px] font-medium text-[var(--text-muted)]">ENV</span>}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${effectiveMeta.bgColor} ${effectiveMeta.color}`}>{effectiveMeta.label}</span>
          <i className={`${expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-[12px] leading-none`} />
        </div>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3 pt-0">
          <div className="border-t border-[var(--glass-border)] pt-3 mt-0.5 space-y-3">
            {isCodexProvider ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[var(--text-primary)]">ChatGPT Plus or Pro</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Connect your OpenAI Codex subscription via OAuth.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${codexConnected ? "bg-[var(--color-success-muted)] text-[var(--color-success-text)]" : codexConnecting ? "bg-[var(--color-pop)]/15 text-[var(--color-pop)]" : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"}`}>
                      {codexConnected ? "Connected" : codexConnecting ? "Waiting..." : "Not connected"}
                    </span>
                    <button type="button" onClick={handleCodexConnect} disabled={codexConnecting} className="h-7 px-3 rounded-lg btn-glass text-[10px] font-medium disabled:opacity-50">
                      {codexConnected ? "Reconnect" : codexConnecting ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                </div>

                {(codexSession?.authUrl || codexStatus?.authUrl) && (
                  <div className="space-y-2">
                    <a href={codexSession?.authUrl ?? codexStatus?.authUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex text-[10px] text-[var(--color-accent)] underline underline-offset-2">
                      Open login page again
                    </a>
                    <div className="flex items-center gap-2">
                      <input
                        value={manualCode}
                        onChange={(event) => setManualCode(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") handleCodexManualComplete(); }}
                        className="flex-1 h-8 rounded-lg depth-inset px-3 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors font-mono"
                        placeholder="Paste the redirect URL or authorization code"
                      />
                      <button type="button" onClick={handleCodexManualComplete} disabled={!codexSession?.sessionId || !manualCode.trim()} className="h-8 px-3 rounded-lg btn-glass text-[10px] font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                        Submit code
                      </button>
                    </div>
                    {codexStatus?.error && <p className="text-[10px] text-[var(--color-danger)]">{codexStatus.error}</p>}
                  </div>
                )}

                {discovering && (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] px-3 py-2">
                    <i className="ri-loader-4-line text-base leading-none dot-spinner text-[var(--text-muted)]" />
                    <span className="text-[10px] text-[var(--text-secondary)]">Discovering models...</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {hasEnvKeyOnly && (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] px-3 py-2">
                    <i className="ri-stop-circle-line text-base leading-none text-[var(--color-accent)]" />
                    <span className="text-[10px] text-[var(--text-secondary)]">This key is provided by an environment variable and cannot be edited here. You can still add a saved key to override it.</span>
                  </div>
                )}

                {hasSavedKey && savedKeyDisplay && (
                  <div className="flex items-center gap-2 rounded-lg depth-inset px-3 py-2">
                    <i className="ri-key-2-line text-base leading-none text-[var(--color-success-text)]" />
                    <span className="flex-1 text-[10px] font-mono text-[var(--text-primary)] truncate">{savedKeyDisplay}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (revealedKey) {
                          setRevealedKey(false);
                          void commands.khadimGetProviderApiKeyMasked(provider.id).then(setSavedKeyDisplay);
                        } else {
                          void commands.khadimGetProviderApiKey(provider.id).then((key) => {
                            if (key) {
                              setSavedKeyDisplay(key);
                              setRevealedKey(true);
                            }
                          });
                        }
                      }}
                      className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {revealedKey ? "Hide" : "Reveal"}
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={keyInput}
                      onChange={(event) => setKeyInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void handleSave(); }}
                      placeholder={hasSavedKey ? "Enter new API key to update" : "Enter API key"}
                      className="w-full h-8 rounded-lg depth-inset px-3 pr-8 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors font-mono"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title={showKey ? "Hide" : "Show"} type="button">
                      {showKey ? (
                        <i className="ri-eye-off-line text-base leading-none" />
                      ) : (
                        <i className="ri-settings-3-line text-base leading-none" />
                      )}
                    </button>
                  </div>

                  <button onClick={() => void handleSave()} disabled={saving || discovering || !keyInput.trim()} className="h-8 px-3.5 rounded-lg btn-glass text-[10px] font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                    {saving || discovering ? (
                      <span className="flex items-center gap-1.5">
                        <i className="ri-loader-4-line text-[12px] leading-none dot-spinner" />
                        {discovering ? "Discovering..." : "Saving..."}
                      </span>
                    ) : hasSavedKey ? "Update" : "Save"}
                  </button>

                  {hasSavedKey && (
                    <button
                      onClick={() => {
                        if (provider.configured_models > 0) {
                          setConfirmRemoveAll(true);
                        } else {
                          void handleDelete();
                        }
                      }}
                      disabled={deleting}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors disabled:opacity-40"
                      title="Delete saved API key"
                    >
                      {deleting ? (
                        <i className="ri-loader-4-line text-base leading-none dot-spinner" />
                      ) : (
                        <i className="ri-delete-bin-line text-base leading-none" />
                      )}
                    </button>
                  )}
                </div>
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={autoActivate}
                onClick={() => setAutoActivate(!autoActivate)}
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${autoActivate ? "bg-[var(--color-accent)]" : "bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]"}`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoActivate ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Activate all known models from this provider on {isCodexProvider ? "connect" : "key save"}
              </span>
            </label>

            {confirmRemoveAll && (
              <div className="rounded-lg bg-[var(--color-danger-bg-strong)] border border-[var(--color-danger)]/20 px-3 py-2.5 space-y-2">
                <p className="text-[10px] text-[var(--text-primary)] font-medium">
                  This provider has {provider.configured_models} model{provider.configured_models > 1 ? "s" : ""} configured.
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  Do you want to also remove all model configurations for this provider?
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => void handleDeleteKeyAndModels()} disabled={deleting} className="h-7 px-3 rounded-lg text-[10px] font-medium bg-[var(--color-danger)] text-white hover:brightness-110 transition-all disabled:opacity-50">
                    {deleting ? "Removing..." : "Remove key & models"}
                  </button>
                  <button onClick={() => void handleDelete()} disabled={deleting} className="h-7 px-3 rounded-lg btn-glass text-[10px] font-medium disabled:opacity-50">
                    Key only
                  </button>
                  <button onClick={() => setConfirmRemoveAll(false)} className="h-7 px-3 rounded-lg text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {discoveryResult && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success-muted)] border border-[var(--color-success)]/20 px-3 py-2">
                <i className="ri-check-line text-base leading-none text-[var(--color-success-text)]" />
                <span className="text-[10px] text-[var(--color-success-text)]">
                  {discoveryResult.created > 0
                    ? `Activated ${discoveryResult.created} model${discoveryResult.created > 1 ? "s" : ""} (${discoveryResult.total} discovered, ${discoveryResult.total - discoveryResult.created} already configured)`
                    : discoveryResult.total === 0
                    ? "No models discovered for this provider"
                    : `All ${discoveryResult.total} models were already configured`}
                </span>
              </div>
            )}

            {error && <p className="text-[10px] text-[var(--color-danger)]">{error}</p>}

            {providerModels.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Configured Models</p>
                  <span className="text-[9px] text-[var(--text-muted)]">
                    {providerModels.length} model{providerModels.length > 1 ? "s" : ""}
                  </span>
                </div>
                {loadingModels ? (
                  <div className="space-y-1">
                    {[1, 2].map((index) => (
                      <div key={index} className="h-8 rounded-lg shimmer" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                    {providerModels.map((model) => (
                      <div key={model.id} className="flex items-center gap-2 rounded-lg depth-inset px-2.5 py-1.5 group hover:shadow-[var(--shadow-depth-card-sm)] transition-all">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium text-[var(--text-primary)] truncate">{model.name}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-mono truncate">{model.model}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {model.is_default && <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold text-[var(--color-accent)] bg-[var(--color-accent-subtle)]">DEFAULT</span>}
                          <button
                            onClick={() => void handleRemoveModel(model.id)}
                            disabled={removingModel === model.id}
                            className="h-6 w-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="Remove this model configuration"
                          >
                            {removingModel === model.id ? (
                              <i className="ri-loader-4-line text-[12px] leading-none dot-spinner" />
                            ) : (
                              <i className="ri-close-line text-[12px] leading-none" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
