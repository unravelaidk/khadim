use crate::backend::{run_streaming_prompt, BackendPrompt, OpenCodeBackend};
use crate::error::AppError;
use crate::opencode::{OpenCodeManager, OpenCodeModelRef};
use crate::process::ProcessOutput;
use crate::run_lifecycle::{extract_text, persist_assistant_message, persist_user_message};
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
        .start(
            &workspace_id,
            working_dir,
            port,
            &state.process_runner,
            Some(tx),
        )
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
    let backend = OpenCodeBackend::new(state.inner().clone(), &workspace_id)?;
    run_streaming_prompt(
        state.inner().clone(),
        app,
        backend,
        BackendPrompt {
            workspace_id,
            session_id,
            conversation_id: Some(conversation_id),
            active_agent_id: None,
            content,
            model,
            system,
        },
    )
    .await
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
