use crate::args::CliConfig;
use crate::domain::commands::{
    all_slash_commands, filter_slash_commands, CommandPickerKind, CommandPickerState, SlashCommand,
};
use crate::domain::events::WorkerEvent;
use crate::domain::login::{oauth_provider_list, LoginPhase, LoginState};
use crate::domain::session::{SavedSession, SessionMeta};
use crate::domain::settings::StoredSettings;
use crate::domain::transcript::TranscriptEntry;
use crate::services::agent_service::run_once;
use crate::services::catalog_service::{
    estimate_cost, format_cost, format_tokens, friendly_tool_name, has_oauth_credentials,
    models_for_provider, provider_auth_status, provider_catalog,
};
use crate::services::oauth_service::start_oauth_login;
use crate::services::session_service::{
    build_saved_session, delete_session as delete_session_file, generate_session_name,
    list_sessions as list_saved_sessions, load_session as load_saved_session,
    rename_session as rename_session_file, save_session as save_session_file,
};
use crate::services::settings_service::{effective_settings, load_settings, save_settings};
use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::KhadimSession;
use khadim_coding_agent::{
    build_mode, chat_mode, explore_mode, plan_mode, run_prompt, run_prompt_with_explicit_mode,
};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::Mutex;

/// Result of executing a slash command.
pub enum CommandResult {
    /// Quit the application.
    Quit,
    /// Clear the transcript.
    Clear,
    /// Reset the session.
    Reset,
    /// Open settings overlay.
    OpenSettings,
    /// Open provider picker.
    OpenProviderPicker,
    /// Open model picker.
    OpenModelPicker,
    /// Open theme picker.
    OpenThemePicker,
    /// Open session picker.
    OpenSessionPicker,
    /// Switch to a named session.
    SwitchSession { name: String },
    /// Delete a named session.
    DeleteSession { name: String },
    /// Rename a session.
    RenameSession { old_name: String, new_name: String },
    /// Start a new session.
    NewSession,
    /// Open login selector, optionally preselecting a provider.
    OpenLoginSelector { preselect_provider: Option<String> },
    /// Show help text (lines to add to transcript).
    ShowHelp(Vec<String>),
    /// Show provider list (lines to add to transcript).
    ShowProviders(Vec<String>),
    /// Show sessions list (lines to add to transcript).
    ShowSessions(Vec<String>),
    /// Save current session under a name.
    SaveSession { name: String },
    /// Show a system message.
    ShowSystemMessage(String),
    /// Copy last assistant response to clipboard.
    CopyLastResponse,
    /// Export conversation to markdown file.
    ExportSession { path: Option<String> },
    /// Set system prompt.
    SetSystemPrompt { prompt: String },
    /// Show version.
    ShowVersion,
    /// Show input history.
    ShowHistory(Vec<String>),
    /// Show token usage.
    ShowTokens,
    /// Show config path.
    ShowConfig(String),
    /// Clear input history.
    ClearHistory,
    /// Read file into input.
    ReadFile { path: String, content: String },
    /// Not a recognized command.
    None,
}

/// Application service — coordinates sessions, runs, settings, and commands.
pub struct AppService {
    session: Arc<Mutex<KhadimSession>>,
    config: CliConfig,
    stored_settings: StoredSettings,
    worker_tx: UnboundedSender<WorkerEvent>,
    current_run: Option<tokio::task::JoinHandle<()>>,
    session_name: Option<String>,
}

#[allow(dead_code)]
impl AppService {
    pub fn new(
        config: CliConfig,
        stored_settings: StoredSettings,
        worker_tx: UnboundedSender<WorkerEvent>,
    ) -> Self {
        let session = Arc::new(Mutex::new(KhadimSession::new(config.cwd.clone())));
        Self {
            session,
            config,
            stored_settings,
            worker_tx,
            current_run: None,
            session_name: None,
        }
    }

    // ── Accessors ──────────────────────────────────────────────────────

    pub fn config(&self) -> &CliConfig {
        &self.config
    }

    pub fn stored_settings(&self) -> &StoredSettings {
        &self.stored_settings
    }

    pub fn current_session_name(&self) -> Option<&str> {
        self.session_name.as_deref()
    }

    pub fn effective_settings(&self) -> StoredSettings {
        effective_settings(&self.config, &self.stored_settings)
    }

