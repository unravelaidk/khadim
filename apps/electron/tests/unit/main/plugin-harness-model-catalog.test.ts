import { describe, expect, it, vi } from "vitest";
import {
  claudeCodeModelsForVersion,
  flattenOpenCodeProviderList,
  normalizeClaudeCommands,
  parseOpenCodeAgentsCliOutput,
  parseOpenCodeModelsCliOutput,
  PluginHarnessModelCatalog,
} from "../../../src/main/plugins/harness-model-catalog";
import type { PluginManager } from "../../../src/main/plugins/plugin-manager";

describe("plugin harness model catalogs", () => {
  it("normalizes Claude runtime commands and aliases for the composer", () => {
    expect(normalizeClaudeCommands([
      { name: "/review", description: " Review this project ", argumentHint: "[focus]", aliases: ["/audit"] },
      { name: "review", description: "Duplicate" },
      { name: "  " },
    ])).toEqual([{
      name: "review",
      description: "Review this project",
      argumentHint: "[focus]",
      aliases: ["audit"],
    }]);
  });

  it("version-gates Claude Code's curated model list", () => {
    expect(claudeCodeModelsForVersion("2.1.110").map((model) => model.model)).not.toContain("claude-opus-4-7");
    expect(claudeCodeModelsForVersion("2.1.111").map((model) => model.model)).toContain("claude-opus-4-7");
    expect(claudeCodeModelsForVersion("2.1.154").map((model) => model.model)).toContain("claude-opus-4-8");
    expect(claudeCodeModelsForVersion("2.1.169").map((model) => model.model)).toContain("claude-fable-5");
  });

  it("parses OpenCode's verbose CLI inventory into provider-qualified models", () => {
    const models = parseOpenCodeModelsCliOutput([
      "anthropic/claude-sonnet-4-6",
      JSON.stringify({ id: "claude-sonnet-4-6", providerID: "anthropic", name: "Claude Sonnet 4.6" }),
      "openai/gpt-5.4",
      JSON.stringify({ id: "gpt-5.4", providerID: "openai", name: "GPT-5.4" }),
    ].join("\n"));

    expect(models).toEqual([
      expect.objectContaining({ id: "anthropic/claude-sonnet-4-6", provider: "anthropic", model: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }),
      expect.objectContaining({ id: "openai/gpt-5.4", provider: "openai", model: "gpt-5.4", name: "GPT-5.4" }),
    ]);
  });

  it("discovers only OpenCode primary agents as selectable modes", () => {
    expect(parseOpenCodeAgentsCliOutput([
      "build (primary)",
      "  [{\"permission\":\"*\",\"action\":\"allow\"}]",
      "plan (primary)",
      "  [{\"permission\":\"edit\",\"action\":\"ask\"}]",
      "release-review (primary)",
      "  []",
      "explore (subagent)",
      "  []",
    ].join("\n"))).toEqual([
      { id: "build", name: "Build", isDefault: true },
      { id: "plan", name: "Plan", isDefault: false },
      { id: "release-review", name: "Release Review", isDefault: false },
    ]);
  });

  it("keeps only models from providers connected to an OpenCode server", () => {
    const models = flattenOpenCodeProviderList({
      connected: ["openai"],
      all: [
        { id: "openai", name: "OpenAI", models: { "gpt-5.4": { id: "gpt-5.4", name: "GPT-5.4" } } },
        { id: "anthropic", name: "Anthropic", models: { "claude-sonnet-4-6": { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" } } },
      ],
    });

    expect(models).toEqual([
      expect.objectContaining({ id: "openai/gpt-5.4", provider: "openai", model: "gpt-5.4", detail: "OpenAI" }),
    ]);
  });

  it("probes Claude's CLI version and OpenCode's own inventory per harness", async () => {
    const plugins = {
      harnesses: vi.fn(async () => [
        { id: "plugin:khadim.claude-code/claude-code", pluginId: "khadim.claude-code", capabilityId: "claude-code", name: "Claude Code" },
        { id: "plugin:khadim.opencode/opencode", pluginId: "khadim.opencode", capabilityId: "opencode", name: "OpenCode" },
      ]),
      configuration: vi.fn(async (pluginId: string) => ({ binaryPath: pluginId === "khadim.opencode" ? "opencode" : "claude" })),
    } as unknown as PluginManager;
    const runCommand = vi.fn(async (_command: string, args: ReadonlyArray<string>) => {
      if (args[0] === "--version") return { stdout: "2.1.169 (Claude Code)", stderr: "" };
      if (args[0] === "agent") return { stdout: "build (primary)\n  []\nplan (primary)\n  []", stderr: "" };
      return {
          stdout: ["openai/gpt-5.4", JSON.stringify({ id: "gpt-5.4", providerID: "openai", name: "GPT-5.4" })].join("\n"),
          stderr: "",
        };
    });
    const catalog = new PluginHarnessModelCatalog(plugins, {
      runCommand,
      resolveClaudeLaunch: () => ({ command: "/bin/claude", prefixArgs: [] }),
      resolveOpenCodeBinary: () => "/bin/opencode",
    });

    const claude = await catalog.models("plugin:khadim.claude-code/claude-code", "/tmp/project");
    const claudeModes = await catalog.modes("plugin:khadim.claude-code/claude-code", "/tmp/project");
    const openCode = await catalog.models("plugin:khadim.opencode/opencode", "/tmp/project");
    const openCodeModes = await catalog.modes("plugin:khadim.opencode/opencode", "/tmp/project");

    expect(claude[0]).toMatchObject({ id: "claude-fable-5", provider: "anthropic" });
    expect(claudeModes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "acceptEdits", isDefault: true }),
      expect.objectContaining({ id: "plan" }),
      expect.objectContaining({ id: "dontAsk" }),
    ]));
    expect(openCode).toEqual([expect.objectContaining({ id: "openai/gpt-5.4", provider: "openai" })]);
    expect(openCodeModes.map((mode) => mode.id)).toEqual(["build", "plan"]);
    expect(runCommand).toHaveBeenNthCalledWith(1, "/bin/claude", ["--version"], expect.any(Object));
    expect(runCommand).toHaveBeenNthCalledWith(2, "/bin/opencode", ["models", "--verbose"], expect.any(Object));
    expect(runCommand).toHaveBeenNthCalledWith(3, "/bin/opencode", ["agent", "list"], expect.objectContaining({ cwd: "/tmp/project" }));
  });

  it("returns independent Codex, Cursor, and Grok model inventories", async () => {
    const plugins = {
      harnesses: vi.fn(async () => [
        { id: "plugin:khadim.codex/codex", pluginId: "khadim.codex", capabilityId: "codex", name: "Codex" },
        { id: "plugin:khadim.cursor/cursor", pluginId: "khadim.cursor", capabilityId: "cursor", name: "Cursor" },
        { id: "plugin:khadim.grok/grok", pluginId: "khadim.grok", capabilityId: "grok", name: "Grok" },
      ]),
      configuration: vi.fn(async (pluginId: string) => pluginId === "khadim.cursor"
        ? { customModels: "auto,cursor-fast" }
        : pluginId === "khadim.grok"
          ? { customModels: "grok-build,grok-code-fast" }
          : {}),
    } as unknown as PluginManager;
    const codexCatalogClient = {
      discover: vi.fn(async () => ({
        models: [{ id: "gpt-5.6-sol", name: "GPT-5.6-Sol", provider: "openai", model: "gpt-5.6-sol", isDefault: true }],
        modes: [{ id: "plan", name: "Plan", isDefault: false }, { id: "default", name: "Default", isDefault: true }],
      })),
    };
    const catalog = new PluginHarnessModelCatalog(plugins, { codexCatalogClient });

    const codex = await catalog.models("plugin:khadim.codex/codex", "/tmp/project");
    const codexModes = await catalog.modes("plugin:khadim.codex/codex", "/tmp/project");
    const cursor = await catalog.models("plugin:khadim.cursor/cursor", "/tmp/project");
    const cursorModes = await catalog.modes("plugin:khadim.cursor/cursor", "/tmp/project");
    const grok = await catalog.models("plugin:khadim.grok/grok", "/tmp/project");

    expect(codex[0]).toMatchObject({ id: "gpt-5.6-sol", provider: "openai", isDefault: true });
    expect(codexModes.map((mode) => mode.id)).toEqual(["plan", "default"]);
    expect(cursor.map((model) => model.id)).toEqual(["auto", "cursor-fast"]);
    expect(cursorModes.map((mode) => mode.id)).toEqual(["ask", "architect", "code"]);
    expect(grok.map((model) => model.id)).toEqual(["grok-build", "grok-code-fast"]);
    expect(codexCatalogClient.discover).toHaveBeenCalledTimes(1);
  });
});
