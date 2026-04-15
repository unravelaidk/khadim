//! Agent run execution engine.
//!
//! Dispatches a managed agent to the appropriate runner (local or docker)
//! and tracks run lifecycle (pending → running → completed/failed).

pub mod docker;
pub mod helpers;
pub mod local;

use crate::db::{AgentRun, AgentRunTurn, Database, ManagedAgent};
use crate::error::AppError;
use crate::opencode::AgentStreamEvent;
use helpers::credential_env_key;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// Merged environment that a runner receives.
#[derive(Debug, Clone)]
pub struct ResolvedEnvironment {
    pub variables: HashMap<String, String>,
    pub secrets: HashMap<String, String>,
    pub runner_type: String,
    pub docker_image: Option<String>,
}

impl ResolvedEnvironment {
    pub fn local_default() -> Self {
        Self {
            variables: HashMap::new(),
            secrets: HashMap::new(),
            runner_type: "local".to_string(),
            docker_image: None,
        }
    }
}

/// Create a new pending run record for an agent.
pub fn create_run_record(
    db: &Database,
    agent: &ManagedAgent,
    trigger: &str,
) -> Result<AgentRun, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let run = AgentRun {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: Some(agent.id.clone()),
        agent_name: Some(agent.name.clone()),
        automation_id: None,
        environment_id: agent.environment_id.clone(),
        status: "pending".to_string(),
        trigger: trigger.to_string(),
        harness: agent.harness.clone(),
        started_at: Some(now),
        finished_at: None,
        duration_ms: None,
        result_summary: None,
        error_message: None,
        input_tokens: None,
        output_tokens: None,
    };
    db.create_agent_run(&run)?;
    Ok(run)
}

/// Resolve environment variables and secrets for a run.
pub fn resolve_environment(
    db: &Database,
    agent: &ManagedAgent,
) -> Result<ResolvedEnvironment, AppError> {
    let env_profile = match &agent.environment_id {
        Some(id) if !id.is_empty() => {
            db.list_environments()?
                .into_iter()
                .find(|e| e.id == *id)
        }
        _ => None,
    };

    let mut variables = agent.variables.clone();
    let mut secrets = HashMap::new();
    let mut runner_type = agent.runner_type.clone();
    let mut docker_image = None;

    if let Some(profile) = &env_profile {
        // Environment variables overlay agent variables
        for (k, v) in &profile.variables {
            variables.insert(k.clone(), v.clone());
        }
        runner_type = profile.runner_type.clone();
        docker_image = profile.docker_image.clone();

        // Load credential secrets
        for cred_id in &profile.credential_ids {
            if let Ok(creds) = db.list_credentials() {
                if let Some(cred) = creds.iter().find(|c| c.id == *cred_id) {
                    if let Ok(Some(secret_value)) = db.get_credential_secret(&cred.id) {
                        secrets.insert(credential_env_key(&cred.name), secret_value);
                    }
                }
            }
        }
    }

    Ok(ResolvedEnvironment {
        variables,
        secrets,
        runner_type,
        docker_image,
    })
}

/// Append a turn to the run transcript.
pub fn record_turn(
    db: &Database,
    run_id: &str,
    turn_number: i64,
    role: &str,
    tool_name: Option<&str>,
    content: Option<&str>,
    token_input: Option<i64>,
    token_output: Option<i64>,
    duration_ms: Option<i64>,
) -> Result<(), AppError> {
    let turn = AgentRunTurn {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run_id.to_string(),
        turn_number,
        role: role.to_string(),
        tool_name: tool_name.map(String::from),
        content: content.map(String::from),
        token_input,
        token_output,
        duration_ms,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.create_agent_run_turn(&turn)
}

/// Mark a run as completed.
pub fn complete_run(
    db: &Database,
    run_id: &str,
    result_summary: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    started_at: &str,
) -> Result<(), AppError> {
    let now = chrono::Utc::now();
    let started = chrono::DateTime::parse_from_rfc3339(started_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or(now);
    let duration_ms = (now - started).num_milliseconds();

    db.update_agent_run_status(
        run_id,
        "completed",
        Some(&now.to_rfc3339()),
        Some(duration_ms),
        result_summary,
        None,
        input_tokens,
        output_tokens,
    )
}

/// Mark a run as failed.
pub fn fail_run(
    db: &Database,
    run_id: &str,
    error_message: &str,
    started_at: &str,
) -> Result<(), AppError> {
    let now = chrono::Utc::now();
    let started = chrono::DateTime::parse_from_rfc3339(started_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or(now);
    let duration_ms = (now - started).num_milliseconds();

    db.update_agent_run_status(
        run_id,
        "failed",
        Some(&now.to_rfc3339()),
        Some(duration_ms),
        None,
        Some(error_message),
        None,
        None,
    )
}

/// Mark a run as completed and emit the terminal `done` event.
pub fn complete_run_and_emit_done(
    app: &AppHandle,
    db: &Database,
    run_id: &str,
    result_summary: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    started_at: &str,
) {
    let _ = complete_run(
        db,
        run_id,
        result_summary,
        input_tokens,
        output_tokens,
        started_at,
    );
    emit_run_event(app, run_id, "done", None, None);
}

/// Mark a run as failed and emit `error` then `done` events.
pub fn fail_run_with_events(
    app: &AppHandle,
    db: &Database,
    run_id: &str,
    error_message: impl Into<String>,
    started_at: &str,
) {
    let error_message = error_message.into();
    let _ = fail_run(db, run_id, &error_message, started_at);
    emit_run_event(app, run_id, "error", Some(error_message), None);
    emit_run_event(app, run_id, "done", None, None);
}

/// Emit a stream event for a managed agent run.
pub fn emit_run_event(
    app: &AppHandle,
    run_id: &str,
    event_type: &str,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
) {
    let _ = app.emit(
        "agent-stream",
        &AgentStreamEvent {
            workspace_id: format!("run:{run_id}"),
            session_id: run_id.to_string(),
            event_type: event_type.to_string(),
            content,
            metadata,
        },
    );
}
