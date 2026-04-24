use crate::agent_runner;
use crate::automation::{ApprovalDecision, ApprovalService};
use crate::automation::BudgetService;
use crate::automation::HealthService;
use crate::automation::{QueueFailureOutcome, QueueService};
use crate::db::{AgentRun, Database, ManagedAgent, RunEvent};
use crate::error::AppError;
use crate::integrations::IntegrationRegistry;
use crate::khadim_agent::KhadimManager;
use crate::plugins::PluginManager;
use crate::skills::SkillManager;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

pub struct RunService {
    db: Arc<Database>,
    khadim: Arc<KhadimManager>,
    plugins: Arc<PluginManager>,
    skills: Arc<SkillManager>,
    integrations: Arc<IntegrationRegistry>,
    budget_service: Arc<BudgetService>,
    queue_service: Arc<QueueService>,
    health_service: Arc<HealthService>,
    approval_service: Arc<ApprovalService>,
    active_runs: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
}

impl RunService {
    pub fn new(
        db: Arc<Database>,
        khadim: Arc<KhadimManager>,
        plugins: Arc<PluginManager>,
        skills: Arc<SkillManager>,
        integrations: Arc<IntegrationRegistry>,
        budget_service: Arc<BudgetService>,
        queue_service: Arc<QueueService>,
        health_service: Arc<HealthService>,
        approval_service: Arc<ApprovalService>,
    ) -> Self {
        Self {
            db,
            khadim,
            plugins,
            skills,
            integrations,
            budget_service,
            queue_service,
            health_service,
            approval_service,
            active_runs: Mutex::new(HashMap::new()),
        }
    }