    pub fn model_selection(&self) -> Option<ModelSelection> {
        let effective = self.effective_settings();
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

    // ── Settings ───────────────────────────────────────────────────────

    pub fn load_settings(&mut self) -> Result<(), AppError> {
        self.stored_settings = load_settings()?;
        Ok(())
    }

    pub fn save_settings(&self) -> Result<(), AppError> {
        save_settings(&self.stored_settings)
    }

    pub fn switch_provider(&mut self, provider_id: &str) -> Result<(), AppError> {
        self.stored_settings.provider = Some(provider_id.to_string());
        let models = models_for_provider(provider_id);
        self.stored_settings.model_id = models.first().map(|(mid, _)| mid.clone());
        save_settings(&self.stored_settings)?;
        self.stored_settings = load_settings()?;
        Ok(())
    }

    pub fn switch_model(&mut self, model_id: &str) -> Result<(), AppError> {
        self.stored_settings.model_id = Some(model_id.to_string());
        save_settings(&self.stored_settings)?;
        self.stored_settings = load_settings()?;
        Ok(())
    }

    pub fn switch_theme(&mut self, family: &str, variant: &str) -> Result<(), AppError> {
        self.stored_settings.theme_family = Some(family.to_string());
        self.stored_settings.theme_variant = Some(variant.to_string());
        save_settings(&self.stored_settings)?;
        self.stored_settings = load_settings()?;
        Ok(())
    }

    /// Persist an API key for `provider`. An empty or whitespace-only `key`
    /// removes any stored key for that provider so the user can clear one
    /// from the UI.
    pub fn update_api_key(&mut self, provider: &str, key: &str) {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            self.stored_settings.api_keys.remove(provider);
        } else {
            self.stored_settings
                .api_keys
                .insert(provider.to_string(), trimmed.to_string());
        }
    }

    pub fn set_system_prompt(&mut self, prompt: &str) {
        self.stored_settings.system_prompt = Some(prompt.to_string());
        let _ = save_settings(&self.stored_settings);
    }

    fn apply_system_prompt(&self, sess: &mut KhadimSession) {
        sess.system_prompt_override = self.stored_settings.system_prompt.clone();
    }

    // ── Session / Run ──────────────────────────────────────────────────

    pub async fn reset_session(&mut self) {
        let mut sess = self.session.lock().await;
        *sess = KhadimSession::new(self.config.cwd.clone());
        self.apply_system_prompt(&mut sess);
        // Keep the session name so auto-save continues to the same file
    }

    pub async fn new_session(&mut self) {
        let mut sess = self.session.lock().await;
        *sess = KhadimSession::new(self.config.cwd.clone());
        self.apply_system_prompt(&mut sess);
        self.session_name = None;
    }

    pub fn ensure_session_name(&mut self) -> String {
        if let Some(ref name) = self.session_name {
            name.clone()
        } else {
            let name = generate_session_name();
            self.session_name = Some(name.clone());
            name
        }
    }

    pub fn spawn_agent_run(&mut self, prompt: String, explicit_mode: Option<String>) {
        let selection = self.model_selection();
        let system_prompt = self.stored_settings.system_prompt.clone();
        let session = self.session.clone();
        let worker_tx = self.worker_tx.clone();
        let handle = tokio::spawn(async move {
            let mut sess = session.lock().await;
            sess.system_prompt_override = system_prompt;
            drop(sess);
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
            let worker_tx_clone = worker_tx.clone();
            let worker_tx_for_result = worker_tx.clone();
            let forwarder = tokio::spawn(async move {
                while let Some(event) = rx.recv().await {
                    let _ = worker_tx_clone.send(WorkerEvent::Stream(event));
                }
            });
            let mut sess = session.lock().await;
            let result = match explicit_mode.as_deref() {
                Some("build") => {
                    run_prompt_with_explicit_mode(&mut sess, &prompt, selection, build_mode(), &tx)
                        .await
                }
                Some("plan") => {
                    run_prompt_with_explicit_mode(&mut sess, &prompt, selection, plan_mode(), &tx)
                        .await
                }
                Some("explore") => {
                    run_prompt_with_explicit_mode(
                        &mut sess,
                        &prompt,
                        selection,
                        explore_mode(),
                        &tx,
                    )
                    .await
                }
                Some("chat") => {
                    run_prompt_with_explicit_mode(&mut sess, &prompt, selection, chat_mode(), &tx)
                        .await
                }
                _ => run_prompt(&mut sess, &prompt, selection, &tx).await,
            };
            drop(tx);
            let _ = forwarder.await;
            let _ = worker_tx_for_result.send(WorkerEvent::Finished(result));
        });
        self.current_run = Some(handle);
    }

