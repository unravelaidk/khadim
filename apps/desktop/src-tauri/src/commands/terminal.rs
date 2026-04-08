use crate::error::AppError;
use crate::terminal::TerminalSession;
use crate::{workspace_context, AppState};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub(crate) fn terminal_create(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    workspace_id: String,
    conversation_id: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSession, AppError> {
    let resolved_cwd = match cwd {
        Some(value) if Path::new(&value).is_dir() => value,
        _ => {
            let context =
                workspace_context::resolve(&state.db, &workspace_id, conversation_id.as_deref())?;
            context.cwd
        }
    };

    state.terminals.create(
        &app,
        workspace_id,
        conversation_id,
        resolved_cwd,
        cols,
        rows,
    )
}

#[tauri::command]
pub(crate) fn terminal_write(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    state.terminals.write(&session_id, &data)
}

#[tauri::command]
pub(crate) fn terminal_resize(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    state.terminals.resize(&session_id, cols, rows)
}

#[tauri::command]
pub(crate) fn terminal_close(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.terminals.close(&session_id)
}

#[tauri::command]
pub(crate) fn terminal_list(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
) -> Vec<TerminalSession> {
    match workspace_id {
        Some(id) => state.terminals.list_for_workspace(&id),
        None => state.terminals.list(),
    }
}
