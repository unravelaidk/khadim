import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { OpenCodeModelOption } from "../lib/bindings";
import { resolveModelIcon, getProviderIconUrl, isMonochromeProvider } from "../assets/model-icons";
import { getModelKey } from "../lib/model-selection";

/* ─── Provider display labels ──────────────────────────────────────── */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "Codex",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  xai: "xAI",
  groq: "Groq",
  cerebras: "Cerebras",
  mistral: "Mistral",
  minimax: "MiniMax",
  zai: "Z.ai",
  "amazon-bedrock": "Bedrock",
  "azure-openai-responses": "Azure OpenAI",
  "github-copilot": "Copilot",
  huggingface: "HuggingFace",
  "vercel-ai-gateway": "Vercel",
  opencode: "OpenCode",
  "opencode-go": "OpenCode Go",
  "kimi-coding": "Kimi",
};

function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

/* ─── Model Icon Badge ─────────────────────────────────────────────── */
function ModelIcon({ model, size = "md" }: { model: OpenCodeModelOption; size?: "sm" | "md" }) {
  const iconInfo = useMemo(
    () => resolveModelIcon(model.model_name, model.model_id, model.provider_id),
    [model.model_name, model.model_id, model.provider_id],
  );

  const sizeClasses = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const imgSize = size === "sm" ? 14 : 18;

  if (iconInfo) {
    return (
      <span className={`inline-flex ${sizeClasses} shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-card)] ring-1 ring-[var(--glass-border)]`}>
        <img alt="" src={iconInfo.url} width={imgSize} height={imgSize} className={`shrink-0 object-contain ${iconInfo.isMonochrome ? "model-icon-mono" : ""}`} />
      </span>
    );
  }

  // Fallback: letter badge with deterministic color
  let hash = 0;
  const key = model.provider_id;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  return (
    <span
      className={`inline-flex ${sizeClasses} shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--text-inverse)]`}
      style={{ background: `oklch(60% 0.10 ${hue})` }}
    >
      {key.charAt(0).toUpperCase()}
    </span>
  );
}

/* ─── Main Component ───────────────────────────────────────────────── */
interface ModelSelectorProps {
  models: OpenCodeModelOption[];
  selectedModelKey: string | null;
  onSelectModel: (key: string) => void;
  disabled?: boolean;
  direction?: "up" | "down";
  className?: string;
}

