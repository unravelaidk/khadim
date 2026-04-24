use crate::db::{AgentHealthSnapshot, AgentSchedule, Database, ManagedAgent, RunEvent};
use crate::error::AppError;
use serde_json::json;
use std::sync::Arc;

const SCHEDULE_MISS_GRACE_SECONDS: i64 = 120;

pub struct HealthService {
    db: Arc<Database>,
}

impl HealthService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn refresh_agent(&self, agent: &ManagedAgent) -> Result<AgentHealthSnapshot, AppError> {
        let runs = self.db.list_agent_runs()?;
        let recent_runs: Vec<_> = runs
            .into_iter()
            .filter(|run| run.agent_id.as_deref() == Some(agent.id.as_str()))
            .take(10)
            .collect();
        let schedules = self.db.list_agent_schedules()?;
        let schedule = schedules
            .into_iter()
            .find(|schedule| schedule.agent_id == agent.id);

        let failure_streak = recent_runs
            .iter()
            .take_while(|run| run.status == "failed")
            .count() as i64;
        let last_run_status = recent_runs.first().map(|run| run.status.clone());
        let queued_failures = schedule
            .as_ref()
            .and_then(|s| s.last_outcome.clone())
            .filter(|outcome| outcome == "failed_to_start" || outcome == "missing_queue");
        let missed_schedule = schedule
            .as_ref()
            .and_then(|schedule| detect_missed_schedule(schedule));

        if let Some((schedule, overdue_seconds)) = missed_schedule.as_ref() {
            self.record_schedule_miss_event(agent, schedule, *overdue_seconds)?;
        }

        let (status, reason) = if agent.status != "active" {
            (
                "paused".to_string(),
                Some("Agent is not active".to_string()),
            )
        } else if let Some((_, overdue_seconds)) = missed_schedule.as_ref() {
            (
                "degraded".to_string(),
                Some(format!("Scheduled run overdue by {}s", overdue_seconds)),
            )
        } else if queued_failures.is_some() {
            ("blocked".to_string(), queued_failures)
        } else if failure_streak >= 3 {
            (
                "failing".to_string(),
                Some(format!("{} consecutive failed runs", failure_streak)),
            )
        } else if matches!(last_run_status.as_deref(), Some("failed")) {
            (
                "degraded".to_string(),
                Some("Latest run failed".to_string()),
            )
        } else if matches!(last_run_status.as_deref(), Some("completed")) {
            (
                "healthy".to_string(),
                Some("Latest run completed".to_string()),
            )
        } else {
            (
                "unknown".to_string(),
                Some("No recent completed runs".to_string()),
            )
        };

        let snapshot = AgentHealthSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: agent.id.clone(),
            status,
            reason,
            metrics_json: json!({
                "recent_run_count": recent_runs.len(),
                "failure_streak": failure_streak,
                "last_run_status": last_run_status,
                "schedule_last_outcome": schedule.as_ref().and_then(|s| s.last_outcome.clone()),
                "schedule_next_run_at": schedule.as_ref().and_then(|s| s.next_run_at.clone()),
                "schedule_overdue_seconds": missed_schedule.as_ref().map(|(_, overdue_seconds)| *overdue_seconds),
            })
            .to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        self.db.create_agent_health_snapshot(&snapshot)?;
        Ok(snapshot)
    }

    fn record_schedule_miss_event(
        &self,
        agent: &ManagedAgent,
        schedule: &AgentSchedule,
        overdue_seconds: i64,
    ) -> Result<(), AppError> {
        let synthetic_run_id = format!("agent:{}", agent.id);
        let next_run_at = match schedule.next_run_at.as_deref() {
            Some(value) => value,
            None => return Ok(()),
        };

        let already_recorded = self
            .db
            .list_run_events(&synthetic_run_id)?
            .into_iter()
            .rev()
            .any(|event| {
                event.event_type == "schedule_missed" && event_matches_next_run(&event, next_run_at)
            });
        if already_recorded {
            return Ok(());
        }

        let sequence_number = self.db.list_run_events(&synthetic_run_id)?.len() as i64 + 1;
        self.db.create_run_event(&RunEvent {
            id: uuid::Uuid::new_v4().to_string(),
            run_id: synthetic_run_id,
            sequence_number,
            event_type: "schedule_missed".to_string(),
            source: "scheduler".to_string(),
            title: Some("Scheduled run overdue".to_string()),
            content: Some(format!("{} is overdue by {}s", agent.name, overdue_seconds)),
            status: Some("overdue".to_string()),
            tool_name: None,
            metadata_json: json!({
                "schedule_id": schedule.id,
                "kind": schedule.kind,
                "next_run_at": next_run_at,
                "overdue_seconds": overdue_seconds,
            })
            .to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }
}

fn detect_missed_schedule(schedule: &AgentSchedule) -> Option<(AgentSchedule, i64)> {
    if schedule.kind != "cron" || schedule.is_paused {
        return None;
    }
    let next_run_at = schedule.next_run_at.as_deref()?;
    let next_run = chrono::DateTime::parse_from_rfc3339(next_run_at)
        .ok()?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
    let overdue_seconds = (now - next_run).num_seconds();
    (overdue_seconds > SCHEDULE_MISS_GRACE_SECONDS).then_some((schedule.clone(), overdue_seconds))
}

fn event_matches_next_run(event: &RunEvent, next_run_at: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(&event.metadata_json)
        .ok()
        .and_then(|value| {
            value
                .get("next_run_at")
                .and_then(|v| v.as_str())
                .map(|v| v == next_run_at)
        })
        .unwrap_or(false)
}
