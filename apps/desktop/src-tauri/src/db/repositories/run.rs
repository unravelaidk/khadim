use crate::db::entities::{agent_run_turns, agent_runs, artifacts, budget_ledger, managed_agents, run_events};
use crate::db::{AgentRun, AgentRunTurn, ArtifactRecord, BudgetLedgerEntry, RunEvent};
use crate::db::context::DbContext;
use crate::error::AppError;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct RunRepository {
    ctx: Arc<DbContext>,
}

fn run_to_domain(model: agent_runs::Model, agent_name: Option<String>) -> AgentRun {
    AgentRun {
        id: model.id,
        agent_id: model.agent_id,
        agent_name,
        automation_id: model.automation_id,
        environment_id: model.environment_id,
        status: model.status,
        trigger: model.trigger_type,
        harness: model.harness,
        started_at: model.started_at,
        finished_at: model.finished_at,
        duration_ms: model.duration_ms,
        ended_reason: model.ended_reason,
        result_summary: model.result_summary,
        error_message: model.error_message,
        input_tokens: model.input_tokens,
        output_tokens: model.output_tokens,
        work_dir: model.work_dir,
    }
}

fn turn_to_domain(model: agent_run_turns::Model) -> AgentRunTurn {
    AgentRunTurn {
        id: model.id,
        run_id: model.run_id,
        turn_number: model.turn_number,
        role: model.role,
        tool_name: model.tool_name,
        content: model.content,
        token_input: model.token_input,
        token_output: model.token_output,
        duration_ms: model.duration_ms,
        created_at: model.created_at,
    }
}

fn run_event_to_domain(model: run_events::Model) -> RunEvent {
    RunEvent {
        id: model.id,
        run_id: model.run_id,
        sequence_number: model.sequence_number,
        event_type: model.event_type,
        source: model.source,
        title: model.title,
        content: model.content,
        status: model.status,
        tool_name: model.tool_name,
        metadata_json: model.metadata_json,
        created_at: model.created_at,
    }
}

fn artifact_to_domain(model: artifacts::Model) -> ArtifactRecord {
    ArtifactRecord {
        id: model.id,
        run_id: model.run_id,
        agent_id: model.agent_id,
        kind: model.kind,
        label: model.label,
        path: model.path,
        mime_type: model.mime_type,
        size_bytes: model.size_bytes,
        sha256: model.sha256,
        storage_type: model.storage_type,
        metadata_json: model.metadata_json,
        created_at: model.created_at,
    }
}

fn budget_ledger_to_domain(model: budget_ledger::Model) -> BudgetLedgerEntry {
    BudgetLedgerEntry {
        id: model.id,
        agent_id: model.agent_id,
        run_id: model.run_id,
        scope: model.scope,
        metric: model.metric,
        delta: model.delta,
        window_key: model.window_key,
        metadata_json: model.metadata_json,
        created_at: model.created_at,
    }
}

impl RunRepository {
    pub(crate) fn new(ctx: Arc<DbContext>) -> Self { Self { ctx } }

