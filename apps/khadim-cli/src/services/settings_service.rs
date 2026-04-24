use crate::domain::settings::StoredSettings;
use khadim_ai_core::error::AppError;
use std::fs;
use std::io;
use std::path::PathBuf;

pub fn settings_path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .map(|dir| dir.join("khadim"))
        .ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("cli-settings.json"))
}

pub fn load_settings() -> Result<StoredSettings, AppError> {
    let path = settings_path()?;
    let mut settings = match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str::<StoredSettings>(&content)
            .map_err(|err| AppError::io(format!("Failed to parse CLI settings: {err}")))?,
        Err(err) if err.kind() == io::ErrorKind::NotFound => StoredSettings::default(),
        Err(err) => return Err(AppError::io(format!("Failed to read CLI settings: {err}"))),
    };
    settings.migrate_legacy_key();
    Ok(settings)
}

pub fn save_settings(settings: &StoredSettings) -> Result<(), AppError> {
    let path = settings_path()?;
    let mut merged = load_settings().unwrap_or_default();
    merged.provider = settings.provider.clone();
    merged.model_id = settings.model_id.clone();
    merged.api_key = None;
    merged.theme_family = settings.theme_family.clone();
    merged.theme_variant = settings.theme_variant.clone();
    for (k, v) in &settings.api_keys {
        merged.api_keys.insert(k.clone(), v.clone());
    }
    let content = serde_json::to_string_pretty(&merged)
        .map_err(|err| AppError::io(format!("Failed to encode CLI settings: {err}")))?;
    fs::write(path, format!("{content}\n"))?;
    Ok(())
}

/// Build effective settings by merging config overrides with stored settings.
pub fn effective_settings(
    config: &crate::args::CliConfig,
    settings: &StoredSettings,
) -> StoredSettings {
    let mut effective = StoredSettings {
        provider: config
            .provider
            .clone()
            .or_else(|| settings.provider.clone()),
        model_id: config.model.clone().or_else(|| settings.model_id.clone()),
        api_key: None,
        api_keys: settings.api_keys.clone(),
        theme_family: settings.theme_family.clone(),
        theme_variant: settings.theme_variant.clone(),
        system_prompt: settings.system_prompt.clone(),
    };
    if let (Some(ref provider), Some(ref key)) =
        (settings.provider.clone(), settings.api_key.clone())
    {
        if !key.trim().is_empty() && !effective.api_keys.contains_key(provider) {
            effective.api_keys.insert(provider.clone(), key.clone());
        }
    }
    effective
}
