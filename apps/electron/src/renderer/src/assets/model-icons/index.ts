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

export function getAllModelIconSlugs(): string[] {
  return Object.keys(MODEL_ICONS);
}

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

export function getProviderIconUrl(provider: string): string | null {
  const slug = PROVIDER_ICON_MAP[provider];
  if (!slug) return null;
  return MODEL_ICONS[slug] || null;
}
