import { describe, expect, it } from "vitest";
import { discordChannelMatches, discordContinuityContext, discordConversationPreferences, discordDisconnectMessage, discordInviteUrl, discordModelSelectorData, discordProjectForScope, discordProjectSelectorData, discordRunPreview, discordSessionScope, discordSlashCommandData, discordThreadTitle, formatDiscordToolProgress, hasDiscordAccessPolicy, isDiscordMessageAuthorized, normalizeDiscordIds, normalizeDiscordSessionState, resolveDiscordTextAttachments, splitDiscordMessage, type StoredDiscordSettings } from "../../../src/main/discord-bridge";

const restrictedConfig: StoredDiscordSettings = {
  enabled: true,
  guildId: "123456789012345678",
  projectId: "project-a",
  harness: "assistant",
  allowAllGuildUsers: false,
  allowedUserIds: ["234567890123456789"],
  allowedRoleIds: ["345678901234567890"],
  allowedChannelIds: ["456789012345678901"],
  ignoredChannelIds: [],
  freeResponseChannelIds: [],
  noThreadChannelIds: [],
  requireMention: true,
  threadRequireMention: false,
  autoThread: true,
};

describe("splitDiscordMessage", () => {
  it("keeps each Discord reply within the platform limit", () => {
    const parts = splitDiscordMessage(`${"word ".repeat(900)}done`);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 2_000)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toContain("done");
  });

  it("provides a useful response for empty agent output", () => {
    expect(splitDiscordMessage("   ")).toEqual(["Khadim completed the run without a text response."]);
  });

  it("creates a least-privilege bot invite for the authenticated application", () => {
    const url = new URL(discordInviteUrl("123456789012345678"));
    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("123456789012345678");
    expect(url.searchParams.get("scope")).toBe("bot applications.commands");
    expect(url.searchParams.get("permissions")).toBe("274878286912");
  });
});

describe("Discord authorization", () => {
  it("normalizes IDs copied from Discord mentions and channel links", () => {
    expect(normalizeDiscordIds(["<@234567890123456789>", "user:345678901234567890"], "user")).toEqual(["234567890123456789", "345678901234567890"]);
    expect(normalizeDiscordIds(["<@&345678901234567890>"], "role")).toEqual(["345678901234567890"]);
    expect(normalizeDiscordIds(["<#456789012345678901>", "https://discord.com/channels/123456789012345678/567890123456789012"], "channel")).toEqual(["456789012345678901", "567890123456789012"]);
  });

  it("requires an explicit access policy before connection", () => {
    expect(hasDiscordAccessPolicy({ ...restrictedConfig, allowedUserIds: [], allowedRoleIds: [], allowAllGuildUsers: false })).toBe(false);
    expect(hasDiscordAccessPolicy(restrictedConfig)).toBe(true);
  });

  it("fails closed and applies user, role, and channel restrictions", () => {
    const input = { guildId: restrictedConfig.guildId, channelId: restrictedConfig.allowedChannelIds[0], authorId: "999999999999999999", roleIds: [] };
    expect(isDiscordMessageAuthorized(restrictedConfig, input)).toBe(false);
    expect(isDiscordMessageAuthorized(restrictedConfig, { ...input, authorId: restrictedConfig.allowedUserIds[0] })).toBe(true);
    expect(isDiscordMessageAuthorized(restrictedConfig, { ...input, roleIds: restrictedConfig.allowedRoleIds })).toBe(true);
    expect(isDiscordMessageAuthorized(restrictedConfig, { ...input, channelId: "567890123456789012", authorId: restrictedConfig.allowedUserIds[0] })).toBe(false);
  });

  it("allows configured parent channels for threads", () => {
    expect(isDiscordMessageAuthorized(restrictedConfig, {
      guildId: restrictedConfig.guildId,
      channelId: "567890123456789012",
      parentChannelId: restrictedConfig.allowedChannelIds[0],
      authorId: restrictedConfig.allowedUserIds[0],
      roleIds: [],
    })).toBe(true);
  });

  it("requires an explicit user grant for direct messages", () => {
    const openConfig = { ...restrictedConfig, allowAllGuildUsers: true, allowedChannelIds: [] };
    expect(isDiscordMessageAuthorized(openConfig, { guildId: null, channelId: "567890123456789012", authorId: "999999999999999999", roleIds: [] })).toBe(false);
    expect(isDiscordMessageAuthorized(openConfig, { guildId: null, channelId: "567890123456789012", authorId: restrictedConfig.allowedUserIds[0], roleIds: [] })).toBe(true);
  });
});

describe("discordSessionScope", () => {
  it("isolates regular channels per user while sharing DMs and threads", () => {
    expect(discordSessionScope({ channelId: "channel", authorId: "alice", isDm: false, isThread: false })).toBe("channel.alice");
    expect(discordSessionScope({ channelId: "thread", authorId: "alice", isDm: false, isThread: true })).toBe("thread");
    expect(discordSessionScope({ channelId: "dm", authorId: "alice", isDm: true, isThread: false })).toBe("dm");
  });
});

