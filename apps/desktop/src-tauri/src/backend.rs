use crate::error::AppError;
use crate::khadim_ai::models::CatalogModelOption;
use crate::opencode::{OpenCodeConnection, OpenCodeManager, OpenCodeModelOption, OpenCodeModelRef};
use crate::run_lifecycle::{
    persist_assistant_message, persist_streamed_assistant_message, persist_user_message,
};
use crate::AppState;
use async_trait::async_trait;
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Normalized streaming event emitted to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct AgentStreamEvent {
    pub workspace_id: String,
    pub session_id: String,
    pub event_type: String,
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct BackendPrompt {
    pub workspace_id: String,
    pub session_id: String,
    pub conversation_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub content: String,
    pub model: Option<OpenCodeModelRef>,
    pub system: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackendSessionCreated {
    pub id: String,
}

#[derive(Debug, Clone)]
pub enum BackendQuestionAnswer {
    OpenCode {
        request_id: String,
        answers: Vec<Vec<String>>,
    },
    Khadim {
        answer: String,
    },
    ClaudePermission {
        request_id: String,
        allow: bool,
        remember: bool,
    },
}

#[derive(Debug, Clone)]
pub struct StreamDrainResult {
    pub full_content: String,
    pub terminal_event: Option<AgentStreamEvent>,
    pub assistant_message_id: Option<String>,
    pub thinking_steps: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct ClaudeCodeBridgeEvent {
    event_type: String,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[async_trait]
pub trait Backend: Clone + Send + Sync + 'static {
    async fn create_session(
        &self,
        workspace_id: String,
        cwd_override: Option<String>,
        system_prompt_override: Option<String>,
    ) -> Result<BackendSessionCreated, AppError>;

    async fn list_models(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<Vec<OpenCodeModelOption>, AppError>;

    async fn start_stream(
        &self,
        prompt: BackendPrompt,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) -> Result<(), AppError>;

    async fn abort(&self, workspace_id: Option<&str>, session_id: &str) -> Result<(), AppError>;

    async fn answer_question(
        &self,
        workspace_id: Option<&str>,
        session_id: &str,
        answer: BackendQuestionAnswer,
    ) -> Result<(), AppError>;

    async fn finish_stream(&self, _session_id: &str) {}

    async fn persist_streamed_assistant(
        &self,
        state: &Arc<AppState>,
        conversation_id: &str,
        drain: &StreamDrainResult,
    ) -> Result<(), AppError> {
        if drain.full_content.trim().is_empty() {
            return Ok(());
        }

        let metadata = (!drain.thinking_steps.is_empty())
            .then(|| json!({ "thinkingSteps": drain.thinking_steps }).to_string());
        persist_assistant_message(state, conversation_id, &drain.full_content, metadata)
    }
}

pub async fn drain_backend_stream<F>(
    mut rx: mpsc::UnboundedReceiver<AgentStreamEvent>,
    mut emit: F,
) -> StreamDrainResult
where
    F: FnMut(&AgentStreamEvent),
{
    let mut full_content = String::new();
    let mut assistant_message_id: Option<String> = None;
    let mut terminal_event = None;
    let mut thinking_steps = Vec::<serde_json::Value>::new();

    while let Some(evt) = rx.recv().await {
        if evt.event_type == "message_start" {
            assistant_message_id = evt
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("messageId"))
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned);
        }

        if evt.event_type == "text_delta" {
            if let Some(ref text) = evt.content {
                full_content.push_str(text);
            }
        }

        if matches!(
            evt.event_type.as_str(),
            "step_start" | "step_update" | "step_complete"
        ) {
            if let Some(metadata) = evt.metadata.as_ref().and_then(|value| value.as_object()) {
                if let Some(step_id) = metadata.get("id").and_then(|value| value.as_str()) {
                    let mut next_step = thinking_steps
                        .iter()
                        .find(|step| {
                            step.get("id").and_then(|value| value.as_str()) == Some(step_id)
                        })
                        .cloned()
                        .unwrap_or_else(|| {
                            json!({
                                "id": step_id,
                                "title": metadata
                                    .get("title")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("Working"),
                                "status": "running",
                            })
                        });

                    if let Some(obj) = next_step.as_object_mut() {
                        for key in ["title", "tool", "result"] {
                            if let Some(value) = metadata.get(key).and_then(|value| value.as_str())
                            {
                                obj.insert(
                                    key.to_string(),
                                    serde_json::Value::String(value.to_string()),
                                );
                            }
                        }
                        if let Some(content) = evt
                            .content
                            .as_ref()
                            .filter(|value| !value.trim().is_empty())
                        {
                            obj.insert(
                                "content".to_string(),
                                serde_json::Value::String(content.clone()),
                            );
                            if evt.event_type == "step_complete" && !obj.contains_key("result") {
                                obj.insert(
                                    "result".to_string(),
                                    serde_json::Value::String(content.clone()),
                                );
                            }
                        }
                        let status = if evt.event_type == "step_complete" {
                            if metadata.get("is_error").and_then(|value| value.as_bool())
                                == Some(true)
                            {
                                "error"
                            } else {
                                "complete"
                            }
                        } else {
                            "running"
                        };
                        obj.insert(
                            "status".to_string(),
                            serde_json::Value::String(status.to_string()),
                        );
                    }

                    if let Some(index) = thinking_steps.iter().position(|step| {
                        step.get("id").and_then(|value| value.as_str()) == Some(step_id)
                    }) {
                        thinking_steps[index] = next_step;
                    } else {
                        thinking_steps.push(next_step);
                    }
                } else if evt.event_type == "step_complete" {
                    let mut step = serde_json::Value::Object(metadata.clone());
                    step["status"] = json!("complete");
                    if let Some(ref content) = evt.content {
                        if step.get("result").is_none() || step["result"].is_null() {
                            step["result"] = json!(content);
                        }
                        if step.get("content").is_none() || step["content"].is_null() {
                            step["content"] = json!(content);
                        }
                    }
                    thinking_steps.push(step);
                } else if evt.event_type == "step_start" {
                    let mut step = serde_json::Value::Object(metadata.clone());
                    step["status"] = json!("running");
                    thinking_steps.push(step);
                }
            }
        }

        let is_terminal = evt.event_type == "done" || evt.event_type == "error";
        if is_terminal {
            terminal_event = Some(evt.clone());
        }

        emit(&evt);

        if is_terminal {
            break;
        }
    }

    StreamDrainResult {
        full_content,
        terminal_event,
        assistant_message_id,
        thinking_steps,
    }
}

pub async fn run_streaming_prompt<B>(
    state: Arc<AppState>,
    app: AppHandle,
    backend: B,
    prompt: BackendPrompt,
) -> Result<(), AppError>
where
    B: Backend,
{
    if let Some(conversation_id) = prompt.conversation_id.as_deref() {
        persist_user_message(&state, conversation_id, &prompt.content)?;
    }

    let (tx, rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let backend_for_finish = backend.clone();
    let app_handle = app.clone();
    let state_arc = state.clone();
    let conv_id = prompt.conversation_id.clone();
    let session_id = prompt.session_id.clone();

    backend.start_stream(prompt, tx).await?;

    tokio::spawn(async move {
        let mut terminal_to_emit = None;
        let drain = drain_backend_stream(rx, |evt| {
            if evt.event_type == "usage_update" {
                if let Some(ref meta) = evt.metadata {
                    let input = meta
                        .get("input_tokens")
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0);
                    let output = meta
                        .get("output_tokens")
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0);
                    if let Some(conv_id) = conv_id.as_deref() {
                        if let Err(error) = state_arc
                            .db
                            .update_conversation_tokens(conv_id, input, output)
                        {
                            log::warn!(
                                "failed to persist token usage for {conv_id}: {}",
                                error.message
                            );
                        }
                    }
                }
            }

            if evt.event_type == "done" || evt.event_type == "error" {
                terminal_to_emit = Some(evt.clone());
            } else {
                let _ = app_handle.emit("agent-stream", evt);
            }
        })
        .await;

        if let (Some(terminal_event), Some(conv_id)) =
            (drain.terminal_event.as_ref(), conv_id.as_deref())
        {
            if let Err(error) = backend_for_finish
                .persist_streamed_assistant(&state_arc, conv_id, &drain)
                .await
            {
                log::warn!(
                    "failed to persist assistant message for session {}: {}",
                    terminal_event.session_id,
                    error.message
                );
            }
        }

        if let Some(evt) = terminal_to_emit.as_ref() {
            let _ = app_handle.emit("agent-stream", evt);
        }

        backend_for_finish.finish_stream(&session_id).await;
    });

    Ok(())
}

#[derive(Clone)]
pub struct OpenCodeBackend {
    state: Arc<AppState>,
    conn: OpenCodeConnection,
}

impl OpenCodeBackend {
    pub fn new(state: Arc<AppState>, workspace_id: &str) -> Result<Self, AppError> {
        let conn = state.opencode.get_connection(workspace_id).ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

        Ok(Self { state, conn })
    }
}

#[async_trait]
impl Backend for OpenCodeBackend {
    async fn create_session(
        &self,
        _workspace_id: String,
        _cwd_override: Option<String>,
        _system_prompt_override: Option<String>,
    ) -> Result<BackendSessionCreated, AppError> {
        let value = OpenCodeManager::create_session(&self.conn).await?;
        let id = value
            .get("id")
            .or_else(|| value.get("sessionID"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::health("OpenCode did not return a session id"))?;
        Ok(BackendSessionCreated { id: id.to_string() })
    }

    async fn list_models(
        &self,
        _workspace_id: Option<&str>,
    ) -> Result<Vec<OpenCodeModelOption>, AppError> {
        OpenCodeManager::list_models(&self.conn).await
    }

    async fn start_stream(
        &self,
        prompt: BackendPrompt,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) -> Result<(), AppError> {
        self.state.opencode.subscribe_events(
            &self.conn,
            prompt.workspace_id,
            prompt.session_id.clone(),
            tx,
        );

        OpenCodeManager::send_message_async(
            &self.conn,
            &prompt.session_id,
            &prompt.content,
            prompt.model.as_ref(),
            prompt.system.as_deref(),
        )
        .await
    }

    async fn abort(&self, _workspace_id: Option<&str>, session_id: &str) -> Result<(), AppError> {
        OpenCodeManager::abort_session(&self.conn, session_id).await
    }

    async fn answer_question(
        &self,
        _workspace_id: Option<&str>,
        _session_id: &str,
        answer: BackendQuestionAnswer,
    ) -> Result<(), AppError> {
        match answer {
            BackendQuestionAnswer::OpenCode {
                request_id,
                answers,
            } => OpenCodeManager::reply_question(&self.conn, &request_id, &answers).await,
            _ => Err(AppError::invalid_input(
                "Wrong question answer kind for OpenCode",
            )),
        }
    }

    async fn finish_stream(&self, session_id: &str) {
        self.state.opencode.clear_event_subscription(session_id);
    }

    async fn persist_streamed_assistant(
        &self,
        state: &Arc<AppState>,
        conversation_id: &str,
        drain: &StreamDrainResult,
    ) -> Result<(), AppError> {
        let Some(terminal_event) = drain.terminal_event.as_ref() else {
            return Ok(());
        };

        persist_streamed_assistant_message(
            state,
            &self.conn,
            &terminal_event.session_id,
            conversation_id,
            &drain.full_content,
            terminal_event,
            drain.assistant_message_id.as_deref(),
        )
        .await
    }
}

#[derive(Clone)]
pub struct ClaudeCodeBackend {
    state: Arc<AppState>,
}

impl ClaudeCodeBackend {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[async_trait]
impl Backend for ClaudeCodeBackend {
    async fn create_session(
        &self,
        workspace_id: String,
        cwd_override: Option<String>,
        _system_prompt_override: Option<String>,
    ) -> Result<BackendSessionCreated, AppError> {
        let workspace = self.state.db.get_workspace(&workspace_id)?;
        let cwd = cwd_override
            .map(std::path::PathBuf::from)
            .filter(|path| path.is_dir())
            .or_else(|| {
                workspace
                    .worktree_path
                    .as_ref()
                    .map(std::path::PathBuf::from)
            })
            .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path));
        let created = self.state.claude_code.create_session(workspace_id, cwd);
        Ok(BackendSessionCreated { id: created.id })
    }

    async fn list_models(
        &self,
        _workspace_id: Option<&str>,
    ) -> Result<Vec<OpenCodeModelOption>, AppError> {
        Ok(self.state.claude_code.list_models())
    }

    async fn start_stream(
        &self,
        prompt: BackendPrompt,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) -> Result<(), AppError> {
        self.state.claude_code.ensure_bridge_available()?;
        let session = match self.state.claude_code.get_session(&prompt.session_id) {
            Ok(session) => session,
            Err(_) => {
                let conversation_id = prompt.conversation_id.as_deref().ok_or_else(|| {
                    AppError::invalid_input("Claude Code streaming requires a conversation id")
                })?;
                let conversation = self.state.db.get_conversation(conversation_id)?;
                let workspace = self.state.db.get_workspace(&prompt.workspace_id)?;
                let cwd = conversation
                    .backend_session_cwd
                    .as_ref()
                    .map(std::path::PathBuf::from)
                    .filter(|path| path.is_dir())
                    .or_else(|| {
                        workspace
                            .worktree_path
                            .as_ref()
                            .map(std::path::PathBuf::from)
                            .filter(|path| path.is_dir())
                    })
                    .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path));

                self.state.claude_code.restore_session(
                    prompt.session_id.clone(),
                    prompt.workspace_id.clone(),
                    cwd,
                    true,
                )
            }
        };

        if session.workspace_id != prompt.workspace_id {
            return Err(AppError::invalid_input(format!(
                "Claude Code session {} does not belong to workspace {}",
                prompt.session_id, prompt.workspace_id
            )));
        }

        let state = self.state.clone();
        let bridge_path = state.claude_code.bridge_script_path().to_path_buf();
        let package_root = state.claude_code.package_root().to_path_buf();
        let resolved_model =
            crate::claude_code::ClaudeCodeManager::resolve_model_id(prompt.model.as_ref());

        tokio::spawn(async move {
            let mut child = match Command::new("node")
                .arg(&bridge_path)
                .current_dir(&package_root)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(error) => {
                    let _ = tx.send(AgentStreamEvent {
                        workspace_id: prompt.workspace_id,
                        session_id: prompt.session_id,
                        event_type: "error".to_string(),
                        content: Some(format!("Failed to start Claude Code bridge: {error}")),
                        metadata: None,
                    });
                    return;
                }
            };

            let payload = json!({
                "cwd": session.cwd,
                "prompt": prompt.content,
                "model": resolved_model,
                "sessionId": session.id,
                "resume": session.started,
            });

            let Some(mut stdin) = child.stdin.take() else {
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: prompt.workspace_id,
                    session_id: prompt.session_id,
                    event_type: "error".to_string(),
                    content: Some("Claude Code bridge did not expose stdin".to_string()),
                    metadata: None,
                });
                return;
            };

            let (input_tx, mut input_rx) = mpsc::unbounded_channel::<String>();
            let writer_tx = tx.clone();
            let writer_workspace_id = prompt.workspace_id.clone();
            let writer_session_id = prompt.session_id.clone();
            tokio::spawn(async move {
                while let Some(message) = input_rx.recv().await {
                    let result = async {
                        stdin.write_all(message.as_bytes()).await?;
                        stdin.write_all(b"\n").await?;
                        stdin.flush().await
                    }
                    .await;

                    if let Err(error) = result {
                        let _ = writer_tx.send(AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!(
                                "Failed to send input to Claude Code bridge: {error}"
                            )),
                            metadata: None,
                        });
                        break;
                    }
                }
            });

            if input_tx.send(payload.to_string()).is_err() {
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: prompt.workspace_id,
                    session_id: prompt.session_id,
                    event_type: "error".to_string(),
                    content: Some("Failed to queue prompt for Claude Code bridge".to_string()),
                    metadata: None,
                });
                return;
            }

            let Some(stdout) = child.stdout.take() else {
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: prompt.workspace_id,
                    session_id: prompt.session_id,
                    event_type: "error".to_string(),
                    content: Some("Claude Code bridge did not expose stdout".to_string()),
                    metadata: None,
                });
                return;
            };

            let stderr = child.stderr.take();
            let child = Arc::new(tokio::sync::Mutex::new(child));
            state
                .claude_code
                .track_run(prompt.session_id.clone(), child.clone(), input_tx.clone());

            let stderr_task = tokio::spawn(async move {
                let mut lines_out = Vec::new();
                if let Some(stderr) = stderr {
                    let mut lines = BufReader::new(stderr).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            lines_out.push(trimmed.to_string());
                        }
                    }
                }
                lines_out
            });

            let mut saw_terminal = false;
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let parsed = match serde_json::from_str::<ClaudeCodeBridgeEvent>(trimmed) {
                    Ok(parsed) => parsed,
                    Err(error) => {
                        log::warn!(
                            "Failed to parse Claude Code bridge event: {} :: {}",
                            error,
                            trimmed
                        );
                        continue;
                    }
                };

                let event = AgentStreamEvent {
                    workspace_id: prompt.workspace_id.clone(),
                    session_id: prompt.session_id.clone(),
                    event_type: parsed.event_type.clone(),
                    content: parsed.content,
                    metadata: parsed.metadata,
                };

                if event.event_type == "done" {
                    let _ = state.claude_code.mark_started(&prompt.session_id);
                    saw_terminal = true;
                    let _ = tx.send(event);
                    break;
                }

                if event.event_type == "error" {
                    saw_terminal = true;
                    let _ = tx.send(event);
                    break;
                }

                if tx.send(event).is_err() {
                    break;
                }
            }

            let stderr_lines = stderr_task.await.unwrap_or_default();
            let status = child.lock().await.wait().await.ok();
            let was_aborted = !state.claude_code.is_running(&prompt.session_id);
            state.claude_code.clear_run(&prompt.session_id);

            if was_aborted {
                return;
            }

            if !saw_terminal {
                let detail = stderr_lines.join("\n");
                let message = if !detail.is_empty() {
                    format!("Claude Code run ended unexpectedly: {detail}")
                } else if let Some(status) = status {
                    format!("Claude Code run ended unexpectedly with status {status}")
                } else {
                    "Claude Code run ended unexpectedly".to_string()
                };
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: prompt.workspace_id,
                    session_id: prompt.session_id,
                    event_type: "error".to_string(),
                    content: Some(message),
                    metadata: None,
                });
            }
        });

        Ok(())
    }

    async fn abort(&self, _workspace_id: Option<&str>, session_id: &str) -> Result<(), AppError> {
        self.state.claude_code.abort(session_id).await
    }

    async fn answer_question(
        &self,
        _workspace_id: Option<&str>,
        session_id: &str,
        answer: BackendQuestionAnswer,
    ) -> Result<(), AppError> {
        match answer {
            BackendQuestionAnswer::ClaudePermission {
                request_id,
                allow,
                remember,
            } => {
                self.state
                    .claude_code
                    .respond_permission(session_id, &request_id, allow, remember)
            }
            _ => Err(AppError::invalid_input(
                "Wrong question answer kind for Claude Code",
            )),
        }
    }
}

