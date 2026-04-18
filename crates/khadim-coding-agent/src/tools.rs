use crate::helpers::try_repair_json;
use crate::runtime::AgentRuntime;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use khadim_ai_core::types::{ChatMessage, Context, ToolMessage};
use khadim_ai_core::ModelClient;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

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

    Ok(normalized)
}

/// Truncate output to a reasonable size so we don't blow up context windows.
fn truncate_output(output: &str, max_bytes: usize) -> String {
    if output.len() <= max_bytes {
        return output.to_string();
    }
    let half = max_bytes / 2;
    let head = &output[..half];
    let tail = &output[output.len() - half..];
    let skipped = output.len() - max_bytes;
    format!(
        "{}\n\n... ({} bytes truncated) ...\n\n{}",
        head, skipped, tail
    )
}

// ── Coding domain tools ────────────────────────────────────────────────

pub struct ReadTool {
    root: PathBuf,
}

impl ReadTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for ReadTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read".to_string(),
            description: "Read a file or directory. Supports offset and limit for text files.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path (relative to workspace root, or absolute)"},
                    "offset": {"type": "integer", "description": "Line number to start reading from (1-indexed)"},
                    "limit": {"type": "integer", "description": "Maximum lines to read (default 200)"}
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
            return Ok(ToolResult::text(entries.join("\n"),));
        }

        let content = std::fs::read_to_string(&target)?;
        let lines = content.lines().collect::<Vec<_>>();
        let total = lines.len();
        let start = offset.saturating_sub(1);
        let end = usize::min(start + limit, total);
        let body = lines[start..end]
            .iter()
            .enumerate()
            .map(|(index, line)| format!("{}: {}", start + index + 1, line))
            .collect::<Vec<_>>()
            .join("\n");

        let mut result = body;
        if end < total {
            result.push_str(&format!("\n\n[{} more lines in file. Use offset={} to continue.]", total - end, end + 1));
        }

        Ok(ToolResult::text(result))
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

#[async_trait::async_trait]
impl Tool for WriteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "write".to_string(),
            description: "Write a full file to disk, creating parent directories when needed.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path (relative to workspace root, or absolute)"},
                    "content": {"type": "string", "description": "The full file content to write"}
                },
                "required": ["path", "content"]
            }),
            prompt_snippet: "- write: Write a full file to disk".to_string(),
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

        Ok(ToolResult::text(format!("Wrote {} bytes to {}", content.len(), target.display())))
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

#[async_trait::async_trait]
impl Tool for ListFilesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "ls".to_string(),
            description: "List files under a directory. Can list any absolute path.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path (relative to workspace root, or absolute). Defaults to workspace root."}
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
        Ok(ToolResult::text(entries.join("\n"),))
    }
}

pub struct GrepTool {
    root: PathBuf,
}

impl GrepTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for GrepTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "grep".to_string(),
            description: "Search for a pattern in files. Uses grep -rn. Returns matching lines with file paths and line numbers.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Search pattern (basic regex)"},
                    "path": {"type": "string", "description": "Directory or file to search in (default: workspace root)"},
                    "include": {"type": "string", "description": "Glob pattern for files to include, e.g. '*.rs' or '*.py'"}
                },
                "required": ["pattern"]
            }),
            prompt_snippet: "- grep: Search for patterns in files".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let pattern = input
            .get("pattern")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("grep requires a pattern"))?;
        let path = input.get("path").and_then(|value| value.as_str()).unwrap_or(".");
        let include = input.get("include").and_then(|value| value.as_str());

        let target = normalize_path(&self.root, path)?;
        let mut cmd = Command::new("grep");
        cmd.arg("-rn")
            .arg("--color=never")
            .arg("-m").arg("100"); // limit matches per file

        if let Some(glob) = include {
            cmd.arg("--include").arg(glob);
        }

        cmd.arg("--").arg(pattern).arg(&target);

        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            cmd.output(),
        )
        .await
        .map_err(|_| AppError::process_kill("grep timed out after 30s".to_string()))?
        .map_err(|err| AppError::process_spawn(format!("Failed to run grep: {err}")))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result = if stdout.is_empty() {
            "No matches found.".to_string()
        } else {
            truncate_output(&stdout, 50_000)
        };

        Ok(ToolResult::text(result))
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

