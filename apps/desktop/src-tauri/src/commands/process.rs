use crate::process::ProcessInfo;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn list_processes(state: State<'_, Arc<AppState>>) -> Vec<ProcessInfo> {
    state.process_runner.list()
}
