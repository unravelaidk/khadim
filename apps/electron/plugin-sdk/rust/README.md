# Rust plugin SDK

The Rust SDK generates Khadim's v1 core ABI and provides typed plugin metadata,
capabilities, and JSON operation dispatch.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Add the SDK

Reference the SDK from a plugin crate and compile the library as a `cdylib`.

```toml
[package]
name = "example-khadim-plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
khadim-plugin-sdk = { path = "../../plugin-sdk/rust" }
serde_json = "1"
```

Configure `wasm-ld` so the plugin imports the host-owned bounded memory.

```toml
# .cargo/config.toml
[target.wasm32-unknown-unknown]
rustflags = [
  "-C", "link-arg=--import-memory=khadim:host,memory",
  "-C", "link-arg=--export-memory",
  "-C", "link-arg=--initial-memory=4194304",
  "-C", "link-arg=--max-memory=16777216"
]
```

## Implement the plugin

Implement `Plugin`, then invoke `export_plugin!` once at the end of the crate.

```rust
use khadim_plugin_sdk::{
    export_plugin, Capabilities, HarnessCapability, Plugin, PluginInfo,
};
use serde_json::{json, Value};

struct ExamplePlugin;

impl Plugin for ExamplePlugin {
    fn info() -> PluginInfo {
        PluginInfo {
            id: "example.harness".into(),
            name: "Example".into(),
            version: "1.0.0".into(),
            api_version: 1,
        }
    }

    fn capabilities() -> Capabilities {
        Capabilities {
            harnesses: vec![HarnessCapability {
                id: "example".into(),
                name: "Example".into(),
                description: "Runs prompts through Example.".into(),
                icon: None,
            }],
        }
    }

    fn call(operation: &str, _input: Value) -> Result<Value, String> {
        match operation {
            "harness.health" => Ok(json!({
                "method": "GET",
                "path": "/health"
            })),
            _ => Err(format!("Unsupported operation: {operation}")),
        }
    }
}

export_plugin!(ExamplePlugin);
```

## Build the module

Install the target once, then create the release module from the plugin crate.

```sh
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

Copy the resulting `.wasm` file to the path named by
`khadim.plugin.json`. The [OpenCode plugin](../../plugins/builtin/opencode) is a
complete implementation and build reference.
