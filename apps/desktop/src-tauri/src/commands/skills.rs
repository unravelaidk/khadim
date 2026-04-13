use crate::skills::SkillEntry;
use crate::{error::AppError, AppState};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn skill_discover(state: State<'_, Arc<AppState>>) -> Vec<SkillEntry> {
    state.skills.discover()
}

#[tauri::command]
pub(crate) fn skill_toggle(
    state: State<'_, Arc<AppState>>,
    skill_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    state.skills.set_enabled(&skill_id, enabled)
}

#[tauri::command]
pub(crate) fn skill_list_dirs(state: State<'_, Arc<AppState>>) -> Vec<String> {
    state.skills.list_dirs()
}

#[tauri::command]
pub(crate) fn skill_add_dir(
    state: State<'_, Arc<AppState>>,
    dir: String,
) -> Result<Vec<String>, AppError> {
    state.skills.add_dir(&dir)
}

#[tauri::command]
pub(crate) fn skill_remove_dir(
    state: State<'_, Arc<AppState>>,
    dir: String,
) -> Result<Vec<String>, AppError> {
    state.skills.remove_dir(&dir)
}