    pub async fn start_agent_run(
        self: &Arc<Self>,
        app: AppHandle,
        agent_id: String,
        trigger: Option<String>,
    ) -> Result<AgentRun, AppError> {
        let agent = self.find_agent(&agent_id)?;
        let trigger = trigger.unwrap_or_else(|| "manual".to_string());
        let pending_run = agent_runner::create_run_record(&self.db, &agent, &trigger)?;
        match self.approval_service.evaluate_run_start(&agent, &pending_run.id, &trigger)? {
            ApprovalDecision::Approved(request) => {
                self.record_event(
                    &pending_run.id,
                    "approval_resolved",
                    "approval",
                    Some("Run approved"),
                    Some(request.action_title),
                    Some("approved"),
                    None,
                    Some(json!({ "approval_request_id": request.id })),
                )?;
            }
            ApprovalDecision::NotRequired => {}
            ApprovalDecision::Blocked(request) => {
                self.record_event(
                    &pending_run.id,
                    "approval_requested",
                    "approval",
                    Some("Approval required"),
                    Some(request.action_title),
                    Some("pending"),
                    None,
                    Some(json!({ "approval_request_id": request.id })),
                )?;
                self.db.update_agent_run_status(
                    &pending_run.id,
                    "blocked",
                    Some(&chrono::Utc::now().to_rfc3339()),
                    Some(0),
                    Some("approval_required"),
                    Some("Run blocked awaiting approval"),
                    None,
                    None,
                    None,
                )?;
                let _ = self.health_service.refresh_agent(&agent);
                return Err(AppError::invalid_input("Run requires explicit approval before execution"));
            }
        }
        if let Err(error) = self.budget_service.admit_run(&agent) {
            self.record_agent_event(
                &agent,
                "budget_blocked",
                Some("Run blocked by budget"),
                Some(error.message.clone()),
                Some("blocked"),
                Some(json!({ "trigger": trigger })),
            )?;
            let _ = self.health_service.refresh_agent(&agent);
            return Err(error);
        }
        let run = pending_run;
        self.budget_service.record_run_started(&agent, &run.id)?;
        let env = agent_runner::resolve_environment(&self.db, &agent)?;

        self.record_event(
            &run.id,
            "run_created",
            "system",
            Some("Run queued"),
            Some(format!("{} run created", agent.name)),
            Some("pending"),
            None,
            Some(json!({
                "agent_id": agent.id,
                "trigger": trigger,
                "runner_type": env.runner_type,
                "harness": agent.harness,
            })),
        )?;

        let run_clone = run.clone();
        let agent_clone = agent.clone();
        let agent_for_budget = agent.clone();
        let db = Arc::clone(&self.db);
        let khadim = Arc::clone(&self.khadim);
        let plugins = Arc::clone(&self.plugins);
        let skills = Arc::clone(&self.skills);
        let integrations = Arc::clone(&self.integrations);
        let service = Arc::clone(self);
        let runner_type = env.runner_type.clone();
        let run_id = run.id.clone();

        let handle = tokio::spawn(async move {
            match runner_type.as_str() {
                "docker" => {
                    agent_runner::docker::execute_docker_run(
                        app,
                        db,
                        agent_clone,
                        run_clone,
                        env,
                    )
                    .await;
                }
                _ => {
                    agent_runner::local::execute_local_run(
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
                }
            }
            service.finalize_run(&run_id, &agent_for_budget, None);
        });

        self.track_active_run(run.id.clone(), handle);
        Ok(run)
    }

    pub async fn start_next_queued_run(
        self: &Arc<Self>,
        app: AppHandle,
        agent_id: String,
        queue_id: String,
    ) -> Result<Option<AgentRun>, AppError> {
        let agent = self.find_agent(&agent_id)?;
        let pending_run = agent_runner::create_run_record(&self.db, &agent, "queue")?;
        match self.approval_service.evaluate_run_start(&agent, &pending_run.id, "queue")? {
            ApprovalDecision::Approved(request) => {
                self.record_event(
                    &pending_run.id,
                    "approval_resolved",
                    "approval",
                    Some("Queue-backed run approved"),
                    Some(request.action_title),
                    Some("approved"),
                    None,
                    Some(json!({ "approval_request_id": request.id })),
                )?;
            }
            ApprovalDecision::NotRequired => {}
            ApprovalDecision::Blocked(request) => {
                self.record_event(
                    &pending_run.id,
                    "approval_requested",
                    "approval",
                    Some("Approval required for queue-backed run"),
                    Some(request.action_title),
                    Some("pending"),
                    None,
                    Some(json!({ "approval_request_id": request.id, "queue_id": queue_id })),
                )?;
                self.db.update_agent_run_status(
                    &pending_run.id,
                    "blocked",
                    Some(&chrono::Utc::now().to_rfc3339()),
                    Some(0),
                    Some("approval_required"),
                    Some("Queue-backed run blocked awaiting approval"),
                    None,
                    None,
                    None,
                )?;
                let _ = self.health_service.refresh_agent(&agent);
                return Err(AppError::invalid_input("Queue-backed run requires explicit approval before execution"));
            }
        }
        if let Err(error) = self.budget_service.admit_run(&agent) {
            self.record_agent_event(
                &agent,
                "budget_blocked",
                Some("Queue-backed run blocked by budget"),
                Some(error.message.clone()),
                Some("blocked"),
                Some(json!({ "queue_id": queue_id })),
            )?;
            let _ = self.health_service.refresh_agent(&agent);
            return Err(error);
        }
        let placeholder_run = pending_run;
        let claimed = match self.queue_service.claim_next(&queue_id, &placeholder_run.id)? {
            Some(item) => item,
            None => {
                self.db.update_agent_run_status(
                    &placeholder_run.id,
                    "cancelled",
                    Some(&chrono::Utc::now().to_rfc3339()),
                    Some(0),
                    Some("queue_empty"),
                    Some("No queue item available"),
                    None,
                    None,
                    None,
                )?;
                return Ok(None);
            }
        };

        self.record_event(
            &placeholder_run.id,
            "queue_claimed",
            "queue",
            Some("Queue item claimed"),
            Some(claimed.id.clone()),
            Some("claimed"),
            None,
            Some(json!({ "queue_id": queue_id, "queue_item_id": claimed.id })),
        )?;

        self.budget_service.record_run_started(&agent, &placeholder_run.id)?;
        let env = agent_runner::resolve_environment(&self.db, &agent)?;
        let run_clone = placeholder_run.clone();
        let agent_clone = agent.clone();
        let agent_for_budget = agent.clone();
        let db = Arc::clone(&self.db);
        let khadim = Arc::clone(&self.khadim);
        let plugins = Arc::clone(&self.plugins);
        let skills = Arc::clone(&self.skills);
        let integrations = Arc::clone(&self.integrations);
        let service = Arc::clone(self);
        let runner_type = env.runner_type.clone();
        let run_id = placeholder_run.id.clone();
        let queue_item_id = claimed.id.clone();

        let handle = tokio::spawn(async move {
            match runner_type.as_str() {
                "docker" => {
                    agent_runner::docker::execute_docker_run(app, db, agent_clone, run_clone, env).await;
                }
                _ => {
                    agent_runner::local::execute_local_run(app, db, khadim, agent_clone, run_clone, env, plugins, skills, integrations).await;
                }
            }
            service.finalize_run(&run_id, &agent_for_budget, Some(queue_item_id));
        });

        self.track_active_run(placeholder_run.id.clone(), handle);
        Ok(Some(placeholder_run))
    }

    pub fn stop_run(&self, run_id: &str) -> Result<(), AppError> {
        let run = self.db.get_agent_run(run_id)?;
        if run.status != "running" && run.status != "pending" {
            return Err(AppError::invalid_input(format!(
                "Run {run_id} is not running (status: {})",
                run.status
            )));
        }

        if let Some(handle) = self
            .active_runs
            .lock()
            .map_err(|_| AppError::io("Active run registry lock poisoned"))?
            .remove(run_id)
        {
            handle.abort();
        }

        let started = run.started_at.as_deref().unwrap_or("");
        agent_runner::fail_run(&self.db, run_id, "Aborted by user", started)?;
        self.record_event(
            run_id,
            "run_aborted",
            "system",
            Some("Run aborted"),
            Some("Aborted by user".to_string()),
            Some("aborted"),
            None,
            None,
        )?;
        Ok(())
    }

    fn find_agent(&self, agent_id: &str) -> Result<ManagedAgent, AppError> {
        self.db
            .list_managed_agents()?
            .into_iter()
            .find(|agent| agent.id == agent_id)
            .ok_or_else(|| AppError::not_found(format!("Managed agent {agent_id} not found")))
    }

    fn track_active_run(&self, run_id: String, handle: tokio::task::JoinHandle<()>) {
        if let Some(existing) = self
            .active_runs
            .lock()
            .expect("active run registry lock poisoned")
            .insert(run_id, handle)
        {
            existing.abort();
        }
    }

    fn clear_active_run(&self, run_id: &str) {
        if let Ok(mut active) = self.active_runs.lock() {
            active.remove(run_id);
        }
    }

    fn finalize_run(&self, run_id: &str, agent: &ManagedAgent, queue_item_id: Option<String>) {
        if let Some(queue_item_id) = queue_item_id {
            match self.db.get_agent_run(run_id) {
                Ok(run) if run.status == "completed" => {
                    if let Err(error) = self.queue_service.complete(&queue_item_id) {
                        log::warn!("Failed to mark queue item {} completed: {}", queue_item_id, error.message);
                    }
                    let _ = self.record_event(
                        run_id,
                        "queue_completed",
                        "queue",
                        Some("Queue item completed"),
                        Some(queue_item_id),
                        Some("completed"),
                        None,
                        None,
                    );
                }
                Ok(run) => {
                    match self.queue_service.fail(&queue_item_id, run.error_message.as_deref().unwrap_or("Queue-backed run failed")) {
                        Ok(QueueFailureOutcome::Retried(item)) => {
                            let _ = self.record_event(
                                run_id,
                                "queue_retried",
                                "queue",
                                Some("Queue item requeued for retry"),
                                Some(queue_item_id),
                                Some("retrying"),
                                None,
                                Some(json!({
                                    "error": run.error_message,
                                    "ended_reason": run.ended_reason,
                                    "attempt_count": item.attempt_count,
                                    "max_attempts": item.max_attempts,
                                    "visible_at": item.visible_at,
                                })),
                            );
                        }
                        Ok(QueueFailureOutcome::DeadLettered(item)) => {
                            let _ = self.record_event(
                                run_id,
                                "queue_dead_lettered",
                                "queue",
                                Some("Queue item moved to dead letter"),
                                Some(queue_item_id),
                                Some("dead_letter"),
                                None,
                                Some(json!({
                                    "error": run.error_message,
                                    "ended_reason": run.ended_reason,
                                    "attempt_count": item.attempt_count,
                                    "max_attempts": item.max_attempts,
                                    "dead_lettered_at": item.dead_lettered_at,
                                })),
                            );
                        }
                        Err(error) => {
                            log::warn!("Failed to update queue item {} after run failure: {}", queue_item_id, error.message);
                        }
                    }
                }
                Err(error) => {
                    log::warn!("Failed to load run {} during finalization: {}", run_id, error.message);
                }
            }
        }

        if let Err(error) = self.budget_service.record_completed_run(agent, run_id) {
            log::warn!("Failed to record budget ledger for run {}: {}", run_id, error.message);
        }

        if let Ok(run) = self.db.get_agent_run(run_id) {
            let event_type = match run.status.as_str() {
                "completed" => "run_completed",
                "failed" => "run_failed",
                "blocked" => "run_blocked",
                "cancelled" => "run_cancelled",
                _ => "run_finalized",
            };
            let _ = self.record_event(
                run_id,
                event_type,
                "system",
                Some("Run finalized"),
                run.result_summary.clone().or(run.error_message.clone()),
                Some(run.status.as_str()),
                None,
                Some(json!({ "ended_reason": run.ended_reason })),
            );
        }

        let _ = self.health_service.refresh_agent(agent);
        self.clear_active_run(run_id);
    }

    fn record_event(
        &self,
        run_id: &str,
        event_type: &str,
        source: &str,
        title: Option<&str>,
        content: Option<String>,
        status: Option<&str>,
        tool_name: Option<&str>,
        metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        let sequence_number = self.db.list_run_events(run_id)?.len() as i64 + 1;
        let event = RunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            sequence_number,
            event_type: event_type.to_string(),
            source: source.to_string(),
            title: title.map(ToOwned::to_owned),
            content,
            status: status.map(ToOwned::to_owned),
            tool_name: tool_name.map(ToOwned::to_owned),
            metadata_json: metadata.unwrap_or_else(|| json!({})).to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        self.db.create_run_event(&event)
    }

    fn record_agent_event(
        &self,
        agent: &ManagedAgent,
        event_type: &str,
        title: Option<&str>,
        content: Option<String>,
        status: Option<&str>,
        metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        let synthetic_run_id = format!("agent:{}", agent.id);
        self.record_event(&synthetic_run_id, event_type, "system", title, content, status, None, metadata)
    }
}
