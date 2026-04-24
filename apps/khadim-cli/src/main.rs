mod app;
mod args;
mod domain;
mod infrastructure;
mod services;
mod splash;
mod themes;
mod tools;
mod ui;

use app::TuiApp;
use args::{parse_args, CliConfig};
use domain::commands::CommandPickerKind;
use domain::events::WorkerEvent;
use domain::login::LoginPhase;
use domain::settings::{is_oauth_provider, SettingsFocus, SettingsPicker, StoredSettings};
use domain::transcript::TranscriptEntry;
use infrastructure::terminal::TerminalGuard;
use khadim_ai_core::error::AppError;
use services::app_service::{AppService, CommandResult};
use services::settings_service::load_settings;
use std::time::Duration;

#[tokio::main]
async fn main() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    let result = async {
        let config = parse_args()?;
        let settings = load_settings()?;

        // Kick off NVIDIA and OpenRouter model autodiscovery in the background
        tokio::spawn(async move {
            let _ = khadim_ai_core::models::refresh_nvidia_models(None).await;
        });
        tokio::spawn(async move {
            let _ = khadim_ai_core::models::refresh_openrouter_models(None).await;
        });

        if let Some(prompt) = config.prompt.clone() {
            // Batch mode
            let (worker_tx, _worker_rx) = tokio::sync::mpsc::unbounded_channel::<WorkerEvent>();
            let app_service = AppService::new(config, settings, worker_tx);
            match app_service.run_batch(&prompt).await {
                Ok(()) => Ok(()),
                Err(error) => {
                    eprintln!("agent error (non-fatal): {}", error.message);
                    Ok(())
                }
            }
        } else {
            tui(config, settings).await
        }
    }
    .await;

    if let Err(error) = result {
        eprintln!("error: {}", error.message);
        std::process::exit(1);
    }
}

// ── Settings panel action helpers ────────────────────────────────────
//
// These helpers live in main.rs rather than app.rs because they straddle
// the UI state (TuiApp) and the service layer (AppService) — the UI
// mutation and the persistence step need to happen together.

fn flush_settings_key(app: &mut app::TuiApp, app_service: &mut services::app_service::AppService) {
    let provider = app_service
        .stored_settings()
        .provider
        .clone()
        .unwrap_or_default();
    if provider.is_empty() || is_oauth_provider(&provider) {
        return;
    }
    // Only write when the buffer actually differs from what's stored, to
    // avoid disk writes on every focus change.
    let current = app_service
        .stored_settings()
        .api_keys
        .get(&provider)
        .cloned()
        .unwrap_or_default();
    let buffer = app.settings.api_key_buffer.trim().to_string();
    if buffer == current {
        return;
    }
    app_service.update_api_key(&provider, &buffer);
    if let Err(err) = app_service.save_settings() {
        app.entries.push(TranscriptEntry::Error { text: err.message });
        app.entries.push(TranscriptEntry::Separator);
    }
}

fn apply_settings_picker(
    app: &mut app::TuiApp,
    app_service: &mut services::app_service::AppService,
    kind: SettingsPicker,
    id: &str,
) {
    let result = match kind {
        SettingsPicker::Provider => app_service.switch_provider(id),
        SettingsPicker::Model => app_service.switch_model(id),
    };
    if let Err(err) = result {
        app.entries.push(TranscriptEntry::Error { text: err.message });
        app.entries.push(TranscriptEntry::Separator);
        return;
    }
    // Re-seed the UI buffer from the (possibly new) provider's stored key.
    app.settings = app::build_settings_state(app_service.stored_settings());
    app.settings_open = true;
}