#[derive(Clone)]
pub struct KhadimBackend {
    state: Arc<AppState>,
}

impl KhadimBackend {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

fn catalog_to_opencode_model(model: CatalogModelOption) -> OpenCodeModelOption {
    OpenCodeModelOption {
        provider_id: model.provider_id,
        provider_name: model.provider_name,
        model_id: model.model_id,
        model_name: model.model_name,
        is_default: model.is_default,
    }
}

#[async_trait]
impl Backend for KhadimBackend {
    async fn create_session(
        &self,
        workspace_id: String,
        cwd_override: Option<String>,
        system_prompt_override: Option<String>,
    ) -> Result<BackendSessionCreated, AppError> {
        let cwd = if workspace_id == "__chat__" || workspace_id == "__agent_builder__" {
            cwd_override
                .map(std::path::PathBuf::from)
                .filter(|path| path.is_dir())
                .unwrap_or_else(std::env::temp_dir)
        } else {
            let workspace = self.state.db.get_workspace(&workspace_id)?;
            cwd_override
                .map(std::path::PathBuf::from)
                .filter(|path| path.is_dir())
                .or_else(|| {
                    workspace
                        .worktree_path
                        .as_ref()
                        .map(std::path::PathBuf::from)
                })
                .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path))
        };
        let id =
            self.state
                .khadim
                .create_session_with_prompt(workspace_id, cwd, system_prompt_override);
        Ok(BackendSessionCreated { id })
    }

    async fn list_models(
        &self,
        _workspace_id: Option<&str>,
    ) -> Result<Vec<OpenCodeModelOption>, AppError> {
        crate::khadim_ai::model_settings::configured_model_options(&self.state.db)
            .map(|models| models.into_iter().map(catalog_to_opencode_model).collect())
    }

    async fn start_stream(
        &self,
        prompt: BackendPrompt,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) -> Result<(), AppError> {
        let session = self.state.khadim.get_session(&prompt.session_id)?;
        let state = self.state.clone();
        let plugins = state.plugins.clone();
        let skills = state.skills.clone();
        let khadim_mgr = state.khadim.clone();
        let db = state.db.as_ref().clone();
        let session_id = prompt.session_id.clone();
        let session_id_for_cleanup = session_id.clone();
        let handle = tokio::spawn(async move {
            let result = {
                let mut session = session.lock().await;
                session.active_conversation_id = prompt.conversation_id.clone();
                session.active_agent_id = prompt.active_agent_id.clone();
                match crate::commands::khadim::resolve_khadim_selection(
                    &state,
                    prompt.model.as_ref(),
                ) {
                    Ok(selection) => {
                        crate::khadim_agent::orchestrator::run_prompt_with_plugins(
                            &mut session,
                            &prompt.content,
                            selection,
                            &tx,
                            Some(&plugins),
                            Some(&skills),
                            Some(&khadim_mgr),
                            None,
                            Some(db),
                            Some(&state.integrations),
                        )
                        .await
                    }
                    Err(error) => Err(error),
                }
            };

            match result {
                Ok(_) => {
                    let _ = crate::commands::khadim::persist_memory_candidates(
                        &state,
                        &prompt.workspace_id,
                        prompt.conversation_id.as_deref(),
                        &prompt.content,
                    );
                }
                Err(error) => {
                    let _ = tx.send(AgentStreamEvent {
                        workspace_id: prompt.workspace_id,
                        session_id: prompt.session_id,
                        event_type: "error".to_string(),
                        content: Some(error.message),
                        metadata: None,
                    });
                }
            }

            state.khadim.clear_run(&session_id_for_cleanup);
        });

        self.state.khadim.track_run(session_id, handle);
        Ok(())
    }

    async fn abort(&self, _workspace_id: Option<&str>, session_id: &str) -> Result<(), AppError> {
        self.state.khadim.abort(session_id).await
    }

    async fn answer_question(
        &self,
        _workspace_id: Option<&str>,
        session_id: &str,
        answer: BackendQuestionAnswer,
    ) -> Result<(), AppError> {
        match answer {
            BackendQuestionAnswer::Khadim { answer } => {
                self.state.khadim.answer_question(session_id, answer)
            }
            _ => Err(AppError::invalid_input(
                "Wrong question answer kind for Khadim",
            )),
        }
    }

    async fn persist_streamed_assistant(
        &self,
        state: &Arc<AppState>,
        conversation_id: &str,
        drain: &StreamDrainResult,
    ) -> Result<(), AppError> {
        if drain.full_content.trim().is_empty() {
            return Ok(());
        }

        let content = crate::commands::khadim::strip_internal_reminder_blocks(&drain.full_content);
        let metadata = (!drain.thinking_steps.is_empty())
            .then(|| json!({ "thinkingSteps": drain.thinking_steps }).to_string());
        persist_assistant_message(state, conversation_id, &content, metadata)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct FakeBackend {
        events: Vec<AgentStreamEvent>,
    }

    #[async_trait]
    impl Backend for FakeBackend {
        async fn create_session(
            &self,
            _workspace_id: String,
            _cwd_override: Option<String>,
            _system_prompt_override: Option<String>,
        ) -> Result<BackendSessionCreated, AppError> {
            Ok(BackendSessionCreated {
                id: "fake".to_string(),
            })
        }

        async fn list_models(
            &self,
            _workspace_id: Option<&str>,
        ) -> Result<Vec<OpenCodeModelOption>, AppError> {
            Ok(Vec::new())
        }

        async fn start_stream(
            &self,
            _prompt: BackendPrompt,
            tx: mpsc::UnboundedSender<AgentStreamEvent>,
        ) -> Result<(), AppError> {
            for event in self.events.clone() {
                tx.send(event).unwrap();
            }
            Ok(())
        }

        async fn abort(
            &self,
            _workspace_id: Option<&str>,
            _session_id: &str,
        ) -> Result<(), AppError> {
            Ok(())
        }

        async fn answer_question(
            &self,
            _workspace_id: Option<&str>,
            _session_id: &str,
            _answer: BackendQuestionAnswer,
        ) -> Result<(), AppError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn drain_backend_stream_accumulates_text_and_stops_at_terminal_event() {
        let backend = FakeBackend {
            events: vec![
                AgentStreamEvent {
                    workspace_id: "ws".to_string(),
                    session_id: "session".to_string(),
                    event_type: "message_start".to_string(),
                    content: None,
                    metadata: Some(serde_json::json!({ "messageId": "assistant-1" })),
                },
                AgentStreamEvent {
                    workspace_id: "ws".to_string(),
                    session_id: "session".to_string(),
                    event_type: "text_delta".to_string(),
                    content: Some("hel".to_string()),
                    metadata: None,
                },
                AgentStreamEvent {
                    workspace_id: "ws".to_string(),
                    session_id: "session".to_string(),
                    event_type: "text_delta".to_string(),
                    content: Some("lo".to_string()),
                    metadata: None,
                },
                AgentStreamEvent {
                    workspace_id: "ws".to_string(),
                    session_id: "session".to_string(),
                    event_type: "done".to_string(),
                    content: None,
                    metadata: None,
                },
            ],
        };

        let (tx, rx) = mpsc::unbounded_channel();
        backend
            .start_stream(
                BackendPrompt {
                    workspace_id: "ws".to_string(),
                    session_id: "session".to_string(),
                    conversation_id: Some("conversation".to_string()),
                    active_agent_id: None,
                    content: "prompt".to_string(),
                    model: None,
                    system: None,
                },
                tx,
            )
            .await
            .unwrap();

        let mut emitted = Vec::new();
        let result = drain_backend_stream(rx, |event| emitted.push(event.event_type.clone())).await;

        assert_eq!(result.full_content, "hello");
        assert_eq!(result.assistant_message_id.as_deref(), Some("assistant-1"));
        assert_eq!(result.terminal_event.unwrap().event_type, "done");
        assert_eq!(
            emitted,
            vec!["message_start", "text_delta", "text_delta", "done"]
        );
    }
}
