mod app;
mod args;
mod themes;
mod ui;

use app::*;
use args::*;
use crossterm::event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, KeyModifiers, MouseEventKind};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use khadim_coding_agent::{run_prompt, KhadimSession};
use khadim_ai_core::types::ModelSelection;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

// ── Open URL in browser ───────────────────────────────────────────────

fn open_url(url: &str) {
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "start"
    } else {
        "xdg-open"
    };
    let _ = std::process::Command::new(cmd)
        .arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

/// Start OAuth login flow for a provider, sending events to the login overlay
fn start_oauth_login(
    provider_id: &str,
    worker_tx: &tokio::sync::mpsc::UnboundedSender<WorkerEvent>,
    _app: &mut TuiApp,
) {
    let provider_id = provider_id.to_string();
    let tx = worker_tx.clone();

    match provider_id.as_str() {
        "github-copilot" => {
            tokio::spawn(async move {
                match khadim_ai_core::oauth::start_copilot_device_flow().await {
                    Ok(device_code) => {
                        // Send login progress events
                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: Some(device_code.verification_uri.clone()),
                            device_code: Some(device_code.user_code.clone()),
                            message: format!(
                                "Open the URL below and enter the code to authorize."
                            ),
                        });
                        // Auto-open browser
                        open_url(&device_code.verification_uri);

                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: None,
                            device_code: None,
                            message: "⏳ Waiting for authorization...".into(),
                        });

                        match khadim_ai_core::oauth::poll_copilot_device_flow(
                            &device_code.device_code,
                            device_code.interval,
                            device_code.expires_in,
                        ).await {
                            Ok(_) => {
                                let _ = tx.send(WorkerEvent::LoginComplete {
                                    success: true,
                                    message: "✓ GitHub Copilot connected! You can now select it as a provider.".into(),
                                });
                            }
                            Err(err) => {
                                let _ = tx.send(WorkerEvent::LoginComplete {
                                    success: false,
                                    message: format!("Login failed: {}", err.message),
                                });
                            }
                        }
                    }
                    Err(err) => {
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: format!("Failed to start login: {}", err.message),
                        });
                    }
                }
            });
        }
        "openai-codex" => {
            tokio::spawn(async move {
                match khadim_ai_core::oauth::start_openai_codex_login().await {
                    Ok(session_info) => {
                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: Some(session_info.auth_url.clone()),
                            device_code: None,
                            message: "Open the URL below to authorize.".into(),
                        });
                        // Auto-open browser
                        open_url(&session_info.auth_url);

                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: None,
                            device_code: None,
                            message: "⏳ Waiting for authorization...".into(),
                        });

                        // Poll until connected
                        for _ in 0..150 {
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                            match khadim_ai_core::oauth::get_openai_codex_login_status(&session_info.session_id).await {
                                Ok(status) if status.status == "connected" => {
                                    let _ = tx.send(WorkerEvent::LoginComplete {
                                        success: true,
                                        message: "✓ OpenAI Codex connected!".into(),
                                    });
                                    return;
                                }
                                Ok(status) if status.status == "failed" => {
                                    let msg = status.error.unwrap_or_else(|| "Unknown error".into());
                                    let _ = tx.send(WorkerEvent::LoginComplete {
                                        success: false,
                                        message: format!("Login failed: {msg}"),
                                    });
                                    return;
                                }
                                _ => {} // still pending
                            }
                        }
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: "Login timed out.".into(),
                        });
                    }
                    Err(err) => {
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: format!("Failed to start login: {}", err.message),
                        });
                    }
                }
            });
        }
        _ => {}
    }
}

// ── Terminal guard ───────────────────────────────────────────────────

struct TerminalGuard {
    terminal: ratatui::DefaultTerminal,
}

