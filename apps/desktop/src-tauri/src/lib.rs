#![allow(dead_code)]

mod claude_code;
mod commands;
mod db;
mod error;
mod file_index;
mod git;
mod github;
mod health;
mod khadim_agent;
mod khadim_ai;
mod khadim_code;
mod lsp;
mod opencode;
mod plugins;
mod process;
mod run_lifecycle;
mod skills;
mod syntax;
mod terminal;
mod workspace_context;

use claude_code::{ClaudeCodeManager, ClaudeCodeSessionCreated};
use db::{ChatMessage, Conversation, Database};
use error::AppError;
use khadim_agent::KhadimManager;
use khadim_ai::model_settings::{BulkModelEntry, DiscoveredProviderModel, ModelConfig, ModelConfigInput, ProviderOption, ProviderStatus};
use khadim_ai::models::CatalogModelOption;
use khadim_ai::oauth::{CodexLoginStatusResponse, CodexSessionInfo};
use khadim_ai::types::ModelSelection;
use opencode::{AgentStreamEvent, OpenCodeManager, OpenCodeModelRef};
use plugins::{PluginEntry, PluginManager, PluginToolInfo};
use process::{ProcessOutput, ProcessRunner};
use run_lifecycle::{emit_error_and_done, extract_text, persist_assistant_message, persist_streamed_assistant_message, persist_user_message, StreamAccumulator};
use skills::{SkillEntry, SkillManager};
use file_index::FileIndexManager;
use lsp::LspManager;
use terminal::TerminalManager;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;


/// Mask an API key, showing only the first 4 and last 4 characters.
fn mask_api_key(key: &str) -> String {
    let len = key.len();
    if len <= 8 {
        "*".repeat(len)
    } else {
        format!(
            "{}{}{}",
            &key[..4],
            "*".repeat(len - 8),
            &key[len - 4..],
        )
    }
}


// ── App State ────────────────────────────────────────────────────────

/// Shared state injected into all Tauri commands.
pub struct AppState {
    db: Database,
    process_runner: ProcessRunner,
    opencode: OpenCodeManager,
    khadim: Arc<KhadimManager>,
    claude_code: Arc<ClaudeCodeManager>,
    github: github::GitHubClient,
    plugins: Arc<PluginManager>,
    skills: Arc<SkillManager>,
    terminals: Arc<TerminalManager>,
    file_index: Arc<FileIndexManager>,
    lsp: Arc<LspManager>,
}

// ── Tauri commands ───────────────────────────────────────────────────
// Each command returns Result<T, AppError>. Tauri serializes
// AppError as JSON { kind, message } in the error channel.

// ─── Conversations ───────────────────────────────────────────────────

#[tauri::command]
fn list_conversations(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<Conversation>, AppError> {
    state.db.list_conversations(&workspace_id)
}

#[tauri::command]
fn get_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Conversation, AppError> {
    state.db.get_conversation(&id)
}

#[tauri::command]
fn create_conversation(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Conversation, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

    // Deactivate previous active conversations
    state.db.deactivate_workspace_conversations(&workspace_id)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conv = Conversation {
        id: id.clone(),
        workspace_id: workspace_id.clone(),
        backend: ws.backend.clone(),
        backend_session_id: None,
        backend_session_cwd: None,
        branch: None,
        worktree_path: None,
        title: None,
        is_active: true,
        created_at: now.clone(),
        updated_at: now,
        input_tokens: 0,
        output_tokens: 0,
    };

    state.db.create_conversation(&conv)?;
    Ok(conv)
}

#[tauri::command]
fn set_conversation_backend_session(
    state: State<'_, Arc<AppState>>,
    id: String,
    backend_session_id: String,
    backend_session_cwd: Option<String>,
    branch: Option<String>,
    worktree_path: Option<String>,
) -> Result<(), AppError> {
    state.db.set_conversation_backend_session(
        &id,
        &backend_session_id,
        backend_session_cwd.as_deref(),
        branch.as_deref(),
        worktree_path.as_deref(),
    )
}

#[tauri::command]
fn delete_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_conversation(&id)
}

// ─── Messages ────────────────────────────────────────────────────────

#[tauri::command]
fn list_messages(
    state: State<'_, Arc<AppState>>,
    conversation_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    state.db.list_messages(&conversation_id)
}

// ─── OpenCode Backend ────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct OpenCodeStarted {
    workspace_id: String,
    base_url: String,
    event_stream_url: String,
    healthy: bool,
}

#[derive(Serialize, Clone)]
struct KhadimSessionCreated {
    id: String,
}

fn resolve_khadim_selection(
    state: &Arc<AppState>,
    model: Option<&OpenCodeModelRef>,
) -> Result<Option<ModelSelection>, AppError> {
    if let Some(model) = model {
        let override_config = khadim_ai::model_settings::configured_model_override(
            &state.db,
            &model.provider_id,
            &model.model_id,
        )?;
        let provider_api_key = khadim_ai::model_settings::saved_provider_api_key(&model.provider_id)?;
        return Ok(Some(ModelSelection {
            provider: model.provider_id.clone(),
            model_id: model.model_id.clone(),
            display_name: override_config.as_ref().map(|config| config.name.clone()),
            api_key: override_config
                .as_ref()
                .and_then(|config| config.api_key.clone())
                .or(provider_api_key),
            base_url: override_config.as_ref().and_then(|config| config.base_url.clone()),
        }));
    }

    let config = khadim_ai::model_settings::active_config(&state.db)?
        .ok_or_else(|| AppError::invalid_input("No Khadim model is configured. Add one in Model Settings first."))?;

    Ok(Some(ModelSelection {
        provider: config.provider,
        model_id: config.model,
        display_name: Some(config.name),
        api_key: config.api_key,
        base_url: config.base_url,
    }))
}


