use crate::domain::session::{SavedSession, SessionMeta};
use crate::domain::transcript::TranscriptEntry;
use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ChatMessage;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn sessions_dir() -> Result<PathBuf, AppError> {
    let dir = crate::services::settings_service::khadim_config_dir()?.join("sessions");
    crate::services::settings_service::create_private_dir_all(&dir)?;
    Ok(dir)
}

fn is_windows_reserved_basename(name: &str) -> bool {
    let basename = name
        .trim_end_matches([' ', '.'])
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(basename.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (basename.len() == 4
            && (basename.starts_with("COM") || basename.starts_with("LPT"))
            && matches!(basename.as_bytes()[3], b'1'..=b'9'))
}

fn session_path(name: &str) -> Result<PathBuf, AppError> {
    let dir = sessions_dir()?;
    let mut safe = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if is_windows_reserved_basename(&safe) {
        safe.insert_str(0, "_device_");
    }
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
        crate::services::settings_service::secure_existing_private_file(&path)
            .map_err(|e| AppError::io(format!("Failed to secure session file: {e}")))?;
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
    if !crate::services::settings_service::secure_existing_private_file(&path)
        .map_err(|e| AppError::io(format!("Failed to secure session file: {e}")))?
    {
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
    atomic_write(&path, format!("{content}\n").as_bytes())
        .map_err(|e| AppError::io(format!("Failed to write session file: {e}")))?;
    Ok(())
}

/// Replace `path` atomically by writing and syncing a temporary file in the
/// same directory before persisting it over the destination. `tempfile` uses
/// the platform replacement primitive, including replacement of an existing
/// destination on Windows.
fn atomic_write(path: &Path, content: &[u8]) -> io::Result<()> {
    crate::services::settings_service::atomic_write_private(path, content)
}

pub fn generate_session_name() -> String {
    static SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let sequence = SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!(
        "session-{}-{:09}-{}-{sequence}",
        now.as_secs(),
        now.subsec_nanos(),
        std::process::id()
    )
}

/// Validate the opaque engine session key accepted by one-shot CLI commands.
/// This intentionally does not use the legacy filename sanitization: callers
/// must supply the exact safe key that names the persisted session.
pub fn validate_session_key(key: &str) -> Result<(), AppError> {
    if key.is_empty()
        || key.len() > 180
        || !key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(AppError::invalid_input(
            "Invalid session key; expected 1-180 characters matching [A-Za-z0-9._-]",
        ));
    }
    if matches!(key, "." | "..") || is_windows_reserved_basename(key) {
        return Err(AppError::invalid_input(
            "Invalid session key; Windows device basenames and dot-only names are reserved",
        ));
    }
    Ok(())
}

/// Delete the exact saved session named by an engine key. Missing sessions are
/// a successful no-op so callers can safely retry privacy cleanup.
pub fn delete_session_by_key(key: &str) -> Result<bool, AppError> {
    let dir = sessions_dir()?;
    delete_session_by_key_in(&dir, key)
}

fn delete_session_by_key_in(dir: &Path, key: &str) -> Result<bool, AppError> {
    validate_session_key(key)?;
    let path = dir.join(format!("{key}.json"));
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AppError::io(format!(
            "Failed to delete session '{key}': {error}"
        ))),
    }
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
            "Session '{old_name}' does not exist"
        )));
    }
    if new_path.exists() {
        return Err(AppError::invalid_input(format!(
            "Session '{new_name}' already exists"
        )));
    }
    crate::services::settings_service::make_path_private(&old_path)
        .map_err(|e| AppError::io(format!("Failed to secure session file: {e}")))?;
    fs::rename(&old_path, &new_path)
        .map_err(|e| AppError::io(format!("Failed to rename session file: {e}")))?;
    crate::services::settings_service::make_path_private(&new_path)
        .map_err(|e| AppError::io(format!("Failed to secure renamed session file: {e}")))?;
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

/// Build a `SavedSession` from current state.
#[allow(clippy::too_many_arguments)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_session_key_validation_matches_the_cli_contract() {
        let max_length = "x".repeat(180);
        for valid in ["a", "chat-123", "draft.v2_key", max_length.as_str()] {
            validate_session_key(valid).expect("valid session key");
        }
        let too_long = "x".repeat(181);
        for invalid in [
            "",
            "../outside",
            "contains space",
            "slash/name",
            "colon:name",
            "å",
            too_long.as_str(),
        ] {
            let error = validate_session_key(invalid).expect_err("invalid session key");
            assert!(error.message.contains("[A-Za-z0-9._-]"));
        }

        for reserved in [
            ".",
            "..",
            "CON",
            "con",
            "CON.backup",
            "PRN",
            "AUX",
            "NUL",
            "COM1",
            "com9.log",
            "LPT1",
            "lpt9.txt",
        ] {
            let error = validate_session_key(reserved).expect_err("reserved session key");
            assert!(error.message.contains("reserved"));
        }
        for valid in ["CONSOLE", "COM0", "COM10", "LPT0", "LPT10"] {
            validate_session_key(valid).expect("non-device session key");
        }
    }

    #[test]
    fn exact_session_deletion_is_idempotent() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("chat-123.json");
        fs::write(&path, b"private transcript").expect("seed session");

        assert!(delete_session_by_key_in(temp.path(), "chat-123").expect("first deletion"));
        assert!(!path.exists());
        assert!(!delete_session_by_key_in(temp.path(), "chat-123").expect("retry deletion"));
    }

    #[test]
    fn generated_session_names_do_not_collide_within_a_process() {
        let names = (0..1_000)
            .map(|_| generate_session_name())
            .collect::<std::collections::HashSet<_>>();

        assert_eq!(names.len(), 1_000);
        assert!(names.iter().all(|name| name.starts_with("session-")));
    }

    #[test]
    fn atomic_write_replaces_the_destination_and_cleans_up_its_temp_file() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("session.json");
        fs::write(&path, b"last known good").expect("seed destination");

        atomic_write(&path, b"updated session").expect("first atomic replacement");
        atomic_write(&path, b"updated again").expect("repeat atomic replacement");

        assert_eq!(fs::read(&path).expect("read destination"), b"updated again");
        let remaining: Vec<_> = fs::read_dir(temp.path())
            .expect("read temp dir")
            .map(|entry| entry.expect("dir entry").file_name())
            .collect();
        assert_eq!(remaining, vec![std::ffi::OsString::from("session.json")]);
    }
}
