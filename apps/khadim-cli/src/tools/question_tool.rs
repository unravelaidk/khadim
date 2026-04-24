//! Interactive question tool for Khadim CLI.
//!
//! This tool lives in the CLI app (not the core crates) so that it can
//! communicate directly with the TUI or stdin.  It is injected into the
//! agent runtime via `AgentRuntime::with_extras`.
//!
//! Design inspired by:
//! - OpenAI Codex `request_user_input` tool (overlay with options + notes)
//! - Opencode `question` tool (batch questions, custom answer support)

use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::oneshot;

/// A single option for a question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

/// A single question to ask the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: String,
    pub question: String,
    #[serde(default)]
    pub options: Option<Vec<QuestionOption>>,
    /// When true and options are provided, allow a free-form "Other" answer.
    #[serde(default = "default_true")]
    pub allow_other: bool,
    /// When true, mask the input (for secrets).
    #[serde(default)]
    pub secret: bool,
}

fn default_true() -> bool {
    true
}

/// A batch of questions sent to the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionRequest {
    pub questions: Vec<Question>,
}

/// User answers mapped by question id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionResponse {
    pub answers: HashMap<String, Vec<String>>,
}

/// Bridge that carries question requests from the tool to the UI and
/// carries answers back.
#[derive(Clone, Debug)]
pub struct QuestionBridge {
    pub tx: tokio::sync::mpsc::UnboundedSender<(QuestionRequest, oneshot::Sender<QuestionResponse>)>,
}

/// The interactive question tool.
pub struct QuestionTool {
    bridge: QuestionBridge,
}

impl QuestionTool {
    pub fn new(bridge: QuestionBridge) -> Self {
        Self { bridge }
    }
}

#[async_trait::async_trait]
impl Tool for QuestionTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "question".to_string(),
            description: concat!(
                "Ask the user one or more questions during execution and wait for answers. ",
                "Use this to gather preferences, clarify ambiguous instructions, get decisions ",
                "on implementation choices, or offer directional choices. Each question can ",
                "provide 2-5 selectable options. When options are given, a free-form 'Other' ",
                "option is automatically available. Answers are returned as a map of question ",
                "ids to selected labels."
            )
            .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "description": "Questions to ask the user. Prefer 1 and do not exceed 3.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "Stable identifier for mapping answers (snake_case)."
                                },
                                "question": {
                                    "type": "string",
                                    "description": "Single-sentence prompt shown to the user."
                                },
                                "options": {
                                    "type": "array",
                                    "description": "Provide 2-5 mutually exclusive choices. Put the recommended option first and suffix its label with '(Recommended)'. Do not include an 'Other' option; it is added automatically.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "label": {
                                                "type": "string",
                                                "description": "User-facing label (1-5 words)."
                                            },
                                            "description": {
                                                "type": "string",
                                                "description": "One short sentence explaining impact/tradeoff if selected."
                                            }
                                        },
                                        "required": ["label", "description"]
                                    }
                                },
                                "allow_other": {
                                    "type": "boolean",
                                    "description": "Whether to allow a free-form 'Other' answer. Default true.",
                                    "default": true
                                },
                                "secret": {
                                    "type": "boolean",
                                    "description": "Whether to mask the input (for secrets). Default false.",
                                    "default": false
                                }
                            },
                            "required": ["id", "question"]
                        }
                    }
                },
                "required": ["questions"]
            }),
            prompt_snippet: "- question: Ask the user questions and wait for answers".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let request: QuestionRequest = serde_json::from_value(input)
            .map_err(|e| AppError::invalid_input(format!("Invalid question parameters: {e}")))?;

        if request.questions.is_empty() {
            return Err(AppError::invalid_input("At least one question is required."));
        }
        if request.questions.len() > 3 {
            return Err(AppError::invalid_input(
                "Too many questions. Maximum is 3.",
            ));
        }

        let (tx, rx) = oneshot::channel();
        self.bridge
            .tx
            .send((request.clone(), tx))
            .map_err(|_| AppError::io("Failed to send question request to UI"))?;

        let response = rx
            .await
            .map_err(|_| AppError::io("Question was cancelled or UI closed"))?;

        let formatted = request
            .questions
            .iter()
            .map(|q| {
                let ans = response
                    .answers
                    .get(&q.id)
                    .cloned()
                    .unwrap_or_default()
                    .join(", ");
                let display = if ans.is_empty() {
                    "Unanswered".to_string()
                } else {
                    ans
                };
                format!("\"{}\" = \"{}\"", q.question, display)
            })
            .collect::<Vec<_>>()
            .join("; ");

        let content = format!(
            "User answered your question{}: {}. You can now continue with the user's answers in mind.",
            if request.questions.len() > 1 { "s" } else { "" },
            formatted
        );

        Ok(ToolResult::with_metadata(
            content,
            json!({ "answers": response.answers }),
        ))
    }
}
