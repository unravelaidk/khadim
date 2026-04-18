use crate::args::CliConfig;
use crate::themes;
use khadim_ai_core::error::AppError;
use khadim_ai_core::env_api_keys::get_env_api_key;
use khadim_ai_core::models::list_model_options;
use khadim_ai_core::types::ModelSelection;
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io;
use std::path::PathBuf;

// ── Settings types ─────────────────────────────────────────────────────

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

// ── Slash command definitions ───────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SlashCommand {
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
}

pub fn all_slash_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand { name: "/help",      description: "Show all commands & shortcuts",  icon: "❓" },
        SlashCommand { name: "/theme",     description: "Switch theme",                 icon: "🎨" },
        SlashCommand { name: "/provider",  description: "Switch AI provider",             icon: "🔌" },
        SlashCommand { name: "/model",     description: "Switch model",                   icon: "🧠" },
        SlashCommand { name: "/login",     description: "OAuth login (Copilot, Codex)",   icon: "🔑" },
        SlashCommand { name: "/settings",  description: "Open settings panel (F2)",       icon: "⚙" },
        SlashCommand { name: "/providers", description: "List providers & auth status",    icon: "📋" },
        SlashCommand { name: "/reset",     description: "Reset session",                  icon: "↻" },
        SlashCommand { name: "/clear",     description: "Clear screen",                   icon: "🧹" },
        SlashCommand { name: "/exit",      description: "Quit khadim",                    icon: "🚪" },
    ]
}

pub fn filter_slash_commands(input: &str) -> Vec<SlashCommand> {
    if !input.starts_with('/') {
        return vec![];
    }
    let query = input.to_lowercase();
    all_slash_commands()
        .into_iter()
        .filter(|cmd| cmd.name.starts_with(&query))
        .collect()
}

// ── Command picker state (for /provider and /model) ─────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandPickerKind {
    Provider,
    Model,
    Theme,
}

#[derive(Debug, Clone)]
pub struct CommandPickerState {
    pub kind: CommandPickerKind,
    pub items: Vec<(String, String, String)>, // (id, name, status)
    pub selected_index: usize,
    pub current_index: usize, // currently active item
}

/// Check if an OAuth provider has stored credentials
pub fn has_oauth_credentials(provider: &str) -> bool {
    match provider {
        "openai-codex" => khadim_ai_core::oauth::has_openai_codex_auth_sync().unwrap_or(false),
        "github-copilot" => khadim_ai_core::oauth::has_copilot_auth_sync().unwrap_or(false),
        _ => false,
    }
}

/// Get display string for provider auth status
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

/// Build list of OAuth-capable providers with login status
pub fn oauth_provider_list() -> Vec<OAuthProviderEntry> {
    let mut entries = Vec::new();
    for p in provider_catalog() {
        if is_oauth_provider(&p.id) {
            entries.push(OAuthProviderEntry {
                id: p.id.clone(),
                name: p.name.clone(),
                logged_in: has_oauth_credentials(&p.id),
            });
        }
    }
    entries
}

#[derive(Debug, Clone)]
pub struct ProviderCatalog {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsFocus {
    Provider,
    Model,
    ApiKey,
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
    SelectProvider,  // Choosing which OAuth provider
    InProgress,      // Waiting for OAuth flow
}

#[derive(Debug, Clone)]
pub struct LoginState {
    pub phase: LoginPhase,
    pub providers: Vec<OAuthProviderEntry>,
    pub selected_index: usize,
    pub messages: Vec<String>,        // progress messages
    pub url: Option<String>,          // URL to open
    pub device_code: Option<String>,  // device code to enter
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

// ── Transcript entries ────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub enum TranscriptEntry {
    System { text: String },
    User { text: String },
    AssistantText { text: String },
    #[allow(dead_code)]
    Thinking { text: String },
    #[allow(dead_code)]
    ToolStart { tool: String, title: String },
    ToolComplete { tool: String, content: String, is_error: bool, collapsed: bool },
    Error { text: String },
    Separator,
}

// ── Worker event ──────────────────────────────────────────────────────

pub enum WorkerEvent {
    Stream(khadim_coding_agent::events::AgentStreamEvent),
    Finished(Result<String, khadim_ai_core::error::AppError>),
    LoginProgress {
        url: Option<String>,
        device_code: Option<String>,
        message: String,
    },
    LoginComplete {
        success: bool,
        message: String,
    },
}

// ── Spinner ───────────────────────────────────────────────────────────

const SPINNER_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub fn spinner_frame(tick: u64) -> &'static str {
    SPINNER_FRAMES[(tick as usize) % SPINNER_FRAMES.len()]
}

