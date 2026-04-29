import type { Model } from "@mariozechner/pi-ai";
import { getModel } from "@mariozechner/pi-ai";
import type { ModelConfig } from "../lib/db/schema";
import { getOpenAICodexApiKey } from "./oauth";

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
  | "kimi-coding"
  | "nvidia"
  | "google"
  | "google-vertex";

export interface ResolvedChatModel {
  model: Model<any>;
  apiKey: string;
  temperature: number;
}

const PROVIDER_ENV_KEYS: Record<ProviderType, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-codex": "OPENAI_CODEX_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  mistral: "MISTRAL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  zai: "ZAI_API_KEY",
  "amazon-bedrock": "",
  "azure-openai-responses": "AZURE_OPENAI_API_KEY",
  "github-copilot": "",
  huggingface: "HUGGINGFACE_API_KEY",
  "vercel-ai-gateway": "",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  google: "GEMINI_API_KEY",
  "google-vertex": "GEMINI_API_KEY",
};

async function resolveApiKey(provider: ProviderType, modelApiKey: string | null, fallbackApiKey?: string): Promise<string> {
  if (modelApiKey) return modelApiKey;
  if (provider === "openai-codex") return getOpenAICodexApiKey(fallbackApiKey);
  if (provider === "ollama") return "ollama";
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey) return process.env[envKey] || fallbackApiKey || "";
  return fallbackApiKey || "";
}

/** Resolve the API key for bridging to the khadim binary.
 *  Checks: DB-stored key → env var → OAuth (Codex). */
