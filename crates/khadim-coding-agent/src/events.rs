use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AgentStreamEvent {
    /// Optional workspace scope (set by desktop app, empty for CLI).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// Optional session identifier (set by desktop app, empty for CLI).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub event_type: String,
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

impl AgentStreamEvent {
    /// Create a simple event without workspace/session scope (for CLI usage).
    pub fn new(event_type: impl Into<String>) -> Self {
        Self {
            workspace_id: None,
            session_id: None,
            event_type: event_type.into(),
            content: None,
            metadata: None,
        }
    }

    /// Create an event scoped to a workspace and session (for desktop usage).
    pub fn scoped(
        workspace_id: impl Into<String>,
        session_id: impl Into<String>,
        event_type: impl Into<String>,
    ) -> Self {
        Self {
            workspace_id: Some(workspace_id.into()),
            session_id: Some(session_id.into()),
            event_type: event_type.into(),
            content: None,
            metadata: None,
        }
    }

    pub fn with_content(mut self, content: impl Into<String>) -> Self {
        self.content = Some(content.into());
        self
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}