    pub(crate) fn list_agent_runs(&self) -> Result<Vec<AgentRun>, AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            let runs = agent_runs::Entity::find()
                .order_by_desc(agent_runs::Column::StartedAt)
                .order_by_desc(agent_runs::Column::FinishedAt)
                .all(&conn)
                .await?;
            let agents = managed_agents::Entity::find().all(&conn).await?;
            let agent_names: HashMap<String, String> = agents.into_iter().map(|a| (a.id, a.name)).collect();
            Ok(runs
                .into_iter()
                .map(|run| {
                    let agent_name = run.agent_id.as_ref().and_then(|id| agent_names.get(id).cloned());
                    run_to_domain(run, agent_name)
                })
                .collect())
        })
    }

    pub(crate) fn list_agent_run_turns(&self, run_id: &str) -> Result<Vec<AgentRunTurn>, AppError> {
        let conn = self.ctx.conn();
        let run_id = run_id.to_string();
        self.ctx.run(async move {
            let turns = agent_run_turns::Entity::find()
                .filter(agent_run_turns::Column::RunId.eq(run_id))
                .order_by_asc(agent_run_turns::Column::TurnNumber)
                .order_by_asc(agent_run_turns::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(turns.into_iter().map(turn_to_domain).collect())
        })
    }

    pub(crate) fn create_agent_run(&self, run: &AgentRun) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            agent_runs::Entity::insert(agent_runs::ActiveModel {
                id: Set(run.id.clone()),
                agent_id: Set(run.agent_id.clone()),
                automation_id: Set(run.automation_id.clone()),
                environment_id: Set(run.environment_id.clone()),
                status: Set(run.status.clone()),
                trigger_type: Set(run.trigger.clone()),
                harness: Set(run.harness.clone()),
                started_at: Set(run.started_at.clone()),
                finished_at: Set(run.finished_at.clone()),
                duration_ms: Set(run.duration_ms),
                ended_reason: Set(run.ended_reason.clone()),
                result_summary: Set(run.result_summary.clone()),
                error_message: Set(run.error_message.clone()),
                input_tokens: Set(run.input_tokens),
                output_tokens: Set(run.output_tokens),
                work_dir: Set(run.work_dir.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn update_agent_run_work_dir(&self, id: &str, work_dir: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        let work_dir = work_dir.to_string();
        self.ctx.run(async move {
            let model = agent_runs::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Agent run {id} not found")))?;
            let mut active: agent_runs::ActiveModel = model.into();
            active.work_dir = Set(Some(work_dir));
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn update_agent_run_status(&self, id: &str, status: &str, finished_at: Option<&str>, duration_ms: Option<i64>, ended_reason: Option<&str>, result_summary: Option<&str>, error_message: Option<&str>, input_tokens: Option<i64>, output_tokens: Option<i64>) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        let status = status.to_string();
        let finished_at = finished_at.map(ToOwned::to_owned);
        let ended_reason = ended_reason.map(ToOwned::to_owned);
        let result_summary = result_summary.map(ToOwned::to_owned);
        let error_message = error_message.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let model = agent_runs::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Agent run {id} not found")))?;
            let mut active: agent_runs::ActiveModel = model.into();
            active.status = Set(status);
            active.finished_at = Set(finished_at);
            active.duration_ms = Set(duration_ms);
            active.ended_reason = Set(ended_reason);
            active.result_summary = Set(result_summary);
            active.error_message = Set(error_message);
            active.input_tokens = Set(input_tokens);
            active.output_tokens = Set(output_tokens);
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn create_agent_run_turn(&self, turn: &AgentRunTurn) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            agent_run_turns::Entity::insert(agent_run_turns::ActiveModel {
                id: Set(turn.id.clone()),
                run_id: Set(turn.run_id.clone()),
                turn_number: Set(turn.turn_number),
                role: Set(turn.role.clone()),
                tool_name: Set(turn.tool_name.clone()),
                content: Set(turn.content.clone()),
                token_input: Set(turn.token_input),
                token_output: Set(turn.token_output),
                duration_ms: Set(turn.duration_ms),
                created_at: Set(turn.created_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn get_agent_run(&self, id: &str) -> Result<AgentRun, AppError> {
        let conn = self.ctx.conn();
        let id = id.to_string();
        self.ctx.run(async move {
            let run = agent_runs::Entity::find_by_id(id.clone())
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found(format!("Agent run {id} not found")))?;
            let agent_name = match &run.agent_id {
                Some(agent_id) => managed_agents::Entity::find_by_id(agent_id.clone())
                    .one(&conn)
                    .await?
                    .map(|a| a.name),
                None => None,
            };
            Ok(run_to_domain(run, agent_name))
        })
    }

    pub(crate) fn list_run_events(&self, run_id: &str) -> Result<Vec<RunEvent>, AppError> {
        let conn = self.ctx.conn();
        let run_id = run_id.to_string();
        self.ctx.run(async move {
            let events = run_events::Entity::find()
                .filter(run_events::Column::RunId.eq(run_id))
                .order_by_asc(run_events::Column::SequenceNumber)
                .order_by_asc(run_events::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(events.into_iter().map(run_event_to_domain).collect())
        })
    }

    pub(crate) fn create_run_event(&self, event: &RunEvent) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            run_events::Entity::insert(run_events::ActiveModel {
                id: Set(event.id.clone()),
                run_id: Set(event.run_id.clone()),
                sequence_number: Set(event.sequence_number),
                event_type: Set(event.event_type.clone()),
                source: Set(event.source.clone()),
                title: Set(event.title.clone()),
                content: Set(event.content.clone()),
                status: Set(event.status.clone()),
                tool_name: Set(event.tool_name.clone()),
                metadata_json: Set(event.metadata_json.clone()),
                created_at: Set(event.created_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn list_artifacts(&self, run_id: &str) -> Result<Vec<ArtifactRecord>, AppError> {
        let conn = self.ctx.conn();
        let run_id = run_id.to_string();
        self.ctx.run(async move {
            let rows = artifacts::Entity::find()
                .filter(artifacts::Column::RunId.eq(run_id))
                .order_by_asc(artifacts::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(rows.into_iter().map(artifact_to_domain).collect())
        })
    }

    pub(crate) fn list_agent_artifacts(&self, agent_id: &str) -> Result<Vec<ArtifactRecord>, AppError> {
        let conn = self.ctx.conn();
        let agent_id = agent_id.to_string();
        self.ctx.run(async move {
            let rows = artifacts::Entity::find()
                .filter(artifacts::Column::AgentId.eq(agent_id))
                .order_by_desc(artifacts::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(rows.into_iter().map(artifact_to_domain).collect())
        })
    }

    pub(crate) fn create_artifact(&self, artifact: &ArtifactRecord) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            artifacts::Entity::insert(artifacts::ActiveModel {
                id: Set(artifact.id.clone()),
                run_id: Set(artifact.run_id.clone()),
                agent_id: Set(artifact.agent_id.clone()),
                kind: Set(artifact.kind.clone()),
                label: Set(artifact.label.clone()),
                path: Set(artifact.path.clone()),
                mime_type: Set(artifact.mime_type.clone()),
                size_bytes: Set(artifact.size_bytes),
                sha256: Set(artifact.sha256.clone()),
                storage_type: Set(artifact.storage_type.clone()),
                metadata_json: Set(artifact.metadata_json.clone()),
                created_at: Set(artifact.created_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }

    pub(crate) fn delete_artifact(&self, artifact_id: &str) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        let artifact_id = artifact_id.to_string();
        self.ctx.run(async move {
            artifacts::Entity::delete_by_id(artifact_id).exec(&conn).await?;
            Ok(())
        })
    }

    pub(crate) fn list_budget_ledger(&self, agent_id: Option<&str>, window_key: Option<&str>) -> Result<Vec<BudgetLedgerEntry>, AppError> {
        let conn = self.ctx.conn();
        let agent_id = agent_id.map(ToOwned::to_owned);
        let window_key = window_key.map(ToOwned::to_owned);
        self.ctx.run(async move {
            let mut query = budget_ledger::Entity::find().order_by_asc(budget_ledger::Column::CreatedAt);
            if let Some(agent_id) = agent_id {
                query = query.filter(budget_ledger::Column::AgentId.eq(agent_id));
            }
            if let Some(window_key) = window_key {
                query = query.filter(budget_ledger::Column::WindowKey.eq(window_key));
            }
            let rows = query.all(&conn).await?;
            Ok(rows.into_iter().map(budget_ledger_to_domain).collect())
        })
    }

    pub(crate) fn create_budget_ledger_entry(&self, entry: &BudgetLedgerEntry) -> Result<(), AppError> {
        let conn = self.ctx.conn();
        self.ctx.run(async move {
            budget_ledger::Entity::insert(budget_ledger::ActiveModel {
                id: Set(entry.id.clone()),
                agent_id: Set(entry.agent_id.clone()),
                run_id: Set(entry.run_id.clone()),
                scope: Set(entry.scope.clone()),
                metric: Set(entry.metric.clone()),
                delta: Set(entry.delta),
                window_key: Set(entry.window_key.clone()),
                metadata_json: Set(entry.metadata_json.clone()),
                created_at: Set(entry.created_at.clone()),
            })
            .exec(&conn)
            .await?;
            Ok(())
        })
    }
}
