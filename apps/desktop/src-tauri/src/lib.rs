#![allow(dead_code)]

mod claude_code;
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
mod skills;
mod syntax;
mod terminal;
mod workspace_context;

use claude_code::{ClaudeCodeManager, ClaudeCodeSessionCreated};
use db::{ChatMessage, Conversation, Database, Workspace};
use error::AppError;
use khadim_agent::KhadimManager;
use khadim_ai::model_settings::{BulkModelEntry, DiscoveredProviderModel, ModelConfig, ModelConfigInput, ProviderOption, ProviderStatus};
use khadim_ai::models::CatalogModelOption;
use khadim_ai::oauth::{CodexLoginStatusResponse, CodexSessionInfo};
use khadim_ai::types::ModelSelection;
use opencode::{AgentStreamEvent, OpenCodeManager, OpenCodeModelRef};
use plugins::{PluginEntry, PluginManager, PluginToolInfo};
use process::{ProcessOutput, ProcessRunner};
use skills::{SkillEntry, SkillManager};
use file_index::FileIndexManager;
use lsp::LspManager;
use terminal::{TerminalManager, TerminalSession};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

fn extract_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(items) => items
            .iter()
            .map(extract_text)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(map) => {
            for key in ["content", "text", "message", "output"] {
                if let Some(value) = map.get(key) {
                    let text = extract_text(value);
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

fn extract_message_parts_text(parts: &[serde_json::Value]) -> String {
    parts.iter()
        .filter_map(|part| {
            let part_type = part.get("type").and_then(|value| value.as_str())?;
            match part_type {
                "text" | "reasoning" => part.get("text").and_then(|value| value.as_str()),
                "tool" => part
                    .get("state")
                    .and_then(|value| value.get("output"))
                    .and_then(|value| value.as_str()),
                _ => None,
            }
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn extract_assistant_message(
    payload: &serde_json::Value,
    preferred_message_id: Option<&str>,
) -> Option<(String, Option<String>)> {
    let messages = payload
        .as_array()
        .or_else(|| payload.get("messages").and_then(|value| value.as_array()))?;

    let message = if let Some(preferred_message_id) = preferred_message_id {
        messages.iter().find(|message| {
            message
                .get("info")
                .and_then(|value| value.get("id"))
                .and_then(|value| value.as_str())
                == Some(preferred_message_id)
                && message
                    .get("info")
                    .and_then(|value| value.get("role"))
                    .and_then(|value| value.as_str())
                    == Some("assistant")
        })?
    } else {
        let message = messages.last()?;
        let role = message
            .get("info")
            .and_then(|value| value.get("role"))
            .and_then(|value| value.as_str())?;
        if role != "assistant" {
            return None;
        }
        message
    };

    let parts = message
        .get("parts")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let content_from_parts = extract_message_parts_text(&parts);
    let content = if !content_from_parts.trim().is_empty() {
        content_from_parts
    } else {
        message
            .get("info")
            .map(extract_text)
            .filter(|value| !value.trim().is_empty())?
    };

    Some((
        content,
        serde_json::to_string(message).ok().filter(|value| !value.is_empty()),
    ))
}

/// Mask an API key, showing only the first 4 and last 4 characters.
fn mask_api_key(key: &str) -> String {
    let len = key.len();
    if len <= 8 {
        "*".repeat(len)
    } else {
        format!(
            "{}{}{}",
            &key[..4],
            "*".repeat(len - 8),
            &key[len - 4..],
        )
    }
}

async fn fetch_assistant_message_with_retry(
    conn: &opencode::OpenCodeConnection,
    session_id: &str,
    preferred_message_id: Option<&str>,
) -> Option<(String, Option<String>)> {
    for attempt in 0..12 {
        let result = OpenCodeManager::list_messages(conn, session_id)
            .await
            .ok()
            .and_then(|payload| extract_assistant_message(&payload, preferred_message_id));

        if result.is_some() {
            return result;
        }

        if attempt < 11 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }

    None
}

async fn persist_streamed_assistant_message(
    state: &Arc<AppState>,
    conn: &opencode::OpenCodeConnection,
    session_id: &str,
    conversation_id: &str,
    streamed_content: &str,
    terminal_event: &AgentStreamEvent,
    assistant_message_id: Option<&str>,
) -> Result<(), AppError> {
    let remote_message = fetch_assistant_message_with_retry(conn, session_id, assistant_message_id).await;

    let (content, metadata) = match remote_message {
        Some((content, metadata)) => (content, metadata),
        None => {
            let fallback = streamed_content.trim();
            if fallback.is_empty() {
                return Ok(());
            }

            let metadata = (terminal_event.event_type == "error").then(|| {
                serde_json::json!({
                    "source": "stream_fallback",
                    "terminal_event": terminal_event.event_type,
                    "error": terminal_event.content,
                })
                .to_string()
            });

            (fallback.to_string(), metadata)
        }
    };

    let assistant_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "assistant".to_string(),
        content,
        metadata,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.db.insert_message(&assistant_msg)
}

// ── App State ────────────────────────────────────────────────────────

/// Shared state injected into all Tauri commands.
pub struct AppState {
    db: Database,
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

// ── Tauri commands ───────────────────────────────────────────────────
// Each command returns Result<T, AppError>. Tauri serializes
// AppError as JSON { kind, message } in the error channel.

// ─── Runtime ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct RuntimeSummary {
    platform: &'static str,
    runtime: &'static str,
    status: &'static str,
    opencode_available: bool,
}

#[tauri::command]
fn desktop_runtime_summary(state: State<'_, Arc<AppState>>) -> RuntimeSummary {
    RuntimeSummary {
        platform: std::env::consts::OS,
        runtime: "tauri",
        status: "native bridge ready",
        opencode_available: state.opencode.get_connection("_check").is_none()
            || true, // Just indicates the binary was found
    }
}

// ─── Workspaces ──────────────────────────────────────────────────────

#[tauri::command]
fn list_workspaces(state: State<'_, Arc<AppState>>) -> Result<Vec<Workspace>, AppError> {
    state.db.list_workspaces()
}

#[tauri::command]
fn get_workspace(state: State<'_, Arc<AppState>>, id: String) -> Result<Workspace, AppError> {
    state.db.get_workspace(&id)
}

#[derive(Deserialize)]
struct CreateWorkspaceInput {
    name: String,
    repo_path: String,
    branch: Option<String>,
    backend: Option<String>,
    execution_target: Option<String>,
}

#[tauri::command]
fn create_workspace(
    state: State<'_, Arc<AppState>>,
    input: CreateWorkspaceInput,
) -> Result<Workspace, AppError> {
    // Validate repo path
    if !git::is_git_repo(&input.repo_path) {
        return Err(AppError::invalid_input(format!(
            "{} is not a git repository",
            input.repo_path
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let backend = input.backend.unwrap_or_else(|| "opencode".to_string());
    let target = input.execution_target.unwrap_or_else(|| "local".to_string());
    let branch = input
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| git::repo_info(&input.repo_path).ok().and_then(|info| info.current_branch));

    let ws = Workspace {
        id: id.clone(),
        name: input.name,
        repo_path: input.repo_path,
        worktree_path: None,
        branch,
        backend,
        execution_target: target,
        sandbox_id: None,
        created_at: now.clone(),
        updated_at: now,
    };

    state.db.create_workspace(&ws)?;
    Ok(ws)
}

#[tauri::command]
fn delete_workspace(state: State<'_, Arc<AppState>>, id: String) -> Result<(), AppError> {
    // If there's a worktree, try to clean it up
    let ws = state.db.get_workspace(&id)?;
    if let Some(ref wt_path) = ws.worktree_path {
        let _ = git::remove_worktree(&ws.repo_path, wt_path, true);
    }
    state.db.delete_workspace(&id)
}

#[tauri::command]
fn set_workspace_branch(
    state: State<'_, Arc<AppState>>,
    id: String,
    branch: Option<String>,
) -> Result<(), AppError> {
    let normalized = branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    state.db.update_workspace_branch(&id, normalized)
}

// ─── Git ─────────────────────────────────────────────────────────────

#[tauri::command]
fn git_repo_info(path: String) -> Result<git::RepoInfo, AppError> {
    git::repo_info(&path)
}

#[tauri::command]
fn git_list_branches(repo_path: String) -> Result<Vec<git::BranchInfo>, AppError> {
    git::list_branches(&repo_path)
}

#[tauri::command]
fn git_list_worktrees(repo_path: String) -> Result<Vec<git::WorktreeInfo>, AppError> {
    git::list_worktrees(&repo_path)
}

#[tauri::command]
fn git_status(repo_path: String) -> Result<String, AppError> {
    git::status_summary(&repo_path)
}

#[tauri::command]
fn git_diff_stat(repo_path: String) -> Result<String, AppError> {
    git::diff_stat(&repo_path)
}

#[tauri::command]
fn git_diff_files(repo_path: String) -> Result<Vec<git::DiffFileEntry>, AppError> {
    git::diff_files(&repo_path)
}

#[tauri::command]
fn git_create_worktree(
    repo_path: String,
    worktree_path: Option<String>,
    branch: String,
    new_branch: bool,
    base_branch: Option<String>,
) -> Result<git::WorktreeInfo, AppError> {
    git::create_worktree(
        &repo_path,
        worktree_path.as_deref(),
        &branch,
        new_branch,
        base_branch.as_deref(),
    )
}

#[tauri::command]
fn git_remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), AppError> {
    git::remove_worktree(&repo_path, &worktree_path, force)
}

// ─── Workspace context ───────────────────────────────────────────────

// ─── Terminal dock ───────────────────────────────────────────────────

#[tauri::command]
fn terminal_create(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    conversation_id: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSession, AppError> {
    // Resolve cwd from the workspace context unless the caller forced one.
    let resolved_cwd = match cwd {
        Some(value) if std::path::Path::new(&value).is_dir() => value,
        _ => {
            let context = workspace_context::resolve(
                &state.db,
                &workspace_id,
                conversation_id.as_deref(),
            )?;
            context.cwd
        }
    };

    state.terminals.create(
        &app,
        workspace_id,
        conversation_id,
        resolved_cwd,
        cols,
        rows,
    )
}

#[tauri::command]
fn terminal_write(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    state.terminals.write(&session_id, &data)
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    state.terminals.resize(&session_id, cols, rows)
}

#[tauri::command]
fn terminal_close(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.terminals.close(&session_id)
}

#[tauri::command]
fn terminal_list(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
) -> Vec<TerminalSession> {
    match workspace_id {
        Some(id) => state.terminals.list_for_workspace(&id),
        None => state.terminals.list(),
    }
}

#[tauri::command]
fn workspace_context_get(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    conversation_id: Option<String>,
) -> Result<workspace_context::DesktopWorkspaceContext, AppError> {
    workspace_context::resolve(&state.db, &workspace_id, conversation_id.as_deref())
}

// ─── File Finder ─────────────────────────────────────────────────────

#[tauri::command]
fn file_index_build(
    state: State<'_, Arc<AppState>>,
    root: String,
) -> Result<file_index::FileIndexStatus, AppError> {
    state.file_index.build(&root)
}

#[tauri::command]
fn file_search(
    state: State<'_, Arc<AppState>>,
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<file_index::FileSearchResult>, AppError> {
    state.file_index.search(&root, &query, max_results)
}

#[tauri::command]
fn file_read_preview(
    state: State<'_, Arc<AppState>>,
    root: String,
    relative_path: String,
    max_bytes: Option<usize>,
) -> Result<file_index::FilePreview, AppError> {
    state.file_index.read_preview(&root, &relative_path, max_bytes)
}

#[tauri::command]
fn file_index_status(
    state: State<'_, Arc<AppState>>,
    root: String,
) -> Option<file_index::FileIndexStatus> {
    state.file_index.status(&root)
}

// ─── LSP ─────────────────────────────────────────────────────────────

#[tauri::command]
fn lsp_hover(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Option<lsp::LspHoverResult>, AppError> {
    state.lsp.hover(&root, &file_path, line, character)
}

#[tauri::command]
fn lsp_definition(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
    line: u32,
    character: u32,
) -> Result<Vec<lsp::LspLocation>, AppError> {
    state.lsp.definition(&root, &file_path, line, character)
}

#[tauri::command]
fn lsp_document_symbols(
    state: State<'_, Arc<AppState>>,
    root: String,
    file_path: String,
) -> Result<Vec<lsp::LspSymbol>, AppError> {
    state.lsp.document_symbols(&root, &file_path)
}

#[tauri::command]
fn lsp_workspace_symbols(
    state: State<'_, Arc<AppState>>,
    root: String,
    query: String,
    language_hint: Option<String>,
) -> Result<Vec<lsp::LspWorkspaceSymbol>, AppError> {
    state.lsp.workspace_symbols(&root, &query, language_hint.as_deref())
}

#[tauri::command]
fn lsp_list_servers(
    state: State<'_, Arc<AppState>>,
) -> Vec<lsp::LspServerStatus> {
    state.lsp.list_servers()
}

#[tauri::command]
fn lsp_stop(
    state: State<'_, Arc<AppState>>,
    root: Option<String>,
) {
    match root {
        Some(r) => state.lsp.stop_for_root(&r),
        None => state.lsp.stop_all(),
    }
}

// ─── Syntax Highlighting (tree-sitter) ───────────────────────────────

#[tauri::command]
fn syntax_highlight(
    source: String,
    filename: String,
) -> syntax::HighlightResult {
    syntax::highlight(&source, &filename)
}

// ─── Conversations ───────────────────────────────────────────────────

#[tauri::command]
fn list_conversations(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<Conversation>, AppError> {
    state.db.list_conversations(&workspace_id)
}

#[tauri::command]
fn get_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Conversation, AppError> {
    state.db.get_conversation(&id)
}

#[tauri::command]
fn create_conversation(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Conversation, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

    // Deactivate previous active conversations
    state.db.deactivate_workspace_conversations(&workspace_id)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conv = Conversation {
        id: id.clone(),
        workspace_id: workspace_id.clone(),
        backend: ws.backend.clone(),
        backend_session_id: None,
        backend_session_cwd: None,
        branch: None,
        worktree_path: None,
        title: None,
        is_active: true,
        created_at: now.clone(),
        updated_at: now,
        input_tokens: 0,
        output_tokens: 0,
    };

    state.db.create_conversation(&conv)?;
    Ok(conv)
}

#[tauri::command]
fn set_conversation_backend_session(
    state: State<'_, Arc<AppState>>,
    id: String,
    backend_session_id: String,
    backend_session_cwd: Option<String>,
    branch: Option<String>,
    worktree_path: Option<String>,
) -> Result<(), AppError> {
    state.db.set_conversation_backend_session(
        &id,
        &backend_session_id,
        backend_session_cwd.as_deref(),
        branch.as_deref(),
        worktree_path.as_deref(),
    )
}

#[tauri::command]
fn delete_conversation(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_conversation(&id)
}

// ─── Messages ────────────────────────────────────────────────────────

#[tauri::command]
fn list_messages(
    state: State<'_, Arc<AppState>>,
    conversation_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    state.db.list_messages(&conversation_id)
}

// ─── OpenCode Backend ────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct OpenCodeStarted {
    workspace_id: String,
    base_url: String,
    event_stream_url: String,
    healthy: bool,
}

#[derive(Serialize, Clone)]
struct KhadimSessionCreated {
    id: String,
}

fn resolve_khadim_selection(
    state: &Arc<AppState>,
    model: Option<&OpenCodeModelRef>,
) -> Result<Option<ModelSelection>, AppError> {
    if let Some(model) = model {
        let override_config = khadim_ai::model_settings::configured_model_override(
            &state.db,
            &model.provider_id,
            &model.model_id,
        )?;
        let provider_api_key = khadim_ai::model_settings::saved_provider_api_key(&model.provider_id)?;
        return Ok(Some(ModelSelection {
            provider: model.provider_id.clone(),
            model_id: model.model_id.clone(),
            display_name: override_config.as_ref().map(|config| config.name.clone()),
            api_key: override_config
                .as_ref()
                .and_then(|config| config.api_key.clone())
                .or(provider_api_key),
            base_url: override_config.as_ref().and_then(|config| config.base_url.clone()),
        }));
    }

    let config = khadim_ai::model_settings::active_config(&state.db)?
        .ok_or_else(|| AppError::invalid_input("No Khadim model is configured. Add one in Model Settings first."))?;

    Ok(Some(ModelSelection {
        provider: config.provider,
        model_id: config.model,
        display_name: Some(config.name),
        api_key: config.api_key,
        base_url: config.base_url,
    }))
}

fn persist_user_message(
    state: &Arc<AppState>,
    conversation_id: &str,
    content: &str,
) -> Result<(), AppError> {
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "user".to_string(),
        content: content.to_string(),
        metadata: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&user_msg)
}

fn persist_assistant_message(
    state: &Arc<AppState>,
    conversation_id: &str,
    content: &str,
    metadata: Option<String>,
) -> Result<(), AppError> {
    let assistant_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "assistant".to_string(),
        content: content.to_string(),
        metadata,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&assistant_msg)
}

#[tauri::command]
async fn opencode_start(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<OpenCodeStarted, AppError> {
    let ws = state.db.get_workspace(&workspace_id)?;

    let working_dir = ws
        .worktree_path
        .as_deref()
        .unwrap_or(&ws.repo_path);

    let port = opencode::find_free_port()?;

    // Set up output streaming — emit to frontend as events
    let (tx, mut rx) = mpsc::unbounded_channel::<ProcessOutput>();
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(output) = rx.recv().await {
            let _ = app_handle.emit("process-output", &output);
        }
    });

    let conn = state
        .opencode
        .start(&workspace_id, working_dir, port, &state.process_runner, Some(tx))
        .await?;

    let result = OpenCodeStarted {
        workspace_id: workspace_id.clone(),
        base_url: conn.base_url.clone(),
        event_stream_url: OpenCodeManager::event_stream_url(&conn),
        healthy: conn.healthy,
    };

    // Emit a backend-ready event
    let _ = app.emit("opencode-ready", &result);

    Ok(result)
}

#[tauri::command]
async fn opencode_stop(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<(), AppError> {
    state
        .opencode
        .stop(&workspace_id, &state.process_runner)
        .await
}

#[tauri::command]
async fn opencode_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::create_session(&conn).await
}

#[tauri::command]
async fn opencode_list_sessions(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_sessions(&conn).await
}

#[tauri::command]
async fn opencode_list_models(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<opencode::OpenCodeModelOption>, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_models(&conn).await
}

#[tauri::command]
async fn opencode_send_message(
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    // Save user message locally
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        metadata: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&user_msg)?;

    // Send to OpenCode (this waits for the response)
    let response = OpenCodeManager::send_message(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await?;

    // Save assistant response locally
    let assistant_content = extract_text(&response);

    if !assistant_content.is_empty() {
        let assistant_msg = ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            conversation_id: conversation_id.clone(),
            role: "assistant".to_string(),
            content: assistant_content,
            metadata: Some(serde_json::to_string(&response).unwrap_or_default()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state.db.insert_message(&assistant_msg)?;
    }

    Ok(response)
}

#[tauri::command]
async fn opencode_send_message_async(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    // Save user message locally
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id,
        role: "user".to_string(),
        content: content.clone(),
        metadata: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&user_msg)?;

    // Send async — frontend will receive updates via SSE
    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await
}

/// Send a message and stream the response as Tauri events.
/// This uses the async prompt endpoint + SSE event stream.
#[tauri::command]
async fn opencode_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
    system: Option<String>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    // Save user message locally
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: conversation_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        metadata: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.insert_message(&user_msg)?;

    // Subscribe to SSE events first
    let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    state.opencode.subscribe_events(
        &conn,
        workspace_id.clone(),
        session_id.clone(),
        tx,
    );

    // Now send the async prompt
    OpenCodeManager::send_message_async(
        &conn,
        &session_id,
        &content,
        model.as_ref(),
        system.as_deref(),
    ).await?;

    // Forward events to frontend
    let app_handle = app.clone();
    let state_arc = state.inner().clone();
    let conn_for_persist = conn.clone();
    let conv_id = conversation_id.clone();
    let session_id_for_cleanup = session_id.clone();
    tokio::spawn(async move {
        let mut full_content = String::new();
        let mut assistant_message_id: Option<String> = None;
        while let Some(evt) = rx.recv().await {
            if evt.event_type == "message_start" {
                assistant_message_id = evt
                    .metadata
                    .as_ref()
                    .and_then(|metadata| metadata.get("messageId"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned);
            }

            // Accumulate text deltas
            if evt.event_type == "text_delta" {
                if let Some(ref text) = evt.content {
                    full_content.push_str(text);
                }
            }

            // Persist token usage whenever OpenCode reports it.
            if evt.event_type == "usage_update" {
                if let Some(ref meta) = evt.metadata {
                    let input  = meta.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    let output = meta.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    if let Err(e) = state_arc.db.update_conversation_tokens(&conv_id, input, output) {
                        log::warn!("failed to persist token usage for {conv_id}: {}", e.message);
                    }
                }
            }

            let is_terminal = evt.event_type == "done" || evt.event_type == "error";
            if is_terminal {
                if let Err(error) = persist_streamed_assistant_message(
                    &state_arc,
                    &conn_for_persist,
                    &evt.session_id,
                    &conv_id,
                    &full_content,
                    &evt,
                    assistant_message_id.as_deref(),
                )
                .await
                {
                    log::warn!(
                        "failed to persist assistant message for session {}: {}",
                        evt.session_id,
                        error.message
                    );
                }
            }

            let _ = app_handle.emit("agent-stream", &evt);

            if is_terminal {
                // Clean up the subscription when the stream ends
                state_arc.opencode.clear_event_subscription(&session_id_for_cleanup);
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn opencode_abort(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::abort_session(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_list_messages(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::list_messages(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_get_diff(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::get_diff(&conn, &session_id).await
}

#[tauri::command]
async fn opencode_session_statuses(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::session_statuses(&conn).await
}

#[tauri::command]
async fn opencode_get_connection(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Option<opencode::OpenCodeConnection>, AppError> {
    Ok(state.opencode.get_connection(&workspace_id))
}

#[tauri::command]
async fn opencode_reply_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
    answers: Vec<Vec<String>>,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::reply_question(&conn, &request_id, &answers).await
}

#[tauri::command]
async fn opencode_reject_question(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    request_id: String,
) -> Result<(), AppError> {
    let conn = state
        .opencode
        .get_connection(&workspace_id)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "No OpenCode server running for workspace {workspace_id}"
            ))
        })?;

    OpenCodeManager::reject_question(&conn, &request_id).await
}

#[derive(Deserialize)]
struct ClaudeCodeBridgeEvent {
    event_type: String,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[tauri::command]
async fn claude_code_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    cwd_override: Option<String>,
) -> Result<ClaudeCodeSessionCreated, AppError> {
    let workspace = state.db.get_workspace(&workspace_id)?;
    let cwd = cwd_override
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(|| workspace.worktree_path.as_ref().map(std::path::PathBuf::from))
        .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path));

    Ok(state.claude_code.create_session(workspace_id, cwd))
}

#[tauri::command]
fn claude_code_list_models(state: State<'_, Arc<AppState>>) -> Result<Vec<opencode::OpenCodeModelOption>, AppError> {
    Ok(state.claude_code.list_models())
}

#[tauri::command]
async fn claude_code_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: String,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<(), AppError> {
    persist_user_message(state.inner(), &conversation_id, &content)?;

    state.claude_code.ensure_bridge_available()?;
    let session = match state.claude_code.get_session(&session_id) {
        Ok(session) => session,
        Err(_) => {
            let conversation = state.db.get_conversation(&conversation_id)?;
            let workspace = state.db.get_workspace(&workspace_id)?;
            let cwd = conversation
                .backend_session_cwd
                .as_ref()
                .map(std::path::PathBuf::from)
                .filter(|path| path.is_dir())
                .or_else(|| {
                    workspace
                        .worktree_path
                        .as_ref()
                        .map(std::path::PathBuf::from)
                        .filter(|path| path.is_dir())
                })
                .unwrap_or_else(|| std::path::PathBuf::from(&workspace.repo_path));

            state
                .claude_code
                .restore_session(session_id.clone(), workspace_id.clone(), cwd, true)
        }
    };
    if session.workspace_id != workspace_id {
        return Err(AppError::invalid_input(format!(
            "Claude Code session {session_id} does not belong to workspace {workspace_id}"
        )));
    }

    let state_arc = state.inner().clone();
    let app_handle = app.clone();
    let bridge_path = state.claude_code.bridge_script_path().to_path_buf();
    let package_root = state.claude_code.package_root().to_path_buf();
    let resolved_model = ClaudeCodeManager::resolve_model_id(model.as_ref());

    tokio::spawn(async move {
        let mut full_content = String::new();
        let mut saw_terminal = false;
        let mut terminal_event: Option<AgentStreamEvent> = None;
        let mut persisted_steps: Vec<serde_json::Value> = Vec::new();

        let mut child = match Command::new("node")
            .arg(&bridge_path)
            .current_dir(&package_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id: workspace_id.clone(),
                        session_id: session_id.clone(),
                        event_type: "error".to_string(),
                        content: Some(format!("Failed to start Claude Code bridge: {error}")),
                        metadata: None,
                    },
                );
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id,
                        session_id,
                        event_type: "done".to_string(),
                        content: None,
                        metadata: None,
                    },
                );
                return;
            }
        };

        let payload = serde_json::json!({
            "cwd": session.cwd,
            "prompt": content,
            "model": resolved_model,
            "sessionId": session.id,
            "resume": session.started,
        });

        let stdin = child.stdin.take();
        let Some(mut stdin) = stdin else {
            let _ = app_handle.emit(
                "agent-stream",
                &AgentStreamEvent {
                    workspace_id: workspace_id.clone(),
                    session_id: session_id.clone(),
                    event_type: "error".to_string(),
                    content: Some("Claude Code bridge did not expose stdin".to_string()),
                    metadata: None,
                },
            );
            let _ = app_handle.emit(
                "agent-stream",
                &AgentStreamEvent {
                    workspace_id,
                    session_id,
                    event_type: "done".to_string(),
                    content: None,
                    metadata: None,
                },
            );
            return;
        };

        let (input_tx, mut input_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let writer_workspace_id = workspace_id.clone();
        let writer_session_id = session_id.clone();
        let writer_app = app_handle.clone();
        tokio::spawn(async move {
            while let Some(message) = input_rx.recv().await {
                if let Err(error) = stdin.write_all(message.as_bytes()).await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to send input to Claude Code bridge: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
                if let Err(error) = stdin.write_all(b"\n").await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to finalize input for Claude Code bridge: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
                if let Err(error) = stdin.flush().await {
                    let _ = writer_app.emit(
                        "agent-stream",
                        &AgentStreamEvent {
                            workspace_id: writer_workspace_id.clone(),
                            session_id: writer_session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(format!("Failed to flush Claude Code bridge input: {error}")),
                            metadata: None,
                        },
                    );
                    break;
                }
            }
        });

        if input_tx.send(payload.to_string()).is_err() {
            let _ = app_handle.emit(
                "agent-stream",
                &AgentStreamEvent {
                    workspace_id,
                    session_id,
                    event_type: "error".to_string(),
                    content: Some("Failed to queue prompt for Claude Code bridge".to_string()),
                    metadata: None,
                },
            );
            return;
        }

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id: workspace_id.clone(),
                        session_id: session_id.clone(),
                        event_type: "error".to_string(),
                        content: Some("Claude Code bridge did not expose stdout".to_string()),
                        metadata: None,
                    },
                );
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id,
                        session_id,
                        event_type: "done".to_string(),
                        content: None,
                        metadata: None,
                    },
                );
                return;
            }
        };

        let stderr = child.stderr.take();
        let child = Arc::new(tokio::sync::Mutex::new(child));
        state_arc
            .claude_code
            .track_run(session_id.clone(), child.clone(), input_tx.clone());

        let stderr_task = tokio::spawn(async move {
            let mut lines_out = Vec::new();
            if let Some(stderr) = stderr {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        lines_out.push(trimmed.to_string());
                    }
                }
            }
            lines_out
        });

        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let parsed = match serde_json::from_str::<ClaudeCodeBridgeEvent>(trimmed) {
                Ok(parsed) => parsed,
                Err(error) => {
                    log::warn!("Failed to parse Claude Code bridge event: {} :: {}", error, trimmed);
                    continue;
                }
            };

            let event = AgentStreamEvent {
                workspace_id: workspace_id.clone(),
                session_id: session_id.clone(),
                event_type: parsed.event_type.clone(),
                content: parsed.content.clone(),
                metadata: parsed.metadata.clone(),
            };

            if parsed.event_type == "text_delta" {
                if let Some(text) = parsed.content.as_ref() {
                    full_content.push_str(text);
                }
            }

            if matches!(parsed.event_type.as_str(), "step_start" | "step_update" | "step_complete") {
                if let Some(metadata) = event.metadata.as_ref().and_then(|value| value.as_object()) {
                    if let Some(step_id) = metadata.get("id").and_then(|value| value.as_str()) {
                        let existing_index = persisted_steps.iter().position(|step| {
                            step.get("id").and_then(|value| value.as_str()) == Some(step_id)
                        });

                        let mut next_step = existing_index
                            .and_then(|index| persisted_steps.get(index).cloned())
                            .unwrap_or_else(|| serde_json::json!({
                                "id": step_id,
                                "title": metadata.get("title").and_then(|value| value.as_str()).unwrap_or("Working"),
                                "status": "running",
                            }));

                        if let Some(obj) = next_step.as_object_mut() {
                            if let Some(title) = metadata.get("title").and_then(|value| value.as_str()) {
                                obj.insert("title".to_string(), serde_json::Value::String(title.to_string()));
                            }
                            if let Some(tool) = metadata.get("tool").and_then(|value| value.as_str()) {
                                obj.insert("tool".to_string(), serde_json::Value::String(tool.to_string()));
                            }
                            if let Some(result) = metadata.get("result").and_then(|value| value.as_str()) {
                                obj.insert("result".to_string(), serde_json::Value::String(result.to_string()));
                            }
                            if let Some(content) = event.content.as_ref().filter(|value| !value.trim().is_empty()) {
                                obj.insert("content".to_string(), serde_json::Value::String(content.clone()));
                                if parsed.event_type == "step_complete" && !obj.contains_key("result") {
                                    obj.insert("result".to_string(), serde_json::Value::String(content.clone()));
                                }
                            }
                            let status = match parsed.event_type.as_str() {
                                "step_complete" => {
                                    if metadata.get("is_error").and_then(|value| value.as_bool()) == Some(true) {
                                        "error"
                                    } else {
                                        "complete"
                                    }
                                }
                                _ => "running",
                            };
                            obj.insert("status".to_string(), serde_json::Value::String(status.to_string()));
                        }

                        if let Some(index) = existing_index {
                            persisted_steps[index] = next_step;
                        } else {
                            persisted_steps.push(next_step);
                        }
                    }
                }
            }

            if parsed.event_type == "done" {
                let _ = state_arc.claude_code.mark_started(&session_id);
                saw_terminal = true;
                terminal_event = Some(event);
                break;
            }

            if parsed.event_type == "error" {
                saw_terminal = true;
                terminal_event = Some(event);
                break;
            }

            let _ = app_handle.emit("agent-stream", &event);
        }

        let stderr_lines = stderr_task.await.unwrap_or_default();
        let status = child.lock().await.wait().await.ok();
        let was_aborted = !state_arc.claude_code.is_running(&session_id);
        state_arc.claude_code.clear_run(&session_id);

        if was_aborted {
            return;
        }

        if !saw_terminal {
            let detail = stderr_lines.join("\n");
            let message = if !detail.is_empty() {
                format!("Claude Code run ended unexpectedly: {detail}")
            } else if let Some(status) = status {
                format!("Claude Code run ended unexpectedly with status {status}")
            } else {
                "Claude Code run ended unexpectedly".to_string()
            };
            terminal_event = Some(AgentStreamEvent {
                workspace_id: workspace_id.clone(),
                session_id: session_id.clone(),
                event_type: "error".to_string(),
                content: Some(message),
                metadata: None,
            });
        }

        if !full_content.trim().is_empty() {
            let metadata = if persisted_steps.is_empty() {
                None
            } else {
                Some(serde_json::json!({ "thinkingSteps": persisted_steps }).to_string())
            };
            let _ = persist_assistant_message(&state_arc, &conversation_id, &full_content, metadata);
        }

        if let Some(event) = terminal_event {
            let is_error = event.event_type == "error";
            let _ = app_handle.emit("agent-stream", &event);
            if is_error {
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id,
                        session_id,
                        event_type: "done".to_string(),
                        content: None,
                        metadata: None,
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn claude_code_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.claude_code.abort(&session_id).await
}

#[tauri::command]
fn claude_code_respond_permission(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    request_id: String,
    allow: bool,
    remember: bool,
) -> Result<(), AppError> {
    state
        .claude_code
        .respond_permission(&session_id, &request_id, allow, remember)
}

// ─── Khadim Backend ──────────────────────────────────────────────────

#[tauri::command]
async fn khadim_create_session(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
    cwd_override: Option<String>,
) -> Result<KhadimSessionCreated, AppError> {
    let (resolved_workspace_id, cwd) = if let Some(workspace_id) = workspace_id {
        let workspace = state.db.get_workspace(&workspace_id)?;
        let base_cwd = if let Some(ref override_path) = cwd_override {
            let p = std::path::PathBuf::from(override_path);
            if p.is_dir() { p } else {
                std::path::PathBuf::from(
                    workspace.worktree_path.unwrap_or(workspace.repo_path),
                )
            }
        } else {
            std::path::PathBuf::from(
                workspace.worktree_path.unwrap_or(workspace.repo_path),
            )
        };
        (workspace_id, base_cwd)
    } else {
        // Standalone chat — check if the user configured a chat directory.
        let configured_dir = state
            .db
            .get_setting("khadim:chat_directory")
            .ok()
            .flatten()
            .filter(|v| !v.is_empty());

        let dir = if let Some(path) = configured_dir {
            let p = std::path::PathBuf::from(&path);
            if p.is_dir() {
                p
            } else {
                // Configured path no longer exists — fall back to temp.
                let session_id = uuid::Uuid::new_v4().to_string();
                let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
                std::fs::create_dir_all(&tmp)?;
                tmp
            }
        } else {
            let session_id = uuid::Uuid::new_v4().to_string();
            let tmp = std::env::temp_dir().join(format!("khadim-chat-{session_id}"));
            std::fs::create_dir_all(&tmp)?;
            tmp
        };

        ("__chat__".to_string(), dir)
    };

    let id = state.khadim.create_session(resolved_workspace_id, cwd);
    Ok(KhadimSessionCreated { id })
}

#[tauri::command]
async fn khadim_list_models(state: State<'_, Arc<AppState>>) -> Result<Vec<CatalogModelOption>, AppError> {
    khadim_ai::model_settings::configured_model_options(&state.db)
}

#[tauri::command]
fn khadim_list_model_configs(state: State<'_, Arc<AppState>>) -> Result<Vec<ModelConfig>, AppError> {
    khadim_ai::model_settings::list_configs(&state.db)
}

#[tauri::command]
fn khadim_list_providers() -> Vec<ProviderOption> {
    khadim_ai::model_settings::supported_providers()
}

#[tauri::command]
fn khadim_list_provider_statuses(state: State<'_, Arc<AppState>>) -> Result<Vec<ProviderStatus>, AppError> {
    khadim_ai::model_settings::provider_statuses(&state.db)
}

#[tauri::command]
fn khadim_save_provider_api_key(provider: String, api_key: String) -> Result<(), AppError> {
    khadim_ai::model_settings::save_provider_api_key(&provider, &api_key)
}

#[tauri::command]
fn khadim_get_provider_api_key_masked(provider: String) -> Result<Option<String>, AppError> {
    let key = khadim_ai::model_settings::saved_provider_api_key(&provider)?;
    Ok(key.map(|k| mask_api_key(&k)))
}

#[tauri::command]
fn khadim_get_provider_api_key(provider: String) -> Result<Option<String>, AppError> {
    khadim_ai::model_settings::saved_provider_api_key(&provider)
}

#[tauri::command]
fn khadim_delete_provider_api_key(provider: String) -> Result<(), AppError> {
    khadim_ai::model_settings::delete_provider_api_key(&provider)
}

#[tauri::command]
fn khadim_bulk_create_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
    models: Vec<BulkModelEntry>,
) -> Result<u32, AppError> {
    khadim_ai::model_settings::bulk_create_provider_models(&state.db, &provider, &models)
}

#[tauri::command]
fn khadim_remove_provider_models(
    state: State<'_, Arc<AppState>>,
    provider: String,
) -> Result<u32, AppError> {
    khadim_ai::model_settings::remove_provider_models(&state.db, &provider)
}

#[tauri::command]
async fn khadim_discover_models(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<DiscoveredProviderModel>, AppError> {
    khadim_ai::model_settings::discover_models(&provider, api_key, base_url).await
}

#[tauri::command]
fn khadim_create_model_config(
    state: State<'_, Arc<AppState>>,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    khadim_ai::model_settings::create_config(&state.db, input)
}

#[tauri::command]
fn khadim_update_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: ModelConfigInput,
) -> Result<ModelConfig, AppError> {
    khadim_ai::model_settings::update_config(&state.db, &id, input)
}

#[tauri::command]
fn khadim_delete_model_config(state: State<'_, Arc<AppState>>, id: String) -> Result<(), AppError> {
    khadim_ai::model_settings::delete_config(&state.db, &id)
}

#[tauri::command]
fn khadim_set_active_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    khadim_ai::model_settings::set_active_config(&state.db, &id)
}