    pub fn abort_run(&mut self) {
        if let Some(handle) = self.current_run.take() {
            handle.abort();
        }
    }

    pub fn is_run_finished(&self) -> bool {
        self.current_run.as_ref().map_or(true, |h| h.is_finished())
    }

    pub fn drain_finished_run(&mut self) -> bool {
        if self.is_run_finished() {
            if self.current_run.is_some() {
                self.current_run = None;
                return true;
            }
        }
        false
    }

    pub fn has_active_run(&self) -> bool {
        self.current_run.is_some()
    }

    /// Run the agent in batch mode (non-interactive).
    pub async fn run_batch(&self, prompt: &str) -> Result<(), AppError> {
        let mut sess = self.session.lock().await;
        sess.system_prompt_override = self.stored_settings.system_prompt.clone();
        run_once(&mut sess, prompt, self.model_selection()).await
    }

    // ── Sessions ───────────────────────────────────────────────────────

    pub fn list_sessions(&self) -> Result<Vec<SessionMeta>, AppError> {
        list_saved_sessions()
    }

    pub async fn load_session_by_name(
        &mut self,
        name: &str,
    ) -> Result<Option<SavedSession>, AppError> {
        if let Some(saved) = load_saved_session(name)? {
            let mut sess = self.session.lock().await;
            sess.cwd = std::path::PathBuf::from(&saved.cwd);
            sess.messages = saved.messages.clone();
            self.session_name = Some(name.to_string());
            Ok(Some(saved))
        } else {
            Ok(None)
        }
    }

    pub async fn save_session_state(
        &self,
        name: &str,
        entries: &[TranscriptEntry],
        tokens_in: u64,
        tokens_out: u64,
        tokens_cache_read: u64,
        tokens_cache_write: u64,
        current_mode: &str,
    ) -> Result<(), AppError> {
        let created_at_unix = load_saved_session(name)?.map(|existing| existing.created_at_unix);
        let sess = self.session.lock().await;
        let saved = build_saved_session(
            name.to_string(),
            sess.cwd.to_string_lossy().to_string(),
            sess.messages.clone(),
            entries.to_vec(),
            tokens_in,
            tokens_out,
            tokens_cache_read,
            tokens_cache_write,
            current_mode.to_string(),
            created_at_unix,
        );
        drop(sess);
        save_session_file(name, &saved)
    }

    pub async fn save_session_as(
        &mut self,
        name: &str,
        entries: &[TranscriptEntry],
        tokens_in: u64,
        tokens_out: u64,
        tokens_cache_read: u64,
        tokens_cache_write: u64,
        current_mode: &str,
    ) -> Result<(), AppError> {
        self.save_session_state(
            name,
            entries,
            tokens_in,
            tokens_out,
            tokens_cache_read,
            tokens_cache_write,
            current_mode,
        )
        .await?;
        self.session_name = Some(name.to_string());
        Ok(())
    }

    pub async fn auto_save_session(
        &mut self,
        entries: &[TranscriptEntry],
        tokens_in: u64,
        tokens_out: u64,
        tokens_cache_read: u64,
        tokens_cache_write: u64,
        current_mode: &str,
    ) {
        let name = self.ensure_session_name();
        let _ = self
            .save_session_state(
                &name,
                entries,
                tokens_in,
                tokens_out,
                tokens_cache_read,
                tokens_cache_write,
                current_mode,
            )
            .await;
    }

    pub fn session_exists(&self, name: &str) -> Result<bool, AppError> {
        crate::services::session_service::session_exists(name)
    }

    pub async fn delete_session(&mut self, name: &str) -> Result<(), AppError> {
        delete_session_file(name)?;
        if self.session_name.as_deref() == Some(name) {
            self.session_name = None;
        }
        Ok(())
    }