#[tauri::command]
async fn opencode_start(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<OpenCodeStarted, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

    let working_dir = ws
        .worktree_path
        .as_deref()
        .unwrap_or(&ws.repo_path);

    let port = opencode::find_free_port()?;

    // Set up output streaming — emit to frontend as events
    let (tx, mut rx) = mpsc::unbounded_channel::<ProcessOutput>();
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(output) = rx.recv().await {
            let _ = app_handle.emit("process-output", &output);
        }
    });

    let conn = state
        .opencode
        .start(&workspace_id, working_dir, port, &state.process_runner, Some(tx))
        .await?;

    let result = OpenCodeStarted {
        workspace_id: workspace_id.clone(),
        base_url: conn.base_url.clone(),
        event_stream_url: OpenCodeManager::event_stream_url(&conn),
        healthy: conn.healthy,
    };

    // Emit a backend-ready event
    let _ = app.emit("opencode-ready", &result);

    Ok(result)
}

#[tauri::command]
async fn opencode_stop(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<(), AppError> {
    state
        .opencode
        .stop(&workspace_id, &state.process_runner)
        .await
}

#[tauri::command]
async fn opencode_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::create_session(&conn).await
}

#[tauri::command]
async fn opencode_list_sessions(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_sessions(&conn).await
}

#[tauri::command]
async fn opencode_list_models(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<opencode::OpenCodeModelOption>, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_models(&conn).await
}

