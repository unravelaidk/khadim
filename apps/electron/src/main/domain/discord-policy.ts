import type { StoredDiscordSettings } from "./configuration";

export interface DiscordAuthorizationInput {
  guildId: string | null;
  channelId: string;
  parentChannelId?: string | null;
  authorId: string;
  roleIds: string[];
}

export function isDiscordMessageAuthorized(config: StoredDiscordSettings, input: DiscordAuthorizationInput): boolean {
  if (!input.guildId) return config.allowedUserIds.includes(input.authorId);
  if (input.guildId !== config.guildId) return false;
  if (config.allowedChannelIds.length > 0
    && !config.allowedChannelIds.includes(input.channelId)
    && (!input.parentChannelId || !config.allowedChannelIds.includes(input.parentChannelId))) return false;
  return config.allowAllGuildUsers
    || config.allowedUserIds.includes(input.authorId)
    || input.roleIds.some((roleId) => config.allowedRoleIds.includes(roleId));
}

export function hasDiscordAccessPolicy(config: StoredDiscordSettings): boolean {
  return config.allowAllGuildUsers || config.allowedUserIds.length > 0 || config.allowedRoleIds.length > 0;
}

export function normalizeDiscordIds(values: unknown, kind: "user" | "role" | "channel"): string[] {
  if (!Array.isArray(values)) throw new Error(`Discord allowed ${kind} IDs must be a list.`);
  if (values.length > 100) throw new Error(`Discord allows at most 100 ${kind} IDs.`);
  const normalized = values.map((value) => {
    if (typeof value !== "string") throw new Error(`Discord ${kind} IDs must be text.`);
    const input = value.trim();
    const direct = input.match(/^\d{15,22}$/)?.[0];
    const mention = kind === "user"
      ? input.match(/^<@!?(\d{15,22})>$/)?.[1] ?? input.match(/^user:(\d{15,22})$/i)?.[1]
      : kind === "role"
        ? input.match(/^<@&(\d{15,22})>$/)?.[1] ?? input.match(/^role:(\d{15,22})$/i)?.[1]
        : input.match(/^<#(\d{15,22})>$/)?.[1]
          ?? input.match(/^channel:(\d{15,22})$/i)?.[1]
          ?? input.match(/^https:\/\/(?:www\.)?discord(?:app)?\.com\/channels\/\d{15,22}\/(\d{15,22})(?:\/\d{15,22})?\/?$/i)?.[1];
    const id = direct ?? mention;
    if (!id) throw new Error(`Invalid Discord ${kind} ID: ${input || "(empty)"}. Paste a numeric ID or a copied Discord ${kind === "channel" ? "channel mention/link" : `${kind} mention`}.`);
    return id;
  });
  return [...new Set(normalized)];
}
