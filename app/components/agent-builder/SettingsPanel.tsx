import { useEffect, useMemo, useState } from "react";
import { showError, showSuccess } from "../../lib/toast";
import { LuBrain, LuGlobe, LuBot, LuServer, LuSearch, LuCheck, LuCodeXml } from "react-icons/lu";

type ProviderType = "openai" | "anthropic" | "openai-codex" | "openrouter" | "ollama";

interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderType;
  model: string;
  baseUrl: string | null;
  temperature: string | null;
  isDefault: boolean | null;
  isActive: boolean | null;
}

interface ProviderOption {
  type: ProviderType;
  name: string;
  needsBaseUrl: boolean;
}

interface DiscoveredModel {
  id: string;
  name: string;
}

interface ApiData {
  models?: ModelConfig[];
  providers?: ProviderOption[];
  oauth?: {
    openaiCodexConnected?: boolean;
  };
  session?: {
    sessionId: string;
    authUrl: string;
  };
  success?: boolean;
  error?: string;
}

interface DiscoverApiData {
  success?: boolean;
  models?: DiscoveredModel[];
  error?: string;
}

interface CodexAuthStatusApiData {
  success?: boolean;
  error?: string;
  oauth?: {
    openaiCodexConnected?: boolean;
  };
  session?: {
    status: "pending" | "connected" | "failed";
    error: string | null;
    authUrl: string | null;
  };
}

const EMPTY_FORM = {
  name: "",
  provider: "openai" as ProviderType,
  model: "",
  apiKey: "",
  baseUrl: "",
  temperature: "0.2",
};

