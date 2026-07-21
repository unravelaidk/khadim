import {
  Robot as Bot,
  Check,
  CheckCircle as CircleCheck,
  CaretDown as ChevronDown,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  CreditCard,
  NotePencil as FilePenLine,
  FolderOpen,
  Gauge,
  Monitor,
  Moon,
  Palette,
  Plus,
  MagnifyingGlass as Search,
  Sun,
  Trash as Trash2,
  UserCircle as UserRound,
  MagicWand as WandSparkles,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, CodexAuthStatus, CustomTheme, ModelCatalogProvider, SettingsUpdate, ThemeMode, ThemePalette } from "../../../shared/types";
import { BUILT_IN_THEMES, type BuiltInTheme } from "../../../shared/themes";
import { safeModelBaseUrl } from "../../../shared/model-endpoint-policy";
import { applyDocumentTheme } from "../theme/document-theme";
import { ModelIcon } from "../ui/ModelIcon";
import { Button, IconButton } from "../ui/primitives";
import { useDialogFocus } from "../ui/use-dialog-focus";

const customModelValue = "__custom_model__";
const newCustomThemePalette: ThemePalette = { background: "#15141b", surface: "#21202e", elevated: "#2d2b3a", text: "#edecee", muted: "#a394b8", accent: "#a277ff" };

