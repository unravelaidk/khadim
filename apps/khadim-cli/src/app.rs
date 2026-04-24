use crate::args::CliConfig;
use crate::domain::commands::{filter_slash_commands, CommandPickerState, SlashCommand};
use crate::domain::login::{LoginPhase, LoginState};
use crate::domain::settings::{
    is_oauth_provider, SettingsFocus, SettingsPicker, SettingsState, StoredSettings,
};
use crate::domain::transcript::TranscriptEntry;
use crate::services::catalog_service::provider_auth_status;
use crate::services::settings_service::effective_settings;
use khadim_ai_core::env_api_keys::get_env_api_key;
use ratatui::text::Line;
use std::cell::{Cell, RefCell};

// ── Settings UI helpers ──────────────────────────────────────────────

/// Build fresh transient settings-UI state from persisted settings.
///
/// The API-key buffer is seeded from `settings.api_keys` only (not the env
/// var fallback) so the user doesn't see an env-provided key and overwrite
/// it unintentionally. If no key is stored, the buffer is empty.
pub fn build_settings_state(settings: &StoredSettings) -> SettingsState {
    let buffer = settings
        .provider
        .as_deref()
        .and_then(|p| settings.api_keys.get(p).cloned())
        .unwrap_or_default();
    SettingsState {
        focus: SettingsFocus::Provider,
        picker: None,
        picker_index: 0,
        api_key_cursor: buffer.chars().count(),
        api_key_buffer: buffer,
    }
}

// ── Spinner ──────────────────────────────────────────────────────────

const SPINNER_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub fn spinner_frame(tick: u64) -> &'static str {
    SPINNER_FRAMES[(tick as usize) % SPINNER_FRAMES.len()]
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TranscriptEntryStamp {
    pub kind: u8,
    pub ptr_a: usize,
    pub len_a: usize,
    pub ptr_b: usize,
    pub len_b: usize,
    pub flag_a: bool,
    pub flag_b: bool,
}

impl TranscriptEntryStamp {
    pub fn from_entry(entry: &TranscriptEntry) -> Self {
        match entry {
            TranscriptEntry::System { text } => Self::single_text(0, text),
            TranscriptEntry::User { text } => Self::single_text(1, text),
            TranscriptEntry::AssistantText { text } => Self::single_text(2, text),
            TranscriptEntry::Thinking { text } => Self::single_text(3, text),
            TranscriptEntry::ToolStart { tool, title } => Self {
                kind: 4,
                ptr_a: tool.as_ptr() as usize,
                len_a: tool.len(),
                ptr_b: title.as_ptr() as usize,
                len_b: title.len(),
                flag_a: false,
                flag_b: false,
            },
            TranscriptEntry::ToolComplete {
                tool,
                content,
                is_error,
                collapsed,
                ..
            } => Self {
                kind: 5,
                ptr_a: tool.as_ptr() as usize,
                len_a: tool.len(),
                ptr_b: content.as_ptr() as usize,
                len_b: content.len(),
                flag_a: *is_error,
                flag_b: *collapsed,
            },
            TranscriptEntry::Error { text } => Self::single_text(6, text),
            TranscriptEntry::Separator => Self::default(),
        }
    }

