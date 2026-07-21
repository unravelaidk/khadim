import { readFile } from "node:fs/promises";
import type { PluginCapabilities, PluginInfo } from "../../shared/plugins";
import { encodePluginInput, encodePluginOperation } from "./core-abi";

type AbiExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  khadim_abi_version: () => number;
  khadim_alloc: (length: number) => number;
  khadim_dealloc?: (pointer: number, length: number) => void;
  khadim_plugin_info: () => bigint;
  khadim_capabilities: () => bigint;
  khadim_call: (operationPointer: number, operationLength: number, inputPointer: number, inputLength: number) => bigint;
};

export interface CorePluginInspection {
  info: PluginInfo;
  capabilities: PluginCapabilities;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

function unpack(packed: bigint): { pointer: number; length: number } {
  return { pointer: Number((packed >> 32n) & 0xffff_ffffn), length: Number(packed & 0xffff_ffffn) };
}

function decodeResult(exports: AbiExports, packed: bigint): unknown {
  const { pointer, length } = unpack(packed);
  if (pointer + length > exports.memory.buffer.byteLength) throw new Error("Plugin returned an invalid output buffer.");
  const json = decoder.decode(new Uint8Array(exports.memory.buffer, pointer, length));
  return JSON.parse(json) as unknown;
}

function allocate(exports: AbiExports, bytes: Uint8Array): { pointer: number; length: number } {
  const pointer = exports.khadim_alloc(bytes.length);
  if (!Number.isInteger(pointer) || pointer < 0 || pointer + bytes.length > exports.memory.buffer.byteLength) throw new Error("Plugin returned an invalid allocation.");
  new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
  return { pointer, length: bytes.length };
}

async function instantiateCorePlugin(modulePath: string): Promise<AbiExports> {
  const module = await WebAssembly.compile(await readFile(modulePath));
  const imports = WebAssembly.Module.imports(module);
  if (imports.some((entry) => !["khadim:host", "env"].includes(entry.module) || entry.name !== "memory" || entry.kind !== "memory")) {
    throw new Error("Plugins may only import host-provided memory.");
  }
  const memory = new WebAssembly.Memory({ initial: 64, maximum: 256 });
  const instance = await WebAssembly.instantiate(module, { "khadim:host": { memory }, env: { memory } });
  const exports = instance.exports as AbiExports;
  for (const name of ["memory", "khadim_abi_version", "khadim_alloc", "khadim_plugin_info", "khadim_capabilities", "khadim_call"]) {
    if (!(name in exports)) throw new Error(`Plugin is missing required export ${name}.`);
  }
  if (exports.memory !== memory) throw new Error("Plugin must export the host-provided memory.");
  const abiVersion = exports.khadim_abi_version();
  if (abiVersion !== 1) throw new Error(`Unsupported core plugin ABI ${abiVersion}.`);
  return exports;
}

export async function inspectCorePlugin(modulePath: string): Promise<CorePluginInspection> {
  const exports = await instantiateCorePlugin(modulePath);
  return {
    info: decodeResult(exports, exports.khadim_plugin_info()) as PluginInfo,
    capabilities: decodeResult(exports, exports.khadim_capabilities()) as PluginCapabilities,
  };
}

export async function callCorePlugin<T = unknown>(modulePath: string, operationName: string, input: unknown): Promise<T> {
  const exports = await instantiateCorePlugin(modulePath);
  const operation = allocate(exports, encodePluginOperation(operationName));
  const payload = allocate(exports, encodePluginInput(input));
  try {
    const envelope = decodeResult(exports, exports.khadim_call(operation.pointer, operation.length, payload.pointer, payload.length));
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("Plugin call returned an invalid result envelope.");
    const result = envelope as { ok?: boolean; value?: unknown; error?: unknown };
    if (result.ok !== true) throw new Error(typeof result.error === "string" ? result.error : "Plugin call failed.");
    return result.value as T;
  } finally {
    exports.khadim_dealloc?.(operation.pointer, operation.length);
    exports.khadim_dealloc?.(payload.pointer, payload.length);
  }
}
