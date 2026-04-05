import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  KhadimConfiguredModel,
  KhadimCodexSession,
  KhadimCodexStatus,
  KhadimProviderOption,
  OpenCodeModelOption,
} from "../lib/bindings";
import { commands } from "../lib/bindings";
import { ModelSelector } from "./ModelSelector";
import { getProviderIconUrl, resolveModelIcon, isMonochromeProvider } from "../assets/model-icons";

type FormState = {
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: string;
};

const inputClass =
  "w-full rounded-xl glass-panel px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-border-strong)] transition-all";

const EMPTY_FORM: FormState = {
  name: "",
  provider: "openai",
  model: "",
  apiKey: "",
  baseUrl: "",
  temperature: "0.2",
};

const DISCOVERY_WITHOUT_API_KEY = new Set([
  "openai-codex",
  "opencode",
  "opencode-go",
  "github-copilot",
  "amazon-bedrock",
  "azure-openai-responses",
  "vercel-ai-gateway",
  "kimi-coding",
  "google-vertex",
  "ollama",
]);

function toModelOption(providerName: string, providerId: string, modelId: string, modelName: string): OpenCodeModelOption {
  return {
    provider_id: providerId,
    provider_name: providerName,
    model_id: modelId,
    model_name: modelName,
    is_default: false,
  };
}

function getModelKey(model: Pick<OpenCodeModelOption, "provider_id" | "model_id">) {
  return `${model.provider_id}:${model.model_id}`;
}

function formatProviderWarning(error: unknown) {
  const raw = error instanceof Error ? error.message : "Failed to fetch provider models";

  if (raw.includes("Missing Authentication header") || raw.includes("HTTP 401 Unauthorized")) {
    return "This provider rejected the saved credentials. Update the API key and try again.";
  }

  if (raw.includes("usage_limit_reached")) {
    return "Your Codex plan has reached its current usage limit. Wait for reset or use another provider.";
  }

  if (raw.includes("HTTP 429 Too Many Requests")) {
    return "This provider is rate limiting requests right now. Please wait and try again.";
  }

  return raw;
}

