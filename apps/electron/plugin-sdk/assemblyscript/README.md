# AssemblyScript plugin SDK

The AssemblyScript SDK provides the memory, UTF-8, and result-envelope helpers
needed to implement Khadim's v1 core ABI from TypeScript-like source.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Configure AssemblyScript

Use the included `asconfig.json`, or enable equivalent compiler options in your
plugin. The generated module must import memory and export its runtime.

```json
{
  "options": {
    "importMemory": true,
    "exportRuntime": true,
    "runtime": "stub"
  }
}
```

AssemblyScript emits `env/memory` with this option. The Khadim host accepts that
SDK-specific name and applies the same 16 MB ceiling as `khadim:host/memory`.

## Export the ABI

Delegate allocation and JSON envelopes to the SDK helpers. Keep plugin metadata
and capability output in static JSON so it remains deterministic at discovery.

```ts
import {
  alloc,
  dealloc,
  decode,
  encode,
  failure,
  ok,
} from "@khadim/plugin-sdk-assemblyscript";

export function khadim_abi_version(): i32 {
  return 1;
}

export function khadim_alloc(length: i32): i32 {
  return alloc(length);
}

export function khadim_dealloc(pointer: i32, _length: i32): void {
  dealloc(pointer, _length);
}

export function khadim_plugin_info(): i64 {
  return encode('{"id":"example.harness","name":"Example",' +
    '"version":"1.0.0","apiVersion":1}');
}

export function khadim_capabilities(): i64 {
  return encode('{"harnesses":[{"id":"example","name":"Example",' +
    '"description":"Runs prompts through Example."}]}');
}

export function khadim_call(
  operationPointer: i32,
  operationLength: i32,
  _inputPointer: i32,
  _inputLength: i32,
): i64 {
  const operation = decode(operationPointer, operationLength);
  if (operation == "harness.health") {
    return ok('{"method":"GET","path":"/health"}');
  }
  return failure("Unsupported operation: " + operation);
}
```

Use the [plugin system guide](../../docs/plugins.md) to implement the complete
harness operation set and package the compiled module.
