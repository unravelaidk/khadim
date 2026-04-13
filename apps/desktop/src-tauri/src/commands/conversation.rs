use crate::db::{ChatMessage, Conversation};
use crate::error::AppError;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn list_conversations(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<Conversation>, AppError> {
    state.db.list_conversations(&workspace_id)
}

#[tauri::command]
pub(crate) fn get_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Conversation, AppError> {
    state.db.get_conversation(&id)
}

#[tauri::command]
pub(crate) fn create_conversation(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Conversation, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

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
pub(crate) fn set_conversation_backend_session(
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
pub(crate) fn delete_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_conversation(&id)
}

#[tauri::command]
pub(crate) fn list_messages(
    state: State<'_, Arc<AppState>>,
    conversation_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    state.db.list_messages(&conversation_id)
}
