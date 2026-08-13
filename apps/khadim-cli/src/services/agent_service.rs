use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::{
    events::AgentStreamEvent, run_multi_agent, run_prompt_with_runtime, AgentRuntime,
    KhadimSession, MultiAgentConfig, RunConfig,
};
use tokio::io::AsyncWriteExt;

/// Run the agent once in non-interactive (batch) mode.
///
/// When `multi_agent` is true, the normal primary loop may use bounded,
/// read-only helpers via [`run_multi_agent`]. The single-agent path remains
/// unchanged when `multi_agent` is false.
pub async fn run_once(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    runtime: AgentRuntime,
    run_config: RunConfig,
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
            MultiAgentConfig {
                run_config,
                ..MultiAgentConfig::default()
            },
        )
        .await
    } else {
        run_prompt_with_runtime(session, prompt, selection, &tx, runtime, run_config)
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
    run_config: RunConfig,
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
            MultiAgentConfig {
                run_config,
                ..MultiAgentConfig::default()
            },
        )
        .await
    } else {
        run_prompt_with_runtime(session, prompt, selection, &tx, runtime, run_config)
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
        "team_started" => println!("\n[team] Primary agent may delegate focused read-only work"),
        "worker_spawned" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata
                    .get("worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let scope = metadata.get("scope").and_then(|v| v.as_str()).unwrap_or("");
                println!("  [{wid}] helper started ({scope})");
            }
        }
        "worker_event" => {
            // Inner event forwarded from a worker. Render with a prefix.
            if let Some(ref metadata) = event.metadata {
                let wid = metadata
                    .get("worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let inner = metadata
                    .get("inner_event_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let inner_content = metadata
                    .get("inner_content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match inner {
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
                let wid = metadata
                    .get("worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let summary = metadata
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                println!("\n  [{wid}] done: {summary}");
            }
        }
        "worker_failed" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata
                    .get("worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let err = metadata.get("error").and_then(|v| v.as_str()).unwrap_or("");
                println!("\n  [{wid}] failed: {err}");
            }
        }
        "worker_blocked" => {
            if let Some(ref metadata) = event.metadata {
                let wid = metadata
                    .get("worker_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let reason = metadata
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("lease conflict");
                println!("  [{wid}] blocked: {reason}");
            }
        }
        "goal_satisfied" => {
            if let Some(ref metadata) = event.metadata {
                let gid = metadata
                    .get("goal_index")
                    .or_else(|| metadata.get("goal_id"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let desc = metadata
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                println!("  ✓ goal {gid} satisfied: {desc}");
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
        "done" => {
            println!();
        }
        _ => {}
    }
}
