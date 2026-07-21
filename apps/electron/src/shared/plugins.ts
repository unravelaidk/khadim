import type { AgentStreamEvent } from "./types";

export const KHADIM_PLUGIN_API_VERSION = 1 as const;
export const KHADIM_PLUGIN_MANIFEST = "khadim.plugin.json";

export type PluginCapabilityKind = "harness" | "tool" | "connector";
export type PluginConfigFieldType = "string" | "secret" | "boolean" | "number";
export type PluginHarnessId = `plugin:${string}/${string}`;

export interface PluginConfigField {
  key: string;
  label: string;
  description?: string;
  type: PluginConfigFieldType;
  required?: boolean;
  default?: string | number | boolean;
}

export interface PluginNetworkPermissions {
  allowedHosts: string[];
  allowHttp?: boolean;
}

export interface PluginManifest {
  apiVersion: typeof KHADIM_PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  main: string;
  defaultEnabled?: boolean;
  capabilities: PluginCapabilityKind[];
  permissions?: {
    network?: PluginNetworkPermissions;
  };
  config?: PluginConfigField[];
}

export interface PluginHarnessDescriptor {
  id: PluginHarnessId;
  pluginId: string;
  capabilityId: string;
  name: string;
  description: string;
  icon?: string;
}

export interface PluginConfigFieldStatus extends PluginConfigField {
  configured: boolean;
  /** Present only for non-secret fields. Secret values never cross IPC. */
  value?: string | number | boolean;
}

export interface PluginEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  enabled: boolean;
  bundled: boolean;
  capabilities: PluginCapabilityKind[];
  harnesses: PluginHarnessDescriptor[];
  permissions: {
    network?: PluginNetworkPermissions;
  };
  config: PluginConfigFieldStatus[];
  error?: string;
}

export interface PluginConfigUpdate {
  values?: Record<string, string | number | boolean>;
  clear?: string[];
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
}

export interface PluginCapabilities {
  harnesses?: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
  }>;
}

export interface PluginHttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PluginHarnessCallContext {
  harnessId: string;
  projectPath: string;
  engineSessionKey: string;
  remoteSessionId?: string;
  prompt?: string;
  systemPrompt?: string;
  model?: { provider: string; model: string };
  config: Record<string, string | number | boolean>;
}

export interface PluginHarnessEventResult {
  events: AgentStreamEvent[];
  terminal?: boolean;
}

export function isPluginHarnessId(value: string): value is PluginHarnessId {
  return /^plugin:[a-z0-9][a-z0-9._-]{1,127}\/[a-z0-9][a-z0-9._-]{0,79}$/i.test(value);
}

export function isHarnessMode(value: unknown): value is "assistant" | "rpa" | PluginHarnessId {
  return value === "assistant"
    || value === "rpa"
    || (typeof value === "string" && isPluginHarnessId(value));
}

export function parsePluginHarnessId(value: PluginHarnessId): { pluginId: string; capabilityId: string } {
  const separator = value.lastIndexOf("/");
  return { pluginId: value.slice("plugin:".length, separator), capabilityId: value.slice(separator + 1) };
}
