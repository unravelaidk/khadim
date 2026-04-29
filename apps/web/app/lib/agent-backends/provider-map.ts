/**
 * Static provider mapping — maps khadim provider IDs to web app provider metadata.
 * 
 * The web app has richer metadata per provider (env keys, base URL flags, OAuth
 * status, etc.) that the khadim binary doesn't expose. This mapping bridges the gap.
 * 
 * When a new provider is added to khadim, add its mapping here.
 */

import type { ProviderType } from "../../agent/models";

export interface ProviderMeta {
  type: ProviderType;
  name: string;
  needsBaseUrl: boolean;
  envKey?: string;
  isOAuth?: boolean;
}

/**
 * Known provider metadata keyed by khadim provider ID.
 * Extensible — add new providers as khadim supports them.
 */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  openai:             { type: "openai", name: "OpenAI", needsBaseUrl: false, envKey: "OPENAI_API_KEY" },
  anthropic:          { type: "anthropic", name: "Anthropic", needsBaseUrl: false, envKey: "ANTHROPIC_API_KEY" },
  "openai-codex":     { type: "openai-codex", name: "OpenAI Codex", needsBaseUrl: false, isOAuth: true },
  openrouter:         { type: "openrouter", name: "OpenRouter", needsBaseUrl: false, envKey: "OPENROUTER_API_KEY" },
  xai:                { type: "xai", name: "xAI (Grok)", needsBaseUrl: false, envKey: "XAI_API_KEY" },
  groq:               { type: "groq", name: "Groq", needsBaseUrl: false, envKey: "GROQ_API_KEY" },
  cerebras:           { type: "cerebras", name: "Cerebras", needsBaseUrl: false, envKey: "CEREBRAS_API_KEY" },
  mistral:            { type: "mistral", name: "Mistral", needsBaseUrl: false, envKey: "MISTRAL_API_KEY" },
  minimax:            { type: "minimax", name: "MiniMax", needsBaseUrl: false, envKey: "MINIMAX_API_KEY" },
  "minimax-cn":       { type: "minimax", name: "MiniMax CN", needsBaseUrl: false, envKey: "MINIMAX_API_KEY" },
  zai:                { type: "zai", name: "Z.ai", needsBaseUrl: false, envKey: "ZAI_API_KEY" },
  "kimi-coding":      { type: "kimi-coding", name: "Kimi Coding", needsBaseUrl: false, envKey: "KIMI_API_KEY" },
  huggingface:        { type: "huggingface", name: "HuggingFace", needsBaseUrl: false, envKey: "HUGGINGFACE_API_KEY" },
  opencode:           { type: "opencode", name: "OpenCode Zen", needsBaseUrl: false, envKey: "OPENCODE_API_KEY" },
  "opencode-go":      { type: "opencode-go", name: "OpenCode Go", needsBaseUrl: false, envKey: "OPENCODE_API_KEY" },
  nvidia:             { type: "nvidia", name: "NVIDIA", needsBaseUrl: false, envKey: "NVIDIA_API_KEY" },
  "amazon-bedrock":   { type: "amazon-bedrock", name: "Amazon Bedrock", needsBaseUrl: true },
  "azure-openai-responses": { type: "azure-openai-responses", name: "Azure OpenAI", needsBaseUrl: true, envKey: "AZURE_OPENAI_API_KEY" },
  "github-copilot":   { type: "github-copilot", name: "GitHub Copilot", needsBaseUrl: false, isOAuth: true },
  "vercel-ai-gateway": { type: "vercel-ai-gateway", name: "Vercel AI Gateway", needsBaseUrl: true },
  ollama:             { type: "ollama", name: "Ollama (Local)", needsBaseUrl: true },
  google:             { type: "google", name: "Google", needsBaseUrl: false, envKey: "GEMINI_API_KEY" },
  "google-vertex":    { type: "google-vertex", name: "Google Vertex", needsBaseUrl: true },
};

/**
 * Resolve provider metadata for a khadim provider ID.
 * Returns null for unknown providers so callers can skip them.
 */
export function resolveProviderMeta(khadimProviderId: string): ProviderMeta | null {
  return PROVIDER_META[khadimProviderId] ?? null;
}
