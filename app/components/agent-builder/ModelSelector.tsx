import { useMemo, useState, useRef, useEffect } from "react";
import { LuBrain, LuChevronDown, LuSearch, LuServer } from "react-icons/lu";
import { getModelIconUrl } from "../../assets/model-icons";

export enum ModelSelectorVariant {
  Switcher = "switcher",
  Picker = "picker",
}

export type ModelProvider = "openai" | "anthropic" | "openai-codex" | "openrouter" | "ollama" | "xai" | "groq" | "cerebras" | "mistral" | "minimax" | "zai" | "amazon-bedrock" | "azure-openai-responses" | "github-copilot" | "huggingface" | "vercel-ai-gateway" | "opencode" | "opencode-go" | "kimi-coding";

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  model: string;
  isActive?: boolean | null;
}

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void | Promise<void>;
  isLoading?: boolean;
  isUpdating?: boolean;
  className?: string;
  direction?: "up" | "down";
  variant?: ModelSelectorVariant;
  placeholder?: string;
  onOpen?: () => void;
}

type ProviderMeta = {
  label: string;
};

const PROVIDER_META: Record<ModelProvider, ProviderMeta> = {
  openai: { label: "OpenAI" },
  anthropic: { label: "Anthropic" },
  "openai-codex": { label: "Codex" },
  openrouter: { label: "OpenRouter" },
  ollama: { label: "Ollama" },
  xai: { label: "xAI" },
  groq: { label: "Groq" },
  cerebras: { label: "Cerebras" },
  mistral: { label: "Mistral" },
  minimax: { label: "MiniMax" },
  zai: { label: "Z.ai" },
  "amazon-bedrock": { label: "Bedrock" },
  "azure-openai-responses": { label: "Azure OpenAI" },
  "github-copilot": { label: "Copilot" },
  huggingface: { label: "HuggingFace" },
  "vercel-ai-gateway": { label: "Vercel" },
  opencode: { label: "OpenCode" },
  "opencode-go": { label: "OpenCode Go" },
  "kimi-coding": { label: "Kimi" },
};

function getProviderMeta(provider: ModelProvider): ProviderMeta {
  return PROVIDER_META[provider] || PROVIDER_META.openai;
}

function normalizeIconSlug(value: string) {
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

function getProviderIconId(provider: ModelProvider): string {
  switch (provider) {
    case "anthropic":
      return "anthropic";
    case "openai-codex":
      return "codex";
    case "openrouter":
      return "openrouter";
    case "ollama":
      return "ollama";
    case "openai":
    default:
      return "openai";
  }
}

function ProviderFallbackIcon({ provider }: { provider: ModelProvider }) {
  switch (provider) {
    case "openrouter":
      return (
        <svg viewBox="0 0 512 512" className="h-[18px] w-[18px] fill-current stroke-current" aria-hidden="true">
          <path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" strokeWidth="90" fill="none" />
          <path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none" />
          <path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" strokeWidth="90" fill="none" />
          <path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none" />
        </svg>
      );
    case "ollama":
      return <LuServer className="h-[18px] w-[18px]" />;
    case "anthropic":
      return <span className="text-[11px] font-semibold leading-none">AI</span>;
    case "openai-codex":
      return <span className="text-[10px] font-semibold leading-none">{};</span>;
    case "openai":
    default:
      return <LuBrain className="h-[18px] w-[18px]" />;
  }
}

function resolveIconSlug(value: string) {
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

function getModelIconCandidates(model: ModelOption): string[] {
  const candidates = new Set<string>();
  const providerIconId = getProviderIconId(model.provider);

  const ruleMatch = MODEL_ICON_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(`${model.name} ${model.model}`)));
  if (ruleMatch) candidates.add(ruleMatch.icon);

  const providerSegment = model.model.split("/")[0] || "";
  const namePrefix = model.name.split(":")[0] || "";
  const providerBrand = model.model.split(/[\s/:]+/)[0] || "";
  const nameBrand = model.name.split(/[\s:]+/)[0] || "";
  const rawCandidates = [
    providerSegment,
    providerBrand,
    namePrefix,
    nameBrand,
    model.name,
    model.model,
    ...model.name.split(/[\s:/_.-]+/),
    ...model.model.split(/[\s:/_.-]+/),
  ];

  for (const rawCandidate of rawCandidates) {
    const slug = resolveIconSlug(rawCandidate);
    if (slug) candidates.add(slug);
  }

  candidates.add(providerIconId);
  return Array.from(candidates);
}

