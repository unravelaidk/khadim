use crate::db::{BudgetLedgerEntry, BudgetPolicy, Database, ManagedAgent};
use crate::error::AppError;
use crate::khadim_ai::model_settings;
use khadim_ai_core::models::find_or_synth_model;
use khadim_ai_core::pricing::calculate_cost;
use khadim_ai_core::types::Usage;
use serde_json::json;
use std::sync::Arc;

/// Fallback flat rate (USD per 1K tokens) used only when no model / config
/// can be resolved for an agent run. Real pricing flows through
/// `khadim_ai_core::pricing::calculate_cost` against the configured model.
const FALLBACK_COST_PER_1K_TOKENS_USD: f64 = 0.002;

pub struct BudgetService {
    db: Arc<Database>,
}

impl BudgetService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn admit_run(&self, agent: &ManagedAgent) -> Result<(), AppError> {
        let policy = effective_budget_policy(agent);
        let window_key = day_window_key();
        let entries = self
            .db
            .list_budget_ledger(Some(&agent.id), Some(&window_key))?;

        if let Some(max_runs_per_day) = policy.max_runs_per_day {
            let runs_today = entries
                .iter()
                .filter(|entry| entry.metric == "run_started")
                .count() as i64;
            if runs_today >= max_runs_per_day {
                return Err(AppError::invalid_input(format!(
                    "Agent '{}' reached its daily run budget ({max_runs_per_day})",
                    agent.name
                )));
            }
        }

        if let Some(max_cost_usd_per_day) = policy.max_cost_usd_per_day {
            let total_cost_today: f64 = entries
                .iter()
                .filter(|entry| entry.metric == "estimated_cost_usd")
                .map(|entry| entry.delta)
                .sum();
            if total_cost_today >= max_cost_usd_per_day {
                return Err(AppError::invalid_input(format!(
                    "Agent '{}' reached its daily cost budget (${max_cost_usd_per_day:.4})",
                    agent.name
                )));
            }
        }

        Ok(())
    }

    pub fn record_run_started(&self, agent: &ManagedAgent, run_id: &str) -> Result<(), AppError> {
        self.record_entry(BudgetLedgerEntry {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: Some(agent.id.clone()),
            run_id: Some(run_id.to_string()),
            scope: "agent".to_string(),
            metric: "run_started".to_string(),
            delta: 1.0,
            window_key: day_window_key(),
            metadata_json: json!({ "agent_name": agent.name }).to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn check_runtime_budget(
        &self,
        agent: &ManagedAgent,
        input_tokens: i64,
        output_tokens: i64,
    ) -> Result<(), AppError> {
        let policy = effective_budget_policy(agent);
        if let Some(max_tokens_per_run) = policy.max_tokens_per_run {
            let total = input_tokens + output_tokens;
            if total > max_tokens_per_run {
                return Err(AppError::invalid_input(format!(
                    "Agent '{}' exceeded per-run token budget ({total} > {max_tokens_per_run})",
                    agent.name
                )));
            }
        }
        Ok(())
    }

    pub fn record_completed_run(&self, agent: &ManagedAgent, run_id: &str) -> Result<(), AppError> {
        let run = self.db.get_agent_run(run_id)?;
        let input_tokens = run.input_tokens.unwrap_or(0);
        let output_tokens = run.output_tokens.unwrap_or(0);
        let total_tokens = input_tokens + output_tokens;
        let duration_seconds = run.duration_ms.unwrap_or(0) as f64 / 1000.0;
        let estimated_cost_usd = self.estimate_run_cost(agent, input_tokens, output_tokens);
        let window_key = day_window_key();

        if total_tokens > 0 {
            self.record_entry(BudgetLedgerEntry {
                id: uuid::Uuid::new_v4().to_string(),
                agent_id: Some(agent.id.clone()),
                run_id: Some(run_id.to_string()),
                scope: "agent".to_string(),
                metric: "tokens_total".to_string(),
                delta: total_tokens as f64,
                window_key: window_key.clone(),
                metadata_json:
                    json!({ "input_tokens": input_tokens, "output_tokens": output_tokens })
                        .to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
            })?;
        }

        self.record_entry(BudgetLedgerEntry {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: Some(agent.id.clone()),
            run_id: Some(run_id.to_string()),
            scope: "agent".to_string(),
            metric: "estimated_cost_usd".to_string(),
            delta: estimated_cost_usd,
            window_key: window_key.clone(),
            metadata_json: json!({ "status": run.status }).to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })?;

        self.record_entry(BudgetLedgerEntry {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: Some(agent.id.clone()),
            run_id: Some(run_id.to_string()),
            scope: "agent".to_string(),
            metric: "runtime_seconds".to_string(),
            delta: duration_seconds,
            window_key,
            metadata_json: json!({}).to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    fn record_entry(&self, entry: BudgetLedgerEntry) -> Result<(), AppError> {
        self.db.create_budget_ledger_entry(&entry)
    }

    /// Resolve the agent's configured model and return the USD cost for a
    /// run with the given input/output tokens. Falls back to a flat
    /// per-1K-token rate if the agent has no model configured or the
    /// model lookup fails — this keeps budgets enforceable even when
    /// pricing is unknown.
    fn estimate_run_cost(
        &self,
        agent: &ManagedAgent,
        input_tokens: i64,
        output_tokens: i64,
    ) -> f64 {
        let usage = Usage {
            input: input_tokens.max(0) as u64,
            output: output_tokens.max(0) as u64,
            cache_read: 0,
            cache_write: 0,
        };

        if let Some(config_id) = agent.model_id.as_ref() {
            if let Ok(Some(config)) = model_settings::get_config(&self.db, config_id) {
                let model = find_or_synth_model(&config.provider, &config.model);
                let cost = calculate_cost(&model, &usage);
                if cost > 0.0 || model.cost.input > 0.0 || model.cost.output > 0.0 {
                    return cost;
                }
            }
        }

        let total_tokens = (input_tokens + output_tokens).max(0) as f64;
        (total_tokens / 1000.0) * FALLBACK_COST_PER_1K_TOKENS_USD
    }
}

pub fn effective_budget_policy(agent: &ManagedAgent) -> BudgetPolicy {
    let mut policy = agent.budget_policy.clone();
    if policy.max_tokens_per_run.is_none() && agent.max_tokens > 0 {
        policy.max_tokens_per_run = Some(agent.max_tokens);
    }
    policy
}

fn day_window_key() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}