    fn single_text(kind: u8, text: &str) -> Self {
        Self {
            kind,
            ptr_a: text.as_ptr() as usize,
            len_a: text.len(),
            ptr_b: 0,
            len_b: 0,
            flag_a: false,
            flag_b: false,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct CachedTranscriptEntryRender {
    pub width: u16,
    pub stamp: TranscriptEntryStamp,
    pub lines: Vec<Line<'static>>,
}

// ── TuiApp ───────────────────────────────────────────────────────────

pub struct TuiApp {
    pub input: String,
    pub cursor: usize,
    pub entries: Vec<TranscriptEntry>,
    pub status: String,
    pub pending: bool,
    pub streaming_text: bool,
    pub turn_count: usize,
    pub scroll_offset: usize,
    pub auto_scroll: bool,
    pub tools_collapsed: bool,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub tokens_cache_read: u64,
    pub tokens_cache_write: u64,
    pub turn_tokens_in: u64,
    pub turn_tokens_out: u64,
    pub turn_tokens_cache_read: u64,
    pub turn_tokens_cache_write: u64,
    pub content_lines: Cell<usize>,
    pub visible_height: Cell<usize>,
    pub current_mode: String,
    pub settings_open: bool,
    pub settings: SettingsState,
    pub input_focused: bool,
    pub tick_count: u64,
    pub login_state: Option<LoginState>,
    pub command_preview_index: usize,
    pub command_picker: Option<CommandPickerState>,
    pub transcript_render_cache: RefCell<Vec<CachedTranscriptEntryRender>>,
    // ── New features ──
    pub history: Vec<String>,
    pub history_index: Option<usize>,
    pub saved_input: String,
    pub confirm_quit: bool,
    pub last_window_size: (u16, u16),
    pub kill_buffer: String,
    // ── Question tool state ──
    pub pending_question: Option<crate::domain::question::PendingQuestionState>,
}

impl TuiApp {
    pub fn new(config: &CliConfig, settings: &StoredSettings) -> Self {
        let eff = effective_settings(config, settings);
        let provider_id = eff.provider.as_deref().unwrap_or("(not set)");
        let key_status = provider_auth_status(&eff, provider_id);

        let mut auto_detected = Vec::new();
        for p in crate::services::catalog_service::provider_catalog() {
            if get_env_api_key(&p.id).is_some()
                || crate::services::catalog_service::has_oauth_credentials(&p.id)
            {
                auto_detected.push(p.name.clone());
            }
        }

        let version = env!("CARGO_PKG_VERSION");
        let mut entries = vec![
            TranscriptEntry::System {
                text: format!(
                    "✦ khadim-cli v{}  ·  {}/{}  ·  auth: {}",
                    version,
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
            text: "  enter send · esc abort · ctrl+l clear · /help".into(),
        });
        entries.push(TranscriptEntry::Separator);

        let history = crate::services::history_service::load_history().unwrap_or_default();

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
            tools_collapsed: true,
            tokens_in: 0,
            tokens_out: 0,
            tokens_cache_read: 0,
            tokens_cache_write: 0,
            turn_tokens_in: 0,
            turn_tokens_out: 0,
            turn_tokens_cache_read: 0,
            turn_tokens_cache_write: 0,
            content_lines: Cell::new(0),
            visible_height: Cell::new(0),
            current_mode: "auto".into(),
            settings_open: false,
            settings: build_settings_state(settings),
            input_focused: true,
            tick_count: 0,
            login_state: None,
            command_preview_index: 0,
            command_picker: None,
            transcript_render_cache: RefCell::new(Vec::new()),
            history,
            history_index: None,
            saved_input: String::new(),
            confirm_quit: false,
            last_window_size: (0, 0),
            kill_buffer: String::new(),
            pending_question: None,
        }
    }

    pub fn clear(&mut self, config: &CliConfig, settings: &StoredSettings) {
        let history = std::mem::take(&mut self.history);
        *self = Self::new(config, settings);
        self.history = history;
    }

    pub fn tick(&mut self) {
        self.tick_count = self.tick_count.wrapping_add(1);
    }

    pub fn cycle_mode(&mut self) {
        let next = match self.current_mode.as_str() {
            "auto" => "build",
            "build" => "plan",
            "plan" => "explore",
            "explore" => "chat",
            _ => "auto",
        };
        self.current_mode = next.to_string();
        let label = if next == "auto" {
            "auto-detect".to_string()
        } else {
            format!("{}", next)
        };
        self.entries.push(TranscriptEntry::System {
            text: format!("🔀 Mode: {}", label),
        });
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn submit_user_prompt(&mut self, prompt: &str) {
        self.entries.push(TranscriptEntry::User {
            text: prompt.to_string(),
        });
        self.pending = true;
        self.streaming_text = false;
        self.turn_count += 1;
        self.turn_tokens_in = 0;
        self.turn_tokens_out = 0;
        self.turn_tokens_cache_read = 0;
        self.turn_tokens_cache_write = 0;
        self.status = "running".into();
        self.auto_scroll = true;
        // Reset scroll and cache so the new turn starts from the bottom
        self.scroll_offset = 0;
        self.transcript_render_cache.borrow_mut().clear();
        // Reset history navigation
        self.history_index = None;
        self.saved_input.clear();
        // Append to history
        let _ = crate::services::history_service::append_history(prompt);
        if !prompt.trim().is_empty() && !prompt.starts_with('/') {
            self.history.push(prompt.to_string());
        }
    }

    pub fn ensure_assistant_entry(&mut self) {
        let is_assistant = self.entries.last().map_or(false, |e| {
            matches!(e, TranscriptEntry::AssistantText { .. })
        });
        if !self.streaming_text || !is_assistant {
            self.entries.push(TranscriptEntry::AssistantText {
                text: String::new(),
            });
            self.streaming_text = true;
        }
    }

    pub fn finish_turn(&mut self) {
        self.pending = false;
        self.streaming_text = false;
        self.turn_tokens_in = 0;
        self.turn_tokens_out = 0;
        self.turn_tokens_cache_read = 0;
        self.turn_tokens_cache_write = 0;
        self.status = "idle".into();
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn apply_event(&mut self, event: khadim_coding_agent::events::AgentStreamEvent) {
        let tool_name = event
            .metadata
            .as_ref()
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
                    let display_name =
                        crate::services::catalog_service::friendly_tool_name(&tool_name);
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
                let is_error = event
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("is_error"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if tool_name == "model" {
                    if !content.is_empty() {
                        self.ensure_assistant_entry();
                        if let Some(TranscriptEntry::AssistantText { text }) =
                            self.entries.last_mut()
                        {
                            text.push_str(&content);
                        }
                    }
                    self.status = "idle".into();
                } else {
                    self.status = "idle".into();
                    let diff_meta = event.metadata.as_ref().and_then(|m| {
                        let path = m.get("path")?.as_str()?.to_string();
                        let before = m.get("before")?.as_str()?.to_string();
                        let after = m.get("after")?.as_str()?.to_string();
                        Some(crate::domain::transcript::DiffMeta { path, before, after })
                    });
                    self.entries.push(TranscriptEntry::ToolComplete {
                        tool: tool_name,
                        content,
                        is_error,
                        collapsed: self.tools_collapsed,
                        diff_meta,
                    });
                }
            }
            "usage" => {
                if let Some(metadata) = &event.metadata {
                    if let Some(input) = metadata.get("input").and_then(|v| v.as_u64()) {
                        self.tokens_in = self
                            .tokens_in
                            .saturating_add(input.saturating_sub(self.turn_tokens_in));
                        self.turn_tokens_in = input;
                    }
                    if let Some(output) = metadata.get("output").and_then(|v| v.as_u64()) {
                        self.tokens_out = self
                            .tokens_out
                            .saturating_add(output.saturating_sub(self.turn_tokens_out));
                        self.turn_tokens_out = output;
                    }
                    if let Some(cache_read) = metadata.get("cache_read").and_then(|v| v.as_u64()) {
                        self.tokens_cache_read = self
                            .tokens_cache_read
                            .saturating_add(cache_read.saturating_sub(self.turn_tokens_cache_read));
                        self.turn_tokens_cache_read = cache_read;
                    }
                    if let Some(cache_write) = metadata.get("cache_write").and_then(|v| v.as_u64())
                    {
                        self.tokens_cache_write = self.tokens_cache_write.saturating_add(
                            cache_write.saturating_sub(self.turn_tokens_cache_write),
                        );
                        self.turn_tokens_cache_write = cache_write;
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
                if let Some(mode) = event
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("mode"))
                    .and_then(|v| v.as_str())
                {
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
            self.entries.push(TranscriptEntry::Error {
                text: error.message,
            });
        }
        if self.pending {
            self.finish_turn();
        }
    }

    pub fn abort(&mut self) {
        self.pending = false;
        self.streaming_text = false;
        self.status = "aborted".into();
        self.entries.push(TranscriptEntry::Error {
            text: "Agent aborted by user".into(),
        });
        self.entries.push(TranscriptEntry::Separator);
        // Clear render cache so stale entries don't interfere with
        // the next run's viewport calculations.
        self.transcript_render_cache.borrow_mut().clear();
    }

    pub fn abort_with_message(&mut self, msg: &str) {
        self.pending = false;
        self.streaming_text = false;
        self.status = "error".into();
        self.entries.push(TranscriptEntry::Error {
            text: msg.to_string(),
        });
        self.entries.push(TranscriptEntry::Separator);
        self.transcript_render_cache.borrow_mut().clear();
    }

    pub fn open_login_selector(&mut self) {
        let providers = crate::domain::login::oauth_provider_list();
        if providers.is_empty() {
            self.entries.push(TranscriptEntry::System {
                text: "No OAuth providers available.".into(),
            });
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
            let name = login
                .providers
                .iter()
                .find(|p| p.id == provider_id)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| provider_id.to_string());
            login.phase = LoginPhase::InProgress;
            login.messages = vec![format!("signing in to {}…", name)];
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
        !self.pending
            && self.input.starts_with('/')
            && self.command_picker.is_none()
            && self.login_state.is_none()
            && !self.settings_open
    }

    pub fn filtered_commands(&self) -> Vec<SlashCommand> {
        filter_slash_commands(&self.input)
    }

    pub fn preview_move_up(&mut self) {
        let cmds = self.filtered_commands();
        if cmds.is_empty() {
            return;
        }
        if self.command_preview_index == 0 {
            self.command_preview_index = cmds.len() - 1;
        } else {
            self.command_preview_index -= 1;
        }
    }

    pub fn preview_move_down(&mut self) {
        let cmds = self.filtered_commands();
        if cmds.is_empty() {
            return;
        }
        if self.command_preview_index + 1 >= cmds.len() {
            self.command_preview_index = 0;
        } else {
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

    pub fn set_command_picker(&mut self, picker: CommandPickerState) {
        self.command_picker = Some(picker);
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
            p.items
                .get(p.selected_index)
                .map(|(id, name, _)| (id.clone(), name.clone()))
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
            login
                .providers
                .get(login.selected_index)
                .map(|p| p.id.clone())
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

    // ── Settings panel: focus navigation ─────────────────────────────
    //
    // All three rows (provider/model/auth) form a vertical cycle. Moving
    // off the Auth row also flushes the staged API-key buffer to storage
    // so typed keys don't silently vanish.

    pub fn move_focus_up(&mut self, settings: &StoredSettings) {
        self.blur_auth_if_leaving(settings);
        self.settings.focus = match self.settings.focus {
            SettingsFocus::Provider => SettingsFocus::Auth,
            SettingsFocus::Model => SettingsFocus::Provider,
            SettingsFocus::Auth => SettingsFocus::Model,
        };
        self.refocus_buffer(settings);
    }

    pub fn move_focus_down(&mut self, settings: &StoredSettings) {
        self.blur_auth_if_leaving(settings);
        self.settings.focus = match self.settings.focus {
            SettingsFocus::Provider => SettingsFocus::Model,
            SettingsFocus::Model => SettingsFocus::Auth,
            SettingsFocus::Auth => SettingsFocus::Provider,
        };
        self.refocus_buffer(settings);
    }

    /// When leaving the Auth row on an API-key provider, re-seed the buffer
    /// from persisted settings so the next time it's focused the user sees
    /// what was actually saved.
    fn refocus_buffer(&mut self, settings: &StoredSettings) {
        if self.settings.focus == SettingsFocus::Auth {
            let provider = settings.provider.as_deref().unwrap_or("");
            if !is_oauth_provider(provider) {
                let key = settings.api_keys.get(provider).cloned().unwrap_or_default();
                self.settings.api_key_cursor = key.chars().count();
                self.settings.api_key_buffer = key;
            }
        }
    }

    fn blur_auth_if_leaving(&mut self, _settings: &StoredSettings) {
        // Intentionally a no-op hook: the caller is expected to flush the
        // staged key via app_service before calling move_focus_*. This keeps
        // the persistence step out of the pure-state helper.
    }

    // ── Settings panel: picker ───────────────────────────────────────

    pub fn open_settings_picker(&mut self, settings: &StoredSettings) {
        match self.settings.focus {
            SettingsFocus::Provider => {
                let providers = crate::services::catalog_service::provider_catalog();
                let current = providers
                    .iter()
                    .position(|p| settings.provider.as_deref() == Some(p.id.as_str()))
                    .unwrap_or(0);
                self.settings.picker = Some(SettingsPicker::Provider);
                self.settings.picker_index = current;
            }
            SettingsFocus::Model => {
                let provider_id = settings.provider.clone().unwrap_or_default();
                let models =
                    crate::services::catalog_service::models_for_provider(&provider_id);
                let current = models
                    .iter()
                    .position(|(id, _)| settings.model_id.as_deref() == Some(id.as_str()))
                    .unwrap_or(0);
                self.settings.picker = Some(SettingsPicker::Model);
                self.settings.picker_index = current;
            }
            SettingsFocus::Auth => {}
        }
    }

    pub fn close_settings_picker(&mut self) {
        self.settings.picker = None;
    }

    pub fn settings_picker_move(&mut self, delta: isize, settings: &StoredSettings) {
        let Some(kind) = self.settings.picker else { return; };
        let len = match kind {
            SettingsPicker::Provider => {
                crate::services::catalog_service::provider_catalog().len()
            }
            SettingsPicker::Model => {
                let pid = settings.provider.as_deref().unwrap_or("");
                crate::services::catalog_service::models_for_provider(pid).len()
            }
        };
        if len == 0 {
            return;
        }
        let next = (self.settings.picker_index as isize + delta).rem_euclid(len as isize) as usize;
        self.settings.picker_index = next;
    }

    /// Read the picker's currently-highlighted item. Returns `(id, kind)`.
    pub fn settings_picker_selection(
        &self,
        settings: &StoredSettings,
    ) -> Option<(SettingsPicker, String)> {
        let kind = self.settings.picker?;
        match kind {
            SettingsPicker::Provider => {
                let providers = crate::services::catalog_service::provider_catalog();
                providers
                    .get(self.settings.picker_index)
                    .map(|p| (kind, p.id.clone()))
            }
            SettingsPicker::Model => {
                let pid = settings.provider.as_deref().unwrap_or("");
                let models = crate::services::catalog_service::models_for_provider(pid);
                models
                    .get(self.settings.picker_index)
                    .map(|(id, _)| (kind, id.clone()))
            }
        }
    }

    // ── Input history navigation ─────────────────────────────────────

    pub fn history_prev(&mut self) {
        if self.history.is_empty() {
            return;
        }
        match self.history_index {
            None => {
                self.saved_input = self.input.clone();
                self.history_index = Some(self.history.len().saturating_sub(1));
            }
            Some(idx) if idx > 0 => {
                self.history_index = Some(idx - 1);
            }
            _ => {}
        }
        if let Some(idx) = self.history_index {
            if let Some(text) = self.history.get(idx) {
                self.input = text.clone();
                self.cursor = self.input.chars().count();
            }
        }
    }

    pub fn history_next(&mut self) {
        match self.history_index {
            None => {}
            Some(idx) => {
                if idx + 1 < self.history.len() {
                    self.history_index = Some(idx + 1);
                    if let Some(text) = self.history.get(idx + 1) {
                        self.input = text.clone();
                        self.cursor = self.input.chars().count();
                    }
                } else {
                    self.history_index = None;
                    self.input = self.saved_input.clone();
                    self.cursor = self.input.chars().count();
                }
            }
        }
    }

    // ── Word navigation in input ─────────────────────────────────────

    pub fn move_word_left(&mut self) {
        if self.cursor == 0 {
            return;
        }
        let chars: Vec<char> = self.input.chars().collect();
        let mut pos = self.cursor.saturating_sub(1);
        // Skip whitespace
        while pos > 0 && chars[pos].is_whitespace() {
            pos -= 1;
        }
        // Skip word characters
        while pos > 0 && !chars[pos.saturating_sub(1)].is_whitespace() {
            pos -= 1;
        }
        self.cursor = pos;
    }

    pub fn move_word_right(&mut self) {
        let len = self.input.chars().count();
        if self.cursor >= len {
            return;
        }
        let chars: Vec<char> = self.input.chars().collect();
        let mut pos = self.cursor;
        // Skip word characters
        while pos < len && !chars[pos].is_whitespace() {
            pos += 1;
        }
        // Skip whitespace
        while pos < len && chars[pos].is_whitespace() {
            pos += 1;
        }
        self.cursor = pos;
    }

    pub fn delete_word_before(&mut self) {
        if self.cursor == 0 {
            return;
        }
        let old_cursor = self.cursor;
        self.move_word_left();
        let new_cursor = self.cursor;
        let mut removed = String::new();
        for _ in 0..(old_cursor - new_cursor) {
            let byte_idx = crate::ui::helpers::char_idx_to_byte_idx(&self.input, new_cursor);
            removed.push(self.input.remove(byte_idx));
        }
        self.cursor = new_cursor;
        self.kill_buffer = removed;
    }

    pub fn delete_word_after(&mut self) {
        let len = self.input.chars().count();
        if self.cursor >= len {
            return;
        }
        let old_cursor = self.cursor;
        self.move_word_right();
        let new_cursor = self.cursor;
        let mut removed = String::new();
        for _ in 0..(new_cursor - old_cursor) {
            let byte_idx = crate::ui::helpers::char_idx_to_byte_idx(&self.input, old_cursor);
            removed.push(self.input.remove(byte_idx));
        }
        self.cursor = old_cursor;
        self.kill_buffer = removed;
    }

    pub fn kill_to_beginning_of_line(&mut self) {
        if self.cursor == 0 {
            return;
        }
        let bol = self.input[..crate::ui::helpers::char_idx_to_byte_idx(&self.input, self.cursor)]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or(0);
        let byte_bol = bol;
        let byte_cur = crate::ui::helpers::char_idx_to_byte_idx(&self.input, self.cursor);
        self.kill_buffer = self.input[byte_bol..byte_cur].to_string();
        self.input.drain(byte_bol..byte_cur);
        self.cursor = self.input[..byte_bol].chars().count();
    }

    pub fn kill_to_end_of_line(&mut self) {
        let len = self.input.chars().count();
        if self.cursor >= len {
            return;
        }
        let byte_cur = crate::ui::helpers::char_idx_to_byte_idx(&self.input, self.cursor);
        let eol = self.input[byte_cur..]
            .find('\n')
            .map(|i| byte_cur + i)
            .unwrap_or(self.input.len());
        self.kill_buffer = self.input[byte_cur..eol].to_string();
        self.input.drain(byte_cur..eol);
    }

    pub fn yank(&mut self) {
        if self.kill_buffer.is_empty() {
            return;
        }
        let byte_idx = crate::ui::helpers::char_idx_to_byte_idx(&self.input, self.cursor);
        self.input.insert_str(byte_idx, &self.kill_buffer);
        self.cursor += self.kill_buffer.chars().count();
    }

    pub fn move_to_beginning(&mut self) {
        self.cursor = 0;
    }

    pub fn move_to_end(&mut self) {
        self.cursor = self.input.chars().count();
    }

    // ── Resize handling ──────────────────────────────────────────────

    pub fn on_resize(&mut self, width: u16, height: u16) {
        self.last_window_size = (width, height);
        // Clear render cache on resize since line wrapping changes
        self.transcript_render_cache.borrow_mut().clear();
    }

    // ── Question tool helpers ────────────────────────────────────────

    pub fn has_pending_question(&self) -> bool {
        self.pending_question.is_some()
    }

    pub fn set_pending_question(
        &mut self,
        request: crate::tools::question_tool::QuestionRequest,
        response_tx: tokio::sync::oneshot::Sender<crate::tools::question_tool::QuestionResponse>,
    ) {
        self.pending_question = Some(crate::domain::question::PendingQuestionState {
            request,
            current_idx: 0,
            answers: std::collections::HashMap::new(),
            response_tx,
        });
        self.input.clear();
        self.cursor = 0;
    }

    /// Submit the current input as the answer to the current pending question.
    /// Returns true if all questions are answered and the response was sent.
    pub fn submit_question_answer(&mut self) -> bool {
        let Some(ref mut state) = self.pending_question else {
            return false;
        };
        let raw_answer = self.input.trim().to_string();

        // Map numeric answers to option labels when options are present
        let answer_vec = if raw_answer.is_empty() {
            vec![]
        } else {
            if let Some(q) = state.current_question() {
                if let Some(ref options) = q.options {
                    if let Ok(num) = raw_answer.parse::<usize>() {
                        if num == 0 && q.allow_other {
                            vec!["Other".to_string()]
                        } else if num > 0 && num <= options.len() {
                            vec![options[num - 1].label.clone()]
                        } else {
                            vec![raw_answer.clone()]
                        }
                    } else {
                        vec![raw_answer.clone()]
                    }
                } else {
                    vec![raw_answer.clone()]
                }
            } else {
                vec![raw_answer.clone()]
            }
        };

        let display_answer = answer_vec.join(", ");

        // Record the question and answer in the transcript
        if let Some(q) = state.current_question() {
            let question_text = if let Some(ref options) = q.options {
                let opts = options
                    .iter()
                    .enumerate()
                    .map(|(i, o)| format!("  {}. {} — {}", i + 1, o.label, o.description.as_deref().unwrap_or("")))
                    .collect::<Vec<_>>()
                    .join("\n");
                format!("{}\n{}", q.question, opts)
            } else {
                q.question.clone()
            };
            self.entries.push(TranscriptEntry::ToolComplete {
                tool: "question".to_string(),
                content: format!("Q: {}\nA: {}", question_text, display_answer),
                is_error: false,
                collapsed: false,
                diff_meta: None,
            });
        }

        state.submit_answer(answer_vec);
        self.input.clear();
        self.cursor = 0;

        if state.all_answered() {
            let state = self.pending_question.take().unwrap();
            let response = state.build_response();
            let _ = state.response_tx.send(response);
            return true;
        }
        false
    }

    pub fn cancel_question(&mut self) {
        if let Some(state) = self.pending_question.take() {
            if let Some(q) = state.current_question() {
                self.entries.push(TranscriptEntry::ToolComplete {
                    tool: "question".to_string(),
                    content: format!("Q: {}\nA: (skipped)", q.question),
                    is_error: false,
                    collapsed: false,
                    diff_meta: None,
                });
            }
            let _ = state.response_tx.send(crate::tools::question_tool::QuestionResponse {
                answers: state.answers,
            });
        }
    }
}

// ── Helper functions ─────────────────────────────────────────────────

fn truncate_status(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end = s
            .char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        format!("{}…", &s[..end])
    }
}