impl TerminalGuard {
    fn new() -> Result<Self, khadim_ai_core::error::AppError> {
        enable_raw_mode().map_err(|err| khadim_ai_core::error::AppError::io(format!("Failed to enable raw mode: {err}")))?;
        let mut stdout = std::io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)
            .map_err(|err| khadim_ai_core::error::AppError::io(format!("Failed to enter alternate screen: {err}")))?;
        let terminal = ratatui::init();
        Ok(Self { terminal })
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(self.terminal.backend_mut(), DisableMouseCapture, LeaveAlternateScreen);
        ratatui::restore();
    }
}

// ── Non-interactive (batch) mode ─────────────────────────────────────

async fn run_once(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
) -> Result<(), khadim_ai_core::error::AppError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<khadim_coding_agent::events::AgentStreamEvent>();
    let printer = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event.event_type.as_str() {
                "text_delta" => {
                    if let Some(content) = event.content { print!("{content}"); }
                }
                "step_start" => {
                    if let Some(content) = event.content { println!("\n[{content}]"); }
                }
                "step_update" => {
                    if let Some(ref metadata) = event.metadata {
                        if metadata.get("tool").and_then(|v| v.as_str()) == Some("model") {
                            if let Some(content) = event.content { print!("{content}"); }
                        }
                    }
                }
                "step_complete" => {
                    if let Some(content) = event.content { println!("[done] {content}"); }
                }
                "mode_selected" => {}
                "system_message" => {
                    if let Some(content) = event.content { println!("\n{content}"); }
                }
                "error" => {
                    if let Some(content) = event.content { println!("\n[error] {content}"); }
                }
                "done" => { println!(); }
                _ => {}
            }
        }
    });
    let result = run_prompt(session, prompt, selection, &tx).await;
    drop(tx);
    let _ = printer.await;
    result.map(|_| ())
}

// ── Interactive TUI ──────────────────────────────────────────────────