export function SettingsPanel() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexSessionId, setCodexSessionId] = useState<string | null>(null);
  const [codexAuthUrl, setCodexAuthUrl] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [submittingManualCode, setSubmittingManualCode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const providerInfo = useMemo(
    () => providers.find((provider) => provider.type === form.provider),
    [providers, form.provider]
  );

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [modelsRes, providersRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/models?action=providers"),
      ]);
      const modelsData = (await modelsRes.json()) as ApiData;
      const providersData = (await providersRes.json()) as ApiData;
      setModels(modelsData.models ?? []);
      setProviders(providersData.providers ?? []);
      setCodexConnected(Boolean(providersData.oauth?.openaiCodexConnected));
    } catch (error) {
      console.error("Failed to load model settings", error);
      showError("Failed to load model settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const submitIntent = async (intent: string, data: Record<string, string>) => {
    const body = new FormData();
    body.append("intent", intent);
    for (const [key, value] of Object.entries(data)) body.append(key, value);
    const response = await fetch("/api/models", { method: "POST", body });
    const payload = (await response.json()) as ApiData;
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  };

  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const payload = (await submitIntent("discover", {
        provider: form.provider, apiKey: form.apiKey, baseUrl: form.baseUrl,
      })) as DiscoverApiData;
      setDiscoveredModels(payload.models ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch provider models";
      setDiscoverError(message);
      setDiscoveredModels([]);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => { discoverModels(); }, 250);
    return () => clearTimeout(timeout);
  }, [form.provider, form.apiKey, form.baseUrl]);

  useEffect(() => {
    if (!codexSessionId) return;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/models?action=codexAuthStatus&sessionId=${encodeURIComponent(codexSessionId)}`);
        const payload = (await response.json()) as CodexAuthStatusApiData;
        if (!response.ok) throw new Error(payload.error || "Failed to check Codex connection status");
        setCodexConnected(Boolean(payload.oauth?.openaiCodexConnected));
        setCodexAuthUrl(payload.session?.authUrl ?? null);
        if (payload.session?.status === "connected") {
          setCodexConnecting(false); setCodexSessionId(null); setManualCode("");
          showSuccess("Codex subscription connected");
          await fetchSettings();
        }
        if (payload.session?.status === "failed") {
          setCodexConnecting(false); setCodexSessionId(null);
          showError(payload.session.error || "Failed to connect Codex");
        }
      } catch (error) {
        setCodexConnecting(false); setCodexSessionId(null);
        showError(error instanceof Error ? error.message : "Failed to check Codex status");
      }
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [codexSessionId]);

  const handleStartCodexAuth = async () => {
    setCodexConnecting(true);
    try {
      const payload = await submitIntent("codexAuthStart", {});
      const session = payload.session;
      if (!session?.sessionId || !session.authUrl) throw new Error("Failed to start Codex login");
      setCodexSessionId(session.sessionId);
      setCodexAuthUrl(session.authUrl);
      window.open(session.authUrl, "_blank", "noopener,noreferrer");
      showSuccess("Opened Codex login in a new tab");
    } catch (error) {
      setCodexConnecting(false);
      showError(error instanceof Error ? error.message : "Failed to start Codex login");
    }
  };

  const handleSubmitManualCode = async () => {
    if (!codexSessionId || !manualCode.trim()) return;
    setSubmittingManualCode(true);
    try {
      await submitIntent("codexAuthComplete", { sessionId: codexSessionId, code: manualCode.trim() });
      showSuccess("Authorization code submitted");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to submit authorization code");
    } finally {
      setSubmittingManualCode(false);
    }
  };

  const handleCreateModel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await submitIntent("create", {
        name: form.name, provider: form.provider, model: form.model,
        apiKey: form.apiKey, baseUrl: form.baseUrl, temperature: form.temperature,
        isDefault: "false", isActive: "true",
      });
      setForm(EMPTY_FORM);
      await fetchSettings();
      showSuccess("Model added");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add model");
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try { await submitIntent("setActive", { id }); await fetchSettings(); showSuccess("Active model updated"); }
    catch (error) { showError(error instanceof Error ? error.message : "Failed to set active model"); }
  };
  const handleSetDefault = async (id: string) => {
    try { await submitIntent("setDefault", { id }); await fetchSettings(); showSuccess("Default model updated"); }
    catch (error) { showError(error instanceof Error ? error.message : "Failed to set default model"); }
  };
  const handleDelete = async (id: string) => {
    try { await submitIntent("delete", { id }); await fetchSettings(); showSuccess("Model removed"); }
    catch (error) { showError(error instanceof Error ? error.message : "Failed to delete model"); }
  };

  const applyDiscoveredModel = (modelId: string) => {
    const selected = discoveredModels.find((item) => item.id === modelId);
    if (!selected) return;
    setForm((previous) => ({ ...previous, model: selected.id, name: previous.name || selected.name }));
  };

  const filteredDiscoveredModels = useMemo(() => {
    const q = form.model.trim().toLowerCase();
    const base = q
      ? discoveredModels.filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      : discoveredModels;
    return base.slice(0, 14);
  }, [discoveredModels, form.model]);

  const providerIcon = (provider: ProviderType) => {
    switch (provider) {
      case "openai": return <LuBrain className="h-4 w-4" />;
      case "anthropic": return <LuBot className="h-4 w-4" />;
      case "openai-codex": return <LuCodeXml className="h-4 w-4" />;
      case "openrouter": return <LuGlobe className="h-4 w-4" />;
      case "ollama": return <LuServer className="h-4 w-4" />;
      default: return <LuBrain className="h-4 w-4" />;
    }
  };

  const inputClass = "rounded-2xl glass-input px-4 py-2.5 text-sm text-[var(--text-primary)]";

  return (
    <section className="flex-1 overflow-y-auto p-5 md:p-9">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
        {/* Header card */}
        <div className="rounded-[1.75rem] glass-card-static p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Model Settings</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Select the LLM provider and model your agent should use.
          </p>
        </div>

        {/* Add model form */}
        <form onSubmit={handleCreateModel} className="rounded-[1.75rem] glass-card-static p-6">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Add Model</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Models are fetched automatically when provider, key, or base URL changes.
          </p>

          {form.provider === "openai-codex" && (
            <div className="mt-3 rounded-2xl glass-panel p-4 md:col-span-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">ChatGPT Plus or Pro</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Connect your Codex subscription once, then add any supported Codex model.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full glass-panel px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {codexConnected ? "Connected" : codexConnecting ? "Waiting for login" : "Not connected"}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartCodexAuth}
                    disabled={codexConnecting}
                    className="rounded-xl btn-glass px-3 py-2 text-xs font-medium disabled:opacity-60"
                  >
                    {codexConnected ? "Reconnect" : codexConnecting ? "Connecting..." : "Connect Codex"}
                  </button>
                </div>
              </div>
              {codexAuthUrl && (
                <div className="mt-3 space-y-2">
                  <a href={codexAuthUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs text-[var(--text-primary)] underline underline-offset-2">
                    Open login page again
                  </a>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input value={manualCode} onChange={(e) => setManualCode(e.target.value)}
                      className={`flex-1 ${inputClass}`}
                      placeholder="Paste the redirect URL or authorization code" />
                    <button type="button" onClick={handleSubmitManualCode}
                      disabled={!codexSessionId || !manualCode.trim() || submittingManualCode}
                      className="rounded-xl btn-glass px-3 py-2 text-xs font-medium disabled:opacity-60">
                      {submittingManualCode ? "Submitting..." : "Submit code"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input required value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className={inputClass} placeholder="Display name" />

            <div className="rounded-2xl glass-panel p-1">
              <div className="grid grid-cols-2 gap-1">
                {providers.map((provider) => {
                  const isActive = form.provider === provider.type;
                  return (
                    <button key={provider.type} type="button"
                      onClick={() => setForm((p) => ({ ...p, provider: provider.type }))}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                      }`}>
                      {providerIcon(provider.type)}
                      <span className="truncate">{provider.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center rounded-2xl glass-panel px-4 py-2.5 text-sm text-[var(--text-secondary)]">
              {discovering ? "Fetching provider models..." : `Detected ${discoveredModels.length} models`}
            </div>

            <input required value={form.model}
              onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
              className={inputClass} placeholder="Model id (example: gpt-4o-mini)" />

            <input value={form.temperature}
              onChange={(e) => setForm((p) => ({ ...p, temperature: e.target.value }))}
              className={inputClass} placeholder="Temperature" />

            <input value={form.apiKey}
              onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
              className={`${inputClass} md:col-span-2`}
              placeholder={form.provider === "openai-codex"
                ? "API key optional if auth.json or OPENAI_CODEX_API_KEY is available"
                : "API key (optional if server env provides it)"} />

            {providerInfo?.needsBaseUrl && (
              <input value={form.baseUrl}
                onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
                className={`${inputClass} md:col-span-2`} placeholder="Base URL" />
            )}

            {discoverError && (
              <p className="text-xs text-[var(--text-secondary)] md:col-span-2">{discoverError}</p>
            )}

            {discoveredModels.length > 0 && (
              <div className="md:col-span-2 rounded-2xl glass-panel p-2.5">
                <div className="mb-2 flex items-center gap-2 px-2 pt-1 text-xs font-medium text-[var(--text-secondary)]">
                  <LuSearch className="h-3.5 w-3.5" />
                  Available provider models
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto p-1">
                  {filteredDiscoveredModels.length === 0 ? (
                    <div className="rounded-xl px-2 py-2 text-xs text-[var(--text-secondary)]">
                      No matches for &ldquo;{form.model}&rdquo;.
                    </div>
                  ) : (
                    filteredDiscoveredModels.map((item) => {
                      const selected = form.model === item.id;
                      return (
                        <button key={item.id} type="button"
                          onClick={() => applyDiscoveredModel(item.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                            selected
                              ? "border-[#10150a] bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]"
                              : "border-transparent hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)]"
                          }`}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="truncate text-xs opacity-70">{item.id}</p>
                          </div>
                          {selected && <LuCheck className="h-4 w-4" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button disabled={saving} type="submit"
            className="mt-4 rounded-xl bg-[#10150a] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[#1c2214] hover:shadow-[var(--shadow-glass-md)] disabled:opacity-60">
            {saving ? "Saving..." : "Add model"}
          </button>
        </form>

        {/* Configured models */}
        <div className="rounded-[1.75rem] glass-card-static p-6">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Configured Models</h3>

          {loading ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading models...</p>
          ) : models.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">No models configured yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {models.map((model) => (
                <article key={model.id} className="rounded-2xl glass-panel p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#10150a]">
                          {providerIcon(model.provider)}
                        </div>
                        <p className="font-medium text-[var(--text-primary)]">{model.name}</p>
                      </div>
                      <p className="mt-1 ml-8 text-sm text-[var(--text-secondary)]">
                        {model.provider} — {model.model}
                      </p>
                      <div className="mt-2 ml-8 flex gap-2">
                        {model.isActive && (
                          <span className="rounded-full bg-[#10150a] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">Active</span>
                        )}
                        {model.isDefault && (
                          <span className="rounded-full bg-[#10150a] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">Default</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!model.isActive && (
                        <button onClick={() => handleSetActive(model.id)} type="button"
                          className="rounded-xl btn-glass px-3 py-1.5 text-xs font-medium">
                          Set Active
                        </button>
                      )}
                      {!model.isDefault && (
                        <button onClick={() => handleSetDefault(model.id)} type="button"
                          className="rounded-xl btn-glass px-3 py-1.5 text-xs font-medium">
                          Set Default
                        </button>
                      )}
                      <button onClick={() => handleDelete(model.id)} type="button"
                        className="rounded-xl btn-glass px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
