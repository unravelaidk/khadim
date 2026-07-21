import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CredentialVault } from "../../../src/main/domain/configuration";
import type { DocumentRepository } from "../../../src/main/domain/repositories";
import { PluginManager, type StoredPluginState } from "../../../src/main/plugins/plugin-manager";
import type { WasmPluginRuntime } from "../../../src/main/plugins/wasm-plugin";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

class MemoryDocument implements DocumentRepository<StoredPluginState> {
  value: StoredPluginState = { enabled: {}, config: {}, store: {} };

  async read(): Promise<StoredPluginState> {
    await Promise.resolve();
    return structuredClone(this.value);
  }

  async write(value: StoredPluginState): Promise<void> {
    await Promise.resolve();
    this.value = structuredClone(value);
  }

  async flush(): Promise<void> {}
}

async function managerFixture(): Promise<{ manager: PluginManager; document: MemoryDocument; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "khadim-plugin-manager-"));
  temporaryDirectories.push(root);
  const bundled = join(root, "bundled");
  const users = join(root, "users");
  const packageDirectory = join(bundled, "example");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(packageDirectory, "plugin.wasm"), new Uint8Array([0, 97, 115, 109]));
  await writeFile(join(packageDirectory, "khadim.plugin.json"), JSON.stringify({
    apiVersion: 1,
    id: "example.harness",
    name: "Example",
    version: "1.0.0",
    description: "Example plugin.",
    main: "plugin.wasm",
    defaultEnabled: true,
    capabilities: ["harness"],
    config: [
      { key: "label", label: "Label", type: "string", default: "Default" },
      { key: "token", label: "Token", type: "secret" },
    ],
  }));
  const runtime = {
    inspect: async (modulePath: string) => {
      const installed = modulePath.includes("installed.harness");
      return {
        info: { id: installed ? "installed.harness" : "example.harness", name: installed ? "Installed" : "Example", version: "1.0.0", apiVersion: 1 },
        capabilities: { harnesses: [{ id: "example", name: "Example", description: "Example harness." }] },
      };
    },
  } as unknown as WasmPluginRuntime;
  const credentials: CredentialVault = {
    available: () => true,
    encrypt: (value) => `encrypted:${value}`,
    decrypt: (value) => value.startsWith("encrypted:") ? value.slice("encrypted:".length) : undefined,
  };
  const document = new MemoryDocument();
  const manager = new PluginManager(users, bundled, document, credentials, runtime);
  await manager.discover();
  return { manager, document, root };
}

describe("plugin manager", () => {
  it("encrypts secrets and redacts them from public plugin entries", async () => {
    const { manager, document } = await managerFixture();

    const entry = await manager.configure("example.harness", {
      values: { label: "Configured", token: "secret-value" },
    });

    expect(document.value.config["example.harness"].token).toEqual({ encrypted: "encrypted:secret-value" });
    expect(entry.config.find((field) => field.key === "token")).toMatchObject({ configured: true });
    expect(entry.config.find((field) => field.key === "token")).not.toHaveProperty("value");
    await expect(manager.configuration("example.harness")).resolves.toMatchObject({
      label: "Configured",
      token: "secret-value",
    });
  });

  it("serializes concurrent state updates without losing plugin data", async () => {
    const { manager, document } = await managerFixture();

    await Promise.all(Array.from({ length: 20 }, (_, index) => (
      manager.storeSet("example.harness", `key-${index}`, `value-${index}`)
    )));

    expect(Object.keys(document.value.store["example.harness"])).toHaveLength(20);
    expect(document.value.store["example.harness"]["key-19"]).toBe("value-19");
  });

  it("installs user plugins disabled until they are explicitly enabled", async () => {
    const { manager, document, root } = await managerFixture();
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "plugin.wasm"), new Uint8Array([0, 97, 115, 109]));
    await writeFile(join(source, "khadim.plugin.json"), JSON.stringify({
      apiVersion: 1,
      id: "installed.harness",
      name: "Installed",
      version: "1.0.0",
      description: "Installed plugin.",
      main: "plugin.wasm",
      defaultEnabled: true,
      capabilities: ["harness"],
    }));

    const installed = await manager.install(source);

    expect(installed.enabled).toBe(false);
    expect(installed.bundled).toBe(false);
    expect(document.value.enabled["installed.harness"]).toBe(false);
  });
});
