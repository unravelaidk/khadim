import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, KhadimDesktopApi, Project } from "../../../src/shared/types";
import App from "../../../src/renderer/src/App";

const project: Project = {
  id: "project-a",
  name: "Quarterly planning",
  rootPath: "/tmp/quarterly-planning",
  createdAt: "2026-07-13T08:00:00.000Z",
  updatedAt: "2026-07-13T08:00:00.000Z",
  lastOpenedAt: "2026-07-13T08:00:00.000Z",
};

const newCustomThemePaletteForTest = { background: "#15141b", surface: "#21202e", elevated: "#2d2b3a", text: "#edecee", muted: "#a394b8", accent: "#a277ff" };

function installDesktopApi(): KhadimDesktopApi {
  const settings: AppSettings = {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    models: [{
      id: "model-1",
      name: "Claude Sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      isDefault: true,
      isActive: true,
      hasApiKey: true,
    }, {
      id: "model-2",
      name: "GPT-5",
      provider: "openai",
      model: "gpt-5",
      isDefault: false,
      isActive: false,
      hasApiKey: true,
    }],
    activeProjectId: project.id,
    workspace: project.rootPath,
    harness: "assistant",
    theme: "light",
    hasApiKey: true,
  };
  const api: KhadimDesktopApi = {
    agent: {
      start: vi.fn(async (request) => ({ runId: request.runId })),
      abort: vi.fn(async () => undefined),
      answerQuestion: vi.fn(async () => undefined),
      answerApproval: vi.fn(async () => undefined),
      recover: vi.fn(async () => []),
      acknowledge: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined),
    },
    projects: {
      list: vi.fn(async () => [project]),
      add: vi.fn(async () => project),
      open: vi.fn(async () => project),
      checkAvailability: vi.fn(async () => ({ project, available: true as const })),
      rename: vi.fn(async (_id, name) => ({ ...project, name })),
      relocate: vi.fn(async (_id, rootPath) => ({ ...project, rootPath })),
      remove: vi.fn(async () => ({ removedProjectId: project.id, activeProject: project })),
      chooseDirectory: vi.fn(async () => null),
    },
    conversations: {
      list: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    artifacts: {
      list: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      exportPdf: vi.fn(async () => ({ canceled: true })),
    },
    settings: {
      get: vi.fn(async () => structuredClone(settings)),
      save: vi.fn(async () => structuredClone(settings)),
      chooseWorkspace: vi.fn(async () => null),
    },
    models: { catalog: vi.fn(async () => [
      { id: "anthropic", name: "Anthropic", models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }] },
      { id: "openai", name: "OpenAI", models: [{ id: "gpt-5", name: "GPT-5" }, { id: "gpt-5-mini", name: "GPT-5 mini" }] },
      { id: "openai-codex", name: "OpenAI Codex", apiKeyRequired: true, models: [{ id: "gpt-5.5", name: "GPT-5.5" }] },
      { id: "ollama", name: "Ollama (Local)", baseUrl: "http://localhost:11434/v1", apiKeyRequired: false, available: false, models: [] },
      { id: "ollama-cloud", name: "Ollama Cloud", baseUrl: "https://ollama.com/v1", apiKeyRequired: true, available: true, models: [{ id: "gpt-oss:120b", name: "GPT OSS 120B" }] },
    ]), syncCodex: vi.fn(async () => structuredClone(settings)) },
    auth: {
      codexConnected: vi.fn(async () => false),
      startCodexLogin: vi.fn(async () => ({ authUrl: "https://auth.openai.com/oauth/authorize" })),
      codexLoginStatus: vi.fn(async () => ({ status: "pending" as const })),
    },
    search: {
      get: vi.fn(async () => ({ activeProvider: "duckduckgo" as const, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }] })),
      save: vi.fn(async (update) => ({ activeProvider: update.activeProvider, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }] })),
    },
    google: {
      get: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
      connect: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
      disconnect: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
    },
    discord: {
      get: vi.fn(async () => ({ configured: false, connected: false, enabled: false, guildId: "", projectId: project.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      save: vi.fn(async (update) => ({ configured: true, connected: true, ...update })),
      disconnect: vi.fn(async () => ({ configured: true, connected: false, enabled: false, guildId: "", projectId: project.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      onStatus: vi.fn(() => () => undefined),
    },
    skills: {
      discover: vi.fn(async () => []),
      toggle: vi.fn(async () => undefined),
    },
    shell: { openExternal: vi.fn(async () => undefined) },
  };
  Object.defineProperty(window, "khadim", { configurable: true, value: api });
  return api;
}

describe("dialog keyboard accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    installDesktopApi();
  });

  afterEach(cleanup);

  it("moves focus into Settings, closes with Escape, and restores the Settings trigger", async () => {
    const user = userEvent.setup();
    render(<App />);

    const settingsTriggers = await screen.findAllByRole("button", { name: "Settings" });
    const trigger = settingsTriggers[0];
    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close settings" })).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps forward and backward Tab navigation inside Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = (await screen.findAllByRole("button", { name: "Settings" }))[0];
    await user.click(trigger);
    const closeButton = await screen.findByRole("button", { name: "Close settings" });

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("provides the same focus lifecycle for the Account dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = await screen.findByRole("button", { name: /Account/ });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Account" });
    const closeButton = screen.getByRole("button", { name: "Close account" });
    expect(dialog).toBeInTheDocument();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Plan" })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Account" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps background controls out of the accessibility tree while a dialog is open", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("button", { name: "Khadim home" })).toBeInTheDocument();
    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Khadim home" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "Khadim home" })).toBeInTheDocument();
  });

  it("protects unsaved settings from accidental dismissal", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("radio", { name: /Dark/ }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Discard unsaved settings?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("group", { name: "Discard unsaved settings?" })).not.toBeInTheDocument();
  });

  it("offers built-in palettes and safely creates a custom theme", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    expect(await screen.findByRole("radio", { name: /Aura/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Mocha/ })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Aura/ }));
    expect(document.documentElement.style.getPropertyValue("--blue")).toBe("#a277ff");

    await user.click(screen.getByRole("button", { name: "New theme" }));
    await user.type(screen.getByLabelText("Theme name"), "Midnight Plum");
    await user.click(screen.getByRole("button", { name: "Add theme" }));
    expect(screen.getByRole("radio", { name: /Midnight Plum/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const update = vi.mocked(api.settings.save).mock.calls[0][0];
    expect(update.theme).toMatch(/^custom:midnight-plum-/);
    expect(update.customThemes?.[0]).toMatchObject({ name: "Midnight Plum", appearance: "dark", palette: newCustomThemePaletteForTest });
  });

  it("asks before removing a saved model", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(await screen.findByRole("button", { name: "Delete Claude Sonnet" }));

    expect(screen.getByRole("group", { name: "Delete Claude Sonnet?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep model" }));
    expect(screen.queryByRole("group", { name: "Delete Claude Sonnet?" })).not.toBeInTheDocument();
  });

  it("keeps saved API keys by default and clears them only after confirmation", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Edit Claude Sonnet" }));

    expect(screen.getByText("API key saved securely")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("API key will be removed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update model" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(api.settings.save).toHaveBeenCalledOnce();
    const update = vi.mocked(api.settings.save).mock.calls[0][0];
    expect(update.models.find((model) => model.id === "model-1")).toMatchObject({ clearApiKey: true });
  });

  it("opens an anchored searchable default-model selector without dismissing Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    const trigger = screen.getByRole("button", { name: /Claude Sonnet.*Default/ });
    await user.click(trigger);

    expect(screen.getByRole("listbox", { name: "Choose default model" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search saved models" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Choose default model" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(screen.getByRole("listbox", { name: "Choose default model" })).getByRole("option", { name: /GPT-5/ }));
    expect(screen.getByRole("button", { name: /GPT-5.*Default/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add models" }));
    expect(screen.getByRole("heading", { name: "Add models" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /GPT-5.*Default/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add models" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Models" }));
    expect(screen.getByRole("button", { name: /GPT-5.*Default/ })).toBeInTheDocument();
  });

  it("validates per-model temperature before adding it to Settings", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    await user.click(within(await screen.findByRole("listbox", { name: "Model" })).getByRole("option", { name: /Custom model/ }));
    await user.type(screen.getByLabelText("Model ID"), "gpt-5");
    await user.click(screen.getByText("Advanced settings"));
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Work model");
    await user.clear(screen.getByLabelText("Temperature"));
    await user.type(screen.getByLabelText("Temperature"), "3");
    await user.click(screen.getByRole("button", { name: "Add Work model" }));

    expect(screen.getByText("Temperature must be a number from 0 to 2.")).toBeInTheDocument();
    expect(api.settings.save).not.toHaveBeenCalled();
  });

  it("selects models from the catalog returned by Khadim CLI", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    const providerList = await screen.findByRole("listbox", { name: "Provider" });
    const providerSearch = screen.getByRole("searchbox", { name: "Search providers" });
    await user.type(providerSearch, "codex");
    expect(within(providerList).getByRole("option", { name: /^OpenAI Codex/ })).toBeInTheDocument();
    expect(within(providerList).queryByRole("option", { name: "OpenAI Provider connection" })).not.toBeInTheDocument();
    await user.clear(providerSearch);
    await user.click(within(providerList).getByRole("option", { name: "OpenAI Provider connection" }));

    const modelList = screen.getByRole("listbox", { name: "Model" });
    const modelSearch = screen.getByRole("searchbox", { name: "Search provider models" });
    await user.type(modelSearch, "mini");
    expect(within(modelList).getByRole("option", { name: "GPT-5 mini gpt-5-mini" })).toBeInTheDocument();
    expect(within(modelList).queryByRole("option", { name: "GPT-5 gpt-5" })).not.toBeInTheDocument();
    await user.clear(modelSearch);
    expect(within(modelList).getByRole("option", { name: "GPT-5 gpt-5" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Provider model ID").parentElement).toHaveTextContent("gpt-5");
    expect(api.models.catalog).toHaveBeenCalledOnce();
  });

  it("adds every catalog model when a provider API key is connected", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    await user.click(within(await screen.findByRole("listbox", { name: "Provider" })).getByRole("option", { name: "OpenAI Provider connection" }));
    await user.type(screen.getByLabelText("API key"), "provider-key");

    const importAll = screen.getByRole("option", { name: /All models OpenAI/ });
    expect(importAll).toHaveAttribute("aria-selected", "false");
    await user.click(importAll);
    expect(importAll).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("All 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add all 2 models" }));
    expect(screen.getByText("GPT-5 mini")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const update = vi.mocked(api.settings.save).mock.calls[0][0];
    expect(update.models.find((model) => model.model === "gpt-5")).toMatchObject({ apiKey: "provider-key" });
    expect(update.models.find((model) => model.model === "gpt-5-mini")).toMatchObject({ apiKey: "provider-key" });
  });

  it("adds only the selected model unless catalog import is enabled", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    await user.click(within(await screen.findByRole("listbox", { name: "Provider" })).getByRole("option", { name: "OpenAI Provider connection" }));
    await user.type(screen.getByLabelText("API key"), "selected-model-key");
    expect(screen.getByRole("option", { name: /All models OpenAI/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: "GPT-5 gpt-5" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Add GPT-5" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const update = vi.mocked(api.settings.save).mock.calls[0][0];
    expect(update.models.find((model) => model.model === "gpt-5")).toMatchObject({ apiKey: "selected-model-key" });
    expect(update.models.some((model) => model.model === "gpt-5-mini")).toBe(false);
  });

  it("uses ChatGPT login instead of an API key for OpenAI Codex", async () => {
    const api = installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    await user.click(within(await screen.findByRole("listbox", { name: "Provider" })).getByRole("option", { name: /^OpenAI Codex / }));

    expect(await screen.findByText("Sign in with ChatGPT")).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(api.auth.startCodexLogin).toHaveBeenCalledOnce();
    expect(api.shell.openExternal).toHaveBeenCalledWith("https://auth.openai.com/oauth/authorize");
    expect(await screen.findByText("Waiting for ChatGPT")).toBeInTheDocument();
  });

  it("separates signed-in local Ollama from direct Ollama Cloud", async () => {
    installDesktopApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    const provider = await screen.findByRole("listbox", { name: "Provider" });
    await user.click(within(provider).getByRole("option", { name: /^Ollama \(Local\)/ }));

    expect(screen.getByText("Ollama is not running")).toBeInTheDocument();
    expect(screen.getByText(/use your Ollama CLI sign-in/)).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();

    await user.click(within(provider).getByRole("option", { name: /^Ollama Cloud/ }));
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    await user.click(screen.getByText("Advanced settings"));
    expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe("https://ollama.com/v1");
  });

  it("rejects credentials or query secrets in a custom model endpoint", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Models" }));
    await user.click(screen.getByRole("button", { name: "Add models" }));
    await user.click(within(await screen.findByRole("listbox", { name: "Model" })).getByRole("option", { name: /Custom model/ }));
    await user.type(screen.getByLabelText("Model ID"), "gpt-5");
    await user.click(screen.getByText("Advanced settings"));
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Work model");
    await user.type(screen.getByLabelText("Base URL"), "https://models.example.test/v1?key=secret");
    await user.click(screen.getByRole("button", { name: "Add Work model" }));

    expect(screen.getByText(/must use HTTPS unless it points to localhost or a loopback address/)).toBeInTheDocument();
  });
});
