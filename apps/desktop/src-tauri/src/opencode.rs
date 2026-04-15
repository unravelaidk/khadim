use crate::error::AppError;
use crate::health;
use crate::process::ProcessRunner;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

/// Normalized streaming event emitted to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct AgentStreamEvent {
    pub workspace_id: String,
    pub session_id: String,
    pub event_type: String, // text_delta, step_start, step_update, step_complete, done, error
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeModelRef {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeModelOption {
    pub provider_id: String,
    pub provider_name: String,
    pub model_id: String,
    pub model_name: String,
    pub is_default: bool,
}

/// Connection info for an OpenCode server instance.
#[derive(Debug, Clone, Serialize)]
pub struct OpenCodeConnection {
    pub workspace_id: String,
    pub base_url: String,
    pub username: String,
    pub password: String,
    pub process_id: String,
    pub healthy: bool,
}

/// An OpenCode session (from the API).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeSession {
    #[serde(rename = "sessionID")]
    pub session_id: Option<String>,
    pub id: Option<String>,
    // The API shape may vary; we accept both common field names
}

impl OpenCodeSession {
    pub fn get_id(&self) -> Option<&str> {
        self.session_id
            .as_deref()
            .or(self.id.as_deref())
    }
}

/// A message from OpenCode's message list endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeMessage {
    pub id: Option<String>,
    pub role: Option<String>,
    pub content: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Manages OpenCode server instances, one per workspace.
pub struct OpenCodeManager {
    connections: Mutex<HashMap<String, OpenCodeConnection>>,
    opencode_bin: String,
    /// Active event subscriptions keyed by session_id to prevent duplicate subscriptions.
    event_subscriptions: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
}