#[tauri::command]
async fn opencode_send_message(
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    // Send to OpenCode (this waits for the response)
    let response = OpenCodeManager::send_message(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await?;

    // Save assistant response locally
    let assistant_content = extract_text(&response);

    if !assistant_content.is_empty() {
        persist_assistant_message(
            state.inner(),
            &conversation_id,
            &assistant_content,
            Some(serde_json::to_string(&response).unwrap_or_default()),
        )?;
    }

    Ok(response)
}

#[tauri::command]
async fn opencode_send_message_async(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    // Send async — frontend will receive updates via SSE
    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await
}

/// Send a message and stream the response as Tauri events.
/// This uses the async prompt endpoint + SSE event stream.
#[tauri::command]
async fn opencode_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    // Subscribe to SSE events first
    let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    state.opencode.subscribe_events(
        &conn,
        workspace_id.clone(),
        session_id.clone(),
        tx,
    );

    // Now send the async prompt
    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await?;

    // Forward events to frontend
    let app_handle = app.clone();
    let state_arc = state.inner().clone();
    let conn_for_persist = conn.clone();
    let conv_id = conversation_id.clone();
    let session_id_for_cleanup = session_id.clone();
    tokio::spawn(async move {
        let mut full_content = String::new();
        let mut assistant_message_id: Option<String> = None;
        while let Some(evt) = rx.recv().await {
            if evt.event_type == "message_start" {
                assistant_message_id = evt
                    .metadata
                    .as_ref()
                    .and_then(|metadata| metadata.get("messageId"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned);
            }

            // Accumulate text deltas
            if evt.event_type == "text_delta" {
                if let Some(ref text) = evt.content {
                    full_content.push_str(text);
                }
            }

            // Persist token usage whenever OpenCode reports it.
            if evt.event_type == "usage_update" {
                if let Some(ref meta) = evt.metadata {
                    let input  = meta.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    let output = meta.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    if let Err(e) = state_arc.db.update_conversation_tokens(&conv_id, input, output) {
                        log::warn!("failed to persist token usage for {conv_id}: {}", e.message);
                    }
                }
            }

            let is_terminal = evt.event_type == "done" || evt.event_type == "error";
            if is_terminal {
                if let Err(error) = persist_streamed_assistant_message(
                    &state_arc,
                    &conn_for_persist,
                    &evt.session_id,
                    &conv_id,
                    &full_content,
                    &evt,
                    assistant_message_id.as_deref(),
                )
                .await
                {
                    log::warn!(
                        "failed to persist assistant message for session {}: {}",
                        evt.session_id,
                        error.message
                    );
                }
            }

            let _ = app_handle.emit("agent-stream", &evt);

            if is_terminal {
                // Clean up the subscription when the stream ends
                state_arc.opencode.clear_event_subscription(&session_id_for_cleanup);
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn opencode_abort(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::abort_session(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_list_messages(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_messages(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_get_diff(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::get_diff(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_session_statuses(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::session_statuses(&conn).await
}

#[tauri::command]
async fn opencode_get_connection(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Option<opencode::OpenCodeConnection>, AppError> {
    Ok(state.opencode.get_connection(&workspace_id))
}

#[tauri::command]
async fn opencode_reply_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
    answers: Vec<Vec<String>>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::reply_question(&conn, &request_id, &answers).await
}

#[tauri::command]
async fn opencode_reject_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::reject_question(&conn, &request_id).await
}

#[derive(Deserialize)]
struct ClaudeCodeBridgeEvent {
    event_type: String,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[tauri::command]
async fn claude_code_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    cwd_override: Option<String>,
) -> Result<ClaudeCodeSessionCreated, AppError> {
    let workspace = state.db.get_workspace(&workspace_id)?;
    let cwd = cwd_override
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(|| workspace.worktree_path.as_ref().map(std::path::PathBuf::from))
        .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path));

    Ok(state.claude_code.create_session(workspace_id, cwd))
}

#[tauri::command]
fn claude_code_list_models(state: State<'_, Arc<AppState>>) -> Result<Vec<opencode::OpenCodeModelOption>, AppError> {
    Ok(state.claude_code.list_models())
}

#[tauri::command]
async fn claude_code_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<(), AppError> {
    persist_user_message(state.inner(), &conversation_id, &content)?;

    state.claude_code.ensure_bridge_available()?;
    let session = match state.claude_code.get_session(&session_id) {
        Ok(session) => session,
        Err(_) => {
            let conversation = state.db.get_conversation(&conversation_id)?;
            let workspace = state.db.get_workspace(&workspace_id)?;
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

            state
                .claude_code
                .restore_session(session_id.clone(), workspace_id.clone(), cwd, true)
        }
    };
    if session.workspace_id != workspace_id {
        return Err(AppError::invalid_input(format!(
            "Claude Code session {session_id} does not belong to workspace {workspace_id}"
        )));
    }

    let state_arc = state.inner().clone();
    let app_handle = app.clone();
    let bridge_path = state.claude_code.bridge_script_path().to_path_buf();
    let package_root = state.claude_code.package_root().to_path_buf();
    let resolved_model = ClaudeCodeManager::resolve_model_id(model.as_ref());

    tokio::spawn(async move {
        let mut stream = StreamAccumulator::new();
        let mut saw_terminal = false;

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
                emit_error_and_done(
                    &app_handle,
                    workspace_id,
                    session_id,
                    format!("Failed to start Claude Code bridge: {error}"),
                );
                return;
            }
        };

        let payload = serde_json::json!({
            "cwd": session.cwd,
            "prompt": content,
            "model": resolved_model,
            "sessionId": session.id,
            "resume": session.started,
        });

        let stdin = child.stdin.take();
        let Some(mut stdin) = stdin else {
            emit_error_and_done(
                &app_handle,
                workspace_id,
                session_id,
                "Claude Code bridge did not expose stdin".to_string(),
            );
            return;
        };

        let (input_tx, mut input_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let writer_workspace_id = workspace_id.clone();
        let writer_session_id = session_id.clone();
        let writer_app = app_handle.clone();
        tokio::spawn(async move {
            while let Some(message) = input_rx.recv().await {
                if let Err(error) = stdin.write_all(message.as_bytes()).await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to send input to Claude Code bridge: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
                if let Err(error) = stdin.write_all(b"\n").await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to finalize input for Claude Code bridge: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
                if let Err(error) = stdin.flush().await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to flush Claude Code bridge input: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
            }
        });

        if input_tx.send(payload.to_string()).is_err() {
            let _ = app_handle.emit(
                "agent-stream",
                &AgentStreamEvent {
                    workspace_id,
                    session_id,
                    event_type: "error".to_string(),
                    content: Some("Failed to queue prompt for Claude Code bridge".to_string()),
                    metadata: None,
                },
            );
            return;
        }

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                emit_error_and_done(
                    &app_handle,
                    workspace_id,
                    session_id,
                    "Claude Code bridge did not expose stdout".to_string(),
                );
                return;
            }
        };

        let stderr = child.stderr.take();
        let child = Arc::new(tokio::sync::Mutex::new(child));
        state_arc
            .claude_code
            .track_run(session_id.clone(), child.clone(), input_tx.clone());

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

        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let parsed = match serde_json::from_str::<ClaudeCodeBridgeEvent>(trimmed) {
                Ok(parsed) => parsed,
                Err(error) => {
                    log::warn!("Failed to parse Claude Code bridge event: {} :: {}", error, trimmed);
                    continue;
                }
            };

            let event = AgentStreamEvent {
                workspace_id: workspace_id.clone(),
                session_id: session_id.clone(),
                event_type: parsed.event_type.clone(),
                content: parsed.content.clone(),
                metadata: parsed.metadata.clone(),
            };

            if parsed.event_type == "text_delta" {
                stream.push_text_delta(parsed.content.as_deref());
            }

            if matches!(parsed.event_type.as_str(), "step_start" | "step_update" | "step_complete") {
                if let Some(metadata) = event.metadata.as_ref().and_then(|value| value.as_object()) {
                    if let Some(step_id) = metadata.get("id").and_then(|value| value.as_str()) {
                        let mut next_step = stream
                            .current_step(step_id)
                            .unwrap_or_else(|| serde_json::json!({
                                "id": step_id,
                                "title": metadata.get("title").and_then(|value| value.as_str()).unwrap_or("Working"),
                                "status": "running",
                            }));

                        if let Some(obj) = next_step.as_object_mut() {
                            if let Some(title) = metadata.get("title").and_then(|value| value.as_str()) {
                                obj.insert("title".to_string(), serde_json::Value::String(title.to_string()));
                            }
                            if let Some(tool) = metadata.get("tool").and_then(|value| value.as_str()) {
                                obj.insert("tool".to_string(), serde_json::Value::String(tool.to_string()));
                            }
                            if let Some(result) = metadata.get("result").and_then(|value| value.as_str()) {
                                obj.insert("result".to_string(), serde_json::Value::String(result.to_string()));
                            }
                            if let Some(content) = event.content.as_ref().filter(|value| !value.trim().is_empty()) {
                                obj.insert("content".to_string(), serde_json::Value::String(content.clone()));
                                if parsed.event_type == "step_complete" && !obj.contains_key("result") {
                                    obj.insert("result".to_string(), serde_json::Value::String(content.clone()));
                                }
                            }
                            let status = match parsed.event_type.as_str() {
                                "step_complete" => {
                                    if metadata.get("is_error").and_then(|value| value.as_bool()) == Some(true) {
                                        "error"
                                    } else {
                                        "complete"
                                    }
                                }
                                _ => "running",
                            };
                            obj.insert("status".to_string(), serde_json::Value::String(status.to_string()));
                        }

                        stream.upsert_step(step_id, next_step);
                    }
                }
            }

            if parsed.event_type == "done" {
                let _ = state_arc.claude_code.mark_started(&session_id);
                saw_terminal = true;
                stream.set_terminal_event(event);
                break;
            }

            if parsed.event_type == "error" {
                saw_terminal = true;
                stream.set_terminal_event(event);
                break;
            }

            let _ = app_handle.emit("agent-stream", &event);
        }

        let stderr_lines = stderr_task.await.unwrap_or_default();
        let status = child.lock().await.wait().await.ok();
        let was_aborted = !state_arc.claude_code.is_running(&session_id);
        state_arc.claude_code.clear_run(&session_id);

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
            stream.set_terminal_event(AgentStreamEvent {
                workspace_id: workspace_id.clone(),
                session_id: session_id.clone(),
                event_type: "error".to_string(),
                content: Some(message),
                metadata: None,
            });
        }

        let _ = stream.persist_assistant_if_any(&state_arc, &conversation_id);
        stream.emit_terminal_events(&app_handle, workspace_id, session_id);
    });

    Ok(())
}

#[tauri::command]
async fn claude_code_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.claude_code.abort(&session_id).await
}

#[tauri::command]
fn claude_code_respond_permission(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    request_id: String,
    allow: bool,
    remember: bool,
) -> Result<(), AppError> {
    state
        .claude_code
        .respond_permission(&session_id, &request_id, allow, remember)
}

// ─── Khadim Backend ──────────────────────────────────────────────────

#[tauri::command]
async fn khadim_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
    cwd_override: Option<String>,
) -> Result<KhadimSessionCreated, AppError> {
    let (resolved_workspace_id, cwd) = if let Some(workspace_id) = workspace_id {
        let workspace = state.db.get_workspace(&workspace_id)?;
        let base_cwd = if let Some(ref override_path) = cwd_override {
            let p = std::path::PathBuf::from(override_path);
            if p.is_dir() { p } else {
                std::path::PathBuf::from(
                    workspace.worktree_path.unwrap_or(workspace.repo_path),
                )
            }
        } else {
            std::path::PathBuf::from(
                workspace.worktree_path.unwrap_or(workspace.repo_path),
            )
        };
        (workspace_id, base_cwd)
    } else {
        // Standalone chat — check if the user configured a chat directory.
        let configured_dir = state
            .db
            .get_setting("khadim:chat_directory")
            .ok()
            .flatten()
            .filter(|v| !v.is_empty());

        let dir = if let Some(path) = configured_dir {
            let p = std::path::PathBuf::from(&path);
            if p.is_dir() {
                p
            } else {
                // Configured path no longer exists — fall back to temp.
                let session_id = uuid::Uuid::new_v4().to_string();
                let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
                std::fs::create_dir_all(&tmp)?;
                tmp
            }
        } else {
            let session_id = uuid::Uuid::new_v4().to_string();
            let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
            std::fs::create_dir_all(&tmp)?;
            tmp
        };

        ("__chat__".to_string(), dir)
    };

    let id = state.khadim.create_session(resolved_workspace_id, cwd);
    Ok(KhadimSessionCreated { id })
}

#[tauri::command]
async fn khadim_list_models(state: State<'_, Arc<AppState>>) -> Result<Vec<CatalogModelOption>, AppError> {
    khadim_ai::model_settings::configured_model_options(&state.db)
}

#[tauri::command]
fn khadim_list_model_configs(state: State<'_, Arc<AppState>>) -> Result<Vec<ModelConfig>, AppError> {
    khadim_ai::model_settings::list_configs(&state.db)
}

#[tauri::command]
fn khadim_list_providers() -> Vec<ProviderOption> {
    khadim_ai::model_settings::supported_providers()
}

#[tauri::command]
fn khadim_list_provider_statuses(state: State<'_, Arc<AppState>>) -> Result<Vec<ProviderStatus>, AppError> {
    khadim_ai::model_settings::provider_statuses(&state.db)
}

#[tauri::command]
fn khadim_save_provider_api_key(provider: String, api_key: String) -> Result<(), AppError> {
    khadim_ai::model_settings::save_provider_api_key(&provider, &api_key)
}

#[tauri::command]
fn khadim_get_provider_api_key_masked(provider: String) -> Result<Option<String>, AppError> {
    let key = khadim_ai::model_settings::saved_provider_api_key(&provider)?;
    Ok(key.map(|k| mask_api_key(&k)))
}

#[tauri::command]
fn khadim_get_provider_api_key(provider: String) -> Result<Option<String>, AppError> {
    khadim_ai::model_settings::saved_provider_api_key(&provider)
}

#[tauri::command]
fn khadim_delete_provider_api_key(provider: String) -> Result<(), AppError> {
    khadim_ai::model_settings::delete_provider_api_key(&provider)
}

#[tauri::command]
fn khadim_bulk_create_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
    models: Vec<BulkModelEntry>,
) -> Result<u32, AppError> {
    khadim_ai::model_settings::bulk_create_provider_models(&state.db, &provider, &models)
}

#[tauri::command]
fn khadim_remove_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
) -> Result<u32, AppError> {
    khadim_ai::model_settings::remove_provider_models(&state.db, &provider)
}

