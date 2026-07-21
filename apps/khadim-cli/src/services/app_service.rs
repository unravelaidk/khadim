use crate::args::{CliConfig, ToolGroup};
use crate::domain::commands::{
    all_slash_commands, filter_slash_commands, CommandPickerKind, CommandPickerState, SlashCommand,
};
use crate::domain::events::WorkerEvent;
use crate::domain::harness::Harness;

use crate::domain::session::{SavedSession, SessionMeta};
use crate::domain::settings::StoredSettings;
use crate::domain::transcript::TranscriptEntry;
use crate::services::agent_service::{run_once, run_once_json};
use crate::services::catalog_service::{
    estimate_cost, format_cost, format_tokens, has_oauth_credentials, models_for_provider,
    provider_auth_status, provider_catalog,
};
use crate::services::oauth_service::start_oauth_login;
use crate::services::plugin_runtime::collect_plugin_tools;
use crate::services::session_service::{
    build_saved_session, delete_session as delete_session_file, generate_session_name,
    list_sessions as list_saved_sessions, load_session as load_saved_session,
    rename_session as rename_session_file, save_session as save_session_file,
};
use crate::services::settings_service::{effective_settings, load_settings, save_settings};
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::KhadimSession;
use khadim_coding_agent::{
    build_mode, chat_mode, default_tools, explore_mode, plan_mode, run_prompt_with_runtime,
    run_prompt_with_runtime_and_explicit_mode_and_config, AgentRuntime, RunConfig,
};
use serde_json::Value;
use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::Mutex;

type BatchRunFuture<'a> = Pin<Box<dyn Future<Output = Result<(), AppError>> + Send + 'a>>;

/// Result of executing a slash command.
pub enum CommandResult {
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
    /// Open harness picker.
    OpenHarnessPicker,
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
    /// Refresh dynamic model lists.
    RefreshModels,
    /// Toggle multi-agent coordinator mode.
    ToggleMultiAgent,
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

    pub const fn config(&self) -> &CliConfig {
        &self.config
    }

