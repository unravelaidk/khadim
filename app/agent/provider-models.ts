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
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  minimax: "https://api.minimax.io/v1",
  zai: "https://api.z.ai/api/v1",
  "amazon-bedrock": "",
  "azure-openai-responses": "",
  "github-copilot": "https://api.githubcopilot.com",
  huggingface: "https://api-inference.huggingface.co/v1",
  "vercel-ai-gateway": "",
  opencode: "https://opencode.ai/api/v1",
  "opencode-go": "https://opencode.ai/zen/go/v1",
  "kimi-coding": "https://api.moonshot.cn/v1",
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
    case "xai":
      return process.env.XAI_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "cerebras":
      return process.env.CEREBRAS_API_KEY;
    case "mistral":
      return process.env.MISTRAL_API_KEY;
    case "minimax":
      return process.env.MINIMAX_API_KEY;
    case "zai":
      return process.env.ZAI_API_KEY;
    case "azure-openai-responses":
      return process.env.AZURE_OPENAI_API_KEY;
    case "huggingface":
      return process.env.HUGGINGFACE_API_KEY;
    case "opencode":
      return process.env.OPENCODE_API_KEY;
    case "opencode-go":
      return process.env.OPENCODE_API_KEY;
    case "kimi-coding":
      return process.env.KIMI_API_KEY;
    case "ollama":
    case "amazon-bedrock":
    case "github-copilot":
    case "vercel-ai-gateway":
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

const PROVIDER_USES_REGISTRY: Set<ProviderType> = new Set([
  "openai-codex",
  "opencode",
  "opencode-go",
  "github-copilot",
  "amazon-bedrock",
  "azure-openai-responses",
  "vercel-ai-gateway",
  "kimi-coding",
]);

export async function discoverProviderModels(options: DiscoverOptions): Promise<ProviderModel[]> {
  const { provider } = options;
  const apiKey = await getApiKey(provider, options.apiKey);
  const baseUrl = options.baseUrl || DEFAULT_BASE_URLS[provider];

  if ((provider === "openai" || provider === "anthropic") && !apiKey) {
    throw new Error(`Missing API key for ${provider}. Add it in settings.`);
  }

  if (provider === "openai-codex" && !apiKey) {
    throw new Error("Connect your ChatGPT Plus or Pro Codex subscription first.");
  }

  if (PROVIDER_USES_REGISTRY.has(provider)) {
    return getModels(provider as any).map((model) => ({
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

  if (!baseUrl) {
    throw new Error(`Base URL is required for ${provider}`);
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
