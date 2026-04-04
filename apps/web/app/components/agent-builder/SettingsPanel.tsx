import { useEffect, useMemo, useState, useCallback } from "react";
import { showSuccess } from "../../lib/toast";
import { LuPlus, LuEye, LuEyeOff, LuX } from "react-icons/lu";
import { ModelSelector, ModelSelectorVariant, getResolvedModelIconUrl } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ProviderIcon } from "./ProviderIcon";
import { ModelCard } from "./ModelCard";
import {
  useModelSettings,
  useDiscoverModels,
  EMPTY_FORM,
  type ProviderType,
  type ModelConfig,
} from "../../hooks/useModelSettings";
import { useCodexAuth } from "../../hooks/useCodexAuth";

interface FormData {
  name: string;
  provider: ProviderType;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: string;
}

const DEFAULT_EDIT_FORM: FormData = {
  name: "",
  provider: "openai" as ProviderType,
  model: "",
  baseUrl: "",
  temperature: "0.2",
  apiKey: "",
};

const inputClass =
  "w-full rounded-xl glass-input px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-border-strong)] transition-all";

function buildModelOptions(
  discoveredModels: Array<{ id: string; name: string; provider: ProviderType; model: string }>,
  configuredModels: ModelConfig[],
  provider: ProviderType
): ModelOption[] {
  const discovered = new Set(discoveredModels.map((m) => m.id));
  const configured = configuredModels
    .filter((m) => m.provider === provider)
    .map((m) => ({
      id: m.model,
      name: m.name,
      provider: m.provider as ModelOption["provider"],
      model: m.model,
      baseUrl: m.baseUrl || "",
      temperature: m.temperature || "0.2",
      isConfigured: true,
    }))
    .filter((m) => !discovered.has(m.model));
  return [...discoveredModels, ...configured];
}

