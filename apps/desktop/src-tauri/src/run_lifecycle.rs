use crate::backend::AgentStreamEvent;
use crate::db::ChatMessage;
use crate::error::AppError;
use crate::opencode::{OpenCodeConnection, OpenCodeManager};
use crate::AppState;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub(crate) fn extract_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(items) => items
            .iter()
            .map(extract_text)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(map) => {
            for key in ["content", "text", "message", "output"] {
                if let Some(value) = map.get(key) {
                    let text = extract_text(value);
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

fn extract_message_parts_text(parts: &[serde_json::Value]) -> String {
    parts
        .iter()
        .filter_map(|part| {
            let part_type = part.get("type").and_then(|value| value.as_str())?;
            match part_type {
                "text" | "reasoning" => part.get("text").and_then(|value| value.as_str()),
                "tool" => part
                    .get("state")
                    .and_then(|value| value.get("output"))
                    .and_then(|value| value.as_str()),
                _ => None,
            }
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn extract_assistant_message(
    payload: &serde_json::Value,
    preferred_message_id: Option<&str>,
) -> Option<(String, Option<String>)> {
    let messages = payload
        .as_array()
        .or_else(|| payload.get("messages").and_then(|value| value.as_array()))?;

    let message = if let Some(preferred_message_id) = preferred_message_id {
        messages.iter().find(|message| {
            message
                .get("info")
                .and_then(|value| value.get("id"))
                .and_then(|value| value.as_str())
                == Some(preferred_message_id)
                && message
                    .get("info")
                    .and_then(|value| value.get("role"))
                    .and_then(|value| value.as_str())
                    == Some("assistant")
        })?
    } else {
        let message = messages.last()?;
        let role = message
            .get("info")
            .and_then(|value| value.get("role"))
            .and_then(|value| value.as_str())?;
        if role != "assistant" {
            return None;
        }
        message
    };

    let parts = message
        .get("parts")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let content_from_parts = extract_message_parts_text(&parts);
    let content = if !content_from_parts.trim().is_empty() {
        content_from_parts
    } else {
        message
            .get("info")
            .map(extract_text)
            .filter(|value| !value.trim().is_empty())?
    };

    Some((
        content,
        serde_json::to_string(message)
            .ok()
            .filter(|value| !value.is_empty()),
    ))
}

async fn fetch_assistant_message_with_retry(
    conn: &OpenCodeConnection,
    session_id: &str,
    preferred_message_id: Option<&str>,
) -> Option<(String, Option<String>)> {
    for attempt in 0..12 {
        let result = OpenCodeManager::list_messages(conn, session_id)
            .await
            .ok()
            .and_then(|payload| extract_assistant_message(&payload, preferred_message_id));

        if result.is_some() {
            return result;
        }

        if attempt < 11 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }

    None
}

pub(crate) fn persist_user_message(
    state: &Arc<AppState>,
    conversation_id: &str,
    content: &str,
) -> Result<(), AppError> {
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "user".to_string(),
        content: content.to_string(),
        metadata: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&user_msg)
}

pub(crate) fn persist_assistant_message(
    state: &Arc<AppState>,
    conversation_id: &str,
    content: &str,
    metadata: Option<String>,
) -> Result<(), AppError> {
    let assistant_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "assistant".to_string(),
        content: content.to_string(),
        metadata,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&assistant_msg)
}

pub(crate) async fn persist_streamed_assistant_message(
    state: &Arc<AppState>,
    conn: &OpenCodeConnection,
    session_id: &str,
    conversation_id: &str,
    streamed_content: &str,
    terminal_event: &AgentStreamEvent,
    assistant_message_id: Option<&str>,
) -> Result<(), AppError> {
    let remote_message =
        fetch_assistant_message_with_retry(conn, session_id, assistant_message_id).await;

    let (content, metadata) = match remote_message {
        Some((content, metadata)) => (content, metadata),
        None => {
            let fallback = streamed_content.trim();
            if fallback.is_empty() {
                return Ok(());
            }

            let metadata = (terminal_event.event_type == "error").then(|| {
                json!({
                    "source": "stream_fallback",
                    "terminal_event": terminal_event.event_type,
                    "error": terminal_event.content,
                })
                .to_string()
            });

            (fallback.to_string(), metadata)
        }
    };

    persist_assistant_message(state, conversation_id, &content, metadata)
}

pub(crate) struct StreamAccumulator {
    full_content: String,
    thinking_steps: Vec<Value>,
    terminal_event: Option<AgentStreamEvent>,
}

impl StreamAccumulator {
    pub(crate) fn new() -> Self {
        Self {
            full_content: String::new(),
            thinking_steps: Vec::new(),
            terminal_event: None,
        }
    }

    pub(crate) fn push_text_delta(&mut self, content: Option<&str>) {
        if let Some(text) = content {
            self.full_content.push_str(text);
        }
    }

    pub(crate) fn upsert_step(&mut self, step_id: &str, next_step: Value) {
        if let Some(index) = self
            .thinking_steps
            .iter()
            .position(|step| step.get("id").and_then(|value| value.as_str()) == Some(step_id))
        {
            self.thinking_steps[index] = next_step;
        } else {
            self.thinking_steps.push(next_step);
        }
    }

    pub(crate) fn current_step(&self, step_id: &str) -> Option<Value> {
        self.thinking_steps
            .iter()
            .find(|step| step.get("id").and_then(|value| value.as_str()) == Some(step_id))
            .cloned()
    }

    pub(crate) fn push_step(&mut self, step: Value) {
        self.thinking_steps.push(step);
    }

    pub(crate) fn set_terminal_event(&mut self, event: AgentStreamEvent) {
        self.terminal_event = Some(event);
    }

    pub(crate) fn has_terminal_event(&self) -> bool {
        self.terminal_event.is_some()
    }

    pub(crate) fn persist_assistant_if_any(
        &self,
        state: &Arc<AppState>,
        conversation_id: &str,
    ) -> Result<(), AppError> {
        if self.full_content.trim().is_empty() {
            return Ok(());
        }

        persist_assistant_message(
            state,
            conversation_id,
            &self.full_content,
            self.thinking_steps_metadata(),
        )
    }

    pub(crate) fn thinking_steps_metadata(&self) -> Option<String> {
        if self.thinking_steps.is_empty() {
            None
        } else {
            Some(json!({ "thinkingSteps": self.thinking_steps }).to_string())
        }
    }

    pub(crate) fn take_thinking_steps(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.thinking_steps)
    }

    pub(crate) fn emit_terminal_events(
        self,
        app: &AppHandle,
        workspace_id: String,
        session_id: String,
    ) {
        if let Some(event) = self.terminal_event {
            let is_error = event.event_type == "error";
            let _ = app.emit("agent-stream", &event);
            if is_error {
                let _ = app.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id,
                        session_id,
                        event_type: "done".to_string(),
                        content: None,
                        metadata: None,
                    },
                );
            }
        }
    }
}

pub(crate) fn emit_error_and_done(
    app: &AppHandle,
    workspace_id: String,
    session_id: String,
    message: String,
) {
    let _ = app.emit(
        "agent-stream",
        &AgentStreamEvent {
            workspace_id: workspace_id.clone(),
            session_id: session_id.clone(),
            event_type: "error".to_string(),
            content: Some(message),
            metadata: None,
        },
    );
    let _ = app.emit(
        "agent-stream",
        &AgentStreamEvent {
            workspace_id,
            session_id,
            event_type: "done".to_string(),
            content: None,
            metadata: None,
        },
    );
}
