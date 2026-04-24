use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_coding_agent::{events::AgentStreamEvent, run_prompt, KhadimSession};

/// Run the agent once in non-interactive (batch) mode.
pub async fn run_once(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
) -> Result<(), AppError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
    let printer = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event.event_type.as_str() {
                "text_delta" => {
                    if let Some(content) = event.content {
                        print!("{content}");
                    }
                }
                "step_start" => {
                    if let Some(content) = event.content {
                        println!("\n[{content}]");
                    }
                }
                "step_update" => {
                    if let Some(ref metadata) = event.metadata {
                        if metadata.get("tool").and_then(|v| v.as_str()) == Some("model") {
                            if let Some(content) = event.content {
                                print!("{content}");
                            }
                        }
                    }
                }
                "step_complete" => {
                    if let Some(content) = event.content {
                        println!("[done] {content}");
                    }
                }
                "mode_selected" => {}
                "system_message" => {
                    if let Some(content) = event.content {
                        println!("\n{content}");
                    }
                }
                "error" => {
                    if let Some(content) = event.content {
                        println!("\n[error] {content}");
                    }
                }
                "done" => {
                    println!();
                }
                _ => {}
            }
        }
    });
    let result = run_prompt(session, prompt, selection, &tx).await;
    drop(tx);
    let _ = printer.await;
    result.map(|_| ())
}
