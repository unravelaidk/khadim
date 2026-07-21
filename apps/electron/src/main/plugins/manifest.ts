import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  KHADIM_PLUGIN_API_VERSION,
  KHADIM_PLUGIN_MANIFEST,
  type PluginCapabilityKind,
  type PluginConfigField,
  type PluginManifest,
  type PluginNetworkPermissions,
} from "../../shared/plugins";

export interface ResolvedPluginPackage {
  dir: string;
  manifestPath: string;
  wasmPath: string;
  manifest: PluginManifest;
}

const pluginIdPattern = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const capabilityKinds = new Set<PluginCapabilityKind>(["harness", "tool", "connector"]);
const configTypes = new Set(["string", "secret", "boolean", "number"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string no longer than ${max} characters.`);
  return value.trim();
}

function optionalString(value: unknown, label: string, max = 1_024): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label, max);
}

function parseConfig(value: unknown): PluginConfigField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Plugin config must be an array.");
  const keys = new Set<string>();
  return value.map((candidate, index) => {
    const field = object(candidate, `Plugin config field ${index + 1}`);
    const key = nonEmptyString(field.key, `Plugin config field ${index + 1} key`, 80);
    if (!/^[a-z][a-z0-9._-]*$/i.test(key)) throw new Error(`Plugin config key "${key}" is invalid.`);
    if (keys.has(key)) throw new Error(`Plugin config key "${key}" is duplicated.`);
    keys.add(key);
    if (typeof field.type !== "string" || !configTypes.has(field.type)) throw new Error(`Plugin config field "${key}" has an unsupported type.`);
    const parsed: PluginConfigField = {
      key,
      label: nonEmptyString(field.label, `Plugin config field "${key}" label`, 120),
      type: field.type as PluginConfigField["type"],
    };
    const description = optionalString(field.description, `Plugin config field "${key}" description`);
    if (description) parsed.description = description;
    if (field.required !== undefined) {
      if (typeof field.required !== "boolean") throw new Error(`Plugin config field "${key}" required must be a boolean.`);
      parsed.required = field.required;
    }
    if (field.default !== undefined) {
      const expected = parsed.type === "secret" ? "string" : parsed.type;
      if (typeof field.default !== expected) throw new Error(`Plugin config field "${key}" default must be a ${expected}.`);
      if (parsed.type === "secret") throw new Error(`Plugin config field "${key}" cannot declare a secret default.`);
      parsed.default = field.default as string | number | boolean;
    }
    return parsed;
  });
}

export function parsePluginManifest(value: unknown): PluginManifest {
  const input = object(value, "Plugin manifest");
  if (input.apiVersion !== KHADIM_PLUGIN_API_VERSION) throw new Error(`Unsupported plugin API version ${String(input.apiVersion)}. This Khadim build supports version ${KHADIM_PLUGIN_API_VERSION}.`);
  const id = nonEmptyString(input.id, "Plugin id", 128);
  if (!pluginIdPattern.test(id)) throw new Error(`Plugin id "${id}" is invalid.`);
  const version = nonEmptyString(input.version, "Plugin version", 80);
  if (!versionPattern.test(version)) throw new Error(`Plugin version "${version}" must use semantic versioning.`);
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) throw new Error("Plugin capabilities must contain at least one capability.");
  const capabilities = [...new Set(input.capabilities.map((capability) => {
    if (typeof capability !== "string" || !capabilityKinds.has(capability as PluginCapabilityKind)) throw new Error(`Unsupported plugin capability "${String(capability)}".`);
    return capability as PluginCapabilityKind;
  }))];
  const permissionsInput = input.permissions === undefined ? {} : object(input.permissions, "Plugin permissions");
  const networkInput = permissionsInput.network === undefined ? undefined : object(permissionsInput.network, "Plugin network permissions");
  let network: PluginNetworkPermissions | undefined;
  if (networkInput) {
    if (!Array.isArray(networkInput.allowedHosts) || networkInput.allowedHosts.length === 0) throw new Error("Network-enabled plugins must declare at least one allowed host.");
    const allowedHosts = networkInput.allowedHosts.map((host, index) => nonEmptyString(host, `Allowed host ${index + 1}`, 253).toLowerCase());
    if (allowedHosts.some((host) => host.includes("/") || host.includes(":") && host !== "::1")) throw new Error("Allowed hosts must be host names without schemes, paths, or ports.");
    if (networkInput.allowHttp !== undefined && typeof networkInput.allowHttp !== "boolean") throw new Error("Network allowHttp must be a boolean.");
    network = { allowedHosts: [...new Set(allowedHosts)], allowHttp: networkInput.allowHttp === true };
  }
  const manifest: PluginManifest = {
    apiVersion: KHADIM_PLUGIN_API_VERSION,
    id,
    name: nonEmptyString(input.name, "Plugin name", 120),
    version,
    description: nonEmptyString(input.description, "Plugin description", 2_000),
    main: nonEmptyString(input.main, "Plugin main", 260),
    capabilities,
    config: parseConfig(input.config),
  };
  if (isAbsolute(manifest.main) || manifest.main.split(/[\\/]+/).includes("..") || !manifest.main.toLowerCase().endsWith(".wasm")) throw new Error("Plugin main must be a relative .wasm path inside the plugin directory.");
  for (const key of ["author", "license", "homepage"] as const) {
    const parsed = optionalString(input[key], `Plugin ${key}`);
    if (parsed) manifest[key] = parsed;
  }
  if (input.defaultEnabled !== undefined) {
    if (typeof input.defaultEnabled !== "boolean") throw new Error("Plugin defaultEnabled must be a boolean.");
    manifest.defaultEnabled = input.defaultEnabled;
  }
  if (network) manifest.permissions = { network };
  return manifest;
}

export async function loadPluginPackage(dir: string): Promise<ResolvedPluginPackage> {
  const canonicalDir = await realpath(dir);
  if (!(await stat(canonicalDir)).isDirectory()) throw new Error("Plugin package path must be a directory.");
  const manifestPath = resolve(canonicalDir, KHADIM_PLUGIN_MANIFEST);
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const manifest = parsePluginManifest(raw);
  const wasmPath = await realpath(resolve(canonicalDir, manifest.main));
  const escaped = relative(canonicalDir, wasmPath);
  if (!escaped || escaped.startsWith("..") || isAbsolute(escaped)) throw new Error("Plugin WebAssembly module must stay inside its package directory.");
  if (!(await stat(wasmPath)).isFile()) throw new Error("Plugin WebAssembly module must be a file.");
  if (dirname(manifestPath) !== canonicalDir) throw new Error("Plugin manifest path is invalid.");
  return { dir: canonicalDir, manifestPath, wasmPath, manifest };
}