    pub async fn rename_session(&mut self, old_name: &str, new_name: &str) -> Result<(), AppError> {
        rename_session_file(old_name, new_name)?;
        if self.session_name.as_deref() == Some(old_name) {
            self.session_name = Some(new_name.to_string());
        }
        Ok(())
    }

    pub fn build_session_picker(&self) -> CommandPickerState {
        let sessions = self.list_sessions().unwrap_or_default();
        let current = sessions
            .iter()
            .position(|s| self.session_name.as_deref() == Some(&s.name))
            .unwrap_or(0);
        let items: Vec<(String, String, String)> = sessions
            .iter()
            .map(|s| {
                let age = crate::services::session_service::format_age(s.updated_at_unix);
                let status = if self.session_name.as_deref() == Some(&s.name) {
                    format!("✓ active — {} entries — {}", s.entry_count, age)
                } else {
                    format!("{} entries — {}", s.entry_count, age)
                };
                (s.name.clone(), s.name.clone(), status)
            })
            .collect();
        CommandPickerState {
            kind: CommandPickerKind::Session,
            items,
            selected_index: current,
            current_index: current,
        }
    }

    // ── OAuth ──────────────────────────────────────────────────────────

    pub fn start_oauth_login(&self, provider_id: &str) {
        start_oauth_login(provider_id, &self.worker_tx);
    }

    // ── Commands ───────────────────────────────────────────────────────

