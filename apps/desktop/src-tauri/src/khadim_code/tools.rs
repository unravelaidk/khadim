use crate::error::AppError;
use crate::khadim_agent::KhadimManager;
use crate::opencode::AgentStreamEvent;
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
    /// Additional directories the read tool is allowed to access (e.g. skill dirs).
    extra_allowed: Vec<PathBuf>,
}

impl ReadTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root, extra_allowed: default_skill_read_dirs() }
    }

    pub fn with_extra_allowed(root: PathBuf, mut extra_allowed: Vec<PathBuf>) -> Self {
        // Always include default skill directories
        for dir in default_skill_read_dirs() {
            if !extra_allowed.contains(&dir) {
                extra_allowed.push(dir);
            }
        }
        Self { root, extra_allowed }
    }
}

/// Default directories the read tool should always be able to access for skills.
fn default_skill_read_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".agents").join("skills"));
        dirs.push(home.join(".claude").join("skills"));
        dirs.push(home.join(".pi").join("agent").join("skills"));
    }
    dirs
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
                    "path": {"type": "string", "description": "File or directory path to read (relative to workspace root)"},
                    "offset": {"type": "integer", "description": "Line number to start reading from (1-indexed, default: 1)"},
                    "limit": {"type": "integer", "description": "Maximum number of lines to read (default: 200)"}
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

        // Try workspace root first, then check extra allowed dirs (skill dirs)
        let target = match normalize_path(&self.root, path) {
            Ok(p) => p,
            Err(_) => {
                log::info!(
                    "read: path {:?} not in workspace {:?}, trying {} extra dirs",
                    path,
                    self.root,
                    self.extra_allowed.len()
                );
                self.resolve_extra_allowed(path)?
            }
        };

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

impl ReadTool {
    /// Check if an absolute path falls within one of the extra allowed directories.
    fn resolve_extra_allowed(&self, raw: &str) -> Result<PathBuf, AppError> {
        let candidate = Path::new(raw);
        if !candidate.is_absolute() {
            return Err(AppError::invalid_input(format!(
                "Path is outside the allowed workspace: {raw}"
            )));
        }

        let normalized = candidate.components().fold(PathBuf::new(), |mut acc, c| {
            use std::path::Component;
            match c {
                Component::CurDir => {}
                Component::ParentDir => { acc.pop(); }
                other => acc.push(other.as_os_str()),
            }
            acc
        });

        for allowed in &self.extra_allowed {
            if normalized.starts_with(allowed) {
                log::debug!("read: path {:?} allowed by extra dir {:?}", normalized, allowed);
                return Ok(normalized);
            }
        }

        log::debug!(
            "read: path {:?} rejected. extra_allowed={:?}",
            normalized,
            self.extra_allowed
        );
        Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {raw}"
        )))
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
            description: format!(
                "Write a full file to disk, creating parent directories when needed. \
                 CRITICAL: 'path' MUST be the FIRST key in the JSON arguments — before 'content'. \
                 The path must include subdirectories relative to workspace root (e.g. \"pong/index.html\", not just \"index.html\"). \
                 Workspace root: {}",
                self.root.display()
            ),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "REQUIRED FIRST — file path including subdirectories, relative to workspace root (e.g. 'myproject/src/main.rs')"},
                    "content": {"type": "string", "description": "The full file content to write"}
                },
                "required": ["path", "content"],
                "propertyOrder": ["path", "content"]
            }),
            prompt_snippet: format!(
                "- write({{\"path\": \"subdir/file.ext\", \"content\": \"...\"}}): Write a file. \
                 Path MUST be first and include subdirectories relative to workspace root: {}",
                self.root.display()
            ),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        // Check canonical names first, then common aliases models may use
        let path = input
            .get("path")
            .or_else(|| input.get("file_path"))
            .or_else(|| input.get("filepath"))
            .or_else(|| input.get("filename"))
            .or_else(|| input.get("file"))
            .and_then(|value| value.as_str());
        let content = input
            .get("content")
            .or_else(|| input.get("text"))
            .or_else(|| input.get("body"))
            .or_else(|| input.get("data"))
            .and_then(|value| value.as_str());
        // Optional target_dir hint — used when path is missing to place the file
        // in the correct subdirectory instead of the workspace root.
        let target_dir = input
            .get("target_dir")
            .or_else(|| input.get("directory"))
            .or_else(|| input.get("dir"))
            .and_then(|value| value.as_str());

        // If path is missing, try to recover or return a helpful soft error
        let (path, content) = match (path, content) {
            (Some(p), Some(c)) => (p.to_string(), c.to_string()),
            (Some(p), None) => {
                // Model sent path but no content — maybe it put content in another field
                // Check all string values that aren't "path"
                let fallback_content = input
                    .as_object()
                    .and_then(|obj| {
                        obj.iter()
                            .find(|(k, v)| *k != "path" && v.is_string())
                            .and_then(|(_, v)| v.as_str())
                    });
                match fallback_content {
                    Some(c) => (p.to_string(), c.to_string()),
                    None => return Ok(ToolResult {
                        content: format!(
                            "Error: write requires both 'path' and 'content' parameters.\n\
                             You provided path=\"{}\" but no content.\n\
                             Usage: write({{\"path\": \"subdir/file.ext\", \"content\": \"...\"}})\n\
                             IMPORTANT: path MUST come FIRST in the JSON and include the full relative path from workspace root: {}",
                            p, self.root.display()
                        ),
                        metadata: Some(json!({"error": "missing_content"})),
                    }),
                }
            }
            (None, Some(c)) => {
                // Model sent content but no path. This often happens when the model
                // generates {"content":"...huge file...","path":"foo.html"} and output
                // gets truncated before "path" is emitted.
                // Return an error asking the model to retry with path FIRST.
                // Do NOT guess the filename — guessing loses the intended directory
                // and writes to the wrong location.
                let workspace = self.root.display();
                let dir_hint = target_dir
                    .map(|d| format!(" The user wanted the file in directory: {d}."))
                    .unwrap_or_default();
                return Ok(ToolResult {
                    content: format!(
                        "Error: write is missing the 'path' parameter — the file was NOT written.\n\
                         This usually happens when 'content' appears before 'path' in the JSON \
                         and the output gets truncated.\n\
                         IMPORTANT: You MUST call write again with 'path' as the FIRST key.\n\
                         Workspace root: {workspace}\n\
                         {dir_hint}\n\
                         Usage: write({{\"path\": \"subdir/filename.ext\", \"content\": \"...\"}})\n\
                         Include the full relative path (e.g. \"pong/index.html\", not just \"index.html\")."
                    ),
                    metadata: Some(json!({"error": "missing_path_truncated"})),
                });
            }
            (None, None) => {
                // Check if the model sent a single string with everything in it
                // or used non-standard parameter names
                let obj = input.as_object();
                let keys: Vec<String> = obj
                    .map(|o| o.keys().cloned().collect())
                    .unwrap_or_default();
                return Ok(ToolResult {
                    content: format!(
                        "Error: write requires 'path' and 'content' parameters.\n\
                         Received keys: [{}]\n\
                         Workspace root: {}\n\
                         Usage: write({{\"path\": \"subdir/filename.ext\", \"content\": \"...\"}})\n\
                         IMPORTANT: 'path' MUST be the FIRST key and include subdirectories.",
                        keys.join(", "),
                        self.root.display()
                    ),
                    metadata: Some(json!({"error": "missing_params"})),
                });
            }
        };

        let target = normalize_path(&self.root, &path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, &content)?;
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