#[async_trait::async_trait]
impl Tool for BashTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "bash".to_string(),
            description: "Execute a bash command. Runs in the workspace directory. Use for installing packages, compiling, downloading, running programs, etc. For long-running commands, set a higher timeout_ms.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The bash command to execute"},
                    "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default: 600000 = 10 minutes)"}
                },
                "required": ["command"]
            }),
            prompt_snippet: "- bash: Execute shell commands (default 10 min timeout, increase with timeout_ms for long tasks)".to_string(),
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
            .unwrap_or(600_000); // 10 minutes default

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

        let status = tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), child.wait())
            .await
            .map_err(|_| AppError::process_kill(format!("bash timed out after {timeout_ms}ms")))?
            .map_err(|err| AppError::process_kill(format!("Failed to wait for bash: {err}")))?;

        let stdout_lines = stdout_task.await.unwrap_or_default();
        let stderr_lines = stderr_task.await.unwrap_or_default();
        let mut output = stdout_lines.join("\n");
        if !stderr_lines.is_empty() {
            if !output.is_empty() {
                output.push('\n');
            }
            output.push_str(&stderr_lines.join("\n"));
        }
        if output.is_empty() {
            output = "(no output)".to_string();
        }
        if !status.success() {
            output.push_str(&format!("\n\nCommand exited with status {status}"));
        }

        // Truncate very large output to avoid blowing up context
        Ok(ToolResult::text(truncate_output(&output, 100_000),))
    }
}

pub struct EditTool {
    root: PathBuf,
}

impl EditTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for EditTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "edit".to_string(),
            description: "Make targeted edits to a file using exact text replacement. Each edit replaces one unique occurrence of old_text with new_text. Use for surgical changes without rewriting the entire file.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path (relative to workspace root, or absolute)"},
                    "edits": {
                        "type": "array",
                        "description": "List of edits to apply. Each edit must have a unique old_text that appears exactly once in the file.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "old_text": {"type": "string", "description": "Exact text to find (must be unique in file)"},
                                "new_text": {"type": "string", "description": "Replacement text"}
                            },
                            "required": ["old_text", "new_text"]
                        }
                    }
                },
                "required": ["path", "edits"]
            }),
            prompt_snippet: "- edit: Make targeted find-and-replace edits to a file (more efficient than rewriting)".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::invalid_input("edit requires a path"))?;
        let edits = input
            .get("edits")
            .and_then(|v| v.as_array())
            .ok_or_else(|| AppError::invalid_input("edit requires an edits array"))?;

        if edits.is_empty() {
            return Err(AppError::invalid_input("edits array must not be empty"));
        }

        let target = normalize_path(&self.root, path)?;
        let mut content = std::fs::read_to_string(&target)
            .map_err(|e| AppError::io(format!("Failed to read {}: {e}", target.display())))?;

        let mut applied = 0;
        let mut errors = Vec::new();

        for (i, edit) in edits.iter().enumerate() {
            let old_text = edit
                .get("old_text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::invalid_input(format!("edit[{i}] requires old_text")))?;
            let new_text = edit
                .get("new_text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::invalid_input(format!("edit[{i}] requires new_text")))?;

            let count = content.matches(old_text).count();
            if count == 0 {
                errors.push(format!("edit[{i}]: old_text not found in file"));
                continue;
            }
            if count > 1 {
                errors.push(format!("edit[{i}]: old_text matches {count} locations (must be unique)"));
                continue;
            }

            content = content.replacen(old_text, new_text, 1);
            applied += 1;
        }

        if applied > 0 {
            std::fs::write(&target, &content)
                .map_err(|e| AppError::io(format!("Failed to write {}: {e}", target.display())))?;
        }

        let mut result = format!("Applied {applied}/{} edits to {}", edits.len(), target.display());
        if !errors.is_empty() {
            result.push_str("\nErrors:\n");
            result.push_str(&errors.join("\n"));
        }

        Ok(ToolResult::text(result))
    }
}

// ── Search domain tools ────────────────────────────────────────────────

pub struct GlobTool {
    root: PathBuf,
}

impl GlobTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for GlobTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "glob".to_string(),
            description: "Find files matching a glob pattern. Returns matching file paths relative to the workspace root.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern to match, e.g. '**/*.rs' or 'src/**/*.ts'"},
                    "path": {"type": "string", "description": "Base directory to search in (default: workspace root)"}
                },
                "required": ["pattern"]
            }),
            prompt_snippet: "- glob: Find files matching a glob pattern".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let pattern = input
            .get("pattern")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("glob requires a pattern"))?;
        let base_path = input.get("path").and_then(|value| value.as_str()).unwrap_or(".");
        let base = normalize_path(&self.root, base_path)?;

        // Collect all files recursively, then filter by pattern
        let mut found = Vec::new();
        collect_files(&base, &base, &mut found)?;

        // Filter by glob pattern
        let filtered: Vec<String> = found.into_iter().filter(|path| {
            matches_glob(path, pattern)
        }).collect();

        if filtered.is_empty() {
            Ok(ToolResult::text("No files matched the pattern."))
        } else {
            Ok(ToolResult::text(filtered.join("\n"),))
        }
    }
}

