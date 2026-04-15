//! Integration tool — lets agents call connected integrations as tools.
//!
//! When an agent has integrations available, each connected integration's
//! actions become callable tools. The agent sees tools like:
//!   - `integration_slack_send_message`
//!   - `integration_notion_search`
//!   - `integration_gmail_send`
//!
//! The tool bridges the call through the IntegrationRegistry.

use crate::error::AppError;
use crate::integrations::{ActionDef, IntegrationConnection, IntegrationRegistry};
use crate::khadim_code::tools::{Tool, ToolDefinition, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

/// A tool instance for one specific integration action on one connection.
pub struct IntegrationTool {
    registry: Arc<IntegrationRegistry>,
    connection: IntegrationConnection,
    action: ActionDef,
    /// Tool name exposed to the agent: `integration_{integration_id}_{action_suffix}`
    tool_name: String,
}

impl IntegrationTool {
    pub fn new(
        registry: Arc<IntegrationRegistry>,
        connection: IntegrationConnection,
        action: ActionDef,
    ) -> Self {
        // Convert "slack.send_message" → "integration_slack_send_message"
        let tool_name = format!(
            "integration_{}",
            action.id.replace('.', "_")
        );
        Self {
            registry,
            connection,
            action,
            tool_name,
        }
    }
}

#[async_trait]
impl Tool for IntegrationTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.tool_name.clone(),
            description: format!(
                "[{}] {}",
                self.connection.label,
                self.action.description
            ),
            parameters: self.action.input_schema.clone(),
            prompt_snippet: String::new(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let result = self
            .registry
            .execute_action(&self.connection.id, &self.action.id, input)
            .await?;

        if result.success {
            let content = result
                .output_text
                .or_else(|| result.data.map(|d| serde_json::to_string_pretty(&d).unwrap_or_default()))
                .unwrap_or_else(|| "Action completed successfully.".to_string());
            Ok(ToolResult {
                content,
                metadata: None,
            })
        } else {
            let err = result.error.unwrap_or_else(|| "Action failed".to_string());
            Ok(ToolResult {
                content: format!("Error: {err}"),
                metadata: None,
            })
        }
    }
}

/// Collect all integration tools for connected integrations.
///
/// Called by the orchestrator when building the tool set for an agent run.
/// Returns a Vec of Tool trait objects, one per action per connected integration.
pub fn collect_integration_tools(
    registry: &Arc<IntegrationRegistry>,
) -> Vec<Arc<dyn Tool>> {
    let connected = match registry.list_connections() {
        Ok(conns) => conns,
        Err(_) => return Vec::new(),
    };

    let rt = tokio::runtime::Handle::try_current();
    let integrations_map = match rt {
        Ok(handle) => {
            tokio::task::block_in_place(|| {
                handle.block_on(async {
                    let mut map = std::collections::HashMap::new();
                    for conn in &connected {
                        if !conn.is_active {
                            continue;
                        }
                        if let Some(integration) = registry.get(&conn.integration_id).await {
                            map.insert(conn.integration_id.clone(), integration.actions());
                        }
                    }
                    map
                })
            })
        }
        Err(_) => return Vec::new(),
    };

    let mut tools: Vec<Arc<dyn Tool>> = Vec::new();
    for conn in &connected {
        if !conn.is_active {
            continue;
        }
        if let Some(actions) = integrations_map.get(&conn.integration_id) {
            for action in actions {
                tools.push(Arc::new(IntegrationTool::new(
                    Arc::clone(registry),
                    conn.clone(),
                    action.clone(),
                )));
            }
        }
    }

    log::info!(
        "Collected {} integration tool(s) from {} connection(s)",
        tools.len(),
        connected.iter().filter(|c| c.is_active).count()
    );

    tools
}
