use khadim_ai_core::env_api_keys::get_env_api_key;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Stored Settings (persisted) ──────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StoredSettings {
    pub provider: Option<String>,
    pub model_id: Option<String>,
    /// Legacy single key (migrated to `api_keys` on load)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Per-provider API keys: `provider_id` -> key
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

    /// Migrate legacy single `api_key` into `api_keys` map
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

/// Which row the user is currently focused on inside the settings panel.
///
/// The `Auth` row adapts to the current provider: for OAuth providers it
/// triggers login/logout; for API-key providers it exposes an editable key
/// field. There is no longer a separate "editing key" mode — the key field
/// is always editable when `Auth` is focused on an API-key provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsFocus {
    Provider,
    Model,
    Auth,
}

/// Which sub-picker (if any) is currently expanded. `None` means the user
/// is browsing the row list. When `Some`, keyboard events go to the picker
/// list until the user confirms or cancels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsPicker {
    Provider,
    Model,
}

/// Transient UI state for the settings panel.
///
/// Provider and model selection persist to `StoredSettings` immediately
/// when chosen. The API key is *staged* in `api_key_buffer` and written
/// on blur (focus change, panel close) so typing mid-key doesn't produce
/// partial writes. No explicit save step is required from the user.
#[derive(Debug, Clone)]
pub struct SettingsState {
    pub focus: SettingsFocus,
    pub picker: Option<SettingsPicker>,
    pub picker_index: usize,
    pub api_key_buffer: String,
    pub api_key_cursor: usize,
}
