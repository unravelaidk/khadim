import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppSettings, ModelConfig, SettingsUpdate } from "../shared/types";
import type { CustomTheme, ThemePalette } from "../shared/themes";
import { BUILT_IN_THEME_IDS } from "../shared/themes";
import { safeModelBaseUrl } from "./model-endpoint-policy";
import type { SettingsRepository } from "./domain/repositories";
import type { StoredModelConfig, StoredSettings, StoredSettingsFallback } from "./domain/settings";
import { isHarnessMode } from "../shared/plugins";

export type { StoredModelConfig, StoredSettings, StoredSettingsFallback } from "./domain/settings";

const defaultTemperature = "0.2";
const modelIdLimit = 128;
const modelNameLimit = 160;
const providerLimit = 80;
const providerModelIdLimit = 512;
const baseUrlLimit = 2_048;
const apiKeyLimit = 16_384;
const customThemeLimit = 24;
const themeColorKeys: Array<keyof ThemePalette> = ["background", "surface", "elevated", "text", "muted", "accent"];

export type NormalizedModelUpdate = SettingsUpdate["models"][number];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maximumLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maximumLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function optionalBaseUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Base URL must be a valid HTTP or HTTPS URL.");
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > baseUrlLimit) throw new Error("Base URL is too long.");
  return safeModelBaseUrl(normalized, "Base URL must be HTTPS unless it points to this computer (localhost/loopback).");
}

function optionalTemperature(value: unknown): string {
  if (value === undefined || value === null || value === "") return defaultTemperature;
  if (typeof value !== "string") throw new Error("Temperature must be a number from 0 to 2.");
  const normalized = value.trim();
  if (!normalized) return defaultTemperature;
  if (normalized.length > 32) throw new Error("Temperature must be a number from 0 to 2.");
  const temperature = Number(normalized);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("Temperature must be a number from 0 to 2.");
  }
  return normalized;
}

function normalizeThemeColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${label} must be a six-digit hex color.`);
  return value.toLowerCase();
}

export function normalizeCustomThemes(value: unknown): CustomTheme[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Custom themes must be a list.");
  if (value.length > customThemeLimit) throw new Error(`Add no more than ${customThemeLimit} custom themes.`);
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate)) throw new Error("A custom theme is invalid.");
    const id = requiredText(candidate.id, "Theme ID", 88);
    if (!/^custom:[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Custom theme ID is invalid.");
    if (ids.has(id)) throw new Error(`Theme ID “${id}” is already used.`);
    ids.add(id);
    const name = requiredText(candidate.name, "Theme name", 60);
    if (candidate.appearance !== "light" && candidate.appearance !== "dark") throw new Error("Choose a light or dark theme appearance.");
    if (!isRecord(candidate.palette)) throw new Error("Theme colors are required.");
    const paletteRecord = candidate.palette;
    const palette = Object.fromEntries(themeColorKeys.map((key) => [key, normalizeThemeColor(paletteRecord[key], `${name} ${key}`)])) as unknown as ThemePalette;
    return { id: id as CustomTheme["id"], name, appearance: candidate.appearance, palette };
  });
}

function normalizeTheme(value: unknown, customThemes: CustomTheme[], fallback: string): SettingsUpdate["theme"] {
  const candidate = typeof value === "string" ? value : fallback;
  if (BUILT_IN_THEME_IDS.has(candidate) || customThemes.some((theme) => theme.id === candidate)) return candidate as SettingsUpdate["theme"];
  if (BUILT_IN_THEME_IDS.has(fallback) || customThemes.some((theme) => theme.id === fallback)) return fallback as SettingsUpdate["theme"];
  return "aura";
}

export function normalizeModelUpdates(models: SettingsUpdate["models"]): NormalizedModelUpdate[] {
  if (!Array.isArray(models) || models.length === 0) throw new Error("Configure at least one model.");
  if (models.length > 100) throw new Error("Configure no more than 100 models.");
  const normalized = models.map((model) => {
    if (!isRecord(model)) throw new Error("A model configuration is invalid.");
    if (typeof model.isActive !== "boolean" || typeof model.isDefault !== "boolean") {
      throw new Error("A model must declare its active and default state.");
    }
    if (model?.apiKey !== undefined && typeof model.apiKey !== "string") throw new Error("API key must be text.");
    if (model?.clearApiKey !== undefined && typeof model.clearApiKey !== "boolean") throw new Error("Invalid API key update.");
    const apiKey = model?.apiKey?.trim() || undefined;
    if (apiKey && apiKey.length > apiKeyLimit) throw new Error("API key is too long.");
    const id = requiredText(model?.id, "Model ID", modelIdLimit);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) {
      throw new Error("Model ID must be a stable identifier without spaces.");
    }
    return {
      ...model,
      id,
      name: requiredText(model?.name, "Model name", modelNameLimit),
      provider: requiredText(model?.provider, "Model provider", providerLimit),
      model: requiredText(model?.model, "Provider model ID", providerModelIdLimit),
      baseUrl: optionalBaseUrl(model?.baseUrl),
      temperature: optionalTemperature(model?.temperature),
      isActive: model?.isActive === true,
      isDefault: model?.isDefault === true,
      apiKey,
      clearApiKey: model?.clearApiKey === true,
    };
  });
  const ids = new Set<string>();
  for (const model of normalized) {
    if (ids.has(model.id)) throw new Error(`Model ID “${model.id}” is already configured.`);
    ids.add(model.id);
  }
  const activeId = normalized.find((model) => model.isActive)?.id
    ?? normalized.find((model) => model.isDefault)?.id
    ?? normalized[0].id;
  const defaultId = normalized.find((model) => model.isDefault)?.id ?? activeId;
  return normalized.map((model) => ({
    ...model,
    isActive: model.id === activeId,
    isDefault: model.id === defaultId,
  }));
}

export function normalizeSettingsUpdate(update: SettingsUpdate): SettingsUpdate {
  if (!isRecord(update)) throw new Error("Invalid settings update.");
  if (!isHarnessMode(update.harness)) throw new Error("Invalid default capability.");
  if (update.soundsEnabled !== undefined && typeof update.soundsEnabled !== "boolean") throw new Error("Invalid sound preference.");
  if (update.soundMood !== undefined && update.soundMood !== "off" && update.soundMood !== "subtle" && update.soundMood !== "expressive") throw new Error("Invalid sound mood.");
  const customThemes = normalizeCustomThemes(update.customThemes);
  const theme = normalizeTheme(update.theme, customThemes, "aura");
  if (theme !== update.theme) throw new Error("Invalid theme.");
  if (update.apiKey !== undefined && typeof update.apiKey !== "string") throw new Error("API key must be text.");
  if (update.clearApiKey !== undefined && typeof update.clearApiKey !== "boolean") throw new Error("Invalid API key update.");
  const apiKey = update.apiKey?.trim() || undefined;
  if (apiKey && apiKey.length > apiKeyLimit) throw new Error("API key is too long.");
  const models = normalizeModelUpdates(update.models);
  const active = models.find((model) => model.isActive)!;
  const activeProjectId = requiredText(update.activeProjectId, "Active project ID", 180);
  const workspace = requiredText(update.workspace, "Project folder", 4_096);
  if (workspace.includes("\0")) throw new Error("Choose a valid local project folder.");
  return {
    ...update,
    provider: active.provider,
    model: active.model,
    models,
    activeProjectId,
    workspace,
    theme,
    customThemes,
    soundMood: update.soundMood ?? (update.soundsEnabled === false ? "off" : "subtle"),
    soundsEnabled: undefined,
    apiKey,
    clearApiKey: update.clearApiKey === true,
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function friendlyModelName(model: string): string {
  return model.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeStoredSettings(value: unknown, fallback: StoredSettingsFallback): StoredSettings {
  const source = isRecord(value) ? value : fallback as unknown as UnknownRecord;
  const provider = optionalText(source.provider) ?? fallback.provider;
  const model = optionalText(source.model) ?? fallback.model;
  const rawModels = Array.isArray(source.models) && source.models.length > 0 ? source.models : null;
  let models: StoredModelConfig[];
  if (rawModels) {
    const modelRecords = rawModels.map((candidate) => {
      if (!isRecord(candidate)) throw new Error("A saved model configuration is invalid.");
      return candidate;
    });
    const normalized = normalizeModelUpdates(modelRecords.map((candidate) => ({
      id: candidate.id as string,
      name: candidate.name as string,
      provider: candidate.provider as string,
      model: candidate.model as string,
      baseUrl: candidate.baseUrl as string | undefined,
      temperature: candidate.temperature as string | undefined,
      isActive: candidate.isActive === true,
      isDefault: candidate.isDefault === true,
    })));
    models = normalized.map((candidate, index) => ({
      id: candidate.id,
      name: candidate.name,
      provider: candidate.provider,
      model: candidate.model,
      baseUrl: candidate.baseUrl,
      temperature: candidate.temperature,
      isActive: candidate.isActive,
      isDefault: candidate.isDefault,
      encryptedApiKey: optionalText(modelRecords[index].encryptedApiKey),
    }));
  } else {
    models = [{
      id: "default-model",
      name: friendlyModelName(model),
      provider,
      model,
      temperature: defaultTemperature,
      isDefault: true,
      isActive: true,
      encryptedApiKey: optionalText(source.encryptedApiKey),
    }];
  }
  const active = models.find((candidate) => candidate.isActive) ?? models[0];
  const customThemes = normalizeCustomThemes(source.customThemes);
  return {
    provider: active.provider,
    model: active.model,
    models,
    activeProjectId: optionalText(source.activeProjectId),
    workspace: optionalText(source.workspace) ?? fallback.workspace,
    harness: isHarnessMode(source.harness) ? source.harness : fallback.harness,
    theme: normalizeTheme(source.theme, customThemes, fallback.theme),
    customThemes,
    soundMood: source.soundMood === "off" || source.soundMood === "subtle" || source.soundMood === "expressive"
      ? source.soundMood
      : source.soundsEnabled === false
        ? "off"
        : fallback.soundMood ?? (fallback.soundsEnabled === false ? "off" : "subtle"),
    encryptedApiKey: optionalText(source.encryptedApiKey),
  };
}

export class SettingsPersistence implements SettingsRepository {
  readonly #path: string;
  readonly #fallback: StoredSettings;
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(path: string, fallback: StoredSettingsFallback) {
    this.#path = path;
    this.#fallback = normalizeStoredSettings(fallback, fallback);
  }

  async read(): Promise<StoredSettings> {
    let value: unknown = this.#fallback;
    try {
      value = JSON.parse(await readFile(this.#path, "utf8")) as unknown;
      await chmod(this.#path, 0o600).catch(() => undefined);
    } catch {
      // Missing and syntactically invalid legacy files both retain the previous fallback behavior.
    }
    return normalizeStoredSettings(value, this.#fallback);
  }

  /**
   * Read at a precise point in the mutation queue. Mutations enqueued before
   * this call are visible; later mutations wait until the snapshot completes.
   */
  snapshot(): Promise<StoredSettings> {
    const snapshot = this.#mutationQueue.then(() => this.read());
    this.#mutationQueue = snapshot.then(() => undefined, () => undefined);
    return snapshot;
  }

  mutate(operation: (current: StoredSettings) => StoredSettings | Promise<StoredSettings>): Promise<StoredSettings> {
    const mutation = this.#mutationQueue.then(async () => {
      const current = await this.read();
      const candidate = await operation(current);
      if (candidate === current) return current;
      const next = normalizeStoredSettings(candidate, this.#fallback);
      await this.#write(next);
      return next;
    });
    this.#mutationQueue = mutation.then(() => undefined, () => undefined);
    return mutation;
  }

  async flush(): Promise<void> {
    await this.#mutationQueue;
  }

  async #write(value: StoredSettings): Promise<void> {
    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.#path), 0o700).catch(() => undefined);
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.#path);
      await chmod(this.#path, 0o600).catch(() => undefined);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
