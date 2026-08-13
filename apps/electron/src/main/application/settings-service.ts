import { resolve } from "node:path";
import type { AppSettings, SettingsUpdate } from "../../shared/types";
import { decodeModelCredential, encodeModelCredential, hasSameCredentialScope } from "../domain/credential-policy";
import type { CredentialVault } from "../domain/configuration";
import type { ProjectRepository, SettingsRepository } from "../domain/repositories";
import type { StoredModelConfig, StoredSettings } from "../domain/settings";

export interface SettingsServiceDependencies {
  settings: SettingsRepository;
  projects: ProjectRepository;
  credentials: CredentialVault;
  ensureProjectContext: () => Promise<unknown>;
  normalizeUpdate: (update: SettingsUpdate) => SettingsUpdate;
}

export class SettingsService {
  constructor(private readonly dependencies: SettingsServiceDependencies) {}

  async get(): Promise<AppSettings> {
    await this.dependencies.ensureProjectContext();
    return this.toPublic(await this.dependencies.settings.snapshot());
  }

  async save(update: SettingsUpdate): Promise<AppSettings> {
    const normalized = this.dependencies.normalizeUpdate(update);
    const next = await this.dependencies.settings.mutate(async (current) => {
      const activeModel = normalized.models.find((model) => model.isActive)!;
      const models: StoredModelConfig[] = normalized.models.map((model) => {
        const existing = current.models.find((item) => item.id === model.id);
        const stored: StoredModelConfig = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          model: model.model,
          baseUrl: model.baseUrl,
          temperature: model.temperature,
          isActive: model.isActive,
          isDefault: model.isDefault,
        };
        if (existing?.encryptedApiKey && hasSameCredentialScope(existing, model)) {
          stored.encryptedApiKey = existing.encryptedApiKey;
          const decrypted = this.dependencies.credentials.decrypt(existing.encryptedApiKey);
          const decoded = decrypted ? decodeModelCredential(model, decrypted) : undefined;
          if (decoded?.legacy) {
            stored.encryptedApiKey = this.dependencies.credentials.encrypt(encodeModelCredential(model, decoded.secret));
          }
        }
        if (model.clearApiKey) delete stored.encryptedApiKey;
        if (model.apiKey) stored.encryptedApiKey = this.dependencies.credentials.encrypt(encodeModelCredential(model, model.apiKey));
        return stored;
      });
      const currentProject = await this.dependencies.projects.getProject(normalized.activeProjectId).catch(() => null);
      const selectedProject = currentProject?.rootPath === resolve(normalized.workspace)
        ? currentProject
        : await this.dependencies.projects.addProject(normalized.workspace);
      await this.dependencies.projects.openProject(selectedProject.id);
      return {
        provider: activeModel.provider,
        model: activeModel.model,
        activeProjectId: selectedProject.id,
        workspace: selectedProject.rootPath,
        harness: normalized.harness,
        theme: normalized.theme,
        customThemes: normalized.customThemes,
        soundMood: normalized.soundMood ?? "subtle",
        models,
      };
    });
    return this.toPublic(next);
  }

  toPublic(settings: StoredSettings): AppSettings {
    const ready = this.dependencies.credentials.available();
    return {
      provider: settings.provider,
      model: settings.model,
      models: settings.models.map(({ encryptedApiKey, ...model }) => ({
        ...model,
        hasApiKey: Boolean(encryptedApiKey),
      })),
      activeProjectId: settings.activeProjectId ?? "",
      workspace: settings.workspace,
      harness: settings.harness,
      theme: settings.theme ?? "aura",
      customThemes: settings.customThemes ?? [],
      soundMood: settings.soundMood ?? (settings.soundsEnabled === false ? "off" : "subtle"),
      hasApiKey: ready && Boolean(settings.models.find((model) => model.isActive)?.encryptedApiKey ?? settings.encryptedApiKey),
    };
  }

  decryptModelCredential(settings: StoredSettings, modelId?: string): string | undefined {
    const encrypted = modelId
      ? settings.models.find((model) => model.id === modelId)?.encryptedApiKey
      : settings.models.find((model) => model.isActive)?.encryptedApiKey ?? settings.encryptedApiKey;
    if (!encrypted) return undefined;
    const model = modelId
      ? settings.models.find((candidate) => candidate.id === modelId)
      : settings.models.find((candidate) => candidate.isActive);
    const decrypted = this.dependencies.credentials.decrypt(encrypted);
    return model && decrypted ? decodeModelCredential(model, decrypted)?.secret : decrypted;
  }
}
