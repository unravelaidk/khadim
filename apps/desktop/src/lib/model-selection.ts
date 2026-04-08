import type { OpenCodeModelOption, OpenCodeModelRef } from "./bindings";

export function getModelSettingKey(workspaceId: string) {
  return `opencode:model:${workspaceId}`;
}

export function getModelKey(model: OpenCodeModelRef) {
  return `${model.provider_id}:${model.model_id}`;
}

export function parseStoredModel(value: string | null): OpenCodeModelRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OpenCodeModelRef>;
    if (typeof parsed.provider_id === "string" && typeof parsed.model_id === "string") {
      return { provider_id: parsed.provider_id, model_id: parsed.model_id };
    }
  } catch {
    return null;
  }
  return null;
}

export function resolvePreferredModel<T extends OpenCodeModelRef & { is_default: boolean }>(
  models: T[],
  selected: OpenCodeModelRef | null,
): OpenCodeModelRef | null {
  if (selected && models.some((model) => getModelKey(model) === getModelKey(selected))) {
    return selected;
  }

  const fallback = models.find((model) => model.is_default) ?? models[0] ?? null;
  return fallback ? { provider_id: fallback.provider_id, model_id: fallback.model_id } : null;
}

export function findSelectedModelOption<T extends OpenCodeModelRef>(
  models: T[],
  selected: OpenCodeModelRef | null,
): T | null {
  if (!selected) return null;
  return models.find((model) => getModelKey(model) === getModelKey(selected)) ?? null;
}

export function selectModelByKey(models: OpenCodeModelOption[], modelKey: string) {
  const next = models.find((model) => getModelKey(model) === modelKey);
  return next ? { provider_id: next.provider_id, model_id: next.model_id } : null;
}
