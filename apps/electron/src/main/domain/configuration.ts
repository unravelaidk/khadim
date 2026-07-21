import type { HarnessMode, SearchProviderId } from "../../shared/types";

export interface StoredSearchSettings {
  activeProvider: SearchProviderId;
  encryptedApiKeys: Partial<Record<SearchProviderId, string>>;
}

export interface StoredGoogleConnection {
  clientId?: string;
  encryptedClientSecret?: string;
  email?: string;
  subject?: string;
  scopes: string[];
  connectedAt?: string;
  encryptedRefreshToken?: string;
}

export interface StoredDiscordSettings {
  enabled: boolean;
  guildId: string;
  projectId: string;
  harness: HarnessMode;
  allowAllGuildUsers: boolean;
  allowedUserIds: string[];
  allowedRoleIds: string[];
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  freeResponseChannelIds: string[];
  noThreadChannelIds: string[];
  requireMention: boolean;
  threadRequireMention: boolean;
  autoThread: boolean;
  encryptedBotToken?: string;
}

export interface CredentialVault {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string | undefined;
}
