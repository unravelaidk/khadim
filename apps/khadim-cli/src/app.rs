use crate::args::CliConfig;
use crate::domain::commands::{filter_slash_commands, CommandPickerState, SlashCommand};
use crate::domain::login::{LoginPhase, LoginState};
use crate::domain::settings::{
    is_oauth_provider, SettingsFocus, SettingsPicker, SettingsState, StoredSettings,
};
use crate::domain::transcript::TranscriptEntry;
use crate::services::app_service::AppService;
use crate::services::settings_service::effective_settings;
use khadim_ai_core::env_api_keys::get_env_api_key;
use khadim_coding_agent::events::AgentStreamEvent;
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
    pub flag_c: bool,
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
                flag_c: false,
            },
            TranscriptEntry::ToolComplete {
                tool,
                content,
                is_error,
                collapsed,
                running,
                ..
            } => Self {
                kind: 5,
                ptr_a: tool.as_ptr() as usize,
                len_a: tool.len(),
                ptr_b: content.as_ptr() as usize,
                len_b: content.len(),
                flag_a: *is_error,
                flag_b: *collapsed,
                flag_c: *running,
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
            flag_c: false,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct CachedTranscriptEntryRender {
    pub width: u16,
    pub stamp: TranscriptEntryStamp,
    pub lines: Vec<Line<'static>>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct UsageSnapshot {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UsageEventKind {
    Delta,
    Snapshot,
}

impl UsageSnapshot {
    fn from_metadata(metadata: &serde_json::Value) -> Self {
        Self {
            input: metadata
                .get("input")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0),
            output: metadata
                .get("output")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0),
            cache_read: metadata
                .get("cache_read")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0),
            cache_write: metadata
                .get("cache_write")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0),
        }
    }

    const fn is_zero(self) -> bool {
        self.input == 0 && self.output == 0 && self.cache_read == 0 && self.cache_write == 0
    }

    fn event_kind(metadata: &serde_json::Value) -> UsageEventKind {
        match metadata.get("kind").and_then(|v| v.as_str()) {
            Some("delta") => UsageEventKind::Delta,
            _ => UsageEventKind::Snapshot,
        }
    }
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
    pub context_tokens_in: u64,
    pub context_tokens_out: u64,
    pub context_tokens_cache_read: u64,
    pub context_tokens_cache_write: u64,
    usage_current_call: Option<UsageSnapshot>,
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
    /// Lazily-populated cache of recent saved sessions, used by the
    /// empty-state welcome screen so we don't hit the filesystem every
    /// frame. Populated on first welcome render; cleared (set to None)
    /// when sessions change so the next welcome render refreshes it.
    pub recent_sessions_cache: RefCell<Option<Vec<crate::domain::session::SessionMeta>>>,
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
    pub fn new(config: &CliConfig, app_service: &AppService) -> Self {
        let settings = app_service.stored_settings();
        let eff = effective_settings(config, settings);
        let provider_id = eff.provider.as_deref().unwrap_or("(not set)");
        let key_status = app_service.provider_auth_status(provider_id);

        let mut auto_detected = Vec::new();
        for p in app_service.provider_catalog() {
            if get_env_api_key(&p.id).is_some()
                || app_service.has_oauth_credentials(&p.id)
            {
                auto_detected.push(p.name.clone());
            }
        }

        let version = env!("CARGO_PKG_VERSION");
        let mut entries = vec![TranscriptEntry::System {
            text: format!(
                "✦ khadim-cli v{}  ·  {}/{}  ·  auth: {}",
                version,
                provider_id,
                eff.model_id.as_deref().unwrap_or("(not set)"),
                key_status,
            ),
        }];

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
            context_tokens_in: 0,
            context_tokens_out: 0,
            context_tokens_cache_read: 0,
            context_tokens_cache_write: 0,
            usage_current_call: None,
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
            recent_sessions_cache: RefCell::new(None),
            history,
            history_index: None,
            saved_input: String::new(),
            confirm_quit: false,
            last_window_size: (0, 0),
            kill_buffer: String::new(),
            pending_question: None,
        }
    }

    pub fn clear(&mut self, config: &CliConfig, app_service: &AppService) {
        let history = std::mem::take(&mut self.history);
        *self = Self::new(config, app_service);
        self.history = history;
    }

    pub const fn tick(&mut self) {
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
            next.to_string()
        };
        self.entries.push(TranscriptEntry::System {
            text: format!("🔀 Mode: {label}"),
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
        self.usage_current_call = None;
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
        let is_assistant = self
            .entries
            .last()
            .is_some_and(|e| matches!(e, TranscriptEntry::AssistantText { .. }));
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
        // Keep the latest turn's token counters after completion so the
        // footer and /tokens can continue to show context usage instead of
        // appearing to reset to zero as soon as a message finishes. They are
        // reset at the start of the next submitted prompt.
        self.usage_current_call = None;
        self.status = "idle".into();
        self.entries.push(TranscriptEntry::Separator);
    }

    pub fn apply_event(&mut self, event: AgentStreamEvent) {
        match event.event_type.as_str() {
            "llm_call_start" => {
                self.usage_current_call = Some(UsageSnapshot::default());
                return;
            }
            "llm_call_end" => {
                self.usage_current_call = None;
                return;
            }
            _ => {}
        }

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

                    // The orchestrator emits two step_start events per tool
                    // call: one when the LLM begins streaming the tool call
                    // ("Preparing X") and another when the tool is actually
                    // dispatched ("Running X"). Both carry the same call id
                    // in metadata, so dedupe by id: if a running entry with
                    // this id already exists, refresh its subtitle in place;
                    // otherwise push a fresh one. The same entry is then
                    // promoted on step_complete so the tool name appears
                    // exactly once in the transcript.
                    let step_id = event
                        .metadata
                        .as_ref()
                        .and_then(|m| m.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let existing = self.entries.iter_mut().rev().find_map(|e| match e {
                        TranscriptEntry::ToolComplete {
                            running: true,
                            step_id: sid,
                            content: c,
                            ..
                        } if !step_id.is_empty() && sid == &step_id => Some(c),
                        _ => None,
                    });
                    if let Some(c) = existing {
                        *c = truncate_status(&title, 60);
                    } else {
                        self.entries.push(TranscriptEntry::ToolComplete {
                            tool: tool_name,
                            content: truncate_status(&title, 60),
                            is_error: false,
                            collapsed: self.tools_collapsed,
                            diff_meta: None,
                            running: true,
                            step_id: step_id.clone(),
                        });
                    }
                }
            }
            "step_update" => {
                if let Some(content) = event.content {
                    self.status = truncate_status(&content, 60);
                    let step_id = event
                        .metadata
                        .as_ref()
                        .and_then(|m| m.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    // Sync the running entry's subtitle with progress events.
                    // Match by step_id when available so multiple in-flight
                    // tool calls don't trample each other.
                    let target = self.entries.iter_mut().rev().find_map(|e| match e {
                        TranscriptEntry::ToolComplete {
                            running: true,
                            step_id: sid,
                            tool: t,
                            content: c,
                            ..
                        } => {
                            let matches = if !step_id.is_empty() && !sid.is_empty() {
                                sid == &step_id
                            } else {
                                t == &tool_name
                            };
                            if matches {
                                Some(c)
                            } else {
                                None
                            }
                        }
                        _ => None,
                    });
                    if let Some(c) = target {
                        *c = truncate_status(&content, 60);
                    }
                }
            }
            "step_complete" => {
                let content = event.content.unwrap_or_default();
                let is_error = event
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("is_error"))
                    .and_then(serde_json::Value::as_bool)
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
                        Some(crate::domain::transcript::DiffMeta {
                            path,
                            before,
                            after,
                        })
                    });

                    // Promote the running entry for this call into its
                    // completed state — same row, same header, just populated
                    // with the result. Match by `step_id` (orchestrator's
                    // tool_call.id) when available so concurrent or repeated
                    // calls to the same tool stay distinct; fall back to
                    // tool-name match for snapshot back-compat. Falls back
                    // to a fresh push if no running entry is found.
                    let step_id = event
                        .metadata
                        .as_ref()
                        .and_then(|m| m.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let promoted_idx = self.entries.iter().rposition(|e| match e {
                        TranscriptEntry::ToolComplete {
                            running: true,
                            step_id: sid,
                            tool: t,
                            ..
                        } => {
                            if !step_id.is_empty() && !sid.is_empty() {
                                sid == &step_id
                            } else {
                                t == &tool_name
                            }
                        }
                        _ => false,
                    });
                    if let Some(idx) = promoted_idx {
                        if let TranscriptEntry::ToolComplete {
                            content: c,
                            is_error: e,
                            diff_meta: dm,
                            running: r,
                            ..
                        } = &mut self.entries[idx]
                        {
                            *c = content;
                            *e = is_error;
                            *dm = diff_meta;
                            *r = false;
                        }
                    } else {
                        self.entries.push(TranscriptEntry::ToolComplete {
                            tool: tool_name,
                            content,
                            is_error,
                            collapsed: self.tools_collapsed,
                            diff_meta,
                            running: false,
                            step_id,
                        });
                    }
                }
            }
            "usage" => {
                if let Some(metadata) = &event.metadata {
                    let current = UsageSnapshot::from_metadata(metadata);
                    if current.is_zero() {
                        return;
                    }

                    let delta = match UsageSnapshot::event_kind(metadata) {
                        UsageEventKind::Delta => {
                            self.context_tokens_in =
                                self.context_tokens_in.saturating_add(current.input);
                            self.context_tokens_out =
                                self.context_tokens_out.saturating_add(current.output);
                            self.context_tokens_cache_read = self
                                .context_tokens_cache_read
                                .saturating_add(current.cache_read);
                            self.context_tokens_cache_write = self
                                .context_tokens_cache_write
                                .saturating_add(current.cache_write);
                            current
                        }
                        UsageEventKind::Snapshot => {
                            let previous = self.usage_current_call.unwrap_or_default();
                            self.usage_current_call = Some(current);
                            self.context_tokens_in = current.input;
                            self.context_tokens_out = current.output;
                            self.context_tokens_cache_read = current.cache_read;
                            self.context_tokens_cache_write = current.cache_write;
                            UsageSnapshot {
                                input: current.input.saturating_sub(previous.input),
                                output: current.output.saturating_sub(previous.output),
                                cache_read: current.cache_read.saturating_sub(previous.cache_read),
                                cache_write: current
                                    .cache_write
                                    .saturating_sub(previous.cache_write),
                            }
                        }
                    };

                    self.tokens_in = self.tokens_in.saturating_add(delta.input);
                    self.tokens_out = self.tokens_out.saturating_add(delta.output);
                    self.tokens_cache_read =
                        self.tokens_cache_read.saturating_add(delta.cache_read);
                    self.tokens_cache_write =
                        self.tokens_cache_write.saturating_add(delta.cache_write);

                    self.turn_tokens_in = self.turn_tokens_in.saturating_add(delta.input);
                    self.turn_tokens_out = self.turn_tokens_out.saturating_add(delta.output);
                    self.turn_tokens_cache_read =
                        self.turn_tokens_cache_read.saturating_add(delta.cache_read);
                    self.turn_tokens_cache_write = self
                        .turn_tokens_cache_write
                        .saturating_add(delta.cache_write);
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

    /// Primary count for billing-ish display: non-cached input + output.
    ///
    /// Provider usage normalizers store `tokens_in` as fresh/non-cached input
    /// already, with cached input tracked separately in `tokens_cache_read`.
    /// So do NOT subtract cache again here.
    pub const fn blended_token_total(&self) -> u64 {
        self.tokens_in.saturating_add(self.tokens_out)
    }

    pub const fn non_cached_tokens_in(&self) -> u64 {
        self.tokens_in
    }

    pub const fn raw_tokens_in(&self) -> u64 {
        self.tokens_in.saturating_add(self.tokens_cache_read)
    }

    pub const fn latest_context_tokens(&self) -> u64 {
        self.context_tokens_in
            .saturating_add(self.context_tokens_cache_read)
            .saturating_add(self.context_tokens_out)
    }

    pub fn context_percent_remaining(&self, context_window: u64) -> Option<u64> {
        percent_context_remaining(self.latest_context_tokens(), context_window)
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
                .map_or_else(|| provider_id.to_string(), |p| p.name.clone());
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

    pub const fn picker_move_up(&mut self) {
        if let Some(ref mut picker) = self.command_picker {
            if picker.selected_index > 0 {
                picker.selected_index -= 1;
            }
        }
    }

    pub const fn picker_move_down(&mut self) {
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

    pub const fn login_move_up(&mut self) {
        if let Some(ref mut login) = self.login_state {
            if login.selected_index > 0 {
                login.selected_index -= 1;
            }
        }
    }

    pub const fn login_move_down(&mut self) {
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

    const fn blur_auth_if_leaving(&mut self, _settings: &StoredSettings) {
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
                let models = crate::services::catalog_service::models_for_provider(&provider_id);
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

    pub const fn close_settings_picker(&mut self) {
        self.settings.picker = None;
    }

    pub fn settings_picker_move(&mut self, delta: isize, settings: &StoredSettings) {
        let Some(kind) = self.settings.picker else {
            return;
        };
        let len = match kind {
            SettingsPicker::Provider => crate::services::catalog_service::provider_catalog().len(),
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
        if self.history.is_empty() {
            return;
        }

        match self.history_index {
            // Allow ↓ from a fresh prompt to recall the most recent prompt too.
            // This mirrors ↑ and makes either vertical arrow recover the latest
            // input-history entry when the cursor is in the main input box.
            None => {
                self.saved_input = self.input.clone();
                self.history_index = Some(self.history.len().saturating_sub(1));
                if let Some(text) = self.history.last() {
                    self.input = text.clone();
                    self.cursor = self.input.chars().count();
                }
            }
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
            .map_or(0, |i| i + 1);
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
            .map_or(self.input.len(), |i| byte_cur + i);
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

    pub const fn move_to_beginning(&mut self) {
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

    pub const fn has_pending_question(&self) -> bool {
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
        } else if let Some(q) = state.current_question() {
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
                vec![raw_answer]
            }
        } else {
            vec![raw_answer]
        };

        let display_answer = answer_vec.join(", ");

        // Record the question and answer in the transcript
        if let Some(q) = state.current_question() {
            let question_text = if let Some(ref options) = q.options {
                let opts = options
                    .iter()
                    .enumerate()
                    .map(|(i, o)| {
                        format!(
                            "  {}. {} — {}",
                            i + 1,
                            o.label,
                            o.description.as_deref().unwrap_or("")
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                format!("{}\n{}", q.question, opts)
            } else {
                q.question.clone()
            };
            self.entries.push(TranscriptEntry::ToolComplete {
                tool: "question".to_string(),
                content: format!("Q: {question_text}\nA: {display_answer}"),
                is_error: false,
                collapsed: false,
                diff_meta: None,
                running: false,
                step_id: String::new(),
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
                    running: false,
                    step_id: String::new(),
                });
            }
            let _ = state
                .response_tx
                .send(crate::tools::question_tool::QuestionResponse {
                    answers: state.answers,
                });
        }
    }
}

// ── Helper functions ─────────────────────────────────────────────────

const USER_CONTEXT_BASELINE_TOKENS: u64 = 12_000;

pub fn percent_context_remaining(tokens_in_context: u64, context_window: u64) -> Option<u64> {
    if context_window <= USER_CONTEXT_BASELINE_TOKENS {
        return None;
    }

    let effective_window = context_window - USER_CONTEXT_BASELINE_TOKENS;
    let used = tokens_in_context.saturating_sub(USER_CONTEXT_BASELINE_TOKENS);
    let remaining = effective_window.saturating_sub(used);
    Some(((remaining as f64 / effective_window as f64) * 100.0).round() as u64)
}

fn truncate_status(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end = s
            .char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map_or(0, |(i, c)| i + c.len_utf8());
        format!("{}…", &s[..end])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn usage_event(input: u64, output: u64, cache_read: u64, cache_write: u64) -> AgentStreamEvent {
        AgentStreamEvent::new("usage").with_metadata(json!({
            "input": input,
            "output": output,
            "cache_read": cache_read,
            "cache_write": cache_write,
        }))
    }

    fn usage_delta_event(
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write: u64,
    ) -> AgentStreamEvent {
        AgentStreamEvent::new("usage").with_metadata(json!({
            "kind": "delta",
            "input": input,
            "output": output,
            "cache_read": cache_read,
            "cache_write": cache_write,
        }))
    }

    fn test_app() -> TuiApp {
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let config = CliConfig {
            cwd: std::env::current_dir().unwrap(),
            prompt: None,
            provider: None,
            model: None,
            session: None,
            system_prompt: None,
            verbose: false,
            json: false,
            list_providers: None,
            list_models: None,
        };
        let app_service = AppService::new(config.clone(), StoredSettings::default(), worker_tx);
        TuiApp::new(&config, &app_service)
    }

    #[test]
    fn usage_accumulates_each_llm_call_instead_of_only_largest_turn_total() {
        let mut app = test_app();
        app.submit_user_prompt("fix it");

        app.apply_event(AgentStreamEvent::new("llm_call_start"));
        app.apply_event(usage_event(100, 10, 5, 0));
        app.apply_event(AgentStreamEvent::new("llm_call_end"));

        app.apply_event(AgentStreamEvent::new("llm_call_start"));
        app.apply_event(usage_event(80, 20, 2, 1));
        app.apply_event(AgentStreamEvent::new("llm_call_end"));

        assert_eq!(app.tokens_in, 180);
        assert_eq!(app.tokens_out, 30);
        assert_eq!(app.tokens_cache_read, 7);
        assert_eq!(app.tokens_cache_write, 1);
        assert_eq!(app.turn_tokens_in, 180);
        assert_eq!(app.turn_tokens_out, 30);
        assert_eq!(app.non_cached_tokens_in(), 180);
        assert_eq!(app.raw_tokens_in(), 187);
        assert_eq!(app.blended_token_total(), 210);
        assert_eq!(app.latest_context_tokens(), 102);
    }

    #[test]
    fn usage_stream_updates_are_deltaed_within_one_llm_call() {
        let mut app = test_app();
        app.submit_user_prompt("fix it");

        app.apply_event(AgentStreamEvent::new("llm_call_start"));
        app.apply_event(usage_event(100, 10, 0, 0));
        app.apply_event(usage_event(120, 15, 3, 0));
        app.apply_event(AgentStreamEvent::new("llm_call_end"));

        assert_eq!(app.tokens_in, 120);
        assert_eq!(app.tokens_out, 15);
        assert_eq!(app.tokens_cache_read, 3);
    }

    #[test]
    fn submitting_next_message_preserves_visible_usage_until_new_usage_arrives() {
        let mut app = test_app();
        app.submit_user_prompt("first");
        app.apply_event(AgentStreamEvent::new("llm_call_start"));
        app.apply_event(usage_event(100, 10, 5, 0));
        app.apply_event(AgentStreamEvent::new("llm_call_end"));
        app.apply_event(AgentStreamEvent::new("done"));

        assert_eq!(app.blended_token_total(), 110);
        assert_eq!(app.latest_context_tokens(), 115);
        assert_eq!(app.context_percent_remaining(128_000), Some(100));

        app.submit_user_prompt("second");

        assert_eq!(app.blended_token_total(), 110);
        assert_eq!(app.tokens_in, 100);
        assert_eq!(app.tokens_out, 10);
        assert_eq!(app.latest_context_tokens(), 115);
        assert_eq!(app.context_percent_remaining(128_000), Some(100));

        app.apply_event(AgentStreamEvent::new("llm_call_start"));
        app.apply_event(usage_event(150, 20, 5, 0));

        assert_eq!(app.blended_token_total(), 280);
        assert_eq!(app.latest_context_tokens(), 175);
    }

    #[test]
    fn usage_delta_events_are_added_directly() {
        let mut app = test_app();
        app.submit_user_prompt("fix it");

        app.apply_event(usage_delta_event(100, 10, 5, 0));
        app.apply_event(usage_delta_event(80, 20, 2, 1));

        assert_eq!(app.tokens_in, 180);
        assert_eq!(app.tokens_out, 30);
        assert_eq!(app.tokens_cache_read, 7);
        assert_eq!(app.tokens_cache_write, 1);
        assert_eq!(app.latest_context_tokens(), 217);
    }

    #[test]
    fn context_percent_remaining_uses_codex_style_baseline() {
        assert_eq!(percent_context_remaining(1_000, 128_000), Some(100));
        assert_eq!(percent_context_remaining(70_000, 128_000), Some(50));
        assert_eq!(percent_context_remaining(128_000, 128_000), Some(0));
        assert_eq!(percent_context_remaining(1_000, 8_000), None);
    }

    /// Helpers to build the exact event shapes the orchestrator emits.
    fn step_start_ev(id: &str, tool: &str, title: &str) -> AgentStreamEvent {
        AgentStreamEvent::new("step_start")
            .with_content(title.to_string())
            .with_metadata(json!({ "id": id, "title": title, "tool": tool }))
    }
    fn step_update_ev(id: &str, tool: &str, content: &str) -> AgentStreamEvent {
        AgentStreamEvent::new("step_update")
            .with_content(content.to_string())
            .with_metadata(json!({ "id": id, "tool": tool }))
    }
    fn step_complete_ev(id: &str, tool: &str, result: &str) -> AgentStreamEvent {
        AgentStreamEvent::new("step_complete")
            .with_content(result.to_string())
            .with_metadata(json!({
                "id": id,
                "tool": tool,
                "result": result,
                "is_error": false,
            }))
    }
    fn text_delta_ev(s: &str) -> AgentStreamEvent {
        AgentStreamEvent::new("text_delta").with_content(s.to_string())
    }

    fn count_tool_entries(app: &TuiApp, tool: &str) -> (usize, usize) {
        let mut running = 0;
        let mut done = 0;
        for e in &app.entries {
            if let TranscriptEntry::ToolComplete {
                tool: t,
                running: r,
                ..
            } = e
            {
                if t == tool {
                    if *r {
                        running += 1;
                    } else {
                        done += 1;
                    }
                }
            }
        }
        (running, done)
    }

    /// Reproduces the bug where two `step_start` events (Preparing/Running)
    /// per tool call produced two transcript rows — one stuck shimmering and
    /// a second one that completed. After the fix, the same call id should
    /// resolve to a single completed entry.
    #[test]
    fn double_step_start_collapses_to_single_entry() {
        let mut app = test_app();
        app.submit_user_prompt("what's in this dir");

        // Phase 1: LLM streams the tool call.
        app.apply_event(step_start_ev("call_1", "ls", "Preparing ls"));
        app.apply_event(step_update_ev("call_1", "ls", "{\"path\":"));
        app.apply_event(step_update_ev("call_1", "ls", "{\"path\":\".\"}"));
        // Phase 2: orchestrator dispatches the tool — second step_start.
        app.apply_event(step_start_ev("call_1", "ls", "Running ls"));
        // Phase 3: tool finishes.
        app.apply_event(step_complete_ev("call_1", "ls", "Cargo.toml\nsrc\n"));

        let (running, done) = count_tool_entries(&app, "ls");
        assert_eq!(running, 0, "no shimmer should be left over");
        assert_eq!(done, 1, "exactly one completed ls entry expected");
    }

    /// Same as above, but the model emits assistant text between the two
    /// `step_start` events. Reproduces the case where the running entry was
    /// buried under a fresh `AssistantText`, causing the old `entries.last()`
    /// match to miss and push a duplicate.
    #[test]
    fn interleaved_text_does_not_create_duplicate_tool_row() {
        let mut app = test_app();
        app.submit_user_prompt("what's in this dir");

        app.apply_event(text_delta_ev("Let me check"));
        app.apply_event(step_start_ev("call_1", "ls", "Preparing ls"));
        app.apply_event(text_delta_ev(" the directory."));
        app.apply_event(step_start_ev("call_1", "ls", "Running ls"));
        app.apply_event(step_complete_ev("call_1", "ls", "src\nCargo.toml\n"));

        let (running, done) = count_tool_entries(&app, "ls");
        assert_eq!(running, 0);
        assert_eq!(done, 1);
    }

    /// Two distinct ls calls in the same turn must remain two separate
    /// entries (dedup is keyed on `step_id`, not tool name).
    #[test]
    fn two_distinct_calls_to_same_tool_stay_separate() {
        let mut app = test_app();
        app.submit_user_prompt("list both dirs");

        app.apply_event(step_start_ev("call_1", "ls", "Preparing ls"));
        app.apply_event(step_start_ev("call_1", "ls", "Running ls"));
        app.apply_event(step_complete_ev("call_1", "ls", "a\n"));

        app.apply_event(step_start_ev("call_2", "ls", "Preparing ls"));
        app.apply_event(step_start_ev("call_2", "ls", "Running ls"));
        app.apply_event(step_complete_ev("call_2", "ls", "b\n"));

        let (running, done) = count_tool_entries(&app, "ls");
        assert_eq!(running, 0);
        assert_eq!(done, 2, "each distinct call id should yield its own row");
    }

    #[test]
    fn history_up_from_empty_input_recalls_latest_prompt() {
        let mut app = test_app();
        app.history = vec!["first".into(), "latest".into()];

        app.history_prev();

        assert_eq!(app.input, "latest");
        assert_eq!(app.cursor, "latest".chars().count());
    }

    #[test]
    fn history_down_from_empty_input_recalls_latest_prompt() {
        let mut app = test_app();
        app.history = vec!["first".into(), "latest".into()];

        app.history_next();

        assert_eq!(app.input, "latest");
        assert_eq!(app.cursor, "latest".chars().count());
    }

    #[test]
    fn history_down_after_up_restores_draft() {
        let mut app = test_app();
        app.history = vec!["first".into(), "latest".into()];
        app.input = "draft".into();
        app.cursor = app.input.chars().count();

        app.history_prev();
        assert_eq!(app.input, "latest");

        app.history_next();
        assert_eq!(app.input, "draft");
        assert_eq!(app.cursor, "draft".chars().count());
    }
}
