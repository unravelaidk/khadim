use khadim_ai_core::types::ChatMessage;
use std::path::PathBuf;

pub struct KhadimSession {
    pub id: String,
    pub cwd: PathBuf,
    pub messages: Vec<ChatMessage>,
    /// Workspace or scope identifier (e.g. "__chat__", "__agent_builder__", or workspace ID).
    pub workspace_id: String,
    /// When set, tracks the conversation this session belongs to.
    pub active_conversation_id: Option<String>,
    /// When set, tracks the agent this session is executing for.
    pub active_agent_id: Option<String>,
    /// When set, the orchestrator uses this as the session's system prompt
    /// instead of the default mode prompt. Used by Agent Builder and other
    /// non-coding flows that need a purely conversational system prompt.
    pub system_prompt_override: Option<String>,
}

impl KhadimSession {
    pub fn new(cwd: PathBuf) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            cwd,
            messages: Vec::new(),
            workspace_id: String::new(),
            active_conversation_id: None,
            active_agent_id: None,
            system_prompt_override: None,
        }
    }

    pub fn with_workspace(mut self, workspace_id: impl Into<String>) -> Self {
        self.workspace_id = workspace_id.into();
        self
    }

    pub fn with_system_prompt(mut self, prompt: Option<String>) -> Self {
        self.system_prompt_override = prompt.filter(|s| !s.trim().is_empty());
        self
    }

    pub fn with_conversation(mut self, conversation_id: Option<String>) -> Self {
        self.active_conversation_id = conversation_id;
        self
    }

    pub fn with_agent(mut self, agent_id: Option<String>) -> Self {
        self.active_agent_id = agent_id;
        self
    }
}
