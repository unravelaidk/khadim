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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn new_session_has_empty_defaults() {
        let session = KhadimSession::new(PathBuf::from("/tmp"));
        assert_eq!(session.cwd, PathBuf::from("/tmp"));
        assert!(session.messages.is_empty());
        assert!(session.workspace_id.is_empty());
        assert!(session.system_prompt_override.is_none());
        assert!(session.active_conversation_id.is_none());
        assert!(session.active_agent_id.is_none());
        // UUID is non-empty
        assert!(!session.id.is_empty());
    }

    #[test]
    fn with_workspace_sets_id() {
        let session = KhadimSession::new(PathBuf::from("/tmp"))
            .with_workspace("workspace-abc");
        assert_eq!(session.workspace_id, "workspace-abc");
    }

    #[test]
    fn with_system_prompt_stores_prompt() {
        let session = KhadimSession::new(PathBuf::from("/tmp"))
            .with_system_prompt(Some("You are a helper.".to_string()));
        assert_eq!(session.system_prompt_override.as_deref(), Some("You are a helper."));
    }

    #[test]
    fn with_system_prompt_rejects_empty_string() {
        let session = KhadimSession::new(PathBuf::from("/tmp"))
            .with_system_prompt(Some("   ".to_string()));
        assert!(session.system_prompt_override.is_none());
    }

    #[test]
    fn with_system_prompt_accepts_none() {
        let session = KhadimSession::new(PathBuf::from("/tmp"))
            .with_system_prompt(None);
        assert!(session.system_prompt_override.is_none());
    }

    #[test]
    fn with_conversation_and_agent_set_ids() {
        let session = KhadimSession::new(PathBuf::from("/tmp"))
            .with_conversation(Some("conv-1".to_string()))
            .with_agent(Some("agent-2".to_string()));
        assert_eq!(session.active_conversation_id.as_deref(), Some("conv-1"));
        assert_eq!(session.active_agent_id.as_deref(), Some("agent-2"));
    }
}