impl OpenCodeManager {
    pub fn new() -> Self {
        // Try to find opencode binary
        let opencode_bin = Self::find_opencode_binary()
            .unwrap_or_else(|| "opencode".to_string());

        log::info!("OpenCode binary: {}", opencode_bin);

        Self {
            connections: Mutex::new(HashMap::new()),
            opencode_bin,
            event_subscriptions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn find_opencode_binary() -> Option<String> {
        // Check common locations
        let candidates = [
            dirs::home_dir().map(|h| h.join(".opencode/bin/opencode")),
            Some(std::path::PathBuf::from("/usr/local/bin/opencode")),
            Some(std::path::PathBuf::from("/usr/bin/opencode")),
        ];

        for candidate in candidates.iter().flatten() {
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }

        // Fallback: check PATH
        if std::process::Command::new("which")
            .arg("opencode")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some("opencode".to_string());
        }

        None
    }

    /// Start an OpenCode server for a workspace.
    pub async fn start(
        &self,
        workspace_id: &str,
        repo_path: &str,
        port: u16,
        process_runner: &ProcessRunner,
        output_tx: Option<mpsc::UnboundedSender<crate::process::ProcessOutput>>,
    ) -> Result<OpenCodeConnection, AppError> {
        let process_id = format!("opencode-{workspace_id}");

        // Generate a random password for this instance
        let password: String = rand::rng()
            .sample_iter(rand::distr::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let username = "opencode".to_string();
        let base_url = format!("http://127.0.0.1:{port}");

        let port_str = port.to_string();
        let args = vec!["serve", "--port", &port_str, "--hostname", "127.0.0.1"];
        let envs = vec![("OPENCODE_SERVER_PASSWORD", password.as_str())];

        process_runner
            .spawn(
                process_id.clone(),
                format!("OpenCode ({})", workspace_id),
                &self.opencode_bin,
                &args.iter().map(|s| *s).collect::<Vec<_>>(),
                &envs,
                Some(repo_path),
                output_tx,
            )
            .await?;

        // Wait for health
        let health_result = health::wait_for_health_paths(
            &base_url,
            &["/global/health", "/health"],
            &username,
            &password,
            60, // max retries
            500, // interval ms
        )
        .await;

        let healthy = health_result.is_ok();

        let conn = OpenCodeConnection {
            workspace_id: workspace_id.to_string(),
            base_url,
            username,
            password,
            process_id,
            healthy,
        };

        self.connections
            .lock()
            .unwrap()
            .insert(workspace_id.to_string(), conn.clone());

        if let Err(err) = health_result {
            let _ = process_runner.kill(&conn.process_id).await;
            self.connections.lock().unwrap().remove(workspace_id);
            return Err(AppError::health(format!(
                "OpenCode server started but failed health check: {}",
                err.message
            )));
        }

        Ok(conn)
    }

    /// Stop an OpenCode server for a workspace.
    pub async fn stop(
        &self,
        workspace_id: &str,
        process_runner: &ProcessRunner,
    ) -> Result<(), AppError> {
        let process_id = format!("opencode-{workspace_id}");
        self.connections.lock().unwrap().remove(workspace_id);
        process_runner.kill(&process_id).await
    }

    /// Get the connection for a workspace.
    pub fn get_connection(&self, workspace_id: &str) -> Option<OpenCodeConnection> {
        self.connections.lock().unwrap().get(workspace_id).cloned()
    }

    /// Check if there's an active connection for a workspace.
    pub fn is_running(&self, workspace_id: &str) -> bool {
        self.connections.lock().unwrap().contains_key(workspace_id)
    }

    fn client_with_auth(_conn: &OpenCodeConnection) -> Client {
        Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap()
    }

    fn auth_header(conn: &OpenCodeConnection) -> String {
        let creds = BASE64.encode(format!("{}:{}", conn.username, conn.password));
        format!("Basic {creds}")
    }

    fn text_message_payload(
        content: &str,
        model: Option<&OpenCodeModelRef>,
        system: Option<&str>,
    ) -> serde_json::Value {
        let mut payload = serde_json::json!({
            "parts": [
                {
                    "type": "text",
                    "text": content,
                }
            ]
        });

        if let Some(model) = model {
            payload["model"] = serde_json::json!({
                "providerID": model.provider_id,
                "modelID": model.model_id,
            });
        }

        if let Some(system) = system.map(str::trim).filter(|value| !value.is_empty()) {
            payload["system"] = serde_json::json!(system);
        }

        payload
    }

    // ── OpenCode API methods ─────────────────────────────────────────

    /// Create a new session on the OpenCode server.
    pub async fn create_session(
        conn: &OpenCodeConnection,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!("{}/session", conn.base_url))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to create session: HTTP {status} — {body}"
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse session response: {e}")))
    }

    /// List all sessions.
    pub async fn list_sessions(
        conn: &OpenCodeConnection,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!("{}/session", conn.base_url))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse sessions: {e}")))
    }