async fn tui(config: CliConfig) -> Result<(), khadim_ai_core::error::AppError> {
    let mut stored_settings = load_settings()?;
    let (worker_tx, mut worker_rx) = tokio::sync::mpsc::unbounded_channel::<WorkerEvent>();
    let config_cwd = config.cwd.clone();

    // Shared session behind a mutex so the spawned task can access it
    let session = Arc::new(Mutex::new(KhadimSession::new(config_cwd.clone())));

    // Track the current run task so we can abort it
    let mut current_run_handle: Option<tokio::task::JoinHandle<()>> = None;

    let mut guard = TerminalGuard::new()?;
    let mut app = TuiApp::new(&config, &stored_settings);
    
    // Initialize theme from settings
    ui::theme::set_current_theme(
        stored_settings.theme_family.clone(),
        stored_settings.theme_variant.clone(),
    );

    loop {
        // Drain ALL queued events before rendering — prevents UI lag
        loop {
            match worker_rx.try_recv() {
                Ok(event) => match event {
                    WorkerEvent::Stream(stream) => app.apply_event(stream),
                    WorkerEvent::Finished(result) => {
                        app.finish_result(result);
                        current_run_handle = None;
                    }
                    WorkerEvent::LoginProgress { url, device_code, message } => {
                        app.login_add_message(message);
                        if let Some(u) = url {
                            app.login_set_url(u);
                        }
                        if let Some(c) = device_code {
                            app.login_set_device_code(c);
                        }
                    }
                    WorkerEvent::LoginComplete { success, message } => {
                        app.close_login();
                        if success {
                            app.entries.push(TranscriptEntry::System { text: message });
                        } else {
                            app.entries.push(TranscriptEntry::Error { text: message });
                        }
                        app.entries.push(TranscriptEntry::Separator);
                    }
                },
                Err(_) => break,
            }
        }

        // Check if the running task has finished (e.g. panicked) — prevents stuck state
        if let Some(ref handle) = current_run_handle {
            if handle.is_finished() {
                // Task completed; drain any remaining events
                loop {
                    match worker_rx.try_recv() {
                        Ok(event) => match event {
                            WorkerEvent::Stream(stream) => app.apply_event(stream),
                            WorkerEvent::Finished(result) => {
                                app.finish_result(result);
                            }
                            WorkerEvent::LoginProgress { .. } | WorkerEvent::LoginComplete { .. } => {}
                        },
                        Err(_) => break,
                    }
                }
                // If still pending after draining, the task must have panicked
                if app.pending {
                    app.abort_with_message("Agent task terminated unexpectedly");
                }
                current_run_handle = None;
            }
        }

        // Tick the animation frame counter
        app.tick();

        guard
            .terminal
            .draw(|frame| ui::render(frame, &app, &config, &stored_settings))
            .map_err(|err| khadim_ai_core::error::AppError::io(format!("Failed to draw terminal UI: {err}")))?;

        if !event::poll(Duration::from_millis(50))
            .map_err(|err| khadim_ai_core::error::AppError::io(format!("Failed to poll terminal events: {err}")))?
        {
            continue;
        }

        let terminal_event = event::read()
            .map_err(|err| khadim_ai_core::error::AppError::io(format!("Failed to read terminal event: {err}")))?;

        match terminal_event {
            Event::Key(key) => {
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                // Ctrl-C: quit
                if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    break;
                }

                // F2: toggle settings
                if key.code == KeyCode::F(2) {
                    app.settings_open = !app.settings_open;
                    if !app.settings_open {
                        app.settings = build_settings_state(&stored_settings);
                        app.settings_dirty = false;
                    } else {
                        app.settings.mode = SettingsMode::Browsing;
                    }
                    continue;
                }

                // Escape: abort running agent (when pending) or close overlays
                if key.code == KeyCode::Esc {
                    if app.command_picker.is_some() {
                        app.close_picker();
                    } else if app.login_state.is_some() {
                        app.close_login();
                    } else if app.settings_open {
                        if app.settings.mode != SettingsMode::Browsing {
                            app.settings.mode = SettingsMode::Browsing;
                        } else {
                            app.settings_open = false;
                            app.settings = build_settings_state(&stored_settings);
                            app.settings_dirty = false;
                        }
                    } else if app.pending {
                        if let Some(handle) = current_run_handle.take() {
                            handle.abort();
                        }
                        app.abort();
                    }
                    continue;
                }

                // Command picker input handling
                if app.command_picker.is_some() {
                    match key.code {
                        KeyCode::Up => app.picker_move_up(),
                        KeyCode::Down => app.picker_move_down(),
                        KeyCode::Enter => {
                            if let Some((id, name)) = app.picker_selected() {
                                let kind = app.command_picker.as_ref().unwrap().kind;
                                app.close_picker();
                                match kind {
                                    app::CommandPickerKind::Provider => {
                                        // Update stored settings with new provider
                                        stored_settings.provider = Some(id.clone());
                                        // Reset model to first of new provider
                                        let models = app::models_for_provider(&id);
                                        stored_settings.model_id = models.first().map(|(mid, _)| mid.clone());
                                        save_settings(&stored_settings)?;
                                        stored_settings = load_settings()?;
                                        app.settings = build_settings_state(&stored_settings);
                                        app.entries.push(TranscriptEntry::System {
                                            text: format!("✓ Provider switched to {}", name),
                                        });
                                        app.entries.push(TranscriptEntry::Separator);
                                    }
                                    app::CommandPickerKind::Model => {
                                        stored_settings.model_id = Some(id.clone());
                                        save_settings(&stored_settings)?;
                                        stored_settings = load_settings()?;
                                        app.settings = build_settings_state(&stored_settings);
                                        app.entries.push(TranscriptEntry::System {
                                            text: format!("✓ Model switched to {}", name),
                                        });
                                        app.entries.push(TranscriptEntry::Separator);
                                    }
                                    app::CommandPickerKind::Theme => {
                                        // id is "family:variant" format
                                        if let Some((family_str, variant_str)) = id.split_once(':') {
                                            stored_settings.theme_family = Some(family_str.to_string());
                                            stored_settings.theme_variant = Some(variant_str.to_string());
                                            save_settings(&stored_settings)?;
                                            stored_settings = load_settings()?;

                                            // Apply the theme immediately
                                            crate::ui::theme::set_current_theme(
                                                Some(family_str.to_string()),
                                                Some(variant_str.to_string()),
                                            );

                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("✓ Theme set to {}", name),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                    }
                                }
                            }
                        }
                        KeyCode::Esc => app.close_picker(),
                        _ => {}
                    }
                    continue;
                }

                // Login overlay input handling
                if app.login_state.is_some() {
                    let phase = app.login_state.as_ref().unwrap().phase;
                    match phase {
                        app::LoginPhase::SelectProvider => match key.code {
                            KeyCode::Up => app.login_move_up(),
                            KeyCode::Down => app.login_move_down(),
                            KeyCode::Enter => {
                                let provider_id = app.login_selected_provider().unwrap_or_default();
                                if !provider_id.is_empty() {
                                    app.start_login_for_provider(&provider_id);
                                    start_oauth_login(&provider_id, &worker_tx, &mut app);
                                }
                            }
                            _ => {}
                        },
                        app::LoginPhase::InProgress => {
                            // Only Esc works during in-progress (handled above)
                        }
                    }
                    continue;
                }

                // Settings overlay input handling
                if app.settings_open {
                    use crate::app::SettingsMode;
                    match app.settings.mode {
                        SettingsMode::Browsing => match key.code {
                            KeyCode::Up => app.move_focus_up(),
                            KeyCode::Down | KeyCode::Tab => app.move_focus_down(),
                            KeyCode::Enter | KeyCode::Right => app.enter_field(),
                            KeyCode::Left => match app.settings.focus {
                                SettingsFocus::Provider => app.move_provider(-1),
                                SettingsFocus::Model => app.move_model(-1),
                                SettingsFocus::ApiKey => {}
                            },
                            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                let partial = stored_settings_from_state(&app.settings);
                                save_settings(&partial)?;
                                stored_settings = load_settings()?;
                                app.settings_open = false;
                                app.settings_dirty = false;
                                app.entries.push(TranscriptEntry::System { text: "✓ Settings saved".into() });
                                app.entries.push(TranscriptEntry::Separator);
                            }
                            _ => {}
                        },
                        SettingsMode::Choosing => match key.code {
                            KeyCode::Up => app.move_list_up(),
                            KeyCode::Down => app.move_list_down(),
                            KeyCode::Enter | KeyCode::Right => app.select_current_option(),
                            KeyCode::Esc | KeyCode::Left => app.exit_field(),
                            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                let partial = stored_settings_from_state(&app.settings);
                                save_settings(&partial)?;
                                stored_settings = load_settings()?;
                                app.settings_open = false;
                                app.settings_dirty = false;
                                app.entries.push(TranscriptEntry::System { text: "✓ Settings saved".into() });
                                app.entries.push(TranscriptEntry::Separator);
                            }
                            _ => {}
                        },
                        SettingsMode::EditingKey => match key.code {
                            KeyCode::Esc => app.exit_field(),
                            KeyCode::Enter => app.exit_field(),
                            KeyCode::Left => {
                                if app.settings.api_key_cursor > 0 {
                                    app.settings.api_key_cursor -= 1;
                                }
                            }
                            KeyCode::Right => {
                                if app.settings.api_key_cursor < app.settings.api_key.chars().count() {
                                    app.settings.api_key_cursor += 1;
                                }
                            }
                            KeyCode::Home => app.settings.api_key_cursor = 0,
                            KeyCode::End => app.settings.api_key_cursor = app.settings.api_key.chars().count(),
                            KeyCode::Backspace => {
                                if app.settings.api_key_cursor > 0 {
                                    app.settings.api_key_cursor = crate::ui::helpers::remove_char_before(&mut app.settings.api_key, app.settings.api_key_cursor);
                                    app.settings_dirty = true;
                                }
                            }
                            KeyCode::Delete => {
                                crate::ui::helpers::remove_char_at(&mut app.settings.api_key, app.settings.api_key_cursor);
                                app.settings_dirty = true;
                            }
                            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                let partial = stored_settings_from_state(&app.settings);
                                save_settings(&partial)?;
                                stored_settings = load_settings()?;
                                app.settings_open = false;
                                app.settings_dirty = false;
                                app.entries.push(TranscriptEntry::System { text: "✓ Settings saved".into() });
                                app.entries.push(TranscriptEntry::Separator);
                            }
                            KeyCode::Char(ch) if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) => {
                                crate::ui::helpers::insert_char(&mut app.settings.api_key, app.settings.api_key_cursor, ch);
                                app.settings.api_key_cursor += 1;
                                app.settings_dirty = true;
                            }
                            _ => {}
                        },
                    }
                    continue;
                }

                // Main input handling
                match key.code {
                    // Tab: accept slash command preview
                    KeyCode::Tab if app.slash_preview_visible() && !app.filtered_commands().is_empty() => {
                        let _ = app.preview_accept();
                    }
                    // Up/Down: navigate slash command preview if visible
                    KeyCode::Up if app.slash_preview_visible() && !app.filtered_commands().is_empty() => {
                        app.preview_move_up();
                    }
                    KeyCode::Down if app.slash_preview_visible() && !app.filtered_commands().is_empty() => {
                        app.preview_move_down();
                    }
                    // Ctrl-L: clear
                    KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.clear(&config, &stored_settings);
                    }
                    // Ctrl-O: toggle tool output collapse
                    KeyCode::Char('o') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.toggle_tool_collapse();
                    }
                    // Ctrl-K: clear input
                    KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.input.clear();
                        app.cursor = 0;
                    }
                    // PageUp: scroll up
                    KeyCode::PageUp => {
                        app.auto_scroll = false;
                        app.scroll_offset = app.scroll_offset.saturating_sub(10);
                    }
                    // PageDown: scroll down
                    KeyCode::PageDown => {
                        app.scroll_offset = app.scroll_offset.saturating_add(10);
                        let max_scroll = app.content_lines.get().saturating_sub(app.visible_height.get());
                        if app.scroll_offset >= max_scroll {
                            app.auto_scroll = true;
                        }
                    }
                    // Up arrow: scroll up one line (only when not in input)
                    KeyCode::Up => {
                        if app.input.is_empty() || !app.input_focused {
                            app.auto_scroll = false;
                            app.scroll_offset = app.scroll_offset.saturating_sub(1);
                        } else if app.cursor > 0 {
                            // Move cursor left within input (simple up handling)
                            app.cursor = app.cursor.saturating_sub(1);
                        }
                    }
                    // Down arrow: scroll down one line (only when not in input)
                    KeyCode::Down => {
                        if app.input.is_empty() || !app.input_focused {
                            app.scroll_offset = app.scroll_offset.saturating_add(1);
                            let max_scroll = app.content_lines.get().saturating_sub(app.visible_height.get());
                            if app.scroll_offset >= max_scroll {
                                app.auto_scroll = true;
                            }
                        } else if app.cursor < app.input.chars().count() {
                            app.cursor += 1;
                        }
                    }
                    // Home: scroll to top
                    KeyCode::Home => {
                        app.auto_scroll = false;
                        app.scroll_offset = 0;
                    }
                    // End: scroll to bottom
                    KeyCode::End => {
                        app.auto_scroll = true;
                    }
                    // Enter: submit (Shift+Enter inserts newline)
                    KeyCode::Enter => {
                        if key.modifiers.contains(KeyModifiers::SHIFT) {
                            ui::helpers::insert_char(&mut app.input, app.cursor, '\n');
                            app.cursor += 1;
                        } else {
                            // If slash preview is showing, autocomplete first
                            if app.slash_preview_visible() {
                                let cmds = app.filtered_commands();
                                if !cmds.is_empty() {
                                    if let Some(cmd_name) = app.preview_accept() {
                                        app.input = cmd_name;
                                        app.cursor = app.input.chars().count();
                                    }
                                }
                            }
                            let prompt = app.input.trim().to_string();
                            if prompt.is_empty() || app.pending {
                                continue;
                            }
                            app.input.clear();
                            app.cursor = 0;

                            if prompt == "/exit" || prompt == "/quit" {
                                break;
                            }
                            if prompt == "/clear" {
                                app.clear(&config, &stored_settings);
                                continue;
                            }
                            if prompt == "/reset" {
                                let mut sess = session.lock().await;
                                *sess = KhadimSession::new(config_cwd.clone());
                                drop(sess);
                                app.clear(&config, &stored_settings);
                                app.entries.push(TranscriptEntry::System { text: "↻ Session reset".into() });
                                app.entries.push(TranscriptEntry::Separator);
                                continue;
                            }
                            if prompt == "/settings" {
                                app.settings_open = true;
                                app.settings.mode = SettingsMode::Browsing;
                                continue;
                            }
                            if prompt == "/provider" {
                                app.open_provider_picker(&stored_settings);
                                continue;
                            }
                            if prompt == "/model" {
                                app.open_model_picker(&stored_settings);
                                continue;
                            }
                            if prompt == "/theme" {
                                app.open_theme_picker(&stored_settings);
                                continue;
                            }
                            if prompt == "/help" {
                                app.entries.push(TranscriptEntry::System { text: "── Commands ──────────────────────────────────".into() });
                                for cmd in app::all_slash_commands() {
                                    app.entries.push(TranscriptEntry::System {
                                        text: format!("  {} {:12} {}", cmd.icon, cmd.name, cmd.description),
                                    });
                                }
                                app.entries.push(TranscriptEntry::System { text: String::new() });
                                app.entries.push(TranscriptEntry::System { text: "── Shortcuts ─────────────────────────────────".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Enter        Send message".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Shift+Enter  Insert newline".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Esc          Abort agent / close overlay".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Ctrl+C       Quit".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Ctrl+L       Clear session".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Ctrl+K       Clear input".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Ctrl+O       Toggle tool output".into() });
                                app.entries.push(TranscriptEntry::System { text: "  F2           Settings panel".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Tab          Accept command suggestion".into() });
                                app.entries.push(TranscriptEntry::System { text: "  Up/Down      Navigate suggestions or scroll".into() });
                                app.entries.push(TranscriptEntry::Separator);
                                continue;
                            }
                            if prompt == "/providers" {
                                app.entries.push(TranscriptEntry::System { text: "── Available Providers ──".into() });
                                for p in app::provider_catalog() {
                                    let status = app::provider_auth_status(&stored_settings, &p.id);
                                    let oauth_label = if app::is_oauth_provider(&p.id) { " (oauth)" } else { "" };
                                    app.entries.push(TranscriptEntry::System {
                                        text: format!("  {} [{}]{} {}", p.name, p.id, oauth_label, status),
                                    });
                                }
                                app.entries.push(TranscriptEntry::Separator);
                                continue;
                            }
                            if prompt == "/login" || prompt == "/login copilot" || prompt == "/login codex" {
                                // If a specific provider was given, go straight to login
                                let target_provider = if prompt == "/login copilot" {
                                    Some("github-copilot".to_string())
                                } else if prompt == "/login codex" {
                                    Some("openai-codex".to_string())
                                } else {
                                    None
                                };
                                
                                if let Some(provider_id) = target_provider {
                                    // Direct login for a specific provider
                                    app.open_login_selector();
                                    // Find and select the provider
                                    if let Some(ref mut login) = app.login_state {
                                        if let Some(idx) = login.providers.iter().position(|p| p.id == provider_id) {
                                            login.selected_index = idx;
                                        }
                                    }
                                    // Immediately start login
                                    let provider_id_clone = app.login_selected_provider().unwrap_or_default();
                                    if !provider_id_clone.is_empty() {
                                        app.start_login_for_provider(&provider_id_clone);
                                        start_oauth_login(&provider_id_clone, &worker_tx, &mut app);
                                    }
                                } else {
                                    // Show provider selector
                                    app.open_login_selector();
                                }
                                continue;
                            }

                            app.submit_user_prompt(&prompt);
                            let selection = model_selection(&config, &stored_settings);

                            // Spawn the agent run as a separate task so we can abort it
                            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
                            let session_clone = session.clone();
                            let worker_tx_clone = worker_tx.clone();
                            let worker_tx_for_result = worker_tx_clone.clone();
                            let handle = tokio::spawn(async move {
                                let forwarder = tokio::spawn(async move {
                                    while let Some(event) = rx.recv().await {
                                        let _ = worker_tx_clone.send(WorkerEvent::Stream(event));
                                    }
                                });
                                let mut sess = session_clone.lock().await;
                                let result = run_prompt(&mut sess, &prompt, selection, &tx).await;
                                drop(tx);
                                let _ = forwarder.await;
                                let _ = worker_tx_for_result.send(WorkerEvent::Finished(result));
                            });
                            current_run_handle = Some(handle);
                        }
                    }
                    KeyCode::Backspace => {
                        app.cursor = ui::helpers::remove_char_before(&mut app.input, app.cursor);
                        app.command_preview_index = 0;
                    }
                    KeyCode::Delete => {
                        ui::helpers::remove_char_at(&mut app.input, app.cursor);
                        app.command_preview_index = 0;
                    }
                    KeyCode::Left => {
                        if app.cursor > 0 {
                            app.cursor -= 1;
                        }
                    }
                    KeyCode::Right => {
                        if app.cursor < app.input.chars().count() {
                            app.cursor += 1;
                        }
                    }
                    // Ctrl+A: move cursor to start of input
                    KeyCode::Char('a') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.cursor = 0;
                    }
                    // Ctrl+E: move cursor to end of input
                    KeyCode::Char('e') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.cursor = app.input.chars().count();
                    }
                    KeyCode::Char(ch) if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) => {
                        ui::helpers::insert_char(&mut app.input, app.cursor, ch);
                        app.cursor += 1;
                        app.command_preview_index = 0;
                    }
                    _ => {}
                }
            }

            Event::Mouse(mouse) => {
                match mouse.kind {
                    MouseEventKind::ScrollUp => {
                        app.auto_scroll = false;
                        app.scroll_offset = app.scroll_offset.saturating_sub(3);
                    }
                    MouseEventKind::ScrollDown => {
                        app.scroll_offset = app.scroll_offset.saturating_add(3);
                        let max_scroll = app.content_lines.get().saturating_sub(app.visible_height.get());
                        if app.scroll_offset >= max_scroll {
                            app.auto_scroll = true;
                        }
                    }
                    _ => {}
                }
            }

            _ => {}
        }
    }

    // Clean up: abort any running task
    if let Some(handle) = current_run_handle.take() {
        handle.abort();
    }

    Ok(())
}

// ── Main ─────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    env_logger::init();

    let result = async {
        let config = parse_args()?;
        let settings = load_settings()?;
        let mut session = KhadimSession::new(config.cwd.clone());
        if let Some(prompt) = config.prompt.clone() {
            // In batch mode, log errors but exit 0 so verifiers can score partial work
            match run_once(
                &mut session,
                &prompt,
                model_selection(&config, &settings),
            )
            .await
            {
                Ok(()) => Ok(()),
                Err(error) => {
                    eprintln!("agent error (non-fatal): {}", error.message);
                    Ok(())
                }
            }
        } else {
            tui(config).await
        }
    }
    .await;

    if let Err(error) = result {
        eprintln!("error: {}", error.message);
        std::process::exit(1);
    }
}