#[tauri::command]
fn khadim_set_default_model_config(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    khadim_ai::model_settings::set_default_config(&state.db, &id)
}

#[tauri::command]
fn khadim_active_model(state: State<'_, Arc<AppState>>) -> Result<Option<CatalogModelOption>, AppError> {
    khadim_ai::model_settings::active_model_option(&state.db)
}

#[tauri::command]
async fn khadim_codex_auth_connected() -> Result<bool, AppError> {
    khadim_ai::oauth::has_openai_codex_auth().await
}

#[tauri::command]
async fn khadim_codex_auth_start() -> Result<CodexSessionInfo, AppError> {
    khadim_ai::oauth::start_openai_codex_login().await
}

#[tauri::command]
async fn khadim_codex_auth_status(session_id: String) -> Result<CodexLoginStatusResponse, AppError> {
    khadim_ai::oauth::get_openai_codex_login_status(&session_id).await
}

#[tauri::command]
async fn khadim_codex_auth_complete(session_id: String, code: String) -> Result<(), AppError> {
    khadim_ai::oauth::submit_openai_codex_manual_code(&session_id, &code).await
}

#[tauri::command]
async fn khadim_send_streaming(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<(), AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let session = state.khadim.get_session(&session_id)?;
    let state_arc = state.inner().clone();
    let app_handle = app.clone();
    let session_id_for_cleanup = session_id.clone();
    let session_id_for_error = session_id.clone();

    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let handle = tokio::spawn(async move {
        let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        // Hold back terminal events (done/error) so we can persist the
        // assistant message before the frontend sees "done" and refetches.
        let (held_tx, mut held_rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
        let emit_handle = app_handle.clone();
        let emit_task = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if event.event_type == "done" || event.event_type == "error" {
                    // Forward to the main task so it can persist first.
                    let _ = held_tx.send(event);
                } else {
                    let _ = emit_handle.emit("agent-stream", &event);
                }
            }
        });

        let result = {
            let mut session = session.lock().await;
            match resolve_khadim_selection(&state_arc, model.as_ref()) {
                Ok(selection) => {
                    khadim_agent::orchestrator::run_prompt_with_plugins(
                        &mut session,
                        &content,
                        selection,
                        &tx,
                        Some(&plugins),
                        Some(&skills),
                        Some(&khadim_mgr),
                    )
                    .await
                }
                Err(error) => Err(error),
            }
        };

        // Drop the sender so the emit task finishes.
        drop(tx);

        // Wait for the emit task to finish forwarding all events
        // (including the held done/error events) before draining.
        let _ = emit_task.await;

        match result {
            Ok(text) => {
                // Persist the assistant message BEFORE emitting "done" so the
                // frontend query refetch will find the new row.
                if let Some(conversation_id) = conversation_id {
                    let _ = persist_assistant_message(&state_arc, &conversation_id, &text, None);
                }
                // Now emit any held terminal events.
                while let Ok(event) = held_rx.try_recv() {
                    let _ = app_handle.emit("agent-stream", &event);
                }
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id: workspace_id.clone(),
                        session_id: session_id_for_error.clone(),
                        event_type: "error".to_string(),
                        content: Some(error.message.clone()),
                        metadata: None,
                    },
                );
                let _ = app_handle.emit(
                    "agent-stream",
                    &AgentStreamEvent {
                        workspace_id,
                        session_id: session_id_for_error.clone(),
                        event_type: "done".to_string(),
                        content: None,
                        metadata: None,
                    },
                );
            }
        }

        state_arc.khadim.clear_run(&session_id_for_cleanup);
    });

    state.khadim.track_run(session_id, handle);
    Ok(())
}

