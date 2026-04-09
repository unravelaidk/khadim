use crate::khadim_ai::types::ChatMessage;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionTarget {
    Direct,
    Sandbox,
}

impl ExecutionTarget {
    pub fn from_str(value: &str) -> Self {
        match value {
            "docker" | "remote" | "sandbox" => Self::Sandbox,
            _ => Self::Direct,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Sandbox => "sandbox",
        }
    }
}

pub struct KhadimSession {
    pub id: String,
    pub workspace_id: String,
    pub cwd: PathBuf,
    pub source_cwd: PathBuf,
    pub execution_target: ExecutionTarget,
    pub sandbox_id: Option<String>,
    pub messages: Vec<ChatMessage>,
}

impl KhadimSession {
    pub fn new(
        workspace_id: String,
        cwd: PathBuf,
        source_cwd: PathBuf,
        execution_target: ExecutionTarget,
        sandbox_id: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id,
            cwd,
            source_cwd,
            execution_target,
            sandbox_id,
            messages: Vec::new(),
        }
    }
}
