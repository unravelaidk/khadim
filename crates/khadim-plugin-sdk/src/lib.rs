//! # Khadim Plugin SDK
//!
//! Build WASM plugins for the Khadim desktop app.
//!
//! ## Quick Start
//!
//! ```rust,ignore
//! use khadim_plugin_sdk::prelude::*;
//!
//! struct MyPlugin;
//!
//! impl KhadimPlugin for MyPlugin {
//!     fn info(&self) -> PluginInfo {
//!         PluginInfo {
//!             name: "my-plugin".into(),
//!             version: "0.1.0".into(),
//!             description: "My custom tool".into(),
//!             author: "Me".into(),
//!             ..Default::default()
//!         }
//!     }
//!
//!     fn tools(&self) -> Vec<ToolDef> {
//!         vec![ToolDef {
//!             name: "greet".into(),
//!             description: "Say hello".into(),
//!             params: vec![
//!                 Param::required("name", "string", "Who to greet"),
//!             ],
//!             prompt_snippet: "- greet: Say hello to someone".into(),
//!         }]
//!     }
//!
//!     fn execute(&mut self, tool: &str, args: serde_json::Value) -> ToolResult {
//!         match tool {
//!             "greet" => {
//!                 let name = args["name"].as_str().unwrap_or("world");
//!                 ToolResult::ok(format!("Hello, {name}!"))
//!             }
//!             _ => ToolResult::error(format!("Unknown tool: {tool}")),
//!         }
//!     }
//! }
//!
//! export_plugin!(MyPlugin);
//! ```
//!
//! Build with:
//! ```sh
//! cargo build --target wasm32-unknown-unknown --release
//! ```

use serde::{Deserialize, Serialize};

// ── Core types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub min_host_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub params: Vec<ToolParam>,
    pub prompt_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParam {
    pub name: String,
    pub description: String,
    pub param_type: String,
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<String>,
}

