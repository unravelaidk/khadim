//! Local runner — executes a managed agent using one of the available
//! harnesses (khadim, opencode, claude_code) on the host machine.

use super::helpers::{resolve_agent_model, substitute_variables, truncate_summary};
use super::{
    ResolvedEnvironment, complete_run_and_emit_done, emit_run_event, fail_run_with_events,
    record_turn,
};
use crate::db::{AgentRun, Database, ManagedAgent};
use crate::integrations::IntegrationRegistry;
use crate::khadim_agent::KhadimManager;
use crate::opencode::AgentStreamEvent;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

/// Execute a managed agent run locally using the khadim harness.
///
/// This creates a khadim session in a temp directory, feeds the agent's
/// instructions as the initial prompt, and streams events back through
/// the Tauri event bus.
pub async fn execute_local_run(
    app: AppHandle,
    db: Arc<Database>,
    khadim: Arc<KhadimManager>,
    agent: ManagedAgent,
    run: AgentRun,
    env: ResolvedEnvironment,
    plugins: Arc<crate::plugins::PluginManager>,
    skills: Arc<crate::skills::SkillManager>,
    integrations: Arc<IntegrationRegistry>,
) {
    let run_id = run.id.clone();
    let started_at = run.started_at.clone().unwrap_or_default();

    if agent.harness != "khadim" {
        let msg = format!(
            "Managed agents currently support the Khadim harness only. '{}' is not wired into the managed-agent runner yet.",
            agent.harness
        );
        fail_run_with_events(&app, &db, &run_id, msg, &started_at);
        return;
    }

    // Update status to running
    let _ = db.update_agent_run_status(
        &run_id, "running", None, None, None, None, None, None, None,
    );

    emit_run_event(&app, &run_id, "step_start", None, Some(json!({
        "id": "init",
        "title": "Starting agent",
        "tool": "system",
    })));

    // Build the prompt from agent instructions + variables
    let prompt = substitute_variables(&agent.instructions, &env.variables);

    // Record the initial user turn
    let _ = record_turn(&db, &run_id, 1, "user", None, Some(&prompt), None, None, None);

    // Ensure the agent has a memory store (create one if missing)
    match db.ensure_agent_memory_store(&agent.id, &agent.name) {
        Ok(store) => {
            log::info!("Agent '{}' using memory store '{}' ({})", agent.name, store.name, store.id);
        }
        Err(e) => {
            log::warn!("Failed to ensure memory store for agent '{}': {}", agent.name, e.message);
            // Non-fatal — the agent can still run without persistent memory
        }
    }

    // Create a persistent workspace for this run. Kept on disk after the run
    // completes so the UI can browse files the agent touched. Lives under the
    // app data dir alongside artifacts.
    let run_dir = match run_work_dir_for(&run_id) {
        Ok(path) => path,
        Err(e) => {
            fail_run_with_events(&app, &db, &run_id, e.message, &started_at);
            return;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&run_dir) {
        let msg = format!("Failed to create run directory: {e}");
        fail_run_with_events(&app, &db, &run_id, msg, &started_at);
        return;
    }
    let _ = db.update_agent_run_work_dir(&run_id, &run_dir.to_string_lossy());

    // Resolve model selection
    let selection = match resolve_agent_model(&db, &agent) {
        Ok(sel) => sel,
        Err(e) => {
            let msg = format!("Failed to resolve model: {e}");
            fail_run_with_events(&app, &db, &run_id, msg, &started_at);
            return;
        }
    };

    emit_run_event(&app, &run_id, "step_complete", Some("Agent initialized".to_string()), Some(json!({
        "id": "init",
        "title": "Starting agent",
        "status": "complete",
    })));

    // Create a khadim session
    let session_id = khadim.create_session(
        format!("run:{run_id}"),
        run_dir.clone(),
    );

    let session = match khadim.get_session(&session_id) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("Failed to create agent session: {}", e.message);
            fail_run_with_events(&app, &db, &run_id, msg, &started_at);
            return;
        }
    };

    // Run the prompt through the orchestrator
    let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let db_for_stream = db.clone();
    let run_id_for_stream = run_id.clone();
    let app_for_stream = app.clone();
    let khadim_for_stream = khadim.clone();
    let session_id_for_stream = session_id.clone();
    let agent_for_stream = agent.clone();

    // Forward stream events and collect turns
    let stream_task = tokio::spawn(async move {
        let mut turn_number: i64 = 2;
        let mut total_input_tokens: i64 = 0;
        let mut total_output_tokens: i64 = 0;
        let mut budget_error: Option<String> = None;

        while let Some(event) = rx.recv().await {
            // Forward to frontend
            let forwarded = AgentStreamEvent {
                workspace_id: format!("run:{}", run_id_for_stream),
                session_id: run_id_for_stream.clone(),
                event_type: event.event_type.clone(),
                content: event.content.clone(),
                metadata: event.metadata.clone(),
            };
            super::emit_run_event(
                &app_for_stream,
                &run_id_for_stream,
                &forwarded.event_type,
                forwarded.content.clone(),
                forwarded.metadata.clone(),
            );

            // Record tool steps as turns
            if event.event_type == "step_complete" {
                if let Some(ref meta) = event.metadata {
                    let tool = meta.get("tool").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let result = event.content.as_deref()
                        .or_else(|| meta.get("result").and_then(|v| v.as_str()));
                    let _ = record_turn(
                        &db_for_stream,
                        &run_id_for_stream,
                        turn_number,
                        "tool",
                        Some(tool),
                        result,
                        None,
                        None,
                        None,
                    );
                    turn_number += 1;
                }
            }

            if event.event_type == "text_delta" {
                // Accumulate token counts from metadata if present
                if let Some(ref meta) = event.metadata {
                    if let Some(inp) = meta.get("input_tokens").and_then(|v| v.as_i64()) {
                        total_input_tokens = inp;
                    }
                    if let Some(out) = meta.get("output_tokens").and_then(|v| v.as_i64()) {
                        total_output_tokens = out;
                    }
                    if let Some(state) = app_for_stream.try_state::<Arc<crate::AppState>>() {
                        if let Err(error) = state
                            .budget_service
                            .check_runtime_budget(&agent_for_stream, total_input_tokens, total_output_tokens)
                        {
                            budget_error = Some(error.message.clone());
                            let _ = khadim_for_stream.abort(&session_id_for_stream).await;
                            break;
                        }
                    }
                }
            }
        }

        (turn_number, total_input_tokens, total_output_tokens, budget_error)
    });

    // Execute
    let result = {
        let mut session = session.lock().await;
        session.active_conversation_id = Some(agent.id.clone());
        session.active_agent_id = Some(agent.id.clone());
        crate::khadim_agent::orchestrator::run_prompt_with_plugins(
            &mut session,
            &prompt,
            Some(selection),
            &tx,
            Some(&plugins),
            Some(&skills),
            Some(&khadim),
            Some(&app),
            Some(db.as_ref().clone()),
            Some(&integrations),
        )
        .await
    };
    drop(tx);

    let (final_turn, total_input, total_output, budget_error) = stream_task.await.unwrap_or((2, 0, 0, None));

    if let Some(message) = budget_error {
        fail_run_with_events(&app, &db, &run_id, message, &started_at);
    } else {
        match result {
            Ok(response_text) => {
                // Record the final assistant turn
                let _ = record_turn(
                    &db, &run_id, final_turn, "agent", None,
                    Some(&response_text),
                    Some(total_input), Some(total_output), None,
                );

                // Summarize
                let summary = truncate_summary(&response_text, 200);

                complete_run_and_emit_done(
                    &app,
                    &db, &run_id,
                    Some(&summary),
                    Some(total_input),
                    Some(total_output),
                    &started_at,
                );
            }
            Err(e) => {
                fail_run_with_events(&app, &db, &run_id, e.message, &started_at);
            }
        }
    }

    if let Some(state) = app.try_state::<Arc<crate::AppState>>() {
        if let Err(error) = state
            .artifact_service
            .capture_directory_outputs(&run_id, Some(&agent.id), &run_dir, &agent.artifact_policy)
        {
            log::warn!("Failed to capture artifacts for run {}: {}", run_id, error.message);
        }
    }

    // Workspace is intentionally preserved so the UI can browse it. Retention
    // is managed by artifact pruning policies elsewhere.
    khadim.clear_run(&session_id);
}

fn run_work_dir_for(run_id: &str) -> Result<std::path::PathBuf, crate::error::AppError> {
    dirs::data_dir()
        .map(|dir| dir.join("khadim").join("runs").join(run_id))
        .ok_or_else(|| crate::error::AppError::io("Cannot determine system data directory"))
}
