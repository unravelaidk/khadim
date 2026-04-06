# Khadim Plugin Example: TypeScript (AssemblyScript)

Write Khadim plugins in **TypeScript** — no Rust toolchain required.

This example mirrors the Rust `hello-world` plugin but is written in
[AssemblyScript](https://www.assemblyscript.org/), a TypeScript-like language
that compiles directly to WebAssembly.

## Why AssemblyScript?

| | Rust | AssemblyScript |
|--|------|---------------|
| **Language** | Rust | TypeScript subset |
| **Toolchain** | `rustup` + `wasm32-unknown-unknown` | `npm` + `assemblyscript` |
| **Binary size** | ~48 KB | ~11 KB |
| **Learning curve** | Steep if new to Rust | Familiar to any TS/JS dev |
| **SDK** | `khadim-plugin-sdk` crate | `assembly/sdk.ts` (included) |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Build the WASM binary
npm run build

# 3. Install into Khadim
npm run deploy          # or: ./build.sh --install
```

Then enable **TS Hello World** in **Settings → Plugins**.

## Project structure

```
ts-hello-world/
├── assembly/
│   ├── index.ts        ← Your plugin code
│   └── sdk.ts          ← Khadim SDK (host imports, helpers)
├── plugin.toml         ← Plugin manifest
├── asconfig.json       ← AssemblyScript compiler config
├── package.json
└── build.sh
```

## How to write your own

### 1. Copy this example

```bash
cp -r examples/plugins/ts-hello-world my-plugin
cd my-plugin
```

### 2. Edit `assembly/index.ts`

The four required exports:

```typescript
// Plugin metadata
export function khadim_info(): i64 { ... }

// Called once with config JSON from plugin.toml [[config]] fields
export function khadim_initialize(configPtr: i32, configLen: i32): i32 { ... }

// Return tool definitions as JSON
export function khadim_list_tools(): i64 { ... }

// Execute a tool — the host passes tool name and JSON args
export function khadim_execute_tool(
  namePtr: i32, nameLen: i32,
  argsPtr: i32, argsLen: i32,
): i64 { ... }
```

### 3. Edit `plugin.toml`

```toml
[plugin]
name = "my-plugin"
version = "0.1.0"
description = "What it does"
author = "You"
wasm = "plugin.wasm"

[permissions]
http = true
allowed_hosts = ["api.example.com"]
```

### 4. Build & install

```bash
npm run build
npm run deploy
```

## SDK reference (`assembly/sdk.ts`)

### Logging

```typescript
import { log } from "./sdk";

log.info("message");
log.warn("message");
log.error("message");
log.debug("message");
```

### HTTP (requires `http = true` in `plugin.toml`)

```typescript
import { httpGet, httpPost, HttpResponse } from "./sdk";

const resp: HttpResponse = httpGet("https://api.example.com/data");
// resp.status — HTTP status code (200, 404, etc.)
// resp.body   — response body as string

const resp2 = httpPost("https://api.example.com/submit", '{"key":"value"}');
```

### JSON helpers

AssemblyScript doesn't have `JSON.parse`/`JSON.stringify`, so the SDK
provides lightweight helpers:

```typescript
import { jsonGetString, jsonGetInt, jsonEscapeString } from "./sdk";

const name = jsonGetString(argsJson, "name");    // "Alice" or null
const count = jsonGetInt(argsJson, "count", 10);  // 10 if missing
const safe = jsonEscapeString(userInput);          // escaped for JSON
```

### Tool results

```typescript
import { toolResultOk, toolResultError } from "./sdk";

// Success
return toolResultOk("It worked!");
return toolResultOk("With metadata", '{"key":"value"}');

// Error
return toolResultError("Something went wrong");
```

### Return helpers

```typescript
import { returnString, readArgs } from "./sdk";

// Return a JSON string to the host (packs ptr|len into i64)
return returnString(jsonString);

// Read tool name + args from host pointers
const [name, argsJson] = readArgs(namePtr, nameLen, argsPtr, argsLen);
```

## Tools in this example

| Tool | Description |
|------|-------------|
| `greet` | Greet someone by name (supports formal/casual/pirate styles) |
| `count_words` | Count words in a string |
| `reverse` | Reverse a string |
| `fetch_title` | Fetch the `<title>` of a web page (demonstrates HTTP) |

## Plugin ABI

For reference, these are the WASM exports/imports the Khadim host expects.
The SDK handles all of this — you don't need to implement it manually.

### Exports (your plugin provides)

| Export | Signature | Description |
|--------|-----------|-------------|
| `__alloc(size: i32) → i32` | Allocator | Host writes data into guest memory |
| `khadim_info() → i64` | Packed ptr\|len | Plugin metadata JSON |
| `khadim_initialize(ptr, len) → i32` | 0 = ok | Init with config JSON |
| `khadim_list_tools() → i64` | Packed ptr\|len | Tool definitions JSON |
| `khadim_execute_tool(np, nl, ap, al) → i64` | Packed ptr\|len | Tool result JSON |
| `memory` | WebAssembly.Memory | Linear memory |

### Imports (the host provides)

| Module | Function | Signature |
|--------|----------|-----------|
| `host-log` | `info(ptr, len)` | Log at info level |
| `host-log` | `warn(ptr, len)` | Log at warn level |
| `host-log` | `error(ptr, len)` | Log at error level |
| `host-log` | `debug(ptr, len)` | Log at debug level |
| `host-http` | `fetch(ptr, len) → i32` | HTTP request, returns body length |
| `host-http` | `read_body(ptr, cap) → i32` | Copy response into buffer |
| `host-http` | `status() → i32` | HTTP status code |

### Return value packing

Functions returning `i64` pack pointer and length:
```
high 32 bits = pointer into linear memory
low  32 bits = byte length of JSON string
```