impl ToolParam {
    /// Create a required parameter.
    pub fn required(name: &str, param_type: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            param_type: param_type.to_string(),
            required: true,
            default_value: None,
        }
    }

    /// Create an optional parameter.
    pub fn optional(name: &str, param_type: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            param_type: param_type.to_string(),
            required: false,
            default_value: None,
        }
    }

    /// Create an optional parameter with a default value.
    pub fn with_default(name: &str, param_type: &str, description: &str, default: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            param_type: param_type.to_string(),
            required: false,
            default_value: Some(default.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigField {
    pub key: String,
    pub description: String,
    #[serde(default = "default_field_type")]
    pub field_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<String>,
}

fn default_field_type() -> String {
    "string".to_string()
}

impl ConfigField {
    pub fn string(key: &str, description: &str, required: bool) -> Self {
        Self {
            key: key.to_string(),
            description: description.to_string(),
            field_type: "string".to_string(),
            required,
            default_value: None,
        }
    }

    pub fn secret(key: &str, description: &str) -> Self {
        Self {
            key: key.to_string(),
            description: description.to_string(),
            field_type: "secret".to_string(),
            required: true,
            default_value: None,
        }
    }

    pub fn boolean(key: &str, description: &str, default: bool) -> Self {
        Self {
            key: key.to_string(),
            description: description.to_string(),
            field_type: "boolean".to_string(),
            required: false,
            default_value: Some(default.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub content: String,
    pub is_error: bool,
    #[serde(default)]
    pub metadata: Option<String>,
}

impl ToolResult {
    /// Successful result.
    pub fn ok(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            is_error: false,
            metadata: None,
        }
    }

    /// Successful result with metadata.
    pub fn ok_with_metadata(content: impl Into<String>, metadata: serde_json::Value) -> Self {
        Self {
            content: content.into(),
            is_error: false,
            metadata: serde_json::to_string(&metadata).ok(),
        }
    }

    /// Error result.
    pub fn error(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            is_error: true,
            metadata: None,
        }
    }
}

// ── Plugin trait ─────────────────────────────────────────────────────

/// The main trait plugin authors implement.
pub trait KhadimPlugin {
    /// Return plugin metadata.
    fn info(&self) -> PluginInfo;

    /// Declare configuration fields (optional).
    fn config_schema(&self) -> Vec<ConfigField> {
        Vec::new()
    }

    /// Called once after loading with user-provided config.
    fn initialize(&mut self, _config: serde_json::Value) -> Result<(), String> {
        Ok(())
    }

    /// Return the tools this plugin provides.
    fn tools(&self) -> Vec<ToolDef>;

    /// Execute a named tool.
    fn execute(&mut self, tool_name: &str, args: serde_json::Value) -> ToolResult;
}

// ── Host function imports (available inside WASM) ────────────────────

#[cfg(target_arch = "wasm32")]
pub mod host {
    extern "C" {
        // Filesystem
        fn __host_read_file(path_ptr: *const u8, path_len: u32, out_ptr: *mut *const u8, out_len: *mut u32) -> i32;
        fn __host_write_file(path_ptr: *const u8, path_len: u32, content_ptr: *const u8, content_len: u32) -> i32;
        fn __host_list_dir(path_ptr: *const u8, path_len: u32, out_ptr: *mut *const u8, out_len: *mut u32) -> i32;
        fn __host_path_exists(path_ptr: *const u8, path_len: u32) -> i32;

        // HTTP
        fn __host_http_request(
            method_ptr: *const u8, method_len: u32,
            url_ptr: *const u8, url_len: u32,
            headers_ptr: *const u8, headers_len: u32,
            body_ptr: *const u8, body_len: u32,
            out_status: *mut u16,
            out_body_ptr: *mut *const u8, out_body_len: *mut u32,
        ) -> i32;

        // Logging
        fn __host_log(level: u32, msg_ptr: *const u8, msg_len: u32);

        // Key-value store
        fn __host_store_get(key_ptr: *const u8, key_len: u32, out_ptr: *mut *const u8, out_len: *mut u32) -> i32;
        fn __host_store_set(key_ptr: *const u8, key_len: u32, val_ptr: *const u8, val_len: u32);
        fn __host_store_delete(key_ptr: *const u8, key_len: u32);

        // Config
        fn __host_config_get(key_ptr: *const u8, key_len: u32, out_ptr: *mut *const u8, out_len: *mut u32) -> i32;
    }

    /// Read a file from the workspace.
    pub fn read_file(path: &str) -> Result<String, String> {
        unsafe {
            let mut out_ptr: *const u8 = std::ptr::null();
            let mut out_len: u32 = 0;
            let result = __host_read_file(
                path.as_ptr(), path.len() as u32,
                &mut out_ptr, &mut out_len,
            );
            if result != 0 {
                return Err("Failed to read file".into());
            }
            let slice = std::slice::from_raw_parts(out_ptr, out_len as usize);
            Ok(String::from_utf8_lossy(slice).to_string())
        }
    }

    /// Log a message at a given level.
    pub fn log(level: u32, msg: &str) {
        unsafe {
            __host_log(level, msg.as_ptr(), msg.len() as u32);
        }
    }

    pub fn log_info(msg: &str) { log(1, msg); }
    pub fn log_warn(msg: &str) { log(2, msg); }
    pub fn log_error(msg: &str) { log(3, msg); }
}

// ── Export macro ─────────────────────────────────────────────────────

/// Generate the WASM exports for a plugin.
///
/// Usage: `export_plugin!(MyPlugin);`
///
/// This creates a static mutable plugin instance and exports the
/// required `khadim_*` functions that the host calls.
#[macro_export]
macro_rules! export_plugin {
    ($plugin_type:ty) => {
        static mut PLUGIN: Option<$plugin_type> = None;

        fn get_plugin() -> &'static mut $plugin_type {
            unsafe {
                if PLUGIN.is_none() {
                    PLUGIN = Some(<$plugin_type>::default());
                }
                PLUGIN.as_mut().unwrap()
            }
        }

        /// Leak a String into linear memory, returning ptr|len packed into i64.
        /// High 32 bits = ptr, low 32 bits = len.
        fn leak_string(s: String) -> i64 {
            let bytes = s.into_bytes().into_boxed_slice();
            let len = bytes.len() as u32;
            let ptr = Box::into_raw(bytes) as *mut u8 as usize as u32;
            ((ptr as i64) << 32) | (len as i64)
        }

        // Simple allocator for the host to write into guest memory
        #[no_mangle]
        pub extern "C" fn __alloc(size: i32) -> i32 {
            let layout = std::alloc::Layout::from_size_align(size as usize, 1).unwrap();
            unsafe { std::alloc::alloc(layout) as usize as i32 }
        }

        // Return plugin info as JSON — returns i64 with ptr in high 32, len in low 32
        #[no_mangle]
        pub extern "C" fn khadim_info() -> i64 {
            let plugin = get_plugin();
            let info = plugin.info();
            let json = serde_json::to_string(&info).unwrap_or_else(|_| "{}".into());
            leak_string(json)
        }

        // Initialize with config JSON
        #[no_mangle]
        pub extern "C" fn khadim_initialize(config_ptr: i32, config_len: i32) -> i32 {
            let plugin = get_plugin();
            let config_bytes = unsafe {
                std::slice::from_raw_parts(config_ptr as usize as *const u8, config_len as usize)
            };
            let config: serde_json::Value = serde_json::from_slice(config_bytes)
                .unwrap_or(serde_json::Value::Object(Default::default()));
            match plugin.initialize(config) {
                Ok(()) => 0,
                Err(_) => 1,
            }
        }

        // List tools as JSON — returns i64 with ptr in high 32, len in low 32
        #[no_mangle]
        pub extern "C" fn khadim_list_tools() -> i64 {
            let plugin = get_plugin();
            let tools = plugin.tools();
            let json = serde_json::to_string(&tools).unwrap_or_else(|_| "[]".into());
            leak_string(json)
        }

        // Execute a tool: (name_ptr, name_len, args_ptr, args_len) -> i64 packed
        #[no_mangle]
        pub extern "C" fn khadim_execute_tool(
            name_ptr: i32,
            name_len: i32,
            args_ptr: i32,
            args_len: i32,
        ) -> i64 {
            let plugin = get_plugin();
            let name = unsafe {
                let slice = std::slice::from_raw_parts(
                    name_ptr as usize as *const u8,
                    name_len as usize,
                );
                String::from_utf8_lossy(slice).to_string()
            };
            let args = unsafe {
                let slice = std::slice::from_raw_parts(
                    args_ptr as usize as *const u8,
                    args_len as usize,
                );
                serde_json::from_slice(slice)
                    .unwrap_or(serde_json::Value::Object(Default::default()))
            };

            let result = plugin.execute(&name, args);
            let json = serde_json::to_string(&result).unwrap_or_else(|_| {
                r#"{"content":"serialization error","is_error":true}"#.into()
            });
            leak_string(json)
        }
    };
}

// ── Prelude ──────────────────────────────────────────────────────────

pub mod prelude {
    pub use crate::{
        export_plugin, ConfigField, KhadimPlugin, PluginInfo, ToolDef, ToolParam, ToolResult,
    };
    pub use serde_json::{self, json, Value};
}