    /// Send a message to a session (synchronous — waits for completion).
    pub async fn send_message(
        conn: &OpenCodeConnection,
        session_id: &str,
        content: &str,
        model: Option<&OpenCodeModelRef>,
        system: Option<&str>,
    ) -> Result<serde_json::Value, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(300)) // Long timeout for LLM responses
            .build()
            .unwrap();

        let resp = client
            .post(format!("{}/session/{}/message", conn.base_url, session_id))
            .header("Authorization", Self::auth_header(conn))
            .header("Content-Type", "application/json")
            .json(&Self::text_message_payload(content, model, system))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to send message: HTTP {status} — {body}"
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse message response: {e}")))
    }

    /// Send a message asynchronously (returns immediately, use SSE for updates).
    pub async fn send_message_async(
        conn: &OpenCodeConnection,
        session_id: &str,
        content: &str,
        model: Option<&OpenCodeModelRef>,
        system: Option<&str>,
    ) -> Result<(), AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!(
                "{}/session/{}/prompt_async",
                conn.base_url, session_id
            ))
            .header("Authorization", Self::auth_header(conn))
            .header("Content-Type", "application/json")
            .json(&Self::text_message_payload(content, model, system))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to send async message: HTTP {status} — {body}"
            )));
        }

        Ok(())
    }

    /// Reply to a pending question request.
    pub async fn reply_question(
        conn: &OpenCodeConnection,
        request_id: &str,
        answers: &[Vec<String>],
    ) -> Result<(), AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!("{}/question/{}/reply", conn.base_url, request_id))
            .header("Authorization", Self::auth_header(conn))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "answers": answers,
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to reply to question: HTTP {status} — {body}"
            )));
        }

        Ok(())
    }

    /// Reject a pending question request.
    pub async fn reject_question(
        conn: &OpenCodeConnection,
        request_id: &str,
    ) -> Result<(), AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!("{}/question/{}/reject", conn.base_url, request_id))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to reject question: HTTP {status} — {body}"
            )));
        }

        Ok(())
    }

    /// List available models from provider config.
    pub async fn list_models(
        conn: &OpenCodeConnection,
    ) -> Result<Vec<OpenCodeModelOption>, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!("{}/config/providers", conn.base_url))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to list models: HTTP {status} — {body}"
            )));
        }

        let payload = resp.json::<serde_json::Value>().await.map_err(|e| {
            AppError::health(format!("Failed to parse models response: {e}"))
        })?;

        let defaults = payload
            .get("default")
            .and_then(|value| value.as_object())
            .cloned()
            .unwrap_or_default();

        let mut options = Vec::new();
        for provider in payload
            .get("providers")
            .and_then(|value| value.as_array())
            .into_iter()
            .flatten()
        {
            let provider_id = match provider.get("id").and_then(|value| value.as_str()) {
                Some(value) => value.to_string(),
                None => continue,
            };
            let provider_name = provider
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or(&provider_id)
                .to_string();
            let default_model = defaults
                .get(&provider_id)
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();

            if let Some(models) = provider.get("models").and_then(|value| value.as_object()) {
                for (model_id, model) in models {
                    let model_name = model
                        .get("name")
                        .and_then(|value| value.as_str())
                        .unwrap_or(model_id)
                        .to_string();
                    let status = model
                        .get("status")
                        .and_then(|value| value.as_str())
                        .unwrap_or("active");
                    if status != "active" {
                        continue;
                    }

                    options.push(OpenCodeModelOption {
                        provider_id: provider_id.clone(),
                        provider_name: provider_name.clone(),
                        model_id: model_id.clone(),
                        model_name,
                        is_default: default_model == *model_id,
                    });
                }
            }
        }

        options.sort_by(|a, b| {
            a.provider_name
                .cmp(&b.provider_name)
                .then(a.model_name.cmp(&b.model_name))
        });

        Ok(options)
    }

    /// Abort a running session.
    pub async fn abort_session(
        conn: &OpenCodeConnection,
        session_id: &str,
    ) -> Result<(), AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!("{}/session/{}/abort", conn.base_url, session_id))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Failed to abort session: HTTP {status} — {body}"
            )));
        }

        Ok(())
    }

    /// List messages in a session.
    pub async fn list_messages(
        conn: &OpenCodeConnection,
        session_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!(
                "{}/session/{}/message",
                conn.base_url, session_id
            ))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse messages: {e}")))
    }

    /// Get session diff.
    pub async fn get_diff(
        conn: &OpenCodeConnection,
        session_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!("{}/session/{}/diff", conn.base_url, session_id))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse diff: {e}")))
    }

    /// Get all session statuses.
    pub async fn session_statuses(
        conn: &OpenCodeConnection,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!("{}/session/status", conn.base_url))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse statuses: {e}")))
    }

    /// Get VCS info.
    pub async fn vcs_info(
        conn: &OpenCodeConnection,
    ) -> Result<serde_json::Value, AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .get(format!("{}/vcs", conn.base_url))
            .header("Authorization", Self::auth_header(conn))
            .send()
            .await?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| AppError::health(format!("Failed to parse VCS info: {e}")))
    }

    /// Get the SSE event stream URL (frontend connects directly).
    pub fn event_stream_url(conn: &OpenCodeConnection) -> String {
        format!("{}/event", conn.base_url)
    }

    /// Subscribe to OpenCode's /event SSE stream and forward normalized events.
    /// Cancels any existing subscription for the same session_id to prevent duplicate events.
    pub fn subscribe_events(
        &self,
        conn: &OpenCodeConnection,
        workspace_id: String,
        session_id: String,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) {
        // Cancel any existing subscription for this session to prevent duplicates
        if let Some(existing) = self.event_subscriptions.lock().unwrap().remove(&session_id) {
            existing.abort();
            log::debug!("Cancelled existing event subscription for session {}", session_id);
        }

        let url = format!("{}/event", conn.base_url);
        let auth = Self::auth_header(conn);
        let session_id_for_cleanup = session_id.clone();
        let subscriptions = self.event_subscriptions.clone();

        let handle = tokio::spawn(async move {
            let client = Client::builder().build().unwrap();

            let resp = {
                let mut last_error = None;

                let mut response = None;
                for attempt in 0..20 {
                    match client
                        .get(&url)
                        .header("Authorization", &auth)
                        .header("Accept", "text/event-stream")
                        .send()
                        .await
                    {
                        Ok(candidate) => match candidate.error_for_status() {
                            Ok(candidate) => {
                                response = Some(candidate);
                                break;
                            }
                            Err(err) => last_error = Some(err.to_string()),
                        },
                        Err(err) => last_error = Some(err.to_string()),
                    }

                    if attempt < 19 {
                        // The server can pass health checks before the event bus is ready.
                        tokio::time::sleep(Duration::from_millis(250)).await;
                    }
                }

                match response {
                    Some(response) => response,
                    None => {
                        break_err(&tx, &workspace_id, &session_id, last_error);
                        // Clean up subscription on error
                        subscriptions.lock().unwrap().remove(&session_id);
                        return;
                    }
                }
            };

            use tokio::io::AsyncBufReadExt;
            let stream = resp.bytes_stream();
            use futures_util::StreamExt;

            let mut data_buf = String::new();
            let mut part_kinds = HashMap::<String, String>::new();
            let mut part_buffers = HashMap::<String, String>::new();

            let mut byte_stream = tokio_util::io::StreamReader::new(
                stream.map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))),
            );
            let mut lines = tokio::io::BufReader::new(&mut byte_stream).lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.starts_with("data:") {
                    data_buf.push_str(line[5..].trim());
                } else if line.is_empty() && !data_buf.is_empty() {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data_buf) {
                        let events = normalize_opencode_event(
                            &workspace_id,
                            &session_id,
                            &parsed,
                            &mut part_kinds,
                            &mut part_buffers,
                        );

                        for evt in events {
                            if tx.send(evt).is_err() {
                                // Channel closed, clean up and exit
                                subscriptions.lock().unwrap().remove(&session_id);
                                return;
                            }
                        }
                    }

                    data_buf.clear();
                }
            }

            let _ = tx.send(AgentStreamEvent {
                workspace_id,
                session_id: session_id.clone(),
                event_type: "done".to_string(),
                content: None,
                metadata: None,
            });

            // Clean up subscription when done
            subscriptions.lock().unwrap().remove(&session_id);
        });

        // Store the subscription handle for potential cancellation
        self.event_subscriptions
            .lock()
            .unwrap()
            .insert(session_id_for_cleanup, handle);
    }

    /// Clear the event subscription for a session when streaming ends.
    pub fn clear_event_subscription(&self, session_id: &str) {
        self.event_subscriptions.lock().unwrap().remove(session_id);
    }
}