#[tauri::command]
async fn khadim_discover_models(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<DiscoveredProviderModel>, AppError> {
    khadim_ai::model_settings::discover_models(&provider, api_key, base_url).await
}

#[tauri::command]
fn khadim_create_model_config(
    state: State<'_, Arc<AppState>>,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    khadim_ai::model_settings::create_config(&state.db, input)
}

#[tauri::command]
fn khadim_update_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    khadim_ai::model_settings::update_config(&state.db, &id, input)
}

#[tauri::command]
fn khadim_delete_model_config(state: State<'_, Arc<AppState>>, id: String) -> Result<(), AppError> {
    khadim_ai::model_settings::delete_config(&state.db, &id)
}

#[tauri::command]
fn khadim_set_active_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    khadim_ai::model_settings::set_active_config(&state.db, &id)
}

#[tauri::command]
fn khadim_set_default_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    khadim_ai::model_settings::set_default_config(&state.db, &id)
}

#[tauri::command]
fn khadim_active_model(state: State<'_, Arc<AppState>>) -> Result<Option<CatalogModelOption>, AppError> {
    khadim_ai::model_settings::active_model_option(&state.db)
}

#[tauri::command]
async fn khadim_codex_auth_connected() -> Result<bool, AppError> {
    khadim_ai::oauth::has_openai_codex_auth().await
}

