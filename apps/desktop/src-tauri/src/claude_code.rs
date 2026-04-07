use crate::error::AppError;
use crate::opencode::{OpenCodeModelOption, OpenCodeModelRef};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeCodeSessionCreated {
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct ClaudeCodeSession {
    pub id: String,
    pub workspace_id: String,
    pub cwd: PathBuf,
    pub started: bool,
}

pub struct ClaudeCodeManager {
    sessions: Mutex<HashMap<String, ClaudeCodeSession>>,
    runs: Mutex<HashMap<String, Arc<AsyncMutex<Child>>>>,
    bridge_script_path: PathBuf,
    package_root: PathBuf,
}

impl ClaudeCodeManager {
    pub fn new() -> Self {
        let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let bridge_script_path = package_root.join("scripts").join("claude-agent-bridge.mjs");

        Self {
            sessions: Mutex::new(HashMap::new()),
            runs: Mutex::new(HashMap::new()),
            bridge_script_path,
            package_root,
        }
    }

    pub fn create_session(&self, workspace_id: String, cwd: PathBuf) -> ClaudeCodeSessionCreated {
        let id = uuid::Uuid::new_v4().to_string();
        let session = ClaudeCodeSession {
            id: id.clone(),
            workspace_id,
            cwd,
            started: false,
        };
        self.sessions.lock().unwrap().insert(id.clone(), session);
        ClaudeCodeSessionCreated { id }
    }

    pub fn get_session(&self, session_id: &str) -> Result<ClaudeCodeSession, AppError> {
        self.sessions
            .lock()
            .unwrap()
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("Claude Code session not found: {session_id}")))
    }

    pub fn mark_started(&self, session_id: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::not_found(format!("Claude Code session not found: {session_id}")))?;
        session.started = true;
        Ok(())
    }

    pub fn bridge_script_path(&self) -> &Path {
        &self.bridge_script_path
    }

    pub fn package_root(&self) -> &Path {
        &self.package_root
    }

    pub fn ensure_bridge_available(&self) -> Result<(), AppError> {
        if self.bridge_script_path.exists() {
            Ok(())
        } else {
            Err(AppError::not_found(format!(
                "Claude Code bridge script not found at {}",
                self.bridge_script_path.display()
            )))
        }
    }

    pub fn track_run(&self, session_id: String, child: Arc<AsyncMutex<Child>>) {
        self.runs.lock().unwrap().insert(session_id, child);
    }

    pub fn clear_run(&self, session_id: &str) {
        self.runs.lock().unwrap().remove(session_id);
    }

    pub fn is_running(&self, session_id: &str) -> bool {
        self.runs.lock().unwrap().contains_key(session_id)
    }

    pub async fn abort(&self, session_id: &str) -> Result<(), AppError> {
        let child = self.runs.lock().unwrap().remove(session_id);
        let Some(child) = child else {
            return Err(AppError::not_found(format!(
                "No active Claude Code run for session {session_id}"
            )));
        };

        let mut child = child.lock().await;
        child
            .kill()
            .await
            .map_err(|err| AppError::process_kill(format!("Failed to stop Claude Code run: {err}")))
    }

    pub fn list_models(&self) -> Vec<OpenCodeModelOption> {
        vec![
            OpenCodeModelOption {
                provider_id: "anthropic".to_string(),
                provider_name: "Anthropic".to_string(),
                model_id: "claude-sonnet-4-6".to_string(),
                model_name: "Claude Sonnet 4.6".to_string(),
                is_default: true,
            },
            OpenCodeModelOption {
                provider_id: "anthropic".to_string(),
                provider_name: "Anthropic".to_string(),
                model_id: "claude-opus-4-6".to_string(),
                model_name: "Claude Opus 4.6".to_string(),
                is_default: false,
            },
            OpenCodeModelOption {
                provider_id: "anthropic".to_string(),
                provider_name: "Anthropic".to_string(),
                model_id: "claude-haiku-4-5".to_string(),
                model_name: "Claude Haiku 4.5".to_string(),
                is_default: false,
            },
        ]
    }

    pub fn resolve_model_id(model: Option<&OpenCodeModelRef>) -> Option<String> {
        model.map(|value| value.model_id.clone())
    }
}