fn break_err(
    tx: &mpsc::UnboundedSender<AgentStreamEvent>,
    workspace_id: &str,
    session_id: &str,
    last_error: Option<String>,
) {
    let _ = tx.send(AgentStreamEvent {
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
        event_type: "error".to_string(),
        content: Some(format!(
            "SSE connect failed: {}",
            last_error.unwrap_or_else(|| "unknown error".to_string())
        )),
        metadata: None,
    });
}

/// Find a free TCP port on localhost.
pub fn find_free_port() -> Result<u16, AppError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::io(format!("Failed to bind to find free port: {e}")))?;
    let port = listener.local_addr().unwrap().port();
    Ok(port)
}

fn normalize_opencode_event(
    workspace_id: &str,
    session_id: &str,
    payload: &serde_json::Value,
    part_kinds: &mut HashMap<String, String>,
    part_buffers: &mut HashMap<String, String>,
) -> Vec<AgentStreamEvent> {
    let raw_type = match payload.get("type").and_then(|value| value.as_str()) {
        Some(raw_type) => raw_type,
        None => return vec![],
    };

    let properties = match payload.get("properties").and_then(|value| value.as_object()) {
        Some(properties) => properties,
        None => return vec![],
    };

    if let Some(event_session_id) = properties.get("sessionID").and_then(|value| value.as_str()) {
        if event_session_id != session_id {
            return vec![];
        }
    }

    match raw_type {
        "message.updated" => normalize_message_updated(workspace_id, session_id, properties),
        "message.part.delta" => normalize_part_delta(
            workspace_id,
            session_id,
            properties,
            part_kinds,
            part_buffers,
        ),
        "message.part.updated" => {
            normalize_part_updated(workspace_id, session_id, properties, part_kinds, part_buffers)
        }
        "question.asked" => normalize_question_asked(workspace_id, session_id, properties),
        "question.replied" => normalize_question_replied(workspace_id, session_id, properties),
        "question.rejected" => normalize_question_rejected(workspace_id, session_id, properties),
        "session.status" => {
            if properties
                .get("status")
                .and_then(|value| value.get("type"))
                .and_then(|value| value.as_str())
                == Some("idle")
            {
                vec![stream_event(workspace_id, session_id, "done", None, None)]
            } else {
                vec![]
            }
        }
        _ => vec![],
    }
}

