use crate::automation::run_service::RunService;
use crate::db::{AgentSchedule, Database, ManagedAgent};
use crate::error::AppError;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio_cron_scheduler::{Job, JobScheduler};

pub struct SchedulerService {
    db: Arc<Database>,
    run_service: Arc<RunService>,
    scheduler: Mutex<Option<Arc<JobScheduler>>>,
    registered_jobs: Mutex<HashMap<String, uuid::Uuid>>,
}

impl SchedulerService {
    pub fn new(db: Arc<Database>, run_service: Arc<RunService>) -> Self {
        Self {
            db,
            run_service,
            scheduler: Mutex::new(None),
            registered_jobs: Mutex::new(HashMap::new()),
        }
    }

    pub async fn start(self: &Arc<Self>, app: tauri::AppHandle) -> Result<(), AppError> {
        let scheduler = Arc::new(JobScheduler::new().await.map_err(|e| AppError::io(e.to_string()))?);
        self.sync_all(app.clone(), Some(Arc::clone(&scheduler))).await?;
        scheduler.start().await.map_err(|e| AppError::io(e.to_string()))?;
        *self.scheduler.lock().await = Some(scheduler);
        Ok(())
    }

    pub async fn sync_agent(&self, app: tauri::AppHandle, agent: &ManagedAgent) -> Result<(), AppError> {
        if let Some(scheduler) = self.scheduler.lock().await.clone() {
            self.unregister_job(&scheduler, &agent.id).await?;
            self.sync_agent_with_scheduler(app, scheduler, agent).await?;
        }
        Ok(())
    }

    pub async fn remove_agent(&self, agent_id: &str) -> Result<(), AppError> {
        self.db.delete_agent_schedule_by_agent_id(agent_id)?;
        if let Some(scheduler) = self.scheduler.lock().await.clone() {
            self.unregister_job(&scheduler, agent_id).await?;
        }
        Ok(())
    }

    async fn sync_all(&self, app: tauri::AppHandle, scheduler: Option<Arc<JobScheduler>>) -> Result<(), AppError> {
        let scheduler = if let Some(scheduler) = scheduler {
            scheduler
        } else if let Some(scheduler) = self.scheduler.lock().await.clone() {
            scheduler
        } else {
            return Ok(());
        };

        for agent in self.db.list_managed_agents()? {
            self.sync_agent_with_scheduler(app.clone(), Arc::clone(&scheduler), &agent).await?;
            if let Some(state) = app.try_state::<Arc<crate::AppState>>() {
                let _ = state.health_service.refresh_agent(&agent);
            }
        }
        Ok(())
    }

    async fn sync_agent_with_scheduler(&self, app: tauri::AppHandle, scheduler: Arc<JobScheduler>, agent: &ManagedAgent) -> Result<(), AppError> {
        let maybe_schedule = self.derive_schedule(agent)?;
        if let Some(schedule) = maybe_schedule {
            self.db.upsert_agent_schedule(&schedule)?;

            let cron = schedule.cron_expr.clone().ok_or_else(|| AppError::invalid_input("Scheduled agent missing cron expression"))?;
            let agent_id = agent.id.clone();
            let run_service = Arc::clone(&self.run_service);
            let app_handle = app.clone();
            let db = Arc::clone(&self.db);
            let schedule_id = schedule.id.clone();
            let schedule_id_for_job = schedule_id.clone();
            let schedule_kind = schedule.kind.clone();
            let queue_id = extract_queue_id(agent.trigger_config.as_deref())?;

            let job = Job::new_async(cron.as_str(), move |job_id, mut lock| {
                let run_service = Arc::clone(&run_service);
                let app_handle = app_handle.clone();
                let agent_id = agent_id.clone();
                let db = Arc::clone(&db);
                let schedule_id = schedule_id_for_job.clone();
                let schedule_kind = schedule_kind.clone();
                let queue_id = queue_id.clone();
                let lookup_agent_id = agent_id.clone();
                let health_app_handle = app_handle.clone();
                Box::pin(async move {
                    let next_tick = lock.next_tick_for_job(job_id).await.ok().flatten().map(|dt| dt.to_rfc3339());
                    let now = chrono::Utc::now().to_rfc3339();
                    let outcome = match schedule_kind.as_str() {
                        "event_queue" => match queue_id {
                            Some(queue_id) => match run_service.start_next_queued_run(app_handle.clone(), agent_id.clone(), queue_id).await {
                                Ok(Some(_)) => "started",
                                Ok(None) => "idle",
                                Err(error) => {
                                    log::error!("Failed queued run for {}: {}", schedule_id, error.message);
                                    "failed_to_start"
                                }
                            },
                            None => "missing_queue",
                        },
                        _ => match run_service.start_agent_run(app_handle.clone(), agent_id.clone(), Some("scheduled".to_string())).await {
                            Ok(_) => "started",
                            Err(error) => {
                                log::error!("Failed scheduled run for {}: {}", schedule_id, error.message);
                                "failed_to_start"
                            }
                        },
                    };
                    let _ = db.update_agent_schedule_runtime(&schedule_id, next_tick.as_deref(), Some(&now), Some(outcome), &now);
                    if let Some(state) = health_app_handle.try_state::<Arc<crate::AppState>>() {
                        if let Ok(agent) = state
                            .db
                            .list_managed_agents()
                            .and_then(|agents| {
                                agents
                                    .into_iter()
                                    .find(|agent| agent.id == lookup_agent_id)
                                    .ok_or_else(|| crate::error::AppError::not_found("Agent not found"))
                            })
                        {
                            let _ = state.health_service.refresh_agent(&agent);
                        }
                    }
                })
            })
            .map_err(|e| AppError::invalid_input(format!("Invalid cron expression for agent {}: {e}", agent.name)))?;

            let job_id = job.guid();
            scheduler.add(job).await.map_err(|e| AppError::io(e.to_string()))?;
            self.registered_jobs.lock().await.insert(agent.id.clone(), job_id);
        } else {
            self.db.delete_agent_schedule_by_agent_id(&agent.id)?;
        }
        if let Some(state) = app.try_state::<Arc<crate::AppState>>() {
            let _ = state.health_service.refresh_agent(agent);
        }
        Ok(())
    }

