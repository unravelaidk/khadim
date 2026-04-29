---
title: Plugin SDK Overview
description: Build sandboxed Khadim plugins as WebAssembly modules and ship new tools into the desktop app.
---

Khadim is an open-source, local-first agentic automation platform. These docs cover both the Plugin SDK and the CLI coding agent.

## CLI coding agent

The [Khadim CLI](/khadim/cli/overview/) is a terminal-based AI assistant that connects to 19+ LLM providers. Use it interactively as a TUI, in batch mode as a headless agent, or embed it in your own application via the [programmatic API](/khadim/cli/programmatic-api/).

```bash
npm install -g @unravelai/khadim
khadim --prompt "explain this codebase"
```

## Plugin SDK

Khadim plugins let you add new tools to the app without changing the core runtime. A plugin is packaged as a WebAssembly module plus a `plugin.toml` manifest that describes metadata, config, permissions, and optional desktop UI tabs.

## What a plugin contains

- `plugin.toml` for metadata, configuration fields, and permission declarations.
- `plugin.wasm` for the compiled plugin code.
- Optional `ui.js` and `[[ui.tabs]]` manifest entries for desktop plugin panels.
- Optional source files and build scripts used to produce the final WebAssembly bundle.

## What plugins can do

- Register one or more tools that the host can call.
- Read plugin config values provided by the app.
- Use host capabilities such as HTTP or filesystem access when permissions allow it.
- Add desktop sidebar/content tabs by registering custom elements from a plugin UI bundle.
- Stay isolated from the main application process behind a narrow host API.

## Plugin author workflow

1. Start from one of the example plugins in `examples/plugins/`.
2. Edit `plugin.toml` to define the plugin identity and permissions.
3. Implement your tool behavior in AssemblyScript or Rust.
4. Build `plugin.wasm`.
5. Install or copy the plugin into the Khadim plugins directory.

## Docs map

- [CLI Overview](/khadim/cli/overview/) — install, configure, and use the CLI.
- [Programmatic API](/khadim/cli/programmatic-api/) — embed the agent in your own app.
- Start with [Getting Started](/khadim/getting-started/) to build your first plugin.
- Review the [Manifest Reference](/khadim/reference/manifest/) to understand `plugin.toml`.
- Learn the [AssemblyScript SDK](/khadim/reference/assemblyscript-sdk/) for TypeScript-style plugins.
- Check [Host Capabilities](/khadim/reference/host-capabilities/) before requesting permissions.
- Browse [Examples](/khadim/guides/examples/) for working plugin templates.