    pub fn execute_slash_command(&mut self, cmd: &str) -> CommandResult {
        match cmd {
            "/exit" | "/quit" => CommandResult::Quit,
            "/clear" => CommandResult::Clear,
            "/reset" => CommandResult::Reset,
            "/settings" => CommandResult::OpenSettings,
            "/provider" => CommandResult::OpenProviderPicker,
            "/model" => CommandResult::OpenModelPicker,
            "/theme" => CommandResult::OpenThemePicker,
            "/help" => {
                let mut lines = vec!["commands".to_string()];
                for cmd in all_slash_commands() {
                    lines.push(format!("  {:<14}  {}", cmd.name, cmd.description));
                }
                lines.push(String::new());
                lines.push("shortcuts".to_string());
                lines.push("  enter         send message".to_string());
                lines.push("  shift+enter   insert newline".to_string());
                lines.push("  esc           abort · close overlay".to_string());
                lines.push("  ctrl+c        quit".to_string());
                lines.push("  ctrl+l        clear session".to_string());
                lines.push("  ctrl+k        clear input".to_string());
                lines.push("  ctrl+o        toggle tool output".to_string());
                lines.push("  f2            settings".to_string());
                lines.push("  tab           accept suggestion".to_string());
                lines.push("  ↑↓            history · scroll".to_string());
                CommandResult::ShowHelp(lines)
            }
            "/providers" => {
                let mut lines = vec!["providers".to_string()];
                for p in provider_catalog() {
                    let status = provider_auth_status(&self.stored_settings, &p.id);
                    let oauth_label = if crate::domain::settings::is_oauth_provider(&p.id) {
                        " · oauth"
                    } else {
                        ""
                    };
                    lines.push(format!("  {:<18}  {}{}  ·  {}", p.name, p.id, oauth_label, status));
                }
                CommandResult::ShowProviders(lines)
            }
            "/sessions" => {
                let mut lines = vec!["sessions".to_string()];
                match self.list_sessions() {
                    Ok(sessions) => {
                        if sessions.is_empty() {
                            lines.push("  (none)".to_string());
                        } else {
                            for s in sessions {
                                let active = if self.session_name.as_deref() == Some(&s.name) {
                                    " ✓"
                                } else {
                                    ""
                                };
                                lines.push(format!(
                                    "  {}{}  ·  {} entries  ·  updated {}",
                                    s.name,
                                    active,
                                    s.entry_count,
                                    crate::services::session_service::format_age(s.updated_at_unix)
                                ));
                            }
                        }
                    }
                    Err(err) => {
                        lines.push(format!("  error: {}", err.message));
                    }
                }
                CommandResult::ShowSessions(lines)
            }
            "/session" => CommandResult::OpenSessionPicker,
            "/new" => CommandResult::NewSession,
            "/save" => {
                return CommandResult::ShowSystemMessage("Usage: /save <session-name>".to_string());
            }
            "/delete" => {
                return CommandResult::ShowSystemMessage(
                    "Usage: /delete <session-name>".to_string(),
                );
            }
            "/rename" => {
                return CommandResult::ShowSystemMessage(
                    "Usage: /rename <old-name> <new-name>".to_string(),
                );
            }
            "/login" => CommandResult::OpenLoginSelector {
                preselect_provider: None,
            },
            "/login copilot" => CommandResult::OpenLoginSelector {
                preselect_provider: Some("github-copilot".to_string()),
            },
            "/login codex" => CommandResult::OpenLoginSelector {
                preselect_provider: Some("openai-codex".to_string()),
            },
            "/copy" => CommandResult::CopyLastResponse,
            "/export" => {
                return CommandResult::ShowSystemMessage("Usage: /export [path]".to_string());
            }
            "/file" => {
                return CommandResult::ShowSystemMessage("Usage: /file <path>".to_string());
            }
            "/system" => {
                return CommandResult::ShowSystemMessage("Usage: /system <prompt>".to_string());
            }
            "/version" => CommandResult::ShowVersion,
            "/history" => {
                let history = crate::services::history_service::load_history().unwrap_or_default();
                let mut lines = vec!["── Input History ──".to_string()];
                if history.is_empty() {
                    lines.push("  (no history)".to_string());
                } else {
                    for (i, h) in history.iter().rev().take(20).enumerate() {
                        lines.push(format!(
                            "  {:2}. {}",
                            i + 1,
                            crate::ui::helpers::truncate_str(h, 60)
                        ));
                    }
                }
                CommandResult::ShowHistory(lines)
            }
            "/clear-history" => CommandResult::ClearHistory,
            "/tokens" => CommandResult::ShowTokens,
            "/config" => {
                let path = crate::services::settings_service::settings_path()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "(unknown)".to_string());
                CommandResult::ShowConfig(path)
            }
            _ => {
                if let Some(name) = cmd.strip_prefix("/session ") {
                    let name = name.trim();
                    if !name.is_empty() {
                        return CommandResult::SwitchSession {
                            name: name.to_string(),
                        };
                    }
                }
                if let Some(name) = cmd.strip_prefix("/save ") {
                    let name = name.trim();
                    if !name.is_empty() {
                        return CommandResult::SaveSession {
                            name: name.to_string(),
                        };
                    }
                }
                if let Some(name) = cmd.strip_prefix("/delete ") {
                    let name = name.trim();
                    if !name.is_empty() {
                        return CommandResult::DeleteSession {
                            name: name.to_string(),
                        };
                    }
                }
                if let Some(args) = cmd.strip_prefix("/rename ") {
                    let parts: Vec<&str> = args.trim().split_whitespace().collect();
                    if parts.len() == 2 {
                        return CommandResult::RenameSession {
                            old_name: parts[0].to_string(),
                            new_name: parts[1].to_string(),
                        };
                    }
                }
                if let Some(path) = cmd.strip_prefix("/export ") {
                    let path = path.trim();
                    return CommandResult::ExportSession {
                        path: if path.is_empty() {
                            None
                        } else {
                            Some(path.to_string())
                        },
                    };
                }
                if let Some(path) = cmd.strip_prefix("/export") {
                    let path = path.trim();
                    return CommandResult::ExportSession {
                        path: if path.is_empty() {
                            None
                        } else {
                            Some(path.to_string())
                        },
                    };
                }
                if let Some(path) = cmd.strip_prefix("/file ") {
                    let path = path.trim();
                    if !path.is_empty() {
                        let full_path = self.config.cwd.join(path);
                        match std::fs::read_to_string(&full_path) {
                            Ok(content) => {
                                return CommandResult::ReadFile {
                                    path: path.to_string(),
                                    content,
                                };
                            }
                            Err(err) => {
                                return CommandResult::ShowSystemMessage(format!(
                                    "Failed to read '{}': {}",
                                    path, err
                                ));
                            }
                        }
                    }
                }
                if let Some(prompt) = cmd.strip_prefix("/system ") {
                    let prompt = prompt.trim();
                    if !prompt.is_empty() {
                        return CommandResult::SetSystemPrompt {
                            prompt: prompt.to_string(),
                        };
                    }
                }
                CommandResult::None
            }
        }
    }

    pub fn filtered_commands(&self, input: &str) -> Vec<SlashCommand> {
        filter_slash_commands(input)
    }

    // ── Catalog helpers (exposed for UI) ───────────────────────────────

    pub fn provider_catalog(&self) -> Vec<crate::domain::models::ProviderCatalog> {
        provider_catalog()
    }

    pub fn models_for_provider(&self, provider: &str) -> Vec<(String, String)> {
        models_for_provider(provider)
    }

    pub fn provider_auth_status(&self, provider: &str) -> &'static str {
        provider_auth_status(&self.stored_settings, provider)
    }

    pub fn has_oauth_credentials(&self, provider: &str) -> bool {
        has_oauth_credentials(provider)
    }

    pub fn get_env_api_key(&self, provider: &str) -> Option<String> {
        khadim_ai_core::env_api_keys::get_env_api_key(provider)
    }

    pub fn estimate_cost(
        &self,
        provider: &str,
        model_id: &str,
        tokens_in: u64,
        tokens_out: u64,
        cache_read: u64,
        cache_write: u64,
    ) -> f64 {
        estimate_cost(
            provider,
            model_id,
            tokens_in,
            tokens_out,
            cache_read,
            cache_write,
        )
    }

    pub fn format_cost(&self, cost: f64) -> String {
        format_cost(cost)
    }

    pub fn format_tokens(&self, n: u64) -> String {
        format_tokens(n)
    }

    pub fn friendly_tool_name(&self, tool: &str) -> String {
        friendly_tool_name(tool)
    }

    // ── Login state builder ────────────────────────────────────────────

    pub fn build_login_state(&self) -> Option<LoginState> {
        let providers = oauth_provider_list();
        if providers.is_empty() {
            return None;
        }
        Some(LoginState {
            phase: LoginPhase::SelectProvider,
            providers,
            selected_index: 0,
            messages: Vec::new(),
            url: None,
            device_code: None,
        })
    }

    // ── Command picker builders ────────────────────────────────────────

    pub fn build_provider_picker(&self) -> CommandPickerState {
        let providers = provider_catalog();
        let current = providers
            .iter()
            .position(|p| self.stored_settings.provider.as_deref() == Some(p.id.as_str()))
            .unwrap_or(0);
        let items: Vec<(String, String, String)> = providers
            .iter()
            .map(|p| {
                let status = provider_auth_status(&self.stored_settings, &p.id).to_string();
                (p.id.clone(), p.name.clone(), status)
            })
            .collect();
        CommandPickerState {
            kind: CommandPickerKind::Provider,
            items,
            selected_index: current,
            current_index: current,
        }
    }

    pub fn build_model_picker(&self) -> CommandPickerState {
        let provider_id = self.stored_settings.provider.as_deref().unwrap_or("openai");
        let models = models_for_provider(provider_id);
        let current = models
            .iter()
            .position(|(id, _)| self.stored_settings.model_id.as_deref() == Some(id.as_str()))
            .unwrap_or(0);
        let items: Vec<(String, String, String)> = models
            .iter()
            .map(|(id, name)| (id.clone(), name.clone(), String::new()))
            .collect();
        CommandPickerState {
            kind: CommandPickerKind::Model,
            items,
            selected_index: current,
            current_index: current,
        }
    }

    pub fn build_theme_picker(&self) -> CommandPickerState {
        let mut items: Vec<(String, String, String)> = Vec::new();
        let current_family = self
            .stored_settings
            .theme_family
            .as_deref()
            .unwrap_or("default");
        let current_variant = self
            .stored_settings
            .theme_variant
            .as_deref()
            .unwrap_or("dark");
        for catalog in crate::themes::all_themes() {
            for variant in &catalog.variants {
                let combo_id = format!("{}:{}", catalog.family.id(), variant.id());
                let name = format!("{} ({})", catalog.family.label(), variant.id());
                let is_active =
                    current_family == catalog.family.id() && current_variant == variant.id();
                let status = if is_active { "✓ active" } else { "" };
                items.push((combo_id, name, status.to_string()));
            }
        }
        let current = items
            .iter()
            .position(|(id, _, _)| *id == format!("{}:{}", current_family, current_variant))
            .unwrap_or(0);

        CommandPickerState {
            kind: CommandPickerKind::Theme,
            items,
            selected_index: current,
            current_index: current,
        }
    }
}
