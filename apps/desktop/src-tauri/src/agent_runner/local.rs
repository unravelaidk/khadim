//! Local runner — executes a managed agent using one of the available
//! harnesses (khadim, opencode, claude_code) on the host machine.

use super::{ResolvedEnvironment, complete_run, emit_run_event, fail_run, record_turn};
use crate::db::{AgentRun, Database, ManagedAgent};
use crate::error::AppError;
use crate::khadim_agent::KhadimManager;
use crate::khadim_ai::model_settings;
use crate::khadim_ai::types::ModelSelection;
use crate::opencode::AgentStreamEvent;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
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
) {
    let run_id = run.id.clone();
    let started_at = run.started_at.clone().unwrap_or_default();

    if agent.harness != "khadim" {
        let msg = format!(
            "Managed agents currently support the Khadim harness only. '{}' is not wired into the managed-agent runner yet.",
            agent.harness
        );
        let _ = fail_run(&db, &run_id, &msg, &started_at);
        emit_run_event(&app, &run_id, "error", Some(msg), None);
        emit_run_event(&app, &run_id, "done", None, None);
        return;
    }

    // Update status to running
    let _ = db.update_agent_run_status(
        &run_id, "running", None, None, None, None, None, None,
    );

    emit_run_event(&app, &run_id, "step_start", None, Some(json!({
        "id": "init",
        "title": "Starting agent",
        "tool": "system",
    })));

    // Build the prompt from agent instructions + variables
    let mut prompt = agent.instructions.clone();
    for (key, value) in &env.variables {
        prompt = prompt.replace(&format!("{{{{{key}}}}}"), value);
    }

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

    // Create a temporary workspace for this run
    let run_dir = std::env::temp_dir().join(format!("khadim-run-{}", &run_id[..8]));
    if let Err(e) = std::fs::create_dir_all(&run_dir) {
        let msg = format!("Failed to create run directory: {e}");
        let _ = fail_run(&db, &run_id, &msg, &started_at);
        emit_run_event(&app, &run_id, "error", Some(msg), None);
        emit_run_event(&app, &run_id, "done", None, None);
        return;
    }

    // Resolve model selection
    let selection = match resolve_agent_model(&db, &agent) {
        Ok(sel) => sel,
        Err(e) => {
            let msg = format!("Failed to resolve model: {e}");
            let _ = fail_run(&db, &run_id, &msg, &started_at);
            emit_run_event(&app, &run_id, "error", Some(msg), None);
            emit_run_event(&app, &run_id, "done", None, None);
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
            let _ = fail_run(&db, &run_id, &msg, &started_at);
            emit_run_event(&app, &run_id, "error", Some(msg), None);
            emit_run_event(&app, &run_id, "done", None, None);
            return;
        }
    };

    // Run the prompt through the orchestrator
    let (tx, mut rx) = mpsc::unbounded_channel::<AgentStreamEvent>();
    let db_for_stream = db.clone();
    let run_id_for_stream = run_id.clone();
    let app_for_stream = app.clone();

    // Forward stream events and collect turns
    let stream_task = tokio::spawn(async move {
        let mut turn_number: i64 = 2;
        let mut total_input_tokens: i64 = 0;
        let mut total_output_tokens: i64 = 0;

        while let Some(event) = rx.recv().await {
            // Forward to frontend
            let forwarded = AgentStreamEvent {
                workspace_id: format!("run:{}", run_id_for_stream),
                session_id: run_id_for_stream.clone(),
                event_type: event.event_type.clone(),
                content: event.content.clone(),
                metadata: event.metadata.clone(),
            };
            let _ = app_for_stream.emit("agent-stream", &forwarded);

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
                }
            }
        }

        (turn_number, total_input_tokens, total_output_tokens)
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
        )
        .await
    };
    drop(tx);

    let (final_turn, total_input, total_output) = stream_task.await.unwrap_or((2, 0, 0));

    match result {
        Ok(response_text) => {
            // Record the final assistant turn
            let _ = record_turn(
                &db, &run_id, final_turn, "agent", None,
                Some(&response_text),
                Some(total_input), Some(total_output), None,
            );

            // Summarize
            let summary = if response_text.len() > 200 {
                format!("{}...", &response_text[..200])
            } else {
                response_text.clone()
            };

            let _ = complete_run(
                &db, &run_id,
                Some(&summary),
                Some(total_input),
                Some(total_output),
                &started_at,
            );
            emit_run_event(&app, &run_id, "done", None, None);
        }
        Err(e) => {
            let _ = fail_run(&db, &run_id, &e.message, &started_at);
            emit_run_event(&app, &run_id, "error", Some(e.message), None);
            emit_run_event(&app, &run_id, "done", None, None);
        }
    }

    // Clean up temp directory (best effort)
    let _ = std::fs::remove_dir_all(&run_dir);
    khadim.clear_run(&session_id);
}

fn resolve_agent_model(
    db: &Database,
    agent: &ManagedAgent,
) -> Result<ModelSelection, AppError> {
    // If agent has a model_id like "provider:model", parse it
    if let Some(ref model_id) = agent.model_id {
        if !model_id.is_empty() {
            let parts: Vec<&str> = model_id.splitn(2, ':').collect();
            if parts.len() == 2 {
                let configs = model_settings::list_configs(db)?;
                if let Some(config) = configs.iter().find(|c| {
                    c.provider == parts[0] && c.model == parts[1]
                }) {
                    return Ok(ModelSelection {
                        provider: config.provider.clone(),
                        model_id: config.model.clone(),
                        display_name: Some(config.name.clone()),
                        api_key: config.api_key.clone().or_else(|| {
                            model_settings::saved_provider_api_key(&config.provider)
                                .ok()
                                .flatten()
                        }),
                        base_url: config.base_url.clone(),
                    });
                }

                return Ok(ModelSelection {
                    provider: parts[0].to_string(),
                    model_id: parts[1].to_string(),
                    display_name: None,
                    api_key: model_settings::saved_provider_api_key(parts[0]).ok().flatten(),
                    base_url: None,
                });
            }
        }
    }

    // Fall back to active/default model
    let active = model_settings::active_model_option(db)?;
    if let Some(m) = active {
        let configs = model_settings::list_configs(db)?;
        if let Some(config) = configs.iter().find(|c| {
            c.provider == m.provider_id && c.model == m.model_id
        }) {
            return Ok(ModelSelection {
                provider: config.provider.clone(),
                model_id: config.model.clone(),
                display_name: Some(config.name.clone()),
                api_key: config.api_key.clone().or_else(|| {
                    model_settings::saved_provider_api_key(&config.provider)
                        .ok()
                        .flatten()
                }),
                base_url: config.base_url.clone(),
            });
        }
    }

    Err(AppError::invalid_input(
        "No model configured. Add a model in Settings → Providers.".to_string(),
    ))
}
