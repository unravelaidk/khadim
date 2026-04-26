use crate::tools::question_tool::{QuestionRequest, QuestionResponse};
use std::collections::HashMap;

/// State held by the TUI while a question tool is awaiting answers.
pub struct PendingQuestionState {
    pub request: QuestionRequest,
    pub current_idx: usize,
    pub answers: HashMap<String, Vec<String>>,
    pub response_tx: tokio::sync::oneshot::Sender<QuestionResponse>,
}

impl PendingQuestionState {
    pub fn current_question(&self) -> Option<&crate::tools::question_tool::Question> {
        self.request.questions.get(self.current_idx)
    }

    #[allow(dead_code)]
    pub const fn is_last_question(&self) -> bool {
        self.current_idx + 1 >= self.request.questions.len()
    }

    pub fn submit_answer(&mut self, answer: Vec<String>) {
        if let Some(q) = self.request.questions.get(self.current_idx) {
            self.answers.insert(q.id.clone(), answer);
        }
        self.current_idx += 1;
    }

    pub const fn all_answered(&self) -> bool {
        self.current_idx >= self.request.questions.len()
    }

    pub fn build_response(&self) -> QuestionResponse {
        QuestionResponse {
            answers: self.answers.clone(),
        }
    }
}
