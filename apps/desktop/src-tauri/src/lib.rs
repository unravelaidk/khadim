#![allow(dead_code)]

mod agent_runner;
mod claude_code;
mod commands;
mod db;
mod error;
mod file_index;
mod git;
mod github;
mod health;
mod khadim_agent;
mod khadim_ai;
mod khadim_code;
mod lsp;
mod opencode;
mod plugins;
mod process;
mod run_lifecycle;
mod skills;
mod syntax;
mod terminal;
mod workspace_context;

use claude_code::ClaudeCodeManager;
use db::Database;
use file_index::FileIndexManager;
use khadim_agent::KhadimManager;
use lsp::LspManager;
use opencode::OpenCodeManager;
use plugins::PluginManager;
use process::ProcessRunner;
use skills::SkillManager;
use std::sync::Arc;
use tauri::Manager;
use terminal::TerminalManager;

pub struct AppState {
    db: Arc<Database>,
    process_runner: ProcessRunner,
    opencode: OpenCodeManager,
    khadim: Arc<KhadimManager>,
    claude_code: Arc<ClaudeCodeManager>,
    github: github::GitHubClient,
    plugins: Arc<PluginManager>,
    skills: Arc<SkillManager>,
    terminals: Arc<TerminalManager>,
    file_index: Arc<FileIndexManager>,
    lsp: Arc<LspManager>,
}

