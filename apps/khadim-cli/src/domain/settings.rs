use khadim_ai_core::env_api_keys::get_env_api_key;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Stored Settings (persisted) ──────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StoredSettings {
    pub provider: Option<String>,
    pub model_id: Option<String>,
    /// Legacy single key (migrated to api_keys on load)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Per-provider API keys: provider_id -> key
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub api_keys: HashMap<String, String>,
    /// Theme family (default, catppuccin, nord, etc.)
    #[serde(default)]
    pub theme_family: Option<String>,
    /// Theme variant (dark, light, mocha, latte, etc.)
    #[serde(default)]
    pub theme_variant: Option<String>,
    /// Custom system prompt override
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
}

impl StoredSettings {
    /// Get the API key for a specific provider, checking:
    /// 1. Per-provider stored key
    /// 2. Legacy single key (if provider matches)
    /// 3. Environment variable
    pub fn get_api_key_for(&self, provider: &str) -> Option<String> {
        // Per-provider stored key
        if let Some(key) = self.api_keys.get(provider) {
            if !key.trim().is_empty() {
                return Some(key.clone());
            }
        }
        // Legacy single key
        if self.provider.as_deref() == Some(provider) {
            if let Some(ref key) = self.api_key {
                if !key.trim().is_empty() {
                    return Some(key.clone());
                }
            }
        }
        // Environment variable
        get_env_api_key(provider)
    }

    /// Migrate legacy single api_key into api_keys map
    pub fn migrate_legacy_key(&mut self) {
        if let (Some(ref provider), Some(ref key)) = (self.provider.clone(), self.api_key.clone()) {
            if !key.trim().is_empty() && !self.api_keys.contains_key(provider) {
                self.api_keys.insert(provider.clone(), key.clone());
            }
        }
    }

    /// Check if a provider has any authentication available
    #[allow(dead_code)]
    pub fn is_provider_authenticated(&self, provider: &str) -> bool {
        self.get_api_key_for(provider).is_some() || is_oauth_provider(provider)
    }
}

/// Providers that use OAuth instead of API keys
pub fn is_oauth_provider(provider: &str) -> bool {
    matches!(provider, "openai-codex" | "github-copilot")
}

// ── Settings UI State (not persisted) ────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsFocus {
    Provider,
    Model,
    ApiKey,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsMode {
    Browsing,   // Navigating between fields
    Choosing,   // Choosing from a list (provider or model)
    EditingKey, // Editing the API key text
}

#[derive(Debug, Clone)]
pub struct SettingsState {
    pub provider_index: usize,
    pub model_index: usize,
    pub api_key: String,
    pub api_key_cursor: usize,
    pub focus: SettingsFocus,
    pub mode: SettingsMode,
    pub list_scroll: usize,
}