#[tauri::command]
async fn khadim_codex_auth_start() -> Result<CodexSessionInfo, AppError> {
    khadim_ai::oauth::start_openai_codex_login().await
}

#[tauri::command]
async fn khadim_codex_auth_status(session_id: String) -> Result<CodexLoginStatusResponse, AppError> {
    khadim_ai::oauth::get_openai_codex_login_status(&session_id).await
}

#[tauri::command]
async fn khadim_codex_auth_complete(session_id: String, code: String) -> Result<(), AppError> {
    khadim_ai::oauth::submit_openai_codex_manual_code(&session_id, &code).await
}

#[tauri::command]
async fn khadim_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<(), AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let session = state.khadim.get_session(&session_id)?;
    let state_arc = state.inner().clone();
    let app_handle = app.clone();
    let session_id_for_cleanup = session_id.clone();
    let session_id_for_error = session_id.clone();

    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let handle = tokio::spawn(async move {
        let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        // Hold back terminal events (done/error) so we can persist the
        // assistant message before the frontend sees "done" and refetches.
        let (held_tx, mut held_rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        // Collect step events so we can persist them as message metadata.
        let stream = Arc::new(std::sync::Mutex::new(StreamAccumulator::new()));
        let stream_for_emit = stream.clone();
        let emit_handle = app_handle.clone();
        let emit_task = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if event.event_type == "done" || event.event_type == "error" {
                    let _ = held_tx.send(event);
                } else {
                    // Collect step_start / step_update / step_complete into
                    // a per-step map so we can build complete ThinkingStep
                    // objects for persistence.
                    if event.event_type == "step_complete" {
                        if let Some(ref meta) = event.metadata {
                            let mut step = meta.clone();
                            step["status"] = json!("complete");
                            if let Some(ref c) = event.content {
                                if step.get("result").is_none() || step["result"].is_null() {
                                    step["result"] = json!(c);
                                }
                                if step.get("content").is_none() || step["content"].is_null() {
                                    step["content"] = json!(c);
                                }
                            }
                            stream_for_emit.lock().unwrap().push_step(step);
                        }
                    } else if event.event_type == "step_start" {
                        if let Some(ref meta) = event.metadata {
                            let mut step = meta.clone();
                            step["status"] = json!("running");
                            // Will be replaced if step_complete arrives
                            stream_for_emit.lock().unwrap().push_step(step);
                        }
                    } else if event.event_type == "text_delta" {
                        stream_for_emit
                            .lock()
                            .unwrap()
                            .push_text_delta(event.content.as_deref());
                    }
                    let _ = emit_handle.emit("agent-stream", &event);
                }
            }
        });

        let result = {
            let mut session = session.lock().await;
            match resolve_khadim_selection(&state_arc, model.as_ref()) {
                Ok(selection) => {
                    khadim_agent::orchestrator::run_prompt_with_plugins(
                        &mut session,
                        &content,
                        selection,
                        &tx,
                        Some(&plugins),
                        Some(&skills),
                        Some(&khadim_mgr),
                    )
                    .await
                }
                Err(error) => Err(error),
            }
        };

        // Drop the sender so the emit task finishes.
        drop(tx);

        // Wait for the emit task to finish forwarding all events
        // (including the held done/error events) before draining.
        let _ = emit_task.await;

        match result {
            Ok(text) => {
                let metadata = {
                    let mut stream = stream.lock().unwrap();
                    let mut raw = stream.take_thinking_steps();
                    // De-duplicate: if step_start was pushed and then step_complete
                    // arrived for the same id, keep only the complete version.
                    let mut seen = std::collections::HashSet::new();
                    let mut deduped = Vec::new();
                    for step in raw.drain(..).rev() {
                        let id = step.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if id.is_empty() || seen.insert(id) {
                            deduped.push(step);
                        }
                    }
                    deduped.reverse();
                    if deduped.is_empty() {
                        None
                    } else {
                        Some(json!({ "thinkingSteps": deduped }).to_string())
                    }
                };

                if let Some(conversation_id) = conversation_id {
                    let _ = persist_assistant_message(&state_arc, &conversation_id, &text, metadata);
                }
                while let Ok(event) = held_rx.try_recv() {
                    let _ = app_handle.emit("agent-stream", &event);
                }
            }
            Err(error) => {
                emit_error_and_done(
                    &app_handle,
                    workspace_id,
                    session_id_for_error.clone(),
                    error.message.clone(),
                );
            }
        }

        state_arc.khadim.clear_run(&session_id_for_cleanup);
    });

    state.khadim.track_run(session_id, handle);
    Ok(())
}