    async fn unregister_job(&self, scheduler: &Arc<JobScheduler>, agent_id: &str) -> Result<(), AppError> {
        if let Some(job_id) = self.registered_jobs.lock().await.remove(agent_id) {
            scheduler.remove(&job_id).await.map_err(|e| AppError::io(e.to_string()))?;
        }
        Ok(())
    }

    fn derive_schedule(&self, agent: &ManagedAgent) -> Result<Option<AgentSchedule>, AppError> {
        if agent.status != "active" {
            return Ok(None);
        }

        let existing = self
            .db
            .list_agent_schedules()?
            .into_iter()
            .find(|schedule| schedule.agent_id == agent.id);
        let timestamp = chrono::Utc::now().to_rfc3339();

        if agent.trigger_type == "schedule" {
            let cron_expr = extract_cron_expr(agent.trigger_config.as_deref())?;
            return Ok(Some(AgentSchedule {
                id: existing.as_ref().map(|schedule| schedule.id.clone()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                agent_id: agent.id.clone(),
                kind: "cron".to_string(),
                cron_expr: Some(cron_expr),
                is_paused: false,
                next_run_at: existing.as_ref().and_then(|schedule| schedule.next_run_at.clone()),
                last_run_at: existing.as_ref().and_then(|schedule| schedule.last_run_at.clone()),
                last_outcome: existing.as_ref().and_then(|schedule| schedule.last_outcome.clone()),
                created_at: existing.as_ref().map(|schedule| schedule.created_at.clone()).unwrap_or_else(|| timestamp.clone()),
                updated_at: timestamp,
            }));
        }

        if agent.trigger_type == "event" {
            let cron_expr = extract_event_poll_cron(agent.trigger_config.as_deref())?;
            return Ok(Some(AgentSchedule {
                id: existing.as_ref().map(|schedule| schedule.id.clone()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                agent_id: agent.id.clone(),
                kind: "event_queue".to_string(),
                cron_expr: Some(cron_expr),
                is_paused: false,
                next_run_at: existing.as_ref().and_then(|schedule| schedule.next_run_at.clone()),
                last_run_at: existing.as_ref().and_then(|schedule| schedule.last_run_at.clone()),
                last_outcome: existing.as_ref().and_then(|schedule| schedule.last_outcome.clone()),
                created_at: existing.as_ref().map(|schedule| schedule.created_at.clone()).unwrap_or_else(|| timestamp.clone()),
                updated_at: timestamp,
            }));
        }

        Ok(None)
    }
}

fn extract_cron_expr(trigger_config: Option<&str>) -> Result<String, AppError> {
    let raw = trigger_config.unwrap_or_default().trim();
    if raw.is_empty() {
        return Err(AppError::invalid_input("Scheduled trigger requires a cron expression"));
    }

    if raw.starts_with('{') {
        let value: serde_json::Value = serde_json::from_str(raw)
            .map_err(|e| AppError::invalid_input(format!("Invalid schedule JSON: {e}")))?;
        if let Some(cron) = value.get("cron").and_then(|v| v.as_str()) {
            return Ok(cron.trim().to_string());
        }
        return Err(AppError::invalid_input("Schedule JSON is missing a cron field"));
    }

    Ok(raw.to_string())
}

fn extract_event_poll_cron(trigger_config: Option<&str>) -> Result<String, AppError> {
    let value = parse_trigger_config(trigger_config)?;
    Ok(value
        .get("poll_cron")
        .and_then(|v| v.as_str())
        .unwrap_or("0 * * * * *")
        .trim()
        .to_string())
}

fn extract_queue_id(trigger_config: Option<&str>) -> Result<Option<String>, AppError> {
    let value = parse_trigger_config(trigger_config)?;
    Ok(value.get("queue_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
}

fn parse_trigger_config(trigger_config: Option<&str>) -> Result<Value, AppError> {
    let raw = trigger_config.unwrap_or("{}").trim();
    if raw.is_empty() {
        return Ok(Value::Object(Default::default()));
    }
    serde_json::from_str(raw).map_err(|e| AppError::invalid_input(format!("Invalid trigger config JSON: {e}")))
}
