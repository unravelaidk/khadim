import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CredentialVault } from "../domain/configuration";
import type { DocumentRepository } from "../domain/repositories";
import {
  KHADIM_PLUGIN_MANIFEST,
  type PluginCapabilities,
  type PluginConfigUpdate,
  type PluginEntry,
  type PluginHarnessDescriptor,
  type PluginInfo,
} from "../../shared/plugins";
import { loadPluginPackage, type ResolvedPluginPackage } from "./manifest";
import { WasmPluginRuntime } from "./wasm-plugin";

interface StoredConfigValue {
  value?: string | number | boolean;
  encrypted?: string;
}

export interface StoredPluginState {
  enabled: Record<string, boolean>;
  config: Record<string, Record<string, StoredConfigValue>>;
  store: Record<string, Record<string, string>>;
}

export interface LoadedPlugin {
  entry: PluginEntry;
  package: ResolvedPluginPackage;
}

function emptyState(): StoredPluginState {
  return { enabled: {}, config: {}, store: {} };
}

export function normalizePluginState(value: unknown): StoredPluginState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyState();
  const input = value as Partial<StoredPluginState>;
  return {
    enabled: input.enabled && typeof input.enabled === "object" && !Array.isArray(input.enabled) ? input.enabled : {},
    config: input.config && typeof input.config === "object" && !Array.isArray(input.config) ? input.config : {},
    store: input.store && typeof input.store === "object" && !Array.isArray(input.store) ? input.store : {},
  };
}

function validateCapabilities(manifestId: string, manifestVersion: string, info: PluginInfo, capabilities: PluginCapabilities): PluginHarnessDescriptor[] {
  if (info.id !== manifestId) throw new Error(`WebAssembly plugin id "${info.id}" does not match manifest id "${manifestId}".`);
  if (info.version !== manifestVersion) throw new Error(`WebAssembly plugin version "${info.version}" does not match manifest version "${manifestVersion}".`);
  if (info.apiVersion !== 1) throw new Error(`WebAssembly plugin reports unsupported API version ${info.apiVersion}.`);
  if (capabilities.harnesses !== undefined && !Array.isArray(capabilities.harnesses)) throw new Error("Plugin harness capabilities must be an array.");
  const seen = new Set<string>();
  return (capabilities.harnesses ?? []).map((harness) => {
    if (!harness || typeof harness !== "object") throw new Error("Plugin harness capability must be an object.");
    if (typeof harness.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(harness.id)) throw new Error("Plugin harness capability has an invalid id.");
    if (seen.has(harness.id)) throw new Error(`Plugin harness capability "${harness.id}" is duplicated.`);
    seen.add(harness.id);
    if (typeof harness.name !== "string" || !harness.name.trim()) throw new Error(`Plugin harness capability "${harness.id}" has no name.`);
    if (typeof harness.description !== "string" || !harness.description.trim()) throw new Error(`Plugin harness capability "${harness.id}" has no description.`);
    return {
      id: `plugin:${manifestId}/${harness.id}`,
      pluginId: manifestId,
      capabilityId: harness.id,
      name: harness.name.trim(),
      description: harness.description.trim(),
      ...(typeof harness.icon === "string" && harness.icon ? { icon: harness.icon } : {}),
    } as PluginHarnessDescriptor;
  });
}

export class PluginManager {
  private readonly loaded = new Map<string, LoadedPlugin>();
  private discovery: Promise<PluginEntry[]> | null = null;
  private stateMutation: Promise<void> = Promise.resolve();

  constructor(
    private readonly userPluginsDir: string,
    private readonly bundledPluginsDir: string,
    private readonly state: DocumentRepository<StoredPluginState>,
    private readonly credentials: CredentialVault,
    private readonly runtime: WasmPluginRuntime,
  ) {}

  async discover(): Promise<PluginEntry[]> {
    this.discovery ??= this.discoverNow().finally(() => { this.discovery = null; });
    return this.discovery;
  }

