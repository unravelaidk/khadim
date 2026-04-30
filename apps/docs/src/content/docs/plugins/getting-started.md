---
title: Getting Started
description: Create, build, and install your first Khadim plugin using the AssemblyScript SDK example.
---

## Choose a starting point

The fastest way to build a plugin is to start from one of the example directories in `examples/plugins/`.

- `hello-world` for the smallest Rust example.
- `ts-hello-world` for an AssemblyScript plugin with a lightweight TypeScript-style workflow.
- `web-search` for a Rust-based plugin.
- `obsidian-wiki` for a more featureful workspace-oriented plugin.

For desktop UI tab examples, also review:

- `apps/desktop/plugins/calendar`
- `apps/desktop/plugins/pomodoro`

For most new plugin authors, `ts-hello-world` is the best starting point.

## Copy the example plugin

Start from the AssemblyScript example in this repository:

```bash
cp -r examples/plugins/ts-hello-world my-plugin
cd my-plugin
npm install
```

## Understand the plugin layout

The copied example gives you the pieces Khadim expects:

- `plugin.toml` defines plugin metadata, config fields, and permissions.
- `assembly/index.ts` contains your exported plugin functions and tools.
- `assembly/sdk.ts` provides helper functions for logging, HTTP, JSON, and tool responses.
- Optional `ui.js` and `[ui]` manifest entries add desktop sidebar/content tabs.
- `build.sh` or `npm run build` compiles the plugin to `plugin.wasm`.

## What to edit first

1. Update your plugin metadata in `plugin.toml`.
2. Rename the example tool to match your plugin.
3. If your plugin ships UI, register your custom elements in `ui.js` and add `[[ui.tabs]]` entries.
4. Build the WebAssembly bundle used by the desktop host.

## Build the plugin

```bash
npm run build
```

This should produce `plugin.wasm` for the host to load.

## Install the plugin

If the example includes a deploy script, use it:

```bash
npm run deploy
```

Otherwise, copy the built plugin directory into the Khadim plugins location used by your environment.

## What the host expects

At runtime, Khadim loads your manifest, reads the permission declarations, and calls exported plugin functions to:

- initialize plugin config
- list available tools
- execute a selected tool with JSON arguments
- optionally load plugin UI bundles and mount declared tab elements in the desktop app

## Next steps

- Learn the manifest format in [Manifest](/khadim/plugins/manifest/)
- Explore helper APIs in [AssemblyScript SDK](/khadim/plugins/assemblyscript-sdk/)
- Review host permissions in [Host Capabilities](/khadim/plugins/host-capabilities/)