#[tauri::command]
async fn khadim_send_message(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
    session_id: String,
    conversation_id: Option<String>,
    content: String,
    model: Option<OpenCodeModelRef>,
) -> Result<String, AppError> {
    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_user_message(state.inner(), conversation_id, &content)?;
    }

    let session = state.khadim.get_session(&session_id)?;
    let (tx, _rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let selection = resolve_khadim_selection(state.inner(), model.as_ref())?;
    let plugins = state.plugins.clone();
    let skills = state.skills.clone();
    let khadim_mgr = state.khadim.clone();
    let text = {
        let mut session = session.lock().await;
        khadim_agent::orchestrator::run_prompt_with_plugins(
            &mut session,
            &content,
            selection,
            &tx,
            Some(&plugins),
            Some(&skills),
            Some(&khadim_mgr),
        )
        .await?
    };

    if let Some(conversation_id) = conversation_id.as_deref() {
        persist_assistant_message(state.inner(), conversation_id, &text, None)?;
    }

    let _ = workspace_id;
    Ok(text)
}

#[tauri::command]
async fn khadim_abort(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), AppError> {
    state.khadim.abort(&session_id).await
}

#[tauri::command]
fn khadim_answer_question(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    answer: String,
) -> Result<(), AppError> {
    state.khadim.answer_question(&session_id, answer)
}

