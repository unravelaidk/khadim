# Khadim Plugin System

Khadim supports a WASM-based plugin system that lets anyone extend the agent with custom tools. Plugins are sandboxed WebAssembly modules that run inside the desktop app with controlled access to the filesystem, network, and persistent storage. Plugins can also optionally contribute desktop UI tabs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Khadim Desktop App                        │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Agent       │    │  Plugin      │    │  WASM Host    │  │
│  │  Orchestrator│◄──►│  Bridge      │◄──►│  (wasmtime)   │  │
│  │              │    │  (Tool trait) │    │               │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                  │          │
│                                          ┌───────▼───────┐  │
│                                          │  Sandboxed    │  │
│                                          │  WASM Plugin  │  │
│                                          │  (.wasm file) │  │
│                                          └───────────────┘  │
│                                                             │
│  Host Imports:                                              │
│    • host-fs    (sandboxed file I/O)                        │
│    • host-http  (allowlisted HTTP)                          │
│    • host-log   (structured logging)                        │
│    • host-store (persistent KV storage)                     │
│    • host-config (plugin configuration)                     │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

1. **Plugin Discovery** — On startup, the app scans `~/.local/share/khadim/plugins/` for directories containing a `plugin.toml` manifest.

2. **Loading** — Enabled plugins are compiled from `.wasm` to native code via `wasmtime`, then initialized with their config.

3. **Tool Registration** — Each plugin exports a list of tools. These are bridged into the same `Tool` trait that built-in tools use.

4. **Execution** — When the agent calls a plugin tool, the orchestrator delegates to the WASM runtime. The plugin runs in a sandboxed environment with only the permissions it declared.

5. **Namespacing** — Plugin tools are namespaced as `plugin.{plugin-id}.{tool-name}` to avoid collisions with built-in tools.

6. **Optional UI Tabs** — A plugin may ship a `ui.js` bundle and declare `[[ui.tabs]]` entries. The desktop host loads that bundle and mounts the declared custom elements into the sidebar and main content areas.

## Creating a Plugin

### 1. Set up the project

```bash
cargo new --lib my-plugin
cd my-plugin
```