    pub const fn stored_settings(&self) -> &StoredSettings {
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
        let base_url_override = self.config.base_url.clone();
        let run_api_key = std::env::var("KHADIM_RUN_API_KEY")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let has_per_run_model_override = base_url_override.is_some() || run_api_key.is_some();
        let provider = effective.provider.clone().or_else(|| {
            has_per_run_model_override.then(khadim_ai_core::env_api_keys::get_default_provider)
        })?;
        let model_id = effective.model_id.clone().or_else(|| {
            has_per_run_model_override
                .then(|| khadim_ai_core::env_api_keys::get_default_model(&provider))
        })?;
        // Electron injects a decrypted, per-run credential through this
        // process-scoped override. It must win over CLI-saved/provider env
        // credentials, while blank values intentionally fall through.
        let api_key = run_api_key.or_else(|| {
            if self.config.ignore_saved_api_key {
                khadim_ai_core::env_api_keys::get_env_api_key(&provider)
            } else {
                effective.get_api_key_for(&provider)
            }
        });
        let base_url =
            base_url_override.or_else(|| khadim_ai_core::env_api_keys::get_env_base_url(&provider));
        Some(ModelSelection {
            provider,
            model_id,
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

    pub fn current_harness(&self) -> &Harness {
        &self.config.harness
    }

    pub fn switch_harness(&mut self, harness_id: &str) -> Result<(), AppError> {
        self.config.harness = Harness::parse(harness_id)?;
        Ok(())
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
        let multi_agent = explicit_mode.as_deref() == Some("multi");
        if let Err(error) = validate_multi_agent_run_policy(&self.config, multi_agent) {
            let _ = self.worker_tx.send(WorkerEvent::Finished(Err(error)));
            return;
        }
        let selection = self.model_selection();
        let system_prompt = self.effective_settings().system_prompt;
        let runtime_config = self.config.clone();
        let mut plugin_tools = match collect_plugin_tools(&runtime_config.cwd) {
            Ok(tools) => tools,
            Err(error) => {
                let _ = self.worker_tx.send(WorkerEvent::Finished(Err(error)));
                return;
            }
        };
        let session = self.session.clone();
        let worker_tx = self.worker_tx.clone();

        // Bridge for the question tool to communicate with the TUI
        let (question_tx, mut question_rx) = tokio::sync::mpsc::unbounded_channel::<(
            crate::tools::question_tool::QuestionRequest,
            tokio::sync::oneshot::Sender<crate::tools::question_tool::QuestionResponse>,
        )>();
        let question_bridge = crate::tools::question_tool::QuestionBridge { tx: question_tx };
        let question_tool = Arc::new(crate::tools::question_tool::QuestionTool::new(
            question_bridge,
        ));

        let handle = tokio::spawn(async move {
            // Forward question requests from the agent task to the main UI thread
            let worker_tx_for_questions = worker_tx.clone();
            let question_forwarder = tokio::spawn(async move {
                while let Some((request, response_tx)) = question_rx.recv().await {
                    let _ = worker_tx_for_questions.send(WorkerEvent::QuestionRequest {
                        request,
                        response_tx,
                    });
                }
            });

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
            plugin_tools.push(question_tool as Arc<dyn Tool>);
            let runtime = runtime_for_config(&runtime_config, plugin_tools);
            let run_config = run_config_for(&runtime_config);
            let result = if multi_agent {
                khadim_coding_agent::run_multi_agent(
                    &mut sess,
                    &prompt,
                    selection,
                    &tx,
                    runtime,
                    khadim_coding_agent::MultiAgentConfig::default(),
                )
                .await
            } else {
                match explicit_mode.as_deref() {
                    Some("build") => {
                        run_prompt_with_runtime_and_explicit_mode_and_config(
                            &mut sess,
                            &prompt,
                            selection,
                            build_mode(),
                            &tx,
                            runtime,
                            run_config,
                        )
                        .await
                    }
                    Some("plan") => {
                        run_prompt_with_runtime_and_explicit_mode_and_config(
                            &mut sess,
                            &prompt,
                            selection,
                            plan_mode(),
                            &tx,
                            runtime,
                            run_config,
                        )
                        .await
                    }
                    Some("explore") => {
                        run_prompt_with_runtime_and_explicit_mode_and_config(
                            &mut sess,
                            &prompt,
                            selection,
                            explore_mode(),
                            &tx,
                            runtime,
                            run_config,
                        )
                        .await
                    }
                    Some("chat") => {
                        run_prompt_with_runtime_and_explicit_mode_and_config(
                            &mut sess,
                            &prompt,
                            selection,
                            chat_mode(),
                            &tx,
                            runtime,
                            run_config,
                        )
                        .await
                    }
                    _ => {
                        run_prompt_with_runtime(
                            &mut sess, &prompt, selection, &tx, runtime, run_config,
                        )
                        .await
                    }
                }
            };
            drop(tx);
            let _ = forwarder.await;
            drop(question_forwarder);
            let _ = worker_tx_for_result.send(WorkerEvent::Finished(result));
        });
        self.current_run = Some(handle);
    }

    /// Abort the current agent run.  The abort signals the tokio task to
    /// cancel at its next `.await` point, which releases the session mutex
    /// so that `auto_save_session` (or any subsequent lock) will not hang.
    pub fn abort_run(&mut self) {
        if let Some(handle) = self.current_run.take() {
            handle.abort();
        }
    }

    pub fn is_run_finished(&self) -> bool {
        self.current_run
            .as_ref()
            .is_none_or(tokio::task::JoinHandle::is_finished)
    }

    pub fn drain_finished_run(&mut self) -> bool {
        if self.is_run_finished() && self.current_run.is_some() {
            self.current_run = None;
            return true;
        }
        false
    }

    /// Run the agent in batch mode (non-interactive).
    pub async fn run_batch(&mut self, prompt: &str, json: bool) -> Result<(), AppError> {
        validate_multi_agent_run_policy(&self.config, self.config.multi_agent)?;
        let system_prompt = self.effective_settings().system_prompt;
        let selection = self.model_selection();
        let runtime = runtime_for_config(&self.config, collect_plugin_tools(&self.config.cwd)?);
        let run_config = run_config_for(&self.config);
        let multi_agent = self.config.multi_agent;
        let prompt = prompt.to_string();
        self.run_batch_transaction(move |sess| {
            Box::pin(async move {
                sess.system_prompt_override = system_prompt;
                if json {
                    run_once_json(sess, &prompt, selection, runtime, run_config, multi_agent).await
                } else {
                    run_once(sess, &prompt, selection, runtime, run_config, multi_agent).await
                }
            })
        })
        .await
    }

    async fn run_batch_transaction<F>(&mut self, runner: F) -> Result<(), AppError>
    where
        F: for<'a> FnOnce(&'a mut KhadimSession) -> BatchRunFuture<'a>,
    {
        let requested_name = self.config.session.clone();
        let previous = if let Some(name) = requested_name.as_deref() {
            self.load_session_by_name(name).await?
        } else {
            None
        };

        let result = {
            let mut sess = self.session.lock().await;
            runner(&mut sess).await
        };
        result?;

        if let Some(name) = requested_name {
            self.save_batch_session(&name, previous.as_ref()).await?;
            self.session_name = Some(name);
        }
        Ok(())
    }

    async fn save_batch_session(
        &self,
        name: &str,
        previous: Option<&SavedSession>,
    ) -> Result<(), AppError> {
        let entries = previous.map_or_else(Vec::new, |saved| saved.entries.clone());
        let tokens_in = previous.map_or(0, |saved| saved.tokens_in);
        let tokens_out = previous.map_or(0, |saved| saved.tokens_out);
        let tokens_cache_read = previous.map_or(0, |saved| saved.tokens_cache_read);
        let tokens_cache_write = previous.map_or(0, |saved| saved.tokens_cache_write);
        let current_mode = previous.map_or_else(
            || {
                if self.config.multi_agent {
                    "multi".to_string()
                } else {
                    "auto".to_string()
                }
            },
            |saved| saved.current_mode.clone(),
        );
        let created_at_unix = previous.map(|saved| saved.created_at_unix);

        let sess = self.session.lock().await;
        let saved = build_saved_session(
            name.to_string(),
            sess.cwd.to_string_lossy().into_owned(),
            sess.messages.clone(),
            entries,
            tokens_in,
            tokens_out,
            tokens_cache_read,
            tokens_cache_write,
            current_mode,
            created_at_unix,
        );
        drop(sess);
        save_session_file(name, &saved)
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
            sess.messages = saved.messages.clone();
            self.session_name = Some(name.to_string());
            Ok(Some(saved))
        } else {
            Ok(None)
        }
    }

    #[allow(clippy::too_many_arguments)]
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

    #[allow(clippy::too_many_arguments)]
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
            "/reset" => CommandResult::Reset,
            "/settings" => CommandResult::OpenSettings,
            "/provider" => CommandResult::OpenProviderPicker,
            "/model" => CommandResult::OpenModelPicker,
            "/harness" => CommandResult::OpenHarnessPicker,
            "/multi-agent" | "/multi" => CommandResult::ToggleMultiAgent,
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
                lines.push("  ctrl+b        toggle multi-agent ops rail".to_string());
                lines.push("  ctrl+w        toggle soft-wrap for code/tools".to_string());
                lines.push("  ctrl+y        copy last tool body / assistant text".to_string());
                lines.push("  ctrl+f        cycle worker filter (multi mode)".to_string());
                lines.push("  shift-tab     cycle mode (incl. multi-agent)".to_string());
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
                    lines.push(format!(
                        "  {:<18}  {}{}  ·  {}",
                        p.name, p.id, oauth_label, status
                    ));
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
            "/save" => CommandResult::ShowSystemMessage("Usage: /save <session-name>".to_string()),
            "/delete" => {
                CommandResult::ShowSystemMessage("Usage: /delete <session-name>".to_string())
            }
            "/rename" => {
                CommandResult::ShowSystemMessage("Usage: /rename <old-name> <new-name>".to_string())
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
            "/export" => CommandResult::ShowSystemMessage("Usage: /export [path]".to_string()),
            "/system" => CommandResult::ShowSystemMessage("Usage: /system <prompt>".to_string()),
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
                    .map_or_else(|_| "(unknown)".to_string(), |p| p.display().to_string());
                CommandResult::ShowConfig(path)
            }
            "/refresh-models" => CommandResult::RefreshModels,
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
                    let parts: Vec<&str> = args.split_whitespace().collect();
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
        let mut items: Vec<(String, String, String)> = models
            .iter()
            .map(|(id, name)| (id.clone(), name.clone(), String::new()))
            .collect();

        // OpenRouter models are fetched dynamically.  If the cache is still
        // empty, show a placeholder so the user knows what's happening.
        if provider_id == "openrouter" && items.is_empty() {
            items.push((
                String::new(),
                "(models still loading — close picker and retry in a moment)".to_string(),
                String::new(),
            ));
        }

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
            .position(|(id, _, _)| *id == format!("{current_family}:{current_variant}"))
            .unwrap_or(0);

        CommandPickerState {
            kind: CommandPickerKind::Theme,
            items,
            selected_index: current,
            current_index: current,
        }
    }

    pub fn build_harness_picker(&self) -> CommandPickerState {
        let current_harness = self.config.harness.id();
        let items: Vec<(String, String, String)> = Harness::catalog()
            .into_iter()
            .map(|harness| {
                let status = if harness.id() == current_harness {
                    format!("✓ active — {}", harness.description())
                } else {
                    harness.description().to_string()
                };
                (
                    harness.id().to_string(),
                    harness.label().to_string(),
                    status,
                )
            })
            .collect();
        let current = items
            .iter()
            .position(|(id, _, _)| id == current_harness)
            .unwrap_or(0);
        CommandPickerState {
            kind: CommandPickerKind::Harness,
            items,
            selected_index: current,
            current_index: current,
        }
    }
}

