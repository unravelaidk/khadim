---
title: Host Capabilities
description: Understand what the Khadim host exposes inside the plugin sandbox and what remains blocked.
---

Plugins run in a constrained environment. The host exposes a curated set of capabilities rather than unrestricted system access.

## Design goals

- predictable execution
- explicit permissions
- stable host APIs
- sandboxed plugin boundaries

Treat the host as the bridge between your plugin and the desktop runtime.
