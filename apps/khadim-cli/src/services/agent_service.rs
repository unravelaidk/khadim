use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::{events::AgentStreamEvent, run_prompt, KhadimSession};
use tokio::io::AsyncWriteExt;

/// Run the agent once in non-interactive (batch) mode.
pub async fn run_once(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
) -> Result<(), AppError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
    let printer = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            print_human(&event);
        }
    });
    let result = run_prompt(session, prompt, selection, &tx).await;
    drop(tx);
    let _ = printer.await;
    result.map(|_| ())
}

/// Run the agent once and output JSON lines (one per event) for programmatic consumers.
pub async fn run_once_json(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
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
    let result = run_prompt(session, prompt, selection, &tx).await;
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
        "done" => {
            println!();
        }
        _ => {}
    }
}
