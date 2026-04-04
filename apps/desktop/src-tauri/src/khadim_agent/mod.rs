pub mod modes;
pub mod orchestrator;
pub mod session;
pub mod subagent;
pub mod types;

use crate::error::AppError;
use crate::khadim_agent::session::KhadimSession;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;

pub struct KhadimManager {
    sessions: Mutex<HashMap<String, Arc<AsyncMutex<KhadimSession>>>>,
    runs: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
}

impl KhadimManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, workspace_id: String, cwd: PathBuf) -> String {
        let session = KhadimSession::new(workspace_id, cwd);
        let session_id = session.id.clone();
        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), Arc::new(AsyncMutex::new(session)));
        session_id
    }

    pub fn get_session(&self, session_id: &str) -> Result<Arc<AsyncMutex<KhadimSession>>, AppError> {
        self.sessions
            .lock()
            .unwrap()
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("Khadim session not found: {session_id}")))
    }

    pub fn track_run(&self, session_id: String, handle: tokio::task::JoinHandle<()>) {
        if let Some(existing) = self.runs.lock().unwrap().insert(session_id, handle) {
            existing.abort();
        }
    }

    pub fn clear_run(&self, session_id: &str) {
        self.runs.lock().unwrap().remove(session_id);
    }

    pub async fn abort(&self, session_id: &str) -> Result<(), AppError> {
        let handle = self.runs.lock().unwrap().remove(session_id);
        if let Some(handle) = handle {
            handle.abort();
            Ok(())
        } else {
            Err(AppError::not_found(format!(
                "No active Khadim run for session {session_id}"
            )))
        }
    }
}
