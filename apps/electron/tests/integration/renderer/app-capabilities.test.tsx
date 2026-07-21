import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, KhadimDesktopApi, PluginEntry, Project } from "../../../src/shared/types";
import App from "../../../src/renderer/src/App";

const project: Project = {
  id: "project-a",
  name: "Quarterly planning",
  rootPath: "/tmp/quarterly-planning",
  createdAt: "2026-07-13T08:00:00.000Z",
  updatedAt: "2026-07-13T08:00:00.000Z",
  lastOpenedAt: "2026-07-13T08:00:00.000Z",
};

const openCodePlugin: PluginEntry = {
  id: "khadim.opencode",
  name: "OpenCode",
  version: "0.2.1",
  description: "Runs chats through OpenCode.",
  enabled: true,
  bundled: true,
  capabilities: ["harness"],
  harnesses: [{
    id: "plugin:khadim.opencode/opencode",
    pluginId: "khadim.opencode",
    capabilityId: "opencode",
    name: "OpenCode",
    description: "Use a loopback OpenCode server.",
  }],
  permissions: { network: { allowedHosts: ["127.0.0.1", "localhost"], allowHttp: true } },
  config: [
    { key: "binaryPath", label: "Binary path", type: "string", configured: true, value: "opencode" },
    { key: "baseUrl", label: "Server URL", type: "string", configured: true, value: "http://127.0.0.1:4096" },
    { key: "password", label: "Server password", type: "secret", configured: true },
  ],
};

function installOpenCodeApi(api: KhadimDesktopApi): void {
  api.plugins = {
    list: vi.fn(async () => [openCodePlugin]),
    harnesses: vi.fn(async () => openCodePlugin.harnesses),
    chooseAndInstall: vi.fn(async () => null),
    setEnabled: vi.fn(async () => openCodePlugin),
    configure: vi.fn(async () => openCodePlugin),
    uninstall: vi.fn(async () => undefined),
  };
}

