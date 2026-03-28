import { useEffect, useMemo, useState } from "react";
import { showError, showSuccess } from "../../lib/toast";
import { LuBrain, LuGlobe, LuBot, LuServer, LuSearch, LuCheck } from "react-icons/lu";

type ProviderType = "openai" | "anthropic" | "openrouter" | "ollama";

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
  success?: boolean;
  error?: string;
}

interface DiscoverApiData {
  success?: boolean;
  models?: DiscoveredModel[];
  error?: string;
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
    } catch (error) {
      console.error("Failed to load model settings", error);
      showError("Failed to load model settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const submitIntent = async (intent: string, data: Record<string, string>) => {
    const body = new FormData();
    body.append("intent", intent);
    for (const [key, value] of Object.entries(data)) {
      body.append(key, value);
    }

    const response = await fetch("/api/models", {
      method: "POST",
      body,
    });

    const payload = (await response.json()) as ApiData;
    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }

    return payload;
  };

  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const payload = (await submitIntent("discover", {
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl,
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
    const timeout = setTimeout(() => {
      discoverModels();
    }, 250);

    return () => clearTimeout(timeout);
  }, [form.provider, form.apiKey, form.baseUrl]);

  const handleCreateModel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await submitIntent("create", {
        name: form.name,
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl,
        temperature: form.temperature,
        isDefault: "false",
        isActive: "true",
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
    try {
      await submitIntent("setActive", { id });
      await fetchSettings();
      showSuccess("Active model updated");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to set active model");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await submitIntent("setDefault", { id });
      await fetchSettings();
      showSuccess("Default model updated");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to set default model");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await submitIntent("delete", { id });
      await fetchSettings();
      showSuccess("Model removed");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete model");
    }
  };

  const applyDiscoveredModel = (modelId: string) => {
    const selected = discoveredModels.find((item) => item.id === modelId);
    if (!selected) return;

    setForm((previous) => ({
      ...previous,
      model: selected.id,
      name: previous.name || selected.name,
    }));
  };

  const filteredDiscoveredModels = useMemo(() => {
    const q = form.model.trim().toLowerCase();
    const base = q
      ? discoveredModels.filter(
          (item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
        )
      : discoveredModels;
    return base.slice(0, 14);
  }, [discoveredModels, form.model]);

  const providerIcon = (provider: ProviderType) => {
    switch (provider) {
      case "openai":
        return <LuBrain className="h-4 w-4" />;
      case "anthropic":
        return <LuBot className="h-4 w-4" />;
      case "openrouter":
        return <LuGlobe className="h-4 w-4" />;
      case "ollama":
        return <LuServer className="h-4 w-4" />;
      default:
        return <LuBrain className="h-4 w-4" />;
    }
  };

  return (
    <section className="flex-1 overflow-y-auto bg-gb-bg/30 p-5 md:p-9">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
        <div className="rounded-[24px] border border-gb-border/60 bg-gb-bg-card p-6 shadow-gb-sm">
          <h2 className="text-lg font-semibold text-gb-text">Model Settings</h2>
          <p className="mt-1 text-sm text-gb-text-secondary">
            Select the LLM provider and model your agent should use.
          </p>
        </div>

        <form onSubmit={handleCreateModel} className="rounded-[24px] border border-gb-border/60 bg-gb-bg-card p-6 shadow-gb-sm">
          <h3 className="text-base font-semibold text-gb-text">Add Model</h3>
          <p className="mt-1 text-xs text-gb-text-secondary">
            Models are fetched automatically when provider, key, or base URL changes.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              required
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              className="rounded-xl border border-gb-border/70 bg-gb-bg px-3.5 py-2.5 text-sm text-gb-text"
              placeholder="Display name"
            />

            <div className="rounded-xl border border-gb-border/70 bg-gb-bg p-1">
              <div className="grid grid-cols-2 gap-1">
                {providers.map((provider) => {
                  const isActive = form.provider === provider.type;
                  return (
                    <button
                      key={provider.type}
                      type="button"
                      onClick={() => setForm((previous) => ({ ...previous, provider: provider.type }))}
                       className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                        isActive
                          ? "bg-gb-accent text-white"
                          : "text-gb-text-secondary hover:bg-gb-bg-subtle hover:text-gb-text"
                      }`}
                    >
                      {providerIcon(provider.type)}
                      <span className="truncate">{provider.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center rounded-xl border border-gb-border/70 bg-gb-bg-subtle px-3.5 py-2.5 text-sm text-gb-text-secondary">
              {discovering ? "Fetching provider models..." : `Detected ${discoveredModels.length} models`}
            </div>

            <input
              required
              value={form.model}
              onChange={(event) => setForm((previous) => ({ ...previous, model: event.target.value }))}
              className="rounded-xl border border-gb-border/70 bg-gb-bg px-3.5 py-2.5 text-sm text-gb-text"
              placeholder="Model id (example: gpt-4o-mini)"
            />

            <input
              value={form.temperature}
              onChange={(event) => setForm((previous) => ({ ...previous, temperature: event.target.value }))}
              className="rounded-xl border border-gb-border/70 bg-gb-bg px-3.5 py-2.5 text-sm text-gb-text"
              placeholder="Temperature"
            />

            <input
              value={form.apiKey}
              onChange={(event) => setForm((previous) => ({ ...previous, apiKey: event.target.value }))}
              className="rounded-xl border border-gb-border/70 bg-gb-bg px-3.5 py-2.5 text-sm text-gb-text md:col-span-2"
              placeholder="API key (optional if server env provides it)"
            />

            {providerInfo?.needsBaseUrl && (
              <input
                value={form.baseUrl}
                onChange={(event) => setForm((previous) => ({ ...previous, baseUrl: event.target.value }))}
                className="rounded-xl border border-gb-border/70 bg-gb-bg px-3.5 py-2.5 text-sm text-gb-text md:col-span-2"
                placeholder="Base URL"
              />
            )}

            {discoverError ? (
              <p className="text-xs text-gb-text-secondary md:col-span-2">{discoverError}</p>
            ) : null}

            {discoveredModels.length > 0 ? (
              <div className="md:col-span-2 rounded-2xl border border-gb-border/70 bg-gb-bg-subtle/40 p-2.5">
                <div className="mb-2 flex items-center gap-2 px-2 pt-1 text-xs font-medium text-gb-text-secondary">
                  <LuSearch className="h-3.5 w-3.5" />
                  Available provider models
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto p-1">
                  {filteredDiscoveredModels.length === 0 ? (
                    <div className="rounded-md px-2 py-2 text-xs text-gb-text-secondary">
                      No matches for "{form.model}".
                    </div>
                  ) : (
                    filteredDiscoveredModels.map((item) => {
                      const selected = form.model === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => applyDiscoveredModel(item.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-gb-accent bg-gb-accent/10"
                              : "border-transparent hover:border-gb-border hover:bg-gb-bg"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gb-text">{item.name}</p>
                            <p className="truncate text-xs text-gb-text-secondary">{item.id}</p>
                          </div>
                          {selected ? <LuCheck className="h-4 w-4 text-gb-accent" /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <button
            disabled={saving}
            type="submit"
            className="mt-4 rounded-xl bg-gb-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add model"}
          </button>
        </form>

        <div className="rounded-[24px] border border-gb-border/60 bg-gb-bg-card p-6 shadow-gb-sm">
          <h3 className="text-base font-semibold text-gb-text">Configured Models</h3>

          {loading ? (
            <p className="mt-3 text-sm text-gb-text-secondary">Loading models...</p>
          ) : models.length === 0 ? (
            <p className="mt-3 text-sm text-gb-text-secondary">No models configured yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {models.map((model) => (
                <article key={model.id} className="rounded-2xl border border-gb-border/70 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-gb-text">{model.name}</p>
                      <p className="text-sm text-gb-text-secondary">
                        {model.provider} - {model.model}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {model.isActive ? (
                          <span className="rounded bg-gb-bg-subtle px-2 py-0.5 text-xs text-gb-text-secondary">Active</span>
                        ) : null}
                        {model.isDefault ? (
                          <span className="rounded bg-gb-bg-subtle px-2 py-0.5 text-xs text-gb-text-secondary">Default</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!model.isActive ? (
                        <button
                          onClick={() => handleSetActive(model.id)}
                          className="rounded border border-gb-border px-3 py-1.5 text-xs text-gb-text-secondary hover:bg-gb-bg-subtle"
                          type="button"
                        >
                          Set Active
                        </button>
                      ) : null}

                      {!model.isDefault ? (
                        <button
                          onClick={() => handleSetDefault(model.id)}
                          className="rounded border border-gb-border px-3 py-1.5 text-xs text-gb-text-secondary hover:bg-gb-bg-subtle"
                          type="button"
                        >
                          Set Default
                        </button>
                      ) : null}

                      <button
                        onClick={() => handleDelete(model.id)}
                        className="rounded border border-gb-border px-3 py-1.5 text-xs text-gb-text-secondary hover:bg-gb-bg-subtle"
                        type="button"
                      >
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