describe("Discord session continuity", () => {
  it("replays a bounded role-aware transcript when a thread resumes after an app restart", () => {
    const context = discordContinuityContext({
      id: "conversation",
      projectId: "project",
      engineSessionKey: "discord.v2.thread.session",
      title: "Discord thread 123",
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:03:00.000Z",
      messages: [
        { id: "u1", role: "user", content: "We are fixing the invoice importer.", createdAt: "2026-07-20T10:00:00.000Z", status: "complete" },
        { id: "a1", role: "assistant", content: "I found the CSV delimiter bug.", createdAt: "2026-07-20T10:01:00.000Z", status: "complete" },
        { id: "u2", role: "user", content: "Patch it and rerun the test.", createdAt: "2026-07-20T10:02:00.000Z", status: "complete" },
        { id: "a2", role: "assistant", content: "", createdAt: "2026-07-20T10:03:00.000Z", status: "error" },
      ],
      runs: [],
    }, { restoreAfterRestart: true });

    expect(context).toContain("durable Discord transcript");
    expect(context).toContain('"role":"user","content":"We are fixing the invoice importer."');
    expect(context).toContain('"role":"assistant","content":"I found the CSV delimiter bug."');
    expect(context).toContain('"role":"user","content":"Patch it and rerun the test."');
    expect(context).not.toContain('"content":""');
  });

  it("restores the thread's last model, capability, and system prompt from its durable run", () => {
    const preferences = discordConversationPreferences({
      id: "conversation",
      projectId: "project",
      engineSessionKey: "discord.v2.thread.session",
      title: "Discord thread 123",
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:03:00.000Z",
      messages: [],
      runs: [{
        id: "run",
        projectId: "project",
        conversationId: "conversation",
        userMessageId: "user",
        assistantMessageId: "assistant",
        status: "complete",
        createdAt: "2026-07-20T10:00:00.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Act as the invoice specialist." },
        model: { id: "model-b", name: "Model B", provider: "provider-b", model: "b-1" },
        harness: "rpa",
        enabledTools: ["web"],
      }],
    });

    expect(preferences).toEqual({
      modelId: "model-b",
      harness: "rpa",
      systemPrompt: "Act as the invoice specialist.",
    });
  });

  it("carries an interrupted turn into the next prompt even without an app restart", () => {
    const context = discordContinuityContext({
      id: "conversation",
      projectId: "project",
      engineSessionKey: "discord.v2.thread.session",
      title: "Discord thread 123",
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:03:00.000Z",
      messages: [
        { id: "u1", role: "user", content: "Patch the importer and run the tests.", createdAt: "2026-07-20T10:02:00.000Z", status: "complete" },
        { id: "a1", role: "assistant", content: "I patched the parser, but the test run", createdAt: "2026-07-20T10:03:00.000Z", status: "error" },
      ],
      runs: [{
        id: "run",
        projectId: "project",
        conversationId: "conversation",
        userMessageId: "u1",
        assistantMessageId: "a1",
        status: "stopped",
        createdAt: "2026-07-20T10:02:00.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model", name: "Model", provider: "provider", model: "m" },
        harness: "assistant",
        enabledTools: ["files"],
      }],
    }, { restoreAfterRestart: false });

    expect(context).toContain("interrupted Discord turn");
    expect(context).toContain("Patch the importer and run the tests.");
    expect(context).toContain("I patched the parser, but the test run");
  });

  it("restores the most recently used project for a Discord scope after restart", () => {
    const conversations = [
      { id: "old", projectId: "project-a", engineSessionKey: "discord.v2.thread-1.old", title: "Discord thread thread-1", createdAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:01:00.000Z", messages: [] },
      { id: "latest", projectId: "project-b", engineSessionKey: "discord.v2.thread-1.latest", title: "Discord thread thread-1", createdAt: "2026-07-20T11:00:00.000Z", updatedAt: "2026-07-20T11:01:00.000Z", messages: [] },
      { id: "other", projectId: "project-c", engineSessionKey: "discord.v2.other.latest", title: "Discord thread other", createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:01:00.000Z", messages: [] },
    ];

    expect(discordProjectForScope(conversations, "thread-1", "project-a")).toBe("project-b");
    expect(discordProjectForScope(conversations, "missing", "project-a")).toBe("project-a");
  });

  it("loads only valid durable Discord project choices", () => {
    expect(normalizeDiscordSessionState({
      projectByScope: {
        "123456789012345678": "project-a",
        "123456789012345678.234567890123456789": "project-b",
        "": "invalid",
      },
    })).toEqual({
      projectByScope: {
        "123456789012345678": "project-a",
        "123456789012345678.234567890123456789": "project-b",
      },
    });
    expect(normalizeDiscordSessionState(null)).toEqual({ projectByScope: {} });
  });
});

