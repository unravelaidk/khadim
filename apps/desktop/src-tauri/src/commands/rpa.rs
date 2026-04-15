use crate::agent_runner::helpers::now;
use crate::db::{
    AgentRun, AgentRunTurn, CredentialRecord, EnvironmentProfile, ManagedAgent, MemoryEntry,
    MemoryStore,
};
use crate::error::AppError;
use crate::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

fn validate_runner_type(value: &str) -> Result<(), AppError> {
    match value {
        "local" | "docker" | "cloud" => Ok(()),
        _ => Err(AppError::invalid_input(format!(
            "Unsupported runner type: {value}"
        ))),
    }
}

fn validate_harness(value: &str) -> Result<(), AppError> {
    match value {
        "khadim" | "opencode" | "claude_code" | "docker" => Ok(()),
        _ => Err(AppError::invalid_input(format!(
            "Unsupported agent harness: {value}"
        ))),
    }
}

fn validate_memory_scope_type(value: &str) -> Result<(), AppError> {
    match value {
        "chat" | "agent" | "shared" => Ok(()),
        _ => Err(AppError::invalid_input(format!(
            "Unsupported memory scope type: {value}"
        ))),
    }
}

fn validate_chat_read_access(value: &str) -> Result<(), AppError> {
    match value {
        "none" | "read" => Ok(()),
        _ => Err(AppError::invalid_input(format!(
            "Unsupported chat read access policy: {value}"
        ))),
    }
}

