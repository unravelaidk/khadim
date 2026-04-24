use crate::khadim_ai::types::ChatMessage;
use std::path::PathBuf;

pub struct KhadimSession {
    pub id: String,
    pub workspace_id: String,
    pub cwd: PathBuf,
    pub active_conversation_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub messages: Vec<ChatMessage>,
    /// When set, the orchestrator uses this as the session's system prompt
    /// instead of the default mode prompt. Used by Agent Builder and other
    /// non-coding flows that need a purely conversational system prompt.
    pub system_prompt_override: Option<String>,
}

impl KhadimSession {
    pub fn new(workspace_id: String, cwd: PathBuf) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id,
            cwd,
            active_conversation_id: None,
            active_agent_id: None,
            messages: Vec::new(),
            system_prompt_override: None,
        }
    }

    pub fn with_system_prompt(mut self, prompt: Option<String>) -> Self {
        self.system_prompt_override = prompt.filter(|s| !s.trim().is_empty());
        self
    }
}