describe("Discord native UI", () => {
  it("explains privileged-intent connection failures", () => {
    expect(discordDisconnectMessage(4_014)).toContain("Enable Message Content Intent");
  });

  it("registers supported commands with optional values where needed", () => {
    const commands = discordSlashCommandData();
    expect(commands.map((command) => command.name)).toContain("help");
    expect(commands.map((command) => command.name)).toContain("model");
    expect(commands.map((command) => command.name)).toContain("project");
    expect(commands.map((command) => command.name)).toContain("stop");
    expect(commands.find((command) => command.name === "model")?.options).toHaveLength(1);
    expect(commands.find((command) => command.name === "project")?.options).toHaveLength(1);
  });

  it("builds a two-step provider and model selector with the current choice marked", () => {
    const models = [
      { id: "openai-gpt", name: "GPT", provider: "openai", model: "gpt-5", isDefault: true, isActive: true, hasApiKey: true },
      { id: "openai-mini", name: "GPT Mini", provider: "openai", model: "gpt-5-mini", isDefault: false, isActive: true, hasApiKey: true },
      { id: "anthropic-sonnet", name: "Sonnet", provider: "anthropic", model: "claude-sonnet", isDefault: false, isActive: true, hasApiKey: true },
    ];

    expect(discordModelSelectorData(models, "openai-mini")).toMatchObject({
      stage: "provider",
      options: [
        { value: "openai", description: "2 models · current", selected: true },
        { value: "anthropic", description: "1 model", selected: false },
      ],
    });
    expect(discordModelSelectorData(models, "openai-mini", "openai")).toMatchObject({
      stage: "model",
      options: [
        { value: "openai-gpt", label: "GPT", selected: false },
        { value: "openai-mini", label: "GPT Mini", selected: true },
      ],
    });
  });

  it("builds a project selector that identifies the active local folder", () => {
    const projects = [
      { id: "project-a", name: "Invoices", rootPath: "/work/invoices", createdAt: "now", updatedAt: "now", lastOpenedAt: "now" },
      { id: "project-b", name: "Website", rootPath: "/work/website", createdAt: "now", updatedAt: "now", lastOpenedAt: "now" },
    ];

    expect(discordProjectSelectorData(projects, "project-b")).toMatchObject({
      heading: "Choose a project folder",
      options: [
        { value: "project-a", label: "Invoices", description: "/work/invoices", selected: false },
        { value: "project-b", label: "Website", description: "/work/website", selected: true },
      ],
    });
  });

  it("streams tool activity alongside accumulated response text", () => {
    const preview = discordRunPreview({
      id: "conversation", projectId: "project", engineSessionKey: "session", title: "Discord", createdAt: "now", updatedAt: "now", runs: [],
      messages: [{ id: "assistant", role: "assistant", content: "I am checking that.", createdAt: "now", toolCalls: [{ id: "tool", tool: "web", title: "Searching the web", status: "running" }] }],
    }, "assistant");
    expect(preview).toBe("I am checking that.\n\n_Working: Searching the web_");
  });

  it("formats durable accumulated tool progress", () => {
    expect(formatDiscordToolProgress(new Map([
      ["search", { title: "Searching", status: "complete" as const }],
      ["read", { title: "Reading report", status: "running" as const }],
    ]))).toBe("[done] Searching\n[working] Reading report");
  });
});

describe("Discord channel behavior", () => {
  it("inherits channel policy from a thread parent", () => {
    expect(discordChannelMatches("thread", "parent", ["parent"])).toBe(true);
    expect(discordChannelMatches("thread", "parent", ["other"])).toBe(false);
  });

  it("creates safe bounded thread titles", () => {
    expect(discordThreadTitle(`<@123456789012345678> ${"task ".repeat(30)}`)).not.toContain("<@");
    expect(discordThreadTitle(`${"task ".repeat(30)}`).length).toBeLessThanOrEqual(80);
  });
});

describe("Discord attachments", () => {
  it("downloads bounded Discord-hosted text files into an untrusted JSON prompt", async () => {
    const fetcher = async () => new Response("hello\nworld", { status: 200, headers: { "content-type": "text/plain" } });
    const result = await resolveDiscordTextAttachments([{ name: "notes.md", contentType: "text/markdown", size: 11, url: "https://cdn.discordapp.com/attachments/1/2/notes.md" }], fetcher as typeof fetch);
    expect(result.metadata).toEqual([{ name: "notes.md", type: "text/markdown" }]);
    expect(result.promptSuffix).toContain("hello\\nworld");
  });

  it("rejects non-text files and non-Discord download hosts", async () => {
    await expect(resolveDiscordTextAttachments([{ name: "photo.png", contentType: "image/png", size: 10, url: "https://cdn.discordapp.com/attachments/1/2/photo.png" }])).rejects.toThrow("not a supported text file");
    await expect(resolveDiscordTextAttachments([{ name: "notes.txt", contentType: "text/plain", size: 10, url: "https://example.com/notes.txt" }])).rejects.toThrow("Discord's media service");
  });
});