fn collect_files(dir: &Path, base: &Path, found: &mut Vec<String>) -> Result<(), AppError> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();

        if path.is_dir() {
            collect_files(&path, base, found)?;
        } else {
            found.push(relative);
        }
    }
    Ok(())
}

/// Simple glob matching that supports `*` (any single segment) and `**` (zero or more segments).
fn matches_glob(path: &str, pattern: &str) -> bool {
    let path_parts: Vec<&str> = path.split('/').collect();
    let pattern_parts: Vec<&str> = pattern.split('/').collect();

    fn match_parts(path: &[&str], pattern: &[&str]) -> bool {
        match (path.first(), pattern.first()) {
            (None, None) => true,
            (None, Some(&p)) => {
                // Remaining pattern parts must all be ** which can match nothing
                p == "**" && match_parts(&[], &pattern[1..])
            }
            (Some(_), None) => false,
            (Some(_), Some(&"**")) => {
                // ** matches zero or more path segments
                match_parts(path, &pattern[1..]) || match_parts(&path[1..], pattern)
            }
            (Some(&s), Some(&p)) => {
                if p == "*" || s == p {
                    match_parts(&path[1..], &pattern[1..])
                } else {
                    false
                }
            }
        }
    }

    match_parts(&path_parts, &pattern_parts)
}

pub struct WebSearchTool;

impl WebSearchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl Tool for WebSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".to_string(),
            description: "Search the web for information. Returns search results with titles, URLs, and snippets. Use for finding documentation, APIs, solutions, and current information.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "num_results": {"type": "integer", "description": "Number of results to return (default: 5, max: 10)"}
                },
                "required": ["query"]
            }),
            prompt_snippet: "- web_search: Search the web for information".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let query = input
            .get("query")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("web_search requires a query"))?;
        let num_results = input
            .get("num_results")
            .and_then(|value| value.as_u64())
            .unwrap_or(5)
            .min(10) as usize;

        // Use DuckDuckGo HTML search (no API key needed)
        let url = format!(
            "https://html.duckduckgo.com/html/?q={}",
            urlencoding::encode(query)
        );

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| AppError::io(format!("Failed to build HTTP client: {e}")))?;

        let response = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            client.get(&url).send(),
        )
        .await
        .map_err(|_| AppError::process_kill("web_search timed out after 15s".to_string()))?
        .map_err(|e| AppError::io(format!("Web search request failed: {e}")))?;

        let html = response.text().await
            .map_err(|e| AppError::io(format!("Failed to read search response: {e}")))?;

        // Parse DuckDuckGo HTML results
        let mut results = Vec::new();
        let mut in_result = false;
        let mut current_title = String::new();
        let mut current_url = String::new();
        let mut current_snippet = String::new();

        for line in html.lines() {
            let line = line.trim();

            if line.contains("class=\"result__a\"") {
                in_result = true;
                current_title.clear();
                current_url.clear();
                current_snippet.clear();

                // Extract URL from href
                if let Some(start) = line.find("href=\"") {
                    let rest = &line[start + 6..];
                    if let Some(end) = rest.find('"') {
                        current_url = rest[..end].to_string();
                        // DuckDuckGo uses redirect URLs, extract the actual URL
                        if let Some(actual) = extract_ddg_url(&current_url) {
                            current_url = actual;
                        }
                    }
                }

                // Extract title
                if let Some(start) = line.find('>') {
                    let rest = &line[start + 1..];
                    if let Some(end) = rest.find('<') {
                        current_title = html_escape::decode_html_entities(&rest[..end]).to_string();
                    }
                }
            } else if line.contains("class=\"result__snippet\"") {
                if in_result {
                    if let Some(start) = line.find('>') {
                        let rest = &line[start + 1..];
                        if let Some(end) = rest.find('<') {
                            current_snippet = html_escape::decode_html_entities(&rest[..end]).to_string();
                        }
                    }
                    if !current_title.is_empty() {
                        results.push(format!(
                            "[{}] {}\n  {}",
                            results.len() + 1,
                            current_title,
                            current_snippet
                        ));
                        if results.len() >= num_results {
                            break;
                        }
                    }
                    in_result = false;
                }
            }
        }

        if results.is_empty() {
            Ok(ToolResult::text(format!("No search results found for: {}", query)))
        } else {
            Ok(ToolResult::text(format!("Search results for '{}':\n\n{}", query, results.join("\n\n"))))
        }
    }
}

