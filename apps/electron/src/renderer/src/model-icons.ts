import { getModelIconUrl } from "./assets/model-icons";

const PROVIDER_ICONS: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  "openai-codex": "codex",
  openrouter: "openrouter",
  ollama: "ollama",
  xai: "grok",
  groq: "grok",
  cerebras: "cerebras",
  mistral: "mistral",
  minimax: "minimax",
  zai: "zai-brand",
  "amazon-bedrock": "bedrock",
  "azure-openai-responses": "azure",
  "github-copilot": "githubcopilot",
  huggingface: "huggingface",
  "vercel-ai-gateway": "vercel",
  opencode: "opencode",
  "opencode-go": "opencode",
  "kimi-coding": "moonshot",
  nvidia: "nvidia",
  google: "google",
  "google-vertex": "google",
};

const MODEL_ICON_RULES: Array<{ icon: string; patterns: RegExp[] }> = [
  { icon: "claude", patterns: [/claude/i] },
  { icon: "gemini", patterns: [/gemini/i] },
  { icon: "gemma", patterns: [/gemma/i, /codegemma/i] },
  { icon: "deepseek", patterns: [/deepseek/i] },
  { icon: "chatglm", patterns: [/glm/i, /chatglm/i] },
  { icon: "qwen", patterns: [/qwen/i, /qwq/i, /qvq/i, /tongyi/i] },
  { icon: "mistral", patterns: [/mistral/i, /mixtral/i, /codestral/i, /devstral/i, /ministral/i, /pixtral/i, /magistral/i] },
  { icon: "meta", patterns: [/llama/i, /codellama/i, /meta-llama/i] },
  { icon: "grok", patterns: [/grok/i, /xai/i] },
  { icon: "codex", patterns: [/codex/i] },
  { icon: "openai", patterns: [/gpt/i, /(^|[/-])o[134]([/-]|$)/i, /openai/i] },
  { icon: "cohere", patterns: [/cohere/i, /command-r/i] },
  { icon: "perplexity", patterns: [/perplexity/i, /pplx/i, /sonar/i] },
  { icon: "moonshot", patterns: [/moonshot/i, /kimi/i] },
  { icon: "microsoft", patterns: [/microsoft/i, /phi[-\d]/i] },
  { icon: "aws", patterns: [/aws/i, /bedrock/i, /titan/i] },
  { icon: "nvidia", patterns: [/nvidia/i, /nemotron/i] },
  { icon: "minimax", patterns: [/minimax/i, /abab/i] },
  { icon: "nousresearch", patterns: [/nous/i, /hermes/i] },
];

export function getResolvedModelIconUrl(name: string, model: string, provider: string): string | null {
  const value = `${name} ${model}`;
  const matched = MODEL_ICON_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(value)));
  return getModelIconUrl(matched?.icon ?? PROVIDER_ICONS[provider] ?? provider);
}
