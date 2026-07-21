use khadim_ai_core::error::AppError;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

const MAX_HISTORY: usize = 1000;

pub fn history_path() -> Result<PathBuf, AppError> {
    Ok(crate::services::settings_service::khadim_config_dir()?.join("cli-history.txt"))
}

pub fn load_history() -> Result<Vec<String>, AppError> {
    let path = history_path()?;
    if !crate::services::settings_service::secure_existing_private_file(&path)
        .map_err(|err| AppError::io(format!("Failed to secure history file: {err}")))?
    {
        return Ok(Vec::new());
    }
    let file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(AppError::io(format!("Failed to read history: {err}"))),
    };
    let reader = io::BufReader::new(file);
    let mut history = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| AppError::io(format!("Failed to read history line: {e}")))?;
        if !line.trim().is_empty() && !line.starts_with('/') {
            history.push(line);
        }
    }
    // Deduplicate adjacent entries and limit size
    history = dedup_and_limit(history);
    Ok(history)
}

pub fn append_history(prompt: &str) -> Result<(), AppError> {
    if prompt.trim().is_empty() || prompt.starts_with('/') {
        return Ok(());
    }
    let path = history_path()?;
    // Harden legacy history before opening it, then harden the returned file
    // again to cover the create path.
    crate::services::settings_service::secure_existing_private_file(&path)
        .map_err(|e| AppError::io(format!("Failed to secure history file: {e}")))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| AppError::io(format!("Failed to open history file: {e}")))?;
    crate::services::settings_service::make_file_private(&file, &path)
        .map_err(|e| AppError::io(format!("Failed to secure history file: {e}")))?;
    writeln!(file, "{prompt}")
        .map_err(|e| AppError::io(format!("Failed to write history: {e}")))?;
    Ok(())
}

fn dedup_and_limit(items: Vec<String>) -> Vec<String> {
    // Remove consecutive duplicates
    let mut deduped = Vec::new();
    for item in items {
        if deduped.last() != Some(&item) {
            deduped.push(item);
        }
    }
    // Keep only the last MAX_HISTORY entries
    if deduped.len() > MAX_HISTORY {
        deduped.split_off(deduped.len() - MAX_HISTORY)
    } else {
        deduped
    }
}

#[allow(dead_code)]
pub fn filter_history(history: &[String], prefix: &str) -> Vec<String> {
    if prefix.is_empty() {
        history.to_vec()
    } else {
        history
            .iter()
            .rev()
            .filter(|h| h.to_lowercase().starts_with(&prefix.to_lowercase()))
            .cloned()
            .collect()
    }
}
