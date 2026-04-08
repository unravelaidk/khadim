import ai21 from "./ai21-color.svg?url";
import aionlabs from "./aionlabs-color.svg?url";
import aistudio from "./aistudio-color.svg?url";
import anthropic from "./anthropic-color.svg?url";
import aws from "./aws-color.svg?url";
import azure from "./azure-color.svg?url";
import baichuan from "./baichuan-color.svg?url";
import bedrock from "./bedrock-color.svg?url";
import bfl from "./bfl-color.svg?url";
import cerebras from "./cerebras-color.svg?url";
import chatglm from "./chatglm-color.svg?url";
import claude from "./claude-color.svg?url";
import codex from "./codex-color.svg?url";
import cohere from "./cohere-color.svg?url";
import commanda from "./commanda-color.svg?url";
import deepseek from "./deepseek-color.svg?url";
import dolphin from "./dolphin-color.svg?url";
import doubao from "./doubao-color.svg?url";
import gemini from "./gemini-color.svg?url";
import gemma from "./gemma-color.svg?url";
import githubcopilot from "./githubcopilot-color.svg?url";
import google from "./google-color.svg?url";
import grok from "./grok-color.svg?url";
import huggingface from "./huggingface-color.svg?url";
import hunyuan from "./hunyuan-color.svg?url";
import internlm from "./internlm-color.svg?url";
import meta from "./meta-color.svg?url";
import microsoft from "./microsoft-color.svg?url";
import minimax from "./minimax-color.svg?url";
import mistral from "./mistral-color.svg?url";
import moonshot from "./moonshot-color.svg?url";
import nvidia from "./nvidia-color.svg?url";
import ollama from "./ollama-color.svg?url";
import openai from "./openai-color.svg?url";
import openchat from "./openchat-color.svg?url";
import opencode from "./opencode-color.svg?url";
import openrouter from "./openrouter-color.svg?url";
import perplexity from "./perplexity-color.svg?url";
import qwen from "./qwen-color.svg?url";
import sensenova from "./sensenova-color.svg?url";
import stepfun from "./stepfun-color.svg?url";
import vercel from "./vercel-color.svg?url";
import yi from "./yi-color.svg?url";
import zaiBrand from "./zai-brand-color.svg?url";
import zhipu from "./zhipu-color.svg?url";
import nousresearch from "./nousresearch-color.svg?url";

const MODEL_ICONS: Record<string, string> = {
  ai21,
  aionlabs,
  aistudio,
  anthropic,
  aws,
  azure,
  baichuan,
  bedrock,
  bfl,
  cerebras,
  chatglm,
  claude,
  codex,
  cohere,
  commanda,
  deepseek,
  dolphin,
  doubao,
  gemini,
  gemma,
  githubcopilot,
  google,
  grok,
  huggingface,
  hunyuan,
  internlm,
  meta,
  microsoft,
  minimax,
  mistral,
  moonshot,
  nvidia,
  ollama,
  openai,
  openchat,
  opencode,
  openrouter,
  perplexity,
  qwen,
  sensenova,
  stepfun,
  vercel,
  yi,
  "zai-brand": zaiBrand,
  zhipu,
  nousresearch,
};

export function getModelIconUrl(slug: string): string | null {
  return MODEL_ICONS[slug] || null;
}

/* ─── Provider → icon slug mapping ─────────────────────────────────── */
const PROVIDER_ICON_MAP: Record<string, string> = {
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
};

export function getProviderIconUrl(providerId: string): string | null {
  const slug = PROVIDER_ICON_MAP[providerId];
  if (!slug) return null;
  return MODEL_ICONS[slug] || null;
}

/* ─── Regex-based model icon resolution ────────────────────────────── */

function normalizeIconSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const ICON_SLUG_ALIASES: Record<string, string> = {
  ai21labs: "ai21",
  anthropicclaude: "claude",
  awsbedrock: "bedrock",
  blackforestlabs: "bfl",
  commandr: "cohere",
  commanda: "commanda",
  chatglm: "chatglm",
  codegemma: "gemma",
  codellama: "meta",
  deepmind: "google",
  githubcopilot: "githubcopilot",
  googleaistudio: "aistudio",
  llama: "meta",
  metallama: "meta",
  microsoftazure: "azure",
  microsoftphi: "microsoft",
  minimax: "minimax",
  moonshotai: "moonshot",
  openaicodex: "codex",
  openrouterai: "openrouter",
  perplexityai: "perplexity",
  pixtral: "mistral",
  qwenlm: "qwen",
  sensenova: "sensenova",
  zai: "zai-brand",
  zaiorg: "zai-brand",
  zaiglm: "zai-brand",
  zaiai: "zai-brand",
  zhipu: "zhipu",
};

function resolveIconSlug(value: string): string | null {
  const normalized = normalizeIconSlug(value);
  if (!normalized) return null;
  return ICON_SLUG_ALIASES[normalized] || normalized;
}

