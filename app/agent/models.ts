import type { Model } from "@mariozechner/pi-ai";
import { getModel } from "@mariozechner/pi-ai";
import type { ModelConfig } from "../lib/db/schema";
import { getOpenAICodexApiKey } from "./oauth";

export type ProviderType = "openai" | "anthropic" | "openai-codex" | "openrouter" | "ollama";

export interface ResolvedChatModel {
  model: Model<any>;
  apiKey: string;
  temperature: number;
}

async function resolveApiKey(provider: ProviderType, modelApiKey: string | null, fallbackApiKey?: string): Promise<string> {
  if (modelApiKey) return modelApiKey;

  if (provider === "openrouter") {
    return fallbackApiKey || process.env.OPENROUTER_API_KEY || "";
  }

  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || fallbackApiKey || "";
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY || fallbackApiKey || "";
  }

  if (provider === "openai-codex") {
    return getOpenAICodexApiKey(fallbackApiKey);
  }

  return modelApiKey || fallbackApiKey || "ollama";
}

function createOpenAICompatibleModel(
  provider: string,
  id: string,
  baseUrl?: string,
  reasoning = false
): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider,
    ...(baseUrl ? { baseUrl } : {}),
    reasoning,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  } as Model<"openai-completions">;
}

function createAnthropicCompatibleModel(id: string, baseUrl?: string): Model<"anthropic-messages"> {
  return {
    id,
    name: id,
    api: "anthropic-messages",
    provider: "anthropic",
    ...(baseUrl ? { baseUrl } : {}),
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  } as Model<"anthropic-messages">;
}

function resolveModel(config: ModelConfig): Model<any> {
  switch (config.provider) {
    case "openrouter":
      return createOpenAICompatibleModel(
        "openrouter",
        config.model,
        config.baseUrl || "https://openrouter.ai/api/v1"
      );
    case "ollama":
      return createOpenAICompatibleModel(
        "ollama",
        config.model,
        config.baseUrl || "http://localhost:11434/v1"
      );
    case "anthropic":
      try {
        const model = getModel("anthropic", config.model as never);
        return config.baseUrl ? { ...model, baseUrl: config.baseUrl } : model;
      } catch {
        return createAnthropicCompatibleModel(config.model, config.baseUrl || "https://api.anthropic.com/v1");
      }
    case "openai-codex":
      return getModel("openai-codex", config.model as never);
    case "openai":
    default:
      if (config.baseUrl) {
        return createOpenAICompatibleModel("openai", config.model, config.baseUrl, true);
      }
      try {
        return getModel("openai", config.model as never);
      } catch {
        return createOpenAICompatibleModel("openai", config.model, undefined, true);
      }
  }
}

export async function createChatModel(config: ModelConfig, defaultApiKey?: string): Promise<ResolvedChatModel> {
  const apiKey = await resolveApiKey(config.provider as ProviderType, config.apiKey, defaultApiKey);
  const temperature = parseFloat(config.temperature ?? "0.2") || 0.2;

  if (!apiKey && config.provider !== "ollama") {
    throw new Error(`API key is required for model: ${config.name}`);
  }

  return {
    model: resolveModel(config),
    apiKey,
    temperature,
  };
}

export function getProviderDisplayName(provider: ProviderType): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic Claude";
    case "openai-codex":
      return "OpenAI Codex";
    case "openrouter":
      return "OpenRouter";
    case "ollama":
      return "Ollama (Local)";
    default:
      return provider;
  }
}

export const SUPPORTED_PROVIDERS: { type: ProviderType; name: string; needsBaseUrl: boolean }[] = [
  { type: "openai", name: "OpenAI", needsBaseUrl: false },
  { type: "anthropic", name: "Anthropic Claude", needsBaseUrl: false },
  { type: "openai-codex", name: "OpenAI Codex", needsBaseUrl: false },
  { type: "openrouter", name: "OpenRouter", needsBaseUrl: false },
  { type: "ollama", name: "Ollama (Local)", needsBaseUrl: true },
];

export const RECOMMENDED_MODELS: { provider: ProviderType; model: string; name: string }[] = [
  { provider: "openrouter", model: "mistralai/devstral-2512:free", name: "DevStral Free" },
  { provider: "openrouter", model: "qwen/qwen3-32b:free", name: "Qwen 3 32B Free" },
  { provider: "openrouter", model: "deepseek/deepseek-chat:free", name: "DeepSeek Chat Free" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", name: "Claude Sonnet 4.5" },
  { provider: "anthropic", model: "claude-3-5-haiku-20240307", name: "Claude 3.5 Haiku" },
  { provider: "openai-codex", model: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
  { provider: "openai-codex", model: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
  { provider: "openai", model: "gpt-4o", name: "GPT-4o" },
  { provider: "openai", model: "gpt-4o-mini", name: "GPT-4o Mini" },
  { provider: "ollama", model: "llama3.1", name: "Llama 3.1" },
  { provider: "ollama", model: "codegemma", name: "CodeGemma" },
  { provider: "ollama", model: "deepseek-coder", name: "DeepSeek Coder" },
];
