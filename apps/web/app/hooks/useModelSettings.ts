import { useState, useEffect, useCallback } from "react";
import { showError } from "../lib/toast";

export type ProviderType =
  | "openai"
  | "anthropic"
  | "openai-codex"
  | "openrouter"
  | "ollama"
  | "xai"
  | "groq"
  | "cerebras"
  | "mistral"
  | "minimax"
  | "zai"
  | "amazon-bedrock"
  | "azure-openai-responses"
  | "github-copilot"
  | "huggingface"
  | "vercel-ai-gateway"
  | "opencode"
  | "opencode-go"
  | "kimi-coding";

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderType;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
  temperature: string | null;
  hasApiKey?: boolean | null;
  isDefault: boolean | null;
  isActive: boolean | null;
}

export interface ProviderOption {
  type: ProviderType;
  name: string;
  needsBaseUrl: boolean;
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

interface UseModelSettingsResult {
  models: ModelConfig[];
  providers: ProviderOption[];
  loading: boolean;
  saving: boolean;
  activeModel: ModelConfig | undefined;
  refresh: () => Promise<void>;
  submitIntent: (intent: string, data: Record<string, string>) => Promise<ApiData>;
  createModel: (data: Record<string, string>) => Promise<boolean>;
  updateModel: (id: string, data: Record<string, string>) => Promise<boolean>;
  setActiveModel: (id: string) => Promise<boolean>;
  setDefaultModel: (id: string) => Promise<boolean>;
  deleteModel: (id: string) => Promise<boolean>;
}

async function fetchApi(url: string): Promise<ApiData> {
  const response = await fetch(url);
  return response.json() as Promise<ApiData>;
}

async function postApi(intent: string, data: Record<string, string>): Promise<ApiData> {
  const body = new FormData();
  body.append("intent", intent);
  for (const [key, value] of Object.entries(data)) {
    body.append(key, value);
  }
  const response = await fetch("/api/models", { method: "POST", body });
  const payload = (await response.json()) as ApiData;
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export function useModelSettings(): UseModelSettingsResult {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsData, providersData] = await Promise.all([
        fetchApi("/api/models"),
        fetchApi("/api/models?action=providers"),
      ]);
      setModels(modelsData.models ?? []);
      setProviders(providersData.providers ?? []);
    } catch (error) {
      console.error("Failed to load model settings", error);
      showError("Failed to load model settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitIntent = useCallback(async (intent: string, data: Record<string, string>) => {
    return postApi(intent, data);
  }, []);

  const createModel = useCallback(async (data: Record<string, string>): Promise<boolean> => {
    setSaving(true);
    try {
      await submitIntent("create", data);
      await refresh();
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add model");
      return false;
    } finally {
      setSaving(false);
    }
  }, [submitIntent, refresh]);

  const updateModel = useCallback(async (id: string, data: Record<string, string>): Promise<boolean> => {
    setSaving(true);
    try {
      await submitIntent("update", { ...data, id });
      await refresh();
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to update model");
      return false;
    } finally {
      setSaving(false);
    }
  }, [submitIntent, refresh]);

  const setActiveModel = useCallback(async (id: string): Promise<boolean> => {
    try {
      await submitIntent("setActive", { id });
      await refresh();
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to set active model");
      return false;
    }
  }, [submitIntent, refresh]);

  const setDefaultModel = useCallback(async (id: string): Promise<boolean> => {
    try {
      await submitIntent("setDefault", { id });
      await refresh();
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to set default model");
      return false;
    }
  }, [submitIntent, refresh]);

  const deleteModel = useCallback(async (id: string): Promise<boolean> => {
    try {
      await submitIntent("delete", { id });
      await refresh();
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete model");
      return false;
    }
  }, [submitIntent, refresh]);

  const activeModel = models.find((m) => m.isActive);

  return {
    models,
    providers,
    loading,
    saving,
    activeModel,
    refresh,
    submitIntent,
    createModel,
    updateModel,
    setActiveModel,
    setDefaultModel,
    deleteModel,
  };
}

interface DiscoveredModel {
  id: string;
  name: string;
  provider: ProviderType;
  model: string;
}

interface UseDiscoverModelsResult {
  discoveredModels: DiscoveredModel[];
  discovering: boolean;
  error: string | null;
  discover: (provider: ProviderType, apiKey: string, baseUrl: string) => Promise<void>;
  reset: () => void;
}

export function useDiscoverModels(): UseDiscoverModelsResult {
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = useCallback(async (provider: ProviderType, apiKey: string, baseUrl: string) => {
    setDiscovering(true);
    setError(null);
    try {
      const payload = await postApi("discover", { provider, apiKey, baseUrl });
      const discovered = (payload as { models?: Array<{ id: string; name: string }> }).models ?? [];
      setDiscoveredModels(
        discovered.map((m) => ({
          id: m.id,
          name: m.name,
          provider,
          model: m.id,
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch provider models";
      setError(message);
      setDiscoveredModels([]);
    } finally {
      setDiscovering(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDiscoveredModels([]);
    setError(null);
  }, []);

  return { discoveredModels, discovering, error, discover, reset };
}

const EMPTY_FORM = {
  name: "",
  provider: "openai" as ProviderType,
  model: "",
  apiKey: "",
  baseUrl: "",
  temperature: "0.2",
};

export { EMPTY_FORM };
