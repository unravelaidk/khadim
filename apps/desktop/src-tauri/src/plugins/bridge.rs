//! Bridge between the WASM plugin system and the native `Tool` trait.
//!
//! Each WASM plugin tool is wrapped into an `Arc<dyn Tool>` so the orchestrator
//! can use it exactly like a built-in tool.
//!
//! When a tool call emits UI events (via `host-ui::emit-event`), this bridge
//! forwards them to the Tauri event bus as `plugin-ui-event` payloads so the
//! frontend can react without polling.

use crate::error::AppError;
use crate::khadim_code::tools::{Tool, ToolDefinition, ToolResult};
use crate::plugins::manager::PluginManager;
use crate::plugins::wasm_host::{PluginUiEvent, WasmToolDef};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// A WASM plugin tool wrapped as a native `Tool`.
pub struct PluginTool {
    plugin_id: String,
    tool_def: WasmToolDef,
    manager: Arc<PluginManager>,
    app: AppHandle,
}

impl PluginTool {
    pub fn new(
        plugin_id: String,
        tool_def: WasmToolDef,
        manager: Arc<PluginManager>,
        app: AppHandle,
    ) -> Self {
        Self {
            plugin_id,
            tool_def,
            manager,
            app,
        }
    }
}

#[async_trait]
impl Tool for PluginTool {
    fn definition(&self) -> ToolDefinition {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();

        for param in &self.tool_def.params {
            let mut prop = serde_json::Map::new();
            prop.insert("type".to_string(), json!(param.param_type));
            prop.insert("description".to_string(), json!(param.description));
            if let Some(ref default) = param.default_value {
                if let Ok(val) = serde_json::from_str::<Value>(default) {
                    prop.insert("default".to_string(), val);
                }
            }
            properties.insert(param.name.clone(), Value::Object(prop));
            if param.required {
                required.push(param.name.clone());
            }
        }

        let parameters = json!({
            "type": "object",
            "properties": properties,
            "required": required,
        });

        ToolDefinition {
            name: format!(
                "plugin_{}_{}",
                self.plugin_id.replace(['.', '-'], "_"),
                self.tool_def.name.replace(['.', '-'], "_")
            ),
            description: format!("[Plugin: {}] {}", self.plugin_id, self.tool_def.description),
            parameters,
            prompt_snippet: self.tool_def.prompt_snippet.clone(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let result = self
            .manager
            .execute_tool(&self.plugin_id, &self.tool_def.name, &input)?;

        // Forward any UI events to the frontend via Tauri event bus.
        for (event_name, data) in &result.ui_events {
            let payload = PluginUiEvent {
                plugin_id: self.plugin_id.clone(),
                event: event_name.clone(),
                data: data.clone(),
            };
            if let Err(e) = self.app.emit("plugin-ui-event", &payload) {
                log::warn!(
                    "[plugin:{}] Failed to emit UI event '{}': {e}",
                    self.plugin_id,
                    event_name
                );
            }
        }

        if result.is_error {
            return Err(AppError::invalid_input(result.content));
        }

        Ok(ToolResult {
            content: result.content,
            metadata: result.metadata.and_then(|m| serde_json::from_str(&m).ok()),
        })
    }
}

/// Collect all enabled plugin tools as `Arc<dyn Tool>`.
pub fn collect_plugin_tools(manager: &Arc<PluginManager>, app: &AppHandle) -> Vec<Arc<dyn Tool>> {
    let plugin_tools = manager.all_plugin_tools();
    log::info!(
        "Collecting plugin tools: {} tool(s) from enabled plugins",
        plugin_tools.len()
    );
    plugin_tools
        .into_iter()
        .map(|info| {
            log::info!(
                "  Registering plugin tool: plugin_{}_{}",
                info.plugin_id,
                info.tool.name
            );
            Arc::new(PluginTool::new(
                info.plugin_id,
                info.tool,
                Arc::clone(manager),
                app.clone(),
            )) as Arc<dyn Tool>
        })
        .collect()
}