// ─── Settings ────────────────────────────────────────────────────────

#[tauri::command]
fn get_setting(state: State<'_, Arc<AppState>>, key: String) -> Result<Option<String>, AppError> {
    state.db.get_setting(&key)
}

#[tauri::command]
fn set_setting(
    state: State<'_, Arc<AppState>>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.db.set_setting(&key, &value)
}

// ─── Process info ────────────────────────────────────────────────────

#[tauri::command]
fn list_processes(state: State<'_, Arc<AppState>>) -> Vec<process::ProcessInfo> {
    state.process_runner.list()
}

// ─── Plugins ─────────────────────────────────────────────────────────

#[tauri::command]
fn plugin_list(state: State<'_, Arc<AppState>>) -> Vec<PluginEntry> {
    state.plugins.list_plugins()
}

#[tauri::command]
fn plugin_get(state: State<'_, Arc<AppState>>, plugin_id: String) -> Result<PluginEntry, AppError> {
    state
        .plugins
        .get_plugin(&plugin_id)
        .ok_or_else(|| AppError::not_found(format!("Plugin not found: {plugin_id}")))
}

#[tauri::command]
fn plugin_enable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state.plugins.enable_plugin(&plugin_id, &root)
}

#[tauri::command]
fn plugin_disable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<PluginEntry, AppError> {
    state.plugins.disable_plugin(&plugin_id)
}

