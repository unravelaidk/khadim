import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPluginPackage, parsePluginManifest } from "../../../src/main/plugins/manifest";

const validManifest = {
  apiVersion: 1,
  id: "example.harness",
  name: "Example harness",
  version: "1.2.3",
  description: "Example WebAssembly harness.",
  main: "dist/plugin.wasm",
  capabilities: ["harness"],
  permissions: { network: { allowedHosts: ["127.0.0.1"], allowHttp: true } },
  config: [{ key: "token", label: "Token", type: "secret" }],
};

describe("plugin manifests", () => {
  it("parses a versioned package and explicit permissions", () => {
    expect(parsePluginManifest(validManifest)).toMatchObject({
      id: "example.harness",
      apiVersion: 1,
      capabilities: ["harness"],
      permissions: { network: { allowedHosts: ["127.0.0.1"], allowHttp: true } },
    });
  });

  it("rejects traversal, secret defaults, and unsupported API versions", () => {
    expect(() => parsePluginManifest({ ...validManifest, main: "../plugin.wasm" })).toThrow("inside the plugin directory");
    expect(() => parsePluginManifest({ ...validManifest, config: [{ key: "token", label: "Token", type: "secret", default: "leak" }] })).toThrow("secret default");
    expect(() => parsePluginManifest({ ...validManifest, apiVersion: 2 })).toThrow("Unsupported plugin API version");
  });

  it("rejects a symlinked WebAssembly module outside the package", async () => {
    const root = await mkdtemp(join(tmpdir(), "khadim-plugin-manifest-"));
    const packageDir = join(root, "package");
    await mkdir(join(packageDir, "dist"), { recursive: true });
    await writeFile(join(root, "outside.wasm"), new Uint8Array([0, 97, 115, 109]));
    await writeFile(join(packageDir, "khadim.plugin.json"), JSON.stringify(validManifest));
    const { symlink } = await import("node:fs/promises");
    await symlink(join(root, "outside.wasm"), join(packageDir, "dist/plugin.wasm"));

    await expect(loadPluginPackage(packageDir)).rejects.toThrow("stay inside");
  });
});