#[derive(Deserialize)]
pub(crate) struct UpsertManagedAgentInput {
    name: String,
    description: String,
    instructions: String,
    tools: Vec<String>,
    trigger_type: String,
    trigger_config: Option<String>,
    approval_mode: String,
    runner_type: String,
    harness: Option<String>,
    status: Option<String>,
    model_id: Option<String>,
    environment_id: Option<String>,
    max_turns: i64,
    max_tokens: i64,
    variables: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
pub(crate) struct UpsertEnvironmentInput {
    name: String,
    description: String,
    variables: Option<HashMap<String, String>>,
    credential_ids: Vec<String>,
    runner_type: String,
    docker_image: Option<String>,
    is_default: bool,
}

#[derive(Deserialize)]
pub(crate) struct UpsertCredentialInput {
    name: String,
    credential_type: String,
    service: Option<String>,
    metadata: Option<HashMap<String, String>>,
    secret_value: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UpsertMemoryStoreInput {
    workspace_id: Option<String>,
    scope_type: Option<String>,
    name: String,
    description: String,
    chat_read_access: Option<String>,
    linked_agent_ids: Option<Vec<String>>,
    primary_for_agent_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct CreateMemoryEntryInput {
    store_id: String,
    key: String,
    content: String,
    kind: Option<String>,
    source_session_id: Option<String>,
    source_conversation_id: Option<String>,
    source_message_id: Option<String>,
    confidence: Option<f64>,
    is_pinned: Option<bool>,
}

#[tauri::command]
pub(crate) fn list_managed_agents(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ManagedAgent>, AppError> {
    state.db.list_managed_agents()
}

#[tauri::command]
pub(crate) fn create_managed_agent(
    state: State<'_, Arc<AppState>>,
    input: UpsertManagedAgentInput,
) -> Result<ManagedAgent, AppError> {
    validate_runner_type(&input.runner_type)?;
    let harness = input.harness.unwrap_or_else(|| "khadim".to_string());
    validate_harness(&harness)?;

    let timestamp = now();
    let agent = ManagedAgent {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        instructions: input.instructions.trim().to_string(),
        tools: input.tools,
        trigger_type: input.trigger_type,
        trigger_config: input.trigger_config.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        approval_mode: input.approval_mode,
        runner_type: input.runner_type,
        harness,
        status: input.status.unwrap_or_else(|| "inactive".to_string()),
        model_id: input.model_id,
        environment_id: input.environment_id,
        max_turns: input.max_turns,
        max_tokens: input.max_tokens,
        variables: input.variables.unwrap_or_default(),
        version: 1,
        total_sessions: 0,
        success_rate: 0.0,
        last_run_at: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state.db.create_managed_agent(&agent)?;
    Ok(agent)
}

#[tauri::command]
pub(crate) fn update_managed_agent(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpsertManagedAgentInput,
) -> Result<ManagedAgent, AppError> {
    validate_runner_type(&input.runner_type)?;
    let harness = input.harness.unwrap_or_else(|| "khadim".to_string());
    validate_harness(&harness)?;

    let existing = state
        .db
        .list_managed_agents()?
        .into_iter()
        .find(|agent| agent.id == id)
        .ok_or_else(|| AppError::not_found(format!("Managed agent {id} not found")))?;
    let updated = ManagedAgent {
        id,
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        instructions: input.instructions.trim().to_string(),
        tools: input.tools,
        trigger_type: input.trigger_type,
        trigger_config: input.trigger_config.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        approval_mode: input.approval_mode,
        runner_type: input.runner_type,
        harness,
        status: input.status.unwrap_or(existing.status.clone()),
        model_id: input.model_id,
        environment_id: input.environment_id,
        max_turns: input.max_turns,
        max_tokens: input.max_tokens,
        variables: input.variables.unwrap_or_default(),
        version: existing.version + 1,
        total_sessions: existing.total_sessions,
        success_rate: existing.success_rate,
        last_run_at: existing.last_run_at,
        created_at: existing.created_at,
        updated_at: now(),
    };
    state.db.update_managed_agent(&updated)?;
    Ok(updated)
}

#[tauri::command]
pub(crate) fn delete_managed_agent(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_managed_agent(&id)
}

#[tauri::command]
pub(crate) fn list_environments(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<EnvironmentProfile>, AppError> {
    state.db.list_environments()
}

#[tauri::command]
pub(crate) fn create_environment(
    state: State<'_, Arc<AppState>>,
    input: UpsertEnvironmentInput,
) -> Result<EnvironmentProfile, AppError> {
    validate_runner_type(&input.runner_type)?;
    let timestamp = now();
    let environment = EnvironmentProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        variables: input.variables.unwrap_or_default(),
        credential_ids: input.credential_ids,
        runner_type: input.runner_type,
        docker_image: input.docker_image.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        is_default: input.is_default,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state.db.create_environment(&environment)?;
    Ok(environment)
}

#[tauri::command]
pub(crate) fn update_environment(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpsertEnvironmentInput,
) -> Result<EnvironmentProfile, AppError> {
    validate_runner_type(&input.runner_type)?;
    let existing = state
        .db
        .list_environments()?
        .into_iter()
        .find(|environment| environment.id == id)
        .ok_or_else(|| AppError::not_found(format!("Environment {id} not found")))?;
    let environment = EnvironmentProfile {
        id,
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        variables: input.variables.unwrap_or_default(),
        credential_ids: input.credential_ids,
        runner_type: input.runner_type,
        docker_image: input.docker_image.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        is_default: input.is_default,
        created_at: existing.created_at,
        updated_at: now(),
    };
    state.db.update_environment(&environment)?;
    Ok(environment)
}

#[tauri::command]
pub(crate) fn delete_environment(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_environment(&id)
}

#[tauri::command]
pub(crate) fn list_credentials(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CredentialRecord>, AppError> {
    state.db.list_credentials()
}

#[tauri::command]
pub(crate) fn create_credential(
    state: State<'_, Arc<AppState>>,
    input: UpsertCredentialInput,
) -> Result<CredentialRecord, AppError> {
    let timestamp = now();
    let credential = CredentialRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        credential_type: input.credential_type,
        service: input.service.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        metadata: input.metadata.unwrap_or_default(),
        has_secret: input
            .secret_value
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
        last_used_at: None,
        used_by_agents: Vec::new(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    let secret = input
        .secret_value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    state.db.create_credential(&credential, secret)?;
    Ok(credential)
}

#[tauri::command]
pub(crate) fn update_credential(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpsertCredentialInput,
) -> Result<CredentialRecord, AppError> {
    let existing = state
        .db
        .list_credentials()?
        .into_iter()
        .find(|credential| credential.id == id)
        .ok_or_else(|| AppError::not_found(format!("Credential {id} not found")))?;
    let secret = input
        .secret_value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let credential = CredentialRecord {
        id,
        name: input.name.trim().to_string(),
        credential_type: input.credential_type,
        service: input.service.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        metadata: input.metadata.unwrap_or_default(),
        has_secret: secret.is_some() || existing.has_secret,
        last_used_at: existing.last_used_at,
        used_by_agents: existing.used_by_agents,
        created_at: existing.created_at,
        updated_at: now(),
    };
    state.db.update_credential(&credential, secret)?;
    Ok(credential)
}

#[tauri::command]
pub(crate) fn delete_credential(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_credential(&id)
}

#[tauri::command]
pub(crate) fn list_memory_stores(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
) -> Result<Vec<MemoryStore>, AppError> {
    state.db.list_memory_stores(workspace_id.as_deref())
}

#[tauri::command]
pub(crate) fn list_agent_memory_stores(
    state: State<'_, Arc<AppState>>,
    agent_id: String,
) -> Result<Vec<MemoryStore>, AppError> {
    state.db.list_agent_memory_stores(&agent_id)
}

#[tauri::command]
pub(crate) fn ensure_agent_memory_store(
    state: State<'_, Arc<AppState>>,
    agent_id: String,
    agent_name: String,
) -> Result<MemoryStore, AppError> {
    state.db.ensure_agent_memory_store(&agent_id, &agent_name)
}

#[tauri::command]
pub(crate) fn get_or_create_chat_memory_store(
    state: State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
) -> Result<MemoryStore, AppError> {
    state.db.get_or_create_chat_memory_store(workspace_id.as_deref())
}

#[tauri::command]
pub(crate) fn create_memory_store(
    state: State<'_, Arc<AppState>>,
    input: UpsertMemoryStoreInput,
) -> Result<MemoryStore, AppError> {
    let scope_type = input.scope_type.unwrap_or_else(|| "shared".to_string());
    validate_memory_scope_type(&scope_type)?;
    let chat_read_access = input.chat_read_access.unwrap_or_else(|| "none".to_string());
    validate_chat_read_access(&chat_read_access)?;
    let timestamp = now();
    let store = MemoryStore {
        id: uuid::Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id,
        scope_type,
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        chat_read_access,
        linked_agent_ids: input.linked_agent_ids.unwrap_or_default(),
        linked_agent_names: Vec::new(),
        primary_for_agent_ids: input.primary_for_agent_ids.unwrap_or_default(),
        entry_count: 0,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state.db.create_memory_store(&store)?;
    Ok(store)
}

#[tauri::command]
pub(crate) fn update_memory_store(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpsertMemoryStoreInput,
) -> Result<MemoryStore, AppError> {
    let existing = state
        .db
        .list_memory_stores(None)?
        .into_iter()
        .find(|store| store.id == id)
        .ok_or_else(|| AppError::not_found(format!("Memory store {id} not found")))?;
    let scope_type = input.scope_type.unwrap_or(existing.scope_type.clone());
    validate_memory_scope_type(&scope_type)?;
    let chat_read_access = input.chat_read_access.unwrap_or(existing.chat_read_access.clone());
    validate_chat_read_access(&chat_read_access)?;
    let store = MemoryStore {
        id,
        workspace_id: input.workspace_id.or(existing.workspace_id),
        scope_type,
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        chat_read_access,
        linked_agent_ids: input.linked_agent_ids.unwrap_or(existing.linked_agent_ids),
        linked_agent_names: existing.linked_agent_names,
        primary_for_agent_ids: input.primary_for_agent_ids.unwrap_or(existing.primary_for_agent_ids),
        entry_count: existing.entry_count,
        created_at: existing.created_at,
        updated_at: now(),
    };
    state.db.update_memory_store(&store)?;
    Ok(store)
}

#[tauri::command]
pub(crate) fn delete_memory_store(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_memory_store(&id)
}

#[tauri::command]
pub(crate) fn link_memory_store_to_agent(
    state: State<'_, Arc<AppState>>,
    store_id: String,
    agent_id: String,
    is_primary_write_target: Option<bool>,
) -> Result<(), AppError> {
    state.db.link_memory_store_to_agent(&store_id, &agent_id, is_primary_write_target.unwrap_or(false))
}

#[tauri::command]
pub(crate) fn unlink_memory_store_from_agent(
    state: State<'_, Arc<AppState>>,
    store_id: String,
    agent_id: String,
) -> Result<(), AppError> {
    state.db.unlink_memory_store_from_agent(&store_id, &agent_id)
}

#[tauri::command]
pub(crate) fn set_agent_primary_memory_store(
    state: State<'_, Arc<AppState>>,
    store_id: String,
    agent_id: String,
) -> Result<(), AppError> {
    state.db.set_agent_primary_memory_store(&store_id, &agent_id)
}

#[tauri::command]
pub(crate) fn list_memory_entries(
    state: State<'_, Arc<AppState>>,
    store_id: String,
) -> Result<Vec<MemoryEntry>, AppError> {
    state.db.list_memory_entries(&store_id)
}

#[tauri::command]
pub(crate) fn create_memory_entry(
    state: State<'_, Arc<AppState>>,
    input: CreateMemoryEntryInput,
) -> Result<MemoryEntry, AppError> {
    let timestamp = now();
    let entry = MemoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        store_id: input.store_id,
        key: input.key.trim().to_string(),
        content: input.content.trim().to_string(),
        kind: input.kind.unwrap_or_else(|| "fact".to_string()),
        source_session_id: input.source_session_id,
        source_conversation_id: input.source_conversation_id,
        source_message_id: input.source_message_id,
        confidence: input.confidence.unwrap_or(1.0),
        recall_count: 0,
        last_recalled_at: None,
        is_pinned: input.is_pinned.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state.db.create_memory_entry(&entry)?;
    Ok(entry)
}

#[tauri::command]
pub(crate) fn update_memory_entry(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: CreateMemoryEntryInput,
) -> Result<MemoryEntry, AppError> {
    let existing = state
        .db
        .list_memory_entries(&input.store_id)?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| AppError::not_found(format!("Memory entry {id} not found")))?;

    let entry = MemoryEntry {
        id,
        store_id: input.store_id,
        key: input.key.trim().to_string(),
        content: input.content.trim().to_string(),
        kind: input.kind.unwrap_or(existing.kind),
        source_session_id: input.source_session_id.or(existing.source_session_id),
        source_conversation_id: input.source_conversation_id.or(existing.source_conversation_id),
        source_message_id: input.source_message_id.or(existing.source_message_id),
        confidence: input.confidence.unwrap_or(existing.confidence),
        recall_count: existing.recall_count,
        last_recalled_at: existing.last_recalled_at,
        is_pinned: input.is_pinned.unwrap_or(existing.is_pinned),
        created_at: existing.created_at,
        updated_at: now(),
    };
    state.db.update_memory_entry(&entry)?;
    Ok(entry)
}

#[tauri::command]
pub(crate) fn delete_memory_entry(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    state.db.delete_memory_entry(&id)
}

#[tauri::command]
pub(crate) fn list_agent_runs(state: State<'_, Arc<AppState>>) -> Result<Vec<AgentRun>, AppError> {
    state.db.list_agent_runs()
}

#[tauri::command]
pub(crate) fn list_agent_run_turns(
    state: State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<Vec<AgentRunTurn>, AppError> {
    state.db.list_agent_run_turns(&run_id)
}

#[tauri::command]
pub(crate) async fn run_managed_agent(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    agent_id: String,
    trigger: Option<String>,
) -> Result<AgentRun, AppError> {
    let agent = state
        .db
        .list_managed_agents()?
        .into_iter()
        .find(|a| a.id == agent_id)
        .ok_or_else(|| AppError::not_found(format!("Managed agent {agent_id} not found")))?;

    let trigger = trigger.unwrap_or_else(|| "manual".to_string());
    let run = crate::agent_runner::create_run_record(&state.db, &agent, &trigger)?;
    let env = crate::agent_runner::resolve_environment(&state.db, &agent)?;

    let run_clone = run.clone();
    let db = Arc::clone(&state.db);
    let runner_type = env.runner_type.clone();

    match runner_type.as_str() {
        "docker" => {
            let agent_clone = agent.clone();
            tokio::spawn(async move {
                crate::agent_runner::docker::execute_docker_run(
                    app,
                    db,
                    agent_clone,
                    run_clone,
                    env,
                )
                .await;
            });
        }
        _ => {
            // "local" or any unrecognized runner defaults to local execution
            let khadim = state.khadim.clone();
            let plugins = state.plugins.clone();
            let skills = state.skills.clone();
            let integrations = state.integrations.clone();
            let agent_clone = agent.clone();
            tokio::spawn(async move {
                crate::agent_runner::local::execute_local_run(
                    app,
                    db,
                    khadim,
                    agent_clone,
                    run_clone,
                    env,
                    plugins,
                    skills,
                    integrations,
                )
                .await;
            });
        }
    }

    Ok(run)
}

#[tauri::command]
pub(crate) async fn check_docker_available() -> Result<bool, AppError> {
    Ok(crate::agent_runner::docker::is_docker_available().await)
}

#[tauri::command]
pub(crate) fn stop_agent_run(
    state: State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<(), AppError> {
    let run = state.db.get_agent_run(&run_id)?;
    if run.status != "running" && run.status != "pending" {
        return Err(AppError::invalid_input(format!(
            "Run {run_id} is not running (status: {})",
            run.status
        )));
    }
    let started = run.started_at.as_deref().unwrap_or("");
    crate::agent_runner::fail_run(&state.db, &run_id, "Aborted by user", started)
}