export function SettingsPanel() {
  const {
    models,
    providers,
    loading,
    saving,
    activeModel,
    createModel,
    updateModel,
    setActiveModel,
    setDefaultModel,
    deleteModel,
  } = useModelSettings();

  const codexAuth = useCodexAuth();
  const discoverModels = useDiscoverModels();
  const editDiscoverModels = useDiscoverModels();

  const [form, setForm] = useState<FormData>(EMPTY_FORM as FormData);
  const [showApiKey, setShowApiKey] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<FormData>(DEFAULT_EDIT_FORM);
  const [existingApiKey, setExistingApiKey] = useState(false);
  const [editExistingApiKey, setEditExistingApiKey] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [submittingManualCode, setSubmittingManualCode] = useState(false);

  const providerInfo = useMemo(
    () => providers.find((provider) => provider.type === form.provider),
    [providers, form.provider]
  );

  const providerModelOptions = useMemo(
    () => buildModelOptions(discoverModels.discoveredModels, models, form.provider),
    [discoverModels.discoveredModels, models, form.provider]
  );

  const editProviderModelOptions = useMemo(
    () => buildModelOptions(editDiscoverModels.discoveredModels, models, editForm.provider),
    [editDiscoverModels.discoveredModels, models, editForm.provider]
  );

  useEffect(() => {
    discoverModels.reset();
    if (form.apiKey.trim().length > 0 || existingApiKey) {
      const timeout = setTimeout(() => {
        void discoverModels.discover(form.provider, form.apiKey, form.baseUrl);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [existingApiKey, form.provider, form.apiKey, form.baseUrl]);

  useEffect(() => {
    if (!editModalOpen) return;
    editDiscoverModels.reset();
    if (editForm.apiKey.trim().length > 0 || editExistingApiKey) {
      const timeout = setTimeout(() => {
        void editDiscoverModels.discover(editForm.provider, editForm.apiKey, editForm.baseUrl);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [editExistingApiKey, editModalOpen, editForm.provider, editForm.apiKey, editForm.baseUrl]);

  useEffect(() => {
    if (editingId) return;
    const providerConfig = models.find((model) => model.provider === form.provider && Boolean(model.apiKey?.trim() || model.hasApiKey));
    setExistingApiKey(Boolean(providerConfig));
  }, [editingId, form.provider, models]);

  const handleCreateModel = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const success = await createModel({
        name: form.name,
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl,
        temperature: form.temperature,
        isDefault: "false",
        isActive: "true",
      });
      if (success) {
        setForm(EMPTY_FORM as FormData);
        showSuccess("Model added");
      }
    },
    [form, createModel]
  );

  const handleUpdateModel = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingId) return;
      const success = await updateModel(editingId, {
        name: editForm.name,
        provider: editForm.provider,
        model: editForm.model,
        baseUrl: editForm.baseUrl,
        temperature: editForm.temperature,
        isDefault: "false",
        isActive: "true",
      });
      if (success) {
        handleCancelEdit();
        showSuccess("Model updated");
      }
    },
    [editingId, editForm, updateModel]
  );

  const handleSetActive = useCallback(
    async (id: string) => {
      const success = await setActiveModel(id);
      if (success) {
        showSuccess("Active model updated");
      }
    },
    [setActiveModel]
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      const success = await setDefaultModel(id);
      if (success) {
        showSuccess("Default model updated");
      }
    },
    [setDefaultModel]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteModel(id);
      if (success) {
        showSuccess("Model removed");
      }
    },
    [deleteModel]
  );

  const handleEditModel = useCallback((model: ModelConfig) => {
      setEditForm({
        name: model.name,
        provider: model.provider,
        model: model.model,
        baseUrl: model.baseUrl || "",
        temperature: model.temperature || "0.2",
        apiKey: "",
      });
      setEditExistingApiKey(Boolean(model.apiKey?.trim() || model.hasApiKey));
      setEditingId(model.id);
      setEditModalOpen(true);
      editDiscoverModels.reset();
    }, []);

  const handleCancelEdit = useCallback(() => {
    setEditForm(DEFAULT_EDIT_FORM);
    setEditExistingApiKey(false);
    setEditingId(null);
    setEditModalOpen(false);
    editDiscoverModels.reset();
  }, []);

  const handleSelectDiscoveredModel = useCallback((modelId: string) => {
    const found = providerModelOptions.find((m) => m.id === modelId);
    if (found) {
      setForm((prev) => ({
        ...prev,
        model: found.model,
        name: found.name,
        baseUrl: "baseUrl" in found ? (found.baseUrl as string) : "",
        temperature: "temperature" in found ? (found.temperature as string) : "0.2",
      }));
    }
  }, [providerModelOptions]);

  const handleSelectEditDiscoveredModel = useCallback((modelId: string) => {
    const found = editProviderModelOptions.find((m) => m.id === modelId);
    if (found) {
      setEditForm((prev) => ({
        ...prev,
        model: found.model,
        name: found.name,
      }));
    }
  }, [editProviderModelOptions]);

  const handleSubmitManualCode = useCallback(async () => {
    if (!codexAuth.sessionId || !manualCode.trim()) return;
    setSubmittingManualCode(true);
    try {
      const success = await codexAuth.submitManualCode(manualCode.trim());
      if (success) {
        setManualCode("");
      }
    } finally {
      setSubmittingManualCode(false);
    }
  }, [codexAuth, manualCode]);

  return (
    <section className="flex-1 overflow-y-auto px-4 pb-4 pt-16 md:px-6 md:pb-6 md:pt-16 lg:px-8 lg:pb-8 lg:pt-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <HeaderSection activeModel={activeModel} />

        <AddModelForm
          form={form}
          setForm={setForm}
          providers={providers}
          providerInfo={providerInfo}
          providerModelOptions={providerModelOptions}
          discoverModels={discoverModels}
          saving={saving}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          onSubmit={handleCreateModel}
          onSelectModel={handleSelectDiscoveredModel}
          codexAuth={codexAuth}
          manualCode={manualCode}
          setManualCode={setManualCode}
          submittingManualCode={submittingManualCode}
          onSubmitManualCode={handleSubmitManualCode}
        />

        <ConfiguredModelsSection
          loading={loading}
          models={models}
          onSetActive={handleSetActive}
          onSetDefault={handleSetDefault}
          onEdit={handleEditModel}
          onDelete={handleDelete}
        />

        {editModalOpen && (
          <EditModelModal
            editForm={editForm}
            setEditForm={setEditForm}
            providers={providers}
            editProviderModelOptions={editProviderModelOptions}
            editDiscoverModels={editDiscoverModels}
            saving={saving}
            onSubmit={handleUpdateModel}
            onCancel={handleCancelEdit}
            onSelectModel={handleSelectEditDiscoveredModel}
          />
        )}
      </div>
    </section>
  );
}

function HeaderSection({ activeModel }: { activeModel: ModelConfig | undefined }) {
  return (
    <div className="rounded-2xl glass-card-static p-5">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Model Settings</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Configure AI providers and models for your agent.
      </p>
      {activeModel && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl glass-panel px-3 py-2 text-xs">
          <span className="text-[var(--text-muted)]">Currently using:</span>
          <span className="font-medium text-[var(--text-primary)]">{activeModel.name}</span>
          <span className="text-[var(--text-muted)]">({activeModel.provider} / {activeModel.model})</span>
        </div>
      )}
    </div>
  );
}

