//! Shared tool trait and types for the Khadim agent system.
//!
//! The `Tool` trait is the core abstraction for all agent tools.
//! It lives in `khadim-ai-core` so that both the coding agent
//! and future domain agents (RPA, connectors) can depend on it
//! without circular dependencies.

use crate::error::AppError;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

/// Definition of a tool's interface, used to tell the LLM what tools are available.
#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub prompt_snippet: String,
}

/// Result returned by a tool execution.
#[derive(Debug, Clone)]
pub struct ToolResult {
    pub content: String,
    /// Optional metadata attached to the result (e.g. for UI enrichment).
    pub metadata: Option<Value>,
}

impl ToolResult {
    /// Create a simple text result with no metadata.
    pub fn text(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            metadata: None,
        }
    }

    /// Create a result with metadata.
    pub fn with_metadata(content: impl Into<String>, metadata: Value) -> Self {
        Self {
            content: content.into(),
            metadata: Some(metadata),
        }
    }
}

/// The core trait that all agent tools must implement.
///
/// Tools are the building blocks of agent capabilities. Each tool
/// has a name, description, parameter schema, and an async execute
/// method that takes a JSON value and returns a string result.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Return the tool's definition (name, description, parameters, prompt snippet).
    fn definition(&self) -> ToolDefinition;

    /// Execute the tool with the given JSON input and return the result.
    async fn execute(&self, input: Value) -> Result<ToolResult, AppError>;
}

/// A boxable, shareable tool type.
pub type DynTool = Arc<dyn Tool>;