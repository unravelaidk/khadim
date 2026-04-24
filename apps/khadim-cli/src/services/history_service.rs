use khadim_ai_core::error::AppError;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

const MAX_HISTORY: usize = 1000;

pub fn history_path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .map(|dir| dir.join("khadim"))
        .ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("cli-history.txt"))
}

pub fn load_history() -> Result<Vec<String>, AppError> {
    let path = history_path()?;
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
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| AppError::io(format!("Failed to open history file: {e}")))?;
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
