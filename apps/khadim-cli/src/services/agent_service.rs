use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::{
    events::AgentStreamEvent, run_prompt_with_runtime, run_multi_agent, AgentRuntime,
    KhadimSession, MultiAgentConfig, RunConfig,
};
use tokio::io::AsyncWriteExt;

/// Run the agent once in non-interactive (batch) mode.
///
/// When `multi_agent` is true, the prompt is run through the multi-agent
/// coordinator ([`run_multi_agent`]) instead of the single-agent loop
/// ([`run_prompt_with_runtime`]). The single-agent path is the default and
/// is unchanged when `multi_agent` is false.
pub async fn run_once(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    runtime: AgentRuntime,
    multi_agent: bool,
) -> Result<(), AppError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
    let printer = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            print_human(&event);
        }
    });
    let result = if multi_agent {
        run_multi_agent(
            session,
            prompt,
            selection,
            &tx,
            runtime,
            MultiAgentConfig::default(),
        )
        .await
    } else {
        run_prompt_with_runtime(session, prompt, selection, &tx, runtime, RunConfig::default())
            .await
            .map(|s| s as String)
    };
    drop(tx);
    let _ = printer.await;
    result.map(|_| ())
}

/// Run the agent once and output JSON lines (one per event) for programmatic consumers.
pub async fn run_once_json(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    runtime: AgentRuntime,
    multi_agent: bool,
) -> Result<(), AppError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
    let printer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(event) = rx.recv().await {
            if let Ok(line) = serde_json::to_string(&event) {
                let mut buf = line.into_bytes();
                buf.push(b'\n');
                let _ = stdout.write_all(&buf).await;
                let _ = stdout.flush().await;
            }
        }
    });
    let result = if multi_agent {
        run_multi_agent(
            session,
            prompt,
            selection,
            &tx,
            runtime,
            MultiAgentConfig::default(),
        )
        .await
    } else {
        run_prompt_with_runtime(session, prompt, selection, &tx, runtime, RunConfig::default())
            .await
            .map(|s| s as String)
    };
    drop(tx);
    let _ = printer.await;
    result.map(|_| ())
}