export function ModelSelector({
  models,
  selectedModelKey,
  onSelectModel,
  disabled = false,
  direction = "up",
  className = "",
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    },
    [],
  );

  const selectedModel = useMemo(
    () => {
      if (selectedModelKey) {
        const selected = models.find((m) => getModelKey(m) === selectedModelKey);
        if (selected) return selected;
      }
      return models.find((m) => m.is_default) ?? models[0] ?? null;
    },
    [models, selectedModelKey],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.model_name.toLowerCase().includes(q) ||
        m.model_id.toLowerCase().includes(q) ||
        m.provider_name.toLowerCase().includes(q) ||
        m.provider_id.toLowerCase().includes(q),
    );
  }, [models, search]);

  // Group by provider
  const grouped = useMemo(() => {
    const map = new Map<string, OpenCodeModelOption[]>();
    for (const m of filtered) {
      const label = getProviderLabel(m.provider_id);
      const arr = map.get(label) ?? [];
      arr.push(m);
      map.set(label, arr);
    }
    return map;
  }, [filtered]);

  const hasMultipleProviders = grouped.size > 1;

  if (models.length === 0) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full depth-card-sm px-3 py-1.5 text-[11px] text-[var(--text-muted)] ${className}`}>
        No models available
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`} onKeyDown={handleKeyDown}>
      {/* ── Trigger ────────────────────────────────────────────── */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              setSearch("");
              requestAnimationFrame(() => searchRef.current?.focus());
            }
            return next;
          });
        }}
        className={`group/trigger flex h-8 w-full min-w-0 items-center gap-2 rounded-full px-1.5 pr-2.5 text-[12px] text-[var(--text-primary)] transition-all duration-200 ${
          isOpen
            ? "depth-card shadow-[var(--shadow-depth-card-hover)]"
            : "depth-card-sm hover:shadow-[var(--shadow-depth-card-hover)]"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        {selectedModel ? (
          <ModelIcon model={selectedModel} />
        ) : (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-card)] ring-1 ring-[var(--glass-border)]">
            <i className="ri-sparkling-2-line text-[14px] leading-none text-[var(--text-muted)]" />
          </span>
        )}
        <span className="min-w-0 truncate font-medium">
          {selectedModel?.model_name ?? "Select model"}
        </span>
        {/* Chevron */}
        <i className={`${isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-[12px] leading-none transition-transform`} />
      </button>

      {/* ── Dropdown ───────────────────────────────────────────── */}
      {isOpen && (
        <div
          className={`absolute left-0 z-[100] w-full min-w-[17rem] max-w-[22rem] overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--surface-elevated)] shadow-[var(--shadow-glass-lg)] animate-in zoom-in fade-in duration-200 ${
            direction === "up" ? "bottom-full mb-2" : "mt-2"
          }`}
          role="listbox"
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-3 py-2">
            <i className="ri-search-line text-[14px] leading-none text-[var(--text-muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="shrink-0 rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                  <i className="ri-close-line text-[10px] leading-none" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
                <i className="ri-search-line text-[20px] leading-none text-[var(--text-muted)]" />
                <p className="text-[12px] text-[var(--text-muted)]">No models found</p>
              </div>
            ) : hasMultipleProviders ? (
              Array.from(grouped.entries()).map(([label, providerModels]) => (
                <div key={label} className="mb-1 last:mb-0">
                  <div className="flex items-center gap-2 px-2 pb-0.5 pt-2">
                    <ProviderGroupIcon providerId={providerModels[0].provider_id} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {label}
                    </span>
                    <span className="h-px flex-1 bg-[var(--glass-border)]" />
                  </div>
                    {providerModels.map((model) => (
                      <ModelItem
                        key={getModelKey(model)}
                        model={model}
                        isSelected={selectedModel ? getModelKey(model) === getModelKey(selectedModel) : false}
                        onSelect={() => {
                          setIsOpen(false);
                          setSearch("");
                        onSelectModel(getModelKey(model));
                      }}
                    />
                  ))}
                </div>
              ))
            ) : (
              filtered.map((model) => (
                <ModelItem
                  key={getModelKey(model)}
                  model={model}
                  isSelected={selectedModel ? getModelKey(model) === getModelKey(selectedModel) : false}
                  onSelect={() => {
                    setIsOpen(false);
                    setSearch("");
                    onSelectModel(getModelKey(model));
                  }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--glass-border)] px-3 py-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">
                {filtered.length} model{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Tiny provider icon for group headers ─────────────────────────── */
function ProviderGroupIcon({ providerId }: { providerId: string }) {
  const url = getProviderIconUrl(providerId);
  if (!url) return null;
  const isMono = isMonochromeProvider(providerId);
  return (
    <img alt="" src={url} width={12} height={12} className={`shrink-0 object-contain opacity-60 ${isMono ? "model-icon-mono" : ""}`} />
  );
}

/* ─── Individual model row ─────────────────────────────────────────── */
function ModelItem({
  model,
  isSelected,
  onSelect,
}: {
  model: OpenCodeModelOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`group/item flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 text-left transition-all duration-150 ${
        isSelected
          ? "bg-[var(--color-accent)]/[0.08] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--color-accent)]/20"
          : "text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
      }`}
    >
      <ModelIcon model={model} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] font-medium leading-tight">{model.model_name}</span>
        <span className={`truncate text-[10px] leading-tight ${isSelected ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)] group-hover/item:text-[var(--text-secondary)]"}`}>
          {model.model_id}
        </span>
      </span>
      {model.is_default && !isSelected && (
        <span className="shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Default
        </span>
      )}
      {isSelected && (
        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)]">
          <i className="ri-check-line text-[12px] leading-none" />
        </span>
      )}
    </button>
  );
}
