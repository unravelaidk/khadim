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

## Permission model

Plugins do not get capabilities automatically. They request them in `plugin.toml`, and the host uses that manifest to decide what the plugin may access.

Common permissions include:

- `http` for outbound network requests
- `fs` for filesystem access within the allowed workspace scope
- `store` for plugin-owned persisted state

If a plugin does not declare a permission, it should be written as though that capability is unavailable.

## Practical guidance

- ask for the smallest permission surface you can
- keep allowed hosts specific when using network access
- design plugins so they degrade cleanly when a capability is disabled