#[tauri::command]
fn plugin_install(
    state: State<'_, Arc<AppState>>,
    source_dir: String,
    workspace_root: Option<String>,
) -> Result<PluginEntry, AppError> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state
        .plugins
        .install_from_dir(std::path::Path::new(&source_dir), &root)
}

#[tauri::command]
fn plugin_uninstall(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<(), AppError> {
    state.plugins.uninstall(&plugin_id)
}

#[tauri::command]
fn plugin_list_tools(state: State<'_, Arc<AppState>>) -> Vec<PluginToolInfo> {
    state.plugins.all_plugin_tools()
}

#[tauri::command]
fn plugin_set_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), AppError> {
    state.plugins.set_plugin_config(&plugin_id, &key, &value)
}

#[tauri::command]
fn plugin_get_config(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, AppError> {
    state.plugins.get_plugin_config(&plugin_id, &key)
}

#[tauri::command]
fn plugin_discover(
    state: State<'_, Arc<AppState>>,
    workspace_root: Option<String>,
) -> Vec<PluginEntry> {
    let root = workspace_root
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    state.plugins.discover_and_load(&root)
}

#[tauri::command]
fn plugin_dir(state: State<'_, Arc<AppState>>) -> String {
    state.plugins.plugins_dir().to_string_lossy().to_string()
}

// ─── Skills ──────────────────────────────────────────────────────────

#[tauri::command]
fn skill_discover(state: State<'_, Arc<AppState>>) -> Vec<SkillEntry> {
    state.skills.discover()
}

#[tauri::command]
fn skill_toggle(
    state: State<'_, Arc<AppState>>,
    skill_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    state.skills.set_enabled(&skill_id, enabled)
}

#[tauri::command]
fn skill_list_dirs(state: State<'_, Arc<AppState>>) -> Vec<String> {
    state.skills.list_dirs()
}

#[tauri::command]
fn skill_add_dir(state: State<'_, Arc<AppState>>, dir: String) -> Result<Vec<String>, AppError> {
    state.skills.add_dir(&dir)
}

#[tauri::command]
fn skill_remove_dir(state: State<'_, Arc<AppState>>, dir: String) -> Result<Vec<String>, AppError> {
    state.skills.remove_dir(&dir)
}

// ─── Editor ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
struct DetectedEditor {
    /// Unique key for the editor (e.g. "code", "cursor", "zed").
    id: String,
    /// Human-readable name.
    name: String,
    /// Binary name / path found on $PATH.
    binary: String,
    /// True when the binary was actually found on $PATH.
    available: bool,
}

const KNOWN_EDITORS: &[(&str, &str, &[&str])] = &[
    ("code",            "Visual Studio Code",     &["code"]),
    ("code-insiders",   "VS Code Insiders",       &["code-insiders"]),
    ("cursor",          "Cursor",                 &["cursor"]),
    ("zed",             "Zed",                    &["zed"]),
    ("windsurf",        "Windsurf",               &["windsurf"]),
    ("sublime",         "Sublime Text",           &["subl"]),
    ("neovim",          "Neovim",                 &["nvim"]),
    ("vim",             "Vim",                    &["vim"]),
    ("emacs",           "Emacs",                  &["emacs"]),
    ("helix",           "Helix",                  &["hx"]),
    ("fleet",           "JetBrains Fleet",        &["fleet"]),
    ("idea",            "IntelliJ IDEA",          &["idea"]),
    ("webstorm",        "WebStorm",               &["webstorm"]),
    ("rustrover",       "RustRover",              &["rustrover"]),
    ("pycharm",         "PyCharm",                &["pycharm"]),
    ("goland",          "GoLand",                 &["goland"]),
    ("clion",           "CLion",                  &["clion"]),
    ("lapce",           "Lapce",                  &["lapce"]),
    ("kate",            "Kate",                   &["kate"]),
    ("gedit",           "GNOME Text Editor",      &["gedit", "gnome-text-editor"]),
    ("nano",            "Nano",                   &["nano"]),
    ("xdg",             "System Default",         &["xdg-open"]),
];

/// Detect which editors are installed by probing $PATH.
#[tauri::command]
fn detect_editors() -> Vec<DetectedEditor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|(id, name, binaries)| {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    return Some(DetectedEditor {
                        id: id.to_string(),
                        name: name.to_string(),
                        binary: bin.to_string(),
                        available: true,
                    });
                }
            }
            None
        })
        .collect()
}