fn build_app_state() -> Arc<AppState> {
    let db = Arc::new(Database::open().expect("Failed to open database"));
    let plugin_manager = Arc::new(PluginManager::new(Arc::clone(&db)));

    let startup_plugins = plugin_manager.discover_and_load(&std::env::temp_dir());
    if !startup_plugins.is_empty() {
        log::info!(
            "Discovered {} plugin(s): {}",
            startup_plugins.len(),
            startup_plugins
                .iter()
                .map(|p| format!("{}@{}", p.name, p.version))
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    let skill_manager = Arc::new(SkillManager::new(Arc::clone(&db)));
    {
        let discovered = skill_manager.discover();
        let enabled_count = discovered.iter().filter(|s| s.enabled).count();
        log::info!(
            "Discovered {} skill(s) ({} enabled)",
            discovered.len(),
            enabled_count,
        );
    }

    Arc::new(AppState {
        db,
        process_runner: ProcessRunner::new(),
        opencode: OpenCodeManager::new(),
        khadim: Arc::new(KhadimManager::new()),
        claude_code: Arc::new(ClaudeCodeManager::new()),
        github: github::GitHubClient::new(),
        plugins: plugin_manager,
        skills: skill_manager,
        terminals: Arc::new(TerminalManager::new()),
        file_index: Arc::new(FileIndexManager::new()),
        lsp: Arc::new(LspManager::new()),
    })
}

fn register_plugin_uri_scheme(
    app_state: Arc<AppState>,
) -> impl Fn(tauri::UriSchemeContext<'_, tauri::Wry>, tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>>
       + Send
       + Sync
       + 'static {
    move |_context, request| {
        let uri = request.uri();
        let raw_path = uri.path().trim_start_matches('/');
        let authority = uri.host().unwrap_or("");
        let (plugin_id, file_rel) = if !authority.is_empty() && authority != "localhost" {
            (authority, raw_path)
        } else {
            let mut parts = raw_path.splitn(2, '/');
            let id = parts.next().unwrap_or("");
            let rel = parts.next().unwrap_or("");
            (id, rel)
        };

        let plugin_dir = app_state.plugins.plugins_dir().join(plugin_id);
        let file_path = plugin_dir.join(file_rel);

        if !file_path.starts_with(&plugin_dir) {
            return tauri::http::Response::builder()
                .status(403)
                .body(b"Forbidden".to_vec())
                .unwrap();
        }

        match std::fs::read(&file_path) {
            Ok(bytes) => {
                let content_type = if file_rel.ends_with(".js") || file_rel.ends_with(".mjs") {
                    "application/javascript"
                } else if file_rel.ends_with(".css") {
                    "text/css"
                } else if file_rel.ends_with(".html") {
                    "text/html"
                } else {
                    "application/octet-stream"
                };

                tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", content_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap()
            }
            Err(_) => tauri::http::Response::builder()
                .status(404)
                .body(format!("Plugin file not found: {file_rel}").into_bytes())
                .unwrap(),
        }
    }
}

pub fn run() {
    env_logger::init();

    let app_state = build_app_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .register_uri_scheme_protocol("khadim-plugin", register_plugin_uri_scheme(app_state.clone()))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime::desktop_runtime_summary,
            commands::workspace::list_workspaces,
            commands::workspace::get_workspace,
            commands::workspace::create_workspace,
            commands::workspace::set_workspace_branch,
            commands::workspace::delete_workspace,
            commands::workspace::workspace_context_get,
            commands::rpa::list_managed_agents,
            commands::rpa::create_managed_agent,
            commands::rpa::update_managed_agent,
            commands::rpa::delete_managed_agent,
            commands::rpa::list_environments,
            commands::rpa::create_environment,
            commands::rpa::update_environment,
            commands::rpa::delete_environment,
            commands::rpa::list_credentials,
            commands::rpa::create_credential,
            commands::rpa::update_credential,
            commands::rpa::delete_credential,
            commands::rpa::list_memory_stores,
            commands::rpa::list_agent_memory_stores,
            commands::rpa::ensure_agent_memory_store,
            commands::rpa::get_or_create_chat_memory_store,
            commands::rpa::create_memory_store,
            commands::rpa::update_memory_store,
            commands::rpa::delete_memory_store,
            commands::rpa::link_memory_store_to_agent,
            commands::rpa::unlink_memory_store_from_agent,
            commands::rpa::set_agent_primary_memory_store,
            commands::rpa::list_memory_entries,
            commands::rpa::create_memory_entry,
            commands::rpa::update_memory_entry,
            commands::rpa::delete_memory_entry,
            commands::rpa::list_agent_runs,
            commands::rpa::list_agent_run_turns,
            commands::rpa::run_managed_agent,
            commands::rpa::stop_agent_run,
            commands::rpa::check_docker_available,
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_list,
            commands::file_index::file_index_build,
            commands::file_index::file_search,
            commands::file_index::file_read_preview,
            commands::file_index::file_index_status,
            commands::lsp::lsp_hover,
            commands::lsp::lsp_definition,
            commands::lsp::lsp_document_symbols,
            commands::lsp::lsp_workspace_symbols,
            commands::lsp::lsp_list_servers,
            commands::lsp::lsp_stop,
            commands::syntax::syntax_highlight,
            commands::git::git_repo_info,
            commands::git::git_list_branches,
            commands::git::git_list_worktrees,
            commands::git::git_create_worktree,
            commands::git::git_remove_worktree,
            commands::git::git_status,
            commands::git::git_diff_stat,
            commands::git::git_diff_files,
            commands::conversation::list_conversations,
            commands::conversation::get_conversation,
            commands::conversation::create_conversation,
            commands::conversation::set_conversation_backend_session,
            commands::conversation::delete_conversation,
            commands::conversation::list_messages,
            commands::opencode::opencode_start,
            commands::opencode::opencode_stop,
            commands::opencode::opencode_create_session,
            commands::opencode::opencode_list_sessions,
            commands::opencode::opencode_list_models,
            commands::opencode::opencode_send_message,
            commands::opencode::opencode_send_message_async,
            commands::opencode::opencode_send_streaming,
            commands::opencode::opencode_abort,
            commands::opencode::opencode_list_messages,
            commands::opencode::opencode_get_diff,
            commands::opencode::opencode_session_statuses,
            commands::opencode::opencode_get_connection,
            commands::opencode::opencode_reply_question,
            commands::opencode::opencode_reject_question,
            commands::claude_code::claude_code_create_session,
            commands::claude_code::claude_code_list_models,
            commands::claude_code::claude_code_send_streaming,
            commands::claude_code::claude_code_abort,
            commands::claude_code::claude_code_respond_permission,
            commands::khadim::khadim_create_session,
            commands::khadim::khadim_list_models,
            commands::khadim::khadim_list_model_configs,
            commands::khadim::khadim_list_providers,
            commands::khadim::khadim_list_provider_statuses,
            commands::khadim::khadim_save_provider_api_key,
            commands::khadim::khadim_get_provider_api_key_masked,
            commands::khadim::khadim_get_provider_api_key,
            commands::khadim::khadim_delete_provider_api_key,
            commands::khadim::khadim_bulk_create_provider_models,
            commands::khadim::khadim_remove_provider_models,
            commands::khadim::khadim_discover_models,
            commands::khadim::khadim_create_model_config,
            commands::khadim::khadim_update_model_config,
            commands::khadim::khadim_delete_model_config,
            commands::khadim::khadim_set_active_model_config,
            commands::khadim::khadim_set_default_model_config,
            commands::khadim::khadim_active_model,
            commands::khadim::khadim_codex_auth_connected,
            commands::khadim::khadim_codex_auth_start,
            commands::khadim::khadim_codex_auth_status,
            commands::khadim::khadim_codex_auth_complete,
            commands::khadim::khadim_send_streaming,
            commands::khadim::khadim_send_message,
            commands::khadim::khadim_abort,
            commands::khadim::khadim_answer_question,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::process::list_processes,
            commands::plugins::plugin_list,
            commands::plugins::plugin_get,
            commands::plugins::plugin_enable,
            commands::plugins::plugin_disable,
            commands::plugins::plugin_install,
            commands::plugins::plugin_uninstall,
            commands::plugins::plugin_list_tools,
            commands::plugins::plugin_set_config,
            commands::plugins::plugin_get_config,
            commands::plugins::plugin_discover,
            commands::plugins::plugin_dir,
            commands::plugins::plugin_store_get,
            commands::plugins::plugin_store_set,
            commands::skills::skill_discover,
            commands::skills::skill_toggle,
            commands::skills::skill_list_dirs,
            commands::skills::skill_add_dir,
            commands::skills::skill_remove_dir,
            commands::editor::detect_editors,
            commands::editor::open_in_editor,
            commands::editor::open_project_in_editor,
            github::github_auth_status,
            github::github_auth_login,
            github::github_auth_logout,
            github::github_repo_slug,
            github::github_issue_list,
            github::github_issue_get,
            github::github_issue_create,
            github::github_issue_edit,
            github::github_issue_close,
            github::github_issue_reopen,
            github::github_issue_comment,
            github::github_issue_comments,
            github::github_label_list,
            github::github_pr_list,
            github::github_pr_get,
            github::github_pr_create,
            github::github_pr_edit,
            github::github_pr_close,
            github::github_pr_comment,
            github::github_pr_comments,
            github::github_pr_merge,
            github::github_pr_diff,
            github::github_pr_checks,
            github::github_pr_review,
            github::github_gh_cli_info,
            github::github_gh_setup_git,
            github::github_create_and_push,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _state = window.state::<Arc<AppState>>();
                log::info!("Window destroyed, cleaning up processes");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
