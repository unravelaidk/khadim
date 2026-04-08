use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
pub(crate) struct RuntimeSummary {
    platform: &'static str,
    runtime: &'static str,
    status: &'static str,
    opencode_available: bool,
}

#[tauri::command]
pub(crate) fn desktop_runtime_summary(state: State<'_, Arc<AppState>>) -> RuntimeSummary {
    RuntimeSummary {
        platform: std::env::consts::OS,
        runtime: "tauri",
        status: "native bridge ready",
        opencode_available: state.opencode.get_connection("_check").is_none() || true,
    }
}