export async function resolveApiKeyForBridge(provider: ProviderType, storedKey: string | null): Promise<string> {
  return resolveApiKey(provider, storedKey);
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
    case "xai":
      return createOpenAICompatibleModel(
        "xai",
        config.model,
        config.baseUrl || "https://api.x.ai/v1",
        true
      );
    case "groq":
      return createOpenAICompatibleModel(
        "groq",
        config.model,
        config.baseUrl || "https://api.groq.com/openai/v1"
      );
    case "cerebras":
      return createOpenAICompatibleModel(
        "cerebras",
        config.model,
        config.baseUrl || "https://api.cerebras.ai/v1"
      );
    case "mistral":
      return createOpenAICompatibleModel(
        "mistral",
        config.model,
        config.baseUrl || "https://api.mistral.ai/v1",
        true
      );
    case "minimax":
      return createOpenAICompatibleModel(
        "minimax",
        config.model,
        config.baseUrl || "https://api.minimax.io/v1"
      );
    case "zai":
      return createOpenAICompatibleModel(
        "zai",
        config.model,
        config.baseUrl || "https://api.z.ai/api/v1"
      );
    case "huggingface":
      return createOpenAICompatibleModel(
        "huggingface",
        config.model,
        config.baseUrl || "https://api-inference.huggingface.co/v1"
      );
    case "opencode":
      return createOpenAICompatibleModel(
        "opencode",
        config.model,
        config.baseUrl || "https://opencode.ai/api/v1"
      );
    case "opencode-go":
      return createOpenAICompatibleModel(
        "opencode-go",
        config.model,
        config.baseUrl || "https://opencode.ai/zen/go/v1"
      );
    case "kimi-coding":
      return createOpenAICompatibleModel(
        "kimi-coding",
        config.model,
        config.baseUrl || "https://api.moonshot.cn/v1"
      );
    case "nvidia":
      return createOpenAICompatibleModel(
        "nvidia",
        config.model,
        config.baseUrl || "https://integrate.api.nvidia.com/v1",
        true
      );
    case "google":
      return createOpenAICompatibleModel(
        "google",
        config.model,
        config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai"
      );
    case "google-vertex":
      return createOpenAICompatibleModel(
        "google-vertex",
        config.model,
        config.baseUrl || undefined
      );
    case "vercel-ai-gateway":
      return createOpenAICompatibleModel(
        "vercel-ai-gateway",
        config.model,
        config.baseUrl || undefined
      );
    case "amazon-bedrock":
      return createOpenAICompatibleModel(
        "amazon-bedrock",
        config.model,
        config.baseUrl || undefined
      );
    case "azure-openai-responses":
      return createOpenAICompatibleModel(
        "azure-openai-responses",
        config.model,
        config.baseUrl || undefined,
        true
      );
    case "github-copilot":
      return createOpenAICompatibleModel(
        "github-copilot",
        config.model,
        config.baseUrl || "https://api.githubcopilot.com"
      );
    case "anthropic":
      try {
        const model = getModel("anthropic", config.model as never);
        return config.baseUrl ? { ...model, baseUrl: config.baseUrl } : model;
      } catch {
        return {
          id: config.model,
          name: config.model,
          api: "anthropic-messages",
          provider: "anthropic",
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 8192,
        } as Model<"anthropic-messages">;
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

  if (!apiKey && config.provider !== "ollama" && config.provider !== "amazon-bedrock" && config.provider !== "github-copilot") {
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
    case "openai": return "OpenAI";
    case "anthropic": return "Anthropic";
    case "openai-codex": return "OpenAI Codex";
    case "openrouter": return "OpenRouter";
    case "ollama": return "Ollama";
    case "xai": return "xAI (Grok)";
    case "groq": return "Groq";
    case "cerebras": return "Cerebras";
    case "mistral": return "Mistral";
    case "minimax": return "MiniMax";
    case "zai": return "Z.ai";
    case "amazon-bedrock": return "Amazon Bedrock";
    case "azure-openai-responses": return "Azure OpenAI";
    case "github-copilot": return "GitHub Copilot";
    case "huggingface": return "HuggingFace";
    case "vercel-ai-gateway": return "Vercel AI Gateway";
    case "opencode": return "OpenCode Zen";
    case "opencode-go": return "OpenCode Go";
    case "kimi-coding": return "Kimi Coding";
    case "nvidia": return "NVIDIA";
    case "google": return "Google";
    case "google-vertex": return "Google Vertex";
    default: return provider;
  }
}

export const SUPPORTED_PROVIDERS: { type: ProviderType; name: string; needsBaseUrl: boolean }[] = [
  { type: "openai", name: "OpenAI", needsBaseUrl: false },
  { type: "anthropic", name: "Anthropic", needsBaseUrl: false },
  { type: "openai-codex", name: "OpenAI Codex", needsBaseUrl: false },
  { type: "openrouter", name: "OpenRouter", needsBaseUrl: false },
  { type: "xai", name: "xAI (Grok)", needsBaseUrl: false },
  { type: "groq", name: "Groq", needsBaseUrl: false },
  { type: "cerebras", name: "Cerebras", needsBaseUrl: false },
  { type: "mistral", name: "Mistral", needsBaseUrl: false },
  { type: "minimax", name: "MiniMax", needsBaseUrl: false },
  { type: "zai", name: "Z.ai", needsBaseUrl: false },
  { type: "kimi-coding", name: "Kimi Coding", needsBaseUrl: false },
  { type: "huggingface", name: "HuggingFace", needsBaseUrl: false },
  { type: "opencode", name: "OpenCode Zen", needsBaseUrl: false },
  { type: "opencode-go", name: "OpenCode Go", needsBaseUrl: false },
  { type: "amazon-bedrock", name: "Amazon Bedrock", needsBaseUrl: true },
  { type: "azure-openai-responses", name: "Azure OpenAI", needsBaseUrl: true },
  { type: "github-copilot", name: "GitHub Copilot", needsBaseUrl: false },
  { type: "vercel-ai-gateway", name: "Vercel AI Gateway", needsBaseUrl: true },
  { type: "ollama", name: "Ollama (Local)", needsBaseUrl: true },
  { type: "nvidia", name: "NVIDIA", needsBaseUrl: false },
  { type: "google", name: "Google", needsBaseUrl: false },
  { type: "google-vertex", name: "Google Vertex", needsBaseUrl: true },
];

export const RECOMMENDED_MODELS: { provider: ProviderType; model: string; name: string }[] = [
  { provider: "openrouter", model: "mistralai/devstral-2512:free", name: "DevStral Free" },
  { provider: "openrouter", model: "qwen/qwen3-32b:free", name: "Qwen 3 32B Free" },
  { provider: "openrouter", model: "deepseek/deepseek-chat:free", name: "DeepSeek Chat Free" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  { provider: "anthropic", model: "claude-3-5-haiku-20240307", name: "Claude 3.5 Haiku" },
  { provider: "openai-codex", model: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
  { provider: "openai-codex", model: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
  { provider: "openai", model: "gpt-4o", name: "GPT-4o" },
  { provider: "openai", model: "gpt-4o-mini", name: "GPT-4o Mini" },
  { provider: "xai", model: "grok-4", name: "Grok 4" },
  { provider: "xai", model: "grok-3", name: "Grok 3" },
  { provider: "groq", model: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
  { provider: "mistral", model: "mistral-large-latest", name: "Mistral Large" },
  { provider: "mistral", model: "codestral-latest", name: "Codestral" },
  { provider: "ollama", model: "llama3.1", name: "Llama 3.1" },
  { provider: "ollama", model: "codegemma", name: "CodeGemma" },
  { provider: "ollama", model: "deepseek-coder", name: "DeepSeek Coder" },
];