fn normalize_question_asked(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
) -> Vec<AgentStreamEvent> {
    let request_id = match properties.get("id").and_then(|value| value.as_str()) {
        Some(request_id) => request_id,
        None => return vec![],
    };

    let questions = properties
        .get("questions")
        .cloned()
        .unwrap_or(serde_json::Value::Array(vec![]));

    vec![stream_event(
        workspace_id,
        session_id,
        "question",
        None,
        Some(serde_json::json!({
            "id": request_id,
            "questions": questions,
        })),
    )]
}

fn normalize_question_replied(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
) -> Vec<AgentStreamEvent> {
    let request_id = match properties.get("requestID").and_then(|value| value.as_str()) {
        Some(request_id) => request_id,
        None => return vec![],
    };

    vec![stream_event(
        workspace_id,
        session_id,
        "question_replied",
        None,
        Some(serde_json::json!({
            "id": request_id,
            "answers": properties.get("answers").cloned().unwrap_or(serde_json::Value::Array(vec![])),
        })),
    )]
}

fn normalize_question_rejected(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
) -> Vec<AgentStreamEvent> {
    let request_id = match properties.get("requestID").and_then(|value| value.as_str()) {
        Some(request_id) => request_id,
        None => return vec![],
    };

    vec![stream_event(
        workspace_id,
        session_id,
        "question_rejected",
        None,
        Some(serde_json::json!({
            "id": request_id,
        })),
    )]
}

fn normalize_message_updated(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
) -> Vec<AgentStreamEvent> {
    let info = match properties.get("info").and_then(|value| value.as_object()) {
        Some(info) => info,
        None => return vec![],
    };

    let role = info.get("role").and_then(|value| value.as_str());
    if role != Some("assistant") {
        return vec![];
    }

    let message_id = match info.get("id").and_then(|value| value.as_str()) {
        Some(message_id) => message_id,
        None => return vec![],
    };

    let mut events = vec![stream_event(
        workspace_id,
        session_id,
        "message_start",
        None,
        Some(serde_json::json!({
            "messageId": message_id,
            "role": "assistant",
        })),
    )];

    // Extract token usage from info.tokens (OpenCode) or info.usage (fallback).
    let tokens = info.get("tokens").or_else(|| info.get("usage"));
    if let Some(tokens) = tokens {
        let input  = tokens.get("input").and_then(|v| v.as_i64()).unwrap_or(0);
        let output = tokens.get("output").and_then(|v| v.as_i64()).unwrap_or(0);
        let cache_read  = tokens.get("cache_read").and_then(|v| v.as_i64()).unwrap_or(0);
        let cache_write = tokens.get("cache_write").and_then(|v| v.as_i64()).unwrap_or(0);

        if input > 0 || output > 0 {
            events.push(stream_event(
                workspace_id,
                session_id,
                "usage_update",
                None,
                Some(serde_json::json!({
                    "input_tokens":       input,
                    "output_tokens":      output,
                    "cache_read_tokens":  cache_read,
                    "cache_write_tokens": cache_write,
                })),
            ));
        }
    }

    events
}