  async list(): Promise<PluginEntry[]> {
    if (this.loaded.size === 0) await this.discover();
    return [...this.loaded.values()].map(({ entry }) => structuredClone(entry)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async harnesses(): Promise<PluginHarnessDescriptor[]> {
    return (await this.list()).filter((plugin) => plugin.enabled && !plugin.error).flatMap((plugin) => plugin.harnesses);
  }

  async get(pluginId: string): Promise<LoadedPlugin> {
    if (this.loaded.size === 0) await this.discover();
    const plugin = this.loaded.get(pluginId);
    if (!plugin) throw new Error(`Plugin "${pluginId}" is not installed.`);
    return plugin;
  }

  async call<T>(pluginId: string, operation: string, input: unknown, timeoutMs?: number): Promise<T> {
    const plugin = await this.get(pluginId);
    if (!plugin.entry.enabled) throw new Error(`Plugin "${pluginId}" is disabled.`);
    if (plugin.entry.error) throw new Error(plugin.entry.error);
    return this.runtime.call<T>(plugin.package.wasmPath, operation, input, timeoutMs);
  }

  async configuration(pluginId: string): Promise<Record<string, string | number | boolean>> {
    const plugin = await this.get(pluginId);
    const snapshot = await this.readState();
    const saved = snapshot.config[pluginId] ?? {};
    const result: Record<string, string | number | boolean> = {};
    for (const field of plugin.package.manifest.config ?? []) {
      const stored = saved[field.key];
      if (field.type === "secret") {
        if (stored?.encrypted) {
          const decrypted = this.credentials.decrypt(stored.encrypted);
          if (!decrypted) throw new Error(`The saved ${plugin.entry.name} credential "${field.label}" could not be unlocked.`);
          result[field.key] = decrypted;
        }
      } else if (stored?.value !== undefined) result[field.key] = stored.value;
      else if (field.default !== undefined) result[field.key] = field.default;
      if (field.required && result[field.key] === undefined) throw new Error(`${plugin.entry.name} requires ${field.label}. Configure the plugin before using it.`);
    }
    return result;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginEntry> {
    await this.get(pluginId);
    if (enabled) await this.configuration(pluginId);
    await this.mutateState((current) => ({ ...current, enabled: { ...current.enabled, [pluginId]: enabled } }));
    await this.discover();
    return (await this.get(pluginId)).entry;
  }

  async configure(pluginId: string, update: PluginConfigUpdate): Promise<PluginEntry> {
    const plugin = await this.get(pluginId);
    const fields = new Map((plugin.package.manifest.config ?? []).map((field) => [field.key, field]));
    await this.mutateState((current) => {
      const values = { ...(current.config[pluginId] ?? {}) };
      for (const key of update.clear ?? []) {
        if (!fields.has(key)) throw new Error(`Plugin "${pluginId}" has no config field "${key}".`);
        delete values[key];
      }
      for (const [key, value] of Object.entries(update.values ?? {})) {
        const field = fields.get(key);
        if (!field) throw new Error(`Plugin "${pluginId}" has no config field "${key}".`);
        const expected = field.type === "secret" ? "string" : field.type;
        if (typeof value !== expected) throw new Error(`Plugin config "${key}" must be a ${expected}.`);
        if (field.type === "secret") values[key] = { encrypted: this.credentials.encrypt(value as string) };
        else values[key] = { value };
      }
      return { ...current, config: { ...current.config, [pluginId]: values } };
    });
    await this.discover();
    return (await this.get(pluginId)).entry;
  }

  async storeGet(pluginId: string, key: string): Promise<string | undefined> {
    await this.get(pluginId);
    return (await this.readState()).store[pluginId]?.[key];
  }

  async storeSet(pluginId: string, key: string, value: string): Promise<void> {
    await this.get(pluginId);
    await this.mutateState((current) => ({
      ...current,
      store: { ...current.store, [pluginId]: { ...(current.store[pluginId] ?? {}), [key]: value } },
    }));
  }

  async install(sourceDirectory: string): Promise<PluginEntry> {
    const source = await loadPluginPackage(sourceDirectory);
    if ((await this.list()).some((plugin) => plugin.id === source.manifest.id)) throw new Error(`Plugin "${source.manifest.id}" is already installed.`);
    const target = join(this.userPluginsDir, source.manifest.id);
    await mkdir(target, { recursive: false });
    try {
      const manifest = { ...source.manifest, main: "plugin.wasm", defaultEnabled: false };
      await copyFile(source.wasmPath, join(target, manifest.main));
      await writeFile(join(target, KHADIM_PLUGIN_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await this.mutateState((current) => ({ ...current, enabled: { ...current.enabled, [manifest.id]: false } }));
      await this.discover();
      return (await this.get(manifest.id)).entry;
    } catch (cause) {
      await rm(target, { recursive: true, force: true });
      throw cause;
    }
  }

  async uninstall(pluginId: string): Promise<void> {
    const plugin = await this.get(pluginId);
    if (plugin.entry.bundled) throw new Error("Bundled plugins cannot be uninstalled. Disable the plugin instead.");
    await rm(plugin.package.dir, { recursive: true, force: false });
    await this.mutateState((current) => {
      const enabled = { ...current.enabled };
      const config = { ...current.config };
      const store = { ...current.store };
      delete enabled[pluginId];
      delete config[pluginId];
      delete store[pluginId];
      return { enabled, config, store };
    });
    await this.discover();
  }

  private async readState(): Promise<StoredPluginState> {
    await this.stateMutation;
    return normalizePluginState(await this.state.read());
  }

  private async mutateState(operation: (current: StoredPluginState) => StoredPluginState): Promise<void> {
    const mutation = this.stateMutation.then(async () => {
      const current = normalizePluginState(await this.state.read());
      await this.state.write(operation(current));
    });
    this.stateMutation = mutation.catch(() => undefined);
    await mutation;
  }

  private async discoverNow(): Promise<PluginEntry[]> {
    await mkdir(this.userPluginsDir, { recursive: true, mode: 0o700 });
    const snapshot = await this.readState();
    const packages = await this.packageDirectories();
    const next = new Map<string, LoadedPlugin>();
    for (const { dir, bundled } of packages) {
      let resolved: ResolvedPluginPackage | undefined;
      try {
        resolved = await loadPluginPackage(dir);
        if (next.has(resolved.manifest.id)) {
          if (bundled) continue;
          throw new Error(`Plugin id "${resolved.manifest.id}" conflicts with another installed package.`);
        }
        const inspected = await this.runtime.inspect(resolved.wasmPath);
        const harnesses = validateCapabilities(resolved.manifest.id, resolved.manifest.version, inspected.info, inspected.capabilities);
        if (!resolved.manifest.capabilities.includes("harness") && harnesses.length > 0) throw new Error("Plugin exports a harness without declaring the harness capability.");
        const enabled = snapshot.enabled[resolved.manifest.id] ?? resolved.manifest.defaultEnabled === true;
        const savedConfig = snapshot.config[resolved.manifest.id] ?? {};
        const entry: PluginEntry = {
          id: resolved.manifest.id,
          name: resolved.manifest.name,
          version: resolved.manifest.version,
          description: resolved.manifest.description,
          author: resolved.manifest.author,
          license: resolved.manifest.license,
          homepage: resolved.manifest.homepage,
          enabled,
          bundled,
          capabilities: resolved.manifest.capabilities,
          harnesses,
          permissions: resolved.manifest.permissions ?? {},
          config: (resolved.manifest.config ?? []).map((field) => ({
            ...field,
            configured: savedConfig[field.key] !== undefined || field.default !== undefined,
            ...(field.type !== "secret" && (savedConfig[field.key]?.value ?? field.default) !== undefined
              ? { value: savedConfig[field.key]?.value ?? field.default }
              : {}),
          })),
        };
        next.set(entry.id, { entry, package: resolved });
      } catch (cause) {
        const id = resolved?.manifest.id ?? dir.split(/[\\/]/).at(-1) ?? "invalid-plugin";
        if (next.has(id)) continue;
        const manifest = resolved?.manifest;
        next.set(id, {
          package: resolved ?? { dir, manifestPath: join(dir, KHADIM_PLUGIN_MANIFEST), wasmPath: "", manifest: {
            apiVersion: 1, id, name: id, version: "0.0.0", description: "Plugin package could not be loaded.", main: "plugin.wasm", capabilities: [],
          } },
          entry: {
            id,
            name: manifest?.name ?? id,
            version: manifest?.version ?? "0.0.0",
            description: manifest?.description ?? "Plugin package could not be loaded.",
            enabled: false,
            bundled,
            capabilities: manifest?.capabilities ?? [],
            harnesses: [],
            permissions: manifest?.permissions ?? {},
            config: [],
            error: cause instanceof Error ? cause.message : String(cause),
          },
        });
      }
    }
    this.loaded.clear();
    for (const [id, plugin] of next) this.loaded.set(id, plugin);
    return this.list();
  }

  private async packageDirectories(): Promise<Array<{ dir: string; bundled: boolean }>> {
    const result: Array<{ dir: string; bundled: boolean }> = [];
    for (const [base, bundled] of [[this.bundledPluginsDir, true], [this.userPluginsDir, false]] as const) {
      const exists = await stat(base).then((value) => value.isDirectory(), () => false);
      if (!exists) continue;
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (entry.isDirectory()) result.push({ dir: join(base, entry.name), bundled });
      }
    }
    return result;
  }
}
