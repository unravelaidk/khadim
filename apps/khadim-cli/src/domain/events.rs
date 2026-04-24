use khadim_ai_core::error::AppError;

// ── Worker events (from async tasks to UI thread) ────────────────────

pub enum WorkerEvent {
    Stream(khadim_coding_agent::events::AgentStreamEvent),
    Finished(Result<String, AppError>),
    LoginProgress {
        url: Option<String>,
        device_code: Option<String>,
        message: String,
    },
    LoginComplete {
        success: bool,
        message: String,
    },
}