function ProviderSelector({
  providers,
  selectedProvider,
  onSelect,
}: {
  providers: Array<{ type: ProviderType; name: string }>;
  selectedProvider: ProviderType;
  onSelect: (provider: ProviderType) => void;
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
                  ? "bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                  isActive ? "bg-gradient-to-br from-white/90 to-white/60 shadow-sm" : "bg-[var(--glass-bg-strong)]"
                }`}
              >
                <ProviderIcon provider={provider.type} />
              </span>
              <span className="truncate">{provider.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CodexOAuthSection({
  codexAuth,
  manualCode,
  setManualCode,
  submittingManualCode,
  onSubmitManualCode,
}: {
  codexAuth: ReturnType<typeof useCodexAuth>;
  manualCode: string;
  setManualCode: (code: string) => void;
  submittingManualCode: boolean;
  onSubmitManualCode: () => void;
}) {
  const isConnected = codexAuth.isConnected;
  const isConnecting = codexAuth.isConnecting;

  return (
    <div className="mt-4 rounded-xl glass-panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">ChatGPT Plus or Pro</p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Connect your Codex subscription once, then add any supported Codex model.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isConnected
                ? "bg-emerald-500/20 text-emerald-400"
                : isConnecting
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"
            }`}
          >
            {isConnected ? "Connected" : isConnecting ? "Waiting..." : "Not connected"}
          </span>
          <button
            type="button"
            onClick={() => void codexAuth.startAuth()}
            disabled={isConnecting}
            className="rounded-lg btn-glass px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {isConnected ? "Reconnect" : isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
      {codexAuth.authUrl && (
        <div className="mt-3 space-y-2">
          <a
            href={codexAuth.authUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-xs text-[var(--accent)] underline underline-offset-2"
          >
            Open login page again
          </a>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className={inputClass}
              placeholder="Paste the redirect URL or authorization code"
            />
            <button
              type="button"
              onClick={() => void onSubmitManualCode()}
              disabled={!codexAuth.sessionId || !manualCode.trim() || submittingManualCode}
              className="rounded-lg btn-glass px-3 py-2 text-xs font-medium disabled:opacity-60 whitespace-nowrap"
            >
              {submittingManualCode ? "Submitting..." : "Submit code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddModelForm({
  form,
  setForm,
  providers,
  providerInfo,
  providerModelOptions,
  discoverModels,
  saving,
  showApiKey,
  setShowApiKey,
  onSubmit,
  onSelectModel,
  codexAuth,
  manualCode,
  setManualCode,
  submittingManualCode,
  onSubmitManualCode,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  providers: Array<{ type: ProviderType; name: string; needsBaseUrl: boolean }>;
  providerInfo: { type: ProviderType; name: string; needsBaseUrl: boolean } | undefined;
  providerModelOptions: ModelOption[];
  discoverModels: ReturnType<typeof useDiscoverModels>;
  saving: boolean;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectModel: (modelId: string) => void;
  codexAuth: ReturnType<typeof useCodexAuth>;
  manualCode: string;
  setManualCode: (code: string) => void;
  submittingManualCode: boolean;
  onSubmitManualCode: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="relative rounded-2xl glass-card-static p-5" style={{ zIndex: 60 }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Add Model</h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Pick a provider, enter your API key, and select a model.
          </p>
        </div>
      </div>

      {form.provider === "openai-codex" && (
        <CodexOAuthSection
          codexAuth={codexAuth}
          manualCode={manualCode}
          setManualCode={setManualCode}
          submittingManualCode={submittingManualCode}
          onSubmitManualCode={onSubmitManualCode}
        />
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Provider</label>
          <ProviderSelector
            providers={providers}
            selectedProvider={form.provider}
            onSelect={(provider) => {
              setForm((prev) => ({ ...prev, provider, model: "", baseUrl: "" }));
              discoverModels.reset();
            }}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            API Key {form.provider === "openai-codex" ? "(optional if connected)" : ""}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={form.apiKey}
              onChange={(e) => {
                const value = e.target.value;
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
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showApiKey ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
            </button>
          </div>
          {existingApiKey && !form.apiKey.trim() && (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              A saved API key will be reused for this provider unless you enter a replacement.
            </p>
          )}
        </div>

        {providerInfo?.needsBaseUrl && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Base URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              className={inputClass}
              placeholder="https://api.example.com/v1"
            />
          </div>
        )}

        <div className="relative z-50">
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Model</label>
          <ModelSelector
            models={providerModelOptions}
            selectedModelId={form.model || null}
            onSelectModel={onSelectModel}
            isLoading={discoverModels.discovering}
            className="w-full"
            direction="down"
            variant={ModelSelectorVariant.Picker}
              onOpen={() => {
                if ((form.apiKey.trim().length > 0 || existingApiKey) && discoverModels.discoveredModels.length === 0 && !discoverModels.discovering) {
                  void discoverModels.discover(form.provider, form.apiKey, form.baseUrl);
                }
              }}
            placeholder={
              discoverModels.discovering
                ? "Fetching models..."
                : discoverModels.error
                  ? "Error fetching models"
                  : form.apiKey.trim().length > 0 || existingApiKey
                    ? "Select a model..."
                    : "Enter API key to browse models"
            }
          />
          {discoverModels.error && <p className="mt-1.5 text-xs text-red-400">{discoverModels.error}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className={inputClass}
            placeholder="My Model"
          />
        </div>

        <div className="sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Temperature</label>
          <input
            value={form.temperature}
            onChange={(e) => setForm((prev) => ({ ...prev, temperature: e.target.value }))}
            className={inputClass}
            placeholder="0.2"
            type="number"
            step="0.1"
            min="0"
            max="2"
          />
        </div>
      </div>

      <button
        disabled={saving || !form.model.trim() || !form.name.trim()}
        type="submit"
        className="mt-5 flex items-center gap-2 rounded-xl bg-[#10150a] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[#1c2214] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <LuPlus className="h-4 w-4" />
        {saving ? "Saving..." : "Add Model"}
      </button>
    </form>
  );
}

function ConfiguredModelsSection({
  loading,
  models,
  onSetActive,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  loading: boolean;
  models: ModelConfig[];
  onSetActive: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEdit: (model: ModelConfig) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative rounded-2xl glass-card-static p-5" style={{ zIndex: 10 }}>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Configured Models</h3>

      {loading ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Loading...</p>
      ) : models.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">No models configured yet. Add one above.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onSetActive={onSetActive}
              onSetDefault={onSetDefault}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditModelModal({
  editForm,
  setEditForm,
  providers,
  editProviderModelOptions,
  editDiscoverModels,
  saving,
  onSubmit,
  onCancel,
  onSelectModel,
}: {
  editForm: FormData;
  setEditForm: React.Dispatch<React.SetStateAction<FormData>>;
  providers: Array<{ type: ProviderType; name: string }>;
  editProviderModelOptions: ModelOption[];
  editDiscoverModels: ReturnType<typeof useDiscoverModels>;
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onSelectModel: (modelId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl glass-panel-strong p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Edit Model</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Update the model configuration</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Provider</label>
            <ProviderSelector
              providers={providers}
              selectedProvider={editForm.provider}
              onSelect={(provider) => setEditForm((prev) => ({ ...prev, provider }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              API Key {editForm.provider === "openai-codex" ? "(optional if connected)" : ""}
            </label>
            <input
              type="password"
              value={editForm.apiKey}
              onChange={(e) => {
                const value = e.target.value;
                setEditForm((prev) => ({ ...prev, apiKey: value }));
                if (value.trim().length > 0) {
                  setEditExistingApiKey(true);
                }
              }}
              className={inputClass}
              placeholder={editExistingApiKey ? "Saved key available" : "sk-..."}
            />
            {editExistingApiKey && !editForm.apiKey.trim() && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                A saved API key will be reused for this provider unless you enter a replacement.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Model</label>
            <ModelSelector
              models={editProviderModelOptions}
              selectedModelId={editForm.model || null}
              onSelectModel={onSelectModel}
              isLoading={editDiscoverModels.discovering}
              className="w-full"
              direction="down"
              variant={ModelSelectorVariant.Picker}
              onOpen={() => {
                if ((editForm.apiKey.trim().length > 0 || editExistingApiKey) && editDiscoverModels.discoveredModels.length === 0 && !editDiscoverModels.discovering) {
                  void editDiscoverModels.discover(editForm.provider, editForm.apiKey, editForm.baseUrl);
                }
              }}
              placeholder={
                editDiscoverModels.discovering
                  ? "Fetching models..."
                  : editDiscoverModels.error
                    ? "Error fetching models"
                    : editForm.apiKey.trim().length > 0 || editExistingApiKey
                      ? "Select a model..."
                      : "Enter API key to browse models"
              }
            />
            {editDiscoverModels.error && <p className="mt-1.5 text-xs text-red-400">{editDiscoverModels.error}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label>
            <input
              required
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              className={inputClass}
              placeholder="My Model"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Base URL</label>
            <input
              value={editForm.baseUrl}
              onChange={(e) => setEditForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              className={inputClass}
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="sm:w-1/2">
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Temperature</label>
            <input
              value={editForm.temperature}
              onChange={(e) => setEditForm((prev) => ({ ...prev, temperature: e.target.value }))}
              className={inputClass}
              placeholder="0.2"
              type="number"
              step="0.1"
              min="0"
              max="2"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl glass-panel px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--glass-bg-strong)]"
            >
              Cancel
            </button>
            <button
              disabled={saving || !editForm.model.trim() || !editForm.name.trim()}
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#10150a] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[#1c2214] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Update Model"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