fn normalize_part_delta(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
    part_kinds: &mut HashMap<String, String>,
    part_buffers: &mut HashMap<String, String>,
) -> Vec<AgentStreamEvent> {
    let part_id = match properties.get("partID").and_then(|value| value.as_str()) {
        Some(part_id) => part_id,
        None => return vec![],
    };

    let delta = match properties.get("delta").and_then(|value| value.as_str()) {
        Some(delta) => delta,
        None => return vec![],
    };

    match part_kinds.get(part_id).map(|value| value.as_str()) {
        Some("final_answer") => vec![stream_event(
            workspace_id,
            session_id,
            "text_delta",
            Some(delta.to_string()),
            None,
        )],
        Some("reasoning") | Some("commentary") => {
            let entry = part_buffers.entry(part_id.to_string()).or_default();
            entry.push_str(delta);

            let kind = part_kinds
                .get(part_id)
                .cloned()
                .unwrap_or_else(|| "commentary".to_string());
            let title = if kind == "reasoning" {
                "Thinking"
            } else {
                "Working"
            };

            vec![stream_event(
                workspace_id,
                session_id,
                "step_update",
                Some(entry.clone()),
                Some(serde_json::json!({
                    "id": part_id,
                    "title": title,
                    "tool": kind,
                })),
            )]
        }
        _ => vec![],
    }
}