/// Try to guess a reasonable filename from the file content.
fn guess_filename(content: &str) -> Option<&str> {
    let trimmed = content.trim();
    if trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") || trimmed.starts_with("<HTML") {
        Some("index.html")
    } else if trimmed.starts_with("<?xml") || trimmed.starts_with("<svg") {
        Some("index.svg")
    } else if trimmed.starts_with("<") && trimmed.contains("className=") {
        // JSX/TSX component
        Some("page.tsx")
    } else if trimmed.starts_with("import ") || trimmed.starts_with("export ") {
        if trimmed.contains("React") || trimmed.contains("jsx") || trimmed.contains("className") {
            Some("page.tsx")
        } else {
            Some("index.ts")
        }
    } else if trimmed.contains("export ") || trimmed.contains("import ") {
        Some("index.ts")
    } else if trimmed.starts_with("{") || trimmed.starts_with("[") {
        Some("data.json")
    } else if trimmed.starts_with("---") {
        Some("document.md")
    } else if trimmed.starts_with("@") || trimmed.starts_with(":root") || trimmed.starts_with("body") || trimmed.starts_with("*") || trimmed.contains("--color") {
        Some("styles.css")
    } else if trimmed.starts_with("// @ts-") || trimmed.starts_with("'use ") || trimmed.starts_with("\"use ") {
        Some("index.ts")
    } else {
        None
    }
}

pub struct ListFilesTool {
    root: PathBuf,
    /// Additional directories the ls tool is allowed to access (e.g. skill dirs).
    extra_allowed: Vec<PathBuf>,
}