fn harness_tools(harness: &Harness) -> Vec<Arc<dyn Tool>> {
    let mut tools = if harness.uses_rpa_tools() {
        khadim_rpa_harness::default_tools()
    } else {
        Vec::new()
    };
    if harness.uses_rpa_tools() {
        tools.extend(crate::tools::qwen_vla_tool::qwen_vla_tools());
    }
    tools
}

struct ProjectBoundTool {
    root: PathBuf,
    additional_read_roots: Vec<PathBuf>,
    inner: Arc<dyn Tool>,
}

impl ProjectBoundTool {
    fn new(root: PathBuf, additional_read_roots: Vec<PathBuf>, inner: Arc<dyn Tool>) -> Self {
        Self {
            root,
            additional_read_roots,
            inner,
        }
    }
}

#[async_trait::async_trait]
impl Tool for ProjectBoundTool {
    fn definition(&self) -> ToolDefinition {
        let mut definition = self.inner.definition();
        let boundary_description = if self.additional_read_roots.is_empty() {
            "Access is restricted to the current project root; paths outside it are rejected."
        } else {
            "Access is restricted to the current project root and explicitly enabled read-only skill directories; paths outside those roots are rejected."
        };
        definition.description.push(' ');
        definition.description.push_str(boundary_description);
        if let Some(description) = definition
            .parameters
            .pointer_mut("/properties/path/description")
        {
            *description = Value::String(if self.additional_read_roots.is_empty() {
                "Path within the current project root. Relative paths are resolved from the project root; paths outside it are rejected."
                    .to_string()
            } else {
                "Path within the current project root, or an absolute path inside an explicitly enabled read-only skill directory. Relative paths are resolved from the project root."
                    .to_string()
            });
        }
        definition
            .prompt_snippet
            .push_str(" (project-root restricted)");
        definition
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input.get("path").and_then(Value::as_str).unwrap_or(".");
        validate_project_path(&self.root, &self.additional_read_roots, path)?;
        self.inner.execute(input).await
    }
}

fn validate_project_path(
    configured_root: &Path,
    additional_roots: &[PathBuf],
    raw_path: &str,
) -> Result<(), AppError> {
    let root = std::fs::canonicalize(configured_root).map_err(|error| {
        AppError::io(format!(
            "Cannot enforce the project root boundary for {}: {error}",
            configured_root.display()
        ))
    })?;
    let mut allowed_roots = vec![root.clone()];
    for additional_root in additional_roots {
        let canonical = std::fs::canonicalize(additional_root).map_err(|error| {
            AppError::io(format!(
                "Cannot enforce the enabled read root boundary for {}: {error}",
                additional_root.display()
            ))
        })?;
        if !canonical.is_dir() {
            return Err(AppError::invalid_input(format!(
                "Enabled read root is not a directory: {}",
                additional_root.display()
            )));
        }
        allowed_roots.push(canonical);
    }
    let requested = Path::new(raw_path);
    let candidate = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root.join(requested)
    };
    let normalized_candidate = normalize_path_lexically(&candidate);
    // Compare canonical path identities only after locating the deepest
    // existing ancestor. On Windows, canonical roots commonly use the
    // verbatim `\\?\` form while a valid absolute model/tool path uses a
    // drive-letter form; a lexical starts_with check rejects that safe path.
    // Canonicalizing the ancestor also preserves the symlink/junction escape
    // boundary for files that do not exist yet. Inspect the path exactly as
    // supplied rather than collapsing `..` first: operating systems resolve
    // a symlink before a following `..`, so lexical normalization could hide
    // an escape such as `outside-link/../new-file`.
    // Check both OS traversal semantics and the lexically normalized path the
    // built-in file tools actually execute. The first catches symlink/..
    // escapes; the second catches missing/../../outside paths whose missing
    // prefix prevents the raw path from having an existing outside ancestor.
    for path_to_check in [&candidate, &normalized_candidate] {
        let canonical_ancestor = canonical_deepest_existing_ancestor(path_to_check, raw_path)?;
        if !allowed_roots
            .iter()
            .any(|allowed_root| canonical_ancestor.starts_with(allowed_root))
        {
            return Err(path_outside_project_error(raw_path));
        }
    }
    Ok(())
}

fn canonical_deepest_existing_ancestor(
    candidate: &Path,
    raw_path: &str,
) -> Result<PathBuf, AppError> {
    let mut existing_ancestor = candidate;
    loop {
        match std::fs::symlink_metadata(existing_ancestor) {
            Ok(_) => break,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                existing_ancestor = existing_ancestor
                    .parent()
                    .ok_or_else(|| path_outside_project_error(raw_path))?;
            }
            Err(error) => {
                return Err(AppError::io(format!(
                    "Failed to inspect project path {}: {error}",
                    existing_ancestor.display()
                )))
            }
        }
    }
    std::fs::canonicalize(existing_ancestor).map_err(|_| path_outside_project_error(raw_path))
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
    path.components()
        .fold(PathBuf::new(), |mut normalized, component| {
            use std::path::Component;
            match component {
                Component::CurDir => {}
                Component::ParentDir => {
                    normalized.pop();
                }
                other => normalized.push(other.as_os_str()),
            }
            normalized
        })
}

fn path_outside_project_error(raw_path: &str) -> AppError {
    AppError::invalid_input(format!(
        "Path '{raw_path}' is outside the project root and is not allowed by the files tool group"
    ))
}

fn validate_multi_agent_run_policy(config: &CliConfig, multi_agent: bool) -> Result<(), AppError> {
    if multi_agent && config.tool_groups.is_some() {
        return Err(AppError::invalid_input(
            "--multi-agent cannot be combined with explicit --tool-groups because worker runtimes do not yet inherit the tool allowlist",
        ));
    }
    if multi_agent && config.temperature.is_some() {
        return Err(AppError::invalid_input(
            "--multi-agent cannot be combined with --temperature because worker runs do not yet inherit the per-run override",
        ));
    }
    Ok(())
}

fn run_config_for(config: &CliConfig) -> RunConfig {
    RunConfig {
        temperature: config.temperature,
        ..RunConfig::default()
    }
}

const WEB_TOOL_NAMES: &[&str] = &["web_search", "web_fetch"];
const FILE_TOOL_NAMES: &[&str] = &["read", "write", "edit", "append", "ls", "grep", "glob"];
const LEGACY_ONLY_TOOL_NAMES: &[&str] = &["bash", "delete", "memory", "delegate_to_agent"];
const RPA_TOOL_NAMES: &[&str] = &[
    "rpa_capabilities",
    "screen_capture",
    "computer_input",
    "audio_listen",
    "visual_find",
    "qwen_vla_action",
];

fn is_builtin_tool_name(name: &str) -> bool {
    WEB_TOOL_NAMES.contains(&name)
        || FILE_TOOL_NAMES.contains(&name)
        || LEGACY_ONLY_TOOL_NAMES.contains(&name)
        || RPA_TOOL_NAMES.contains(&name)
}

