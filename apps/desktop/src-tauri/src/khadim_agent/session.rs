use crate::khadim_ai::types::ChatMessage;
use std::path::PathBuf;

pub struct KhadimSession {
    pub id: String,
    pub workspace_id: String,
    pub cwd: PathBuf,
    pub active_conversation_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub messages: Vec<ChatMessage>,
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
        }
    }
}