export function SettingsDialog({ settings, initialSection, initialProvider, onClose, onSave }: { settings: AppSettings; initialSection?: "appearance" | "model" | "workspace"; initialProvider?: string; onClose: () => void; onSave: (settings: AppSettings) => void | Promise<void> }): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<"appearance" | "model" | "workspace">(initialSection ?? "appearance");
  const initialDraft = useMemo<SettingsUpdate>(() => ({
    provider: settings.provider,
    model: settings.model,
    models: settings.models.map(({ hasApiKey: _hasApiKey, ...model }) => model),
    activeProjectId: settings.activeProjectId,
    workspace: settings.workspace,
    harness: settings.harness,
    theme: settings.theme,
    customThemes: settings.customThemes ?? [],
  }), [settings]);
  const [draft, setDraft] = useState<SettingsUpdate>(initialDraft);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [defaultModelSearch, setDefaultModelSearch] = useState("");
  const [pendingModelDeleteId, setPendingModelDeleteId] = useState<string | null>(null);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modelForm, setModelForm] = useState({ name: "", provider: "", model: "", apiKey: "", baseUrl: "", temperature: "0.2" });
  const [modelFieldError, setModelFieldError] = useState<{ field: "name" | "model" | "temperature" | "baseUrl"; message: string } | null>(null);
  const [clearModelApiKey, setClearModelApiKey] = useState(false);
  const [importAllProviderModels, setImportAllProviderModels] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogProvider[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [themeSearch, setThemeSearch] = useState("");
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [themeForm, setThemeForm] = useState<{ name: string; appearance: "light" | "dark"; palette: ThemePalette }>({ name: "", appearance: "dark", palette: { ...newCustomThemePalette } });
  const [codexConnected, setCodexConnected] = useState<boolean | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexAuthStatus>({ status: "idle" });
  const codexSyncStarted = useRef(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const defaultModelSearchRef = useRef<HTMLInputElement>(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const dialogRef = useDialogFocus<HTMLElement>(requestClose);

  const selectableThemes = useMemo<Array<BuiltInTheme | (CustomTheme & { family: "Custom"; description: string })>>(() => [
    ...BUILT_IN_THEMES,
    ...(draft.customThemes ?? []).map((theme) => ({ ...theme, family: "Custom" as const, description: `${theme.appearance === "dark" ? "Dark" : "Light"} custom palette` })),
  ], [draft.customThemes]);
  const normalizedThemeSearch = themeSearch.trim().toLowerCase();
  const visibleThemes = selectableThemes.filter((theme) => !normalizedThemeSearch
    || theme.name.toLowerCase().includes(normalizedThemeSearch)
    || theme.family.toLowerCase().includes(normalizedThemeSearch));

  useEffect(() => {
    if (!isDirty) setDiscardConfirmationOpen(false);
  }, [isDirty]);

  useEffect(() => {
    if (discardConfirmationOpen) keepEditingRef.current?.focus({ preventScroll: true });
  }, [discardConfirmationOpen]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const preview = () => applyDocumentTheme(draft.theme, draft.customThemes, media.matches);
    preview();
    media.addEventListener("change", preview);
    return () => media.removeEventListener("change", preview);
  }, [draft.theme, draft.customThemes]);

  useEffect(() => () => {
    applyDocumentTheme(settings.theme, settings.customThemes, window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, [settings]);

  function addCustomTheme(): void {
    const name = themeForm.name.trim();
    if (!name) {
      setDialogError("Give your theme a name.");
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "theme";
    const id = `custom:${slug}-${crypto.randomUUID().slice(0, 8)}` as const;
    const theme: CustomTheme = { id, name, appearance: themeForm.appearance, palette: { ...themeForm.palette } };
    setDraft((current) => ({ ...current, theme: id, customThemes: [...(current.customThemes ?? []), theme] }));
    setThemeForm({ name: "", appearance: "dark", palette: { ...newCustomThemePalette } });
    setThemeEditorOpen(false);
    setDialogError(null);
  }

  function removeCustomTheme(id: CustomTheme["id"]): void {
    setDraft((current) => ({
      ...current,
      theme: current.theme === id ? "aura" : current.theme,
      customThemes: (current.customThemes ?? []).filter((theme) => theme.id !== id),
    }));
  }

  function finishClose(): void {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onClose, reducedMotion ? 0 : 150);
  }

  function requestClose(): void {
    if (saving) return;
    if (isDirty) {
      setDiscardConfirmationOpen(true);
      return;
    }
    finishClose();
  }

  useEffect(() => {
    if (activeSection !== "model" || catalogStatus !== "loading") return;
    let cancelled = false;
    void window.khadim.models.catalog().then((catalog) => {
      if (cancelled) return;
      setModelCatalog(catalog);
      setCatalogStatus("ready");
      const preferredProvider = catalog.find((provider) => provider.id === initialProvider)
        ?? catalog.find((provider) => provider.id === settings.provider)
        ?? catalog[0];
      const preferredModel = preferredProvider?.models.find((model) => model.id === settings.model) ?? preferredProvider?.models[0];
      if (preferredProvider) {
        setModelForm((current) => current.model ? current : { ...current, provider: preferredProvider.id, model: preferredModel?.id ?? "", name: preferredModel?.name ?? "", baseUrl: preferredProvider.baseUrl ?? "" });
      }
    }).catch(() => {
      if (!cancelled) setCatalogStatus("error");
    });
    return () => { cancelled = true; };
  }, [activeSection, catalogStatus]);

  const selectedProvider = modelCatalog.find((provider) => provider.id === modelForm.provider);
  const isCodexProvider = selectedProvider?.id === "openai-codex";
  const selectedCatalogModel = selectedProvider?.models.find((model) => model.id === modelForm.model);
  const normalizedModelSearch = modelSearch.trim().toLowerCase();
  const normalizedProviderSearch = providerSearch.trim().toLowerCase();
  const visibleCatalogProviders = modelCatalog.filter((provider) => (
    !normalizedProviderSearch
    || provider.id.toLowerCase().includes(normalizedProviderSearch)
    || provider.name.toLowerCase().includes(normalizedProviderSearch)
  ));
  const visibleCatalogModels = selectedProvider?.models.filter((model) => (
    !normalizedModelSearch
    || model.id.toLowerCase().includes(normalizedModelSearch)
    || model.name.toLowerCase().includes(normalizedModelSearch)
  )) ?? [];
  const activeDraftModel = draft.models.find((model) => model.isActive) ?? draft.models[0];
  const normalizedDefaultModelSearch = defaultModelSearch.trim().toLowerCase();
  const visibleSavedModels = draft.models.filter((model) => (
    !normalizedDefaultModelSearch
    || model.name.toLowerCase().includes(normalizedDefaultModelSearch)
    || model.model.toLowerCase().includes(normalizedDefaultModelSearch)
    || model.provider.toLowerCase().includes(normalizedDefaultModelSearch)
  ));
  const editingPublicModel = editingModelId ? settings.models.find((model) => model.id === editingModelId) : undefined;
  const editingDraftModel = editingModelId ? draft.models.find((model) => model.id === editingModelId) : undefined;
  const credentialScopeUnchanged = Boolean(editingPublicModel
    && editingPublicModel.provider === modelForm.provider
    && editingPublicModel.model === modelForm.model
    && (editingPublicModel.baseUrl ?? "") === (modelForm.baseUrl || ""));
  const modelHasSavedApiKey = !clearModelApiKey && Boolean(
    (editingPublicModel?.hasApiKey && credentialScopeUnchanged)
    || editingDraftModel?.apiKey,
  );
  const providerCatalogImport = !editingModelId && !isCodexProvider && importAllProviderModels
    ? selectedProvider?.models ?? []
    : [];
  const providerCatalogModelsToAdd = providerCatalogImport.filter((catalogModel) => !draft.models.some((model) => (
    model.provider === modelForm.provider
    && model.model === catalogModel.id
    && (model.baseUrl ?? "") === modelForm.baseUrl.trim()
  )));
  const modelEditorActionLabel = editingModelId
    ? "Update model"
    : importAllProviderModels && selectedProvider
      ? `Add all ${selectedProvider.models.length} models`
      : `Add ${modelForm.name || "selected model"}`;

  useEffect(() => {
    if (!modelSelectorOpen) return undefined;
    defaultModelSearchRef.current?.focus({ preventScroll: true });
    const closeOnOutsidePress = (event: PointerEvent): void => {
      if (!modelSelectorRef.current?.contains(event.target as Node)) {
        setModelSelectorOpen(false);
        setDefaultModelSearch("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [modelSelectorOpen]);

  useEffect(() => {
    if (!isCodexProvider) return;
    let cancelled = false;
    void window.khadim.auth.codexConnected()
      .then((connected) => {
        if (!cancelled) setCodexConnected(connected);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setDialogError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [isCodexProvider]);

  useEffect(() => {
    if (codexStatus.status !== "pending") return;
    const interval = window.setInterval(() => {
      void window.khadim.auth.codexLoginStatus().then((status) => {
        setCodexStatus(status);
        if (status.status === "connected") {
          setCodexConnected(true);
          if (!codexSyncStarted.current) {
            codexSyncStarted.current = true;
            void window.khadim.models.syncCodex(true)
              .then(onSave)
              .catch((cause: unknown) => {
                codexSyncStarted.current = false;
                setDialogError(cause instanceof Error ? cause.message : String(cause));
              });
          }
          void window.khadim.models.catalog().then((catalog) => {
            setModelCatalog(catalog);
            const provider = catalog.find((candidate) => candidate.id === "openai-codex");
            setModelForm((current) => {
              if (current.provider !== "openai-codex" || !provider) return current;
              const model = provider.models.find((candidate) => candidate.id === current.model)
                ?? provider.models[0];
              return model ? { ...current, model: model.id, name: model.name } : current;
            });
          });
        }
        if (status.status === "failed") setDialogError(status.error ?? "OpenAI Codex login failed.");
      });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [codexStatus.status]);

  async function connectCodex(): Promise<void> {
    setDialogError(null);
    setCodexStatus({ status: "pending" });
    try {
      const session = await window.khadim.auth.startCodexLogin();
      setCodexStatus({ status: "pending", authUrl: session.authUrl });
      await window.khadim.shell.openExternal(session.authUrl);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      setCodexStatus({ status: "failed", error });
      setDialogError(error);
    }
  }

  function resetModelForm(): void {
    setEditingModelId(null);
    const provider = modelCatalog[0];
    const model = provider?.models[0];
    setModelForm({ name: model?.name ?? "", provider: provider?.id ?? "", model: model?.id ?? "", apiKey: "", baseUrl: provider?.baseUrl ?? "", temperature: "0.2" });
    setClearModelApiKey(false);
    setImportAllProviderModels(false);
    setProviderSearch("");
    setModelSearch("");
    setModelFieldError(null);
  }

  function openModelEditor(): void {
    resetModelForm();
    setModelEditorOpen(true);
  }

  function closeModelEditor(): void {
    resetModelForm();
    setModelEditorOpen(false);
  }

  function selectProvider(providerId: string): void {
    const provider = modelCatalog.find((option) => option.id === providerId);
    const model = provider?.models[0];
    setModelForm({ ...modelForm, provider: providerId, model: model?.id ?? "", name: model?.name ?? "", apiKey: "", baseUrl: provider?.baseUrl ?? "" });
    setClearModelApiKey(false);
    setImportAllProviderModels(false);
    setProviderSearch("");
    setModelSearch("");
    setModelFieldError(null);
  }

  function selectModel(modelId: string): void {
    setImportAllProviderModels(false);
    if (modelId === customModelValue) {
      setModelForm({ ...modelForm, model: "", name: "" });
      return;
    }
    const model = selectedProvider?.models.find((option) => option.id === modelId);
    if (model) setModelForm({ ...modelForm, model: model.id, name: model.name });
  }

  function selectDefaultModel(modelId: string): void {
    setDraft((current) => ({
      ...current,
      models: current.models.map((model) => ({ ...model, isActive: model.id === modelId })),
    }));
    setModelSelectorOpen(false);
    setDefaultModelSearch("");
  }

  function moveModelOptionFocus(event: React.KeyboardEvent<HTMLElement>, direction: 1 | -1): void {
    event.preventDefault();
    const listbox = event.currentTarget.closest('[role="listbox"]');
    const options = listbox ? Array.from(listbox.querySelectorAll<HTMLButtonElement>('[role="option"]')) : [];
    if (options.length === 0) return;
    const currentIndex = options.indexOf(event.currentTarget as HTMLButtonElement);
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : options.length - 1
      : (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus({ preventScroll: true });
  }

  function editModel(model: SettingsUpdate["models"][number]): void {
    setEditingModelId(model.id);
    setModelForm({
      name: model.name,
      provider: model.provider,
      model: model.model,
      apiKey: "",
      baseUrl: model.baseUrl ?? "",
      temperature: model.temperature ?? "0.2",
    });
    setModelFieldError(null);
    setClearModelApiKey(false);
    setModelEditorOpen(true);
  }

  function addOrUpdateModel(): void {
    if (!modelForm.model.trim()) {
      setModelFieldError({ field: "model", message: "Enter the model ID supplied by your provider." });
      return;
    }
    if (!modelForm.name.trim()) {
      setModelFieldError({ field: "name", message: "Enter a name that will help you recognize this model." });
      return;
    }
    const temperature = Number(modelForm.temperature);
    if (!modelForm.temperature.trim() || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setModelFieldError({ field: "temperature", message: "Temperature must be a number from 0 to 2." });
      return;
    }
    if (modelForm.baseUrl.trim()) {
      try {
        safeModelBaseUrl(modelForm.baseUrl, "invalid");
      } catch {
        setModelFieldError({ field: "baseUrl", message: "Base URL must use HTTPS unless it points to localhost or a loopback address." });
        return;
      }
    }
    setDialogError(null);
    setModelFieldError(null);
    if (editingModelId) {
      setDraft((current) => ({
        ...current,
        models: current.models.map((model) => model.id === editingModelId ? {
          ...model,
          ...modelForm,
          name: modelForm.name.trim(),
          model: modelForm.model.trim(),
          apiKey: clearModelApiKey ? undefined : modelForm.apiKey || model.apiKey,
          clearApiKey: clearModelApiKey || undefined,
        } : model),
      }));
    } else {
      setDraft((current) => {
        const apiKey = modelForm.apiKey.trim() || undefined;
        const baseUrl = modelForm.baseUrl.trim() || undefined;
        const importProviderCatalog = Boolean(selectedProvider && !isCodexProvider && importAllProviderModels);
        const catalogModels = importProviderCatalog ? [...selectedProvider!.models] : [];
        if (!catalogModels.some((model) => model.id === modelForm.model.trim())) {
          catalogModels.push({ id: modelForm.model.trim(), name: modelForm.name.trim() });
        }
        const candidates = catalogModels.length > 0
          ? catalogModels
          : [{ id: modelForm.model.trim(), name: modelForm.name.trim() }];
        let selectedId = "";
        let models = current.models.map((model) => {
          const sameConnection = importProviderCatalog
            && model.provider === modelForm.provider
            && (model.baseUrl ?? "") === (baseUrl ?? "");
          if (model.model === modelForm.model.trim() && sameConnection) selectedId = model.id;
          return sameConnection ? { ...model, apiKey, clearApiKey: undefined } : model;
        });
        for (const candidate of candidates) {
          const existing = models.find((model) => (
            model.provider === modelForm.provider
            && model.model === candidate.id
            && (model.baseUrl ?? "") === (baseUrl ?? "")
          ));
          if (existing) {
            if (apiKey && candidate.id === modelForm.model.trim()) {
              models = models.map((model) => model.id === existing.id ? { ...model, apiKey, clearApiKey: undefined } : model);
            }
            if (candidate.id === modelForm.model.trim()) selectedId = existing.id;
            continue;
          }
          const id = crypto.randomUUID();
          if (candidate.id === modelForm.model.trim()) selectedId = id;
          models.push({
            id,
            name: candidate.id === modelForm.model.trim() ? modelForm.name.trim() : candidate.name,
            provider: modelForm.provider,
            model: candidate.id,
            baseUrl,
            temperature: modelForm.temperature,
            isDefault: current.models.length === 0 && candidate.id === modelForm.model.trim(),
            isActive: false,
            apiKey,
          });
        }
        models = models.map((model) => ({ ...model, isActive: model.id === selectedId }));
        return { ...current, models };
      });
    }
    closeModelEditor();
  }

  function removeModel(id: string): void {
    if (draft.models.length === 1) {
      setDialogError("Keep at least one model so Khadim can start new chats.");
      setPendingModelDeleteId(null);
      return;
    }
    setDraft((current) => {
      const removed = current.models.find((model) => model.id === id);
      const models = current.models.filter((model) => model.id !== id);
      if (removed?.isActive) models[0] = { ...models[0], isActive: true };
      if (removed?.isDefault) models[0] = { ...models[0], isDefault: true };
      return { ...current, models };
    });
    setPendingModelDeleteId(null);
    if (editingModelId === id) closeModelEditor();
  }

  async function save(): Promise<void> {
    setSaving(true);
    setDialogError(null);
    try {
      await onSave(await window.khadim.settings.save(draft));
      setSaving(false);
      finishClose();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <div className={`dialog-backdrop settings-backdrop ${closing ? "closing" : ""}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section ref={dialogRef} className={`settings-dialog ${modelEditorOpen ? "model-setup-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}>
        <header className="settings-titlebar">
          {modelEditorOpen ? <>
            <button type="button" className="model-setup-back" data-dialog-escape-close onClick={closeModelEditor}><ChevronLeft size={15} /> Models</button>
            <div><h2 id="settings-title">{editingModelId ? "Edit model" : "Add models"}</h2><span>{editingModelId ? "Connection settings" : "New provider connection"}</span></div>
            <span className="model-setup-title-spacer" aria-hidden="true" />
          </> : <>
            <div><h2 id="settings-title">Settings</h2><span>{isDirty ? "Edited" : "Khadim preferences"}</span></div>
            <button className="icon-button settings-close" onClick={requestClose} aria-label="Close settings"><X size={17} /></button>
          </>}
        </header>
        <div className="settings-layout">
          {!modelEditorOpen && <nav className="settings-nav" aria-label="Settings sections">
            <span className="settings-nav-label">Preferences</span>
            <button aria-label="Appearance" aria-current={activeSection === "appearance" ? "page" : undefined} className={activeSection === "appearance" ? "active" : ""} onClick={() => setActiveSection("appearance")}><span className="settings-nav-icon appearance"><Sun size={16} /></span><span><strong>Appearance</strong><small>Theme and display</small></span><ChevronRight size={13} /></button>
            <button aria-label="Models" aria-current={activeSection === "model" ? "page" : undefined} className={activeSection === "model" ? "active" : ""} onClick={() => setActiveSection("model")}><span className="settings-nav-icon models"><Bot size={16} /></span><span><strong>Models</strong><small>Providers and defaults</small></span><ChevronRight size={13} /></button>
            <button aria-label="Project" aria-current={activeSection === "workspace" ? "page" : undefined} className={activeSection === "workspace" ? "active" : ""} onClick={() => setActiveSection("workspace")}><span className="settings-nav-icon project"><FolderOpen size={16} /></span><span><strong>Project</strong><small>Folder and access</small></span><ChevronRight size={13} /></button>
            <div className="settings-local-note"><Check size={13} /><span><strong>Local by default</strong><small>Settings stay on this device.</small></span></div>
          </nav>}
          <div className="settings-content" data-section={activeSection}>
            {activeSection === "appearance" && (
              <SettingsSection title="Appearance" description="Choose a built-in palette or create one of your own.">
                <div className="theme-library-toolbar">
                  <label><Search size={14} /><input type="search" value={themeSearch} onChange={(event) => setThemeSearch(event.target.value)} placeholder="Search themes" aria-label="Search themes" /></label>
                  <button type="button" onClick={() => setThemeEditorOpen((open) => !open)}><Plus size={14} /> New theme</button>
                </div>
                {themeEditorOpen && <div className="custom-theme-editor" role="group" aria-label="Create a custom theme">
                  <div className="custom-theme-editor-heading"><span><strong>Create theme</strong><small>Choose six colors. Khadim derives the remaining interface tones safely.</small></span><button type="button" onClick={() => setThemeEditorOpen(false)} aria-label="Close custom theme editor"><X size={14} /></button></div>
                  <div className="custom-theme-basics"><label>Theme name<input value={themeForm.name} onChange={(event) => setThemeForm({ ...themeForm, name: event.target.value })} placeholder="My theme" maxLength={60} /></label><label>Appearance<select value={themeForm.appearance} onChange={(event) => setThemeForm({ ...themeForm, appearance: event.target.value as "light" | "dark" })}><option value="dark">Dark</option><option value="light">Light</option></select></label></div>
                  <div className="custom-theme-colors">
                    {([['background', 'Background'], ['surface', 'Surface'], ['elevated', 'Elevated'], ['text', 'Text'], ['muted', 'Muted text'], ['accent', 'Accent']] as Array<[keyof ThemePalette, string]>).map(([key, label]) => <label key={key}><input type="color" value={themeForm.palette[key]} onChange={(event) => setThemeForm({ ...themeForm, palette: { ...themeForm.palette, [key]: event.target.value } })} /><span><strong>{label}</strong><small>{themeForm.palette[key]}</small></span></label>)}
                  </div>
                  <div className="custom-theme-editor-actions"><button type="button" onClick={() => setThemeEditorOpen(false)}>Cancel</button><button type="button" className="primary" onClick={addCustomTheme}>Add theme</button></div>
                </div>}
                <div className="theme-choice" role="radiogroup" aria-label="Theme">
                  {visibleThemes.map((theme) => <ThemeChoice key={theme.id} theme={theme} current={draft.theme} icon={theme.id === "system" ? <Monitor size={17} /> : theme.appearance === "light" ? <Sun size={17} /> : theme.family === "Aura" ? <Palette size={17} /> : <Moon size={17} />} onSelect={() => setDraft({ ...draft, theme: theme.id })} onRemove={theme.family === "Custom" ? () => removeCustomTheme(theme.id as CustomTheme["id"]) : undefined} />)}
                </div>
                {visibleThemes.length === 0 && <p className="theme-library-empty">No themes match “{themeSearch.trim()}”.</p>}
                <div className="setting-note"><Palette size={16} /><span><strong>Preview your choice instantly</strong><small>Aura is the default for new installations. Changes are saved only when you choose Save changes.</small></span></div>
              </SettingsSection>
            )}
            {activeSection === "model" && (
              <SettingsSection
                title={modelEditorOpen ? editingModelId ? "Edit model" : "Add models" : "Models"}
                description={modelEditorOpen ? "Choose a provider, then decide whether to add one model or its full catalog." : "Choose a default for new chats and manage the providers connected to Khadim."}
                hideHeading={modelEditorOpen}
              >
                {!modelEditorOpen && <>
                  <div className="default-model-field">
                  <span className="default-model-label">Default model <small>New chats start here</small></span>
                  <div className="settings-model-selector" ref={modelSelectorRef}>
                    <button
                      type="button"
                      className="settings-model-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={modelSelectorOpen}
                      aria-controls="settings-default-model-list"
                      data-dialog-escape-close={modelSelectorOpen ? "" : undefined}
                      onClick={() => {
                        setModelSelectorOpen((open) => !open);
                        setDefaultModelSearch("");
                      }}
                    >
                      {activeDraftModel && <ModelIcon model={activeDraftModel} size={36} />}
                      <span className="settings-model-trigger-copy">
                        <strong>{activeDraftModel?.name ?? "Choose a model"}</strong>
                        <small>{activeDraftModel ? `${modelCatalog.find((provider) => provider.id === activeDraftModel.provider)?.name ?? activeDraftModel.provider} · ${activeDraftModel.model}` : "Add a connection to get started"}</small>
                      </span>
                      <span className="settings-model-trigger-state"><Check size={12} /> Default</span>
                      <ChevronDown size={15} className={modelSelectorOpen ? "open" : ""} />
                    </button>
                    {modelSelectorOpen && <div className="settings-model-popover">
                      <div className="settings-model-search">
                        <Search size={14} />
                        <input
                          ref={defaultModelSearchRef}
                          type="search"
                          value={defaultModelSearch}
                          onChange={(event) => setDefaultModelSearch(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") moveModelOptionFocus(event, 1);
                            if (event.key === "ArrowUp") moveModelOptionFocus(event, -1);
                          }}
                          placeholder="Search models"
                          aria-label="Search saved models"
                        />
                      </div>
                      <div className="settings-model-popover-heading"><span>Available models</span><small>{draft.models.length}</small></div>
                      <div id="settings-default-model-list" className="settings-model-options" role="listbox" aria-label="Choose default model">
                        {visibleSavedModels.map((model) => <button
                          type="button"
                          role="option"
                          aria-selected={model.id === activeDraftModel?.id}
                          key={model.id}
                          onClick={() => selectDefaultModel(model.id)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") moveModelOptionFocus(event, 1);
                            if (event.key === "ArrowUp") moveModelOptionFocus(event, -1);
                          }}
                        >
                          <ModelIcon model={model} size={30} />
                          <span><strong>{model.name}</strong><small>{modelCatalog.find((provider) => provider.id === model.provider)?.name ?? model.provider} · {model.model}</small></span>
                          {model.id === activeDraftModel?.id && <Check size={14} />}
                        </button>)}
                        {visibleSavedModels.length === 0 && <p className="settings-model-empty">No saved models match “{defaultModelSearch.trim()}”.</p>}
                      </div>
                    </div>}
                  </div>
                  </div>
                  <div className="models-list-heading"><span>Connections <small>{draft.models.length}</small></span><button className="model-add-trigger" onClick={openModelEditor}><Plus size={14} /> Add models</button></div>
                  <div className="configured-models" aria-label="Connected models">
                  {draft.models.map((model) => (
                    <article className={model.isActive ? "active" : ""} key={model.id}>
                      <div className="model-card-main">
                        <ModelIcon model={model} size={30} />
                        <span><strong>{model.name}</strong><small>{modelCatalog.find((provider) => provider.id === model.provider)?.name ?? model.provider} · {model.model}</small></span>
                        {model.isActive && <em className="model-default-badge"><Check size={11} /> Default</em>}
                      </div>
                      <span className="model-card-actions">
                        <button onClick={() => editModel(model)} aria-label={`Edit ${model.name}`}><FilePenLine size={14} /></button>
                        <button className="model-delete-button" onClick={() => setPendingModelDeleteId(model.id)} aria-label={`Delete ${model.name}`}><Trash2 size={14} /></button>
                      </span>
                      {pendingModelDeleteId === model.id && <div className="model-delete-confirm" role="group" aria-label={`Delete ${model.name}?`} aria-live="polite"><span><strong>Delete {model.name}?</strong><small>The model will be removed when you save.</small></span><div><button onClick={() => setPendingModelDeleteId(null)}>Keep model</button><button className="danger" onClick={() => removeModel(model.id)}>Delete model</button></div></div>}
                    </article>
                  ))}
                  </div>
                </>}
                {modelEditorOpen && <div className="model-editor model-editor-dedicated">
                  {catalogStatus === "loading" && <div className="catalog-status" role="status">Loading providers and models…</div>}
                  {catalogStatus === "error" && !editingModelId && <div className="catalog-status error" role="alert"><span>Models could not be loaded. Check that Khadim is ready, then try again.</span><button onClick={() => setCatalogStatus("loading")}>Try again</button></div>}
                  {(catalogStatus === "ready" || editingModelId) && <>
                    <div className="model-setup-workspace">
                      <div className="model-catalog-picker">
                        <div className="provider-picker-pane">
                          <span className="model-picker-label"><b>1</b> Provider</span>
                          <label className="catalog-picker-search"><Search size={13} /><input type="search" value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="Search providers" aria-label="Search providers" /></label>
                          <div className="provider-options" role="listbox" aria-label="Provider">
                            {visibleCatalogProviders.map((provider) => <button
                              type="button"
                              role="option"
                              aria-selected={provider.id === modelForm.provider}
                              className={provider.id === modelForm.provider ? "selected" : ""}
                              onClick={() => selectProvider(provider.id)}
                              key={provider.id}
                            >
                              <ModelIcon model={{ name: provider.name, model: "", provider: provider.id }} size={26} />
                              <span><strong>{provider.name}</strong><small>{provider.available === false ? "Not running" : provider.apiKeyRequired === false ? "No API key" : "Provider connection"}</small></span>
                              {provider.id === modelForm.provider && <Check size={13} />}
                            </button>)}
                            {editingModelId && !selectedProvider && <button type="button" role="option" aria-selected="true" className="selected"><ModelIcon model={{ name: modelForm.provider, model: modelForm.model, provider: modelForm.provider }} size={26} /><span><strong>{modelForm.provider}</strong><small>Custom provider</small></span><Check size={13} /></button>}
                            {visibleCatalogProviders.length === 0 && <p className="catalog-picker-empty">No providers match “{providerSearch.trim()}”.</p>}
                          </div>
                        </div>
                        <div className="catalog-model-pane">
                          <span className="model-picker-label"><b>2</b> Models <small>{importAllProviderModels ? `All ${selectedProvider?.models.length ?? 0}` : "1 selected"}</small></span>
                          <label className="catalog-picker-search"><Search size={13} /><input type="search" value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Search models" aria-label="Search provider models" /></label>
                          <div className="catalog-model-options" role="listbox" aria-label="Model">
                            {!editingModelId && !isCodexProvider && (selectedProvider?.models.length ?? 0) > 1 && <><button type="button" role="option" aria-selected={importAllProviderModels} className={`all-models-option ${importAllProviderModels ? "selected" : ""}`} onClick={() => setImportAllProviderModels(true)}><span className="all-models-provider-icon"><ModelIcon model={{ name: selectedProvider?.name ?? "Provider", model: "", provider: modelForm.provider }} size={28} /></span><span><strong>All models</strong><small>{selectedProvider?.name} · {selectedProvider?.models.length} available</small></span><span className="model-selection-indicator">{importAllProviderModels && <Check size={12} />}</span></button><div className="model-list-section-label"><span>Choose one model</span></div></>}
                            {visibleCatalogModels.map((model) => <button
                              type="button"
                              role="option"
                              aria-selected={!importAllProviderModels && selectedCatalogModel?.id === model.id}
                              className={!importAllProviderModels && selectedCatalogModel?.id === model.id ? "selected" : ""}
                              onClick={() => selectModel(model.id)}
                              key={model.id}
                            >
                              <ModelIcon model={{ name: model.name, model: model.id, provider: modelForm.provider }} size={26} />
                              <span><strong>{model.name}</strong><small>{model.id}</small></span>
                              {!importAllProviderModels && selectedCatalogModel?.id === model.id && <Check size={13} />}
                            </button>)}
                            <button type="button" role="option" aria-selected={!importAllProviderModels && !selectedCatalogModel} className={!importAllProviderModels && !selectedCatalogModel ? "selected" : ""} onClick={() => selectModel(customModelValue)}>
                              <span className="custom-model-icon"><Plus size={13} /></span>
                              <span><strong>Custom model</strong><small>Enter a provider model ID</small></span>
                              {!importAllProviderModels && !selectedCatalogModel && <Check size={13} />}
                            </button>
                            {visibleCatalogModels.length === 0 && normalizedModelSearch && <p className="catalog-picker-empty">No models match “{modelSearch.trim()}”.</p>}
                          </div>
                        </div>
                      </div>
                      <aside className="model-connection-pane">
                        <div className="model-connection-heading">
                          <ModelIcon model={{ name: importAllProviderModels ? selectedProvider?.name ?? "Provider" : modelForm.name || selectedCatalogModel?.name || "Custom model", model: modelForm.model, provider: modelForm.provider }} size={36} />
                          <span><small>{importAllProviderModels ? "Provider connection" : "Connection"}</small><strong>{importAllProviderModels ? selectedProvider?.name : modelForm.name || selectedCatalogModel?.name || "Custom model"}</strong><code>{importAllProviderModels ? `${selectedProvider?.models.length ?? 0} models selected` : modelForm.model || "Model ID required"}</code></span>
                        </div>
                        {!importAllProviderModels && !selectedCatalogModel && <label className="custom-model-field">Model ID<input aria-invalid={modelFieldError?.field === "model" || undefined} aria-describedby={modelFieldError?.field === "model" ? "model-form-error" : undefined} value={modelForm.model} onChange={(event) => { setModelFieldError(null); setModelForm({ ...modelForm, model: event.target.value, name: event.target.value }); }} placeholder="For example, gpt-5" /></label>}
                        {!importAllProviderModels && selectedCatalogModel && <p className="selected-model-id">Provider model ID <code>{selectedCatalogModel.id}</code></p>}
                        {selectedProvider?.apiKeyRequired !== false && !isCodexProvider && <>
                          <label className="model-api-key">API key<input type="password" value={modelForm.apiKey} onChange={(event) => { setClearModelApiKey(false); setModelForm({ ...modelForm, apiKey: event.target.value }); }} placeholder={modelHasSavedApiKey ? "Saved securely · enter a new key to replace it" : "Paste your provider API key"} autoComplete="off" spellCheck={false} /></label>
                          {modelHasSavedApiKey && !modelForm.apiKey && <div className="credential-retention"><CircleCheck size={16} /><span><strong>API key saved securely</strong><small>Leave the field blank to keep using the saved key.</small></span><button type="button" onClick={() => setClearModelApiKey(true)}>Remove</button></div>}
                          {clearModelApiKey && <div className="credential-retention removing"><span><strong>API key will be removed</strong><small>This takes effect when you save Settings.</small></span><button type="button" onClick={() => setClearModelApiKey(false)}>Undo</button></div>}
                          {modelHasSavedApiKey && modelForm.apiKey && <p className="credential-replacement-note">The new key will replace the saved key when you save Settings.</p>}
                        </>}
                        {isCodexProvider && <div className={`codex-auth-card ${codexConnected ? "connected" : ""}`} role="status">
                          <span><strong>{codexConnected ? "ChatGPT connected" : codexStatus.status === "pending" ? "Waiting for ChatGPT" : "Sign in with ChatGPT"}</strong><small>{codexConnected ? "Khadim can use the Codex access included with your plan." : codexStatus.status === "pending" ? "Finish signing in in your browser." : "Use the Codex access included with an eligible ChatGPT plan."}</small></span>
                          <button type="button" onClick={() => void connectCodex()} disabled={codexStatus.status === "pending"}>{codexConnected ? "Reconnect" : codexStatus.status === "pending" ? "Connecting…" : "Connect"}</button>
                        </div>}
                        {selectedProvider?.id === "ollama" && selectedProvider.available === false && <div className="ollama-status" role="status"><strong>Ollama is not running</strong><span>Start the Ollama app or run <code>ollama serve</code>, then try loading the catalog again.</span></div>}
                        {selectedProvider?.id === "ollama" && <p className="ollama-local-note">Local models need no API key. Models ending in <code>:cloud</code> use your Ollama CLI sign-in.</p>}
                        <details className="model-advanced">
                          <summary>Advanced settings</summary>
                          <div className="settings-field-grid">
                            {!importAllProviderModels && <label>Display name<input aria-invalid={modelFieldError?.field === "name" || undefined} aria-describedby={modelFieldError?.field === "name" ? "model-form-error" : undefined} value={modelForm.name} onChange={(event) => { setModelFieldError(null); setModelForm({ ...modelForm, name: event.target.value }); }} placeholder="Work model" /></label>}
                            <label>Temperature<input aria-invalid={modelFieldError?.field === "temperature" || undefined} aria-describedby={modelFieldError?.field === "temperature" ? "model-form-error" : undefined} type="number" min="0" max="2" step="0.1" value={modelForm.temperature} onChange={(event) => { setModelFieldError(null); setModelForm({ ...modelForm, temperature: event.target.value }); }} /></label>
                            <label className="wide-field">Base URL<input aria-invalid={modelFieldError?.field === "baseUrl" || undefined} aria-describedby={modelFieldError?.field === "baseUrl" ? "model-form-error" : undefined} value={modelForm.baseUrl} onChange={(event) => { setModelFieldError(null); setModelForm({ ...modelForm, baseUrl: event.target.value }); }} placeholder="Optional custom endpoint" /></label>
                          </div>
                        </details>
                        {modelFieldError && <p id="model-form-error" className="model-form-error" role="alert">{modelFieldError.message}</p>}
                        <div className="model-editor-footer"><small>{importAllProviderModels ? `${providerCatalogModelsToAdd.length} new ${providerCatalogModelsToAdd.length === 1 ? "model" : "models"}; existing models will not be duplicated.` : "Credentials stay on this device when secure storage is available."}</small><button className="add-model-button" onClick={addOrUpdateModel}>{modelEditorActionLabel}</button></div>
                      </aside>
                    </div>
                  </>}
                </div>}
              </SettingsSection>
            )}
            {activeSection === "workspace" && (
              <SettingsSection title="Project" description="Choose where Khadim works and what it can do by default.">
                <div className="settings-group">
                  <div className="settings-field project-folder-field"><span id="active-project-folder-label">Project folder</span><div className="workspace-picker"><input aria-labelledby="active-project-folder-label" value={draft.workspace} readOnly /><button aria-label="Choose project folder" onClick={async () => {
                    const path = await window.khadim.settings.chooseWorkspace();
                    if (path) setDraft({ ...draft, workspace: path });
                  }}><FolderOpen size={15} /> Choose…</button></div></div>
                  <p className="field-help">Changing this folder adds it to Projects after you save.</p>
                </div>
                <div className="settings-subheading"><strong>Default access</strong><small>Choose what new chats can use.</small></div>
                <div className="mode-choice settings-group" role="radiogroup" aria-label="Default access">
                  <label className={draft.harness === "assistant" ? "active" : ""}><input className="sr-only" type="radio" name="default-access" checked={draft.harness === "assistant"} onChange={() => setDraft({ ...draft, harness: "assistant" })} /><span className="mode-choice-icon"><Bot size={18} /></span><span><strong>Files and web</strong><small>Work with this project and research online</small></span><span className="native-radio">{draft.harness === "assistant" && <span />}</span></label>
                  <label className={draft.harness === "rpa" ? "active" : ""}><input className="sr-only" type="radio" name="default-access" checked={draft.harness === "rpa"} onChange={() => setDraft({ ...draft, harness: "rpa" })} /><span className="mode-choice-icon"><WandSparkles size={18} /></span><span><strong>Computer control</strong><small>Also use the screen, mouse, and keyboard</small></span><span className="native-radio">{draft.harness === "rpa" && <span />}</span></label>
                </div>
              </SettingsSection>
            )}
          </div>
        </div>
        {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
        {!modelEditorOpen && <>
          {discardConfirmationOpen && <div className="settings-discard-confirm" role="group" aria-label="Discard unsaved settings?" aria-live="polite"><span><strong>Discard unsaved changes?</strong><small>Your saved settings will stay as they are.</small></span><div><Button ref={keepEditingRef} size="small" onClick={() => setDiscardConfirmationOpen(false)}>Keep editing</Button><Button variant="danger" size="small" className="danger" onClick={finishClose}>Discard changes</Button></div></div>}
          <footer><span>{isDirty ? "Unsaved changes" : "Settings are up to date"}</span><div><Button className="secondary-button" onClick={requestClose}>Cancel</Button><Button variant="primary" className="primary-button" onClick={() => void save()} disabled={saving || !isDirty}>{saving ? "Saving…" : "Save changes"}</Button></div></footer>
        </>}
      </section>
    </div>
  );
}
export function AccountDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const dialogRef = useDialogFocus<HTMLElement>(onClose);
  const [activeSection, setActiveSection] = useState<"profile" | "plan">("profile");
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" tabIndex={-1}>
        <header>
          <div><span>Local account</span><h2 id="account-title">Account</h2></div>
          <IconButton variant="quiet" className="icon-button" onClick={onClose} aria-label="Close account"><X size={19} /></IconButton>
        </header>
        <div className="account-layout">
          <nav className="account-nav" aria-label="Account sections">
            <div className="account-nav-identity"><span className="account-avatar large">K</span><span><strong>Khadim user</strong><small>Stored on this device</small></span></div>
            <button aria-current={activeSection === "profile" ? "page" : undefined} className={activeSection === "profile" ? "active" : ""} onClick={() => setActiveSection("profile")}><UserRound size={16} /> Profile</button>
            <button aria-current={activeSection === "plan" ? "page" : undefined} className={activeSection === "plan" ? "active" : ""} onClick={() => setActiveSection("plan")}><CreditCard size={16} /> Plan</button>
          </nav>
          <div className="account-content">
            {activeSection === "profile" ? (
              <section className="account-section">
                <div className="account-section-heading"><span>01 / Identity</span><h3>Your local profile</h3><p>This build uses a device-local profile. No Khadim cloud account or sign-in is active.</p></div>
                <div className="profile-hero">
                  <span className="account-avatar profile">K</span>
                  <span><strong>Khadim user</strong><small>Local workspace account</small></span>
                  <span className="local-account-badge"><Check size={13} /> Local</span>
                </div>
                <dl className="account-details">
                  <div><dt>Account type</dt><dd>Local-first</dd></div>
                  <div><dt>Data location</dt><dd>This device</dd></div>
                  <div><dt>Cloud sync</dt><dd>Not enabled</dd></div>
                </dl>
                <div className="account-note"><UserRound size={17} /><span><strong>Local storage, provider processing</strong><small>Chats and settings are stored on this device. Prompts are sent to your configured model provider when you run them.</small></span></div>
              </section>
            ) : (
              <section className="account-section">
                <div className="account-section-heading"><span>02 / Plan</span><h3>Community</h3><p>The open-source Khadim experience, powered by your own model provider and local machine.</p></div>
                <div className="plan-card">
                  <div className="plan-card-top"><span><small>Current plan</small><strong>Community</strong></span><span className="plan-price"><strong>$0</strong><small>forever</small></span></div>
                  <div className="plan-rule" />
                  <ul>
                    <li><Check size={15} /> Unlimited local projects</li>
                    <li><Check size={15} /> Bring your own AI provider</li>
                    <li><Check size={15} /> Built-in agent presets and artifacts</li>
                    <li><Check size={15} /> Community updates</li>
                  </ul>
                </div>
                <div className="plan-usage"><span><Gauge size={17} /><span><strong>Model usage</strong><small>Billed directly by your configured provider</small></span></span><button onClick={() => setActiveSection("profile")}>Account details</button></div>
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsSection({ title, description, hideHeading = false, children }: { title: string; description: string; hideHeading?: boolean; children: React.ReactNode }): React.JSX.Element {
  return <section className="settings-section">{!hideHeading && <div className="settings-section-heading"><h3>{title}</h3><p>{description}</p></div>}{children}</section>;
}

function ThemeChoice({ theme, current, icon, onSelect, onRemove }: { theme: BuiltInTheme | (CustomTheme & { family: "Custom"; description: string }); current: ThemeMode; icon: React.ReactNode; onSelect: () => void; onRemove?: () => void }): React.JSX.Element {
  const palette = theme.palette;
  const previewStyle = palette ? {
    "--theme-preview-background": palette.background,
    "--theme-preview-surface": palette.surface,
    "--theme-preview-elevated": palette.elevated,
    "--theme-preview-text": palette.text,
    "--theme-preview-muted": palette.muted,
    "--theme-preview-accent": palette.accent,
  } as React.CSSProperties : undefined;
  return <div className="theme-choice-item"><label className={`${current === theme.id ? "active" : ""} theme-${theme.id === "system" ? "system" : theme.appearance ?? "dark"}`}><input className="sr-only" type="radio" name="theme" checked={current === theme.id} onChange={onSelect} /><span className="theme-preview" style={previewStyle} aria-hidden="true"><span className="theme-preview-sidebar"><i /><i /><i /></span><span className="theme-preview-content"><i /><i /><i /></span></span><span className="theme-choice-copy"><span className="theme-choice-icon">{icon}</span><span><strong>{theme.name}</strong><small>{theme.family} · {theme.description}</small></span><span className="native-radio">{current === theme.id && <span />}</span></span></label>{onRemove && <button type="button" className="theme-remove" aria-label={`Remove ${theme.name}`} onClick={onRemove}><Trash2 size={13} /></button>}</div>;
}