/// Open a file in the user's preferred code editor.
///
/// Resolution order:
///   1. `preferred_editor` setting (editor id from detect_editors)
///   2. `$VISUAL` / `$EDITOR` environment variable
///   3. First available GUI editor on `$PATH`
///   4. Platform default opener (xdg-open / open / start)
#[tauri::command]
async fn open_in_editor(
    state: State<'_, Arc<AppState>>,
    file_path: String,
    editor_id: Option<String>,
) -> Result<(), AppError> {
    use std::process::Command;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::not_found(format!(
            "File does not exist: {file_path}"
        )));
    }

    // 1. Explicit editor id (from arg or setting)
    let effective_id = editor_id
        .or_else(|| state.db.get_setting("khadim:preferred_editor").ok().flatten());

    if let Some(ref id) = effective_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    let result = Command::new(bin).arg(&file_path).spawn();
                    if result.is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    // 2. Check $VISUAL / $EDITOR
    for var in ["VISUAL", "EDITOR"] {
        if let Ok(editor) = std::env::var(var) {
            let editor = editor.trim().to_string();
            if !editor.is_empty() {
                let result = Command::new(&editor).arg(&file_path).spawn();
                if result.is_ok() {
                    return Ok(());
                }
            }
        }
    }

    // 3. Try first available GUI editor
    for (_, _, binaries) in KNOWN_EDITORS.iter().take(6) {
        for bin in *binaries {
            if let Ok(_) = Command::new(bin).arg(&file_path).spawn() {
                return Ok(());
            }
        }
    }

    // 4. Platform default opener
    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&file_path)
        .spawn()
        .map_err(|e| {
            AppError::io(format!(
                "Failed to open {file_path} in any editor: {e}"
            ))
        })?;

    Ok(())
}

