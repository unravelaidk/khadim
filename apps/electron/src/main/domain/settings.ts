import type { AppSettings, ModelConfig } from "../../shared/types";

export interface StoredModelConfig extends Omit<ModelConfig, "hasApiKey"> {
  encryptedApiKey?: string;
}

export interface StoredSettings extends Omit<AppSettings, "hasApiKey" | "models" | "activeProjectId"> {
  activeProjectId?: string;
  encryptedApiKey?: string;
  models: StoredModelConfig[];
}

export type StoredSettingsFallback = Omit<StoredSettings, "models"> & { models?: StoredModelConfig[] };
