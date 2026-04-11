---
title: Manifest Reference
description: The `plugin.toml` file declares plugin metadata, config schema, sandbox permissions, and optional UI tabs.
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

The manifest is also where you declare the plugin's tools, configuration, permission surface, and optional desktop UI integration.

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

## UI tabs

Desktop plugins can optionally ship a UI bundle and register one or more chat-area tabs.

Use a top-level `[ui]` table for the browser bundle, then add one or more `[[ui.tabs]]` entries:

```toml
[ui]
js = "ui.js"

[[ui.tabs]]
label = "Calendar"
icon = "calendar"
sidebar_element = "khadim-calendar-sidebar"
content_element = "khadim-calendar-content"
priority = 10
```

Supported fields:

- `ui.js`: path to the JS bundle relative to the plugin directory. This bundle should register the custom elements referenced by the tab entries.
- `label`: visible tab label.
- `icon`: host icon name.
- `sidebar_element`: optional custom element that owns the full sidebar panel for the tab.
- `content_element`: optional custom element that owns the full main content panel for the tab.
- `priority`: optional ordering hint. Lower numbers render first. Default is `100`.

You can omit either element:

- Without `sidebar_element`, the tab does not render extra sidebar UI.
- Without `content_element`, the default chat view stays visible.

The desktop host serves plugin UI assets from `khadim-plugin://{plugin-id}/...`, so the bundle can be loaded without giving the webview direct filesystem access.
