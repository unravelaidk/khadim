---
title: Getting Started
description: Create, build, and install your first Khadim plugin using the AssemblyScript SDK example.
---

## Create your plugin

Start from the example plugin in this repository:

```bash
cp -r examples/plugins/ts-hello-world my-plugin
cd my-plugin
npm install
```

## What to edit first

1. Update your plugin metadata in `plugin.toml`.
2. Rename the example tool to match your plugin.
3. Build the WebAssembly bundle used by the desktop host.

## Next steps

- Learn the manifest format in [Manifest](/khadim/reference/manifest/)
- Explore helper APIs in [AssemblyScript SDK](/khadim/reference/assemblyscript-sdk/)
- Review host permissions in [Host Capabilities](/khadim/reference/host-capabilities/)
