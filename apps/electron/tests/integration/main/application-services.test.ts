import { describe, expect, it, vi } from "vitest";
import type { DiscordSettings, SettingsUpdate } from "../../../src/shared/types";
import { DiscordSettingsService, normalizeStoredDiscordSettings } from "../../../src/main/application/discord-settings-service";
import { SearchSettingsService, normalizeStoredSearchSettings } from "../../../src/main/application/search-settings-service";
import { GoogleConnectionService, normalizeStoredGoogleConnection } from "../../../src/main/application/google-connection-service";
import { SettingsService } from "../../../src/main/application/settings-service";
import { ProjectService } from "../../../src/main/application/project-service";
import { decodeModelCredential } from "../../../src/main/domain/credential-policy";
import type { CredentialVault, StoredDiscordSettings, StoredGoogleConnection, StoredSearchSettings } from "../../../src/main/domain/configuration";
import type { DocumentRepository, ProjectDataRepository, ProjectRepository, SettingsRepository } from "../../../src/main/domain/repositories";
import type { StoredSettings } from "../../../src/main/domain/settings";
import { normalizeSettingsUpdate } from "../../../src/main/settings-persistence";

class MemoryDocument<T> implements DocumentRepository<T> {
  constructor(public value: T) {}
  async read(): Promise<T> { return structuredClone(this.value); }
  async write(value: T): Promise<void> { this.value = structuredClone(value); }
  async flush(): Promise<void> {}
}

const vault: CredentialVault = {
  available: () => true,
  encrypt: (value) => `encrypted:${value}`,
  decrypt: (value) => value.startsWith("encrypted:") ? value.slice(10) : undefined,
};

function projects(rootPath = "/workspace"): ProjectRepository {
  const project = { id: "project-one", name: "One", rootPath, createdAt: "now", updatedAt: "now", lastOpenedAt: "now" };
  return {
    listProjects: async () => [project],
    addProject: async (path) => ({ ...project, rootPath: path }),
    migrateLegacyWorkspace: async () => project,
    openProject: async () => project,
    getProject: async () => project,
    renameProject: async () => project,
    relocateProject: async () => project,
    removeProject: async () => project,
    checkProjectAvailability: async () => ({ project, available: true }),
    flush: async () => undefined,
  };
}

function projectData(rootPath = "/workspace"): ProjectDataRepository {
  return {
    ...projects(rootPath),
    listConversations: async () => [],
    saveConversation: async () => undefined,
    removeConversation: async () => undefined,
    listArtifacts: async () => [],
    saveArtifacts: async () => undefined,
  };
}

