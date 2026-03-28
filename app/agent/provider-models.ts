import { getModels } from "@mariozechner/pi-ai";
import type { ProviderType } from "./models";
import { getOpenAICodexApiKey } from "./oauth";

export interface ProviderModel {
  id: string;
  name: string;
}

interface DiscoverOptions {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  "openai-codex": "https://chatgpt.com/backend-api/codex",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
};

async function getApiKey(provider: ProviderType, passedApiKey?: string): Promise<string | undefined> {
  if (passedApiKey) return passedApiKey;

  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai-codex":
      return getOpenAICodexApiKey(passedApiKey);
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "ollama":
      return undefined;
  }
}

function normalizeModelList(items: Array<{ id?: string; name?: string }>) {
  const unique = new Map<string, ProviderModel>();

  for (const item of items) {
    if (!item.id) continue;
    unique.set(item.id, {
      id: item.id,
      name: item.name || item.id,
    });
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverProviderModels(options: DiscoverOptions): Promise<ProviderModel[]> {
  const { provider } = options;
  const apiKey = await getApiKey(provider, options.apiKey);
  const baseUrl = options.baseUrl || DEFAULT_BASE_URLS[provider];

  if ((provider === "openai" || provider === "anthropic") && !apiKey) {
    throw new Error(`Missing API key for ${provider}. Add it in settings or server env.`);
  }

  if (provider === "openai-codex" && !apiKey) {
    throw new Error("Connect your ChatGPT Plus or Pro Codex subscription first.");
  }

  if (provider === "openai-codex") {
    return getModels("openai-codex").map((model) => ({
      id: model.id,
      name: model.name,
    }));
  }

  if (provider === "ollama") {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Ollama models (${response.status})`);
    }
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    return normalizeModelList(
      (payload.models || []).map((model) => ({
        id: model.model || model.name,
        name: model.name || model.model,
      }))
    );
  }

  if (provider === "anthropic") {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Anthropic models (${response.status})`);
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string; display_name?: string }> };
    return normalizeModelList(
      (payload.data || []).map((model) => ({
        id: model.id,
        name: model.display_name || model.id,
      }))
    );
  }

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/models`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${provider} models (${response.status})`);
  }

  const payload = (await response.json()) as { data?: Array<{ id?: string; name?: string }> };
  return normalizeModelList(payload.data || []);
}