function installDesktopApi(): KhadimDesktopApi {
  const settings: AppSettings = {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    models: [{ id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5", isDefault: true, isActive: true, hasApiKey: true }],
    activeProjectId: project.id,
    workspace: project.rootPath,
    harness: "assistant",
    theme: "light",
    hasApiKey: true,
  };
  const api: KhadimDesktopApi = {
    platform: "linux",
    agent: { start: vi.fn(async ({ runId }) => ({ runId })), abort: vi.fn(async () => undefined), recover: vi.fn(async () => []), acknowledge: vi.fn(async () => undefined), onEvent: vi.fn(() => () => undefined) },
    projects: { list: vi.fn(async () => [project]), add: vi.fn(async () => project), open: vi.fn(async () => project), checkAvailability: vi.fn(async () => ({ project, available: true as const })), rename: vi.fn(async (_id, name) => ({ ...project, name })), relocate: vi.fn(async (_id, rootPath) => ({ ...project, rootPath })), remove: vi.fn(async () => ({ removedProjectId: project.id, activeProject: project })), chooseDirectory: vi.fn(async () => null) },
    conversations: { list: vi.fn(async () => []), save: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    artifacts: { list: vi.fn(async () => []), save: vi.fn(async () => undefined), exportPdf: vi.fn(async () => ({ canceled: true })) },
    settings: { get: vi.fn(async () => structuredClone(settings)), save: vi.fn(async () => structuredClone(settings)), chooseWorkspace: vi.fn(async () => null) },
    models: { catalog: vi.fn(async () => [{ id: "anthropic", name: "Anthropic", models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }] }]), syncCodex: vi.fn(async () => structuredClone(settings)) },
    auth: { codexConnected: vi.fn(async () => false), startCodexLogin: vi.fn(async () => ({ authUrl: "https://auth.openai.com/oauth/authorize" })), codexLoginStatus: vi.fn(async () => ({ status: "pending" as const })) },
    search: {
      get: vi.fn(async () => ({ activeProvider: "duckduckgo" as const, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }, { id: "parallel" as const, name: "Parallel", description: "AI-native search", configured: false, credentialStatus: "missing" as const, requiresApiKey: true }] })),
      save: vi.fn(async (update) => ({ activeProvider: update.activeProvider, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }, { id: "parallel" as const, name: "Parallel", description: "AI-native search", configured: Boolean(update.apiKey), credentialStatus: update.apiKey ? "ready" as const : "missing" as const, requiresApiKey: true }] })),
    },
    google: {
      get: vi.fn(async () => ({ configured: true, connected: false, credentialStatus: "missing" as const, scopes: [] })),
      connect: vi.fn(async () => ({ configured: true, connected: true, credentialStatus: "ready" as const, email: "owner@example.com", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] })),
      disconnect: vi.fn(async () => ({ configured: true, connected: false, credentialStatus: "missing" as const, scopes: [] })),
    },
    discord: {
      get: vi.fn(async () => ({ configured: false, connected: false, enabled: false, guildId: "", projectId: project.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      save: vi.fn(async (update) => ({ configured: true, connected: true, botName: "Khadim", ...update })),
      disconnect: vi.fn(async () => ({ configured: true, connected: false, enabled: false, guildId: "", projectId: project.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      onStatus: vi.fn(() => () => undefined),
    },
    skills: {
      discover: vi.fn(async () => [{ id: "briefing", name: "Weekly briefing", description: "Build a concise weekly update", dir: "/tmp/skills/briefing", sourceDir: "/tmp/skills", enabled: false }]),
      toggle: vi.fn(async () => undefined),
    },
    shell: { openExternal: vi.fn(async () => undefined) },
  };
  Object.defineProperty(window, "khadim", { configurable: true, value: api });
  return api;
}

describe("capability truthfulness", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(cleanup);

  it("exposes Linux chrome for the app-local frosted material", () => {
    installDesktopApi();
    render(<App />);

    expect(screen.getByRole("main")).toHaveClass("platform-linux");
  });

  it("keeps unimplemented connectors unavailable while real local skills remain interactive", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Show 5 planned" }));
    const github = await screen.findByRole("button", { name: "GitHub connector unavailable" });
    expect(github).toBeDisabled();
    expect(screen.queryByText("One connected workspace")).not.toBeInTheDocument();

    const enableSkill = await screen.findByRole("button", { name: "Enable Weekly briefing" });
    await user.click(enableSkill);
    expect(api.skills.toggle).toHaveBeenCalledWith("briefing", true);
    expect(await screen.findByRole("button", { name: "Disable Weekly briefing" })).toBeInTheDocument();
  });

  it("connects and disconnects Gmail through the typed Google account API", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Connect Gmail" }));
    expect(api.google.connect).toHaveBeenCalledOnce();
    expect(await screen.findByText("Connected as owner@example.com")).toBeInTheDocument();
    vi.mocked(api.google.get).mockResolvedValue({ configured: true, connected: true, credentialStatus: "ready", email: "owner@example.com", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });

    await user.click(screen.getByRole("button", { name: /^New chat/ }));
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Summarize my unread email");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(api.agent.start).toHaveBeenCalled());
    expect(vi.mocked(api.agent.start).mock.calls.at(-1)?.[0].enabledTools).toContain("apps");

    await user.click(screen.getByRole("button", { name: /Apps New/ }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(api.google.disconnect).toHaveBeenCalledOnce();
  });

  it("accepts a user-owned Google Desktop OAuth client ID when the build has none", async () => {
    const api = installDesktopApi();
    vi.mocked(api.google.get).mockResolvedValue({ configured: false, connected: false, credentialStatus: "missing", scopes: [] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    const clientId = "123456789-example.apps.googleusercontent.com";
    const clientSecret = "GOCSPX-desktop-secret";
    await user.type(await screen.findByLabelText("Google Desktop OAuth client ID"), clientId);
    await user.type(screen.getByLabelText("Google Desktop OAuth client secret"), clientSecret);
    await user.click(screen.getByRole("button", { name: "Connect Gmail" }));

    expect(api.google.connect).toHaveBeenCalledWith({ clientId, clientSecret });
  });

  it("exposes tool permissions as a keyboard-dismissible checked menu", async () => {
    installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    const trigger = await screen.findByRole("button", { name: "Enable tools" });
    await user.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Tool permissions" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: /Web research/ })).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Tool permissions" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows enabled plugin harnesses and their declared permissions", async () => {
    const api = installDesktopApi();
    installOpenCodeApi(api);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Enable tools" }));
    expect(await screen.findByRole("menuitemradio", { name: /OpenCode/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    const pluginName = await screen.findByText("OpenCode");
    const pluginRow = pluginName.closest("article");
    expect(pluginRow).not.toBeNull();
    await user.click(within(pluginRow as HTMLElement).getByRole("button", { name: "Configure OpenCode" }));
    expect(screen.getByText("Network access: HTTP or HTTPS to 127.0.0.1, localhost.")).toBeInTheDocument();
    expect(screen.getByLabelText("Server password")).toHaveAttribute("placeholder", "Saved · enter to replace");
  });

  it("selects a plugin harness and saves it in the run snapshot before launch", async () => {
    const api = installDesktopApi();
    installOpenCodeApi(api);
    const initialSettings = await api.settings.get();
    vi.mocked(api.settings.save).mockImplementation(async (update) => ({
      ...initialSettings,
      ...update,
      harness: update.harness,
      models: update.models.map((model) => ({ ...model, hasApiKey: true })),
      hasApiKey: true,
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Enable tools" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /OpenCode/ }));
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Run this through the plugin{Enter}");

    await vi.waitFor(() => expect(api.agent.start).toHaveBeenCalledOnce());
    expect(api.conversations.save).toHaveBeenCalledWith(expect.objectContaining({
      runs: [expect.objectContaining({ harness: "plugin:khadim.opencode/opencode" })],
    }));
  });

  it("lets users clear an external plugin endpoint to restore managed startup", async () => {
    const api = installDesktopApi();
    installOpenCodeApi(api);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Configure OpenCode" }));
    await user.clear(screen.getByLabelText("Server URL"));
    await user.click(screen.getByRole("button", { name: "Save plugin" }));

    expect(api.plugins?.configure).toHaveBeenCalledWith("khadim.opencode", {
      values: { binaryPath: "opencode" },
      clear: ["baseUrl"],
    });
  });

  it("connects and selects an AI web search provider", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Configure" }));
    await user.click(await screen.findByRole("button", { name: "Connect Parallel" }));
    await user.type(screen.getByLabelText("Parallel API key"), "parallel-secret");
    await user.click(screen.getByRole("button", { name: "Save and use" }));

    expect(api.search.save).toHaveBeenCalledWith({ activeProvider: "parallel", provider: "parallel", apiKey: "parallel-secret" });
    expect(await screen.findByRole("button", { name: "Parallel is active" })).toBeInTheDocument();
  });

  it("truthfully exposes an active search credential that needs reconnection", async () => {
    const api = installDesktopApi();
    vi.mocked(api.search.get).mockResolvedValue({
      activeProvider: "parallel",
      providers: [
        { id: "duckduckgo", name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required", requiresApiKey: false },
        { id: "parallel", name: "Parallel", description: "AI-native search", configured: false, credentialStatus: "locked", requiresApiKey: true },
      ],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    expect(await screen.findByText("Parallel needs its API key re-entered; runs use DuckDuckGo meanwhile")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Configure" }));
    await user.click(screen.getByRole("button", { name: "Reconnect Parallel" }));

    expect(screen.getByLabelText("Parallel API key")).toBeInTheDocument();
    expect(api.search.save).not.toHaveBeenCalled();
  });

  it("filters the overview with the horizontal capability categories", async () => {
    installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    const categories = screen.getByRole("navigation", { name: "Capability categories" });
    expect(within(categories).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(categories).getByRole("button", { name: "Included" }));
    expect(screen.getByText("Included with Khadim")).toBeInTheDocument();
    expect(screen.queryByText("Discord")).not.toBeInTheDocument();

    await user.click(within(categories).getByRole("button", { name: "Apps" }));
    expect(await screen.findByText("Discord")).toBeInTheDocument();
    expect(screen.queryByText("Included with Khadim")).not.toBeInTheDocument();
  });

  it("configures Discord as an available messaging connector", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Connect Discord" }));
    expect(screen.getByText("When off, one mention starts the conversation for that thread.")).toBeInTheDocument();
    expect(screen.queryByText(/Hermes/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Bot token"), "a-valid-looking-discord-bot-token-value");
    await user.type(screen.getByLabelText("Server ID"), "123456789012345678");
    await user.type(screen.getByLabelText("Allowed user IDs"), "234567890123456789");
    await user.click(screen.getByRole("button", { name: "Connect bot" }));

    expect(api.discord.save).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      guildId: "123456789012345678",
      projectId: project.id,
      harness: "assistant",
    }));
    expect(await screen.findByText("Ready for authorized messages as Khadim")).toBeInTheDocument();
  });

  it("uses an enabled OpenCode plugin as the Discord agent runtime", async () => {
    const api = installDesktopApi();
    installOpenCodeApi(api);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Connect Discord" }));
    await user.click(await screen.findByRole("radio", { name: /OpenCode/ }));
    await user.type(screen.getByLabelText("Bot token"), "a-valid-looking-discord-bot-token-value");
    await user.type(screen.getByLabelText("Server ID"), "123456789012345678");
    await user.type(screen.getByLabelText("Allowed user IDs"), "234567890123456789");
    await user.click(screen.getByRole("button", { name: "Connect bot" }));

    expect(api.discord.save).toHaveBeenCalledWith(expect.objectContaining({
      harness: "plugin:khadim.opencode/opencode",
    }));
  });

  it("opens the authenticated bot invite when the bot has not joined the server", async () => {
    const api = installDesktopApi();
    vi.mocked(api.discord.save).mockResolvedValue({
      configured: true,
      connected: false,
      enabled: true,
      guildId: "123456789012345678",
      projectId: project.id,
      harness: "assistant",
      allowAllGuildUsers: false,
      allowedUserIds: ["234567890123456789"],
      allowedRoleIds: [],
      allowedChannelIds: [],
      ignoredChannelIds: [],
      freeResponseChannelIds: [],
      noThreadChannelIds: [],
      requireMention: true,
      threadRequireMention: false,
      autoThread: true,
      botName: "Khadim",
      inviteUrl: "https://discord.com/oauth2/authorize?client_id=123456789012345678",
      lastError: "Invite the bot to the configured server.",
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Apps/ }));
    await user.click(await screen.findByRole("button", { name: "Connect Discord" }));
    await user.type(screen.getByLabelText("Bot token"), "a-valid-looking-discord-bot-token-value");
    await user.type(screen.getByLabelText("Server ID"), "123456789012345678");
    await user.type(screen.getByLabelText("Allowed user IDs"), "234567890123456789");
    await user.click(screen.getByRole("button", { name: "Connect bot" }));
    await user.click(await screen.findByRole("button", { name: "Invite Discord bot" }));

    expect(api.shell.openExternal).toHaveBeenCalledWith("https://discord.com/oauth2/authorize?client_id=123456789012345678");
  });
});
