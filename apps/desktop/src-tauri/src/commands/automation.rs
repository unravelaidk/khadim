use crate::db::{
    AgentHealthSnapshot, AgentSchedule, ApprovalRequestRecord, ArtifactRecord,
    BudgetLedgerEntry, QueueDefinition, QueueItem, RunEvent,
};
use crate::error::AppError;
use crate::AppState;
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

#[derive(Deserialize)]
pub(crate) struct EnqueueQueueItemInput {
    queue_id: String,
    payload_json: String,
    priority: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct EnsureQueueInput {
    name: String,
    kind: String,
    source_config_json: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct DecideApprovalInput {
    approval_id: String,
    decision: String,
    note: Option<String>,
}

#[tauri::command]
pub(crate) fn list_run_events(
    state: State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<Vec<RunEvent>, AppError> {
    state.db.list_run_events(&run_id)
}

#[tauri::command]
pub(crate) fn list_run_artifacts(
    state: State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<Vec<ArtifactRecord>, AppError> {
    state.db.list_artifacts(&run_id)
}

#[tauri::command]
pub(crate) fn list_agent_artifacts(
    state: State<'_, Arc<AppState>>,
    agent_id: String,
) -> Result<Vec<ArtifactRecord>, AppError> {
    state.db.list_agent_artifacts(&agent_id)
}

#[tauri::command]
pub(crate) fn list_agent_health_snapshots(
    state: State<'_, Arc<AppState>>,
    agent_id: String,
) -> Result<Vec<AgentHealthSnapshot>, AppError> {
    state.db.list_agent_health_snapshots(&agent_id)
}

#[tauri::command]
pub(crate) fn refresh_agent_health(
    state: State<'_, Arc<AppState>>,
    agent_id: String,
) -> Result<AgentHealthSnapshot, AppError> {
    let agent = state
        .db
        .list_managed_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
        .ok_or_else(|| AppError::not_found(format!("Managed agent {agent_id} not found")))?;
    state.health_service.refresh_agent(&agent)
}

#[tauri::command]
pub(crate) fn list_approval_requests(
    state: State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<Vec<ApprovalRequestRecord>, AppError> {
    state.db.list_approval_requests(&run_id)
}

#[tauri::command]
pub(crate) fn decide_approval_request(
    state: State<'_, Arc<AppState>>,
    input: DecideApprovalInput,
) -> Result<ApprovalRequestRecord, AppError> {
    let status = match input.decision.as_str() {
        "approve" | "approved" => "approved",
        "deny" | "denied" | "reject" | "rejected" => "denied",
        other => {
            return Err(AppError::invalid_input(format!(
                "Unsupported approval decision: {other}"
            )))
        }
    };
    let resolved_at = chrono::Utc::now().to_rfc3339();
    state.db.update_approval_request_status(
        &input.approval_id,
        status,
        input.note.as_deref(),
        &resolved_at,
    )
}

#[tauri::command]
pub(crate) fn list_budget_ledger(
    state: State<'_, Arc<AppState>>,
    agent_id: Option<String>,
    window_key: Option<String>,
) -> Result<Vec<BudgetLedgerEntry>, AppError> {
    state
        .db
        .list_budget_ledger(agent_id.as_deref(), window_key.as_deref())
}

#[tauri::command]
pub(crate) fn list_agent_schedules(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AgentSchedule>, AppError> {
    state.db.list_agent_schedules()
}

#[tauri::command]
pub(crate) async fn set_agent_schedule_paused(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    agent_id: String,
    is_paused: bool,
) -> Result<Option<AgentSchedule>, AppError> {
    let schedule = state.db.set_agent_schedule_paused(&agent_id, is_paused)?;
    if let Some(agent) = state
        .db
        .list_managed_agents()?
        .into_iter()
        .find(|agent| agent.id == agent_id)
    {
        let scheduler = state.scheduler_service.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = scheduler.sync_agent(app, &agent).await {
                log::error!(
                    "Failed to resync schedule for agent {} after pause toggle: {}",
                    agent.id,
                    error.message
                );
            }
        });
    }
    Ok(schedule)
}

#[tauri::command]
pub(crate) fn list_queues(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<QueueDefinition>, AppError> {
    state.db.list_queues()
}

#[tauri::command]
pub(crate) fn list_queue_items(
    state: State<'_, Arc<AppState>>,
    queue_id: String,
) -> Result<Vec<QueueItem>, AppError> {
    state.db.list_queue_items(&queue_id)
}

#[tauri::command]
pub(crate) fn ensure_queue(
    state: State<'_, Arc<AppState>>,
    input: EnsureQueueInput,
) -> Result<QueueDefinition, AppError> {
    let source_config = input.source_config_json.unwrap_or_else(|| "{}".to_string());
    state
        .queue_service
        .ensure_queue(input.name.trim(), input.kind.trim(), source_config.trim())
}

#[tauri::command]
pub(crate) fn enqueue_queue_item(
    state: State<'_, Arc<AppState>>,
    input: EnqueueQueueItemInput,
) -> Result<QueueItem, AppError> {
    let priority = input.priority.unwrap_or(0);
    state
        .queue_service
        .enqueue(input.queue_id.trim(), input.payload_json.trim(), priority)
}
