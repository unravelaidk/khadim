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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn new_event_has_no_scope() {
        let ev = AgentStreamEvent::new("text_delta");
        assert_eq!(ev.event_type, "text_delta");
        assert!(ev.workspace_id.is_none());
        assert!(ev.session_id.is_none());
        assert!(ev.content.is_none());
        assert!(ev.metadata.is_none());
    }

    #[test]
    fn scoped_event_carries_workspace_and_session() {
        let ev = AgentStreamEvent::scoped("ws-1", "sess-1", "done");
        assert_eq!(ev.workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(ev.session_id.as_deref(), Some("sess-1"));
        assert_eq!(ev.event_type, "done");
    }

    #[test]
    fn with_content_sets_content() {
        let ev = AgentStreamEvent::new("text_delta").with_content("hello");
        assert_eq!(ev.content.as_deref(), Some("hello"));
    }

    #[test]
    fn with_metadata_sets_metadata() {
        let ev = AgentStreamEvent::new("usage").with_metadata(json!({"input": 10}));
        assert_eq!(ev.metadata.unwrap()["input"], 10);
    }

    #[test]
    fn builder_methods_chain_without_mutation() {
        let base = AgentStreamEvent::new("step_start");
        let with_c = base.clone().with_content("running");
        // Original is untouched
        assert!(base.content.is_none());
        assert_eq!(with_c.content.as_deref(), Some("running"));
    }
}
