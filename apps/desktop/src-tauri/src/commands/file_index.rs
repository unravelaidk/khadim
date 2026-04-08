use crate::error::AppError;
use crate::file_index::{FileIndexStatus, FilePreview, FileSearchResult};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn file_index_build(
    state: State<'_, Arc<AppState>>,
    root: String,
) -> Result<FileIndexStatus, AppError> {
    state.file_index.build(&root)
}

#[tauri::command]
pub(crate) fn file_search(
    state: State<'_, Arc<AppState>>,
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, AppError> {
    state.file_index.search(&root, &query, max_results)
}

#[tauri::command]
pub(crate) fn file_read_preview(
    state: State<'_, Arc<AppState>>,
    root: String,
    relative_path: String,
    max_bytes: Option<usize>,
) -> Result<FilePreview, AppError> {
    state
        .file_index
        .read_preview(&root, &relative_path, max_bytes)
}

#[tauri::command]
pub(crate) fn file_index_status(
    state: State<'_, Arc<AppState>>,
    root: String,
) -> Option<FileIndexStatus> {
    state.file_index.status(&root)
}
