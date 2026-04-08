use crate::error::AppError;
use crate::lsp::{LspHoverResult, LspLocation, LspServerStatus, LspSymbol, LspWorkspaceSymbol};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn lsp_hover(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<LspHoverResult>, AppError> {
    state.lsp.hover(&root, &file_path, line, character)
}

#[tauri::command]
pub(crate) fn lsp_definition(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<LspLocation>, AppError> {
    state.lsp.definition(&root, &file_path, line, character)
}

#[tauri::command]
pub(crate) fn lsp_document_symbols(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
) -> Result<Vec<LspSymbol>, AppError> {
    state.lsp.document_symbols(&root, &file_path)
}

#[tauri::command]
pub(crate) fn lsp_workspace_symbols(
    state: State<'_, Arc<AppState>>,
    root: String,
    query: String,
    language_hint: Option<String>,
) -> Result<Vec<LspWorkspaceSymbol>, AppError> {
    state
        .lsp
        .workspace_symbols(&root, &query, language_hint.as_deref())
}

#[tauri::command]
pub(crate) fn lsp_list_servers(state: State<'_, Arc<AppState>>) -> Vec<LspServerStatus> {
    state.lsp.list_servers()
}

#[tauri::command]
pub(crate) fn lsp_stop(state: State<'_, Arc<AppState>>, root: Option<String>) {
    match root {
        Some(r) => state.lsp.stop_for_root(&r),
        None => state.lsp.stop_all(),
    }
}