/// Open a directory (project root) in the user's preferred editor.
#[tauri::command]
async fn open_project_in_editor(
    state: State<'_, Arc<AppState>>,
    project_path: String,
) -> Result<(), AppError> {
    use std::process::Command;

    let path = std::path::Path::new(&project_path);
    if !path.is_dir() {
        return Err(AppError::not_found(format!(
            "Directory does not exist: {project_path}"
        )));
    }

    let editor_id = state.db.get_setting("khadim:preferred_editor").ok().flatten();

    if let Some(ref id) = editor_id {
        if let Some((_, _, binaries)) = KNOWN_EDITORS.iter().find(|(eid, _, _)| eid == id) {
            for bin in *binaries {
                if which::which(bin).is_ok() {
                    let result = Command::new(bin).arg(&project_path).spawn();
                    if result.is_ok() {
                        return Ok(());
                    }
                }
            }
        }
    }

    // Fallback: try GUI editors that support opening folders
    for bin in ["code", "cursor", "zed", "windsurf", "subl", "idea", "webstorm", "fleet", "lapce"] {
        if let Ok(_) = Command::new(bin).arg(&project_path).spawn() {
            return Ok(());
        }
    }

    #[cfg(target_os = "linux")]
    let opener = "xdg-open";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "start";

    Command::new(opener)
        .arg(&project_path)
        .spawn()
        .map_err(|e| AppError::io(format!("Failed to open project: {e}")))?;

    Ok(())
}