#[tauri::command]
async fn khadim_send_message(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<String, AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let session = state.khadim.get_session(&session_id)?;
    let (tx, _rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let selection = resolve_khadim_selection(state.inner(), model.as_ref())?;
    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let text = {
        let mut session = session.lock().await;
        khadim_agent::orchestrator::run_prompt_with_plugins(
            &mut session,
            &content,
            selection,
            &tx,
            Some(&plugins),
            Some(&skills),
            Some(&khadim_mgr),
        )
        .await?
    };

    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_assistant_message(state.inner(), conversation_id, &text, None)?;
    }

    let _ = workspace_id;
    Ok(text)
}

#[tauri::command]
async fn khadim_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.khadim.abort(&session_id).await
}

#[tauri::command]
fn khadim_answer_question(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    answer: String,
) -> Result<(), AppError> {
    state.khadim.answer_question(&session_id, answer)
}

// ─── Plugins ─────────────────────────────────────────────────────────

#[tauri::command]
fn plugin_list(state: State<'_, Arc<AppState>>) -> Vec<PluginEntry> {
    state.plugins.list_plugins()
}

#[tauri::command]
fn plugin_get(state: State<'_, Arc<AppState>>, plugin_id: String) -> Result<PluginEntry, AppError> {
    state
        .plugins
        .get_plugin(&plugin_id)
        .ok_or_else(|| AppError::not_found(format!("Plugin not found: {plugin_id}")))
}

#[tauri::command]
fn plugin_enable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state.plugins.enable_plugin(&plugin_id, &root)
}

#[tauri::command]
fn plugin_disable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<PluginEntry, AppError> {
    state.plugins.disable_plugin(&plugin_id)
}

#[tauri::command]
fn plugin_install(
    state: State<'_, Arc<AppState>>,
    source_dir: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state
        .plugins
        .install_from_dir(std::path::Path::new(&source_dir), &root)
}

#[tauri::command]
fn plugin_uninstall(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<(), AppError> {
    state.plugins.uninstall(&plugin_id)
}

#[tauri::command]
fn plugin_list_tools(state: State<'_, Arc<AppState>>) -> Vec<PluginToolInfo> {
    state.plugins.all_plugin_tools()
}

#[tauri::command]
fn plugin_set_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.plugins.set_plugin_config(&plugin_id, &key, &value)
}

#[tauri::command]
fn plugin_get_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, AppError> {
    state.plugins.get_plugin_config(&plugin_id, &key)
}

#[tauri::command]
fn plugin_discover(
    state: State<'_, Arc<AppState>>,
    workspace_root: Option<String>,
) -> Vec<PluginEntry> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state.plugins.discover_and_load(&root)
}

#[tauri::command]
fn plugin_dir(state: State<'_, Arc<AppState>>) -> String {
    state.plugins.plugins_dir().to_string_lossy().to_string()
}

// ─── Skills ──────────────────────────────────────────────────────────

#[tauri::command]
fn skill_discover(state: State<'_, Arc<AppState>>) -> Vec<SkillEntry> {
    state.skills.discover()
}

#[tauri::command]
fn skill_toggle(
    state: State<'_, Arc<AppState>>,
    skill_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    state.skills.set_enabled(&skill_id, enabled)
}

#[tauri::command]
fn skill_list_dirs(state: State<'_, Arc<AppState>>) -> Vec<String> {
    state.skills.list_dirs()
}

#[tauri::command]
fn skill_add_dir(state: State<'_, Arc<AppState>>, dir: String) -> Result<Vec<String>, AppError> {
    state.skills.add_dir(&dir)
}

#[tauri::command]
fn skill_remove_dir(state: State<'_, Arc<AppState>>, dir: String) -> Result<Vec<String>, AppError> {
    state.skills.remove_dir(&dir)
}

// ─── Editor ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
struct DetectedEditor {
    /// Unique key for the editor (e.g. "code", "cursor", "zed").
    id: String,
    /// Human-readable name.
    name: String,
    /// Binary name / path found on $PATH.
    binary: String,
    /// True when the binary was actually found on $PATH.
    available: bool,
}