Add to `Cargo.toml`:

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
khadim-plugin-sdk = { git = "https://github.com/khadim/khadim", path = "crates/khadim-plugin-sdk" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### 2. Implement the plugin

```rust
use khadim_plugin_sdk::prelude::*;

#[derive(Default)]
struct MyPlugin;

impl KhadimPlugin for MyPlugin {
    fn info(&self) -> PluginInfo {
        PluginInfo {
            name: "my-plugin".into(),
            version: "0.1.0".into(),
            description: "Does something useful".into(),
            author: "You".into(),
            ..Default::default()
        }
    }

    fn tools(&self) -> Vec<ToolDef> {
        vec![ToolDef {
            name: "do_thing".into(),
            description: "Does a useful thing".into(),
            params: vec![
                ToolParam::required("input", "string", "The input to process"),
            ],
            prompt_snippet: "- do_thing: Does a useful thing with the given input".into(),
        }]
    }

    fn execute(&mut self, tool: &str, args: Value) -> ToolResult {
        match tool {
            "do_thing" => {
                let input = args["input"].as_str().unwrap_or("");
                ToolResult::ok(format!("Processed: {input}"))
            }
            _ => ToolResult::error(format!("Unknown tool: {tool}")),
        }
    }
}

export_plugin!(MyPlugin);
```

### 3. Build it

```bash
cargo build --target wasm32-unknown-unknown --release
```

### 4. Create the manifest

Create `plugin.toml` in your plugin directory:

```toml
[plugin]
name = "my-plugin"
version = "0.1.0"
description = "Does something useful"
author = "You"
wasm = "target/wasm32-unknown-unknown/release/my_plugin.wasm"

[permissions]
fs = false
http = false
store = false

[ui]
js = "ui.js"

[[ui.tabs]]
label = "My Tool"
icon = "sparkles"
sidebar_element = "my-plugin-sidebar"
content_element = "my-plugin-content"
priority = 100
```

### 5. Install it

Copy the plugin directory (containing `plugin.toml` and the `.wasm` file) to `~/.local/share/khadim/plugins/my-plugin/`.

Or use the app UI to install from a directory.

## Plugin Manifest Reference

```toml
[plugin]
name = "my-plugin"              # Required. Unique plugin identifier.
version = "0.1.0"               # Required. Semver version.
description = "What it does"    # Required. Short description.
author = "Author Name"          # Author name.
license = "MIT"                 # SPDX license identifier.
homepage = "https://..."        # Project URL.
wasm = "plugin.wasm"            # Path to .wasm file (relative to manifest).
min_host_version = "0.1.0"      # Minimum Khadim version required.

# Configuration fields the plugin declares.
# Users set these via the Plugin Settings UI.
[[config]]
key = "api_key"
description = "API key for the service"
field_type = "secret"           # "string", "secret", "boolean", "number"
required = true

[[config]]
key = "max_results"
description = "Maximum results"
field_type = "number"
required = false
default_value = "10"

# Permissions the plugin requests.
[permissions]
fs = false                      # Filesystem access (scoped to workspace).
http = true                     # Outbound HTTP requests.
store = true                    # Persistent key-value storage.
allowed_hosts = [               # HTTP allowlist (only when http = true).
    "api.example.com",
    "*.openai.com",
]

[ui]
js = "ui.js"                   # Optional desktop UI bundle.

[[ui.tabs]]
label = "Calendar"             # Tab label shown by the desktop host.
icon = "calendar"              # Optional host icon name.
sidebar_element = "my-sidebar" # Optional custom element for the sidebar area.
content_element = "my-content" # Optional custom element for the main content area.
priority = 10                   # Lower numbers sort first. Default 100.
```

The desktop host serves plugin UI assets from `khadim-plugin://{plugin-id}/...`, and your `ui.js` bundle should register the custom elements referenced by `sidebar_element` and `content_element`.

## SDK Reference

### `KhadimPlugin` Trait

| Method | Required | Description |
|--------|----------|-------------|
| `info()` | Yes | Return plugin metadata |
| `config_schema()` | No | Declare configuration fields |
| `initialize(config)` | No | Called once after loading with user config |
| `tools()` | Yes | Return list of tool definitions |
| `execute(name, args)` | Yes | Execute a named tool |

### `ToolParam` Helpers

```rust
ToolParam::required("name", "string", "description")
ToolParam::optional("name", "string", "description")
ToolParam::with_default("name", "number", "description", "42")
```

### `ToolResult` Constructors

```rust
ToolResult::ok("success message")
ToolResult::ok_with_metadata("message", json!({ "key": "value" }))
ToolResult::error("error message")
```

### `ConfigField` Helpers

```rust
ConfigField::string("key", "description", required)
ConfigField::secret("key", "description")
ConfigField::boolean("key", "description", default_value)
```

## Host Imports (Available Inside WASM)

When building for `wasm32-unknown-unknown`, the SDK provides access to host functions:

```rust
use khadim_plugin_sdk::host;

// Filesystem (requires fs permission)
let content = host::read_file("src/main.rs")?;

// Logging (always available)
host::log_info("Processing started");
host::log_warn("Rate limit approaching");
host::log_error("Request failed");
```

## Permission Model

Plugins run in a sandboxed WASM environment. They can only access resources they declare in their manifest:

| Permission | What it grants |
|-----------|----------------|
| `fs = true` | Read/write files within the workspace root |
| `http = true` | Make HTTP requests to `allowed_hosts` |
| `store = true` | Persistent key-value storage scoped to the plugin |

Plugins **cannot**:
- Access the filesystem outside the workspace
- Make HTTP requests to hosts not in their allowlist
- Access other plugins' storage
- Execute arbitrary system commands
- Access the user's API keys (unless passed via config)

## Frontend API

The TypeScript bindings expose plugin management:

```typescript
import { commands } from './lib/bindings';

// List all plugins
const plugins = await commands.pluginList();

// Enable/disable
await commands.pluginEnable('my-plugin', '/path/to/workspace');
await commands.pluginDisable('my-plugin');

// Install from directory
await commands.pluginInstall('/path/to/plugin/dir');

// List all tools from enabled plugins
const tools = await commands.pluginListTools();

// Configure
await commands.pluginSetConfig('my-plugin', 'api_key', 'sk-...');
const val = await commands.pluginGetConfig('my-plugin', 'api_key');

// Get plugins directory
const dir = await commands.pluginDir();
```

## Examples

See `examples/plugins/` for complete examples:

- **hello-world** — Minimal plugin with three simple tools
- **web-search** — Web search plugin demonstrating HTTP permissions and config
- **obsidian-wiki** — Obsidian vault helper for bootstrapping and maintaining an LLM-authored wiki

Desktop UI examples live in `apps/desktop/plugins/`:

- **calendar** — Declares a plugin tab with both sidebar and content custom elements
- **pomodoro** — Declares a richer productivity UI tab with sidebar and content panels

## Roadmap

- [ ] Component Model support (WIT-based typed imports/exports)
- [ ] Plugin marketplace / registry
- [ ] Hot-reload on `.wasm` file change
- [ ] Plugin-to-plugin communication
- [x] UI extension points (custom panels, sidebar widgets)
- [ ] Streaming tool results (progress callbacks)