fn print_human(event: &AgentStreamEvent) {
    match event.event_type.as_str() {
        "text_delta" => {
            if let Some(ref content) = event.content {
                print!("{content}");
            }
        }
        "step_start" => {
            if let Some(ref content) = event.content {
                println!("\n[{content}]");
            }
        }
        "step_update" => {
            if let Some(ref metadata) = event.metadata {
                if metadata.get("tool").and_then(|v| v.as_str()) == Some("model") {
                    if let Some(ref content) = event.content {
                        print!("{content}");
                    }
                }
            }
        }
        "step_complete" => {
            if let Some(ref content) = event.content {
                println!("[done] {content}");
            }
        }
        "mode_selected" => {}
        "system_message" => {
            if let Some(ref content) = event.content {
                println!("\n{content}");
            }
        }
        "error" => {
            if let Some(ref content) = event.content {
                println!("\n[error] {content}");
            }
        }
        // ── Multi-agent coordinator events ───────────────────────────────
        // These render as indented worker-prefixed lines in the transcript.
        "goal_heuristic" => {
            if let Some(ref metadata) = event.metadata {
                let total = metadata
                    .get("total_goals")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0);
                println!("\n[multi-agent] Decomposed {total} goal(s)");
            }
        }
        "workers_assigned" => {
            if let Some(ref metadata) = event.metadata {
                if let Some(assignments) = metadata.get("assignments").and_then(|v| v.as_array()) {
                    println!("[multi-agent] Assigned {} worker(s):", assignments.len());
                    for a in assignments {
                        let wi = a.get("worker_index").and_then(|v| v.as_u64()).unwrap_or(0);
                        let mode = a.get("mode").and_then(|v| v.as_str()).unwrap_or("?");
                        let goals = a
                            .get("goals")
                            .and_then(|v| v.as_array())
                            .map(|g| g.iter().filter_map(|n| n.as_u64()).collect::<Vec<_>>())
                            .unwrap_or_default();
                        println!("  [worker-{wi}] mode={mode} goals={goals:?}");
                    }
                }
            }
        }
        "worker_spawned" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let scope = metadata.get("scope").and_then(|v| v.as_str()).unwrap_or("");
                println!("  [{wid}] spawned (scope: {scope})");
            }
        }
        "worker_assigned" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let goals = metadata
                    .get("goals")
                    .and_then(|v| v.as_array())
                    .map(|g| g.iter().filter_map(|n| n.as_u64()).collect::<Vec<_>>())
                    .unwrap_or_default();
                println!("  [{wid}] assigned goals {goals:?}");
            }
        }
        "worker_event" => {
            // Inner event forwarded from a worker. Render with a prefix.
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let inner = metadata.get("inner_event_type").and_then(|v| v.as_str()).unwrap_or("");
                let inner_content = metadata.get("inner_content").and_then(|v| v.as_str()).unwrap_or("");
                match inner {
                    "text_delta" => {
                        print!("{inner_content}");
                    }
                    "step_start" | "step_complete" => {
                        println!("  [{wid}] {inner}: {inner_content}");
                    }
                    _ => {
                        // Other inner events are noise for the human transcript.
                    }
                }
            }
        }
        "worker_done" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let summary = metadata.get("summary").and_then(|v| v.as_str()).unwrap_or("");
                println!("\n  [{wid}] done: {summary}");
            }
        }
        "worker_failed" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let err = metadata.get("error").and_then(|v| v.as_str()).unwrap_or("");
                println!("\n  [{wid}] failed: {err}");
            }
        }
        "worker_blocked" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let reason = metadata
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("lease conflict");
                println!("  [{wid}] blocked: {reason}");
            }
        }
        "goal_satisfied" => {
            if let Some(ref metadata) = event.metadata {
                let gid = metadata.get("goal_id").and_then(|v| v.as_u64()).unwrap_or(0);
                let desc = metadata.get("description").and_then(|v| v.as_str()).unwrap_or("");
                println!("  ✓ goal {gid} satisfied: {desc}");
            }
        }
        "goal_reassigned" => {
            if let Some(ref metadata) = event.metadata {
                let gid = metadata.get("goal_id").and_then(|v| v.as_u64()).unwrap_or(0);
                let n = metadata.get("reassignment").and_then(|v| v.as_u64()).unwrap_or(0);
                println!("  ↻ goal {gid} reassigned (attempt {n})");
            }
        }
        "goal_blocked" => {
            if let Some(ref metadata) = event.metadata {
                let gid = metadata.get("goal_id").and_then(|v| v.as_u64()).unwrap_or(0);
                let reason = metadata.get("reason").and_then(|v| v.as_str()).unwrap_or("");
                println!("  ✗ goal {gid} blocked: {reason}");
            }
        }
        "lease_conflict" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                let other = metadata
                    .get("other_worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let file = metadata.get("file").and_then(|v| v.as_str()).unwrap_or("");
                println!("  [lease] {wid} conflicts with {other} on {file}");
            }
        }
        "cbs_resolution" => {
            if let Some(ref metadata) = event.metadata {
                let reason = metadata.get("reason").and_then(|v| v.as_str()).unwrap_or("cbs");
                println!("  [cbs] resolution: {reason}");
            }
        }
        "search_engaged" => {
            println!("  [search] engaged propose-k");
        }
        "search_candidates" => {
            if let Some(ref metadata) = event.metadata {
                let count = metadata
                    .get("candidates")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                println!("  [search] {count} candidate(s)");
            }
        }
        "multi_agent_done" => {
            if let Some(ref content) = event.content {
                println!("\n{content}");
            }
        }
        "done" => {
            println!();
        }
        _ => {}
    }
}