fn extract_ddg_url(redirect_url: &str) -> Option<String> {
    // DuckDuckGo redirect URLs look like: //duckduckgo.com/l/?uddg=ENCODED_URL&rut=...
    if let Some(start) = redirect_url.find("uddg=") {
        let encoded = &redirect_url[start + 5..];
        let encoded = encoded.split('&').next().unwrap_or(encoded);
        urlencoding::decode(encoded).ok().map(|s| s.to_string())
    } else if redirect_url.starts_with("http") {
        Some(redirect_url.to_string())
    } else {
        None
    }
}

// ── Memory tool ────────────────────────────────────────────────────────

pub struct MemoryTool {
    root: PathBuf,
}

impl MemoryTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn memory_dir(&self) -> PathBuf {
        self.root.join(".khadim").join("memory")
    }
}

#[async_trait::async_trait]
impl Tool for MemoryTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "memory".to_string(),
            description: "Store and recall persistent facts across sessions. Use 'save' to store a key-value pair and 'recall' to retrieve stored values. Memories persist in the .khadim/memory/ directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["save", "recall", "list", "delete"], "description": "Action to perform: 'save' a key-value pair, 'recall' a value by key, 'list' all keys, or 'delete' a key"},
                    "key": {"type": "string", "description": "The memory key (required for save, recall, delete)"},
                    "value": {"type": "string", "description": "The value to store (required for save)"}
                },
                "required": ["action"]
            }),
            prompt_snippet: "- memory: Store and recall persistent facts across sessions".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let action = input
            .get("action")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("memory requires an action (save, recall, list, delete)"))?;

        let memory_dir = self.memory_dir();
        std::fs::create_dir_all(&memory_dir)?;

        match action {
            "save" => {
                let key = input
                    .get("key")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory save requires a key"))?;
                let value = input
                    .get("value")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory save requires a value"))?;

                // Sanitize key for filesystem
                let safe_key = key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                std::fs::write(&file_path, value)?;
                Ok(ToolResult::text(format!("Saved memory '{}' ({} bytes)", key, value.len())))
            }
            "recall" => {
                let key = input
                    .get("key")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory recall requires a key"))?;

                let safe_key = key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                match std::fs::read_to_string(&file_path) {
                    Ok(content) => Ok(ToolResult::text(format!("Memory '{}':\n{}", key, content))),
                    Err(_) => Ok(ToolResult::text(format!("No memory found for key '{}'", key))),
                }
            }
            "list" => {
                let mut keys = Vec::new();
                if memory_dir.exists() {
                    for entry in std::fs::read_dir(&memory_dir)? {
                        let entry = entry?;
                        if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                            keys.push(name.to_string());
                        }
                    }
                    keys.sort();
                }
                if keys.is_empty() {
                    Ok(ToolResult::text("No memories stored yet."))
                } else {
                    Ok(ToolResult::text(format!("Stored memories:\n{}", keys.join("\n"))))
                }
            }
            "delete" => {
                let key = input
                    .get("key")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory delete requires a key"))?;

                let safe_key = key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                match std::fs::remove_file(&file_path) {
                    Ok(()) => Ok(ToolResult::text(format!("Deleted memory '{}'", key))),
                    Err(_) => Ok(ToolResult::text(format!("No memory found for key '{}'", key))),
                }
            }
            _ => Err(AppError::invalid_input(format!(
                "Unknown memory action: '{}'. Use save, recall, list, or delete.",
                action
            ))),
        }
    }
}

// ── Delegation tool ────────────────────────────────────────────────────

pub struct DelegateTool {
    root: PathBuf,
}