const MODEL_ICON_RULES: Array<{ icon: string; patterns: RegExp[] }> = [
  { icon: "ai21", patterns: [/ai21/i, /jamba/i] },
  { icon: "aionlabs", patterns: [/aionlabs/i] },
  { icon: "claude", patterns: [/claude/i] },
  { icon: "anthropic", patterns: [/anthropic/i] },
  { icon: "gemini", patterns: [/gemini/i] },
  { icon: "gemma", patterns: [/gemma/i, /codegemma/i] },
  { icon: "deepseek", patterns: [/deepseek/i] },
  { icon: "zai-brand", patterns: [/z\.ai/i, /z-?ai/i, /zai/i] },
  { icon: "chatglm", patterns: [/glm/i, /chatglm/i] },
  { icon: "zhipu", patterns: [/zhipu/i] },
  { icon: "qwen", patterns: [/qwen/i, /qwq/i, /qvq/i, /tongyi/i] },
  { icon: "mistral", patterns: [/mistral/i, /mixtral/i, /codestral/i, /devstral/i, /ministral/i, /pixtral/i, /magistral/i] },
  { icon: "meta", patterns: [/llama/i, /codellama/i, /meta-llama/i] },
  { icon: "grok", patterns: [/grok/i, /xai/i] },
  { icon: "openai", patterns: [/gpt/i, /(^|[\/-])o1([\/-]|$)/i, /(^|[\/-])o3([\/-]|$)/i, /(^|[\/-])o4([\/-]|$)/i, /openai/i] },
  { icon: "codex", patterns: [/codex/i] },
  { icon: "openrouter", patterns: [/openrouter/i] },
  { icon: "cohere", patterns: [/cohere/i, /command-r/i] },
  { icon: "perplexity", patterns: [/perplexity/i, /pplx/i, /sonar/i] },
  { icon: "moonshot", patterns: [/moonshot/i, /kimi/i] },
  { icon: "google", patterns: [/google/i] },
  { icon: "microsoft", patterns: [/microsoft/i, /phi[-\d]/i] },
  { icon: "aws", patterns: [/aws/i, /bedrock/i, /titan/i] },
  { icon: "nvidia", patterns: [/nvidia/i, /nemotron/i] },
  { icon: "yi", patterns: [/(^|[\/-])yi([\/-]|$)/i] },
  { icon: "baichuan", patterns: [/baichuan/i] },
  { icon: "minimax", patterns: [/minimax/i, /abab/i] },
  { icon: "doubao", patterns: [/doubao/i] },
  { icon: "hunyuan", patterns: [/hunyuan/i] },
  { icon: "senseNova", patterns: [/sensenova/i] },
  { icon: "stepfun", patterns: [/stepfun/i] },
  { icon: "internlm", patterns: [/internlm/i, /internvl/i] },
  { icon: "nousresearch", patterns: [/nous/i, /hermes/i] },
  { icon: "openchat", patterns: [/openchat/i] },
  { icon: "dolphin", patterns: [/dolphin/i] },
  { icon: "ollama", patterns: [/ollama/i] },
];

/**
 * Resolve a model icon URL from model name, model ID, and provider ID.
 * Uses regex matching against MODEL_ICON_RULES, slug aliases, and provider
 * fallback — same strategy as the web app.
 */
export function resolveModelIconUrl(
  modelName: string,
  modelId: string,
  providerId: string,
): string | null {
  const result = resolveModelIcon(modelName, modelId, providerId);
  return result?.url ?? null;
}

export interface ResolvedModelIcon {
  url: string;
  isMonochrome: boolean;
}

export function resolveModelIcon(
  modelName: string,
  modelId: string,
  providerId: string,
): ResolvedModelIcon | null {
  const candidates = new Set<string>();

  // 1. Regex rules against combined name + id
  const combined = `${modelName} ${modelId}`;
  const ruleMatch = MODEL_ICON_RULES.find((rule) =>
    rule.patterns.some((p) => p.test(combined)),
  );
  if (ruleMatch) candidates.add(ruleMatch.icon);

  // 2. Slug-based candidates from segments of model name and ID
  const rawCandidates = [
    modelId.split("/")[0] || "",
    modelId.split(/[\s/:]+/)[0] || "",
    modelName.split(":")[0] || "",
    modelName.split(/[\s:]+/)[0] || "",
    modelName,
    modelId,
    ...modelName.split(/[\s:/_.-]+/),
    ...modelId.split(/[\s:/_.-]+/),
  ];

  for (const raw of rawCandidates) {
    const slug = resolveIconSlug(raw);
    if (slug) candidates.add(slug);
  }

  // 3. Provider fallback
  const providerSlug = PROVIDER_ICON_MAP[providerId];
  if (providerSlug) candidates.add(providerSlug);

  // Return first candidate that maps to an actual icon
  for (const slug of candidates) {
    const url = MODEL_ICONS[slug];
    if (url) {
      return {
        url,
        isMonochrome: MONOCHROME_ICON_SLUGS.has(slug),
      };
    }
  }

  return null;
}

const MONOCHROME_ICON_SLUGS = new Set([
  "ai21",
  "aistudio",
  "anthropic",
  "aws",
  "bfl",
  "cerebras",
  "dolphin",
  "githubcopilot",
  "grok",
  "moonshot",
  "nousresearch",
  "ollama",
  "openai",
  "opencode",
  "openrouter",
  "vercel",
  "yi",
  "zai-brand",
]);

export function isMonochromeProvider(providerId: string): boolean {
  const slug = PROVIDER_ICON_MAP[providerId];
  return slug ? MONOCHROME_ICON_SLUGS.has(slug) : false;
}
