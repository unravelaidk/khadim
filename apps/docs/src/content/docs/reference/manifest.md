---
title: Manifest Reference
description: The `plugin.toml` file declares plugin metadata, config schema, and sandbox permissions.
---

Every plugin is described by a `plugin.toml` manifest.

## Core plugin fields

- `name`
- `version`
- `description`
- `author`
- `license`
- `homepage`
- `wasm`

The manifest is also where you declare the plugin's tools, configuration, and permission surface.

## Configuration fields

Plugins can declare user-configurable values with repeated `[[config]]` entries. These values are passed to the plugin during initialization.

Typical config fields include:

- a `key`
- a `description`
- a `field_type`
- whether the field is `required`
- an optional `default_value`

## Permissions

The `[permissions]` section declares which host capabilities the plugin needs.

For example, an AssemblyScript example plugin may use:

```toml
[permissions]
fs = false
http = true
store = false
allowed_hosts = ["*"]
```

Use the narrowest permissions that still allow the plugin to work.
