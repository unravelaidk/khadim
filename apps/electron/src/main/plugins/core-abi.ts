const encoder = new TextEncoder();

export function encodePluginOperation(operation: string): Uint8Array {
  return encoder.encode(operation);
}

export function encodePluginInput(input: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(input) ?? "null");
}
