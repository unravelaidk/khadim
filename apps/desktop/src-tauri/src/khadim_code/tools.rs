use crate::error::AppError;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub prompt_snippet: String,
}

#[derive(Debug, Clone)]
pub struct ToolResult {
    pub content: String,
    pub metadata: Option<Value>,
}

#[async_trait]
pub trait Tool: Send + Sync {
    fn definition(&self) -> ToolDefinition;
    async fn execute(&self, input: Value) -> Result<ToolResult, AppError>;
}

fn normalize_path(root: &Path, raw: &str) -> Result<PathBuf, AppError> {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    let normalized = joined.components().fold(PathBuf::new(), |mut acc, component| {
        use std::path::Component;
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                acc.pop();
            }
            other => acc.push(other.as_os_str()),
        }
        acc
    });

    if !normalized.starts_with(root) {
        return Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {}",
            normalized.display()
        )));
    }

    Ok(normalized)
}

pub struct ReadTool {
    root: PathBuf,
}

impl ReadTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for ReadTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read".to_string(),
            description: "Read a file or directory. Supports offset and limit for text files."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "offset": {"type": "integer"},
                    "limit": {"type": "integer"}
                },
                "required": ["path"]
            }),
            prompt_snippet: "- read: Read file contents or list a directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("read requires a path"))?;
        let offset = input.get("offset").and_then(|value| value.as_u64()).unwrap_or(1) as usize;
        let limit = input.get("limit").and_then(|value| value.as_u64()).unwrap_or(200) as usize;
        let target = normalize_path(&self.root, path)?;

        if target.is_dir() {
            let mut entries = std::fs::read_dir(&target)?
                .filter_map(Result::ok)
                .map(|entry| {
                    let mut name = entry.file_name().to_string_lossy().to_string();
                    if entry.path().is_dir() {
                        name.push('/');
                    }
                    name
                })
                .collect::<Vec<_>>();
            entries.sort();
            return Ok(ToolResult {
                content: entries.join("\n"),
                metadata: None,
            });
        }

        let content = std::fs::read_to_string(&target)?;
        let lines = content.lines().collect::<Vec<_>>();
        let start = offset.saturating_sub(1);
        let end = usize::min(start + limit, lines.len());
        let body = lines[start..end]
            .iter()
            .enumerate()
            .map(|(index, line)| format!("{}: {}", start + index + 1, line))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(ToolResult {
            content: body,
            metadata: Some(json!({
                "filePath": target.to_string_lossy(),
                "filename": target.file_name().and_then(|value| value.to_str()),
            })),
        })
    }
}

pub struct WriteTool {
    root: PathBuf,
}

impl WriteTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for WriteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "write".to_string(),
            description: "Write a full file to disk, creating parent directories when needed."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }),
            prompt_snippet: "- write: Write or replace a file".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("write requires a path"))?;
        let content = input
            .get("content")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("write requires content"))?;
        let target = normalize_path(&self.root, path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, content)?;
        Ok(ToolResult {
            content: format!("Wrote {} bytes to {}", content.len(), target.display()),
            metadata: Some(json!({
                "filePath": target.to_string_lossy(),
                "filename": target.file_name().and_then(|value| value.to_str()),
                "fileContent": content,
            })),
        })
    }
}

pub struct ListFilesTool {
    root: PathBuf,
}

impl ListFilesTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for ListFilesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "ls".to_string(),
            description: "List files under a directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"}
                }
            }),
            prompt_snippet: "- ls: List files in a directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input.get("path").and_then(|value| value.as_str()).unwrap_or(".");
        let target = normalize_path(&self.root, path)?;
        let mut entries = std::fs::read_dir(&target)?
            .filter_map(Result::ok)
            .map(|entry| {
                let mut name = entry.file_name().to_string_lossy().to_string();
                if entry.path().is_dir() {
                    name.push('/');
                }
                name
            })
            .collect::<Vec<_>>();
        entries.sort();
        Ok(ToolResult {
            content: entries.join("\n"),
            metadata: None,
        })
    }
}

pub struct BashTool {
    root: PathBuf,
}

impl BashTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for BashTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "bash".to_string(),
            description: "Execute a bash command in the current working directory."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeout_ms": {"type": "integer"}
                },
                "required": ["command"]
            }),
            prompt_snippet: "- bash: Execute shell commands in the workspace".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let command = input
            .get("command")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("bash requires a command"))?;
        let timeout_ms = input
            .get("timeout_ms")
            .and_then(|value| value.as_u64())
            .unwrap_or(120_000);

        let mut child = Command::new("bash")
            .arg("-lc")
            .arg(command)
            .current_dir(&self.root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|err| AppError::process_spawn(format!("Failed to spawn bash: {err}")))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            let mut lines = Vec::new();
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    lines.push(line);
                }
            }
            lines
        });

        let stderr_task = tokio::spawn(async move {
            let mut lines = Vec::new();
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    lines.push(line);
                }
            }
            lines
        });

        let status = tokio::time::timeout(
            std::time::Duration::from_millis(timeout_ms),
            child.wait(),
        )
        .await
        .map_err(|_| AppError::process_kill(format!("bash timed out after {timeout_ms}ms")))?
        .map_err(|err| AppError::process_kill(format!("Failed to wait for bash: {err}")))?;

        let stdout_lines = stdout_task.await.unwrap_or_default();
        let stderr_lines = stderr_task.await.unwrap_or_default();
        let mut output = stdout_lines.join("\n");
        if !stderr_lines.is_empty() {
            if !output.is_empty() {
                output.push_str("\n");
            }
            output.push_str(&stderr_lines.join("\n"));
        }
        if output.is_empty() {
            output = "(no output)".to_string();
        }
        if !status.success() {
            output.push_str(&format!("\n\nCommand exited with status {}", status));
        }

        Ok(ToolResult {
            content: output,
            metadata: Some(json!({
                "result": if status.success() { "success" } else { "failure" },
            })),
        })
    }
}

pub fn default_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::new(root.to_path_buf())),
        Arc::new(WriteTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::new(root.to_path_buf())),
        Arc::new(BashTool::new(root.to_path_buf())),
    ]
}