async fn tui(config: CliConfig, stored_settings: StoredSettings) -> Result<(), AppError> {
    splash::show_splash();

    let (worker_tx, mut worker_rx) = tokio::sync::mpsc::unbounded_channel::<WorkerEvent>();
    let mut app_service = AppService::new(config.clone(), stored_settings, worker_tx);

    let mut guard = TerminalGuard::new()?;
    let mut app = TuiApp::new(&config, app_service.stored_settings());

    ui::theme::set_current_theme(
        app_service.stored_settings().theme_family.clone(),
        app_service.stored_settings().theme_variant.clone(),
    );

    // Load saved session if --session was provided
    if let Some(ref session_name) = config.session {
        match app_service.load_session_by_name(session_name).await {
            Ok(Some(saved)) => {
                app.entries = saved.entries;
                app.tokens_in = saved.tokens_in;
                app.tokens_out = saved.tokens_out;
                app.tokens_cache_read = saved.tokens_cache_read;
                app.tokens_cache_write = saved.tokens_cache_write;
                app.current_mode = saved.current_mode;
                app.entries.push(TranscriptEntry::System {
                    text: format!("📂 Loaded session '{}'", session_name),
                });
                app.entries.push(TranscriptEntry::Separator);
            }
            Ok(None) => {
                app.entries.push(TranscriptEntry::System {
                    text: format!("⚠ Session '{}' not found — starting fresh", session_name),
                });
                app.entries.push(TranscriptEntry::Separator);
            }
            Err(err) => {
                app.entries.push(TranscriptEntry::Error {
                    text: format!("Failed to load session '{}': {}", session_name, err.message),
                });
                app.entries.push(TranscriptEntry::Separator);
            }
        }
    }

    // Graceful shutdown on SIGINT / SIGTERM so the terminal is always restored.
    //
    // The signal handler runs in a loop so a second Ctrl-C does NOT fall
    // through to the OS default handler (which would kill the process
    // before TerminalGuard::drop can restore the terminal).
    //
    // Flow:
    //   First Ctrl-C  → set shutdown flag, but DON'T exit immediately
    //                    while the agent is running (mirrors the keyboard
    //                    handler's two-press confirmation).
    //   Second Ctrl-C → send on exit channel, abort agent, save, break.
    //
    // SIGTERM always triggers an immediate graceful exit.
    let (exit_tx, mut exit_rx) = tokio::sync::mpsc::unbounded_channel();
    let shutdown_requested = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let shutdown_flag = shutdown_requested.clone();
    let exit_tx_sigint = exit_tx.clone();
    tokio::spawn(async move {
        loop {
            if tokio::signal::ctrl_c().await.is_err() {
                break;
            }
            if shutdown_flag.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = exit_tx_sigint.send(());
                break;
            }
            shutdown_flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    });
    #[cfg(unix)]
    {
        let exit_tx = exit_tx.clone();
        tokio::spawn(async move {
            use tokio::signal::unix::{signal, SignalKind};
            if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
                sigterm.recv().await;
                let _ = exit_tx.send(());
            }
        });
    }

    loop {
        // If a forced shutdown signal (second Ctrl-C or SIGTERM) was
        // received, abort the agent first so the session lock is released,
        // then save and exit.
        if exit_rx.try_recv().is_ok() {
            app_service.abort_run();
            app_service
                .auto_save_session(
                    &app.entries,
                    app.tokens_in,
                    app.tokens_out,
                    app.tokens_cache_read,
                    app.tokens_cache_write,
                    &app.current_mode,
                )
                .await;
            break;
        }

        // If the OS signal handler received its first Ctrl-C but the
        // keyboard handler hasn't fired yet (e.g. terminal didn't
        // capture the key event), mirror the two-press confirmation:
        // warn if the agent is running, exit cleanly if idle.
        if shutdown_requested.load(std::sync::atomic::Ordering::SeqCst)
            && !app.confirm_quit
            && app.pending
        {
            app.confirm_quit = true;
        }

        // Drain queued worker events
        loop {
            match worker_rx.try_recv() {
                Ok(event) => match event {
                    WorkerEvent::Stream(stream) => app.apply_event(stream),
                    WorkerEvent::Finished(result) => {
                        app.finish_result(result);
                        app_service.drain_finished_run();
                        app_service
                            .auto_save_session(
                                &app.entries,
                                app.tokens_in,
                                app.tokens_out,
                                app.tokens_cache_read,
                                app.tokens_cache_write,
                                &app.current_mode,
                            )
                            .await;
                    }
                    WorkerEvent::LoginProgress {
                        url,
                        device_code,
                        message,
                    } => {
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
                    WorkerEvent::QuestionRequest { request, response_tx } => {
                        app.set_pending_question(request, response_tx);
                    }
                },
                Err(_) => break,
            }
        }

        // Check if running task finished (e.g. panicked)
        if app_service.drain_finished_run() {
            loop {
                match worker_rx.try_recv() {
                    Ok(event) => match event {
                        WorkerEvent::Stream(stream) => app.apply_event(stream),
                        WorkerEvent::Finished(result) => app.finish_result(result),
                        WorkerEvent::LoginProgress { .. } | WorkerEvent::LoginComplete { .. } => {}
                        WorkerEvent::QuestionRequest { request, response_tx } => {
                            app.set_pending_question(request, response_tx);
                        }
                    },
                    Err(_) => break,
                }
            }
            if app.pending {
                app.abort_with_message("Agent task terminated unexpectedly");
            }
        }

        app.tick();

        guard
            .terminal()
            .draw(|frame| {
                ui::render(
                    frame,
                    &app,
                    &config,
                    app_service.stored_settings(),
                    app_service.current_session_name(),
                )
            })
            .map_err(|err| AppError::io(format!("Failed to draw terminal UI: {err}")))?;

        if !crossterm::event::poll(Duration::from_millis(50))
            .map_err(|err| AppError::io(format!("Failed to poll terminal events: {err}")))?
        {
            continue;
        }

        let terminal_event = crossterm::event::read()
            .map_err(|err| AppError::io(format!("Failed to read terminal event: {err}")))?;

        use crossterm::event::{Event, KeyCode, KeyEventKind, KeyModifiers, MouseEventKind};

        match terminal_event {
            Event::Key(key) => {
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                // Ctrl-C: quit (with confirmation if running)
                if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    let os_signal_already = shutdown_requested.load(std::sync::atomic::Ordering::SeqCst);
                    if app.pending && !app.confirm_quit && !os_signal_already {
                        app.confirm_quit = true;
                        app.entries.push(TranscriptEntry::System {
                            text: "agent is still running — press ctrl+c again to force quit"
                                .into(),
                        });
                        app.entries.push(TranscriptEntry::Separator);
                        continue;
                    }
                    // Abort the agent first so the session lock is released,
                    // then save and exit.
                    app_service.abort_run();
                    app_service
                        .auto_save_session(
                            &app.entries,
                            app.tokens_in,
                            app.tokens_out,
                            app.tokens_cache_read,
                            app.tokens_cache_write,
                            &app.current_mode,
                        )
                        .await;
                    break;
                }

                // F2: toggle settings. Closing flushes any staged key edits
                // to persistent storage so in-flight typing isn't lost.
                if key.code == KeyCode::F(2) {
                    if app.settings_open {
                        flush_settings_key(&mut app, &mut app_service);
                        app.settings_open = false;
                        app.settings = app::build_settings_state(app_service.stored_settings());
                    } else {
                        app.settings = app::build_settings_state(app_service.stored_settings());
                        app.settings_open = true;
                    }
                    continue;
                }

                // Escape: abort running agent or close overlays
                if key.code == KeyCode::Esc {
                    if app.confirm_quit {
                        app.confirm_quit = false;
                        shutdown_requested.store(false, std::sync::atomic::Ordering::SeqCst);
                    }
                    if app.has_pending_question() {
                        app.cancel_question();
                        continue;
                    }
                    if app.command_picker.is_some() {
                        app.close_picker();
                    } else if app.login_state.is_some() {
                        app.close_login();
                    } else if app.settings_open {
                        if app.settings.picker.is_some() {
                            app.close_settings_picker();
                        } else {
                            flush_settings_key(&mut app, &mut app_service);
                            app.settings_open = false;
                            app.settings = app::build_settings_state(app_service.stored_settings());
                        }
                    } else if app.pending {
                        app_service.abort_run();
                        app.abort();
                    }
                    continue;
                }

                // Command picker input handling
                if app.command_picker.is_some() {
                    let kind = app.command_picker.as_ref().unwrap().kind;
                    match key.code {
                        KeyCode::Up => app.picker_move_up(),
                        KeyCode::Down => app.picker_move_down(),
                        KeyCode::Char('d')
                            if kind == CommandPickerKind::Session
                                && !key.modifiers.contains(KeyModifiers::CONTROL)
                                && !key.modifiers.contains(KeyModifiers::ALT) =>
                        {
                            if let Some((id, _name)) = app.picker_selected() {
                                match app_service.delete_session(&id).await {
                                    Ok(()) => {
                                        app.entries.push(TranscriptEntry::System {
                                            text: format!("deleted session '{}'", id),
                                        });
                                    }
                                    Err(err) => {
                                        app.entries.push(TranscriptEntry::Error {
                                            text: format!(
                                                "Failed to delete session '{}': {}",
                                                id, err.message
                                            ),
                                        });
                                    }
                                }
                                app.entries.push(TranscriptEntry::Separator);
                                app.close_picker();
                            }
                        }
                        KeyCode::Enter => {
                            if let Some((id, name)) = app.picker_selected() {
                                let kind = app.command_picker.as_ref().unwrap().kind;
                                app.close_picker();
                                match kind {
                                    CommandPickerKind::Provider => {
                                        if let Err(err) = app_service.switch_provider(&id) {
                                            app.entries
                                                .push(TranscriptEntry::Error { text: err.message });
                                        } else {
                                            app.settings = app::build_settings_state(
                                                app_service.stored_settings(),
                                            );
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("✓ Provider switched to {}", name),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                    }
                                    CommandPickerKind::Model => {
                                        if let Err(err) = app_service.switch_model(&id) {
                                            app.entries
                                                .push(TranscriptEntry::Error { text: err.message });
                                        } else {
                                            app.settings = app::build_settings_state(
                                                app_service.stored_settings(),
                                            );
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("✓ Model switched to {}", name),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                    }
                                    CommandPickerKind::Theme => {
                                        if let Some((family_str, variant_str)) = id.split_once(':')
                                        {
                                            if let Err(err) =
                                                app_service.switch_theme(family_str, variant_str)
                                            {
                                                app.entries.push(TranscriptEntry::Error {
                                                    text: err.message,
                                                });
                                            } else {
                                                ui::theme::set_current_theme(
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
                                    CommandPickerKind::Session => {
                                        // Save current session before switching
                                        app_service
                                            .auto_save_session(
                                                &app.entries,
                                                app.tokens_in,
                                                app.tokens_out,
                                                app.tokens_cache_read,
                                                app.tokens_cache_write,
                                                &app.current_mode,
                                            )
                                            .await;
                                        match app_service.load_session_by_name(&id).await {
                                            Ok(Some(saved)) => {
                                                app.entries = saved.entries;
                                                app.tokens_in = saved.tokens_in;
                                                app.tokens_out = saved.tokens_out;
                                                app.tokens_cache_read = saved.tokens_cache_read;
                                                app.tokens_cache_write = saved.tokens_cache_write;
                                                app.current_mode = saved.current_mode;
                                                app.scroll_offset = 0;
                                                app.auto_scroll = true;
                                                app.entries.push(TranscriptEntry::System {
                                                    text: format!(
                                                        "📂 Switched to session '{}'",
                                                        name
                                                    ),
                                                });
                                                app.entries.push(TranscriptEntry::Separator);
                                            }
                                            Ok(None) => {
                                                app.entries.push(TranscriptEntry::Error {
                                                    text: format!("Session '{}' not found", name),
                                                });
                                                app.entries.push(TranscriptEntry::Separator);
                                            }
                                            Err(err) => {
                                                app.entries.push(TranscriptEntry::Error {
                                                    text: format!(
                                                        "Failed to switch session: {}",
                                                        err.message
                                                    ),
                                                });
                                                app.entries.push(TranscriptEntry::Separator);
                                            }
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
                        LoginPhase::SelectProvider => match key.code {
                            KeyCode::Up => app.login_move_up(),
                            KeyCode::Down => app.login_move_down(),
                            KeyCode::Enter => {
                                let provider_id = app.login_selected_provider().unwrap_or_default();
                                if !provider_id.is_empty() {
                                    app.start_login_for_provider(&provider_id);
                                    app_service.start_oauth_login(&provider_id);
                                }
                            }
                            _ => {}
                        },
                        LoginPhase::InProgress => {}
                    }
                    continue;
                }

                // Settings overlay input handling.
                //
                // Two modes:
                //   picker open  → ↑↓ browse list, Enter selects and persists
                //   browsing     → ↑↓ move focus, Enter activates row, keys
                //                  edit the api-key buffer when focused on Auth
                //
                // Provider and model changes persist immediately via
                // app_service.switch_*. The API-key buffer is flushed to
                // storage on blur (focus change, panel close).
                if app.settings_open {
                    if app.settings.picker.is_some() {
                        match key.code {
                            KeyCode::Up => app.settings_picker_move(-1, app_service.stored_settings()),
                            KeyCode::Down => app.settings_picker_move(1, app_service.stored_settings()),
                            KeyCode::Enter | KeyCode::Right => {
                                if let Some((kind, id)) =
                                    app.settings_picker_selection(app_service.stored_settings())
                                {
                                    apply_settings_picker(&mut app, &mut app_service, kind, &id);
                                }
                                app.close_settings_picker();
                            }
                            KeyCode::Esc | KeyCode::Left => app.close_settings_picker(),
                            _ => {}
                        }
                        continue;
                    }

                    let is_auth_editable = !is_oauth_provider(
                        app_service.stored_settings().provider.as_deref().unwrap_or(""),
                    );
                    let focus = app.settings.focus;

                    match key.code {
                        KeyCode::Up => {
                            flush_settings_key(&mut app, &mut app_service);
                            app.move_focus_up(app_service.stored_settings());
                        }
                        KeyCode::Down | KeyCode::Tab => {
                            flush_settings_key(&mut app, &mut app_service);
                            app.move_focus_down(app_service.stored_settings());
                        }
                        KeyCode::Enter => match focus {
                            SettingsFocus::Provider | SettingsFocus::Model => {
                                app.open_settings_picker(app_service.stored_settings());
                            }
                            SettingsFocus::Auth => {
                                if is_auth_editable {
                                    // Enter on the key field commits the buffer
                                    // and advances focus back to the top.
                                    flush_settings_key(&mut app, &mut app_service);
                                } else {
                                    // OAuth provider: launch the login flow.
                                    let provider_id = app_service
                                        .stored_settings()
                                        .provider
                                        .clone()
                                        .unwrap_or_default();
                                    if !provider_id.is_empty() {
                                        app.settings_open = false;
                                        app.open_login_selector();
                                        app.start_login_for_provider(&provider_id);
                                        app_service.start_oauth_login(&provider_id);
                                    }
                                }
                            }
                        },
                        KeyCode::Left if focus == SettingsFocus::Auth && is_auth_editable => {
                            if app.settings.api_key_cursor > 0 {
                                app.settings.api_key_cursor -= 1;
                            }
                        }
                        KeyCode::Right if focus == SettingsFocus::Auth && is_auth_editable => {
                            if app.settings.api_key_cursor
                                < app.settings.api_key_buffer.chars().count()
                            {
                                app.settings.api_key_cursor += 1;
                            }
                        }
                        KeyCode::Home if focus == SettingsFocus::Auth && is_auth_editable => {
                            app.settings.api_key_cursor = 0;
                        }
                        KeyCode::End if focus == SettingsFocus::Auth && is_auth_editable => {
                            app.settings.api_key_cursor =
                                app.settings.api_key_buffer.chars().count();
                        }
                        KeyCode::Backspace
                            if focus == SettingsFocus::Auth && is_auth_editable =>
                        {
                            if app.settings.api_key_cursor > 0 {
                                app.settings.api_key_cursor = ui::helpers::remove_char_before(
                                    &mut app.settings.api_key_buffer,
                                    app.settings.api_key_cursor,
                                );
                            }
                        }
                        KeyCode::Delete
                            if focus == SettingsFocus::Auth && is_auth_editable =>
                        {
                            ui::helpers::remove_char_at(
                                &mut app.settings.api_key_buffer,
                                app.settings.api_key_cursor,
                            );
                        }
                        KeyCode::Char(ch)
                            if focus == SettingsFocus::Auth
                                && is_auth_editable
                                && !key.modifiers.contains(KeyModifiers::CONTROL)
                                && !key.modifiers.contains(KeyModifiers::ALT) =>
                        {
                            ui::helpers::insert_char(
                                &mut app.settings.api_key_buffer,
                                app.settings.api_key_cursor,
                                ch,
                            );
                            app.settings.api_key_cursor += 1;
                        }
                        _ => {}
                    }
                    continue;
                }

                // Main input handling
                match key.code {
                    KeyCode::Tab => {
                        if app.slash_preview_visible() && !app.filtered_commands().is_empty() {
                            let _ = app.preview_accept();
                        } else {
                            app.cycle_mode();
                        }
                    }
                    KeyCode::Up
                        if app.slash_preview_visible() && !app.filtered_commands().is_empty() =>
                    {
                        app.preview_move_up();
                    }
                    KeyCode::Down
                        if app.slash_preview_visible() && !app.filtered_commands().is_empty() =>
                    {
                        app.preview_move_down();
                    }
                    KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.clear(&config, app_service.stored_settings());
                    }
                    KeyCode::Char('o') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.toggle_tool_collapse();
                    }
                    KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.input.clear();
                        app.cursor = 0;
                    }
                    // Ctrl+J / Ctrl+M are reliable newlines even on terminals that
                    // don't distinguish Shift+Enter from Enter.
                    KeyCode::Char('j' | 'm')
                        if key.modifiers.contains(KeyModifiers::CONTROL) =>
                    {
                        ui::helpers::insert_char(&mut app.input, app.cursor, '\n');
                        app.cursor += 1;
                    }
                    // Ctrl+Shift+V: paste image from clipboard.
                    KeyCode::Char('V')
                        if key.modifiers.contains(KeyModifiers::CONTROL)
                            && key.modifiers.contains(KeyModifiers::SHIFT) =>
                    {
                        let eff = services::settings_service::effective_settings(
                            &config,
                            app_service.stored_settings(),
                        );
                        let provider = eff.provider.as_deref().unwrap_or("");
                        let model = eff.model_id.as_deref().unwrap_or("");
                        let supports =
                            services::catalog_service::model_supports_images(provider, model);
                        if !supports {
                            app.entries.push(TranscriptEntry::System {
                                text: format!(
                                    "⚠ {}/{} does not support image inputs. Switch models to use images.",
                                    provider, model
                                ),
                            });
                            app.entries.push(TranscriptEntry::Separator);
                            continue;
                        }
                        if let Some(path) = ui::paste::paste_clipboard_image_to_temp() {
                            let placeholder = format!("[Image: {}]", path);
                            let byte_idx =
                                ui::helpers::char_idx_to_byte_idx(&app.input, app.cursor);
                            app.input.insert_str(byte_idx, &placeholder);
                            app.cursor += placeholder.chars().count();
                        }
                    }
                    KeyCode::PageUp => {
                        let max_scroll = app
                            .content_lines
                            .get()
                            .saturating_sub(app.visible_height.get());
                        if app.auto_scroll {
                            app.scroll_offset = max_scroll;
                        }
                        app.auto_scroll = false;
                        let page = app.visible_height.get().saturating_sub(2).max(5);
                        app.scroll_offset = app.scroll_offset.saturating_sub(page);
                    }
                    KeyCode::PageDown => {
                        let max_scroll = app
                            .content_lines
                            .get()
                            .saturating_sub(app.visible_height.get());
                        if app.auto_scroll {
                            app.scroll_offset = max_scroll;
                        }
                        let page = app.visible_height.get().saturating_sub(2).max(5);
                        app.scroll_offset = app.scroll_offset.saturating_add(page);
                        if app.scroll_offset >= max_scroll {
                            app.auto_scroll = true;
                        }
                    }
                    KeyCode::Up => {
                        if app.input.is_empty() || !app.input_focused {
                            let max_scroll = app
                                .content_lines
                                .get()
                                .saturating_sub(app.visible_height.get());
                            if app.auto_scroll {
                                app.scroll_offset = max_scroll;
                            }
                            app.auto_scroll = false;
                            app.scroll_offset = app.scroll_offset.saturating_sub(1);
                        } else if !app.input.starts_with('/') {
                            app.history_prev();
                        } else if app.cursor > 0 {
                            app.cursor = app.cursor.saturating_sub(1);
                        }
                    }
                    KeyCode::Down => {
                        if app.input.is_empty() || !app.input_focused {
                            let max_scroll = app
                                .content_lines
                                .get()
                                .saturating_sub(app.visible_height.get());
                            if app.auto_scroll {
                                app.scroll_offset = max_scroll;
                            }
                            app.scroll_offset = app.scroll_offset.saturating_add(1);
                            if app.scroll_offset >= max_scroll {
                                app.auto_scroll = true;
                            }
                        } else if !app.input.starts_with('/') {
                            app.history_next();
                        } else if app.cursor < app.input.chars().count() {
                            app.cursor += 1;
                        }
                    }
                    KeyCode::Home => {
                        if app.input_focused && !app.input.is_empty() {
                            // Move cursor to beginning of current line in input.
                            let bol = app.input[..ui::helpers::char_idx_to_byte_idx(&app.input, app.cursor)]
                                .rfind('\n')
                                .map(|i| i + 1)
                                .unwrap_or(0);
                            app.cursor = app.input[..bol].chars().count();
                        } else {
                            app.auto_scroll = false;
                            app.scroll_offset = 0;
                        }
                    }
                    KeyCode::End => {
                        if app.input_focused && !app.input.is_empty() {
                            // Move cursor to end of current line in input.
                            let byte_cur = ui::helpers::char_idx_to_byte_idx(&app.input, app.cursor);
                            let eol = app.input[byte_cur..]
                                .find('\n')
                                .map(|i| byte_cur + i)
                                .unwrap_or(app.input.len());
                            app.cursor = app.input[..eol].chars().count();
                        } else {
                            app.auto_scroll = true;
                        }
                    }
                    KeyCode::Enter => {
                        // Shift+Enter inserts a newline.  Bare Enter submits.
                        // Some terminals don't report Shift on Enter, so we also
                        // support Ctrl+J (and Ctrl+M) as reliable newline.
                        if key.modifiers.contains(KeyModifiers::SHIFT) {
                            ui::helpers::insert_char(&mut app.input, app.cursor, '\n');
                            app.cursor += 1;
                        } else if app.has_pending_question() {
                            let answer = app.input.trim().to_string();
                            if answer.is_empty() {
                                continue;
                            }
                            app.submit_question_answer();
                            continue;
                        } else {
                            if app.slash_preview_visible() {
                                let cmds = app.filtered_commands();
                                if !cmds.is_empty() {
                                    if let Some(cmd_name) = app.preview_accept() {
                                        app.input = cmd_name.clone();
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

                            // Check for slash commands
                            match app_service.execute_slash_command(&prompt) {
                                CommandResult::Reset => {
                                    app_service.reset_session().await;
                                    app.clear(&config, app_service.stored_settings());
                                    app.entries.push(TranscriptEntry::System {
                                        text: "↻ Session reset".into(),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::NewSession => {
                                    app_service
                                        .auto_save_session(
                                            &app.entries,
                                            app.tokens_in,
                                            app.tokens_out,
                                            app.tokens_cache_read,
                                            app.tokens_cache_write,
                                            &app.current_mode,
                                        )
                                        .await;
                                    app_service.new_session().await;
                                    app.clear(&config, app_service.stored_settings());
                                    app.entries.push(TranscriptEntry::System {
                                        text: "new session started".into(),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::OpenSettings => {
                                    app.settings = app::build_settings_state(
                                        app_service.stored_settings(),
                                    );
                                    app.settings_open = true;
                                    continue;
                                }
                                CommandResult::OpenProviderPicker => {
                                    app.set_command_picker(app_service.build_provider_picker());
                                    continue;
                                }
                                CommandResult::OpenModelPicker => {
                                    app.set_command_picker(app_service.build_model_picker());
                                    continue;
                                }
                                CommandResult::OpenThemePicker => {
                                    app.set_command_picker(app_service.build_theme_picker());
                                    continue;
                                }
                                CommandResult::OpenLoginSelector { preselect_provider } => {
                                    app.open_login_selector();
                                    if let Some(provider_id) = preselect_provider {
                                        if let Some(ref mut login) = app.login_state {
                                            if let Some(idx) = login
                                                .providers
                                                .iter()
                                                .position(|p| p.id == provider_id)
                                            {
                                                login.selected_index = idx;
                                            }
                                        }
                                        let provider_id_clone =
                                            app.login_selected_provider().unwrap_or_default();
                                        if !provider_id_clone.is_empty() {
                                            app.start_login_for_provider(&provider_id_clone);
                                            app_service.start_oauth_login(&provider_id_clone);
                                        }
                                    }
                                    continue;
                                }
                                CommandResult::ShowHelp(lines) => {
                                    for line in lines {
                                        app.entries.push(TranscriptEntry::System { text: line });
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowProviders(lines) => {
                                    for line in lines {
                                        app.entries.push(TranscriptEntry::System { text: line });
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowSystemMessage(msg) => {
                                    app.entries.push(TranscriptEntry::System { text: msg });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowSessions(lines) => {
                                    for line in lines {
                                        app.entries.push(TranscriptEntry::System { text: line });
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::OpenSessionPicker => {
                                    app.set_command_picker(app_service.build_session_picker());
                                    continue;
                                }
                                CommandResult::SaveSession { name } => {
                                    let existed =
                                        app_service.session_exists(&name).unwrap_or(false);
                                    match app_service
                                        .save_session_as(
                                            &name,
                                            &app.entries,
                                            app.tokens_in,
                                            app.tokens_out,
                                            app.tokens_cache_read,
                                            app.tokens_cache_write,
                                            &app.current_mode,
                                        )
                                        .await
                                    {
                                        Ok(()) => {
                                            let msg = if existed {
                                                format!("saved session '{}' (overwritten)", name)
                                            } else {
                                                format!("saved session '{}'", name)
                                            };
                                            app.entries.push(TranscriptEntry::System { text: msg });
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!(
                                                    "Failed to save session '{}': {}",
                                                    name, err.message
                                                ),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::DeleteSession { name } => {
                                    match app_service.delete_session(&name).await {
                                        Ok(()) => {
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("deleted session '{}'", name),
                                            });
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!(
                                                    "Failed to delete session '{}': {}",
                                                    name, err.message
                                                ),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::RenameSession { old_name, new_name } => {
                                    match app_service.rename_session(&old_name, &new_name).await {
                                        Ok(()) => {
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!(
                                                    "renamed session '{}' → '{}'",
                                                    old_name, new_name
                                                ),
                                            });
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!(
                                                    "Failed to rename session '{}': {}",
                                                    old_name, err.message
                                                ),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::SwitchSession { name } => {
                                    app_service
                                        .auto_save_session(
                                            &app.entries,
                                            app.tokens_in,
                                            app.tokens_out,
                                            app.tokens_cache_read,
                                            app.tokens_cache_write,
                                            &app.current_mode,
                                        )
                                        .await;
                                    match app_service.load_session_by_name(&name).await {
                                        Ok(Some(saved)) => {
                                            app.entries = saved.entries;
                                            app.tokens_in = saved.tokens_in;
                                            app.tokens_out = saved.tokens_out;
                                            app.tokens_cache_read = saved.tokens_cache_read;
                                            app.tokens_cache_write = saved.tokens_cache_write;
                                            app.current_mode = saved.current_mode;
                                            app.scroll_offset = 0;
                                            app.auto_scroll = true;
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("📂 Switched to session '{}'", name),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                        Ok(None) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!("Session '{}' not found", name),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!(
                                                    "Failed to switch session: {}",
                                                    err.message
                                                ),
                                            });
                                            app.entries.push(TranscriptEntry::Separator);
                                        }
                                    }
                                    continue;
                                }
                                CommandResult::CopyLastResponse => {
                                    match crate::services::export_service::copy_last_assistant_response(&app.entries) {
                                        Ok(_) => {
                                            app.entries.push(TranscriptEntry::System {
                                                text: "copied last response to clipboard".into(),
                                            });
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!("Failed to copy: {}", err.message),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ExportSession { path } => {
                                    match crate::services::export_service::export_to_markdown(
                                        &app.entries,
                                        app_service.current_session_name(),
                                        path.as_deref(),
                                    ) {
                                        Ok(file_path) => {
                                            app.entries.push(TranscriptEntry::System {
                                                text: format!("📤 Exported to {}", file_path),
                                            });
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!("Failed to export: {}", err.message),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::SetSystemPrompt { prompt } => {
                                    app_service.set_system_prompt(&prompt);
                                    app.entries.push(TranscriptEntry::System {
                                        text: format!("📝 System prompt updated: {}", prompt),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowVersion => {
                                    app.entries.push(TranscriptEntry::System {
                                        text: format!("khadim-cli {}", env!("CARGO_PKG_VERSION")),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowHistory(lines) => {
                                    for line in lines {
                                        app.entries.push(TranscriptEntry::System { text: line });
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowTokens => {
                                    let mut lines = vec!["── Token Usage ──".to_string()];
                                    lines.push(format!(
                                        "  Input:        {}",
                                        app_service.format_tokens(app.tokens_in)
                                    ));
                                    lines.push(format!(
                                        "  Output:       {}",
                                        app_service.format_tokens(app.tokens_out)
                                    ));
                                    lines.push(format!(
                                        "  Cache Read:   {}",
                                        app_service.format_tokens(app.tokens_cache_read)
                                    ));
                                    lines.push(format!(
                                        "  Cache Write:  {}",
                                        app_service.format_tokens(app.tokens_cache_write)
                                    ));
                                    let cost = app_service.estimate_cost(
                                        app_service
                                            .effective_settings()
                                            .provider
                                            .as_deref()
                                            .unwrap_or(""),
                                        app_service
                                            .effective_settings()
                                            .model_id
                                            .as_deref()
                                            .unwrap_or(""),
                                        app.tokens_in,
                                        app.tokens_out,
                                        app.tokens_cache_read,
                                        app.tokens_cache_write,
                                    );
                                    lines.push(format!(
                                        "  Cost:         {}",
                                        app_service.format_cost(cost)
                                    ));
                                    for line in lines {
                                        app.entries.push(TranscriptEntry::System { text: line });
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ShowConfig(path) => {
                                    app.entries.push(TranscriptEntry::System {
                                        text: format!("config  {}", path),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::ClearHistory => {
                                    let path = crate::services::history_service::history_path();
                                    match path {
                                        Ok(p) => {
                                            if let Err(err) = std::fs::remove_file(&p) {
                                                app.entries.push(TranscriptEntry::Error {
                                                    text: format!(
                                                        "Failed to clear history: {}",
                                                        err
                                                    ),
                                                });
                                            } else {
                                                app.history.clear();
                                                app.entries.push(TranscriptEntry::System {
                                                    text: "🧹 Input history cleared".into(),
                                                });
                                            }
                                        }
                                        Err(err) => {
                                            app.entries.push(TranscriptEntry::Error {
                                                text: format!(
                                                    "Failed to locate history: {}",
                                                    err.message
                                                ),
                                            });
                                        }
                                    }
                                    app.entries.push(TranscriptEntry::Separator);
                                    continue;
                                }
                                CommandResult::RefreshModels => {
                                    app.entries.push(TranscriptEntry::System {
                                        text: "refreshing model lists…".into(),
                                    });
                                    app.entries.push(TranscriptEntry::Separator);
                                    tokio::spawn(async move {
                                        let _ = khadim_ai_core::models::refresh_openrouter_models(None).await;
                                        let _ = khadim_ai_core::models::refresh_nvidia_models(None).await;
                                    });
                                    continue;
                                }
                                CommandResult::None => {
                                    // Not a command — submit as prompt
                                    app.submit_user_prompt(&prompt);
                                    // Drain any buffered events from a previous
                                    // (aborted) run so they don't interfere with
                                    // the new run's state.
                                    while worker_rx.try_recv().is_ok() {}
                                    let mode = if app.current_mode == "auto" {
                                        None
                                    } else {
                                        Some(app.current_mode.clone())
                                    };
                                    app_service.spawn_agent_run(prompt, mode);
                                }
                            }
                        }
                    }
                    KeyCode::Backspace
                        if key.modifiers.contains(KeyModifiers::ALT)
                            || key.modifiers == (KeyModifiers::CONTROL | KeyModifiers::ALT) =>
                    {
                        app.delete_word_before();
                    }
                    KeyCode::Backspace => {
                        app.cursor = ui::helpers::remove_char_before(&mut app.input, app.cursor);
                        app.command_preview_index = 0;
                    }
                    KeyCode::Delete
                        if key.modifiers.contains(KeyModifiers::ALT)
                            || key.modifiers == (KeyModifiers::CONTROL | KeyModifiers::ALT) =>
                    {
                        app.delete_word_after();
                    }
                    KeyCode::Delete => {
                        ui::helpers::remove_char_at(&mut app.input, app.cursor);
                        app.command_preview_index = 0;
                    }
                    KeyCode::Left => {
                        if key.modifiers.contains(KeyModifiers::CONTROL)
                            || key.modifiers.contains(KeyModifiers::ALT)
                        {
                            app.move_word_left();
                        } else if app.cursor > 0 {
                            app.cursor -= 1;
                        }
                    }
                    KeyCode::Right => {
                        if key.modifiers.contains(KeyModifiers::CONTROL)
                            || key.modifiers.contains(KeyModifiers::ALT)
                        {
                            app.move_word_right();
                        } else if app.cursor < app.input.chars().count() {
                            app.cursor += 1;
                        }
                    }
                    KeyCode::Char('a') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.move_to_beginning();
                    }
                    KeyCode::Char('e') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.move_to_end();
                    }
                    KeyCode::Char('w') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.delete_word_before();
                    }
                    KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.kill_to_beginning_of_line();
                    }
                    KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.kill_to_end_of_line();
                    }
                    KeyCode::Char('y') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.yank();
                    }
                    KeyCode::Char(ch)
                        if !key.modifiers.contains(KeyModifiers::CONTROL)
                            && !key.modifiers.contains(KeyModifiers::ALT) =>
                    {
                        ui::helpers::insert_char(&mut app.input, app.cursor, ch);
                        app.cursor += 1;
                        app.command_preview_index = 0;
                    }
                    _ => {}
                }
            }

            Event::Paste(text) => {
                // Smart paste: detect image/file paths and inline them.
                if let Some(replacement) = ui::paste::process_paste(&text) {
                    let byte_idx = ui::helpers::char_idx_to_byte_idx(&app.input, app.cursor);
                    app.input.insert_str(byte_idx, &replacement);
                    app.cursor += replacement.chars().count();
                } else {
                    // Bracketed-paste support: insert the whole chunk at once.
                    let byte_idx = ui::helpers::char_idx_to_byte_idx(&app.input, app.cursor);
                    app.input.insert_str(byte_idx, &text);
                    app.cursor += text.chars().count();
                }
                app.command_preview_index = 0;
            }

            Event::Resize(width, height) => {
                app.on_resize(width, height);
            }

            Event::Mouse(mouse) => match mouse.kind {
                MouseEventKind::ScrollUp => {
                    let max_scroll = app
                        .content_lines
                        .get()
                        .saturating_sub(app.visible_height.get());
                    if app.auto_scroll {
                        app.scroll_offset = max_scroll;
                    }
                    app.auto_scroll = false;
                    app.scroll_offset = app.scroll_offset.saturating_sub(5);
                }
                MouseEventKind::ScrollDown => {
                    let max_scroll = app
                        .content_lines
                        .get()
                        .saturating_sub(app.visible_height.get());
                    if app.auto_scroll {
                        app.scroll_offset = max_scroll;
                    }
                    app.scroll_offset = app.scroll_offset.saturating_add(5);
                    if app.scroll_offset >= max_scroll {
                        app.auto_scroll = true;
                    }
                }
                _ => {}
            },

            _ => {}
        }
    }

    app_service.abort_run();

    Ok(())
}