fn runtime_for_config(config: &CliConfig, legacy_extra_tools: Vec<Arc<dyn Tool>>) -> AgentRuntime {
    let prompt_suffix = config.harness.prompt_suffix();
    let Some(groups) = config.tool_groups.as_ref() else {
        let mut extras = harness_tools(&config.harness);
        extras.extend(legacy_extra_tools);
        return AgentRuntime::with_extras(&config.cwd, extras, prompt_suffix);
    };

    let web_enabled = groups.contains(&ToolGroup::Web);
    let files_enabled = groups.contains(&ToolGroup::Files);
    let apps_enabled = groups.contains(&ToolGroup::Apps);
    let rpa_enabled = groups.contains(&ToolGroup::Rpa);
    let mut seen = HashSet::new();
    let mut available_tools = default_tools(&config.cwd);
    available_tools.extend(legacy_extra_tools);
    let mut tools = available_tools
        .into_iter()
        .filter(|tool| {
            let name = tool.definition().name;
            let selected = (web_enabled && WEB_TOOL_NAMES.contains(&name.as_str()))
                || (files_enabled && FILE_TOOL_NAMES.contains(&name.as_str()))
                || (apps_enabled && !is_builtin_tool_name(&name));
            selected && seen.insert(name)
        })
        .map(|tool| {
            let name = tool.definition().name;
            if files_enabled && FILE_TOOL_NAMES.contains(&name.as_str()) {
                let additional_read_roots = if name == "read" {
                    config.skill_dirs.clone()
                } else {
                    Vec::new()
                };
                Arc::new(ProjectBoundTool::new(
                    config.cwd.clone(),
                    additional_read_roots,
                    tool,
                )) as Arc<dyn Tool>
            } else {
                tool
            }
        })
        .collect::<Vec<_>>();
    if rpa_enabled {
        tools.extend(harness_tools(&config.harness));
    }
    AgentRuntime::with_tools(&config.cwd, tools, prompt_suffix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::session::SavedSession;
    use crate::services::session_service::{load_session, save_session};
    use khadim_ai_core::types::ChatMessage;
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex as StdMutex, MutexGuard};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    static CONFIG_ENV_LOCK: StdMutex<()> = StdMutex::new(());
    static NATIVE_TOOLS_ENV_LOCK: StdMutex<()> = StdMutex::new(());
    static MODEL_ENV_LOCK: StdMutex<()> = StdMutex::new(());
    static RUN_API_KEY_ENV_LOCK: StdMutex<()> = StdMutex::new(());
    static PROVIDER_API_KEY_ENV_LOCK: StdMutex<()> = StdMutex::new(());

    struct ConfigHomeGuard {
        _lock: MutexGuard<'static, ()>,
        previous: Option<OsString>,
    }

    impl ConfigHomeGuard {
        fn set(path: &Path) -> Self {
            let lock = CONFIG_ENV_LOCK.lock().expect("config env lock");
            let previous = std::env::var_os("KHADIM_CONFIG_HOME");
            std::env::set_var("KHADIM_CONFIG_HOME", path);
            Self {
                _lock: lock,
                previous,
            }
        }
    }

    impl Drop for ConfigHomeGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.take() {
                std::env::set_var("KHADIM_CONFIG_HOME", previous);
            } else {
                std::env::remove_var("KHADIM_CONFIG_HOME");
            }
        }
    }

    struct NativeToolsEnvGuard {
        _lock: MutexGuard<'static, ()>,
        previous_tools: Option<OsString>,
        previous_url: Option<OsString>,
        previous_token: Option<OsString>,
    }

    impl NativeToolsEnvGuard {
        fn set(definitions: &str) -> Self {
            let lock = NATIVE_TOOLS_ENV_LOCK.lock().expect("native tools env lock");
            let previous_tools = std::env::var_os("KHADIM_NATIVE_TOOLS");
            let previous_url = std::env::var_os("KHADIM_NATIVE_TOOL_RPC_URL");
            let previous_token = std::env::var_os("KHADIM_NATIVE_TOOL_RPC_TOKEN");
            std::env::set_var("KHADIM_NATIVE_TOOLS", definitions);
            std::env::set_var("KHADIM_NATIVE_TOOL_RPC_URL", "http://native.invalid");
            std::env::set_var("KHADIM_NATIVE_TOOL_RPC_TOKEN", "test-token");
            Self {
                _lock: lock,
                previous_tools,
                previous_url,
                previous_token,
            }
        }
    }

    impl Drop for NativeToolsEnvGuard {
        fn drop(&mut self) {
            for (name, previous) in [
                ("KHADIM_NATIVE_TOOLS", self.previous_tools.take()),
                ("KHADIM_NATIVE_TOOL_RPC_URL", self.previous_url.take()),
                ("KHADIM_NATIVE_TOOL_RPC_TOKEN", self.previous_token.take()),
            ] {
                if let Some(previous) = previous {
                    std::env::set_var(name, previous);
                } else {
                    std::env::remove_var(name);
                }
            }
        }
    }

    struct OpenAiBaseUrlEnvGuard {
        _lock: MutexGuard<'static, ()>,
        previous: Option<OsString>,
    }

    impl OpenAiBaseUrlEnvGuard {
        fn set(value: &str) -> Self {
            let lock = MODEL_ENV_LOCK.lock().expect("model env lock");
            let previous = std::env::var_os("OPENAI_BASE_URL");
            std::env::set_var("OPENAI_BASE_URL", value);
            Self {
                _lock: lock,
                previous,
            }
        }
    }

    impl Drop for OpenAiBaseUrlEnvGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.take() {
                std::env::set_var("OPENAI_BASE_URL", previous);
            } else {
                std::env::remove_var("OPENAI_BASE_URL");
            }
        }
    }

    struct RunApiKeyEnvGuard {
        _lock: MutexGuard<'static, ()>,
        previous: Option<OsString>,
    }

    impl RunApiKeyEnvGuard {
        fn set(value: &str) -> Self {
            let lock = RUN_API_KEY_ENV_LOCK.lock().expect("run API key env lock");
            let previous = std::env::var_os("KHADIM_RUN_API_KEY");
            std::env::set_var("KHADIM_RUN_API_KEY", value);
            Self {
                _lock: lock,
                previous,
            }
        }
    }

    impl Drop for RunApiKeyEnvGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.take() {
                std::env::set_var("KHADIM_RUN_API_KEY", previous);
            } else {
                std::env::remove_var("KHADIM_RUN_API_KEY");
            }
        }
    }

    struct ModelCredentialEnvGuard {
        _run_lock: MutexGuard<'static, ()>,
        _provider_lock: MutexGuard<'static, ()>,
        previous_run_key: Option<OsString>,
        previous_openai_key: Option<OsString>,
        previous_generic_key: Option<OsString>,
    }

    impl ModelCredentialEnvGuard {
        fn set(run_key: Option<&str>, openai_key: Option<&str>) -> Self {
            let run_lock = RUN_API_KEY_ENV_LOCK.lock().expect("run API key env lock");
            let provider_lock = PROVIDER_API_KEY_ENV_LOCK
                .lock()
                .expect("provider API key env lock");
            let previous_run_key = std::env::var_os("KHADIM_RUN_API_KEY");
            let previous_openai_key = std::env::var_os("OPENAI_API_KEY");
            let previous_generic_key = std::env::var_os("KHADIM_API_KEY");
            set_optional_env("KHADIM_RUN_API_KEY", run_key);
            set_optional_env("OPENAI_API_KEY", openai_key);
            std::env::remove_var("KHADIM_API_KEY");
            Self {
                _run_lock: run_lock,
                _provider_lock: provider_lock,
                previous_run_key,
                previous_openai_key,
                previous_generic_key,
            }
        }
    }

    impl Drop for ModelCredentialEnvGuard {
        fn drop(&mut self) {
            restore_env("KHADIM_RUN_API_KEY", self.previous_run_key.take());
            restore_env("OPENAI_API_KEY", self.previous_openai_key.take());
            restore_env("KHADIM_API_KEY", self.previous_generic_key.take());
        }
    }

    fn set_optional_env(name: &str, value: Option<&str>) {
        if let Some(value) = value {
            std::env::set_var(name, value);
        } else {
            std::env::remove_var(name);
        }
    }

    fn restore_env(name: &str, value: Option<OsString>) {
        if let Some(value) = value {
            std::env::set_var(name, value);
        } else {
            std::env::remove_var(name);
        }
    }

    async fn spawn_openai_response_server() -> (String, tokio::task::JoinHandle<serde_json::Value>)
    {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind model server");
        let address = listener.local_addr().expect("model server address");
        let handle = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept model request");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            let (header_end, content_length) = loop {
                let read = stream.read(&mut buffer).await.expect("read model request");
                assert!(read > 0, "model request ended before headers");
                request.extend_from_slice(&buffer[..read]);
                if let Some(header_end) = request
                    .windows(4)
                    .position(|window| window == b"\r\n\r\n")
                    .map(|position| position + 4)
                {
                    let headers = String::from_utf8_lossy(&request[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().expect("content length"))
                        })
                        .expect("request content length");
                    break (header_end, content_length);
                }
            };
            while request.len() < header_end + content_length {
                let read = stream.read(&mut buffer).await.expect("read request body");
                assert!(read > 0, "model request ended before body");
                request.extend_from_slice(&buffer[..read]);
            }
            let body = serde_json::from_slice::<serde_json::Value>(
                &request[header_end..header_end + content_length],
            )
            .expect("parse model request body");

            let events = concat!(
                "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{}}}\n\n",
                "data: [DONE]\n\n"
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                events.len(),
                events
            );
            stream
                .write_all(response.as_bytes())
                .await
                .expect("write model response");
            body
        });
        (format!("http://{address}/v1"), handle)
    }

    fn config(cwd: PathBuf, session: Option<&str>) -> CliConfig {
        CliConfig {
            cwd,
            prompt: None,
            provider: None,
            model: None,
            temperature: None,
            base_url: None,
            search_provider: None,
            ignore_saved_api_key: false,
            parent_watch_fd: None,
            session: session.map(str::to_owned),
            delete_session: None,
            system_prompt: None,
            harness: Harness::default(),
            verbose: false,
            json: false,
            list_providers: None,
            list_models: None,
            codex_auth: None,
            admin_command: None,
            multi_agent: false,
            tool_groups: None,
            skill_dirs: Vec::new(),
        }
    }

    fn saved_session(name: &str, cwd: &Path, messages: Vec<ChatMessage>) -> SavedSession {
        SavedSession {
            name: name.to_string(),
            created_at_unix: 10,
            updated_at_unix: 20,
            cwd: cwd.to_string_lossy().into_owned(),
            messages,
            entries: Vec::new(),
            tokens_in: 1,
            tokens_out: 2,
            tokens_cache_read: 3,
            tokens_cache_write: 4,
            current_mode: "auto".to_string(),
        }
    }

    #[test]
    fn cli_base_url_overrides_provider_environment_and_omission_preserves_it() {
        let _base_url = OpenAiBaseUrlEnvGuard::set("https://env.example/v1");
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut overridden = config(temp.path().to_path_buf(), None);
        overridden.provider = Some("openai".to_string());
        overridden.model = Some("gpt-4o-mini".to_string());
        overridden.base_url = Some("https://cli.example/v1".to_string());
        let overridden_service =
            AppService::new(overridden, StoredSettings::default(), worker_tx.clone());
        let mut inherited = config(temp.path().to_path_buf(), None);
        inherited.provider = Some("openai".to_string());
        inherited.model = Some("gpt-4o-mini".to_string());
        let inherited_service = AppService::new(inherited, StoredSettings::default(), worker_tx);

        assert_eq!(
            overridden_service
                .model_selection()
                .expect("overridden selection")
                .base_url
                .as_deref(),
            Some("https://cli.example/v1")
        );
        assert_eq!(
            inherited_service
                .model_selection()
                .expect("inherited selection")
                .base_url
                .as_deref(),
            Some("https://env.example/v1")
        );
    }

    #[test]
    fn cli_base_url_applies_to_the_default_model_when_provider_flags_are_omitted() {
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut config = config(temp.path().to_path_buf(), None);
        config.base_url = Some("http://localhost:11434/v1".to_string());
        let service = AppService::new(config, StoredSettings::default(), worker_tx);

        let selection = service
            .model_selection()
            .expect("base URL requires an explicit default selection");

        assert_eq!(
            selection.base_url.as_deref(),
            Some("http://localhost:11434/v1")
        );
        assert_eq!(
            selection.provider,
            khadim_ai_core::env_api_keys::get_default_provider()
        );
        assert_eq!(
            selection.model_id,
            khadim_ai_core::env_api_keys::get_default_model(&selection.provider)
        );
    }

    #[test]
    fn ephemeral_run_api_key_overrides_saved_key_and_blank_values_fall_back() {
        let _run_key = RunApiKeyEnvGuard::set("ephemeral-key");
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut config = config(temp.path().to_path_buf(), None);
        config.provider = Some("openai".to_string());
        config.model = Some("gpt-4o-mini".to_string());
        let mut settings = StoredSettings::default();
        settings
            .api_keys
            .insert("openai".to_string(), "saved-key".to_string());
        let overridden = AppService::new(config.clone(), settings.clone(), worker_tx.clone());

        assert_eq!(
            overridden
                .model_selection()
                .expect("overridden selection")
                .api_key
                .as_deref(),
            Some("ephemeral-key")
        );

        std::env::set_var("KHADIM_RUN_API_KEY", "   ");
        let inherited = AppService::new(config, settings, worker_tx);
        assert_eq!(
            inherited
                .model_selection()
                .expect("fallback selection")
                .api_key
                .as_deref(),
            Some("saved-key")
        );
    }

    #[test]
    fn ephemeral_run_api_key_selects_the_default_model_when_settings_are_empty() {
        let _run_key = RunApiKeyEnvGuard::set("ephemeral-key");
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let service = AppService::new(
            config(temp.path().to_path_buf(), None),
            StoredSettings::default(),
            worker_tx,
        );

        let selection = service
            .model_selection()
            .expect("the per-run key requires an explicit default selection");

        assert_eq!(selection.api_key.as_deref(), Some("ephemeral-key"));
        assert_eq!(
            selection.provider,
            khadim_ai_core::env_api_keys::get_default_provider()
        );
        assert_eq!(
            selection.model_id,
            khadim_ai_core::env_api_keys::get_default_model(&selection.provider)
        );
    }

    #[test]
    fn ignoring_saved_keys_uses_the_provider_environment_key() {
        let _credentials = ModelCredentialEnvGuard::set(None, Some("provider-env-key"));
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut config = config(temp.path().to_path_buf(), None);
        config.provider = Some("openai".to_string());
        config.model = Some("gpt-4o-mini".to_string());
        config.ignore_saved_api_key = true;
        let mut settings = StoredSettings::default();
        settings
            .api_keys
            .insert("openai".to_string(), "saved-key".to_string());
        let service = AppService::new(config, settings, worker_tx);

        assert_eq!(
            service
                .model_selection()
                .expect("model selection")
                .api_key
                .as_deref(),
            Some("provider-env-key")
        );
    }

    #[test]
    fn ignoring_saved_keys_does_not_select_a_settings_key() {
        let _credentials = ModelCredentialEnvGuard::set(None, None);
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut config = config(temp.path().to_path_buf(), None);
        config.provider = Some("openai".to_string());
        config.model = Some("gpt-4o-mini".to_string());
        config.ignore_saved_api_key = true;
        let mut settings = StoredSettings::default();
        settings
            .api_keys
            .insert("openai".to_string(), "saved-key".to_string());
        let service = AppService::new(config, settings, worker_tx);

        assert_eq!(
            service.model_selection().expect("model selection").api_key,
            None
        );
    }

    #[test]
    fn ignoring_saved_keys_still_prefers_the_ephemeral_run_key() {
        let _credentials =
            ModelCredentialEnvGuard::set(Some("ephemeral-key"), Some("provider-env-key"));
        let temp = tempfile::tempdir().expect("temp dir");
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut config = config(temp.path().to_path_buf(), None);
        config.provider = Some("openai".to_string());
        config.model = Some("gpt-4o-mini".to_string());
        config.ignore_saved_api_key = true;
        let mut settings = StoredSettings::default();
        settings
            .api_keys
            .insert("openai".to_string(), "saved-key".to_string());
        let service = AppService::new(config, settings, worker_tx);

        assert_eq!(
            service
                .model_selection()
                .expect("model selection")
                .api_key
                .as_deref(),
            Some("ephemeral-key")
        );
    }

    #[test]
    fn cli_temperature_is_carried_into_the_agent_run_config() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.temperature = Some(1.25);

        let run_config = run_config_for(&config);

        assert_eq!(run_config.temperature, Some(1.25));
    }

    #[tokio::test]
    async fn temperature_override_reaches_batch_and_interactive_provider_requests() {
        let temp = tempfile::tempdir().expect("temp dir");
        let settings = || {
            let mut settings = StoredSettings::default();
            settings
                .api_keys
                .insert("openai".to_string(), "test-key".to_string());
            settings
        };
        let run_config = |base_url: String| {
            let mut config = config(temp.path().to_path_buf(), None);
            config.provider = Some("openai".to_string());
            config.model = Some("gpt-4o-mini".to_string());
            config.temperature = Some(1.25);
            config.base_url = Some(base_url);
            config.tool_groups = Some(Vec::new());
            config
        };

        let (batch_url, batch_request) = spawn_openai_response_server().await;
        let (batch_tx, _batch_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut batch_service = AppService::new(run_config(batch_url), settings(), batch_tx);
        batch_service
            .run_batch("batch temperature", false)
            .await
            .expect("batch run");
        let batch_body = batch_request.await.expect("batch request capture");

        let (interactive_url, interactive_request) = spawn_openai_response_server().await;
        let (interactive_tx, mut interactive_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut interactive_service =
            AppService::new(run_config(interactive_url), settings(), interactive_tx);
        interactive_service.spawn_agent_run(
            "interactive temperature".to_string(),
            Some("chat".to_string()),
        );
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                if let WorkerEvent::Finished(result) = interactive_rx
                    .recv()
                    .await
                    .expect("interactive worker event")
                {
                    result.expect("interactive run");
                    break;
                }
            }
        })
        .await
        .expect("interactive run timeout");
        let interactive_body = interactive_request
            .await
            .expect("interactive request capture");

        assert_eq!(batch_body["temperature"], serde_json::json!(1.25));
        assert_eq!(interactive_body["temperature"], serde_json::json!(1.25));
    }

    #[test]
    fn an_explicit_web_group_exposes_only_web_tools() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Web]);

        let runtime = runtime_for_config(&config, Vec::new());
        let mut names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(names, vec!["web_fetch", "web_search"]);
    }

    #[test]
    fn an_explicit_files_group_exposes_the_exact_local_tool_set() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let runtime = runtime_for_config(&config, Vec::new());
        let mut names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(
            names,
            vec!["append", "edit", "glob", "grep", "ls", "read", "write",]
        );
    }

    #[test]
    fn explicit_file_tool_schemas_describe_the_project_boundary() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        for definition in runtime_for_config(&config, Vec::new()).definitions() {
            assert!(definition.description.contains("project root"));
            assert!(definition.parameters["properties"]["path"]["description"]
                .as_str()
                .expect("path description")
                .contains("project root"));
        }
    }

    #[tokio::test]
    async fn explicit_file_tools_reject_parent_traversal_outside_the_project() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        std::fs::create_dir(&project).expect("project dir");
        let mut config = config(project.clone(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({"path": "../outside.txt", "content": "escaped"}))
            .await
            .err()
            .expect("traversal must be rejected");

        assert!(error.to_string().contains("outside the project root"));
        assert!(!temp.path().join("outside.txt").exists());
    }

    #[tokio::test]
    async fn explicit_file_tools_reject_absolute_paths_outside_the_project() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        std::fs::create_dir(&project).expect("project dir");
        let outside = temp.path().join("absolute-outside.txt");
        let mut config = config(project, None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({
                "path": outside.to_string_lossy(),
                "content": "escaped"
            }))
            .await
            .err()
            .expect("absolute escape must be rejected");

        assert!(error.to_string().contains("outside the project root"));
        assert!(!outside.exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn explicit_file_tools_reject_new_files_through_an_outside_symlink() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        let outside = temp.path().join("outside");
        std::fs::create_dir(&project).expect("project dir");
        std::fs::create_dir(&outside).expect("outside dir");
        std::os::unix::fs::symlink(&outside, project.join("linked"))
            .expect("outside directory symlink");
        let mut config = config(project, None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({"path": "linked/escaped.txt", "content": "escaped"}))
            .await
            .err()
            .expect("symlink escape must be rejected");

        assert!(error.to_string().contains("outside the project root"));
        assert!(!outside.join("escaped.txt").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn explicit_file_tools_reject_parent_traversal_after_an_outside_symlink() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        let outside = temp.path().join("outside");
        let outside_child = outside.join("child");
        std::fs::create_dir(&project).expect("project dir");
        std::fs::create_dir_all(&outside_child).expect("outside child dir");
        std::os::unix::fs::symlink(&outside_child, project.join("linked"))
            .expect("outside directory symlink");
        let mut config = config(project.clone(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({
                "path": "linked/../escaped.txt",
                "content": "escaped"
            }))
            .await
            .err()
            .expect("symlink plus parent traversal must be rejected");

        assert!(error.to_string().contains("outside the project root"));
        assert!(!outside.join("escaped.txt").exists());
        assert!(!project.join("escaped.txt").exists());
    }

    #[tokio::test]
    async fn explicit_file_tools_reject_parent_escape_after_a_missing_prefix() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        std::fs::create_dir(&project).expect("project dir");
        let mut config = config(project.clone(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({
                "path": "missing/../../escaped.txt",
                "content": "escaped"
            }))
            .await
            .err()
            .expect("missing prefix must not hide traversal outside the project");

        assert!(error.to_string().contains("outside the project root"));
        assert!(!temp.path().join("escaped.txt").exists());
        assert!(!project.join("escaped.txt").exists());
    }

    #[tokio::test]
    async fn explicit_file_tools_allow_new_files_inside_the_project() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        std::fs::create_dir(&project).expect("project dir");
        let mut config = config(project.clone(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({"path": "nested/new.txt", "content": "inside"}))
            .await
            .expect("in-project write");

        assert_eq!(
            std::fs::read_to_string(project.join("nested/new.txt")).expect("written file"),
            "inside"
        );
    }

    #[tokio::test]
    async fn explicit_file_tools_allow_absolute_new_paths_inside_the_project() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project with ünicode");
        std::fs::create_dir(&project).expect("project dir");
        let target = project.join("nested/absolute.txt");
        let mut config = config(project, None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        runtime_for_config(&config, Vec::new())
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({
                "path": target.to_string_lossy(),
                "content": "inside"
            }))
            .await
            .expect("absolute in-project write");

        assert_eq!(
            std::fs::read_to_string(target).expect("written file"),
            "inside"
        );
    }

    #[tokio::test]
    async fn explicit_read_allows_enabled_skill_dirs_but_write_remains_project_only() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        let skill_dir = temp.path().join("enabled-skill");
        std::fs::create_dir(&project).expect("project dir");
        std::fs::create_dir(&skill_dir).expect("skill dir");
        let skill_file = skill_dir.join("SKILL.md");
        std::fs::write(&skill_file, "enabled skill").expect("skill contents");
        let mut config = config(project, None);
        config.tool_groups = Some(vec![ToolGroup::Files]);
        config.skill_dirs = vec![std::fs::canonicalize(&skill_dir).expect("canonical skill dir")];
        let runtime = runtime_for_config(&config, Vec::new());

        let read_result = runtime
            .get("read")
            .expect("read tool")
            .execute(serde_json::json!({"path": skill_file.to_string_lossy()}))
            .await
            .expect("read enabled skill");
        let write_target = skill_dir.join("changed.md");
        let write_error = runtime
            .get("write")
            .expect("write tool")
            .execute(serde_json::json!({
                "path": write_target.to_string_lossy(),
                "content": "must not write"
            }))
            .await
            .err()
            .expect("skill directories are read-only");

        assert!(read_result.content.contains("enabled skill"));
        assert!(write_error.to_string().contains("outside the project root"));
        assert!(!write_target.exists());
    }

    #[tokio::test]
    async fn explicit_read_rejects_external_paths_without_a_skill_dir_flag() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project = temp.path().join("project");
        std::fs::create_dir(&project).expect("project dir");
        let outside = temp.path().join("outside.md");
        std::fs::write(&outside, "outside").expect("outside file");
        let mut config = config(project, None);
        config.tool_groups = Some(vec![ToolGroup::Files]);

        let error = runtime_for_config(&config, Vec::new())
            .get("read")
            .expect("read tool")
            .execute(serde_json::json!({"path": outside.to_string_lossy()}))
            .await
            .err()
            .expect("unapproved external read must fail");

        assert!(error.to_string().contains("outside the project root"));
    }

    #[test]
    fn an_explicit_empty_allowlist_exposes_no_tools_even_in_interactive_mode() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.harness = Harness::parse("rpa").expect("rpa harness");
        config.tool_groups = Some(Vec::new());
        let (question_tx, _question_rx) = tokio::sync::mpsc::unbounded_channel();
        let question_tool = Arc::new(crate::tools::question_tool::QuestionTool::new(
            crate::tools::question_tool::QuestionBridge { tx: question_tx },
        )) as Arc<dyn Tool>;

        let runtime = runtime_for_config(&config, vec![question_tool]);

        assert!(runtime.definitions().is_empty());
    }

    #[test]
    fn omitting_tool_groups_preserves_the_legacy_full_tool_set() {
        let _native_tools = NativeToolsEnvGuard::set("[]");
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.harness = Harness::parse("rpa").expect("rpa harness");

        let runtime = runtime_for_config(&config, Vec::new());
        let mut names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(
            names,
            vec![
                "append",
                "audio_listen",
                "bash",
                "computer_input",
                "delegate_to_agent",
                "delete",
                "edit",
                "glob",
                "grep",
                "ls",
                "memory",
                "qwen_vla_action",
                "read",
                "rpa_capabilities",
                "screen_capture",
                "visual_find",
                "web_fetch",
                "web_search",
                "write",
            ]
        );
    }

    #[test]
    fn explicit_tool_groups_reject_multi_agent_execution() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Web]);

        let error = validate_multi_agent_run_policy(&config, true)
            .err()
            .expect("explicit allowlists cannot be bypassed by worker runtimes");

        assert!(error.to_string().contains("cannot be combined"));
    }

    #[test]
    fn temperature_override_rejects_multi_agent_execution_until_workers_inherit_it() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.temperature = Some(0.8);

        let error = validate_multi_agent_run_policy(&config, true)
            .err()
            .expect("multi-agent must not silently drop the temperature override");

        assert!(error.to_string().contains("--temperature"));
    }

    #[tokio::test]
    async fn batch_multi_agent_is_rejected_before_running_with_explicit_tools() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.multi_agent = true;
        config.tool_groups = Some(vec![ToolGroup::Files]);
        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut service = AppService::new(config, StoredSettings::default(), worker_tx);

        let error = service
            .run_batch("must not reach a model", false)
            .await
            .err()
            .expect("batch multi-agent must fail closed");

        assert!(error.to_string().contains("cannot be combined"));
    }

    #[test]
    fn interactive_multi_agent_is_rejected_before_spawning_with_explicit_tools() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Files]);
        let (worker_tx, mut worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut service = AppService::new(config, StoredSettings::default(), worker_tx);

        service.spawn_agent_run(
            "must not reach a model".to_string(),
            Some("multi".to_string()),
        );

        let WorkerEvent::Finished(Err(error)) = worker_rx.try_recv().expect("policy error event")
        else {
            panic!("expected a failed finished event");
        };
        assert!(error.to_string().contains("cannot be combined"));
        assert!(service.current_run.is_none());
    }

    #[test]
    fn an_explicit_apps_group_exposes_only_non_builtin_native_rpc_tools() {
        let _native_tools = NativeToolsEnvGuard::set(
            r#"[
                {"name":"calendar_create","description":"Create an event","parameters":{"type":"object"}},
                {"name":"read","description":"Collides with a coding built-in","parameters":{"type":"object"}},
                {"name":"screen_capture","description":"Collides with an RPA built-in","parameters":{"type":"object"}}
            ]"#,
        );
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.tool_groups = Some(vec![ToolGroup::Apps]);

        let runtime = runtime_for_config(&config, Vec::new());
        let names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["calendar_create"]);
    }

    #[test]
    fn an_explicit_rpa_group_exposes_the_harness_rpa_tools() {
        let temp = tempfile::tempdir().expect("temp dir");
        let mut config = config(temp.path().to_path_buf(), None);
        config.harness = Harness::parse("rpa").expect("rpa harness");
        config.tool_groups = Some(vec![ToolGroup::Rpa]);

        let runtime = runtime_for_config(&config, Vec::new());
        let mut names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(
            names,
            vec![
                "audio_listen",
                "computer_input",
                "qwen_vla_action",
                "rpa_capabilities",
                "screen_capture",
                "visual_find",
            ]
        );
    }

    #[tokio::test]
    async fn loading_a_session_restores_exact_messages_but_keeps_the_active_cwd() {
        let temp = tempfile::tempdir().expect("temp dir");
        let _config_home = ConfigHomeGuard::set(temp.path());
        let old_cwd = temp.path().join("old-project");
        let active_cwd = temp.path().join("active-project");
        std::fs::create_dir_all(&old_cwd).expect("old cwd");
        std::fs::create_dir_all(&active_cwd).expect("active cwd");

        let messages = vec![
            ChatMessage::System {
                content: "saved system".to_string(),
            },
            ChatMessage::User {
                content: "saved user".to_string(),
            },
            ChatMessage::Assistant {
                content: Some("saved assistant".to_string()),
                tool_calls: Vec::new(),
                reasoning_content: Some("saved reasoning".to_string()),
            },
        ];
        save_session(
            "requested",
            &saved_session("requested", &old_cwd, messages.clone()),
        )
        .expect("seed saved session");

        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut service = AppService::new(
            config(active_cwd.clone(), Some("requested")),
            StoredSettings::default(),
            worker_tx,
        );
        service
            .load_session_by_name("requested")
            .await
            .expect("load saved session")
            .expect("saved session exists");
        service
            .save_session_state("round-trip", &[], 0, 0, 0, 0, "auto")
            .await
            .expect("save loaded state");

        let round_trip = load_session("round-trip")
            .expect("load round trip")
            .expect("round trip exists");
        assert_eq!(
            serde_json::to_value(&round_trip.messages).expect("serialize messages"),
            serde_json::to_value(&messages).expect("serialize expected messages")
        );
        assert_eq!(round_trip.cwd, active_cwd.to_string_lossy());
    }

    #[tokio::test]
    async fn a_successful_batch_run_saves_updated_messages_under_the_requested_key() {
        let temp = tempfile::tempdir().expect("temp dir");
        let _config_home = ConfigHomeGuard::set(temp.path());
        let old_cwd = temp.path().join("old-project");
        let active_cwd = temp.path().join("active-project");
        std::fs::create_dir_all(&active_cwd).expect("active cwd");

        let initial_messages = vec![ChatMessage::User {
            content: "before".to_string(),
        }];
        let mut original = saved_session("requested", &old_cwd, initial_messages.clone());
        original.entries = vec![TranscriptEntry::User {
            text: "visible transcript".to_string(),
        }];
        save_session("requested", &original).expect("seed saved session");

        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut service = AppService::new(
            config(active_cwd.clone(), Some("requested")),
            StoredSettings::default(),
            worker_tx,
        );
        let expected_initial =
            serde_json::to_value(&initial_messages).expect("serialize expected messages");
        let expected_active_cwd = active_cwd.clone();
        service
            .run_batch_transaction(|session| {
                Box::pin(async move {
                    assert_eq!(
                        serde_json::to_value(&session.messages).expect("serialize loaded messages"),
                        expected_initial
                    );
                    assert_eq!(session.cwd, expected_active_cwd);
                    session.messages.push(ChatMessage::Assistant {
                        content: Some("after".to_string()),
                        tool_calls: Vec::new(),
                        reasoning_content: None,
                    });
                    Ok(())
                })
            })
            .await
            .expect("successful batch transaction");

        let saved = load_session("requested")
            .expect("load requested session")
            .expect("requested session exists");
        assert_eq!(saved.messages.len(), 2);
        assert_eq!(
            serde_json::to_value(&saved.messages[1]).expect("serialize appended message"),
            serde_json::json!({
                "role": "assistant",
                "content": "after"
            })
        );
        assert_eq!(saved.cwd, active_cwd.to_string_lossy());
        assert_eq!(saved.entries.len(), 1);
        assert_eq!(saved.tokens_in, original.tokens_in);
        assert_eq!(saved.tokens_out, original.tokens_out);
        assert_eq!(saved.tokens_cache_read, original.tokens_cache_read);
        assert_eq!(saved.tokens_cache_write, original.tokens_cache_write);
        assert_eq!(saved.created_at_unix, original.created_at_unix);
        assert_eq!(saved.current_mode, original.current_mode);
    }

    #[tokio::test]
    async fn a_failed_batch_run_preserves_the_previous_saved_session() {
        let temp = tempfile::tempdir().expect("temp dir");
        let _config_home = ConfigHomeGuard::set(temp.path());
        let active_cwd = temp.path().join("active-project");
        std::fs::create_dir_all(&active_cwd).expect("active cwd");

        let original = saved_session(
            "requested",
            temp.path(),
            vec![ChatMessage::User {
                content: "last known good".to_string(),
            }],
        );
        save_session("requested", &original).expect("seed saved session");
        let session_path = temp
            .path()
            .join("khadim")
            .join("sessions")
            .join("requested.json");
        let before = std::fs::read(&session_path).expect("read original session bytes");

        let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut service = AppService::new(
            config(active_cwd, Some("requested")),
            StoredSettings::default(),
            worker_tx,
        );
        let error = service
            .run_batch_transaction(|session| {
                Box::pin(async move {
                    session.messages.push(ChatMessage::Assistant {
                        content: Some("partial failed reply".to_string()),
                        tool_calls: Vec::new(),
                        reasoning_content: None,
                    });
                    Err(AppError::health("agent failed"))
                })
            })
            .await
            .expect_err("batch run should fail");

        assert_eq!(error.message, "agent failed");
        let after = std::fs::read(&session_path).expect("read preserved session bytes");
        assert_eq!(after, before);
    }
}