impl ListFilesTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root, extra_allowed: default_skill_read_dirs() }
    }

    pub fn with_extra_allowed(root: PathBuf, mut extra_allowed: Vec<PathBuf>) -> Self {
        for dir in default_skill_read_dirs() {
            if !extra_allowed.contains(&dir) {
                extra_allowed.push(dir);
            }
        }
        Self { root, extra_allowed }
    }

    /// Check if an absolute path falls within one of the extra allowed directories.
    fn resolve_extra_allowed(&self, raw: &str) -> Result<PathBuf, AppError> {
        let candidate = Path::new(raw);
        if !candidate.is_absolute() {
            return Err(AppError::invalid_input(format!(
                "Path is outside the allowed workspace: {raw}"
            )));
        }

        let normalized = candidate.components().fold(PathBuf::new(), |mut acc, c| {
            use std::path::Component;
            match c {
                Component::CurDir => {}
                Component::ParentDir => { acc.pop(); }
                other => acc.push(other.as_os_str()),
            }
            acc
        });

        for allowed in &self.extra_allowed {
            if normalized.starts_with(allowed) {
                return Ok(normalized);
            }
        }

        Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {raw}"
        )))
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
                    "path": {"type": "string", "description": "Directory path to list (relative to workspace root, default: '.')"}
                }
            }),
            prompt_snippet: "- ls: List files in a directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input.get("path").and_then(|value| value.as_str()).unwrap_or(".");
        let target = match normalize_path(&self.root, path) {
            Ok(p) => p,
            Err(_) => self.resolve_extra_allowed(path)?,
        };
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
                    "command": {"type": "string", "description": "The bash command to execute"},
                    "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default: 120000)"}
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
    default_tools_with_skill_dirs(root, Vec::new())
}

pub fn default_tools_with_skill_dirs(root: &Path, skill_dirs: Vec<PathBuf>) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::with_extra_allowed(root.to_path_buf(), skill_dirs.clone())),
        Arc::new(WriteTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::with_extra_allowed(root.to_path_buf(), skill_dirs)),
        Arc::new(BashTool::new(root.to_path_buf())),
    ]
}

// ── Question tool ─────────────────────────────────────────────────────

/// A tool that lets the agent ask the user a question and wait for an answer.
/// The tool emits a `"question"` stream event, then parks on a oneshot channel
/// until the frontend calls `khadim_answer_question`.
pub struct QuestionTool {
    session_id: String,
    workspace_id: String,
    tx: tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    manager: Arc<KhadimManager>,
}

impl QuestionTool {
    pub fn new(
        session_id: String,
        workspace_id: String,
        tx: tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
        manager: Arc<KhadimManager>,
    ) -> Self {
        Self { session_id, workspace_id, tx, manager }
    }
}

#[async_trait]
impl Tool for QuestionTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "question".to_string(),
            description: "Ask the user a question when you need clarification or a decision. \
                          Provide a list of questions, each with a header, the question text, \
                          and a set of option labels. The user's answer is returned as text."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "description": "One or more questions to present to the user",
                        "items": {
                            "type": "object",
                            "properties": {
                                "header": {
                                    "type": "string",
                                    "description": "Short label for the question category"
                                },
                                "question": {
                                    "type": "string",
                                    "description": "The question text to display"
                                },
                                "options": {
                                    "type": "array",
                                    "description": "Suggested answer options",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "label": { "type": "string" },
                                            "description": { "type": "string" }
                                        },
                                        "required": ["label"]
                                    }
                                },
                                "multiple": {
                                    "type": "boolean",
                                    "description": "Whether the user may select more than one option (default false)"
                                },
                                "custom": {
                                    "type": "boolean",
                                    "description": "Whether the user may type a free-form answer (default true)"
                                }
                            },
                            "required": ["header", "question", "options"]
                        }
                    }
                },
                "required": ["questions"]
            }),
            prompt_snippet: "- question: Ask the user a question when you need clarification or a decision".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let questions = input
            .get("questions")
            .cloned()
            .unwrap_or(Value::Array(vec![]));

        if !questions.is_array() || questions.as_array().map(|a| a.is_empty()).unwrap_or(true) {
            return Err(AppError::invalid_input(
                "question tool requires a non-empty 'questions' array",
            ));
        }

        let part_id = uuid::Uuid::new_v4().to_string();

        // Emit the question event so the frontend shows the overlay.
        let _ = self.tx.send(AgentStreamEvent {
            workspace_id: self.workspace_id.clone(),
            session_id: self.session_id.clone(),
            event_type: "question".to_string(),
            content: None,
            metadata: Some(json!({
                "id": part_id,
                "questions": questions,
            })),
        });

        // Park a oneshot channel and wait for the answer.
        let (answer_tx, answer_rx) = tokio::sync::oneshot::channel::<String>();
        self.manager.park_question(self.session_id.clone(), answer_tx);

        let answer = answer_rx.await.map_err(|_| {
            AppError::backend_busy("Question was cancelled (session aborted or dismissed)")
        })?;

        // Emit a step_complete so the thinking-steps panel records it.
        let _ = self.tx.send(AgentStreamEvent {
            workspace_id: self.workspace_id.clone(),
            session_id: self.session_id.clone(),
            event_type: "step_complete".to_string(),
            content: Some(answer.clone()),
            metadata: Some(json!({
                "id": part_id,
                "title": "Question answered",
                "tool": "question",
                "result": answer,
            })),
        });

        Ok(ToolResult {
            content: format!("User answered: {answer}"),
            metadata: None,
        })
    }
}
