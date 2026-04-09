---
title: Manifest Reference
description: The `plugin.toml` file declares plugin metadata, config schema, and sandbox permissions.
---

## Example

```toml
[plugin]
name = "my-plugin"
version = "0.1.0"
description = "What it does"
author = "Author Name"
license = "MIT"
homepage = "https://example.com"
wasm = "plugin.wasm"
min_host_version = "0.1.0"

[[config]]
key = "api_key"
description = "API key for the service"
field_type = "secret"
required = true

[[config]]
key = "max_results"
description = "Maximum results"
field_type = "number"
required = false
default_value = "10"

[permissions]
fs = false
http = true
store = true
allowed_hosts = [
  "api.example.com",
  "*.openai.com",
]
```

## Plugin section

| Key | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Unique plugin identifier |
| `version` | Yes | Plugin version |
| `description` | Yes | Short human-readable summary |
| `author` | No | Plugin author |
| `license` | No | SPDX identifier |
| `homepage` | No | Project URL |
| `wasm` | Yes | Relative path to the plugin binary |
| `min_host_version` | No | Minimum supported Khadim version |

## Config fields

Use `[[config]]` entries to declare values the user can set in the UI.

Supported field types from the current docs:

- `string`
- `secret`
- `boolean`
- `number`

Each field can declare:

- `key`
- `description`
- `required`
- `default_value`

## Permissions

The permissions block controls which host APIs are available to the plugin.

| Permission | Effect |
| --- | --- |
| `fs = true` | Read and write files inside the active workspace |
| `http = true` | Make outbound HTTP calls |
| `store = true` | Use plugin-scoped persistent key-value storage |

When `http = true`, add `allowed_hosts` so requests stay constrained to trusted domains.

## Security model

Plugins cannot:

- escape the workspace filesystem sandbox
- call hosts outside the declared allowlist
- access another plugin's storage
- execute arbitrary system commands
