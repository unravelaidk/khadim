// ── OAuth provider list ──────────────────────────────────────────────

pub fn oauth_provider_list() -> Vec<OAuthProviderEntry> {
    vec![
        OAuthProviderEntry {
            id: "github-copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            logged_in: khadim_ai_core::oauth::has_copilot_auth_sync().unwrap_or(false),
        },
        OAuthProviderEntry {
            id: "openai-codex".to_string(),
            name: "OpenAI Codex".to_string(),
            logged_in: khadim_ai_core::oauth::has_openai_codex_auth_sync().unwrap_or(false),
        },
    ]
}

// ── Login state ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OAuthProviderEntry {
    pub id: String,
    pub name: String,
    pub logged_in: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoginPhase {
    SelectProvider, // Choosing which OAuth provider
    InProgress,     // Waiting for OAuth flow
}

#[derive(Debug, Clone)]
pub struct LoginState {
    pub phase: LoginPhase,
    pub providers: Vec<OAuthProviderEntry>,
    pub selected_index: usize,
    pub messages: Vec<String>,       // progress messages
    pub url: Option<String>,         // URL to open
    pub device_code: Option<String>, // device code to enter
}
