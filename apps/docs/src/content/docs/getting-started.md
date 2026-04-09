---
title: Getting Started
description: Create, build, and install your first Khadim plugin using the AssemblyScript SDK example.
---

## Start from the TypeScript example

The fastest path is the AssemblyScript example in `examples/plugins/ts-hello-world`.

```bash
cp -r examples/plugins/ts-hello-world my-plugin
cd my-plugin
npm install
```

This flow avoids a Rust toolchain and compiles a TypeScript-like codebase to WebAssembly.

## Project layout

```text
my-plugin/
  assembly/
    index.ts
    sdk.ts
  asconfig.json
  build.sh
  package.json
  plugin.toml
```

## Required exports

Your plugin entrypoint must export these host-facing functions:

```ts
export function khadim_info(): i64 { ... }
export function khadim_initialize(configPtr: i32, configLen: i32): i32 { ... }
export function khadim_list_tools(): i64 { ... }
export function khadim_execute_tool(
  namePtr: i32,
  nameLen: i32,
  argsPtr: i32,
  argsLen: i32,
): i64 { ... }
```

The included `assembly/sdk.ts` handles the ABI details like pointer packing, host imports, memory allocation, and JSON result helpers.

## Build the plugin

```bash
npm run build
```

Then copy the output into the manifest location if your build flow does not already do it:

```bash
cp build/release.wasm plugin.wasm
```

## Define the manifest

Create or update `plugin.toml`:

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

## Install into Khadim

Install the plugin directory into:

```text
~/.local/share/khadim/plugins/my-plugin/
```

That directory should contain at least:

- `plugin.toml`
- your built `.wasm` file

After installation, enable the plugin from the desktop app.

## Next steps

- Learn the manifest format in [Manifest](/reference/manifest/)
- Explore helper APIs in [AssemblyScript SDK](/reference/assemblyscript-sdk/)
- Review host permissions in [Host Capabilities](/reference/host-capabilities/)
