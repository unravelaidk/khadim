use crate::domain::events::WorkerEvent;
use crate::infrastructure::browser::open_url;
use tokio::sync::mpsc::UnboundedSender;

/// Start OAuth login flow for a provider, sending events to the worker channel.
pub fn start_oauth_login(provider_id: &str, worker_tx: &UnboundedSender<WorkerEvent>) {
    let provider_id = provider_id.to_string();
    let tx = worker_tx.clone();

    match provider_id.as_str() {
        "github-copilot" => {
            tokio::spawn(async move {
                match khadim_ai_core::oauth::start_copilot_device_flow().await {
                    Ok(device_code) => {
                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: Some(device_code.verification_uri.clone()),
                            device_code: Some(device_code.user_code.clone()),
                            message: "Open the URL below and enter the code to authorize.".into(),
                        });
                        open_url(&device_code.verification_uri);

                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: None,
                            device_code: None,
                            message: "⏳ Waiting for authorization...".into(),
                        });

                        match khadim_ai_core::oauth::poll_copilot_device_flow(
                            &device_code.device_code,
                            device_code.interval,
                            device_code.expires_in,
                        )
                        .await
                        {
                            Ok(_) => {
                                let _ = tx.send(WorkerEvent::LoginComplete {
                                    success: true,
                                    message: "✓ GitHub Copilot connected! You can now select it as a provider.".into(),
                                });
                            }
                            Err(err) => {
                                let _ = tx.send(WorkerEvent::LoginComplete {
                                    success: false,
                                    message: format!("Login failed: {}", err.message),
                                });
                            }
                        }
                    }
                    Err(err) => {
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: format!("Failed to start login: {}", err.message),
                        });
                    }
                }
            });
        }
        "openai-codex" => {
            tokio::spawn(async move {
                match khadim_ai_core::oauth::start_openai_codex_login().await {
                    Ok(session_info) => {
                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: Some(session_info.auth_url.clone()),
                            device_code: None,
                            message: "Open the URL below to authorize.".into(),
                        });
                        open_url(&session_info.auth_url);

                        let _ = tx.send(WorkerEvent::LoginProgress {
                            url: None,
                            device_code: None,
                            message: "⏳ Waiting for authorization...".into(),
                        });

                        for _ in 0..150 {
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                            match khadim_ai_core::oauth::get_openai_codex_login_status(
                                &session_info.session_id,
                            )
                            .await
                            {
                                Ok(status) if status.status == "connected" => {
                                    let _ = tx.send(WorkerEvent::LoginComplete {
                                        success: true,
                                        message: "✓ OpenAI Codex connected!".into(),
                                    });
                                    return;
                                }
                                Ok(status) if status.status == "failed" => {
                                    let msg =
                                        status.error.unwrap_or_else(|| "Unknown error".into());
                                    let _ = tx.send(WorkerEvent::LoginComplete {
                                        success: false,
                                        message: format!("Login failed: {msg}"),
                                    });
                                    return;
                                }
                                _ => {}
                            }
                        }
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: "Login timed out.".into(),
                        });
                    }
                    Err(err) => {
                        let _ = tx.send(WorkerEvent::LoginComplete {
                            success: false,
                            message: format!("Failed to start login: {}", err.message),
                        });
                    }
                }
            });
        }
        _ => {}
    }
}
