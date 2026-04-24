use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type Provider = String;
pub type Api = String;

#[derive(Debug, Clone, Copy)]
pub enum InputKind {
    Text,
    Image,
}

#[derive(Debug, Clone, Default)]
pub struct OpenAiCompat {
    pub supports_reasoning_effort: bool,
    pub supports_store: bool,
    pub supports_usage_in_streaming: bool,
    pub max_tokens_field: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelSelection {
    pub provider: Provider,
    pub model_id: String,
    pub display_name: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

/// Per-million-token pricing for a model, in USD. Mirrors pi-mono's
/// `model.cost = { input, output, cacheRead, cacheWrite }` shape.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Cost {
    /// USD per 1M input (prompt) tokens.
    pub input: f64,
    /// USD per 1M output (completion) tokens.
    pub output: f64,
    /// USD per 1M cache-read tokens.
    pub cache_read: f64,
    /// USD per 1M cache-write (cache-creation) tokens.
    pub cache_write: f64,
}

#[derive(Debug, Clone)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub api: Api,
    pub provider: Provider,
    pub base_url: String,
    pub reasoning: bool,
    pub input: Vec<InputKind>,
    pub context_window: u64,
    pub max_tokens: u64,
    pub headers: HashMap<String, String>,
    pub openai_compat: Option<OpenAiCompat>,
    /// Per-million-token pricing. Zero when unknown.
    pub cost: Cost,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum ChatMessage {
    System {
        content: String,
    },
    User {
        content: String,
    },
    Assistant {
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        tool_calls: Vec<ToolCall>,
        /// Reasoning/thinking content returned by reasoning models (e.g. Kimi, DeepSeek).
        /// Must be replayed in the conversation history for providers that require it.
        #[serde(skip_serializing_if = "Option::is_none", default)]
        reasoning_content: Option<String>,
    },
    Tool(ToolMessage),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMessage {
    pub content: String,
    pub tool_call_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    pub arguments: String,
}

pub use crate::tools::ToolDefinition;

#[derive(Debug, Clone)]
pub struct Context {
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolDefinition>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Usage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

#[derive(Debug, Clone)]
pub enum AssistantStreamEvent {
    Start,
    TextStart,
    TextDelta(String),
    TextEnd(String),
    ThinkingStart,
    ThinkingDelta(String),
    ThinkingEnd(String),
    ToolCallStart {
        id: String,
        name: String,
    },
    ToolCallDelta {
        id: String,
        name: String,
        arguments: String,
    },
    ToolCallEnd(ToolCall),
    Usage(Usage),
    Done,
    Error(String),
}

#[derive(Debug, Clone)]
pub struct CompletionResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub usage: Usage,
    /// Reasoning/thinking content from reasoning models. Preserved so it can
    /// be included in the conversation history on subsequent turns.
    pub reasoning_content: Option<String>,
}
