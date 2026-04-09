---
title: Plugin SDK Overview
description: Build sandboxed Khadim plugins as WebAssembly modules and ship new tools into the desktop app.
---

# Khadim Plugin SDK

Khadim plugins are sandboxed WASM modules that add custom tools, workspace-aware automation, and safe host access.

## Why this SDK

The Plugin SDK gives you a narrow extension surface with a strong sandbox boundary:

- WebAssembly execution through the desktop host
- workspace-scoped filesystem access
- allowlisted outbound HTTP
- plugin-local key-value storage
- structured logging and config injection

## How plugins fit into Khadim

```text
Khadim Desktop App
  Agent Orchestrator
    Plugin Bridge
      WASM Host
        Sandboxed Plugin
```

Plugins are discovered from `~/.local/share/khadim/plugins/`, loaded by the host, and exposed as namespaced tools like `plugin.my-plugin.do_thing`.

## Start here

- [Getting Started](/getting-started/)
- [Manifest Reference](/reference/manifest/)
- [AssemblyScript SDK](/reference/assemblyscript-sdk/)
- [Host Capabilities](/reference/host-capabilities/)
- [Examples](/guides/examples/)

## Primary workflow

1. Create a plugin project.
2. Implement the Khadim plugin exports.
3. Build a `.wasm` binary.
4. Add `plugin.toml`.
5. Install the plugin into the Khadim plugins directory.
6. Enable it in the desktop app.

## Included references

The repo already includes working examples under `examples/plugins/`, including:

- `ts-hello-world` for the AssemblyScript SDK flow
- `obsidian-wiki` for a larger real plugin