const KNOWN_EDITORS: &[(&str, &str, &[&str])] = &[
    ("code",            "Visual Studio Code",     &["code"]),
    ("code-insiders",   "VS Code Insiders",       &["code-insiders"]),
    ("cursor",          "Cursor",                 &["cursor"]),
    ("zed",             "Zed",                    &["zed"]),
    ("windsurf",        "Windsurf",               &["windsurf"]),
    ("sublime",         "Sublime Text",           &["subl"]),
    ("neovim",          "Neovim",                 &["nvim"]),
    ("vim",             "Vim",                    &["vim"]),
    ("emacs",           "Emacs",                  &["emacs"]),
    ("helix",           "Helix",                  &["hx"]),
    ("fleet",           "JetBrains Fleet",        &["fleet"]),
    ("idea",            "IntelliJ IDEA",          &["idea"]),
    ("webstorm",        "WebStorm",               &["webstorm"]),
    ("rustrover",       "RustRover",              &["rustrover"]),
    ("pycharm",         "PyCharm",                &["pycharm"]),
    ("goland",          "GoLand",                 &["goland"]),
    ("clion",           "CLion",                  &["clion"]),
    ("lapce",           "Lapce",                  &["lapce"]),
    ("kate",            "Kate",                   &["kate"]),
    ("gedit",           "GNOME Text Editor",      &["gedit", "gnome-text-editor"]),
    ("nano",            "Nano",                   &["nano"]),
    ("xdg",             "System Default",         &["xdg-open"]),
];

/// Detect which editors are installed by probing $PATH.
#[tauri::command]
fn detect_editors() -> Vec<DetectedEditor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|(id, name, binaries)| {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    return Some(DetectedEditor {
                        id: id.to_string(),
                        name: name.to_string(),
                        binary: bin.to_string(),
                        available: true,
                    });
                }
            }
            None
        })
        .collect()
}

/// Open a file in the user's preferred code editor.
///
/// Resolution order:
///   1. `preferred_editor` setting (editor id from detect_editors)
///   2. `$VISUAL` / `$EDITOR` environment variable
///   3. First available GUI editor on `$PATH`
///   4. Platform default opener (xdg-open / open / start)
#[tauri::command]
async fn open_in_editor(
    state: State<'_, Arc<AppState>>,
    file_path: String,
    editor_id: Option<String>,
) -> Result<(), AppError> {
    use std::process::Command;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::not_found(format!(
            "File does not exist: {file_path}"
        )));
    }

    // 1. Explicit editor id (from arg or setting)
    let effective_id = editor_id
        .or_else(|| state.db.get_setting("khadim:preferred_editor").ok().flatten());

    if let Some(ref id) = effective_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    let result = Command::new(bin).arg(&file_path).spawn();
                    if result.is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    // 2. Check $VISUAL / $EDITOR
    for var in ["VISUAL", "EDITOR"] {
        if let Ok(editor) = std::env::var(var) {
            let editor = editor.trim().to_string();
            if !editor.is_empty() {
                let result = Command::new(&editor).arg(&file_path).spawn();
                if result.is_ok() {
                    return Ok(());
                }
            }
        }
    }

    // 3. Try first available GUI editor
    for (_, _, binaries) in KNOWN_EDITORS.iter().take(6) {
        for bin in *binaries {
            if let Ok(_) = Command::new(bin).arg(&file_path).spawn() {
                return Ok(());
            }
        }
    }

    // 4. Platform default opener
    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&file_path)
        .spawn()
        .map_err(|e| {
            AppError::io(format!(
                "Failed to open {file_path} in any editor: {e}"
            ))
        })?;

    Ok(())
}

/// Open a directory (project root) in the user's preferred editor.
#[tauri::command]
async fn open_project_in_editor(
    state: State<'_, Arc<AppState>>,
    project_path: String,
) -> Result<(), AppError> {
    use std::process::Command;

    let path = std::path::Path::new(&project_path);
    if !path.is_dir() {
        return Err(AppError::not_found(format!(
            "Directory does not exist: {project_path}"
        )));
    }

    let editor_id = state.db.get_setting("khadim:preferred_editor").ok().flatten();

    if let Some(ref id) = editor_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    let result = Command::new(bin).arg(&project_path).spawn();
                    if result.is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    // Fallback: try GUI editors that support opening folders
    for bin in ["code", "cursor", "zed", "windsurf", "subl", "idea", "webstorm", "fleet", "lapce"] {
        if let Ok(_) = Command::new(bin).arg(&project_path).spawn() {
            return Ok(());
        }
    }

    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&project_path)
        .spawn()
        .map_err(|e| AppError::io(format!("Failed to open project: {e}")))?;

    Ok(())
}

// ── App entry point ──────────────────────────────────────────────────

