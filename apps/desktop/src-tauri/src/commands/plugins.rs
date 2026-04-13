use crate::error::AppError;
use crate::plugins::{PluginEntry, PluginToolInfo};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) fn plugin_list(state: State<'_, Arc<AppState>>) -> Vec<PluginEntry> {
    state.plugins.list_plugins()
}

#[tauri::command]
pub(crate) fn plugin_get(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<PluginEntry, AppError> {
    state
        .plugins
        .get_plugin(&plugin_id)
        .ok_or_else(|| AppError::not_found(format!("Plugin not found: {plugin_id}")))
}

#[tauri::command]
pub(crate) fn plugin_enable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    state.plugins.enable_plugin(&plugin_id, &root)
}

#[tauri::command]
pub(crate) fn plugin_disable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<PluginEntry, AppError> {
    state.plugins.disable_plugin(&plugin_id)
}

#[tauri::command]
pub(crate) fn plugin_install(
    state: State<'_, Arc<AppState>>,
    source_dir: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    state
        .plugins
        .install_from_dir(std::path::Path::new(&source_dir), &root)
}

#[tauri::command]
pub(crate) fn plugin_uninstall(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<(), AppError> {
    state.plugins.uninstall(&plugin_id)
}

#[tauri::command]
pub(crate) fn plugin_list_tools(state: State<'_, Arc<AppState>>) -> Vec<PluginToolInfo> {
    state.plugins.all_plugin_tools()
}

#[tauri::command]
pub(crate) fn plugin_set_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.plugins.set_plugin_config(&plugin_id, &key, &value)
}

#[tauri::command]
pub(crate) fn plugin_get_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, AppError> {
    state.plugins.get_plugin_config(&plugin_id, &key)
}

#[tauri::command]
pub(crate) fn plugin_discover(
    state: State<'_, Arc<AppState>>,
    workspace_root: Option<String>,
) -> Vec<PluginEntry> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    state.plugins.discover_and_load(&root)
}

#[tauri::command]
pub(crate) fn plugin_dir(state: State<'_, Arc<AppState>>) -> String {
    state.plugins.plugins_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub(crate) fn plugin_store_get(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
) -> Option<String> {
    state.plugins.store_get(&plugin_id, &key)
}

#[tauri::command]
pub(crate) fn plugin_store_set(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.plugins.store_set(&plugin_id, &key, &value)
}
