import { useState, useEffect, useCallback } from "react";
import { showError } from "../lib/toast";
import type { ModelOption } from "../components/agent-builder/ModelSelector";

interface ModelsApiResponse {
  models?: Array<{
    id: string;
    name: string;
    provider: ModelOption["provider"];
    model: string;
    isActive?: boolean | null;
  }>;
  error?: string;
}

interface UseModelsResult {
  models: ModelOption[];
  selectedModelId: string | null;
  isLoading: boolean;
  isUpdating: boolean;
  selectModel: (modelId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useModels(initialModelId?: string | null): UseModelsResult {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(initialModelId || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as ModelsApiResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load models");
      }

      const mapped = (payload.models || []).map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        model: model.model,
        isActive: model.isActive,
      }));

      setModels(mapped);

      setSelectedModelId((prev) => {
        if (prev && mapped.some((model) => model.id === prev)) {
          return prev;
        }
        const active = mapped.find((model) => model.isActive);
        return active?.id || mapped[0]?.id || null;
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load models");
      setModels([]);
      setSelectedModelId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const selectModel = useCallback(async (modelId: string): Promise<void> => {
    if (!modelId || modelId === selectedModelId) return;

    const previousModelId = selectedModelId;
    setSelectedModelId(modelId);
    setIsUpdating(true);

    try {
      const body = new FormData();
      body.append("intent", "setActive");
      body.append("id", modelId);

      const response = await fetch("/api/models", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update active model");
      }

      setModels((prev) =>
        prev.map((model) => ({
          ...model,
          isActive: model.id === modelId,
        }))
      );
    } catch (error) {
      setSelectedModelId(previousModelId);
      showError(error instanceof Error ? error.message : "Failed to update active model");
    } finally {
      setIsUpdating(false);
    }
  }, [selectedModelId]);

  return {
    models,
    selectedModelId,
    isLoading,
    isUpdating,
    selectModel,
    refresh: fetchModels,
  };
}