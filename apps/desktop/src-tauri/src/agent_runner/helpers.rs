//! Shared helper functions for agent runners.
//!
//! These are transport-agnostic utilities that any runner (local, docker,
//! cloud, etc.) can reuse without duplicating logic.

use crate::db::{Database, ManagedAgent};
use crate::error::AppError;
use crate::khadim_ai::model_settings;
use crate::khadim_ai::types::ModelSelection;
use std::collections::HashMap;

/// Substitute `{{key}}` placeholders in a template string with values from a map.
///
/// This is used by all runners to expand agent instructions before execution.
pub fn substitute_variables(template: &str, vars: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{{key}}}}}"), value);
    }
    result
}

/// Truncate a string to `max_len` characters, appending `"..."` if it was cut.
///
/// Used to create run result summaries from potentially long output.
pub fn truncate_summary(text: &str, max_len: usize) -> String {
    if text.len() > max_len {
        format!("{}...", &text[..max_len])
    } else {
        text.to_string()
    }
}

/// Convert a credential name into a normalised environment variable key.
///
/// For example `"My API Key"` becomes `"KHADIM_CREDENTIAL_MY_API_KEY"`.
/// Non-alphanumeric characters are replaced with underscores and the whole
/// thing is uppercased.  Leading/trailing underscores are trimmed.
pub fn credential_env_key(name: &str) -> String {
    let mut normalized = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch.to_ascii_uppercase());
        } else {
            normalized.push('_');
        }
    }

    let trimmed = normalized.trim_matches('_');
    if trimmed.is_empty() {
        "KHADIM_CREDENTIAL".to_string()
    } else {
        format!("KHADIM_CREDENTIAL_{}", trimmed)
    }
}

/// Resolve a [`ModelSelection`] for a managed agent.
///
/// 1. If the agent has an explicit `model_id` (format `"provider:model"`),
///    look it up in the saved model configs and return the full selection
///    including API key and base URL.
/// 2. Otherwise fall back to the globally active model.
/// 3. If neither is available, return an error.
///
/// This is deliberately runner-agnostic so it can be used by local, docker,
/// cloud, or any future runner that needs to know which model to use.
pub fn resolve_agent_model(
    db: &Database,
    agent: &ManagedAgent,
) -> Result<ModelSelection, AppError> {
    // If agent has a model_id like "provider:model", parse it
    if let Some(ref model_id) = agent.model_id {
        if !model_id.is_empty() {
            let parts: Vec<&str> = model_id.splitn(2, ':').collect();
            if parts.len() == 2 {
                let configs = model_settings::list_configs(db)?;
                if let Some(config) = configs
                    .iter()
                    .find(|c| c.provider == parts[0] && c.model == parts[1])
                {
                    return Ok(ModelSelection {
                        provider: config.provider.clone(),
                        model_id: config.model.clone(),
                        display_name: Some(config.name.clone()),
                        api_key: config.api_key.clone().or_else(|| {
                            model_settings::saved_provider_api_key(&config.provider)
                                .ok()
                                .flatten()
                        }),
                        base_url: config.base_url.clone(),
                    });
                }

                return Ok(ModelSelection {
                    provider: parts[0].to_string(),
                    model_id: parts[1].to_string(),
                    display_name: None,
                    api_key: model_settings::saved_provider_api_key(parts[0])
                        .ok()
                        .flatten(),
                    base_url: None,
                });
            }
        }
    }

    // Fall back to active/default model
    let active = model_settings::active_model_option(db)?;
    if let Some(m) = active {
        let configs = model_settings::list_configs(db)?;
        if let Some(config) = configs
            .iter()
            .find(|c| c.provider == m.provider_id && c.model == m.model_id)
        {
            return Ok(ModelSelection {
                provider: config.provider.clone(),
                model_id: config.model.clone(),
                display_name: Some(config.name.clone()),
                api_key: config.api_key.clone().or_else(|| {
                    model_settings::saved_provider_api_key(&config.provider)
                        .ok()
                        .flatten()
                }),
                base_url: config.base_url.clone(),
            });
        }
    }

    Err(AppError::invalid_input(
        "No model configured. Add a model in Settings → Providers.".to_string(),
    ))
}

/// Return the current UTC time as an RFC 3339 string.
///
/// Centralised so every module uses the same format and clock source.
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Try to repair truncated JSON from models that hit output token limits.
///
/// Handles common cases like `{"path":"foo.html","content":"<div>...`
/// (unclosed string / object / array).
pub fn try_repair_json(raw: &str) -> Option<serde_json::Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // If it already parses, nothing to repair
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Some(v);
    }
    // Count unclosed braces/brackets and unterminated strings
    let mut in_string = false;
    let mut escape = false;
    let mut brace_depth: i32 = 0;
    let mut bracket_depth: i32 = 0;
    for ch in trimmed.chars() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if !in_string {
            match ch {
                '{' => brace_depth += 1,
                '}' => brace_depth -= 1,
                '[' => bracket_depth += 1,
                ']' => bracket_depth -= 1,
                _ => {}
            }
        }
    }
    let mut repaired = trimmed.to_string();
    // Close unterminated string
    if in_string {
        repaired.push('"');
    }
    // Close brackets then braces
    for _ in 0..bracket_depth {
        repaired.push(']');
    }
    for _ in 0..brace_depth {
        repaired.push('}');
    }
    serde_json::from_str::<serde_json::Value>(&repaired)
        .ok()
        .or_else(|| {
            log::debug!(
                "JSON repair also failed for: {:?}",
                &repaired[..repaired.len().min(200)]
            );
            None
        })
}
