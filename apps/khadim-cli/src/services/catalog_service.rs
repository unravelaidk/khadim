use crate::domain::models::ProviderCatalog;
use crate::domain::settings::{is_oauth_provider, StoredSettings};
use khadim_ai_core::env_api_keys::get_env_api_key;
use khadim_ai_core::models::{find_or_synth_model, list_model_options};
use khadim_ai_core::pricing::{self, format_cost as core_format_cost};
use khadim_ai_core::types::Usage;
use std::collections::BTreeMap;

// ── General utilities ────────────────────────────────────────────────

#[allow(dead_code)]
pub fn clamp_index(index: usize, len: usize) -> usize {
    if len == 0 {
        0
    } else {
        index.min(len.saturating_sub(1))
    }
}

// ── Provider / Model catalog ─────────────────────────────────────────

pub fn provider_catalog() -> Vec<ProviderCatalog> {
    let mut providers = BTreeMap::<String, String>::new();
    for option in list_model_options() {
        providers
            .entry(option.provider_id)
            .or_insert(option.provider_name);
    }
    providers
        .into_iter()
        .map(|(id, name)| ProviderCatalog { id, name })
        .collect()
}

pub fn models_for_provider(provider: &str) -> Vec<(String, String)> {
    list_model_options()
        .into_iter()
        .filter(|option| option.provider_id == provider)
        .map(|option| (option.model_id, option.model_name))
        .collect()
}

// ── Auth status ──────────────────────────────────────────────────────

pub fn has_oauth_credentials(provider: &str) -> bool {
    match provider {
        "openai-codex" => khadim_ai_core::oauth::has_openai_codex_auth_sync().unwrap_or(false),
        "github-copilot" => khadim_ai_core::oauth::has_copilot_auth_sync().unwrap_or(false),
        _ => false,
    }
}

pub fn provider_auth_status(settings: &StoredSettings, provider: &str) -> &'static str {
    if is_oauth_provider(provider) {
        if has_oauth_credentials(provider) || get_env_api_key(provider).is_some() {
            "✓ connected"
        } else {
            "✗ not connected (use /login)"
        }
    } else if settings.get_api_key_for(provider).is_some() {
        "✓ configured"
    } else {
        "✗ missing key"
    }
}

// ── Model metadata ───────────────────────────────────────────────────

/// Max tokens the model can hold in context. Falls back to 0 when unknown.
pub fn context_window_for(provider: &str, model_id: &str) -> u64 {
    find_or_synth_model(provider, model_id).context_window
}

// ── Cost estimation ──────────────────────────────────────────────────

pub fn estimate_cost(
    provider: &str,
    model_id: &str,
    tokens_in: u64,
    tokens_out: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    let model = find_or_synth_model(provider, model_id);
    let usage = Usage {
        input: tokens_in,
        output: tokens_out,
        cache_read,
        cache_write,
    };
    pricing::calculate_cost(&model, &usage)
}

pub fn format_cost(cost: f64) -> String {
    core_format_cost(cost)
}

pub fn format_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

// ── Tool name helpers ────────────────────────────────────────────────

pub fn friendly_tool_name(tool: &str) -> String {
    match tool {
        "model" => "thinking".to_string(),
        "read" => "read".to_string(),
        "write" => "write".to_string(),
        "edit" => "edit".to_string(),
        "bash" => "bash".to_string(),
        "grep" => "grep".to_string(),
        "glob" => "glob".to_string(),
        "web_search" => "search".to_string(),
        "ls" => "ls".to_string(),
        "delegate_to_agent" => "agent".to_string(),
        _ => tool.to_string(),
    }
}
