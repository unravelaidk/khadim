use crate::error::AppError;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn get_setting(
    state: State<'_, Arc<AppState>>,
    key: String,
) -> Result<Option<String>, AppError> {
    state.db.get_setting(&key)
}

#[tauri::command]
pub(crate) fn set_setting(
    state: State<'_, Arc<AppState>>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.db.set_setting(&key, &value)
}
