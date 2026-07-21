import type { DiscordSettings, DiscordSettingsUpdate } from "../../shared/types";
import { isHarnessMode } from "../../shared/plugins";
import type { CredentialVault, StoredDiscordSettings } from "../domain/configuration";
import { hasDiscordAccessPolicy, normalizeDiscordIds } from "../domain/discord-policy";
import type { DocumentRepository, ProjectRepository } from "../domain/repositories";

interface DiscordLifecycle {
  snapshot(): DiscordSettings;
  restart(): Promise<DiscordSettings>;
}

export function normalizeStoredDiscordSettings(value: unknown): StoredDiscordSettings {
  const source = value && typeof value === "object" ? value as Partial<StoredDiscordSettings> : {};
  const ids = (candidate: unknown): string[] => Array.isArray(candidate)
    ? candidate.filter((id): id is string => typeof id === "string" && /^\d{15,22}$/.test(id))
    : [];
  return {
    enabled: source.enabled === true,
    guildId: typeof source.guildId === "string" ? source.guildId : "",
    projectId: typeof source.projectId === "string" ? source.projectId : "",
    harness: isHarnessMode(source.harness) ? source.harness : "assistant",
    allowAllGuildUsers: source.allowAllGuildUsers === true,
    allowedUserIds: ids(source.allowedUserIds),
    allowedRoleIds: ids(source.allowedRoleIds),
    allowedChannelIds: ids(source.allowedChannelIds),
    ignoredChannelIds: ids(source.ignoredChannelIds),
    freeResponseChannelIds: ids(source.freeResponseChannelIds),
    noThreadChannelIds: ids(source.noThreadChannelIds),
    requireMention: source.requireMention !== false,
    threadRequireMention: source.threadRequireMention === true,
    autoThread: source.autoThread !== false,
    encryptedBotToken: typeof source.encryptedBotToken === "string" ? source.encryptedBotToken : undefined,
  };
}

export class DiscordSettingsService {
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: DocumentRepository<StoredDiscordSettings>,
    private readonly projects: ProjectRepository,
    private readonly credentials: CredentialVault,
    private readonly lifecycle: () => DiscordLifecycle | null,
  ) {}

  async getStored(): Promise<StoredDiscordSettings> {
    return this.repository.read();
  }

  decryptToken(settings: StoredDiscordSettings): string | undefined {
    return settings.encryptedBotToken ? this.credentials.decrypt(settings.encryptedBotToken) : undefined;
  }

  async get(): Promise<DiscordSettings> {
    const bridge = this.lifecycle();
    if (bridge) return bridge.snapshot();
    return this.toPublic(await this.repository.read());
  }

  save(update: DiscordSettingsUpdate): Promise<DiscordSettings> {
    return this.serialize(async () => {
      if (!update || typeof update !== "object") throw new Error("Invalid Discord settings.");
      if (typeof update.enabled !== "boolean") throw new Error("Invalid Discord enabled state.");
      if (!/^\d{15,22}$/.test(update.guildId)) throw new Error("Enter a valid Discord server ID.");
      await this.projects.getProject(update.projectId);
      if (!isHarnessMode(update.harness)) throw new Error("Choose a valid Discord agent runtime.");
      if (typeof update.allowAllGuildUsers !== "boolean") throw new Error("Invalid Discord access policy.");
      const allowedUserIds = normalizeDiscordIds(update.allowedUserIds, "user");
      const allowedRoleIds = normalizeDiscordIds(update.allowedRoleIds, "role");
      const allowedChannelIds = normalizeDiscordIds(update.allowedChannelIds, "channel");
      const ignoredChannelIds = normalizeDiscordIds(update.ignoredChannelIds, "channel");
      const freeResponseChannelIds = normalizeDiscordIds(update.freeResponseChannelIds, "channel");
      const noThreadChannelIds = normalizeDiscordIds(update.noThreadChannelIds, "channel");
      if (typeof update.requireMention !== "boolean" || typeof update.threadRequireMention !== "boolean" || typeof update.autoThread !== "boolean") {
        throw new Error("Invalid Discord channel behavior settings.");
      }
      if (!update.allowAllGuildUsers && allowedUserIds.length === 0 && allowedRoleIds.length === 0) {
        throw new Error("Allow at least one Discord user or role, or explicitly allow everyone in the server.");
      }
      if (update.botToken !== undefined && (typeof update.botToken !== "string" || update.botToken.trim().length < 30 || update.botToken.length > 512)) {
        throw new Error("Enter a valid Discord bot token.");
      }
      const current = await this.repository.read();
      const next: StoredDiscordSettings = {
        enabled: update.enabled,
        guildId: update.guildId,
        projectId: update.projectId,
        harness: update.harness,
        allowAllGuildUsers: update.allowAllGuildUsers,
        allowedUserIds,
        allowedRoleIds,
        allowedChannelIds,
        ignoredChannelIds,
        freeResponseChannelIds,
        noThreadChannelIds,
        requireMention: update.requireMention,
        threadRequireMention: update.threadRequireMention,
        autoThread: update.autoThread,
        encryptedBotToken: current.encryptedBotToken,
      };
      if (update.clearToken) delete next.encryptedBotToken;
      if (update.botToken) next.encryptedBotToken = this.credentials.encrypt(update.botToken.trim());
      if (update.enabled && !next.encryptedBotToken) throw new Error("Add a Discord bot token before connecting.");
      await this.repository.write(next);
      return this.restart();
    });
  }

  disconnect(): Promise<DiscordSettings> {
    return this.serialize(async () => {
      const current = await this.repository.read();
      await this.repository.write({ ...current, enabled: false });
      return this.restart();
    });
  }

  flush(): Promise<void> {
    return this.repository.flush();
  }

  private restart(): Promise<DiscordSettings> {
    const bridge = this.lifecycle();
    return bridge?.restart() ?? Promise.reject(new Error("The Discord bridge is not ready."));
  }

  private toPublic(settings: StoredDiscordSettings): DiscordSettings {
    return {
      configured: Boolean(settings.encryptedBotToken && settings.guildId && settings.projectId && hasDiscordAccessPolicy(settings)),
      connected: false,
      enabled: settings.enabled,
      guildId: settings.guildId,
      projectId: settings.projectId,
      harness: settings.harness,
      allowAllGuildUsers: settings.allowAllGuildUsers,
      allowedUserIds: settings.allowedUserIds,
      allowedRoleIds: settings.allowedRoleIds,
      allowedChannelIds: settings.allowedChannelIds,
      ignoredChannelIds: settings.ignoredChannelIds,
      freeResponseChannelIds: settings.freeResponseChannelIds,
      noThreadChannelIds: settings.noThreadChannelIds,
      requireMention: settings.requireMention,
      threadRequireMention: settings.threadRequireMention,
      autoThread: settings.autoThread,
    };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    let result: T;
    const mutation = this.#mutationQueue.then(async () => { result = await operation(); });
    this.#mutationQueue = mutation.catch(() => undefined);
    return mutation.then(() => result!);
  }
}
