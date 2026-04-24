use crate::domain::session::{SavedSession, SessionMeta};
use crate::domain::transcript::TranscriptEntry;
use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ChatMessage;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn sessions_dir() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .map(|dir| dir.join("khadim").join("sessions"))
        .ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn session_path(name: &str) -> Result<PathBuf, AppError> {
    let dir = sessions_dir()?;
    let safe = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    Ok(dir.join(format!("{safe}.json")))
}

pub fn list_sessions() -> Result<Vec<SessionMeta>, AppError> {
    let dir = sessions_dir()?;
    let mut sessions = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| AppError::io(format!("Failed to read sessions dir: {e}")))?;
    for entry in entries {
        let entry = entry.map_err(|e| AppError::io(format!("Failed to read dir entry: {e}")))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path).ok();
        if let Some(content) = content {
            if let Ok(session) = serde_json::from_str::<SavedSession>(&content) {
                sessions.push(SessionMeta {
                    name: session.name,
                    updated_at_unix: session.updated_at_unix,
                    entry_count: session.entries.len(),
                });
            }
        }
    }
    sessions.sort_by(|a, b| b.updated_at_unix.cmp(&a.updated_at_unix));
    Ok(sessions)
}

pub fn load_session(name: &str) -> Result<Option<SavedSession>, AppError> {
    let path = session_path(name)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::io(format!("Failed to read session file: {e}")))?;
    let mut session: SavedSession = serde_json::from_str(&content)
        .map_err(|e| AppError::io(format!("Failed to parse session file: {e}")))?;
    // Ensure the session name matches the requested name in case of rename drift
    session.name = name.to_string();
    Ok(Some(session))
}

pub fn save_session(name: &str, session: &SavedSession) -> Result<(), AppError> {
    let path = session_path(name)?;
    let content = serde_json::to_string_pretty(session)
        .map_err(|e| AppError::io(format!("Failed to encode session: {e}")))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|e| AppError::io(format!("Failed to write session file: {e}")))?;
    Ok(())
}

pub fn generate_session_name() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("session-{}", now)
}

pub fn delete_session(name: &str) -> Result<(), AppError> {
    let path = session_path(name)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| AppError::io(format!("Failed to delete session file: {e}")))?;
    }
    Ok(())
}

pub fn rename_session(old_name: &str, new_name: &str) -> Result<(), AppError> {
    if old_name == new_name {
        return Ok(());
    }
    let old_path = session_path(old_name)?;
    let new_path = session_path(new_name)?;
    if !old_path.exists() {
        return Err(AppError::invalid_input(format!(
            "Session '{}' does not exist",
            old_name
        )));
    }
    if new_path.exists() {
        return Err(AppError::invalid_input(format!(
            "Session '{}' already exists",
            new_name
        )));
    }
    fs::rename(&old_path, &new_path)
        .map_err(|e| AppError::io(format!("Failed to rename session file: {e}")))?;
    Ok(())
}

#[allow(dead_code)]
pub fn session_exists(name: &str) -> Result<bool, AppError> {
    let path = session_path(name)?;
    Ok(path.exists())
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn format_age(unix: u64) -> String {
    let now = now_unix();
    let diff = now.saturating_sub(unix);
    if diff < 60 {
        format!("{diff}s ago")
    } else if diff < 3600 {
        format!("{}m ago", diff / 60)
    } else if diff < 86400 {
        format!("{}h ago", diff / 3600)
    } else {
        format!("{}d ago", diff / 86400)
    }
}

/// Build a SavedSession from current state.
pub fn build_saved_session(
    name: String,
    cwd: String,
    messages: Vec<ChatMessage>,
    entries: Vec<TranscriptEntry>,
    tokens_in: u64,
    tokens_out: u64,
    tokens_cache_read: u64,
    tokens_cache_write: u64,
    current_mode: String,
    created_at_unix: Option<u64>,
) -> SavedSession {
    let now = now_unix();
    SavedSession {
        name,
        created_at_unix: created_at_unix.unwrap_or(now),
        updated_at_unix: now,
        cwd,
        messages,
        entries,
        tokens_in,
        tokens_out,
        tokens_cache_read,
        tokens_cache_write,
        current_mode,
    }
}
