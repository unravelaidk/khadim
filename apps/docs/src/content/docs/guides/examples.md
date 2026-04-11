---
title: Examples
description: Use the included example plugins as working references for your own SDK usage.
---

The repository includes example plugins you can copy, rename, and adapt while building your own tools.

## Included plugin examples

- `examples/plugins/ts-hello-world`
  Smallest AssemblyScript example. Good for learning the manifest format, the plugin exports, and the basic host API.
- `examples/plugins/obsidian-wiki`
  Workspace-oriented plugin that manages markdown notes inside the active project root.
- `examples/plugins/web-search`
  Rust plugin example that shows an alternative implementation language.

## What to learn from the examples

- manifest structure
- host calls
- tool naming
- packaging flow

## Recommended path

1. Copy `ts-hello-world`.
2. Change the plugin identity in `plugin.toml`.
3. Replace the sample tools with your own.
4. Keep permissions as narrow as possible while you develop.
