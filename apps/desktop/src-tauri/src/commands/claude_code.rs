use crate::backend::{run_streaming_prompt, BackendPrompt, ClaudeCodeBackend};
use crate::claude_code::ClaudeCodeSessionCreated;
use crate::error::AppError;
use crate::opencode::OpenCodeModelRef;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

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
        .or_else(|| {
            workspace
                .worktree_path
                .as_ref()
                .map(std::path::PathBuf::from)
        })
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
    let backend = ClaudeCodeBackend::new(state.inner().clone());
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
            system: None,
        },
    )
    .await
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
