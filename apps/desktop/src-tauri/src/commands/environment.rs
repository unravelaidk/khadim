use crate::db::{Environment, RuntimeSession};
use crate::error::AppError;
use crate::khadim_agent::session::ExecutionTarget;
use crate::sandbox;
use crate::AppState;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Deserialize)]
pub(crate) struct CreateEnvironmentInput {
    pub workspace_id: String,
    pub name: Option<String>,
    pub backend: Option<String>,
    pub execution_target: Option<String>,
    pub source_cwd: Option<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateRuntimeSessionInput {
    pub environment_id: String,
    pub shared: Option<bool>,
    pub status: Option<String>,
}

fn normalize_execution_target(value: Option<String>) -> Result<String, AppError> {
    let target = value.unwrap_or_else(|| "local".to_string());
    if target != "local" && target != "sandbox" {
        return Err(AppError::invalid_input(format!(
            "Unsupported execution target: {target}"
        )));
    }
    Ok(target)
}

fn resolve_source_cwd(
    workspace_repo_path: &str,
    workspace_worktree_path: Option<&str>,
    input_source_cwd: Option<&str>,
    input_worktree_path: Option<&str>,
) -> Result<(PathBuf, Option<String>), AppError> {
    let explicit_worktree = input_worktree_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let explicit_source = input_source_cwd
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let source = explicit_source
        .clone()
        .or_else(|| explicit_worktree.clone())
        .or_else(|| workspace_worktree_path.map(ToOwned::to_owned))
        .unwrap_or_else(|| workspace_repo_path.to_string());
    let source_path = PathBuf::from(&source);
    if !source_path.is_dir() {
        return Err(AppError::invalid_input(format!(
            "Environment source directory does not exist: {}",
            source_path.display()
        )));
    }

    Ok((
        source_path,
        explicit_worktree.or_else(|| workspace_worktree_path.map(ToOwned::to_owned)),
    ))
}

fn default_environment_name(name: Option<String>, branch: Option<&str>, backend: &str) -> String {
    name.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| match branch {
            Some(branch) if !branch.trim().is_empty() => format!("{branch} environment"),
            _ => format!("{} environment", backend.replace('_', " ")),
        })
}

fn create_khadim_backend_session(state: &Arc<AppState>, environment: &Environment) -> String {
    state.khadim.create_session(
        environment.workspace_id.clone(),
        PathBuf::from(&environment.effective_cwd),
        PathBuf::from(&environment.source_cwd),
        ExecutionTarget::from_str(&environment.execution_target),
        environment.sandbox_id.clone(),
    )
}

#[tauri::command]
pub(crate) fn list_environments(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<Environment>, AppError> {
    state.db.list_environments(&workspace_id)
}

#[tauri::command]
pub(crate) fn get_environment(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Environment, AppError> {
    state.db.get_environment(&id)
}

#[tauri::command]
pub(crate) fn create_environment(
    state: State<'_, Arc<AppState>>,
    input: CreateEnvironmentInput,
) -> Result<Environment, AppError> {
    let workspace = state.db.get_workspace(&input.workspace_id)?;
    let backend = input.backend.unwrap_or_else(|| workspace.backend.clone());
    let execution_target = normalize_execution_target(input.execution_target)?;
    let branch = input
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| workspace.branch.clone());
    let (source_cwd, worktree_path) = resolve_source_cwd(
        &workspace.repo_path,
        workspace.worktree_path.as_deref(),
        input.source_cwd.as_deref(),
        input.worktree_path.as_deref(),
    )?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let name = default_environment_name(input.name, branch.as_deref(), &backend);

    let (sandbox_id, sandbox_root_path, effective_cwd) = if execution_target == "sandbox" {
        let sandbox_id = format!("env-{id}");
        let sandbox_info = sandbox::ensure_sandbox_root(&sandbox_id, None, &source_cwd)?;
        (
            Some(sandbox_info.id),
            Some(sandbox_info.root.clone()),
            sandbox_info.root,
        )
    } else {
        (None, None, source_cwd.to_string_lossy().to_string())
    };

    let environment = Environment {
        id,
        workspace_id: workspace.id,
        name,
        backend,
        execution_target,
        source_cwd: source_cwd.to_string_lossy().to_string(),
        effective_cwd,
        branch,
        worktree_path,
        sandbox_id,
        sandbox_root_path,
        created_at: now.clone(),
        updated_at: now.clone(),
        last_used_at: now,
    };

    state.db.create_environment(&environment)?;
    Ok(environment)
}

#[tauri::command]
pub(crate) fn ensure_default_environment(
    state: State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Environment, AppError> {
    let existing = state.db.list_environments(&workspace_id)?;
    if let Some(environment) = existing.into_iter().next() {
        return Ok(environment);
    }

    create_environment(
        state,
        CreateEnvironmentInput {
            workspace_id,
            name: Some("Default environment".to_string()),
            backend: None,
            execution_target: None,
            source_cwd: None,
            branch: None,
            worktree_path: None,
        },
    )
}

#[tauri::command]
pub(crate) fn delete_environment(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let environment = state.db.get_environment(&id)?;
    if let Some(ref sandbox_root) = environment.sandbox_root_path {
        let sandbox_path = std::path::Path::new(sandbox_root);
        if sandbox_path.exists() {
            let _ = std::fs::remove_dir_all(sandbox_path);
        }
    }
    state.db.delete_environment(&id)
}

#[tauri::command]
pub(crate) fn list_runtime_sessions(
    state: State<'_, Arc<AppState>>,
    environment_id: String,
) -> Result<Vec<RuntimeSession>, AppError> {
    state.db.list_runtime_sessions(&environment_id)
}

#[tauri::command]
pub(crate) fn get_runtime_session(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<RuntimeSession, AppError> {
    state.db.get_runtime_session(&id)
}

#[tauri::command]
pub(crate) fn create_runtime_session(
    state: State<'_, Arc<AppState>>,
    input: CreateRuntimeSessionInput,
) -> Result<RuntimeSession, AppError> {
    let environment = state.db.get_environment(&input.environment_id)?;
    let now = chrono::Utc::now().to_rfc3339();
    let backend_session_id = if environment.backend == "khadim" {
        Some(create_khadim_backend_session(state.inner(), &environment))
    } else {
        None
    };
    let backend_session_cwd = backend_session_id
        .as_ref()
        .map(|_| environment.effective_cwd.clone());
    let session = RuntimeSession {
        id: uuid::Uuid::new_v4().to_string(),
        environment_id: environment.id.clone(),
        backend: environment.backend.clone(),
        backend_session_id,
        backend_session_cwd,
        shared: input.shared.unwrap_or(false),
        status: input.status.unwrap_or_else(|| "idle".to_string()),
        created_at: now.clone(),
        updated_at: now.clone(),
        last_active_at: now,
    };

    state.db.create_runtime_session(&session)?;
    state
        .db
        .touch_environment(&environment.id, Some(&environment.effective_cwd))?;
    Ok(session)
}

#[tauri::command]
pub(crate) fn delete_runtime_session(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_runtime_session(&id)
}
