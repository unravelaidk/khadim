//! Simple primary-and-helpers orchestration.
//!
//! The primary agent keeps the full conversation, configured tools, write
//! permissions, and responsibility for the final answer. It may delegate
//! independent read-only investigations to a small bounded set of helpers.
//! This keeps coordination inside the normal agent loop instead of maintaining
//! a second planner, goal board, model matrix, and aggregation protocol.

pub mod assign;
pub mod lease;
pub mod lease_guard;
pub mod search;
pub mod worker;

pub use assign::WorkerAssignment;
pub use lease::{Conflict, Lease, LeaseId, LeaseManager};
pub use lease_guard::LeaseGuard;
pub use search::{Candidate, ProposerFn, Scorer, SearchMode, SelectedAction};
pub use worker::{
    spawn_worker, spawn_worker_with_runner, WorkerHandle, WorkerRunner, WorkerSpec, WriteScope,
};

use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;

use crate::agent::orchestrator::{run_prompt_with_runtime, RunConfig};
use crate::agent::session::KhadimSession;
use crate::events::AgentStreamEvent;
use crate::runtime::AgentRuntime;

const DEFAULT_MAX_HELPERS: usize = 3;
const MAX_HELPERS: usize = 4;

pub struct MultiAgentConfig {
    /// Maximum number of read-only helper tasks that may run concurrently.
    pub max_workers: usize,
    /// Primary-loop policy (temperature, retries, goal tracking, and search).
    pub run_config: RunConfig,
}

impl Default for MultiAgentConfig {
    fn default() -> Self {
        Self {
            max_workers: DEFAULT_MAX_HELPERS,
            run_config: RunConfig::default(),
        }
    }
}

fn team_instructions(max_helpers: usize) -> String {
    format!(
        "Team mode is enabled. You are the primary agent and remain responsible for the plan, all file changes, verification, and the final answer.\n\
         Use delegate_to_agent only for focused read-only investigation or review that is genuinely independent of your current work. When two or more helper tasks are independent, issue them together so they run in parallel. Do not delegate trivial work, sequential steps, or duplicate searches.\n\
         For every helper, state a concrete objective, a narrow scope, and the exact findings to return. Use no more than {max_helpers} helpers at once. Helpers cannot edit files and only see the read-only capabilities enabled for this run; incorporate their findings yourself, make the changes, and verify the integrated result before responding."
    )
}

/// Run one accountable primary agent with bounded read-only helpers.
///
/// Unlike the retired coordinator pipeline, this path preserves the caller's
/// runtime, tools, permissions, prompt, model, and durable session. Helper
/// events are streamed through the same event channel for UI observability.
pub async fn run_multi_agent(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: MultiAgentConfig,
) -> Result<String, AppError> {
    let max_helpers = config.max_workers.clamp(1, MAX_HELPERS);
    let _ = tx.send(
        AgentStreamEvent::new("team_started")
            .with_content("Team mode enabled")
            .with_metadata(json!({ "max_helpers": max_helpers })),
    );

    let mut run_config = config.run_config;
    run_config.max_workers = max_helpers;
    run_config.system_instructions = Some(team_instructions(max_helpers));
    run_prompt_with_runtime(session, prompt, selection, tx, runtime, run_config).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn team_guidance_keeps_one_primary_and_bounded_helpers() {
        let guidance = team_instructions(3);
        assert!(guidance.contains("primary agent"));
        assert!(guidance.contains("read-only"));
        assert!(guidance.contains("no more than 3 helpers"));
        assert!(guidance.contains("verify the integrated result"));
    }
}