impl DelegateTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for DelegateTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "delegate_to_agent".to_string(),
            description: "Delegate a focused task to a specialized subagent. The subagent will investigate and return findings. Available subagents: 'general' (read-only investigation), 'explore' (fast codebase discovery), 'review' (code review for correctness and security).".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "agent": {
                        "type": "string",
                        "enum": ["general", "explore", "review"],
                        "description": "Which subagent to delegate to"
                    },
                    "task": {
                        "type": "string",
                        "description": "The focused task for the subagent to investigate"
                    }
                },
                "required": ["agent", "task"]
            }),
            prompt_snippet: "- delegate_to_agent: Delegate a focused task to a specialized subagent (general, explore, review)".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let agent_type = input
            .get("agent")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("delegate_to_agent requires an agent type"))?;
        let task = input
            .get("task")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("delegate_to_agent requires a task"))?;

        let mode = match agent_type {
            "general" => crate::agent::modes::sub_general_mode(),
            "explore" => crate::agent::modes::sub_explore_mode(),
            "review" => crate::agent::modes::sub_review_mode(),
            other => return Err(AppError::invalid_input(format!(
                "Unknown subagent type: '{}'. Use 'general', 'explore', or 'review'.",
                other
            ))),
        };

        // Run the subagent with read-only tools
        let runtime = AgentRuntime::new_read_only(&self.root);
        let client = ModelClient::from_selection(None).await?;
        let system_prompt = runtime.build_prompt(&mode);
        let tool_defs = runtime.definitions();

        let mut messages = vec![ChatMessage::System { content: system_prompt }];
        messages.push(ChatMessage::User { content: task.to_string() });

        // Run the subagent for a limited number of turns
        let max_subagent_turns: usize = 10;
        let mut turn_index: usize = 0;
        let mut final_result = String::new();

        loop {
            if turn_index >= max_subagent_turns {
                final_result.push_str(&format!("\n[Subagent reached maximum turn limit ({max_subagent_turns})]"));
                break;
            }

            let context = Context {
                messages: messages.clone(),
                tools: tool_defs.clone(),
                session_id: Some(format!("subagent-{}", agent_type)),
            };

            let reply = client.stream(
                &context,
                mode.temperature,
                Arc::new(|_event| {}), // Silent — we don't stream subagent events
            ).await.map_err(|e| AppError::io(format!("Subagent LLM error: {}", e.message)))?;

            if !reply.tool_calls.is_empty() {
                messages.push(ChatMessage::Assistant {
                    content: if reply.content.trim().is_empty() { None } else { Some(reply.content.clone()) },
                    tool_calls: reply.tool_calls.clone(),
                    reasoning_content: reply.reasoning_content.clone(),
                });

                for tool_call in &reply.tool_calls {
                    let args = serde_json::from_str::<Value>(&tool_call.function.arguments)
                        .unwrap_or_else(|_| try_repair_json(&tool_call.function.arguments).unwrap_or_else(|| json!({})));

                    let tool_result: Result<ToolResult, AppError> = match runtime.get(&tool_call.function.name) {
                        Some(tool) => tool.execute(args).await,
                        None => Err(AppError::invalid_input(format!(
                            "Subagent requested unavailable tool: {}",
                            tool_call.function.name
                        ))),
                    };

                    let result_content = match tool_result {
                        Ok(result) => result.content,
                        Err(err) => format!("Error: {}", err.message),
                    };

                    messages.push(ChatMessage::Tool(ToolMessage {
                        content: result_content,
                        tool_call_id: tool_call.id.clone(),
                    }));
                }

                turn_index += 1;
                continue;
            }

            // No tool calls — the subagent is done
            final_result = reply.content;
            break;
        }

        Ok(ToolResult::text(format!("[Subagent '{}' findings]\n{}", agent_type, final_result)))
    }
}

// ── Default tool registries ─────────────────────────────────────────────

/// Full tool set for primary agents (read + write + execute).
pub fn default_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::new(root.to_path_buf())),
        Arc::new(WriteTool::new(root.to_path_buf())),
        Arc::new(EditTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::new(root.to_path_buf())),
        Arc::new(GrepTool::new(root.to_path_buf())),
        Arc::new(BashTool::new(root.to_path_buf())),
        Arc::new(GlobTool::new(root.to_path_buf())),
        Arc::new(WebSearchTool::new()),
        Arc::new(MemoryTool::new(root.to_path_buf())),
        Arc::new(DelegateTool::new(root.to_path_buf())),
    ]
}

/// Read-only tool set for subagents (no write, edit, or bash).
pub fn read_only_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::new(root.to_path_buf())),
        Arc::new(GrepTool::new(root.to_path_buf())),
        Arc::new(GlobTool::new(root.to_path_buf())),
        Arc::new(WebSearchTool::new()),
    ]
}