---
title: Host Capabilities
description: Understand what the Khadim host exposes inside the plugin sandbox and what remains blocked.
---

## Available capabilities

Plugins run inside a WebAssembly sandbox and only receive capabilities they declare.

| Capability | Permission needed | Notes |
| --- | --- | --- |
| Logging | None | Structured plugin logs are always available |
| HTTP | `http = true` | Only to hosts in `allowed_hosts` |
| Filesystem | `fs = true` | Limited to the active workspace root |
| Key-value storage | `store = true` | Scoped to the current plugin |
| Config | None | Values come from declared `[[config]]` fields |

## Host imports

From the current AssemblyScript SDK, the host provides imports under modules such as:

- `host-log`
- `host-http`
- `host-fs`

These imports power the higher-level helpers in `assembly/sdk.ts`.

## Filesystem constraints

The filesystem bridge is intentionally narrow:

- read files in the workspace
- write files in the workspace
- append to files in the workspace
- list directories in the workspace
- test whether a workspace path exists

Plugins cannot use it to escape the workspace root.

## HTTP constraints

HTTP calls are allowed only when both conditions are true:

1. the plugin requests `http = true`
2. the requested hostname matches `allowed_hosts`

This keeps external access explicit and reviewable in the manifest.

## Tool namespacing

When a plugin registers a tool, Khadim exposes it under a namespaced identifier:

```text
plugin.<plugin-id>.<tool-name>
```

This prevents collisions with built-in tools and other plugins.