function ProviderSelector({
  providers,
  selectedProvider,
  onSelect,
}: {
  providers: KhadimProviderOption[];
  selectedProvider: string;
  onSelect: (provider: string) => void;
}) {
  return (
    <div className="rounded-xl glass-panel p-1.5">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
        {providers.map((provider) => {
          const isActive = selectedProvider === provider.type;
          return (
            <button
              key={provider.type}
              type="button"
              onClick={() => onSelect(provider.type)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                isActive
                   ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                  isActive ? "bg-gradient-to-br from-white/90 to-white/60 shadow-sm" : "bg-[var(--glass-bg-strong)]"
                }`}
              >
                {getProviderIconUrl(provider.type) ? (
                  <img src={getProviderIconUrl(provider.type)!} alt="" className={`h-4 w-4 shrink-0 object-contain ${isMonochromeProvider(provider.type) ? "model-icon-mono" : ""}`} />
                ) : (
                  <span className="text-[10px] font-semibold uppercase text-black">{provider.name.slice(0, 2)}</span>
                )}
              </span>
              <span className="truncate">{provider.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfiguredModelCard({
  model,
  onSetActive,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  model: KhadimConfiguredModel;
  onSetActive: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEdit: (model: KhadimConfiguredModel) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className={`rounded-xl glass-panel p-4 transition-all ${model.is_active ? "ring-1 ring-[var(--color-accent)]" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {(() => {
              const iconInfo = resolveModelIcon(model.name, model.model, model.provider);
              return iconInfo ? (
                <img src={iconInfo.url} alt="" className={`h-5 w-5 shrink-0 object-contain ${iconInfo.isMonochrome ? "model-icon-mono" : ""}`} />
              ) : null;
            })()}
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{model.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {model.provider} · {model.model}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            {model.is_active && (
              <span className="rounded-full bg-[var(--surface-ink-solid)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">
                Active
              </span>
            )}
            {model.is_default && (
              <span className="rounded-full bg-[var(--surface-ink-solid)]/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">
                Default
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          {!model.is_active && (
            <button onClick={() => onSetActive(model.id)} type="button" className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium">
              Activate
            </button>
          )}
          {!model.is_default && (
            <button onClick={() => onSetDefault(model.id)} type="button" className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium">
              Default
            </button>
          )}
          <button onClick={() => onEdit(model)} type="button" className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium">
            Edit
          </button>
          <button onClick={() => onDelete(model.id)} type="button" className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-red-500">
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function ModelSettingsTab() {
  const [providers, setProviders] = useState<KhadimProviderOption[]>([]);
  const [models, setModels] = useState<KhadimConfiguredModel[]>([]);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<OpenCodeModelOption[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [existingApiKey, setExistingApiKey] = useState(false);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexSession, setCodexSession] = useState<KhadimCodexSession | null>(null);
  const [codexStatus, setCodexStatus] = useState<KhadimCodexStatus | null>(null);
  const [manualCode, setManualCode] = useState("");

  const providerInfo = useMemo(
    () => providers.find((provider) => provider.type === form.provider),
    [providers, form.provider],
  );

  const providerModelOptions = useMemo(() => discoveredModels, [discoveredModels]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [providers, models, activeModel, codexConnected] = await Promise.all([
        commands.khadimListProviders(),
        commands.khadimListModelConfigs(),
        commands.khadimActiveModel(),
        commands.khadimCodexAuthConnected(),
      ]);
      setProviders(providers);
      setModels(models);
      setActiveModelName(activeModel?.model_name ?? null);
      setCodexConnected(codexConnected);
      if (providers.length > 0 && !providers.some((provider) => provider.type === form.provider)) {
        setForm((prev) => ({ ...prev, provider: providers[0].type }));
      }
    } finally {
      setLoading(false);
    }
  }, [form.provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!codexSession?.sessionId) return;
    const interval = window.setInterval(() => {
      void commands.khadimCodexAuthStatus(codexSession.sessionId)
        .then((status) => {
          setCodexStatus(status);
          if (status.status === "connected") {
            setCodexConnected(true);
            setCodexConnecting(false);
            setCodexSession(null);
            setManualCode("");
          }
          if (status.status === "failed") {
            setCodexConnecting(false);
          }
        })
        .catch(() => {
          setCodexConnecting(false);
        });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [codexSession?.sessionId]);

  useEffect(() => {
    setDiscoverError(null);
    setDiscoveredModels([]);
    const canDiscover = form.apiKey.trim().length > 0 || existingApiKey || DISCOVERY_WITHOUT_API_KEY.has(form.provider);
    if (!canDiscover) return;
    const timeout = window.setTimeout(() => {
      setDiscovering(true);
      void commands
        .khadimDiscoverModels(form.provider, form.apiKey, form.baseUrl || null)
        .then((discovered) => {
          setDiscoveredModels(
            discovered.map((model) =>
              toModelOption(providerInfo?.name ?? form.provider, form.provider, model.id, model.name),
            ),
          );
          setDiscoverError(null);
        })
        .catch((error) => {
          setDiscoverError(formatProviderWarning(error));
          setDiscoveredModels([]);
        })
        .finally(() => setDiscovering(false));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [existingApiKey, form.provider, form.apiKey, form.baseUrl, providerInfo?.name]);

  useEffect(() => {
    if (editingId) return;
    const providerConfig = models.find((model) => model.provider === form.provider && model.has_api_key);
    setExistingApiKey(Boolean(providerConfig));
  }, [editingId, form.provider, models]);

  const handleSelectModel = useCallback(
    (modelKey: string) => {
      const found = providerModelOptions.find((model) => getModelKey(model) === modelKey);
      if (!found) return;
      setForm((prev) => ({
        ...prev,
        model: found.model_id,
        name: prev.name || found.model_name,
      }));
    },
    [providerModelOptions],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, provider: providers[0]?.type ?? "openai" });
    setDiscoveredModels([]);
    setDiscoverError(null);
    setExistingApiKey(false);
  }, [providers]);

  const submit = useCallback(async () => {
    if (!form.name.trim() || !form.model.trim()) return;
    setSaving(true);
    try {
      const input = {
        name: form.name,
        provider: form.provider,
        model: form.model,
        api_key: form.apiKey || null,
        base_url: form.baseUrl || null,
        temperature: form.temperature || null,
        is_default: editingId ? false : null,
        is_active: editingId ? false : null,
      };
      if (editingId) {
        await commands.khadimUpdateModelConfig(editingId, input);
      } else {
        await commands.khadimCreateModelConfig(input);
      }
      resetForm();
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [editingId, form, refresh, resetForm]);

  const editModel = useCallback((model: KhadimConfiguredModel) => {
    setEditingId(model.id);
      setForm({
        name: model.name,
        provider: model.provider,
        model: model.model,
        apiKey: "",
      baseUrl: model.base_url ?? "",
      temperature: model.temperature ?? "0.2",
    });
      setDiscoveredModels([]);
      setDiscoverError(null);
      setExistingApiKey(model.has_api_key);
  }, []);

  const activeModel = models.find((model) => model.is_active);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Model Settings</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Configure AI providers and models for your desktop agent.</p>
        {activeModel && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl glass-panel px-3 py-2 text-xs">
            <span className="text-[var(--text-muted)]">Currently using:</span>
            <span className="font-medium text-[var(--text-primary)]">{activeModel.name}</span>
            <span className="text-[var(--text-muted)]">({activeModel.provider} / {activeModel.model})</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl glass-card-static p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{editingId ? "Edit Model" : "Add Model"}</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Pick a provider, enter credentials, and select a model.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Provider</label>
            <ProviderSelector
              providers={providers}
              selectedProvider={form.provider}
              onSelect={(provider) => {
                setForm((prev) => ({ ...prev, provider, model: "", baseUrl: "", name: "" }));
                setDiscoveredModels([]);
                setDiscoverError(null);
              }}
            />
          </div>

          {form.provider === "openai-codex" && (
            <div className="rounded-xl glass-panel p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">ChatGPT Plus or Pro</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Connect your Codex subscription once, then add any supported Codex model.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    codexConnected
                      ? "bg-emerald-500/20 text-emerald-400"
                      : codexConnecting
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"
                  }`}>
                    {codexConnected ? "Connected" : codexConnecting ? "Waiting..." : "Not connected"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCodexConnecting(true);
                      void commands.khadimCodexAuthStart().then((session) => {
                        setCodexSession(session);
                        setCodexStatus({ status: "pending", error: null, authUrl: session.authUrl });
                        window.open(session.authUrl, "_blank", "noopener,noreferrer");
                      }).catch(() => setCodexConnecting(false));
                    }}
                    disabled={codexConnecting}
                    className="rounded-lg btn-glass px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  >
                    {codexConnected ? "Reconnect" : codexConnecting ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </div>
              {(codexSession?.authUrl || codexStatus?.authUrl) && (
                <div className="mt-3 space-y-2">
                  <a
                    href={codexSession?.authUrl ?? codexStatus?.authUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs text-[var(--color-accent)] underline underline-offset-2"
                  >
                    Open login page again
                  </a>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={manualCode}
                      onChange={(event) => setManualCode(event.target.value)}
                      className={inputClass}
                      placeholder="Paste the redirect URL or authorization code"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!codexSession?.sessionId || !manualCode.trim()) return;
                        void commands.khadimCodexAuthComplete(codexSession.sessionId, manualCode.trim()).then(async () => {
                          setManualCode("");
                          setCodexConnected(true);
                          setCodexConnecting(false);
                          setCodexSession(null);
                          await refresh();
                        });
                      }}
                      disabled={!codexSession?.sessionId || !manualCode.trim()}
                      className="whitespace-nowrap rounded-lg btn-glass px-3 py-2 text-xs font-medium disabled:opacity-60"
                    >
                      Submit code
                    </button>
                  </div>
                  {codexStatus?.error && (
                    <p className="text-xs text-red-400">{codexStatus.error}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              API Key {form.provider === "openai-codex" ? "(optional if connected)" : ""}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, apiKey: value }));
                  if (value.trim().length > 0) {
                    setExistingApiKey(true);
                  }
                }}
                className={`${inputClass} pr-10`}
                placeholder={existingApiKey ? "Saved key available" : "sk-..."}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
            {existingApiKey && !form.apiKey.trim() && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                A saved API key will be reused for this provider unless you enter a replacement.
              </p>
            )}
          </div>

          {providerInfo?.needs_base_url && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Base URL</label>
              <input
                value={form.baseUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                className={inputClass}
                placeholder="https://api.example.com/v1"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Model</label>
            <ModelSelector
              models={providerModelOptions}
              selectedModelKey={form.model ? `${form.provider}:${form.model}` : null}
              onSelectModel={handleSelectModel}
              disabled={discovering && providerModelOptions.length === 0}
              direction="down"
              className="w-full"
            />
            {discovering && <p className="mt-1.5 text-xs text-[var(--text-muted)]">Fetching models...</p>}
            {discoverError && <p className="mt-1.5 text-xs text-red-400">{discoverError}</p>}
            {!discovering && !discoverError && providerModelOptions.length === 0 && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                {form.apiKey.trim().length > 0 || DISCOVERY_WITHOUT_API_KEY.has(form.provider)
                  || existingApiKey
                  ? "No models found for this provider."
                  : "Enter API key to browse models."}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className={inputClass}
              placeholder="My Model"
            />
          </div>

          <div className="sm:w-1/2">
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Temperature</label>
            <input
              value={form.temperature}
              onChange={(event) => setForm((prev) => ({ ...prev, temperature: event.target.value }))}
              className={inputClass}
              placeholder="0.2"
              type="number"
              step="0.1"
              min="0"
              max="2"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-xl glass-panel px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--glass-bg-strong)]">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !form.model.trim() || !form.name.trim()}
            className="rounded-xl bg-[var(--surface-ink-solid)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : editingId ? "Update Model" : "Add Model"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl glass-card-static p-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Configured Models</h3>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Loading...</p>
        ) : models.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No models configured yet. Add one above.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {models.map((model) => (
              <ConfiguredModelCard
                key={model.id}
                model={model}
                onSetActive={(id) => void commands.khadimSetActiveModelConfig(id).then(refresh)}
                onSetDefault={(id) => void commands.khadimSetDefaultModelConfig(id).then(refresh)}
                onEdit={editModel}
                onDelete={(id) => void commands.khadimDeleteModelConfig(id).then(async () => {
                  if (editingId === id) resetForm();
                  await refresh();
                })}
              />
            ))}
          </div>
        )}
        {activeModelName && (
          <p className="mt-4 text-xs text-[var(--text-muted)]">Active desktop default: {activeModelName}</p>
        )}
      </div>
    </div>
  );
}
