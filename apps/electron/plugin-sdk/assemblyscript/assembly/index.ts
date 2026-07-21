// AssemblyScript helpers for Khadim's v1 core WebAssembly ABI. Compile with
// --importMemory --exportRuntime and import memory from khadim:host/memory.

let allocations = new Map<usize, Uint8Array>();
let output = new Uint8Array(0);

export function alloc(length: i32): i32 {
  const bytes = new Uint8Array(length);
  allocations.set(bytes.dataStart, bytes);
  return bytes.dataStart as i32;
}

export function dealloc(pointer: i32, _length: i32): void {
  allocations.delete(pointer as usize);
}

export function decode(pointer: i32, length: i32): string {
  return String.UTF8.decodeUnsafe(pointer as usize, length, false);
}

export function encode(value: string): i64 {
  const buffer = String.UTF8.encode(value, false);
  output = Uint8Array.wrap(buffer);
  return (i64(output.dataStart) << 32) | i64(output.length);
}

export function ok(jsonValue: string): i64 {
  return encode(`{"ok":true,"value":${jsonValue}}`);
}

export function failure(message: string): i64 {
  return encode(`{"ok":false,"error":${escapeJson(message)}}`);
}

function escapeJson(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`;
}
