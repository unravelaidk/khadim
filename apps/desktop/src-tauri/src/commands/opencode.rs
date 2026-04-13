use crate::error::AppError;
use crate::opencode::{AgentStreamEvent, OpenCodeManager, OpenCodeModelRef};
use crate::process::ProcessOutput;
use crate::run_lifecycle::{
    extract_text, persist_assistant_message, persist_streamed_assistant_message,
    persist_user_message,
};
use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::mpsc;

#[derive(Serialize, Clone)]
pub(crate) struct OpenCodeStarted {
    workspace_id: String,
    base_url: String,
    event_stream_url: String,
    healthy: bool,
}

#[tauri::command]
pub(crate) async fn opencode_start(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<OpenCodeStarted, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

    let working_dir = ws.worktree_path.as_deref().unwrap_or(&ws.repo_path);
    let port = crate::opencode::find_free_port()?;

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

    let _ = app.emit("opencode-ready", &result);

    Ok(result)
}

#[tauri::command]
pub(crate) async fn opencode_stop(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<(), AppError> {
    state
        .opencode
        .stop(&workspace_id, &state.process_runner)
        .await
}

fn connection_for_workspace(
    state: &Arc<AppState>,
    workspace_id: &str,
) -> Result<crate::opencode::OpenCodeConnection, AppError> {
    state.opencode.get_connection(workspace_id).ok_or_else(|| {
        AppError::not_found(format!(
            "No OpenCode server running for workspace {workspace_id}"
        ))
    })
}

#[tauri::command]
pub(crate) async fn opencode_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::create_session(&conn).await
}

#[tauri::command]
pub(crate) async fn opencode_list_sessions(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::list_sessions(&conn).await
}

#[tauri::command]
pub(crate) async fn opencode_list_models(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<crate::opencode::OpenCodeModelOption>, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::list_models(&conn).await
}

#[tauri::command]
pub(crate) async fn opencode_send_message(
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    let response = OpenCodeManager::send_message(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    )
    .await?;

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
pub(crate) async fn opencode_send_message_async(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    )
    .await
}

#[tauri::command]
pub(crate) async fn opencode_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;

    persist_user_message(state.inner(), &conversation_id, &content)?;

    let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    state
        .opencode
        .subscribe_events(&conn, workspace_id.clone(), session_id.clone(), tx);

    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    )
    .await?;

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

            if evt.event_type == "text_delta" {
                if let Some(ref text) = evt.content {
                    full_content.push_str(text);
                }
            }

            if evt.event_type == "usage_update" {
                if let Some(ref meta) = evt.metadata {
                    let input = meta
                        .get("input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    let output = meta
                        .get("output_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
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
                state_arc
                    .opencode
                    .clear_event_subscription(&session_id_for_cleanup);
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub(crate) async fn opencode_abort(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<(), AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::abort_session(&conn, &session_id).await
}

#[tauri::command]
pub(crate) async fn opencode_list_messages(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::list_messages(&conn, &session_id).await
}

#[tauri::command]
pub(crate) async fn opencode_get_diff(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::get_diff(&conn, &session_id).await
}

#[tauri::command]
pub(crate) async fn opencode_session_statuses(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::session_statuses(&conn).await
}

#[tauri::command]
pub(crate) async fn opencode_get_connection(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Option<crate::opencode::OpenCodeConnection>, AppError> {
    Ok(state.opencode.get_connection(&workspace_id))
}

#[tauri::command]
pub(crate) async fn opencode_reply_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
    answers: Vec<Vec<String>>,
) -> Result<(), AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::reply_question(&conn, &request_id, &answers).await
}

#[tauri::command]
pub(crate) async fn opencode_reject_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
) -> Result<(), AppError> {
    let conn = connection_for_workspace(state.inner(), &workspace_id)?;
    OpenCodeManager::reject_question(&conn, &request_id).await
}