export function getResolvedModelIconUrl(modelName: string, modelId: string, provider: ModelProvider): string | null {
  const candidates = getModelIconCandidates({ id: modelId, name: modelName, provider, model: modelId });
  return candidates.map((slug) => getModelIconUrl(slug)).find((url): url is string => url !== null) || null;
}

function ModelBadgeIcon({ model, className = "", invert = false }: { model: ModelOption; className?: string; invert?: boolean }) {
  const iconCandidates = getModelIconCandidates(model);
  const localIcon = iconCandidates
    .map((slug) => getModelIconUrl(slug))
    .find((url): url is string => url !== null) || null;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full ${
        invert
          ? "bg-white text-black ring-1 ring-white/20"
          : "bg-black/[0.04] text-black ring-1 ring-black/10 group-hover/model-item:bg-white group-hover/model-item:text-black"
      } ${className}`}
    >
      {localIcon ? (
        <img
          alt=""
          className="h-[18px] w-[18px] shrink-0 object-contain"
          height={18}
          src={localIcon}
          width={18}
        />
      ) : (
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center text-black">
          <ProviderFallbackIcon provider={model.provider} />
        </span>
      )}
      <span className="sr-only">{model.name}</span>
    </span>
  );
}

export function ModelSelector({
  models,
  selectedModelId,
  onSelectModel,
  isLoading = false,
  isUpdating = false,
  className = "",
  direction = "down",
  variant = ModelSelectorVariant.Switcher,
  placeholder = "Select model",
  onOpen,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const selectedModel = useMemo(() => {
    if (selectedModelId) {
      const selected = models.find((model) => model.id === selectedModelId);
      if (selected) return selected;
    }

    return models.find((model) => model.isActive) || models[0] || null;
  }, [models, selectedModelId]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        getProviderMeta(m.provider).label.toLowerCase().includes(q)
    );
  }, [models, search]);

  const isPicker = variant === ModelSelectorVariant.Picker;

  if (isLoading) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full glass-panel px-3 py-2 text-xs text-[var(--text-muted)] ${className}`}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#10150a]" />
        Loading models...
      </div>
    );
  }

  if (models.length === 0 && !isPicker) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full glass-panel px-3 py-2 text-xs text-[var(--text-muted)] ${className}`}>
        No models
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              setSearch("");
              onOpen?.();
              requestAnimationFrame(() => searchRef.current?.focus());
            }
            return next;
          });
        }}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)] ${
          isPicker
            ? "rounded-xl glass-input"
            : "rounded-full glass-panel"
        }`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {!isPicker && selectedModel ? <ModelBadgeIcon className="h-6 w-6 shrink-0" model={selectedModel} /> : null}
          <span className={`min-w-0 truncate ${!selectedModel ? "text-[var(--text-muted)]" : ""}`}>
            {selectedModel?.name || placeholder}
          </span>
        </span>
        <LuChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className={`absolute left-0 z-[100] w-full max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl glass-panel-strong shadow-[var(--shadow-glass-lg)] ${direction === "up" ? "bottom-full mb-2" : "mt-2"}`}>
          <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-3 py-2">
            <LuSearch className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {filteredModels.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">No models found</p>
            ) : null}
            {filteredModels.map((model) => {
              const meta = getProviderMeta(model.provider);
              const isSelected = selectedModel?.id === model.id;

              return (
                <button
                  key={model.id}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    setIsOpen(false);
                    setSearch("");
                    void onSelectModel(model.id);
                  }}
                  className={`group/model-item mb-1 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all last:mb-0 ${
                    isSelected
                      ? "border-[#10150a] bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-strong)]"
                  } ${isUpdating ? "cursor-wait opacity-70" : ""}`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2.5">
                    {!isPicker && (
                      <span className="shrink-0">
                        <ModelBadgeIcon className="h-7 w-7" invert={isSelected} model={model} />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{model.name}</span>
                      <span className={`block truncate text-xs ${isSelected ? "text-[var(--text-inverse)] opacity-75" : "text-[var(--text-muted)] group-hover/model-item:text-[var(--text-secondary)]"}`}>
                        {meta.label} - {model.model}
                      </span>
                    </span>
                  </span>
                  {isSelected ? <span className="text-xs font-medium uppercase tracking-wide">Active</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