pub fn run() {
    env_logger::init();

    let db = Database::open().expect("Failed to open database");
    let process_runner = ProcessRunner::new();
    let opencode = OpenCodeManager::new();
    let khadim = Arc::new(KhadimManager::new());
    let claude_code = Arc::new(ClaudeCodeManager::new());
    let github = github::GitHubClient::new();
    let db_arc = Arc::new(db);
    let plugin_manager = Arc::new(PluginManager::new(Arc::clone(&db_arc)));

    // Discover plugins at startup
    let startup_plugins = plugin_manager.discover_and_load(&std::env::temp_dir());
    if !startup_plugins.is_empty() {
        log::info!(
            "Discovered {} plugin(s): {}",
            startup_plugins.len(),
            startup_plugins
                .iter()
                .map(|p| format!("{}@{}", p.name, p.version))
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    let skill_manager = Arc::new(SkillManager::new(Arc::clone(&db_arc)));
    {
        let discovered = skill_manager.discover();
        let enabled_count = discovered.iter().filter(|s| s.enabled).count();
        log::info!(
            "Discovered {} skill(s) ({} enabled)",
            discovered.len(),
            enabled_count,
        );
    }

    let app_state = Arc::new(AppState {
        db: Database::open().expect("Failed to reopen database"),
        process_runner,
        opencode,
        khadim,
        claude_code,
        github,
        plugins: plugin_manager,
        skills: skill_manager,
        terminals: Arc::new(TerminalManager::new()),
        file_index: Arc::new(FileIndexManager::new()),
        lsp: Arc::new(LspManager::new()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            // Runtime
            commands::runtime::desktop_runtime_summary,
            // Workspaces
            commands::workspace::list_workspaces,
            commands::workspace::get_workspace,
            commands::workspace::create_workspace,
            commands::workspace::set_workspace_branch,
            commands::workspace::delete_workspace,
            commands::workspace::workspace_context_get,
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_list,
            // File Finder
            commands::file_index::file_index_build,
            commands::file_index::file_search,
            commands::file_index::file_read_preview,
            commands::file_index::file_index_status,
            // LSP
            commands::lsp::lsp_hover,
            commands::lsp::lsp_definition,
            commands::lsp::lsp_document_symbols,
            commands::lsp::lsp_workspace_symbols,
            commands::lsp::lsp_list_servers,
            commands::lsp::lsp_stop,
            // Syntax highlighting
            commands::syntax::syntax_highlight,
            // Git
            commands::git::git_repo_info,
            commands::git::git_list_branches,
            commands::git::git_list_worktrees,
            commands::git::git_create_worktree,
            commands::git::git_remove_worktree,
            commands::git::git_status,
            commands::git::git_diff_stat,
            commands::git::git_diff_files,
            // Conversations
            list_conversations,
            get_conversation,
            create_conversation,
            set_conversation_backend_session,
            delete_conversation,
            // Messages
            list_messages,
            // OpenCode
            opencode_start,
            opencode_stop,
            opencode_create_session,
            opencode_list_sessions,
            opencode_list_models,
            opencode_send_message,
            opencode_send_message_async,
            opencode_send_streaming,
            opencode_abort,
            opencode_list_messages,
            opencode_get_diff,
            opencode_session_statuses,
            opencode_get_connection,
            opencode_reply_question,
            opencode_reject_question,
            // Claude Code
            claude_code_create_session,
            claude_code_list_models,
            claude_code_send_streaming,
            claude_code_abort,
            claude_code_respond_permission,
            // Khadim
            khadim_create_session,
            khadim_list_models,
            khadim_list_model_configs,
            khadim_list_providers,
            khadim_list_provider_statuses,
            khadim_save_provider_api_key,
            khadim_get_provider_api_key_masked,
            khadim_get_provider_api_key,
            khadim_delete_provider_api_key,
            khadim_bulk_create_provider_models,
            khadim_remove_provider_models,
            khadim_discover_models,
            khadim_create_model_config,
            khadim_update_model_config,
            khadim_delete_model_config,
            khadim_set_active_model_config,
            khadim_set_default_model_config,
            khadim_active_model,
            khadim_codex_auth_connected,
            khadim_codex_auth_start,
            khadim_codex_auth_status,
            khadim_codex_auth_complete,
            khadim_send_streaming,
            khadim_send_message,
            khadim_abort,
            khadim_answer_question,
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            // Processes
            commands::process::list_processes,
            // Plugins
            plugin_list,
            plugin_get,
            plugin_enable,
            plugin_disable,
            plugin_install,
            plugin_uninstall,
            plugin_list_tools,
            plugin_set_config,
            plugin_get_config,
            plugin_discover,
            plugin_dir,
            // Skills
            skill_discover,
            skill_toggle,
            skill_list_dirs,
            skill_add_dir,
            skill_remove_dir,
            // Editor
            detect_editors,
            open_in_editor,
            open_project_in_editor,
            // GitHub Auth
            github::github_auth_status,
            github::github_auth_login,
            github::github_auth_logout,
            github::github_repo_slug,
            // GitHub Issues
            github::github_issue_list,
            github::github_issue_get,
            github::github_issue_create,
            github::github_issue_edit,
            github::github_issue_close,
            github::github_issue_reopen,
            github::github_issue_comment,
            github::github_issue_comments,
            github::github_label_list,
            // GitHub PRs
            github::github_pr_list,
            github::github_pr_get,
            github::github_pr_create,
            github::github_pr_edit,
            github::github_pr_close,
            github::github_pr_comment,
            github::github_pr_comments,
            github::github_pr_merge,
            github::github_pr_diff,
            github::github_pr_checks,
            github::github_pr_review,
            // gh CLI
            github::github_gh_cli_info,
            github::github_gh_setup_git,
            // GitHub Repo creation
            github::github_create_and_push,
        ])
        .on_window_event(|window, event| {
            // Clean up processes on close
            if let tauri::WindowEvent::Destroyed = event {
                let _state = window.state::<Arc<AppState>>();
                // We can't await here, but the processes will be killed
                // when the ProcessRunner is dropped
                log::info!("Window destroyed, cleaning up processes");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