fn normalize_part_updated(
    workspace_id: &str,
    session_id: &str,
    properties: &serde_json::Map<String, serde_json::Value>,
    part_kinds: &mut HashMap<String, String>,
    part_buffers: &mut HashMap<String, String>,
) -> Vec<AgentStreamEvent> {
    let part = match properties.get("part").and_then(|value| value.as_object()) {
        Some(part) => part,
        None => return vec![],
    };

    let part_id = match part.get("id").and_then(|value| value.as_str()) {
        Some(part_id) => part_id,
        None => return vec![],
    };

    match part.get("type").and_then(|value| value.as_str()) {
        Some("reasoning") => {
            part_kinds.insert(part_id.to_string(), "reasoning".to_string());
            let text = part
                .get("text")
                .and_then(|value| value.as_str())
                .unwrap_or_default();

            if has_part_end(part) {
                part_buffers.remove(part_id);
                vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_complete",
                    (!text.is_empty()).then(|| text.to_string()),
                    Some(serde_json::json!({
                        "id": part_id,
                        "title": extract_reasoning_title(text),
                        "tool": "reasoning",
                        "result": text,
                    })),
                )]
            } else {
                vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_start",
                    None,
                    Some(serde_json::json!({
                        "id": part_id,
                        "title": "Thinking",
                        "tool": "reasoning",
                    })),
                )]
            }
        }
        Some("text") => {
            let phase = part
                .get("metadata")
                .and_then(|value| value.get("openai"))
                .and_then(|value| value.get("phase"))
                .and_then(|value| value.as_str());
            let text = part
                .get("text")
                .and_then(|value| value.as_str())
                .unwrap_or_default();

            match phase {
                Some("commentary") => {
                    part_kinds.insert(part_id.to_string(), "commentary".to_string());
                    if has_part_end(part) {
                        part_buffers.remove(part_id);
                        vec![stream_event(
                            workspace_id,
                            session_id,
                            "step_complete",
                            (!text.is_empty()).then(|| text.to_string()),
                            Some(serde_json::json!({
                                "id": part_id,
                                "title": "Working",
                                "tool": "commentary",
                                "result": text,
                            })),
                        )]
                    } else {
                        vec![stream_event(
                            workspace_id,
                            session_id,
                            "step_start",
                            None,
                            Some(serde_json::json!({
                                "id": part_id,
                                "title": "Working",
                                "tool": "commentary",
                            })),
                        )]
                    }
                }
                Some("final_answer") => {
                    part_kinds.insert(part_id.to_string(), "final_answer".to_string());
                    if has_part_end(part) {
                        vec![stream_event(workspace_id, session_id, "done", None, None)]
                    } else {
                        vec![]
                    }
                }
                _ => vec![],
            }
        }
        Some("subtask") => {
            let agent = part
                .get("agent")
                .and_then(|value| value.as_str())
                .unwrap_or("subagent");
            let description = part
                .get("description")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let prompt = part
                .get("prompt")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());

            let title = match description {
                Some(description) => format!("{agent}: {description}"),
                None => format!("Subagent: {agent}"),
            };
            let content = [
                description.map(|value| value.to_string()),
                Some(format!("subagent: {agent}")),
                prompt.map(|value| truncate_text(value, 420)),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join("\n\n");

            vec![stream_event(
                workspace_id,
                session_id,
                "step_start",
                (!content.is_empty()).then_some(content),
                Some(serde_json::json!({
                    "id": part_id,
                    "title": title,
                    "tool": "subtask",
                    "subagentType": agent,
                    "taskDescription": description,
                    "taskPrompt": prompt,
                })),
            )]
        }
        Some("tool") => {
            let tool = part
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            let state = match part.get("state").and_then(|value| value.as_object()) {
                Some(state) => state,
                None => return vec![],
            };
            let status = state
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("pending");
            let input = state.get("input");

            // Question prompts are surfaced via dedicated question.* events.
            // Keep the tool step only for completion state in the timeline.
            if tool == "question" {
                if status == "pending" || status == "running" {
                    return vec![];
                }

                let result_text = state
                    .get("output")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| summarize_tool_result(state));

                return vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_complete",
                    result_text,
                    Some(serde_json::json!({
                        "id": part_id,
                        "title": "Question answered",
                        "tool": "question",
                    })),
                )];
            }

            let file_path = tool_file_path(input);
            let filename = tool_filename(input);
            let title = tool_title(tool, input, filename.as_deref());
            let subagent_type = (tool == "task")
                .then(|| {
                    input
                        .and_then(|value| value.get("subagent_type"))
                        .and_then(|value| value.as_str())
                })
                .flatten();
            let task_description = (tool == "task")
                .then(|| {
                    input
                        .and_then(|value| value.get("description"))
                        .and_then(|value| value.as_str())
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                })
                .flatten();
            let task_prompt = (tool == "task")
                .then(|| {
                    input
                        .and_then(|value| value.get("prompt"))
                        .and_then(|value| value.as_str())
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                })
                .flatten();

            // For write/edit tools, capture the file content so the
            // frontend can display the full file instead of just a summary.
            let file_content = if matches!(tool, "write" | "edit") {
                input
                    .and_then(|value| value.get("content"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            } else {
                None
            };

            let metadata = serde_json::json!({
                "id": part_id,
                "title": title,
                "tool": tool,
                "filename": filename,
                "filePath": file_path,
                "fileContent": file_content,
                "result": summarize_tool_result(state),
                "subagentType": subagent_type,
                "taskDescription": task_description,
                "taskPrompt": task_prompt,
                "is_error": matches!(status, "error" | "failed"),
            });

            match status {
                "pending" | "running" => vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_start",
                    summarize_tool_input(tool, input),
                    Some(metadata),
                )],
                "completed" => vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_complete",
                    summarize_tool_result(state),
                    Some(metadata),
                )],
                "error" | "failed" => vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_complete",
                    summarize_tool_result(state),
                    Some(metadata),
                )],
                _ => vec![],
            }
        }
        _ => vec![],
    }
}

