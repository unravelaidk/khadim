use khadim_ai_core::error::AppError;
use tokio::sync::oneshot;

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
    /// A question tool wants to ask the user something.
    /// The UI should display the question and eventually send the answer
    /// back via the provided oneshot channel.
    QuestionRequest {
        request: crate::tools::question_tool::QuestionRequest,
        response_tx: oneshot::Sender<crate::tools::question_tool::QuestionResponse>,
    },
}
