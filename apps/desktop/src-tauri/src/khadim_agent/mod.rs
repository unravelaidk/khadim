pub mod modes;
pub mod orchestrator;
pub mod session;
pub mod subagent;
pub mod types;

use crate::error::AppError;
use crate::khadim_agent::session::{ExecutionTarget, KhadimSession};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;

pub struct KhadimManager {
    sessions: Mutex<HashMap<String, Arc<AsyncMutex<KhadimSession>>>>,
    runs: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
    /// Pending question answer channels, keyed by session ID.
    /// When the question tool fires, it parks a oneshot sender here;
    /// `answer_question` resolves it from the frontend.
    pending_answers: Mutex<HashMap<String, tokio::sync::oneshot::Sender<String>>>,
}

impl KhadimManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            runs: Mutex::new(HashMap::new()),
            pending_answers: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(
        &self,
        workspace_id: String,
        cwd: PathBuf,
        source_cwd: PathBuf,
        execution_target: ExecutionTarget,
        sandbox_id: Option<String>,
    ) -> String {
        let session = KhadimSession::new(workspace_id, cwd, source_cwd, execution_target, sandbox_id);
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
        // Drop any pending question channel so the tool future is cancelled.
        self.pending_answers.lock().unwrap().remove(session_id);
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

    /// Park a oneshot sender that the question tool will await on.
    pub fn park_question(
        &self,
        session_id: String,
        sender: tokio::sync::oneshot::Sender<String>,
    ) {
        self.pending_answers.lock().unwrap().insert(session_id, sender);
    }

    /// Resolve a pending question with the user's answer.
    pub fn answer_question(&self, session_id: &str, answer: String) -> Result<(), AppError> {
        let sender = self.pending_answers.lock().unwrap().remove(session_id);
        match sender {
            Some(tx) => {
                let _ = tx.send(answer);
                Ok(())
            }
            None => Err(AppError::not_found(format!(
                "No pending question for session {session_id}"
            ))),
        }
    }
}