describe("application modules", () => {
  it("saves settings through repositories and the credential vault", async () => {
    let stored: StoredSettings = {
      provider: "anthropic", model: "old", workspace: "/workspace", harness: "assistant", theme: "dark",
      activeProjectId: "project-one",
      models: [{ id: "model-one", name: "Old", provider: "anthropic", model: "old", temperature: "0.2", isActive: true, isDefault: true }],
    };
    const repository: SettingsRepository = {
      snapshot: async () => stored,
      mutate: async (operation) => (stored = await operation(stored)),
      flush: async () => undefined,
    };
    const service = new SettingsService({ settings: repository, projects: projects(), credentials: vault, ensureProjectContext: async () => undefined, normalizeUpdate: normalizeSettingsUpdate });
    const update: SettingsUpdate = {
      provider: "openai", model: "gpt", activeProjectId: "project-one", workspace: "/workspace", harness: "rpa", theme: "light",
      models: [{ id: "model-one", name: "GPT", provider: "openai", model: "gpt", temperature: "0.4", isActive: true, isDefault: true, apiKey: "secret" }],
    };

    const result = await service.save(update);

    const encryptedApiKey = stored.models[0].encryptedApiKey;
    expect(encryptedApiKey).toBeDefined();
    expect(decodeModelCredential(stored.models[0], vault.decrypt(encryptedApiKey!)!)).toEqual({ secret: "secret", legacy: false });
    expect(result).toMatchObject({ provider: "openai", model: "gpt", harness: "rpa", hasApiKey: true });
  });

  it("keeps a saved model key when unrelated settings are edited", async () => {
    let stored: StoredSettings = {
      provider: "openai", model: "gpt-5", workspace: "/workspace", harness: "assistant", theme: "dark",
      activeProjectId: "project-one",
      models: [{ id: "model-one", name: "GPT", provider: "openai", model: "gpt-5", temperature: "0.2", isActive: true, isDefault: true }],
    };
    const repository: SettingsRepository = {
      snapshot: async () => stored,
      mutate: async (operation) => (stored = await operation(stored)),
      flush: async () => undefined,
    };
    const service = new SettingsService({ settings: repository, projects: projects(), credentials: vault, ensureProjectContext: async () => undefined, normalizeUpdate: normalizeSettingsUpdate });
    const model = { id: "model-one", name: "GPT", provider: "openai", model: "gpt-5", temperature: "0.2", isActive: true, isDefault: true };

    await service.save({ provider: "openai", model: "gpt-5", activeProjectId: "project-one", workspace: "/workspace", harness: "assistant", theme: "dark", models: [{ ...model, apiKey: "durable-secret" }] });
    const originalCiphertext = stored.models[0].encryptedApiKey;
    const result = await service.save({ provider: "openai", model: "gpt-5", activeProjectId: "project-one", workspace: "/workspace", harness: "rpa", theme: "light", models: [{ ...model, name: "Renamed model" }] });

    expect(stored.models[0].encryptedApiKey).toBe(originalCiphertext);
    expect(service.decryptModelCredential(stored, "model-one")).toBe("durable-secret");
    expect(result.models[0].hasApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("durable-secret");
  });

  it("removes a saved model key only after an explicit clear request", async () => {
    const scope = { id: "model-one", name: "GPT", provider: "openai", model: "gpt-5", temperature: "0.2", isActive: true, isDefault: true };
    let stored: StoredSettings = {
      provider: "openai", model: "gpt-5", workspace: "/workspace", harness: "assistant", theme: "dark", activeProjectId: "project-one",
      models: [{ ...scope, encryptedApiKey: vault.encrypt(JSON.stringify({ kind: "khadim.model-credential", version: 1, provider: "openai", model: "gpt-5", baseUrl: "", secret: "remove-me" })) }],
    };
    const repository: SettingsRepository = { snapshot: async () => stored, mutate: async (operation) => (stored = await operation(stored)), flush: async () => undefined };
    const service = new SettingsService({ settings: repository, projects: projects(), credentials: vault, ensureProjectContext: async () => undefined, normalizeUpdate: normalizeSettingsUpdate });

    const result = await service.save({ provider: "openai", model: "gpt-5", activeProjectId: "project-one", workspace: "/workspace", harness: "assistant", theme: "dark", models: [{ ...scope, clearApiKey: true }] });

    expect(stored.models[0].encryptedApiKey).toBeUndefined();
    expect(result.models[0].hasApiKey).toBe(false);
  });

  it("reports that ciphertext remains saved when the OS vault is temporarily locked", () => {
    const lockedVault: CredentialVault = { available: () => false, encrypt: () => { throw new Error("locked"); }, decrypt: () => undefined };
    const service = new SettingsService({ settings: {} as SettingsRepository, projects: projects(), credentials: lockedVault, ensureProjectContext: async () => undefined, normalizeUpdate: normalizeSettingsUpdate });
    const result = service.toPublic({
      provider: "openai", model: "gpt-5", workspace: "/workspace", harness: "assistant", theme: "dark",
      models: [{ id: "model-one", name: "GPT", provider: "openai", model: "gpt-5", isActive: true, isDefault: true, encryptedApiKey: "ciphertext" }],
    });

    expect(result.models[0].hasApiKey).toBe(true);
    expect(result.hasApiKey).toBe(false);
  });

  it("persists search settings and only exposes decrypted credentials to a run", async () => {
    const repository = new MemoryDocument<StoredSearchSettings>(normalizeStoredSearchSettings(null));
    const service = new SearchSettingsService(repository, vault);

    await service.save({ activeProvider: "exa", provider: "exa", apiKey: "search-secret" });

    expect(repository.value.encryptedApiKeys.exa).toBe("encrypted:search-secret");
    expect(await service.runConfiguration()).toEqual({ provider: "exa", env: { EXA_API_KEY: "search-secret" } });
    expect(await service.get()).toMatchObject({
      activeProvider: "exa",
      providers: expect.arrayContaining([expect.objectContaining({ id: "exa", configured: true, credentialStatus: "ready" })]),
    });
  });

  it("falls back to keyless search when an optional provider credential cannot be unlocked", async () => {
    const repository = new MemoryDocument<StoredSearchSettings>({
      activeProvider: "parallel",
      encryptedApiKeys: { parallel: "unreadable-ciphertext" },
    });
    const lockedVault: CredentialVault = {
      available: () => true,
      encrypt: (value) => value,
      decrypt: () => undefined,
    };
    const service = new SearchSettingsService(repository, lockedVault);

    await expect(service.runConfiguration()).resolves.toEqual({
      provider: "duckduckgo",
      env: {},
      warning: "The saved Parallel search credential could not be unlocked. This run is using DuckDuckGo instead.",
    });
    await expect(service.get()).resolves.toMatchObject({
      activeProvider: "parallel",
      providers: expect.arrayContaining([expect.objectContaining({ id: "parallel", configured: false, credentialStatus: "locked" })]),
    });
  });

  it("encrypts Google refresh tokens and exposes only public account status", async () => {
    const repository = new MemoryDocument<StoredGoogleConnection>(normalizeStoredGoogleConnection(null));
    const oauth = {
      configured: () => true,
      authorize: vi.fn(async () => ({ email: "owner@example.com", subject: "google-user-1", scopes: ["gmail.readonly"], refreshToken: "refresh-secret" })),
      refresh: vi.fn(async () => "access-secret"),
      cancel: vi.fn(),
    };
    const service = new GoogleConnectionService(repository, vault, oauth);

    const connected = await service.connect();

    expect(repository.value.encryptedRefreshToken).toContain("encrypted:");
    expect(connected).toEqual({ configured: true, connected: true, credentialStatus: "ready", email: "owner@example.com", scopes: ["gmail.readonly"] });
    expect(JSON.stringify(connected)).not.toContain("refresh-secret");
    await expect(service.accessToken()).resolves.toBe("access-secret");
    expect(oauth.refresh).toHaveBeenCalledWith("refresh-secret", undefined, undefined);
  });

  it("reports a locked Google credential without exposing or deleting it", async () => {
    const repository = new MemoryDocument<StoredGoogleConnection>({
      email: "owner@example.com",
      subject: "google-user-1",
      scopes: ["gmail.readonly"],
      encryptedRefreshToken: "ciphertext",
    });
    const service = new GoogleConnectionService(repository, { ...vault, decrypt: () => undefined }, {
      configured: () => true,
      authorize: vi.fn(),
      refresh: vi.fn(),
      cancel: vi.fn(),
    });

    await expect(service.get()).resolves.toEqual({ configured: true, connected: false, credentialStatus: "locked", email: "owner@example.com", scopes: ["gmail.readonly"] });
    await expect(service.accessToken()).rejects.toThrow("locked");
    expect(repository.value.encryptedRefreshToken).toBe("ciphertext");
  });

  it("persists a user-owned Google client ID and keeps it after disconnect", async () => {
    const repository = new MemoryDocument<StoredGoogleConnection>(normalizeStoredGoogleConnection(null));
    const oauth = {
      configured: (clientId?: string, clientSecret?: string) => Boolean(clientId && clientSecret),
      authorize: vi.fn(async () => ({ email: "owner@example.com", subject: "google-user-1", scopes: ["gmail.readonly"], refreshToken: "refresh-secret" })),
      refresh: vi.fn(async () => "access-secret"),
      cancel: vi.fn(),
    };
    const service = new GoogleConnectionService(repository, vault, oauth);
    const clientId = "123456789-example.apps.googleusercontent.com";
    const clientSecret = "GOCSPX-desktop-secret";

    await service.connect({ clientId, clientSecret });
    const disconnected = await service.disconnect();

    expect(oauth.authorize).toHaveBeenCalledWith(clientId, clientSecret);
    expect(repository.value).toEqual({ clientId, encryptedClientSecret: `encrypted:${clientSecret}`, scopes: [] });
    expect(disconnected).toEqual({ configured: true, connected: false, credentialStatus: "missing", scopes: [] });
  });

  it("validates and persists Discord settings before restarting the bridge", async () => {
    const repository = new MemoryDocument<StoredDiscordSettings>(normalizeStoredDiscordSettings(null));
    const connected: DiscordSettings = {
      configured: true, connected: true, enabled: true, guildId: "123456789012345", projectId: "project-one", harness: "plugin:khadim.opencode/opencode",
      allowAllGuildUsers: true, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [],
      freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true,
    };
    const restart = vi.fn(async () => connected);
    const service = new DiscordSettingsService(repository, projects(), vault, () => ({ snapshot: () => connected, restart }));

    const result = await service.save({
      enabled: true, guildId: connected.guildId, projectId: connected.projectId, harness: connected.harness, allowAllGuildUsers: true,
      allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [],
      requireMention: true, threadRequireMention: false, autoThread: true, botToken: "x".repeat(40),
    });

    expect(repository.value.encryptedBotToken).toBe(`encrypted:${"x".repeat(40)}`);
    expect(repository.value.harness).toBe("plugin:khadim.opencode/opencode");
    expect(restart).toHaveBeenCalledOnce();
    expect(result.connected).toBe(true);
  });

  it("keeps project removal behind the active-run policy", async () => {
    const removeProject = vi.fn(async () => projectData().getProject("project-one"));
    const repository = { ...projectData(), removeProject };
    const service = new ProjectService({
      projects: repository,
      settings: { snapshot: async () => { throw new Error("unused"); }, mutate: async (operation) => operation({ provider: "", model: "", models: [], workspace: "/workspace", harness: "assistant", theme: "dark" }), flush: async () => undefined },
      runs: { hasActiveRun: () => true, terminalRunIds: () => [], acknowledge: () => undefined },
      defaultProjectPath: () => "/workspace",
      isQuitting: () => false,
      trackCriticalOperation: (operation) => operation(),
    });

    await expect(service.remove("project-one")).rejects.toThrow("active run");
    expect(removeProject).not.toHaveBeenCalled();
  });
});
