use crate::db::Workspace;
use crate::error::AppError;
use crate::{git, workspace_context, AppState};
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

#[derive(Deserialize)]
pub(crate) struct CreateWorkspaceInput {
    name: String,
    repo_path: String,
    branch: Option<String>,
    backend: Option<String>,
    execution_target: Option<String>,
}

#[tauri::command]
pub(crate) fn list_workspaces(state: State<'_, Arc<AppState>>) -> Result<Vec<Workspace>, AppError> {
    state.db.list_workspaces()
}

#[tauri::command]
pub(crate) fn get_workspace(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Workspace, AppError> {
    state.db.get_workspace(&id)
}

#[tauri::command]
pub(crate) fn create_workspace(
    state: State<'_, Arc<AppState>>,
    input: CreateWorkspaceInput,
) -> Result<Workspace, AppError> {
    if !git::is_git_repo(&input.repo_path) {
        return Err(AppError::invalid_input(format!(
            "{} is not a git repository",
            input.repo_path
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let backend = input.backend.unwrap_or_else(|| "opencode".to_string());
    let target = input
        .execution_target
        .unwrap_or_else(|| "local".to_string());
    let branch = input
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            git::repo_info(&input.repo_path)
                .ok()
                .and_then(|info| info.current_branch)
        });

    let ws = Workspace {
        id: id.clone(),
        name: input.name,
        repo_path: input.repo_path,
        worktree_path: None,
        branch,
        backend,
        execution_target: target,
        sandbox_id: None,
        created_at: now.clone(),
        updated_at: now,
    };

    state.db.create_workspace(&ws)?;
    Ok(ws)
}

#[tauri::command]
pub(crate) fn delete_workspace(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let ws = state.db.get_workspace(&id)?;
    if let Some(ref wt_path) = ws.worktree_path {
        let _ = git::remove_worktree(&ws.repo_path, wt_path, true);
    }
    state.db.delete_workspace(&id)
}

#[tauri::command]
pub(crate) fn set_workspace_branch(
    state: State<'_, Arc<AppState>>,
    id: String,
    branch: Option<String>,
) -> Result<(), AppError> {
    let normalized = branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    state.db.update_workspace_branch(&id, normalized)
}

#[tauri::command]
pub(crate) fn workspace_context_get(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    conversation_id: Option<String>,
) -> Result<workspace_context::DesktopWorkspaceContext, AppError> {
    workspace_context::resolve(&state.db, &workspace_id, conversation_id.as_deref())
}
