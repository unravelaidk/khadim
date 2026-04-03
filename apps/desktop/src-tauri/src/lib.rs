#![allow(dead_code)]

mod db;
mod error;
mod git;
mod health;
mod opencode;
mod process;

use db::{ChatMessage, Conversation, Database, Workspace};
use error::AppError;
use opencode::{AgentStreamEvent, OpenCodeManager, OpenCodeModelRef};
use process::{ProcessOutput, ProcessRunner};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
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

// ── App State ────────────────────────────────────────────────────────

/// Shared state injected into all Tauri commands.
pub struct AppState {
    db: Database,
    process_runner: ProcessRunner,
    opencode: OpenCodeManager,
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
    create_worktree: Option<bool>,
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

    // Optionally create a worktree
    let (worktree_path, branch) = if input.create_worktree.unwrap_or(false) {
        let branch = input
            .branch
            .clone()
            .unwrap_or_else(|| format!("khadim/{}", &id[..8]));
        let wt_path = format!("{}/.khadim-worktrees/{}", input.repo_path, branch.replace('/', "-"));
        let _wt = git::create_worktree(&input.repo_path, &wt_path, &branch, true)?;
        (Some(wt_path), Some(branch))
    } else {
        (None, input.branch.clone())
    };

    let ws = Workspace {
        id: id.clone(),
        name: input.name,
        repo_path: input.repo_path,
        worktree_path,
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
fn git_create_worktree(
    repo_path: String,
    worktree_path: String,
    branch: String,
    new_branch: bool,
) -> Result<git::WorktreeInfo, AppError> {
    git::create_worktree(&repo_path, &worktree_path, &branch, new_branch)
}

#[tauri::command]
fn git_remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), AppError> {
    git::remove_worktree(&repo_path, &worktree_path, force)
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
        title: None,
        is_active: true,
        created_at: now.clone(),
        updated_at: now,
    };

    state.db.create_conversation(&conv)?;
    Ok(conv)
}

#[tauri::command]
fn set_conversation_backend_session(
    state: State<'_, Arc<AppState>>,
    id: String,
    backend_session_id: String,
) -> Result<(), AppError> {
    state
        .db
        .set_conversation_backend_session(&id, &backend_session_id)
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
    let response = OpenCodeManager::send_message(&conn, &session_id, &content, model.as_ref()).await?;

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
    OpenCodeManager::send_message_async(&conn, &session_id, &content, model.as_ref()).await
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
    let _handle = OpenCodeManager::subscribe_events(
        &conn,
        workspace_id.clone(),
        session_id.clone(),
        tx,
    );

    // Now send the async prompt
    OpenCodeManager::send_message_async(&conn, &session_id, &content, model.as_ref()).await?;

    // Forward events to frontend
    let app_handle = app.clone();
    let state_arc = state.inner().clone();
    let conv_id = conversation_id.clone();
    tokio::spawn(async move {
        let mut full_content = String::new();
        while let Some(evt) = rx.recv().await {
            // Accumulate text deltas
            if evt.event_type == "text_delta" {
                if let Some(ref text) = evt.content {
                    full_content.push_str(text);
                }
            }

            let _ = app_handle.emit("agent-stream", &evt);

            if evt.event_type == "done" || evt.event_type == "error" {
                // Save the accumulated assistant message
                if !full_content.is_empty() {
                    let assistant_msg = ChatMessage {
                        id: uuid::Uuid::new_v4().to_string(),
                        conversation_id: conv_id.clone(),
                        role: "assistant".to_string(),
                        content: full_content.clone(),
                        metadata: None,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = state_arc.db.insert_message(&assistant_msg);
                }
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

// ── App entry point ──────────────────────────────────────────────────

pub fn run() {
    env_logger::init();

    let db = Database::open().expect("Failed to open database");
    let process_runner = ProcessRunner::new();
    let opencode = OpenCodeManager::new();

    let app_state = Arc::new(AppState {
        db,
        process_runner,
        opencode,
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            // Runtime
            desktop_runtime_summary,
            // Workspaces
            list_workspaces,
            get_workspace,
            create_workspace,
            delete_workspace,
            // Git
            git_repo_info,
            git_list_branches,
            git_list_worktrees,
            git_create_worktree,
            git_remove_worktree,
            git_status,
            git_diff_stat,
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
            // Settings
            get_setting,
            set_setting,
            // Processes
            list_processes,
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
