import { memo } from "react";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import type { ModelConfig } from "../../hooks/useModelSettings";
import { getResolvedModelIconUrl } from "./ModelSelector";

interface ModelCardProps {
  model: ModelConfig;
  onSetActive: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEdit: (model: ModelConfig) => void;
  onDelete: (id: string) => void;
}

function ModelCardComponent({ model, onSetActive, onSetDefault, onEdit, onDelete }: ModelCardProps) {
  return (
    <article
      className={`rounded-xl glass-panel p-4 transition-all ${model.isActive ? "ring-1 ring-[var(--accent)]" : ""}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {(() => {
              const modelIconUrl = getResolvedModelIconUrl(model.name, model.model, model.provider as Parameters<typeof getResolvedModelIconUrl>[2]);
              return modelIconUrl ? (
                <img src={modelIconUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
              ) : null;
            })()}
            <p className="font-medium text-[var(--text-primary)] truncate">{model.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {model.provider} &middot; {model.model}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            {model.isActive && (
              <span className="rounded-full bg-[#10150a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">
                Active
              </span>
            )}
            {model.isDefault && (
              <span className="rounded-full bg-[#10150a]/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-inverse)]">Default</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          {!model.isActive && (
            <button
              onClick={() => onSetActive(model.id)}
              type="button"
              className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium"
            >
              Activate
            </button>
          )}
          {!model.isDefault && (
            <button
              onClick={() => onSetDefault(model.id)}
              type="button"
              className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium"
            >
              Default</button>
          )}
          <button
            onClick={() => onEdit(model)}
            type="button"
            className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium"
          >
            <LuPencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(model.id)}
            type="button"
            className="rounded-lg btn-glass px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-red-500"
          >
            <LuTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export const ModelCard = memo(ModelCardComponent);