// ── TuiApp ────────────────────────────────────────────────────────────

pub struct TuiApp {
    pub input: String,
    pub cursor: usize,
    pub entries: Vec<TranscriptEntry>,
    pub status: String,
    pub pending: bool,
    pub streaming_text: bool,
    pub turn_count: usize,
    pub scroll_offset: u16,
    pub auto_scroll: bool,
    pub tools_collapsed: bool,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub tokens_cache_read: u64,
    pub tokens_cache_write: u64,
    pub content_lines: Cell<u16>,
    pub visible_height: Cell<u16>,
    pub current_mode: String,
    pub settings_open: bool,
    pub settings_dirty: bool,
    pub settings: SettingsState,
    pub input_focused: bool,
    pub tick_count: u64,
    pub login_state: Option<LoginState>,
    pub command_preview_index: usize,
    pub command_picker: Option<CommandPickerState>,
}

impl TuiApp {
    pub fn new(config: &CliConfig, settings: &StoredSettings) -> Self {
        let eff = effective_settings(config, settings);
        let provider_id = eff.provider.as_deref().unwrap_or("(not set)");
        let key_status = provider_auth_status(&eff, provider_id);

        // Detect available providers from env vars
        let mut auto_detected = Vec::new();
        for p in provider_catalog() {
            if get_env_api_key(&p.id).is_some() || has_oauth_credentials(&p.id) {
                auto_detected.push(p.name.clone());
            }
        }

        let mut entries = vec![
            TranscriptEntry::System {
                text: "✦ khadim-cli — AI coding agent".into(),
            },
            TranscriptEntry::System {
                text: format!("  provider: {}  |  model: {}  |  auth: {}",
                    provider_id,
                    eff.model_id.as_deref().unwrap_or("(not set)"),
                    key_status,
                ),
            },
        ];

        if !auto_detected.is_empty() {
            entries.push(TranscriptEntry::System {
                text: format!("  detected: {}", auto_detected.join(", ")),
            });
        }

        entries.push(TranscriptEntry::System {
            text: "  enter send · shift+enter newline · esc abort · ctrl+l clear · ctrl+o tools · F2 settings".into(),
        });
        entries.push(TranscriptEntry::System {
            text: "  type / to see all commands".into(),
        });
        entries.push(TranscriptEntry::Separator);

        Self {
            input: String::new(),
            cursor: 0,
            entries,
            status: "idle".into(),
            pending: false,
            streaming_text: false,
            turn_count: 0,
            scroll_offset: 0,
            auto_scroll: true,
            tools_collapsed: false,
            tokens_in: 0,
            tokens_out: 0,
            tokens_cache_read: 0,
            tokens_cache_write: 0,
            content_lines: Cell::new(0),
            visible_height: Cell::new(0),
            current_mode: "auto".into(),
            settings_open: false,
            settings_dirty: false,
            settings: build_settings_state(settings),
            input_focused: true,
            tick_count: 0,
            login_state: None,
            command_preview_index: 0,
            command_picker: None,
        }
    }

    pub fn clear(&mut self, config: &CliConfig, settings: &StoredSettings) {
        *self = Self::new(config, settings);
    }

