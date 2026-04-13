use crate::claude_code::{ClaudeCodeManager, ClaudeCodeSessionCreated};
use crate::error::AppError;
use crate::opencode::{AgentStreamEvent, OpenCodeModelRef};
use crate::run_lifecycle::{emit_error_and_done, persist_user_message, StreamAccumulator};
use crate::AppState;
use serde::Deserialize;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Deserialize)]
struct ClaudeCodeBridgeEvent {
    event_type: String,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[tauri::command]
pub(crate) async fn claude_code_create_session(
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
pub(crate) fn claude_code_list_models(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<crate::opencode::OpenCodeModelOption>, AppError> {
    Ok(state.claude_code.list_models())
}

#[tauri::command]
pub(crate) async fn claude_code_send_streaming(
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
                            content: Some(format!(
                                "Failed to send input to Claude Code bridge: {error}"
                            )),
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
                            content: Some(format!(
                                "Failed to finalize input for Claude Code bridge: {error}"
                            )),
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
                            content: Some(format!(
                                "Failed to flush Claude Code bridge input: {error}"
                            )),
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

            if matches!(
                parsed.event_type.as_str(),
                "step_start" | "step_update" | "step_complete"
            ) {
                if let Some(metadata) = event.metadata.as_ref().and_then(|value| value.as_object()) {
                    if let Some(step_id) = metadata.get("id").and_then(|value| value.as_str()) {
                        let mut next_step = stream.current_step(step_id).unwrap_or_else(|| {
                            serde_json::json!({
                                "id": step_id,
                                "title": metadata
                                    .get("title")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("Working"),
                                "status": "running",
                            })
                        });

                        if let Some(obj) = next_step.as_object_mut() {
                            if let Some(title) = metadata.get("title").and_then(|value| value.as_str()) {
                                obj.insert(
                                    "title".to_string(),
                                    serde_json::Value::String(title.to_string()),
                                );
                            }
                            if let Some(tool) = metadata.get("tool").and_then(|value| value.as_str()) {
                                obj.insert(
                                    "tool".to_string(),
                                    serde_json::Value::String(tool.to_string()),
                                );
                            }
                            if let Some(result) =
                                metadata.get("result").and_then(|value| value.as_str())
                            {
                                obj.insert(
                                    "result".to_string(),
                                    serde_json::Value::String(result.to_string()),
                                );
                            }
                            if let Some(content) =
                                event.content.as_ref().filter(|value| !value.trim().is_empty())
                            {
                                obj.insert(
                                    "content".to_string(),
                                    serde_json::Value::String(content.clone()),
                                );
                                if parsed.event_type == "step_complete" && !obj.contains_key("result") {
                                    obj.insert(
                                        "result".to_string(),
                                        serde_json::Value::String(content.clone()),
                                    );
                                }
                            }
                            let status = match parsed.event_type.as_str() {
                                "step_complete" => {
                                    if metadata.get("is_error").and_then(|value| value.as_bool())
                                        == Some(true)
                                    {
                                        "error"
                                    } else {
                                        "complete"
                                    }
                                }
                                _ => "running",
                            };
                            obj.insert(
                                "status".to_string(),
                                serde_json::Value::String(status.to_string()),
                            );
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
pub(crate) async fn claude_code_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.claude_code.abort(&session_id).await
}

#[tauri::command]
pub(crate) fn claude_code_respond_permission(
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
