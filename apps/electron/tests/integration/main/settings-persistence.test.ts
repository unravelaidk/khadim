import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeModelUpdates, normalizeSettingsUpdate, normalizeStoredSettings, SettingsPersistence } from "../../../src/main/settings-persistence";

const fallbackSettings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  workspace: "/home/user/Documents",
  harness: "assistant" as const,
  theme: "dark" as const,
};

describe("settings persistence", () => {
  it("normalizes model fields while preserving one stable active and default identity", () => {
    const models = normalizeModelUpdates([
      {
        id: " model-one ",
        name: " Work model ",
        provider: " openai ",
        model: " gpt-5 ",
        baseUrl: " https://models.example.test/v1 ",
        temperature: " 0.4 ",
        isActive: true,
        isDefault: false,
      },
      {
        id: "model-two",
        name: "Fallback",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        isActive: true,
        isDefault: false,
      },
    ]);

    expect(models).toEqual([
      expect.objectContaining({
        id: "model-one",
        name: "Work model",
        provider: "openai",
        model: "gpt-5",
        baseUrl: "https://models.example.test/v1",
        temperature: "0.4",
        isActive: true,
        isDefault: true,
      }),
      expect.objectContaining({
        id: "model-two",
        isActive: false,
        isDefault: false,
        temperature: "0.2",
      }),
    ]);
  });

  it("uses the default model as the active fallback when no model is marked active", () => {
    const models = normalizeModelUpdates([
      { id: "one", name: "One", provider: "openai", model: "gpt-5", isActive: false, isDefault: false },
      { id: "two", name: "Two", provider: "anthropic", model: "claude", isActive: false, isDefault: true },
    ]);
    expect(models.map(({ id, isActive, isDefault }) => ({ id, isActive, isDefault }))).toEqual([
      { id: "one", isActive: false, isDefault: false },
      { id: "two", isActive: true, isDefault: true },
    ]);
  });

  it("rejects duplicate stable model identities after trimming", () => {
    expect(() => normalizeModelUpdates([
      { id: "same", name: "One", provider: "openai", model: "gpt-5", isActive: true, isDefault: true },
      { id: " same ", name: "Two", provider: "anthropic", model: "claude", isActive: false, isDefault: false },
    ])).toThrow("Model ID “same” is already configured.");
    expect(() => normalizeModelUpdates([
      { id: "model one", name: "One", provider: "openai", model: "gpt-5", isActive: true, isDefault: true },
    ])).toThrow("Model ID must be a stable identifier without spaces.");
  });

  it("migrates legacy provider settings into one usable model", () => {
    const settings = normalizeStoredSettings({
      provider: " openai ",
      model: " gpt-4.1 ",
      workspace: "/home/user/project",
      harness: "assistant",
      theme: "dark",
      encryptedApiKey: "encrypted-legacy-key",
    }, {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      workspace: "/home/user/Documents",
      harness: "assistant",
      theme: "dark",
    });

    expect(settings).toEqual(expect.objectContaining({
      provider: "openai",
      model: "gpt-4.1",
      models: [{
        id: "default-model",
        name: "Gpt 4.1",
        provider: "openai",
        model: "gpt-4.1",
        temperature: "0.2",
        isDefault: true,
        isActive: true,
        encryptedApiKey: "encrypted-legacy-key",
      }],
    }));
  });

  it("rejects blank model identity and provider fields", () => {
    const base = { id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true };
    expect(() => normalizeModelUpdates([{ ...base, id: " " }])).toThrow("Model ID is required.");
    expect(() => normalizeModelUpdates([{ ...base, name: " " }])).toThrow("Model name is required.");
    expect(() => normalizeModelUpdates([{ ...base, provider: " " }])).toThrow("Model provider is required.");
    expect(() => normalizeModelUpdates([{ ...base, model: " " }])).toThrow("Provider model ID is required.");
  });

  it("rejects non-finite or out-of-range model temperatures", () => {
    const model = { id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true };
    for (const temperature of ["NaN", "Infinity", "-0.1", "2.1"]) {
      expect(() => normalizeModelUpdates([{ ...model, temperature }])).toThrow("Temperature must be a number from 0 to 2.");
    }
  });

  it("accepts only valid HTTP or HTTPS model endpoints", () => {
    const model = { id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true };
    for (const baseUrl of [
      "localhost:11434",
      "file:///tmp/model",
      "not a url",
      "http://models.example.test/v1",
      "https://models.example.test/v1?key=secret",
      "https://models.example.test/v1#responses",
      "https://api-key@models.example.test/v1",
    ]) {
      expect(() => normalizeModelUpdates([{ ...model, baseUrl }])).toThrow("Base URL must be HTTPS");
    }
    expect(normalizeModelUpdates([{ ...model, baseUrl: "http://localhost:11434/v1" }])[0].baseUrl)
      .toBe("http://localhost:11434/v1");
    expect(normalizeModelUpdates([{ ...model, baseUrl: "http://[::1]:11434/v1" }])[0].baseUrl)
      .toBe("http://[::1]:11434/v1");
  });

  it("serializes settings mutations so concurrent changes do not overwrite each other", async () => {
    const directory = await mkdtemp(join(tmpdir(), "khadim-settings-"));
    try {
      const store = new SettingsPersistence(join(directory, "settings.json"), fallbackSettings);
      let releaseFirst!: () => void;
      let markStarted!: () => void;
      const firstStarted = new Promise<void>((resolve) => { markStarted = resolve; });
      const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });

      const first = store.mutate(async (current) => {
        markStarted();
        await firstMayFinish;
        return { ...current, workspace: "/home/user/first" };
      });
      await firstStarted;
      const second = store.mutate((current) => ({ ...current, theme: "light" }));
      releaseFirst();
      await Promise.all([first, second]);

      await expect(store.read()).resolves.toEqual(expect.objectContaining({
        workspace: "/home/user/first",
        theme: "light",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restricts the persisted settings file to the current OS user", async () => {
    const directory = await mkdtemp(join(tmpdir(), "khadim-settings-permissions-"));
    const path = join(directory, "settings.json");
    try {
      const store = new SettingsPersistence(path, fallbackSettings);
      await store.mutate((current) => ({ ...current, theme: "light" }));
      if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("hardens permissions on an existing settings file when it is loaded", async () => {
    if (process.platform === "win32") return;
    const directory = await mkdtemp(join(tmpdir(), "khadim-settings-existing-permissions-"));
    const path = join(directory, "settings.json");
    try {
      await writeFile(path, JSON.stringify(fallbackSettings), { mode: 0o644 });
      const store = new SettingsPersistence(path, fallbackSettings);
      await store.read();
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("takes a credential snapshot between earlier and later queued mutations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "khadim-settings-snapshot-"));
    try {
      const store = new SettingsPersistence(join(directory, "settings.json"), fallbackSettings);
      let releaseFirst!: () => void;
      const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const first = store.mutate(async (current) => {
        await firstMayFinish;
        return { ...current, workspace: "/home/user/first" };
      });
      const snapshot = store.snapshot();
      const second = store.mutate((current) => ({ ...current, workspace: "/home/user/second" }));

      releaseFirst();
      await expect(snapshot).resolves.toEqual(expect.objectContaining({ workspace: "/home/user/first" }));
      await Promise.all([first, second]);
      await expect(store.snapshot()).resolves.toEqual(expect.objectContaining({ workspace: "/home/user/second" }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects invalid capability and theme values at the IPC boundary", () => {
    const update = {
      ...fallbackSettings,
      activeProjectId: "project-one",
      models: [{ id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true }],
    };
    expect(() => normalizeSettingsUpdate({ ...update, harness: "admin" as "assistant" })).toThrow("Invalid default capability.");
    expect(() => normalizeSettingsUpdate({ ...update, theme: "neon" as "dark" })).toThrow("Invalid theme.");
  });

  it("accepts validated custom theme tokens and allows selecting the theme", () => {
    const customTheme = {
      id: "custom:quiet-night" as const,
      name: "Quiet Night",
      appearance: "dark" as const,
      palette: { background: "#111111", surface: "#181818", elevated: "#242424", text: "#f2f2f2", muted: "#a0a0a0", accent: "#a277ff" },
    };
    const result = normalizeSettingsUpdate({
      ...fallbackSettings,
      theme: customTheme.id,
      customThemes: [customTheme],
      activeProjectId: "project-one",
      models: [{ id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true }],
    });
    expect(result.theme).toBe(customTheme.id);
    expect(result.customThemes).toEqual([customTheme]);
  });

  it("rejects arbitrary CSS in custom theme color tokens", () => {
    const theme = {
      id: "custom:unsafe" as const,
      name: "Unsafe",
      appearance: "dark" as const,
      palette: { background: "#111111; background:url(file:///secret)", surface: "#181818", elevated: "#242424", text: "#f2f2f2", muted: "#a0a0a0", accent: "#a277ff" },
    };
    expect(() => normalizeSettingsUpdate({
      ...fallbackSettings,
      theme: theme.id,
      customThemes: [theme],
      activeProjectId: "project-one",
      models: [{ id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true }],
    })).toThrow("must be a six-digit hex color");
  });

  it("bounds model metadata, endpoints, and credentials before persistence", () => {
    const model = { id: "model-one", name: "Work", provider: "openai", model: "gpt-5", isActive: true, isDefault: true };
    expect(() => normalizeModelUpdates(Array.from({ length: 101 }, (_, index) => ({ ...model, id: `model-${index}` })))).toThrow("Configure no more than 100 models.");
    expect(() => normalizeModelUpdates([{ ...model, id: "x".repeat(129) }])).toThrow("Model ID is too long.");
    expect(() => normalizeModelUpdates([{ ...model, name: "x".repeat(161) }])).toThrow("Model name is too long.");
    expect(() => normalizeModelUpdates([{ ...model, provider: "x".repeat(81) }])).toThrow("Model provider is too long.");
    expect(() => normalizeModelUpdates([{ ...model, model: "x".repeat(513) }])).toThrow("Provider model ID is too long.");
    expect(() => normalizeModelUpdates([{ ...model, baseUrl: `https://example.test/${"x".repeat(2_100)}` }])).toThrow("Base URL is too long.");
    expect(() => normalizeModelUpdates([{ ...model, apiKey: "x".repeat(16_385) }])).toThrow("API key is too long.");
  });

  it("keeps accepting settings mutations after an earlier mutation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "khadim-settings-recovery-"));
    try {
      const store = new SettingsPersistence(join(directory, "settings.json"), fallbackSettings);
      await expect(store.mutate(() => { throw new Error("rejected change"); })).rejects.toThrow("rejected change");
      await store.mutate((current) => ({ ...current, theme: "light" }));
      await expect(store.read()).resolves.toEqual(expect.objectContaining({ theme: "light" }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