// ── App entry point ──────────────────────────────────────────────────

pub fn run() {
    env_logger::init();

    let db = Database::open().expect("Failed to open database");
    let process_runner = ProcessRunner::new();
    let opencode = OpenCodeManager::new();
    let khadim = Arc::new(KhadimManager::new());
    let claude_code = Arc::new(ClaudeCodeManager::new());
    let github = github::GitHubClient::new();
    let db_arc = Arc::new(db);
    let plugin_manager = Arc::new(PluginManager::new(Arc::clone(&db_arc)));

    // Discover plugins at startup
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

    let skill_manager = Arc::new(SkillManager::new(Arc::clone(&db_arc)));
    {
        let discovered = skill_manager.discover();
        let enabled_count = discovered.iter().filter(|s| s.enabled).count();
        log::info!(
            "Discovered {} skill(s) ({} enabled)",
            discovered.len(),
            enabled_count,
        );
    }

    let app_state = Arc::new(AppState {
        db: Database::open().expect("Failed to reopen database"),
        process_runner,
        opencode,
        khadim,
        claude_code,
        github,
        plugins: plugin_manager,
        skills: skill_manager,
        terminals: Arc::new(TerminalManager::new()),
        file_index: Arc::new(FileIndexManager::new()),
        lsp: Arc::new(LspManager::new()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            // Runtime
            desktop_runtime_summary,
            // Workspaces
            list_workspaces,
            get_workspace,
            create_workspace,
            set_workspace_branch,
            delete_workspace,
            workspace_context_get,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_close,
            terminal_list,
            // File Finder
            file_index_build,
            file_search,
            file_read_preview,
            file_index_status,
            // LSP
            lsp_hover,
            lsp_definition,
            lsp_document_symbols,
            lsp_workspace_symbols,
            lsp_list_servers,
            lsp_stop,
            // Syntax highlighting
            syntax_highlight,
            // Git
            git_repo_info,
            git_list_branches,
            git_list_worktrees,
            git_create_worktree,
            git_remove_worktree,
            git_status,
            git_diff_stat,
            git_diff_files,
            // Conversations
            list_conversations,
            get_conversation,
            create_conversation,
            set_conversation_backend_session,
            delete_conversation,
            // Messages
            list_messages,
            // OpenCode
            opencode_start,
            opencode_stop,
            opencode_create_session,
            opencode_list_sessions,
            opencode_list_models,
            opencode_send_message,
            opencode_send_message_async,
            opencode_send_streaming,
            opencode_abort,
            opencode_list_messages,
            opencode_get_diff,
            opencode_session_statuses,
            opencode_get_connection,
            opencode_reply_question,
            opencode_reject_question,
            // Claude Code
            claude_code_create_session,
            claude_code_list_models,
            claude_code_send_streaming,
            claude_code_abort,
            claude_code_respond_permission,
            // Khadim
            khadim_create_session,
            khadim_list_models,
            khadim_list_model_configs,
            khadim_list_providers,
            khadim_list_provider_statuses,
            khadim_save_provider_api_key,
            khadim_get_provider_api_key_masked,
            khadim_get_provider_api_key,
            khadim_delete_provider_api_key,
            khadim_bulk_create_provider_models,
            khadim_remove_provider_models,
            khadim_discover_models,
            khadim_create_model_config,
            khadim_update_model_config,
            khadim_delete_model_config,
            khadim_set_active_model_config,
            khadim_set_default_model_config,
            khadim_active_model,
            khadim_codex_auth_connected,
            khadim_codex_auth_start,
            khadim_codex_auth_status,
            khadim_codex_auth_complete,
            khadim_send_streaming,
            khadim_send_message,
            khadim_abort,
            khadim_answer_question,
            // Settings
            get_setting,
            set_setting,
            // Processes
            list_processes,
            // Plugins
            plugin_list,
            plugin_get,
            plugin_enable,
            plugin_disable,
            plugin_install,
            plugin_uninstall,
            plugin_list_tools,
            plugin_set_config,
            plugin_get_config,
            plugin_discover,
            plugin_dir,
            // Skills
            skill_discover,
            skill_toggle,
            skill_list_dirs,
            skill_add_dir,
            skill_remove_dir,
            // Editor
            detect_editors,
            open_in_editor,
            open_project_in_editor,
            // GitHub Auth
            github::github_auth_status,
            github::github_auth_login,
            github::github_auth_logout,
            github::github_repo_slug,
            // GitHub Issues
            github::github_issue_list,
            github::github_issue_get,
            github::github_issue_create,
            github::github_issue_edit,
            github::github_issue_close,
            github::github_issue_reopen,
            github::github_issue_comment,
            github::github_issue_comments,
            github::github_label_list,
            // GitHub PRs
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
            // gh CLI
            github::github_gh_cli_info,
            github::github_gh_setup_git,
            // GitHub Repo creation
            github::github_create_and_push,
        ])
        .on_window_event(|window, event| {
            // Clean up processes on close
            if let tauri::WindowEvent::Destroyed = event {
                let _state = window.state::<Arc<AppState>>();
                // We can't await here, but the processes will be killed
                // when the ProcessRunner is dropped
                log::info!("Window destroyed, cleaning up processes");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
