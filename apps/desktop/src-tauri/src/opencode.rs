use crate::error::AppError;
use crate::health;
use crate::process::ProcessRunner;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::Rng;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
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
        let password: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
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

    fn text_message_payload(content: &str, model: Option<&OpenCodeModelRef>) -> serde_json::Value {
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
    ) -> Result<serde_json::Value, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(300)) // Long timeout for LLM responses
            .build()
            .unwrap();

        let resp = client
            .post(format!("{}/session/{}/message", conn.base_url, session_id))
            .header("Authorization", Self::auth_header(conn))
            .header("Content-Type", "application/json")
            .json(&Self::text_message_payload(content, model))
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
    ) -> Result<(), AppError> {
        let client = Self::client_with_auth(conn);
        let resp = client
            .post(format!(
                "{}/session/{}/prompt_async",
                conn.base_url, session_id
            ))
            .header("Authorization", Self::auth_header(conn))
            .header("Content-Type", "application/json")
            .json(&Self::text_message_payload(content, model))
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
    /// Returns a JoinHandle so the caller can cancel it.
    pub fn subscribe_events(
        conn: &OpenCodeConnection,
        workspace_id: String,
        session_id: String,
        tx: mpsc::UnboundedSender<AgentStreamEvent>,
    ) -> tokio::task::JoinHandle<()> {
        let url = format!("{}/event", conn.base_url);
        let auth = Self::auth_header(conn);

        tokio::spawn(async move {
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
                                return;
                            }
                        }
                    }

                    data_buf.clear();
                }
            }

            let _ = tx.send(AgentStreamEvent {
                workspace_id,
                session_id,
                event_type: "done".to_string(),
                content: None,
                metadata: None,
            });
        })
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
            let filename = tool_filename(input);
            let title = tool_title(tool, filename.as_deref());

            let metadata = serde_json::json!({
                "id": part_id,
                "title": title,
                "tool": tool,
                "filename": filename,
                "result": summarize_tool_result(state),
            });

            match status {
                "pending" | "running" => vec![stream_event(
                    workspace_id,
                    session_id,
                    "step_start",
                    summarize_tool_input(input),
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

fn tool_filename(input: Option<&serde_json::Value>) -> Option<String> {
    input
        .and_then(|value| value.get("filePath").or_else(|| value.get("path")))
        .and_then(|value| value.as_str())
        .map(path_basename)
}

fn tool_title(tool: &str, filename: Option<&str>) -> String {
    match (tool, filename) {
        ("read", Some(filename)) => format!("Reading {filename}"),
        ("write", Some(filename)) => format!("Writing {filename}"),
        ("bash", _) => "Running command".to_string(),
        (_, Some(filename)) => format!("{} {filename}", tool.replace('_', " ")),
        _ => tool.replace('_', " "),
    }
}

fn summarize_tool_input(input: Option<&serde_json::Value>) -> Option<String> {
    let input = input?.as_object()?;
    if let Some(command) = input.get("command").and_then(|value| value.as_str()) {
        return Some(command.to_string());
    }
    if let Some(file_path) = input.get("filePath").and_then(|value| value.as_str()) {
        return Some(file_path.to_string());
    }
    None
}

fn summarize_tool_result(state: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    state
        .get("metadata")
        .and_then(|value| value.get("preview"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            state
                .get("output")
                .and_then(|value| value.as_str())
                .map(|value| {
                    let trimmed = value.trim();
                    if trimmed.len() > 240 {
                        format!("{}...", &trimmed[..240])
                    } else {
                        trimmed.to_string()
                    }
                })
        })
}

fn path_basename(path: &str) -> String {
    let segments: Vec<&str> = path.split(['/', '\\']).filter(|segment| !segment.is_empty()).collect();
    segments.last().copied().unwrap_or(path).to_string()
}