    pub fn tick(&mut self) {
        self.tick_count = self.tick_count.wrapping_add(1);
    }

    pub fn submit_user_prompt(&mut self, prompt: &str) {
        self.entries.push(TranscriptEntry::User { text: prompt.to_string() });
        self.pending = true;
        self.streaming_text = false;
        self.turn_count += 1;
        self.status = "running".into();
        self.auto_scroll = true;
    }

    pub fn ensure_assistant_entry(&mut self) {
        let is_assistant = self.entries.last().map_or(false, |e| matches!(e, TranscriptEntry::AssistantText { .. }));
        if !self.streaming_text || !is_assistant {
            self.entries.push(TranscriptEntry::AssistantText { text: String::new() });
            self.streaming_text = true;
        }
    }

    pub fn finish_turn(&mut self) {
        self.pending = false;
        self.streaming_text = false;
        self.status = "idle".into();
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn apply_event(&mut self, event: khadim_coding_agent::events::AgentStreamEvent) {
        let tool_name = event.metadata.as_ref()
            .and_then(|m| m.get("tool"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        match event.event_type.as_str() {
            "text_delta" => {
                if let Some(content) = event.content {
                    self.ensure_assistant_entry();
                    if let Some(TranscriptEntry::AssistantText { text }) = self.entries.last_mut() {
                        text.push_str(&content);
                    }
                }
            }
            "step_start" => {
                let title = event.content.clone().unwrap_or_default();
                self.streaming_text = false;

                if tool_name == "model" {
                    self.status = "thinking...".into();
                } else {
                    // Friendly tool names
                    let display_name = friendly_tool_name(&tool_name);
                    self.status = format!("{} {}", display_name, truncate_status(&title, 40));
                }
            }
            "step_update" => {
                if let Some(content) = event.content {
                    self.status = truncate_status(&content, 60);
                }
            }
            "step_complete" => {
                let content = event.content.unwrap_or_default();
                let is_error = event.metadata.as_ref()
                    .and_then(|m| m.get("is_error"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if tool_name == "model" {
                    if !content.is_empty() {
                        self.ensure_assistant_entry();
                        if let Some(TranscriptEntry::AssistantText { text }) = self.entries.last_mut() {
                            text.push_str(&content);
                        }
                    }
                    self.status = "idle".into();
                } else {
                    self.status = "idle".into();
                    self.entries.push(TranscriptEntry::ToolComplete {
                        tool: tool_name,
                        content,
                        is_error,
                        collapsed: self.tools_collapsed,
                    });
                }
            }
            "usage" => {
                if let Some(metadata) = &event.metadata {
                    if let Some(input) = metadata.get("input").and_then(|v| v.as_u64()) {
                        self.tokens_in = self.tokens_in.saturating_add(input);
                    }
                    if let Some(output) = metadata.get("output").and_then(|v| v.as_u64()) {
                        self.tokens_out = self.tokens_out.saturating_add(output);
                    }
                    if let Some(cache_read) = metadata.get("cache_read").and_then(|v| v.as_u64()) {
                        self.tokens_cache_read = self.tokens_cache_read.saturating_add(cache_read);
                    }
                    if let Some(cache_write) = metadata.get("cache_write").and_then(|v| v.as_u64()) {
                        self.tokens_cache_write = self.tokens_cache_write.saturating_add(cache_write);
                    }
                }
            }
            "error" => {
                if let Some(content) = event.content {
                    self.status = "error".into();
                    self.entries.push(TranscriptEntry::Error { text: content });
                }
            }
            "mode_selected" => {
                if let Some(mode) = event.metadata.as_ref().and_then(|m| m.get("mode")).and_then(|v| v.as_str()) {
                    self.current_mode = mode.to_string();
                }
            }
            "done" => self.finish_turn(),
            "system_message" => {
                if let Some(content) = event.content {
                    self.entries.push(TranscriptEntry::System { text: content });
                    self.entries.push(TranscriptEntry::Separator);
                }
            }
            _ => {}
        }
    }

    pub fn finish_result(&mut self, result: Result<String, khadim_ai_core::error::AppError>) {
        if let Err(error) = result {
            self.entries.push(TranscriptEntry::Error { text: error.message });
        }
        if self.pending {
            self.finish_turn();
        }
    }

    pub fn abort(&mut self) {
        self.pending = false;
        self.streaming_text = false;
        self.status = "aborted".into();
        self.entries.push(TranscriptEntry::Error { text: "Agent aborted by user".into() });
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn abort_with_message(&mut self, msg: &str) {
        self.pending = false;
        self.streaming_text = false;
        self.status = "error".into();
        self.entries.push(TranscriptEntry::Error { text: msg.to_string() });
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn open_login_selector(&mut self) {
        let providers = oauth_provider_list();
        if providers.is_empty() {
            self.entries.push(TranscriptEntry::System { text: "No OAuth providers available.".into() });
            self.entries.push(TranscriptEntry::Separator);
            return;
        }
        self.login_state = Some(LoginState {
            phase: LoginPhase::SelectProvider,
            providers,
            selected_index: 0,
            messages: Vec::new(),
            url: None,
            device_code: None,
        });
    }

    pub fn start_login_for_provider(&mut self, provider_id: &str) {
        if let Some(ref mut login) = self.login_state {
            let name = login.providers.iter()
                .find(|p| p.id == provider_id)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| provider_id.to_string());
            login.phase = LoginPhase::InProgress;
            login.messages = vec![format!("🔑 Logging in to {}...", name)];
        }
    }

    pub fn login_add_message(&mut self, msg: String) {
        if let Some(ref mut login) = self.login_state {
            login.messages.push(msg);
        }
    }

    pub fn login_set_url(&mut self, url: String) {
        if let Some(ref mut login) = self.login_state {
            login.url = Some(url);
        }
    }

    pub fn login_set_device_code(&mut self, code: String) {
        if let Some(ref mut login) = self.login_state {
            login.device_code = Some(code);
        }
    }

    pub fn close_login(&mut self) {
        self.login_state = None;
    }

    // ── Command preview helpers ──────────────────────────────────────

    pub fn slash_preview_visible(&self) -> bool {
        !self.pending && self.input.starts_with('/') && self.command_picker.is_none()
            && self.login_state.is_none() && !self.settings_open
    }

    pub fn filtered_commands(&self) -> Vec<SlashCommand> {
        filter_slash_commands(&self.input)
    }

    pub fn preview_move_up(&mut self) {
        if self.command_preview_index > 0 {
            self.command_preview_index -= 1;
        }
    }

    pub fn preview_move_down(&mut self) {
        let cmds = self.filtered_commands();
        if self.command_preview_index + 1 < cmds.len() {
            self.command_preview_index += 1;
        }
    }

    pub fn preview_accept(&mut self) -> Option<String> {
        let cmds = self.filtered_commands();
        if let Some(cmd) = cmds.get(self.command_preview_index) {
            let name = cmd.name.to_string();
            self.input = name.clone();
            self.cursor = name.chars().count();
            self.command_preview_index = 0;
            Some(name)
        } else {
            None
        }
    }

    // ── Command picker ───────────────────────────────────────────────

    pub fn open_provider_picker(&mut self, settings: &StoredSettings) {
        let providers = provider_catalog();
        let current = providers.iter()
            .position(|p| settings.provider.as_deref() == Some(p.id.as_str()))
            .unwrap_or(0);
        let items: Vec<(String, String, String)> = providers.iter().map(|p| {
            let status = provider_auth_status(settings, &p.id).to_string();
            (p.id.clone(), p.name.clone(), status)
        }).collect();
        self.command_picker = Some(CommandPickerState {
            kind: CommandPickerKind::Provider,
            items,
            selected_index: current,
            current_index: current,
        });
    }

    pub fn open_model_picker(&mut self, settings: &StoredSettings) {
        let provider_id = settings.provider.as_deref().unwrap_or("openai");
        let models = models_for_provider(provider_id);
        let current = models.iter()
            .position(|(id, _)| settings.model_id.as_deref() == Some(id.as_str()))
            .unwrap_or(0);
        let items: Vec<(String, String, String)> = models.iter().map(|(id, name)| {
            (id.clone(), name.clone(), String::new())
        }).collect();
        self.command_picker = Some(CommandPickerState {
            kind: CommandPickerKind::Model,
            items,
            selected_index: current,
            current_index: current,
        });
    }

    pub fn open_theme_picker(&mut self, settings: &StoredSettings) {
        // Build list of all themes with their variants
        // Item id format: "family:variant" to uniquely identify each theme
        let mut items: Vec<(String, String, String)> = Vec::new();
        let current_family = settings.theme_family.as_deref().unwrap_or("default");
        let current_variant = settings.theme_variant.as_deref().unwrap_or("dark");
        for catalog in themes::all_themes() {
            for variant in &catalog.variants {
                let combo_id = format!("{}:{}", catalog.family.id(), variant.id());
                let name = format!("{} ({})", catalog.family.label(), variant.id());
                let is_active = current_family == catalog.family.id() && current_variant == variant.id();
                let status = if is_active { "✓ active" } else { "" };
                items.push((combo_id, name, status.to_string()));
            }
        }
        let current = items.iter().position(|(id, _, _)| {
            *id == format!("{}:{}", current_family, current_variant)
        }).unwrap_or(0);

        self.command_picker = Some(CommandPickerState {
            kind: CommandPickerKind::Theme,
            items,
            selected_index: current,
            current_index: current,
        });
    }

    pub fn picker_move_up(&mut self) {
        if let Some(ref mut picker) = self.command_picker {
            if picker.selected_index > 0 {
                picker.selected_index -= 1;
            }
        }
    }

    pub fn picker_move_down(&mut self) {
        if let Some(ref mut picker) = self.command_picker {
            if picker.selected_index + 1 < picker.items.len() {
                picker.selected_index += 1;
            }
        }
    }

    pub fn picker_selected(&self) -> Option<(String, String)> {
        self.command_picker.as_ref().and_then(|p| {
            p.items.get(p.selected_index).map(|(id, name, _)| (id.clone(), name.clone()))
        })
    }

    pub fn close_picker(&mut self) {
        self.command_picker = None;
    }

    pub fn login_move_up(&mut self) {
        if let Some(ref mut login) = self.login_state {
            if login.selected_index > 0 {
                login.selected_index -= 1;
            }
        }
    }

    pub fn login_move_down(&mut self) {
        if let Some(ref mut login) = self.login_state {
            if login.selected_index + 1 < login.providers.len() {
                login.selected_index += 1;
            }
        }
    }

    pub fn login_selected_provider(&self) -> Option<String> {
        self.login_state.as_ref().and_then(|login| {
            login.providers.get(login.selected_index).map(|p| p.id.clone())
        })
    }

    pub fn toggle_tool_collapse(&mut self) {
        self.tools_collapsed = !self.tools_collapsed;
        for entry in &mut self.entries {
            if let TranscriptEntry::ToolComplete { collapsed, .. } = entry {
                *collapsed = self.tools_collapsed;
            }
        }
    }

    pub fn enter_field(&mut self) {
        match self.settings.focus {
            SettingsFocus::Provider | SettingsFocus::Model => {
                self.settings.mode = SettingsMode::Choosing;
                self.settings.list_scroll = match self.settings.focus {
                    SettingsFocus::Provider => self.settings.provider_index,
                    SettingsFocus::Model => self.settings.model_index,
                    SettingsFocus::ApiKey => 0,
                };
            }
            SettingsFocus::ApiKey => {
                self.settings.mode = SettingsMode::EditingKey;
                self.settings.api_key_cursor = self.settings.api_key.chars().count();
            }
        }
    }

    pub fn exit_field(&mut self) {
        self.settings.mode = SettingsMode::Browsing;
    }

    pub fn select_current_option(&mut self) {
        match self.settings.focus {
            SettingsFocus::Provider => {
                self.settings.provider_index = self.settings.list_scroll;
                self.settings.model_index = 0; // reset model when provider changes
                // Load the API key for the newly selected provider
                let providers = provider_catalog();
                if let Some(p) = providers.get(clamp_index(self.settings.provider_index, providers.len())) {
                    self.settings.api_key = get_env_api_key(&p.id)
                        .unwrap_or_default();
                }
                self.settings_dirty = true;
            }
            SettingsFocus::Model => {
                self.settings.model_index = self.settings.list_scroll;
                self.settings_dirty = true;
            }
            SettingsFocus::ApiKey => {}
        }
        self.settings.mode = SettingsMode::Browsing;
    }

    pub fn move_focus_up(&mut self) {
        self.settings.focus = match self.settings.focus {
            SettingsFocus::Provider => SettingsFocus::ApiKey,
            SettingsFocus::Model => SettingsFocus::Provider,
            SettingsFocus::ApiKey => SettingsFocus::Model,
        };
    }

    pub fn move_focus_down(&mut self) {
        self.settings.focus = match self.settings.focus {
            SettingsFocus::Provider => SettingsFocus::Model,
            SettingsFocus::Model => SettingsFocus::ApiKey,
            SettingsFocus::ApiKey => SettingsFocus::Provider,
        };
    }

    pub fn move_list_up(&mut self) {
        if self.settings.list_scroll > 0 {
            self.settings.list_scroll -= 1;
        }
    }

    pub fn move_list_down(&mut self) {
        let max = match self.settings.focus {
            SettingsFocus::Provider => provider_catalog().len(),
            SettingsFocus::Model => {
                let providers = provider_catalog();
                let provider = providers.get(clamp_index(self.settings.provider_index, providers.len()));
                models_for_provider(provider.map(|p| p.id.as_str()).unwrap_or("openai")).len()
            }
            SettingsFocus::ApiKey => 0,
        };
        if self.settings.list_scroll + 1 < max {
            self.settings.list_scroll += 1;
        }
    }

    pub fn move_provider(&mut self, delta: isize) {
        let providers = provider_catalog();
        if providers.is_empty() { return; }
        let next = ((self.settings.provider_index as isize + delta)
            .rem_euclid(providers.len() as isize)) as usize;
        self.settings.provider_index = next;
        self.settings.model_index = 0;
        // Update the displayed API key for the new provider
        if let Some(p) = providers.get(next) {
            self.settings.api_key = get_env_api_key(&p.id)
                .unwrap_or_default();
        }
        self.settings_dirty = true;
    }

    pub fn move_model(&mut self, delta: isize) {
        let providers = provider_catalog();
        let Some(provider) = providers.get(clamp_index(self.settings.provider_index, providers.len())) else {
            return;
        };
        let models = models_for_provider(&provider.id);
        if models.is_empty() { return; }
        let next = ((self.settings.model_index as isize + delta)
            .rem_euclid(models.len() as isize)) as usize;
        self.settings.model_index = next;
        self.settings_dirty = true;
    }
}

// ── Helper functions ─────────────────────────────────────────────────

fn friendly_tool_name(tool: &str) -> String {
    match tool {
        "model" => "🧠 thinking".to_string(),
        "read" => "📖 read".to_string(),
        "write" => "✏️ write".to_string(),
        "edit" => "✏️ edit".to_string(),
        "bash" => "💻 bash".to_string(),
        "grep" => "🔍 grep".to_string(),
        "glob" => "🔍 glob".to_string(),
        "web_search" => "🌐 search".to_string(),
        "ls" => "📁 ls".to_string(),
        "delegate_to_agent" => "🤖 agent".to_string(),
        _ => tool.to_string(),
    }
}

fn truncate_status(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end = s.char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        format!("{}…", &s[..end])
    }
}

// ── Settings persistence ─────────────────────────────────────────────

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
    // Migrate legacy single api_key into per-provider map
    settings.migrate_legacy_key();
    Ok(settings)
}

pub fn save_settings(settings: &StoredSettings) -> Result<(), AppError> {
    let path = settings_path()?;
    // When saving, merge with existing per-provider keys so we don't lose them
    let mut merged = load_settings().unwrap_or_default();
    merged.provider = settings.provider.clone();
    merged.model_id = settings.model_id.clone();
    merged.api_key = None; // clear legacy field
    merged.theme_family = settings.theme_family.clone();
    merged.theme_variant = settings.theme_variant.clone();
    // Merge new keys into existing
    for (k, v) in &settings.api_keys {
        merged.api_keys.insert(k.clone(), v.clone());
    }
    let content = serde_json::to_string_pretty(&merged)
        .map_err(|err| AppError::io(format!("Failed to encode CLI settings: {err}")))?;
    fs::write(path, format!("{content}\n"))?;
    Ok(())
}

// ── Model catalog helpers ────────────────────────────────────────────

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

pub fn clamp_index(index: usize, len: usize) -> usize {
    if len == 0 { 0 } else { index.min(len.saturating_sub(1)) }
}

pub fn build_settings_state(settings: &StoredSettings) -> SettingsState {
    let providers = provider_catalog();
    let provider_index = providers
        .iter()
        .position(|p| settings.provider.as_deref() == Some(p.id.as_str()))
        .unwrap_or(0);
    let selected_provider = providers
        .get(provider_index)
        .map(|p| p.id.as_str())
        .unwrap_or("openai");
    let models = models_for_provider(selected_provider);
    let model_index = models
        .iter()
        .position(|(id, _)| settings.model_id.as_deref() == Some(id.as_str()))
        .unwrap_or(0);

    // Get the API key for the currently selected provider
    let api_key = settings.get_api_key_for(selected_provider).unwrap_or_default();

    SettingsState {
        provider_index,
        model_index,
        api_key,
        api_key_cursor: 0,
        focus: SettingsFocus::Provider,
        mode: SettingsMode::Browsing,
        list_scroll: 0,
    }
}

pub fn stored_settings_from_state(state: &SettingsState) -> StoredSettings {
    let providers = provider_catalog();
    let provider = providers.get(clamp_index(state.provider_index, providers.len()));
    let models = provider
        .map(|p| models_for_provider(&p.id))
        .unwrap_or_default();
    let model = models.get(clamp_index(state.model_index, models.len()));

    let provider_id = provider.map(|p| p.id.clone());
    let mut api_keys = HashMap::new();
    if let Some(ref pid) = provider_id {
        if !state.api_key.trim().is_empty() {
            api_keys.insert(pid.clone(), state.api_key.trim().to_string());
        }
    }

    StoredSettings {
        provider: provider_id,
        model_id: model.map(|(id, _)| id.clone()),
        api_key: None,
        api_keys,
        theme_family: None,
        theme_variant: None,
    }
}

pub fn effective_settings(config: &CliConfig, settings: &StoredSettings) -> StoredSettings {
    let mut effective = StoredSettings {
        provider: config.provider.clone().or_else(|| settings.provider.clone()),
        model_id: config.model.clone().or_else(|| settings.model_id.clone()),
        api_key: None, // deprecated field
        api_keys: settings.api_keys.clone(),
        theme_family: settings.theme_family.clone(),
        theme_variant: settings.theme_variant.clone(),
    };
    // Merge legacy key
    if let (Some(ref provider), Some(ref key)) = (settings.provider.clone(), settings.api_key.clone()) {
        if !key.trim().is_empty() && !effective.api_keys.contains_key(provider) {
            effective.api_keys.insert(provider.clone(), key.clone());
        }
    }
    effective
}

pub fn model_selection(config: &CliConfig, settings: &StoredSettings) -> Option<ModelSelection> {
    let effective = effective_settings(config, settings);
    let provider = effective.provider.as_ref()?;
    let model_id = effective.model_id.as_ref()?;
    let api_key = effective.get_api_key_for(provider);
    let base_url = khadim_ai_core::env_api_keys::get_env_base_url(provider);
    Some(ModelSelection {
        provider: provider.clone(),
        model_id: model_id.clone(),
        display_name: None,
        api_key,
        base_url,
    })
}

// ── Token cost estimation ────────────────────────────────────────────

pub fn estimate_cost(provider: &str, model_id: &str, tokens_in: u64, tokens_out: u64, cache_read: u64, cache_write: u64) -> f64 {
    let (input_rate, output_rate, cache_read_rate, cache_write_rate) = match (provider, model_id) {
        ("anthropic", m) if m.contains("claude-4-opus") => (15.0, 75.0, 1.5, 18.75),
        ("anthropic", m) if m.contains("claude-sonnet-4") => (3.0, 15.0, 0.3, 3.75),
        ("anthropic", m) if m.contains("claude-3-5-sonnet") => (3.0, 15.0, 0.3, 3.75),
        ("anthropic", m) if m.contains("claude-3-opus") => (15.0, 75.0, 1.5, 18.75),
        ("anthropic", m) if m.contains("claude-3-haiku") => (0.25, 1.25, 0.03, 0.3),
        ("openai", m) if m.contains("o3") => (10.0, 40.0, 2.5, 12.5),
        ("openai", m) if m.contains("o4-mini") => (1.1, 4.4, 0.55, 2.2),
        ("openai", m) if m.contains("gpt-4.1") => (2.0, 8.0, 0.5, 10.0),
        ("openai", m) if m.contains("gpt-4o") => (2.5, 10.0, 1.25, 10.0),
        ("openai", m) if m.contains("gpt-4-turbo") => (10.0, 30.0, 10.0, 30.0),
        ("openai", m) if m.contains("gpt-4-") => (30.0, 60.0, 30.0, 60.0),
        ("openai", m) if m.contains("gpt-3.5") => (0.5, 1.5, 0.5, 1.5),
        ("google", m) if m.contains("gemini-2.5-pro") => (1.25, 10.0, 0.31, 2.5),
        ("google", m) if m.contains("gemini-2.5-flash") => (0.15, 0.6, 0.0375, 0.3),
        ("google", m) if m.contains("gemini-2.0-flash") => (0.1, 0.4, 0.025, 0.2),
        ("deepseek", m) if m.contains("deepseek-r1") => (0.55, 2.19, 0.14, 0.55),
        ("deepseek", m) if m.contains("deepseek-chat") => (0.14, 0.28, 0.014, 0.28),
        _ => (3.0, 15.0, 0.3, 3.75),
    };

    let input_cost = (tokens_in.saturating_sub(cache_read).saturating_sub(cache_write)) as f64 / 1_000_000.0 * input_rate;
    let output_cost = tokens_out as f64 / 1_000_000.0 * output_rate;
    let cache_read_cost = cache_read as f64 / 1_000_000.0 * cache_read_rate;
    let cache_write_cost = cache_write as f64 / 1_000_000.0 * cache_write_rate;

    input_cost + output_cost + cache_read_cost + cache_write_cost
}

pub fn format_cost(cost: f64) -> String {
    if cost < 0.01 {
        format!("${:.4}", cost)
    } else if cost < 1.0 {
        format!("${:.3}", cost)
    } else {
        format!("${:.2}", cost)
    }
}

/// Format token counts with K/M suffixes for readability
pub fn format_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}