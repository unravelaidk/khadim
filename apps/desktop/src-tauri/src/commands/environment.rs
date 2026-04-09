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
    pub substrate: Option<String>,
    pub wasm_enabled: Option<bool>,
    pub docker_image: Option<String>,
    pub docker_workdir: Option<String>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<i64>,
    pub ssh_user: Option<String>,
    pub ssh_path: Option<String>,
    pub source_cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateEnvironmentInput {
    pub id: String,
    pub name: Option<String>,
    pub backend: Option<String>,
    pub substrate: Option<String>,
    pub wasm_enabled: Option<bool>,
    pub docker_image: Option<String>,
    pub docker_workdir: Option<String>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<i64>,
    pub ssh_user: Option<String>,
    pub ssh_path: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateRuntimeSessionInput {
    pub environment_id: String,
    pub source_cwd: Option<String>,
    pub shared: Option<bool>,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateRuntimeSessionBackendInput {
    pub id: String,
    pub backend_session_id: Option<String>,
    pub backend_session_cwd: Option<String>,
    pub status: Option<String>,
}

fn normalize_environment_substrate(value: Option<String>) -> Result<String, AppError> {
    let substrate = value.unwrap_or_else(|| "local".to_string());
    let normalized = substrate.as_str();
    if normalized != "local" && normalized != "docker" && normalized != "remote" {
        return Err(AppError::invalid_input(format!(
            "Unsupported environment substrate: {substrate}"
        )));
    }
    Ok(normalized.to_string())
}

fn substrate_is_sandboxed(substrate: &str) -> bool {
    substrate != "local"
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn validate_environment_config(
    substrate: &str,
    docker_image: &Option<String>,
    ssh_host: &Option<String>,
    ssh_user: &Option<String>,
) -> Result<(), AppError> {
    if substrate == "docker" && docker_image.is_none() {
        return Err(AppError::invalid_input(
            "Docker environments require an image",
        ));
    }
    if substrate == "remote" && (ssh_host.is_none() || ssh_user.is_none()) {
        return Err(AppError::invalid_input(
            "Remote environments require both SSH host and SSH user",
        ));
    }
    Ok(())
}

fn resolve_source_cwd(
    workspace_repo_path: &str,
    input_source_cwd: Option<&str>,
) -> Result<PathBuf, AppError> {
    let explicit_source = input_source_cwd
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let source = explicit_source.unwrap_or_else(|| workspace_repo_path.to_string());
    let source_path = PathBuf::from(&source);
    if !source_path.is_dir() {
        return Err(AppError::invalid_input(format!(
            "Environment source directory does not exist: {}",
            source_path.display()
        )));
    }

    Ok(source_path)
}

fn default_environment_name(name: Option<String>, substrate: &str, backend: &str) -> String {
    name.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            format!("{} {}", substrate, backend.replace('_', " "))
                .trim()
                .to_string()
                + " environment"
        })
}

fn create_khadim_backend_session(state: &Arc<AppState>, environment: &Environment) -> String {
    state.khadim.create_session(
        environment.workspace_id.clone(),
        PathBuf::from(&environment.effective_cwd),
        PathBuf::from(&environment.source_cwd),
        ExecutionTarget::from_str(&environment.substrate),
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
    let substrate = normalize_environment_substrate(input.substrate)?;
    let wasm_enabled = input.wasm_enabled.unwrap_or(false);
    let docker_image = clean_optional(input.docker_image);
    let docker_workdir = clean_optional(input.docker_workdir);
    let ssh_host = clean_optional(input.ssh_host);
    let ssh_user = clean_optional(input.ssh_user);
    let ssh_path = clean_optional(input.ssh_path);
    validate_environment_config(&substrate, &docker_image, &ssh_host, &ssh_user)?;
    let source_cwd = resolve_source_cwd(&workspace.repo_path, input.source_cwd.as_deref())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let name = default_environment_name(input.name, &substrate, &backend);

    let (sandbox_id, sandbox_root_path, effective_cwd) = if substrate_is_sandboxed(&substrate) {
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
        substrate,
        wasm_enabled,
        docker_image,
        docker_workdir,
        ssh_host,
        ssh_port: input.ssh_port,
        ssh_user,
        ssh_path,
        source_cwd: source_cwd.to_string_lossy().to_string(),
        effective_cwd,
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
            substrate: None,
            wasm_enabled: None,
            docker_image: None,
            docker_workdir: None,
            ssh_host: None,
            ssh_port: None,
            ssh_user: None,
            ssh_path: None,
            source_cwd: None,
        },
    )
}

#[tauri::command]
pub(crate) fn update_environment(
    state: State<'_, Arc<AppState>>,
    input: UpdateEnvironmentInput,
) -> Result<Environment, AppError> {
    let mut environment = state.db.get_environment(&input.id)?;
    let substrate =
        normalize_environment_substrate(input.substrate.or(Some(environment.substrate.clone())))?;
    let backend = input.backend.unwrap_or_else(|| environment.backend.clone());
    let name = input
        .name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| environment.name.clone());
    let wasm_enabled = input.wasm_enabled.unwrap_or(environment.wasm_enabled);
    let docker_image =
        clean_optional(input.docker_image).or_else(|| environment.docker_image.clone());
    let docker_workdir =
        clean_optional(input.docker_workdir).or_else(|| environment.docker_workdir.clone());
    let ssh_host = clean_optional(input.ssh_host).or_else(|| environment.ssh_host.clone());
    let ssh_user = clean_optional(input.ssh_user).or_else(|| environment.ssh_user.clone());
    let ssh_path = clean_optional(input.ssh_path).or_else(|| environment.ssh_path.clone());
    let ssh_port = input.ssh_port.or(environment.ssh_port);
    validate_environment_config(&substrate, &docker_image, &ssh_host, &ssh_user)?;

    if !substrate_is_sandboxed(&substrate) {
        environment.sandbox_id = None;
        environment.sandbox_root_path = None;
    }

    let now = chrono::Utc::now().to_rfc3339();
    environment.name = name;
    environment.backend = backend;
    environment.substrate = substrate;
    environment.wasm_enabled = wasm_enabled;
    environment.docker_image = docker_image;
    environment.docker_workdir = docker_workdir;
    environment.ssh_host = ssh_host;
    environment.ssh_port = ssh_port;
    environment.ssh_user = ssh_user;
    environment.ssh_path = ssh_path;
    environment.updated_at = now.clone();
    environment.last_used_at = now;

    state.db.update_environment(&environment)?;
    state.db.get_environment(&environment.id)
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
    let mut environment = state.db.get_environment(&input.environment_id)?;
    let source_cwd = resolve_source_cwd(
        &state.db.get_workspace(&environment.workspace_id)?.repo_path,
        input
            .source_cwd
            .as_deref()
            .or(Some(environment.source_cwd.as_str())),
    )?;
    if substrate_is_sandboxed(&environment.substrate) && environment.sandbox_root_path.is_none() {
        let sandbox_id = format!("env-{}", environment.id);
        let sandbox_info = sandbox::ensure_sandbox_root(&sandbox_id, None, &source_cwd)?;
        state.db.update_environment_execution_root(
            &environment.id,
            &source_cwd.to_string_lossy(),
            &sandbox_info.root,
            Some(&sandbox_info.id),
            Some(&sandbox_info.root),
        )?;
        environment = state.db.get_environment(&environment.id)?;
    } else if !substrate_is_sandboxed(&environment.substrate) {
        state.db.update_environment_execution_root(
            &environment.id,
            &source_cwd.to_string_lossy(),
            &source_cwd.to_string_lossy(),
            None,
            None,
        )?;
        environment = state.db.get_environment(&environment.id)?;
    }
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

#[tauri::command]
pub(crate) fn update_runtime_session_backend(
    state: State<'_, Arc<AppState>>,
    input: UpdateRuntimeSessionBackendInput,
) -> Result<(), AppError> {
    state.db.update_runtime_session_backend(
        &input.id,
        input.backend_session_id.as_deref(),
        input.backend_session_cwd.as_deref(),
        input.status.as_deref(),
    )
}