fn stream_event(
    workspace_id: &str,
    session_id: &str,
    event_type: &str,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
) -> AgentStreamEvent {
    AgentStreamEvent {
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
        event_type: event_type.to_string(),
        content,
        metadata,
    }
}

fn has_part_end(part: &serde_json::Map<String, serde_json::Value>) -> bool {
    part.get("time")
        .and_then(|value| value.get("end"))
        .is_some()
}

fn extract_reasoning_title(text: &str) -> String {
    text.lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("**") && trimmed.ends_with("**") && trimmed.len() > 4 {
                Some(trimmed.trim_matches('*').to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "Thinking".to_string())
}

fn tool_file_path(input: Option<&serde_json::Value>) -> Option<String> {
    input
        .and_then(|value| value.get("filePath").or_else(|| value.get("path")))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn tool_filename(input: Option<&serde_json::Value>) -> Option<String> {
    tool_file_path(input).map(|path| path_basename(&path))
}

fn tool_title(tool: &str, input: Option<&serde_json::Value>, filename: Option<&str>) -> String {
    match tool {
        "task" => {
            let subagent_type = input
                .and_then(|value| value.get("subagent_type"))
                .and_then(|value| value.as_str())
                .unwrap_or("subagent");
            let description = input
                .and_then(|value| value.get("description"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());

            match description {
                Some(description) => format!("Launching {subagent_type}: {description}"),
                None => format!("Launching {subagent_type}"),
            }
        }
        "question" => "Question".to_string(),
        _ => match (tool, filename) {
            ("read", Some(filename)) => format!("Reading {filename}"),
            ("write", Some(filename)) => format!("Writing {filename}"),
            ("bash", _) => "Running command".to_string(),
            (_, Some(filename)) => format!("{} {filename}", tool.replace('_', " ")),
            _ => tool.replace('_', " "),
        },
    }
}

fn summarize_tool_input(tool: &str, input: Option<&serde_json::Value>) -> Option<String> {
    let input = input?.as_object()?;
    if tool == "task" {
        let description = input
            .get("description")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let subagent_type = input
            .get("subagent_type")
            .and_then(|value| value.as_str())
            .map(|value| format!("subagent: {value}"));
        let prompt = input
            .get("prompt")
            .and_then(|value| value.as_str())
            .map(|value| truncate_text(value, 420));

        let summary = [description, subagent_type, prompt]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join("\n\n");
        if !summary.is_empty() {
            return Some(summary);
        }
    }

    if let Some(command) = input.get("command").and_then(|value| value.as_str()) {
        return Some(command.to_string());
    }
    if let Some(file_path) = input.get("filePath").and_then(|value| value.as_str()) {
        return Some(file_path.to_string());
    }
    if let Some(path) = input.get("path").and_then(|value| value.as_str()) {
        return Some(path.to_string());
    }

    serde_json::to_string_pretty(input)
        .ok()
        .map(|value| truncate_text(&value, 420))
}

fn summarize_tool_result(state: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    if let Some(output) = state.get("output").and_then(|value| value.as_object()) {
        for key in ["result", "message", "text", "summary"] {
            if let Some(value) = output.get(key).and_then(|value| value.as_str()) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return Some(truncate_text(trimmed, 420));
                }
            }
        }

        if let Some(task_id) = output.get("task_id").and_then(|value| value.as_str()) {
            return Some(format!("Task started: {task_id}"));
        }
    }

    state
        .get("metadata")
        .and_then(|value| value.get("preview"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            state
                .get("output")
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value.trim(), 240))
        })
}

fn truncate_text(value: &str, max_len: usize) -> String {
    if value.len() > max_len {
        format!("{}...", value[..max_len].trim_end())
    } else {
        value.to_string()
    }
}

fn path_basename(path: &str) -> String {
    let segments: Vec<&str> = path.split(['/', '\\']).filter(|segment| !segment.is_empty()).collect();
    segments.last().copied().unwrap_or(path).to_string()
}
