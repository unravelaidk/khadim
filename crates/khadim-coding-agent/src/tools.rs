use crate::coordinator::worker::{spawn_worker, WorkerSpec, WriteScope};
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use khadim_ai_core::types::ModelSelection;
use regex::{Regex, RegexBuilder};
use serde::Deserialize;
use serde_json::{json, Value};
use std::ffi::OsString;
use std::future::Future;
use std::io::{BufRead as _, Read as _};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;

#[cfg(windows)]
const PROCESS_TREE_CLEANUP_TIMEOUT: Duration = Duration::from_secs(3);
const CHILD_CLEANUP_TIMEOUT: Duration = Duration::from_secs(3);

async fn complete_before_deadline<F, T>(future: F, deadline: Duration) -> Option<T>
where
    F: Future<Output = T>,
{
    tokio::time::timeout(deadline, future).await.ok()
}

fn cleanup_process_tree_on_drop(pid: u32) {
    #[cfg(unix)]
    unsafe {
        // The shell is created as the leader of a dedicated process group.
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        // Drop cannot await. Start the native tree killer while the Child value
        // (declared before this guard) is still alive; Child::kill_on_drop then
        // supplies the leader-only fallback.
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
    #[cfg(not(any(unix, windows)))]
    let _ = pid;
}

struct ProcessTreeDropGuard {
    pid: Option<u32>,
    cleanup: fn(u32),
    registered: bool,
}

impl ProcessTreeDropGuard {
    fn new(pid: Option<u32>) -> Self {
        Self {
            pid,
            cleanup: cleanup_process_tree_on_drop,
            registered: crate::process_tree::register(pid),
        }
    }

    #[cfg(test)]
    fn with_cleanup(pid: Option<u32>, cleanup: fn(u32)) -> Self {
        Self {
            pid,
            cleanup,
            registered: false,
        }
    }

    fn disarm(&mut self) {
        crate::process_tree::unregister(self.pid, self.registered);
        self.registered = false;
        self.pid = None;
    }
}

impl Drop for ProcessTreeDropGuard {
    fn drop(&mut self) {
        if let Some(pid) = self.pid.take() {
            (self.cleanup)(pid);
            crate::process_tree::unregister(Some(pid), self.registered);
            self.registered = false;
        }
    }
}

/// Kill a child process and its entire process group.
/// On Unix, we send SIGKILL to the process group (negative PID).
/// Falls back to killing just the child if process group kill fails.
async fn kill_process_tree(
    child: &mut tokio::process::Child,
    process_tree_pid: Option<u32>,
) -> bool {
    let tree_cleanup_confirmed;
    #[cfg(unix)]
    {
        // Keep using the original process-group ID even after the shell leader
        // has exited; descendants may still own its stdout/stderr pipes.
        tree_cleanup_confirmed = process_tree_pid
            .is_some_and(|pid| unsafe { libc::kill(-(pid as i32), libc::SIGKILL) == 0 });
    }
    #[cfg(windows)]
    {
        tree_cleanup_confirmed = if let Some(pid) = process_tree_pid {
            // `Child::kill` only terminates the shell leader on Windows. Use
            // the OS-supported tree operation first so commands cannot leave
            // grandchildren running after a timeout.
            let mut taskkill = Command::new("taskkill");
            taskkill
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true);
            matches!(
                complete_before_deadline(taskkill.status(), PROCESS_TREE_CLEANUP_TIMEOUT).await,
                Some(Ok(status)) if status.success()
            )
        } else {
            false
        };
    }
    #[cfg(not(any(unix, windows)))]
    {
        tree_cleanup_confirmed = false;
    }
    // Always also kill via tokio as a fallback (works cross-platform), but do
    // not let either the fallback or zombie reap make a configured shell
    // timeout unbounded.
    let _ = complete_before_deadline(child.kill(), CHILD_CLEANUP_TIMEOUT).await;
    let _ = complete_before_deadline(child.wait(), CHILD_CLEANUP_TIMEOUT).await;
    tree_cleanup_confirmed
}

fn normalize_path(root: &Path, raw: &str) -> Result<PathBuf, AppError> {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    let normalized = joined
        .components()
        .fold(PathBuf::new(), |mut acc, component| {
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
    let mut head_end = half;
    while head_end > 0 && !output.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let mut tail_start = output.len().saturating_sub(half);
    while tail_start < output.len() && !output.is_char_boundary(tail_start) {
        tail_start += 1;
    }
    let head = &output[..head_end];
    let tail = &output[tail_start..];
    let skipped = tail_start.saturating_sub(head_end);
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
            description: "Read a file or directory. Supports offset and limit for text files."
                .to_string(),
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
        let offset = input
            .get("offset")
            .and_then(|value| value.as_u64())
            .map(|value| usize::try_from(value).unwrap_or(usize::MAX))
            .unwrap_or(1);
        let limit = input
            .get("limit")
            .and_then(|value| value.as_u64())
            .map(|value| usize::try_from(value).unwrap_or(usize::MAX))
            .unwrap_or(200);
        let target = normalize_path(&self.root, path)?;

        let display_path = target
            .strip_prefix(&self.root)
            .unwrap_or(&target)
            .display()
            .to_string();

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
            return Ok(ToolResult::with_metadata(
                entries.join("\n"),
                json!({ "path": display_path, "kind": "dir" }),
            ));
        }

        let content = std::fs::read_to_string(&target)?;
        let lines = content.lines().collect::<Vec<_>>();
        let total = lines.len();
        let start = usize::min(offset.saturating_sub(1), total);
        let end = usize::min(start.saturating_add(limit), total);
        let body = lines[start..end]
            .iter()
            .enumerate()
            .map(|(index, line)| format!("{}: {}", start + index + 1, line))
            .collect::<Vec<_>>()
            .join("\n");

        let mut result = body;
        if end < total {
            result.push_str(&format!(
                "\n\n[{} more lines in file. Use offset={} to continue.]",
                total - end,
                end + 1
            ));
        }

        Ok(ToolResult::with_metadata(
            result,
            json!({ "path": display_path, "kind": "file", "lines": total }),
        ))
    }
}

pub struct WriteTool {
    root: PathBuf,
    /// Optional lease guard for post-edit conflict detection (multi-agent).
    lease_guard: Option<Arc<crate::coordinator::lease_guard::LeaseGuard>>,
    /// Optional event sink for emitting `lease_conflict` events.
    event_tx: Option<UnboundedSender<AgentStreamEvent>>,
}

impl WriteTool {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            lease_guard: None,
            event_tx: None,
        }
    }

    /// Attach a lease guard for post-edit conflict checks (builder).
    pub fn with_lease_guard(
        mut self,
        guard: Arc<crate::coordinator::lease_guard::LeaseGuard>,
    ) -> Self {
        self.lease_guard = Some(guard);
        self
    }

    /// Attach an event sink for `lease_conflict` events (builder).
    pub fn with_event_tx(mut self, tx: UnboundedSender<AgentStreamEvent>) -> Self {
        self.event_tx = Some(tx);
        self
    }
}

#[async_trait::async_trait]
impl Tool for WriteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "write".to_string(),
            description: "Write a full file to disk, creating parent directories when needed."
                .to_string(),
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

        // Post-edit lease conflict check (multi-agent only).
        if let Some(guard) = &self.lease_guard {
            let conflicts = guard.check_after_edit_with_source(&target, content);
            if !conflicts.is_empty() {
                guard.emit_conflict_events(&conflicts);
                let c = &conflicts[0];
                return Err(AppError::invalid_input(format!(
                    "lease_conflict: worker '{}' edited file {} range {}..{} which is leased by worker '{}'",
                    guard.worker_id(),
                    c.file.display(),
                    c.range.start,
                    c.range.end,
                    c.conflicting_lease.worker_id,
                )));
            }
        }

        let display_path = target
            .strip_prefix(&self.root)
            .unwrap_or(&target)
            .display()
            .to_string();
        Ok(ToolResult::with_metadata(
            format!("Wrote {} bytes to {}", content.len(), target.display()),
            json!({ "path": display_path }),
        ))
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
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or(".");
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
        Ok(ToolResult::text(entries.join("\n")))
    }
}

pub struct GrepTool {
    root: PathBuf,
}

const COMMON_SEARCH_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "coverage",
];
const IN_PROCESS_GREP_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_GREP_FILE_BYTES: u64 = 8 * 1024 * 1024;

fn path_matches_glob(pattern: &glob::Pattern, relative: &str) -> bool {
    pattern.matches(relative)
        || Path::new(relative)
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| pattern.matches(name))
}

struct InProcessGrepOptions {
    root: PathBuf,
    target: PathBuf,
    pattern: String,
    include: Option<String>,
    exclude: Option<String>,
    case_sensitive: bool,
    fixed_strings: bool,
    max_count: usize,
    head_limit: usize,
    deadline: Instant,
    file_byte_limit: u64,
}

fn ensure_grep_budget(deadline: Instant) -> Result<(), AppError> {
    if Instant::now() >= deadline {
        return Err(AppError::process_kill(
            "grep timed out after 30s".to_string(),
        ));
    }
    Ok(())
}

/// Portable fallback used when ripgrep is not installed. Keeping this in
/// process avoids depending on GNU/BSD grep dialects or a Unix userland on
/// Windows.
fn grep_in_process(options: InProcessGrepOptions) -> Result<String, AppError> {
    ensure_grep_budget(options.deadline)?;
    let expression = if options.fixed_strings {
        regex::escape(&options.pattern)
    } else {
        options.pattern.clone()
    };
    let matcher = RegexBuilder::new(&expression)
        .case_insensitive(!options.case_sensitive)
        .build()
        .map_err(|err| AppError::invalid_input(format!("Invalid search pattern: {err}")))?;
    let include = options
        .include
        .as_deref()
        .map(glob::Pattern::new)
        .transpose()
        .map_err(|err| AppError::invalid_input(format!("Invalid include glob: {err}")))?;
    let exclude = options
        .exclude
        .as_deref()
        .map(glob::Pattern::new)
        .transpose()
        .map_err(|err| AppError::invalid_input(format!("Invalid exclude glob: {err}")))?;

    let mut builder = ignore::WalkBuilder::new(&options.target);
    builder
        .standard_filters(true)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .sort_by_file_path(|left, right| left.cmp(right));
    builder.filter_entry(|entry| {
        entry.depth() == 0
            || !entry.file_type().is_some_and(|kind| kind.is_dir())
            || !entry
                .file_name()
                .to_str()
                .is_some_and(|name| COMMON_SEARCH_DIRS.contains(&name))
    });

    let mut matches = Vec::new();
    'files: for result in builder.build() {
        ensure_grep_budget(options.deadline)?;
        let Ok(entry) = result else { continue };
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(&options.root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        if include
            .as_ref()
            .is_some_and(|pattern| !path_matches_glob(pattern, &relative))
            || exclude
                .as_ref()
                .is_some_and(|pattern| path_matches_glob(pattern, &relative))
        {
            continue;
        }

        let Ok(file) = std::fs::File::open(path) else {
            continue;
        };
        // Stream at most a fixed number of bytes from each file. This keeps a
        // single giant/minified/binary file from allocating without bound.
        let reader = std::io::BufReader::new(file).take(options.file_byte_limit);
        for (index, line) in reader.lines().enumerate() {
            ensure_grep_budget(options.deadline)?;
            let Ok(line) = line else {
                // Binary, unreadable, and non-UTF-8 content is skipped.
                break;
            };
            if matcher.is_match(&line) {
                matches.push(format!("{}:{}:{}", relative, index + 1, line));
                if matches.len() >= options.max_count {
                    break 'files;
                }
            }
        }
    }

    if matches.is_empty() {
        return Ok(format!("No matches found in {}.", options.target.display()));
    }

    let reached_limit = matches.len() >= options.max_count;
    let mut output = matches.join("\n");
    if reached_limit {
        output.push_str(&format!(
            "\n\n[Result limit reached: showing first {} matches]",
            options.max_count
        ));
    }
    Ok(truncate_output(&output, options.head_limit))
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
            description: "Search for a pattern in files. Uses ripgrep (rg) when available and a portable built-in search otherwise. Respects ignore files, skips common generated directories, and returns matching paths with line numbers.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Search pattern (regex by default, literal with --fixed-strings)"},
                    "path": {"type": "string", "description": "Directory or file to search in (default: workspace root)"},
                    "include": {"type": "string", "description": "Glob pattern for files to include, e.g. '*.rs' or '*.py'"},
                    "exclude": {"type": "string", "description": "Glob pattern for files to exclude"},
                    "case_sensitive": {"type": "boolean", "description": "Case-sensitive search (default: false)"},
                    "fixed_strings": {"type": "boolean", "description": "Treat the pattern as a literal string, not a regex (default: false)"},
                    "max_count": {"type": "integer", "description": "Maximum total matches to return (default: 500)"},
                    "head_limit": {"type": "integer", "description": "Maximum output bytes before truncation (default: 50000)"}
                },
                "required": ["pattern"]
            }),
            prompt_snippet: "- grep: Search for patterns in files (uses ripgrep with .gitignore awareness)".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let pattern = input
            .get("pattern")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("grep requires a pattern"))?;
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or(".");
        let include = input.get("include").and_then(|value| value.as_str());
        let exclude = input.get("exclude").and_then(|value| value.as_str());
        let case_sensitive = input
            .get("case_sensitive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let fixed_strings = input
            .get("fixed_strings")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let max_count = input
            .get("max_count")
            .and_then(|value| value.as_u64())
            .map(|value| usize::try_from(value).unwrap_or(usize::MAX))
            .unwrap_or(500)
            .max(1);
        let head_limit = input
            .get("head_limit")
            .and_then(|value| value.as_u64())
            .map(|value| usize::try_from(value).unwrap_or(usize::MAX))
            .unwrap_or(50_000);

        let target = normalize_path(&self.root, path)?;
        if !target.exists() {
            return Err(AppError::not_found(format!(
                "Search path does not exist: {}",
                target.display()
            )));
        }

        let Some(rg_path) = which_in_path("rg") else {
            let options = InProcessGrepOptions {
                root: self.root.clone(),
                target,
                pattern: pattern.to_string(),
                include: include.map(str::to_string),
                exclude: exclude.map(str::to_string),
                case_sensitive,
                fixed_strings,
                max_count,
                head_limit,
                deadline: Instant::now() + IN_PROCESS_GREP_TIMEOUT,
                file_byte_limit: MAX_GREP_FILE_BYTES,
            };
            let result = tokio::task::spawn_blocking(move || grep_in_process(options))
                .await
                .map_err(|err| AppError::io(format!("Built-in search task failed: {err}")))??;
            return Ok(ToolResult::text(result));
        };

        let mut cmd = Command::new(rg_path);
        cmd.kill_on_drop(true);
        cmd.arg("--line-number")
            .arg("--no-heading")
            .arg("--color=never")
            .arg("--no-ignore-parent")
            .arg("--no-messages");
        for directory in COMMON_SEARCH_DIRS {
            cmd.arg("--glob").arg(format!("!**/{directory}/**"));
        }
        if !case_sensitive {
            cmd.arg("--ignore-case");
        }
        if fixed_strings {
            cmd.arg("--fixed-strings");
        }
        if let Some(glob) = include {
            cmd.arg("--glob").arg(glob);
        }
        if let Some(glob) = exclude {
            cmd.arg("--glob").arg(format!("!{glob}"));
        }
        cmd.arg("--").arg(pattern).arg(&target);

        let output = tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output())
            .await
            .map_err(|_| AppError::process_kill("grep timed out after 30s".to_string()))?
            .map_err(|err| AppError::process_spawn(format!("Failed to run grep: {err}")))?;

        if output.status.code() == Some(1) {
            return Ok(ToolResult::text(format!(
                "No matches found in {}.",
                target.display()
            )));
        }

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::process_spawn(format!(
                "Failed to run grep: {}",
                stderr.trim()
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result = if stdout.is_empty() {
            format!("No matches found in {}.", target.display())
        } else {
            // Apply max_count if needed
            let lines: Vec<&str> = stdout.lines().collect();
            let total = lines.len();
            let limited: Vec<&str> = lines.into_iter().take(max_count).collect();
            let mut out = limited.join("\n");
            if total > max_count {
                out.push_str(&format!(
                    "\n\n[{} matches total, showing first {}]",
                    total, max_count
                ));
            }
            truncate_output(&out, head_limit)
        };

        Ok(ToolResult::text(result))
    }
}

fn executable_names(name: &str) -> Vec<OsString> {
    #[cfg(windows)]
    {
        let mut names = vec![OsString::from(name)];
        if Path::new(name).extension().is_none() {
            let extensions =
                std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
            names.extend(
                extensions
                    .split(';')
                    .map(str::trim)
                    .filter(|extension| !extension.is_empty())
                    .map(|extension| OsString::from(format!("{name}{extension}"))),
            );
        }
        names
    }
    #[cfg(not(windows))]
    {
        vec![OsString::from(name)]
    }
}

/// Find a binary in PATH, including PATHEXT expansion on Windows.
fn which_in_path(name: &str) -> Option<PathBuf> {
    let direct = Path::new(name);
    if direct.components().count() > 1 && direct.is_file() {
        return Some(direct.to_path_buf());
    }

    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path).find_map(|directory| {
            executable_names(name)
                .into_iter()
                .map(|candidate| directory.join(candidate))
                .find(|candidate| candidate.is_file())
        })
    })
}

struct PlatformShell {
    program: PathBuf,
    arguments: Vec<OsString>,
    display_name: String,
}

#[cfg(windows)]
fn platform_shell() -> PlatformShell {
    for candidate in ["pwsh", "powershell"] {
        if let Some(program) = which_in_path(candidate) {
            return PlatformShell {
                display_name: program.to_string_lossy().into_owned(),
                program,
                arguments: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]
                    .into_iter()
                    .map(OsString::from)
                    .collect(),
            };
        }
    }

    let program = std::env::var_os("COMSPEC")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| which_in_path("cmd"))
        .unwrap_or_else(|| PathBuf::from("cmd.exe"));
    PlatformShell {
        display_name: program.to_string_lossy().into_owned(),
        program,
        arguments: ["/D", "/S", "/C"].into_iter().map(OsString::from).collect(),
    }
}

#[cfg(not(windows))]
fn platform_shell() -> PlatformShell {
    let program = which_in_path("bash")
        .or_else(|| which_in_path("sh"))
        .or_else(|| {
            Path::new("/bin/sh")
                .is_file()
                .then(|| PathBuf::from("/bin/sh"))
        })
        .unwrap_or_else(|| PathBuf::from("sh"));
    let is_bash = program
        .file_stem()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "bash");
    PlatformShell {
        display_name: program.to_string_lossy().into_owned(),
        program,
        arguments: vec![OsString::from(if is_bash { "-lc" } else { "-c" })],
    }
}

async fn collect_shell_output<F>(
    stdout_task: tokio::task::JoinHandle<Vec<String>>,
    stderr_task: tokio::task::JoinHandle<Vec<String>>,
    reader_grace: Duration,
    post_cleanup_grace: Duration,
    cleanup: F,
) -> (Vec<String>, Vec<String>, Option<bool>)
where
    F: Future<Output = bool>,
{
    let stdout_abort = stdout_task.abort_handle();
    let stderr_abort = stderr_task.abort_handle();
    let mut readers = Box::pin(async move {
        let (stdout, stderr) = tokio::join!(stdout_task, stderr_task);
        (stdout.unwrap_or_default(), stderr.unwrap_or_default())
    });

    if let Some((stdout, stderr)) = complete_before_deadline(&mut readers, reader_grace).await {
        return (stdout, stderr, None);
    }

    let cleanup_confirmed = cleanup.await;
    if let Some((stdout, stderr)) = complete_before_deadline(&mut readers, post_cleanup_grace).await
    {
        return (stdout, stderr, Some(cleanup_confirmed));
    }

    // Dropping a JoinHandle detaches its task. Abort explicitly so pipe-reader
    // tasks never outlive the tool call if a hostile descendant retains an FD.
    stdout_abort.abort();
    stderr_abort.abort();
    let (stdout, stderr) = readers.await;
    (stdout, stderr, Some(cleanup_confirmed))
}

/// Retain at most `max_bytes` from a shell pipe while continuing to drain it.
///
/// Reading by chunks is important here: `AsyncBufReadExt::lines` must buffer a
/// complete line before returning it, so a hostile command can otherwise make
/// a nominal output cap unbounded simply by never writing a newline.
async fn read_shell_pipe_bounded<R>(
    mut pipe: R,
    max_bytes: usize,
    stream_name: &'static str,
) -> Vec<String>
where
    R: AsyncRead + Unpin,
{
    let mut retained = Vec::with_capacity(max_bytes.min(8 * 1024));
    let mut buffer = [0_u8; 8 * 1024];
    let mut truncated = false;

    loop {
        let read = match pipe.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        let remaining = max_bytes.saturating_sub(retained.len());
        let keep = remaining.min(read);
        retained.extend_from_slice(&buffer[..keep]);
        truncated |= keep < read;
    }

    if retained.is_empty() && !truncated {
        return Vec::new();
    }

    let mut output = String::from_utf8_lossy(&retained).into_owned();
    if truncated {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push('\n');
        }
        output.push_str(&format!(
            "... ({stream_name} truncated at {max_bytes} bytes)"
        ));
    }
    vec![output]
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
            description: "Execute a platform shell command in the workspace (Bash/POSIX shell on macOS and Linux; PowerShell or cmd on Windows). Use for installing packages, compiling, and running programs. Increase timeout_ms for long-running commands.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The command to execute using the host platform's shell"},
                    "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default: 600000 = 10 minutes)"}
                },
                "required": ["command"]
            }),
            prompt_snippet: "- bash: Execute commands using the host platform shell (default 10 min timeout; syntax must match the current OS)".to_string(),
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

        // Create a new process group so we can kill all children on timeout.
        // On Unix, pre_exec sets the shell as its own process-group leader;
        // Windows assigns the shell to a kill-on-close Job Object and retains
        // taskkill /T as a compatibility fallback.
        let shell = platform_shell();
        let mut cmd = Command::new(&shell.program);
        cmd.args(&shell.arguments)
            .arg(command)
            .current_dir(&self.root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        for name in [
            "KHADIM_SEARCH_PROVIDER",
            "PARALLEL_API_KEY",
            "EXA_API_KEY",
            "TAVILY_API_KEY",
            "PERPLEXITY_API_KEY",
            "BRAVE_SEARCH_API_KEY",
        ] {
            cmd.env_remove(name);
        }
        cmd.kill_on_drop(true);

        #[cfg(unix)]
        {
            unsafe {
                cmd.pre_exec(|| {
                    // Make this process the leader of a new process group
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }
        #[cfg(windows)]
        crate::windows_job::configure_suspended(&mut cmd);

        let mut child = cmd.spawn().map_err(|err| {
            AppError::process_spawn(format!(
                "Failed to spawn platform shell '{}': {err}",
                shell.display_name
            ))
        })?;
        let process_tree_pid = child.id();
        // Register immediately after spawn. The managed-launcher watcher uses
        // this emergency registry because the shell owns a process group that
        // is intentionally separate from the CLI's group.
        let mut process_tree_guard = ProcessTreeDropGuard::new(process_tree_pid);
        #[cfg(windows)]
        let process_job =
            match crate::windows_job::KillOnDropJob::assign_suspended_and_resume(&child) {
                Ok(job) => job,
                Err(error) => {
                    if let Some(pid) = process_tree_pid {
                        cleanup_process_tree_on_drop(pid);
                    }
                    let _ = child.start_kill();
                    return Err(AppError::process_spawn(format!(
                        "Failed to place the Windows shell in a kill-on-close Job Object: {error}"
                    )));
                }
            };
        // Declared after `child`, so cancellation drops this guard first and
        // can still target the live leader/tree before Child::kill_on_drop.

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Cap collected output to prevent OOM on noisy processes
        const MAX_COLLECTED_BYTES: usize = 512_000; // 512 KB

        let stdout_task = tokio::spawn(async move {
            match stdout {
                Some(stdout) => {
                    read_shell_pipe_bounded(stdout, MAX_COLLECTED_BYTES, "stdout").await
                }
                None => Vec::new(),
            }
        });

        let stderr_task = tokio::spawn(async move {
            match stderr {
                Some(stderr) => {
                    read_shell_pipe_bounded(stderr, MAX_COLLECTED_BYTES, "stderr").await
                }
                None => Vec::new(),
            }
        });

        // Wait for the process with a timeout
        let timed_out;
        let mut tree_cleanup_confirmed = true;
        let status =
            match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), child.wait())
                .await
            {
                Ok(Ok(status)) => {
                    timed_out = false;
                    Some(status)
                }
                Ok(Err(err)) => {
                    // wait() itself failed — kill and report
                    #[cfg(windows)]
                    let _ = process_job.terminate();
                    let _ = kill_process_tree(&mut child, process_tree_pid).await;
                    return Err(AppError::process_kill(format!(
                        "Failed to wait for shell: {err}"
                    )));
                }
                Err(_elapsed) => {
                    // TIMEOUT — kill the entire process group, then collect
                    // whatever output was already captured
                    timed_out = true;
                    #[cfg(windows)]
                    {
                        let job_cleanup_confirmed = process_job.terminate().is_ok();
                        tree_cleanup_confirmed = job_cleanup_confirmed
                            | kill_process_tree(&mut child, process_tree_pid).await;
                    }
                    #[cfg(not(windows))]
                    {
                        tree_cleanup_confirmed =
                            kill_process_tree(&mut child, process_tree_pid).await;
                    }
                    None
                }
            };

        // A shell leader can exit while descendants retain its output pipes.
        // Preserve the original tree ID, kill on reader-grace expiry, then
        // drain once more. The second deadline explicitly aborts the readers.
        let reader_tree_cleanup = async {
            #[cfg(windows)]
            {
                let job_cleanup_confirmed = process_job.terminate().is_ok();
                job_cleanup_confirmed | kill_process_tree(&mut child, process_tree_pid).await
            }
            #[cfg(not(windows))]
            {
                kill_process_tree(&mut child, process_tree_pid).await
            }
        };
        let (stdout_lines, stderr_lines, reader_cleanup) = collect_shell_output(
            stdout_task,
            stderr_task,
            Duration::from_secs(5),
            Duration::from_secs(1),
            reader_tree_cleanup,
        )
        .await;
        if let Some(cleanup_confirmed) = reader_cleanup {
            tree_cleanup_confirmed &= cleanup_confirmed;
            if !cleanup_confirmed {
                #[cfg(windows)]
                return Err(AppError::process_kill(
                    "The shell leader exited while descendants retained its output pipes, and neither its Windows Job Object nor taskkill could confirm tree cleanup."
                        .to_string(),
                ));
                #[cfg(not(windows))]
                return Err(AppError::process_kill(
                    "The shell leader exited while descendants retained its output pipes, but process-group cleanup could not be confirmed."
                        .to_string(),
                ));
            }
        }

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

        let exit_code = if timed_out {
            -1
        } else {
            status
                .as_ref()
                .and_then(|status| status.code())
                .unwrap_or(-1)
        };

        if timed_out {
            if tree_cleanup_confirmed {
                output.push_str(&format!(
                    "\n\nProcess timed out after {}ms and was killed (including all child processes)",
                    timeout_ms
                ));
            } else {
                output.push_str(&format!(
                    "\n\nProcess timed out after {}ms; the shell leader was killed, but descendant cleanup could not be confirmed",
                    timeout_ms
                ));
            }
        } else if reader_cleanup.is_some() {
            output.push_str(
                "\n\nThe shell leader exited while descendants retained its output pipes; the remaining process group was killed.",
            );
        } else if let Some(ref st) = status {
            if !st.success() {
                output.push_str(&format!("\n\nCommand exited with status {st}"));
            }
        }

        // Truncate very large output to avoid blowing up context
        process_tree_guard.disarm();
        Ok(ToolResult::with_metadata(
            truncate_output(&output, 100_000),
            json!({
                "command": command,
                "shell": shell.display_name,
                "exit_code": exit_code,
                "timed_out": timed_out,
                "tree_cleanup_confirmed": tree_cleanup_confirmed,
                "windows_job_object": cfg!(windows),
            }),
        ))
    }
}

pub struct EditTool {
    root: PathBuf,
    /// Optional lease guard for post-edit conflict detection (multi-agent).
    lease_guard: Option<Arc<crate::coordinator::lease_guard::LeaseGuard>>,
    /// Optional event sink for emitting `lease_conflict` events.
    event_tx: Option<UnboundedSender<AgentStreamEvent>>,
}

impl EditTool {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            lease_guard: None,
            event_tx: None,
        }
    }

    /// Attach a lease guard for post-edit conflict checks (builder).
    pub fn with_lease_guard(
        mut self,
        guard: Arc<crate::coordinator::lease_guard::LeaseGuard>,
    ) -> Self {
        self.lease_guard = Some(guard);
        self
    }

    /// Attach an event sink for `lease_conflict` events (builder).
    pub fn with_event_tx(mut self, tx: UnboundedSender<AgentStreamEvent>) -> Self {
        self.event_tx = Some(tx);
        self
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
        let original = std::fs::read_to_string(&target)
            .map_err(|e| AppError::io(format!("Failed to read {}: {e}", target.display())))?;
        let mut content = original.clone();

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
                errors.push(format!(
                    "edit[{i}]: old_text matches {count} locations (must be unique)"
                ));
                continue;
            }

            content = content.replacen(old_text, new_text, 1);
            applied += 1;
        }

        if applied > 0 {
            std::fs::write(&target, &content)
                .map_err(|e| AppError::io(format!("Failed to write {}: {e}", target.display())))?;
        }

        // Post-edit lease conflict check (multi-agent only).
        if applied > 0 {
            if let Some(guard) = &self.lease_guard {
                let conflicts = guard.check_after_edit_with_source(&target, &content);
                if !conflicts.is_empty() {
                    guard.emit_conflict_events(&conflicts);
                    let c = &conflicts[0];
                    return Err(AppError::invalid_input(format!(
                        "lease_conflict: worker '{}' edited file {} range {}..{} which is leased by worker '{}'",
                        guard.worker_id(),
                        c.file.display(),
                        c.range.start,
                        c.range.end,
                        c.conflicting_lease.worker_id,
                    )));
                }
            }
        }

        let mut result = format!(
            "Applied {applied}/{} edits to {}",
            edits.len(),
            target.display()
        );
        if !errors.is_empty() {
            result.push_str("\nErrors:\n");
            result.push_str(&errors.join("\n"));
        }

        let display_path = target
            .strip_prefix(&self.root)
            .unwrap_or(&target)
            .display()
            .to_string();
        let mut tool_result = ToolResult::text(result);
        // Include before/after in metadata so the UI can render a diff.
        if applied > 0 {
            tool_result.metadata = Some(json!({
                "path": display_path,
                "before": original,
                "after": content,
            }));
        } else {
            tool_result.metadata = Some(json!({ "path": display_path }));
        }

        Ok(tool_result)
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
            description: "Find files matching a glob pattern. Returns matching file paths relative to the workspace root. Supports *, **, ?, [...], and {a,b} patterns. Respects .gitignore by default.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern to match, e.g. '**/*.rs' or 'src/**/*.ts'. Supports *, **, ?, [abc], {a,b}"},
                    "path": {"type": "string", "description": "Base directory to search in (default: workspace root)"},
                    "exclude": {"type": "array", "items": {"type": "string"}, "description": "Glob patterns to exclude from results, e.g. ['**/target/**', '**/node_modules/**']"},
                    "case_sensitive": {"type": "boolean", "description": "Case-sensitive matching (default: true on Linux, false otherwise)"},
                    "max_results": {"type": "integer", "description": "Maximum number of results to return (default: 1000)"},
                    "max_depth": {"type": "integer", "description": "Maximum directory depth to traverse (default: unlimited)"}
                },
                "required": ["pattern"]
            }),
            prompt_snippet: "- glob: Find files matching a glob pattern (*, **, ?, [...], {a,b})".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let pattern = input
            .get("pattern")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("glob requires a pattern"))?;
        let base_path = input
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or(".");
        let base = normalize_path(&self.root, base_path)?;
        let case_sensitive = input
            .get("case_sensitive")
            .and_then(|value| value.as_bool())
            .unwrap_or(cfg!(target_os = "linux"));
        let max_results = input
            .get("max_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(1_000) as usize;
        let max_depth = input.get("max_depth").and_then(|v| v.as_u64());

        // Parse exclude patterns from input
        let exclude_patterns: Vec<String> = input
            .get("exclude")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        // Build the walker using the `ignore` crate (respects .gitignore)
        let mut builder = ignore::WalkBuilder::new(&base);
        builder.standard_filters(true); // respect .gitignore, .ignore, etc.
        builder.hidden(false); // include hidden files
        builder.follow_links(false);
        builder.require_git(false); // don't require a git repo
        builder.sort_by_file_path(|a, b| a.cmp(b));

        if let Some(depth) = max_depth {
            builder.max_depth(Some(depth as usize));
        }

        // Add additional exclude patterns (single filter checking all patterns)
        if !exclude_patterns.is_empty() {
            let exclusions = exclude_patterns
                .iter()
                .map(|pattern| {
                    glob::Pattern::new(pattern).map_err(|err| {
                        AppError::invalid_input(format!("Invalid exclude glob '{pattern}': {err}"))
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            let filter_base = base.clone();
            builder.filter_entry(move |entry| {
                let relative = entry
                    .path()
                    .strip_prefix(&filter_base)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .replace('\\', "/");
                !exclusions
                    .iter()
                    .any(|pattern| path_matches_glob(pattern, &relative))
            });
        }

        // Compile the glob pattern
        let glob_pattern = glob::Pattern::new(pattern)
            .map_err(|e| AppError::invalid_input(format!("Invalid glob pattern: {e}")))?;

        let mut found: Vec<String> = Vec::new();

        for result in builder.build() {
            if found.len() >= max_results {
                break;
            }
            match result {
                Ok(entry) => {
                    if entry.file_type().map_or(false, |ft| ft.is_file()) {
                        let path = entry.path();
                        let relative = path
                            .strip_prefix(&base)
                            .unwrap_or(path)
                            .to_string_lossy()
                            .replace('\\', "/");

                        let matches = if case_sensitive {
                            glob_pattern.matches(&relative)
                        } else {
                            glob_pattern.matches_with(
                                &relative,
                                glob::MatchOptions {
                                    case_sensitive: false,
                                    require_literal_separator: false,
                                    require_literal_leading_dot: false,
                                },
                            )
                        };

                        if matches {
                            found.push(relative);
                        }
                    }
                }
                Err(err) => {
                    // Log but continue — permission errors etc.
                    eprintln!("glob: walk error: {}", err);
                }
            }
        }

        if found.is_empty() {
            Ok(ToolResult::text(format!(
                "No files matched the pattern '{}' in {}.",
                pattern,
                base.display()
            )))
        } else {
            let mut result = found.join("\n");
            if found.len() >= max_results {
                result.push_str(&format!(
                    "\n\n[Result limit reached: showing first {max_results} matches]"
                ));
            }
            if result.len() > 50_000 {
                result = truncate_output(&result, 50_000);
            }
            Ok(ToolResult::text(result))
        }
    }
}

#[derive(Debug)]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

fn search_provider() -> (&'static str, Option<String>) {
    match std::env::var("KHADIM_SEARCH_PROVIDER").as_deref() {
        Ok("parallel") => ("Parallel", std::env::var("PARALLEL_API_KEY").ok()),
        Ok("exa") => ("Exa", std::env::var("EXA_API_KEY").ok()),
        Ok("tavily") => ("Tavily", std::env::var("TAVILY_API_KEY").ok()),
        Ok("perplexity") => ("Perplexity", std::env::var("PERPLEXITY_API_KEY").ok()),
        Ok("brave") => ("Brave", std::env::var("BRAVE_SEARCH_API_KEY").ok()),
        _ => ("DuckDuckGo", None),
    }
}

fn json_results(value: &Value, provider: &str, limit: usize) -> Vec<WebSearchResult> {
    let items = match provider {
        "Brave" => value.pointer("/web/results").and_then(Value::as_array),
        _ => value.get("results").and_then(Value::as_array),
    };
    items
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| {
            let url = item.get("url")?.as_str()?.trim();
            if url.is_empty() {
                return None;
            }
            let title = item
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or(url)
                .trim();
            let snippet = match provider {
                "Parallel" => item.get("excerpts").and_then(Value::as_array).map(|parts| {
                    parts
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" ")
                }),
                "Exa" => item
                    .get("highlights")
                    .and_then(Value::as_array)
                    .map(|parts| {
                        parts
                            .iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .or_else(|| item.get("text").and_then(Value::as_str).map(str::to_string)),
                "Tavily" => item
                    .get("content")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                "Perplexity" => item
                    .get("snippet")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                "Brave" => item
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                _ => None,
            }
            .unwrap_or_default();
            Some(WebSearchResult {
                title: title.to_string(),
                url: url.to_string(),
                snippet,
            })
        })
        .collect()
}

async fn search_api(
    client: &reqwest::Client,
    provider: &str,
    api_key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<WebSearchResult>, AppError> {
    let (request, body) = match provider {
        "Parallel" => (
            client
                .post("https://api.parallel.ai/v1/search")
                .header("x-api-key", api_key),
            json!({
                "objective": query,
                "search_queries": [query],
                "mode": "basic",
                "advanced_settings": { "max_results": limit },
                "max_chars_total": 12000
            }),
        ),
        "Exa" => (
            client
                .post("https://api.exa.ai/search")
                .header("x-api-key", api_key),
            json!({ "query": query, "type": "auto", "numResults": limit, "contents": { "highlights": true } }),
        ),
        "Tavily" => (
            client
                .post("https://api.tavily.com/search")
                .bearer_auth(api_key),
            json!({ "query": query, "search_depth": "basic", "max_results": limit, "include_answer": false }),
        ),
        "Perplexity" => (
            client
                .post("https://api.perplexity.ai/search")
                .bearer_auth(api_key),
            json!({ "query": query, "max_results": limit, "search_context_size": "medium" }),
        ),
        "Brave" => {
            let url = format!(
                "https://api.search.brave.com/res/v1/web/search?q={}&count={}&extra_snippets=true",
                urlencoding::encode(query),
                limit
            );
            (
                client
                    .get(url)
                    .header("X-Subscription-Token", api_key)
                    .header("Accept", "application/json"),
                Value::Null,
            )
        }
        _ => return Err(AppError::invalid_input("Unsupported search provider")),
    };
    let request = if body.is_null() {
        request
    } else {
        request.json(&body)
    };
    let response = request
        .send()
        .await
        .map_err(|error| AppError::io(format!("{provider} search request failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::health(format!(
            "{provider} search returned HTTP {}",
            response.status()
        )));
    }
    let value: Value = response.json().await.map_err(|error| {
        AppError::io(format!(
            "{provider} returned invalid search results: {error}"
        ))
    })?;
    Ok(json_results(&value, provider, limit))
}

async fn search_duckduckgo(
    client: &reqwest::Client,
    query: &str,
    limit: usize,
) -> Result<Vec<WebSearchResult>, AppError> {
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(query)
    );
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| AppError::io(format!("DuckDuckGo search request failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::health(format!(
            "DuckDuckGo returned HTTP {}",
            response.status()
        )));
    }
    let html = response
        .text()
        .await
        .map_err(|error| AppError::io(format!("Failed to read DuckDuckGo response: {error}")))?;
    Ok(parse_ddg_results(&html, limit)
        .into_iter()
        .map(|result| {
            let mut lines = result.lines();
            let title = lines.next().unwrap_or_default().to_string();
            let url = lines
                .next()
                .unwrap_or_default()
                .trim_start_matches("  URL: ")
                .to_string();
            let snippet = lines.collect::<Vec<_>>().join(" ").trim().to_string();
            WebSearchResult {
                title,
                url,
                snippet,
            }
        })
        .collect())
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
            description: "Search the web using the configured search integration. Returns grounded titles, URLs, and excerpts for documentation, research, and current information.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "num_results": {"type": "integer", "description": "Number of results to return (default: 5, max: 10)"}
                },
                "required": ["query"]
            }),
            prompt_snippet: "- web_search: Search the web using the configured search provider".to_string(),
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

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| AppError::io(format!("Failed to build HTTP client: {e}")))?;

        let (provider, api_key) = search_provider();
        let search = async {
            if provider == "DuckDuckGo" {
                search_duckduckgo(&client, query, num_results).await
            } else if let Some(api_key) = api_key.as_deref() {
                search_api(&client, provider, api_key, query, num_results).await
            } else {
                Err(AppError::invalid_input(format!(
                    "{provider} search is missing its API key"
                )))
            }
        };
        let results = tokio::time::timeout(std::time::Duration::from_secs(25), search)
            .await
            .map_err(|_| AppError::process_kill(format!("{provider} search timed out")))??;
        if results.is_empty() {
            return Ok(ToolResult::text(format!(
                "No search results found for '{query}' using {provider}."
            )));
        }
        let formatted = results
            .iter()
            .enumerate()
            .map(|(index, result)| {
                format!(
                    "{}. {}\n   URL: {}\n   {}",
                    index + 1,
                    result.title,
                    result.url,
                    result.snippet
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        Ok(ToolResult::text(format!(
            "Search results for '{query}' via {provider}:\n\n{formatted}"
        )))
    }
}

/// Parse DuckDuckGo HTML results using block-based extraction.
/// Splits on `<div class="result` so multi-line tags don't break parsing.
fn parse_ddg_results(html: &str, limit: usize) -> Vec<String> {
    let mut results = Vec::new();

    // DuckDuckGo wraps each result in a div with class "result ..."
    for block in html.split(r#"<div class="result"#).skip(1) {
        let title = extract_tag_text(block, r#"class="result__a""#, "</a>");
        let snippet = extract_tag_text(block, r#"class="result__snippet""#, "</a>");
        let href = extract_tag_attr(block, r#"class="result__a""#, "href");

        let url = href
            .as_ref()
            .and_then(|h| extract_ddg_url(h))
            .or(href)
            .unwrap_or_default();

        if let Some(title) = title {
            let snippet = snippet.unwrap_or_default();
            results.push(format!("{}\n  URL: {}\n  {}", title, url, snippet));
            if results.len() >= limit {
                break;
            }
        }
    }

    results
}

/// Extract the text content of a tag that contains `marker`.
/// Finds the first tag containing `marker`, then returns everything
/// between its closing `>` and `end_tag`.
fn extract_tag_text(html: &str, marker: &str, end_tag: &str) -> Option<String> {
    let marker_pos = html.find(marker)?;
    // Walk back from marker to find the opening '<'
    let tag_start = html[..marker_pos].rfind('<')?;
    // Find the closing '>' of this tag
    let after_tag_start = &html[tag_start..];
    let close_bracket = after_tag_start.find('>')?;
    let content_start = tag_start + close_bracket + 1;
    let content = &html[content_start..];
    let end_pos = content.find(end_tag)?;
    let text = html_escape::decode_html_entities(&content[..end_pos])
        .trim()
        .to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Extract an attribute value from the first tag containing `marker`.
fn extract_tag_attr(html: &str, marker: &str, attr: &str) -> Option<String> {
    let marker_pos = html.find(marker)?;
    let tag_start = html[..marker_pos].rfind('<')?;
    let tag = &html[tag_start..];
    let attr_prefix = format!(r#"{}=""#, attr);
    let attr_pos = tag.find(&attr_prefix)?;
    let after_attr = &tag[attr_pos + attr_prefix.len()..];
    let end_quote = after_attr.find('"')?;
    let value = after_attr[..end_quote].to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
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

// ── Web Fetch tool ─────────────────────────────────────────────────────

pub struct WebFetchTool;

impl WebFetchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl Tool for WebFetchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_fetch".to_string(),
            description: "Fetch and extract text content from a URL. Strips HTML tags and returns plain text. Useful for reading documentation pages, API references, and blog posts.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch content from"},
                    "max_bytes": {"type": "integer", "description": "Maximum bytes to return after text extraction (default: 50000)"}
                },
                "required": ["url"]
            }),
            prompt_snippet: "- web_fetch: Fetch and extract text content from a URL".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let url = input
            .get("url")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("web_fetch requires a url"))?;
        let max_bytes = input
            .get("max_bytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(50_000) as usize;

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| AppError::io(format!("Failed to build HTTP client: {e}")))?;

        let response =
            tokio::time::timeout(std::time::Duration::from_secs(20), client.get(url).send())
                .await
                .map_err(|_| AppError::process_kill("web_fetch timed out after 20s".to_string()))?
                .map_err(|e| AppError::io(format!("Web fetch request failed: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::io(format!(
                "Web fetch returned HTTP {} for {}",
                response.status(),
                url
            )));
        }

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        // Only handle text/html or text/plain content
        if !content_type.contains("text/html")
            && !content_type.contains("text/plain")
            && !content_type.is_empty()
        {
            return Err(AppError::io(format!(
                "web_fetch cannot handle content type '{}'. Use for HTML or plain text pages only.",
                content_type
            )));
        }

        let html = response
            .text()
            .await
            .map_err(|e| AppError::io(format!("Failed to read response body: {e}")))?;

        let text = extract_text_from_html(&html);
        let result = truncate_output(&text, max_bytes);

        Ok(ToolResult::text(format!(
            "Content from {} ({} bytes extracted):\n\n{}",
            url,
            text.len(),
            result
        )))
    }
}

/// Simple HTML-to-text extraction: removes scripts, styles, and tags.
fn extract_text_from_html(html: &str) -> String {
    // Remove script and style blocks with their content
    let re_script = Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let re_style = Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let re_tag = Regex::new(r"<[^>]*>").unwrap();
    let re_entity = Regex::new(r"&[a-zA-Z]+;").unwrap();
    let re_ws = Regex::new(r"\s{2,}").unwrap();

    let text = re_script.replace_all(html, "");
    let text = re_style.replace_all(&text, "");
    let text = re_tag.replace_all(&text, " ");

    // Decode common HTML entities
    let text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    let text = re_entity.replace_all(&text, "");

    // Collapse whitespace and trim lines
    let text = re_ws.replace_all(&text, " ");
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    lines.join("\n")
}

// ── Append tool ─────────────────────────────────────────────────────────

pub struct AppendTool {
    root: PathBuf,
}

impl AppendTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for AppendTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "append".to_string(),
            description: "Append content to the end of a file. Creates the file and parent directories if they don't exist. More efficient than reading + writing for simple additions.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path (relative to workspace root, or absolute)"},
                    "content": {"type": "string", "description": "Content to append to the file"}
                },
                "required": ["path", "content"]
            }),
            prompt_snippet: "- append: Append to the end of a file without reading it first".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("append requires a path"))?;
        let content = input
            .get("content")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("append requires content"))?;

        let target = normalize_path(&self.root, path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }

        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&target)
            .map_err(|e| AppError::io(format!("Failed to open {}: {e}", target.display())))?;

        // Ensure newline before appended content if file is not empty
        let metadata = file.metadata().ok();
        if metadata.map_or(false, |m| m.len() > 0) && !content.starts_with('\n') {
            file.write_all(b"\n").map_err(|e| {
                AppError::io(format!("Failed to write to {}: {e}", target.display()))
            })?;
        }

        file.write_all(content.as_bytes())
            .map_err(|e| AppError::io(format!("Failed to write to {}: {e}", target.display())))?;

        Ok(ToolResult::text(format!(
            "Appended {} bytes to {}",
            content.len(),
            target.display()
        )))
    }
}

// ── Delete tool ─────────────────────────────────────────────────────────

pub struct DeleteTool {
    root: PathBuf,
}

impl DeleteTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait::async_trait]
impl Tool for DeleteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "delete".to_string(),
            description: "Delete a file or empty directory. Use with caution — this operation is irreversible. For non-empty directories, use bash rm -rf instead.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path to delete (relative to workspace root, or absolute)"}
                },
                "required": ["path"]
            }),
            prompt_snippet: "- delete: Delete a file or empty directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("delete requires a path"))?;

        let target = normalize_path(&self.root, path)?;

        if !target.exists() {
            return Ok(ToolResult::text(format!(
                "Path does not exist: {}",
                target.display()
            )));
        }

        if target.is_dir() {
            std::fs::remove_dir(&target).map_err(|e| {
                if e.to_string().contains("not empty")
                    || e.to_string().contains("Directory not empty")
                {
                    AppError::io(format!(
                        "Directory not empty: {}. Use bash rm -rf for non-empty directories.",
                        target.display()
                    ))
                } else {
                    AppError::io(format!(
                        "Failed to delete directory {}: {e}",
                        target.display()
                    ))
                }
            })?;
            Ok(ToolResult::text(format!(
                "Deleted directory: {}",
                target.display()
            )))
        } else {
            std::fs::remove_file(&target).map_err(|e| {
                AppError::io(format!("Failed to delete file {}: {e}", target.display()))
            })?;
            Ok(ToolResult::text(format!(
                "Deleted file: {}",
                target.display()
            )))
        }
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
            .ok_or_else(|| {
                AppError::invalid_input("memory requires an action (save, recall, list, delete)")
            })?;

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
                let safe_key =
                    key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                std::fs::write(&file_path, value)?;
                Ok(ToolResult::text(format!(
                    "Saved memory '{}' ({} bytes)",
                    key,
                    value.len()
                )))
            }
            "recall" => {
                let key = input
                    .get("key")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory recall requires a key"))?;

                let safe_key =
                    key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                match std::fs::read_to_string(&file_path) {
                    Ok(content) => Ok(ToolResult::text(format!("Memory '{}':\n{}", key, content))),
                    Err(_) => Ok(ToolResult::text(format!(
                        "No memory found for key '{}'",
                        key
                    ))),
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
                    Ok(ToolResult::text(format!(
                        "Stored memories:\n{}",
                        keys.join("\n")
                    )))
                }
            }
            "delete" => {
                let key = input
                    .get("key")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::invalid_input("memory delete requires a key"))?;

                let safe_key =
                    key.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
                let file_path = memory_dir.join(format!("{safe_key}.md"));
                match std::fs::remove_file(&file_path) {
                    Ok(()) => Ok(ToolResult::text(format!("Deleted memory '{}'", key))),
                    Err(_) => Ok(ToolResult::text(format!(
                        "No memory found for key '{}'",
                        key
                    ))),
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

use crate::agent::modes::{sub_explore_mode, sub_general_mode, sub_review_mode};
use crate::events::AgentStreamEvent;

pub struct DelegateTool {
    root: PathBuf,
    /// Optional event sink. When present, subagent events stream to the parent
    /// run instead of being discarded. When `None`, the tool behaves exactly
    /// like the previous silent inline loop.
    event_tx: Option<UnboundedSender<AgentStreamEvent>>,
    /// Delegated helpers inherit the primary run's exact model and credential
    /// scope. `None` preserves the standalone/default-tool behavior.
    selection: Option<ModelSelection>,
    /// Names of read-only tools enabled on the primary runtime. `None` keeps
    /// the standalone/default-tool behavior for backwards compatibility.
    allowed_tools: Option<Vec<String>>,
}

impl DelegateTool {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            event_tx: None,
            selection: None,
            allowed_tools: None,
        }
    }

    /// Construct with an event sink (streaming mode).
    pub fn with_event_sink(root: PathBuf, event_tx: UnboundedSender<AgentStreamEvent>) -> Self {
        Self {
            root,
            event_tx: Some(event_tx),
            selection: None,
            allowed_tools: None,
        }
    }

    pub fn with_context(
        root: PathBuf,
        event_tx: UnboundedSender<AgentStreamEvent>,
        selection: Option<ModelSelection>,
        allowed_tools: Vec<String>,
    ) -> Self {
        Self {
            root,
            event_tx: Some(event_tx),
            selection,
            allowed_tools: Some(allowed_tools),
        }
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
            "general" => sub_general_mode(),
            "explore" => sub_explore_mode(),
            "review" => sub_review_mode(),
            other => {
                return Err(AppError::invalid_input(format!(
                    "Unknown subagent type: '{}'. Use 'general', 'explore', or 'review'.",
                    other
                )))
            }
        };

        // Delegate to a read-only, bounded worker (max 10 turns — matching the
        // previous inline subagent loop). When an event sink is set, subagent
        // events stream to the parent; otherwise they are discarded (silent,
        // preserving the original behavior).
        let worker_id = format!("delegate-{agent_type}-{}", uuid::Uuid::new_v4());
        let spec = WorkerSpec {
            worker_id: worker_id.clone(),
            mode,
            task: task.to_string(),
            write_scope: self
                .allowed_tools
                .clone()
                .map(WriteScope::ReadOnlyTools)
                .unwrap_or(WriteScope::ReadOnly),
            max_turns: Some(10),
            leases: Vec::new(),
        };

        let handle = if let Some(tx) = self.event_tx.clone() {
            spawn_worker(spec, self.root.clone(), self.selection.clone(), tx)
        } else {
            // No sink: create a throwaway channel and drain it silently.
            let (silent_tx, mut silent_rx) =
                tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
            let handle = spawn_worker(spec, self.root.clone(), self.selection.clone(), silent_tx);
            // Drain in the background so the worker's sends don't block.
            tokio::spawn(async move { while silent_rx.recv().await.is_some() {} });
            handle
        };

        let summary = handle
            .join
            .await
            .map_err(|e| AppError::io(format!("Subagent worker panicked: {e}")))??;

        Ok(ToolResult::text(format!(
            "[Subagent '{}' findings]\n{}",
            agent_type, summary
        )))
    }
}

// ── Default tool registries ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct NativeToolDefinition {
    name: String,
    description: String,
    parameters: Value,
    prompt_snippet: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NativeToolRpcResponse {
    content: String,
    metadata: Option<Value>,
}

pub struct NativeRpcTool {
    definition: ToolDefinition,
    rpc_url: String,
    token: String,
}

impl NativeRpcTool {
    fn new(definition: ToolDefinition, rpc_url: String, token: String) -> Self {
        Self {
            definition,
            rpc_url,
            token,
        }
    }
}

#[async_trait::async_trait]
impl Tool for NativeRpcTool {
    fn definition(&self) -> ToolDefinition {
        self.definition.clone()
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let url = format!(
            "{}/tool/{}",
            self.rpc_url.trim_end_matches('/'),
            self.definition.name
        );
        let response = reqwest::Client::new()
            .post(url)
            .bearer_auth(&self.token)
            .json(&json!({ "input": input }))
            .send()
            .await
            .map_err(|err| AppError::io(format!("Native tool RPC request failed: {err}")))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|err| AppError::io(format!("Native tool RPC response read failed: {err}")))?;
        if !status.is_success() {
            return Err(AppError::io(format!(
                "Native tool RPC failed ({status}): {text}"
            )));
        }

        let parsed = serde_json::from_str::<NativeToolRpcResponse>(&text)
            .map_err(|err| AppError::io(format!("Native tool RPC returned invalid JSON: {err}")))?;
        Ok(ToolResult {
            content: parsed.content,
            metadata: parsed.metadata,
        })
    }
}

fn native_rpc_tools_from_env() -> Vec<Arc<dyn Tool>> {
    let Ok(raw_tools) = std::env::var("KHADIM_NATIVE_TOOLS") else {
        return Vec::new();
    };
    let Ok(rpc_url) = std::env::var("KHADIM_NATIVE_TOOL_RPC_URL") else {
        return Vec::new();
    };
    let Ok(token) = std::env::var("KHADIM_NATIVE_TOOL_RPC_TOKEN") else {
        return Vec::new();
    };

    let Ok(definitions) = serde_json::from_str::<Vec<NativeToolDefinition>>(&raw_tools) else {
        return Vec::new();
    };

    definitions
        .into_iter()
        .map(|definition| {
            Arc::new(NativeRpcTool::new(
                ToolDefinition {
                    prompt_snippet: definition.prompt_snippet.unwrap_or_else(|| {
                        format!("- {}: {}", definition.name, definition.description)
                    }),
                    name: definition.name,
                    description: definition.description,
                    parameters: definition.parameters,
                },
                rpc_url.clone(),
                token.clone(),
            )) as Arc<dyn Tool>
        })
        .collect()
}

/// Full tool set for primary agents (read + write + execute).
pub fn default_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    let mut tools: Vec<Arc<dyn Tool>> = vec![
        Arc::new(ReadTool::new(root.to_path_buf())),
        Arc::new(WriteTool::new(root.to_path_buf())),
        Arc::new(EditTool::new(root.to_path_buf())),
        Arc::new(AppendTool::new(root.to_path_buf())),
        Arc::new(DeleteTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::new(root.to_path_buf())),
        Arc::new(GrepTool::new(root.to_path_buf())),
        Arc::new(BashTool::new(root.to_path_buf())),
        Arc::new(GlobTool::new(root.to_path_buf())),
        Arc::new(WebSearchTool::new()),
        Arc::new(WebFetchTool::new()),
        Arc::new(MemoryTool::new(root.to_path_buf())),
        Arc::new(DelegateTool::new(root.to_path_buf())),
    ];
    tools.extend(native_rpc_tools_from_env());
    tools
}

/// Read-only tool set for subagents (no write, edit, append, delete, or bash).
pub fn read_only_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::new(root.to_path_buf())),
        Arc::new(GrepTool::new(root.to_path_buf())),
        Arc::new(GlobTool::new(root.to_path_buf())),
        Arc::new(WebSearchTool::new()),
        Arc::new(WebFetchTool::new()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coordinator::lease::LeaseManager;
    use crate::coordinator::lease_guard::LeaseGuard;
    use khadim_ai_core::tools::Tool;
    use khadim_code_graph::{NodePath, NodeSpan, ParseCache};
    use std::sync::Arc;

    static DROP_CLEANUP_PID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

    fn record_drop_cleanup(pid: u32) {
        DROP_CLEANUP_PID.store(pid, std::sync::atomic::Ordering::SeqCst);
    }

    #[test]
    fn normalizes_ai_search_provider_responses() {
        let parallel = json_results(
            &json!({
                "results": [{ "title": "Parallel result", "url": "https://example.com/parallel", "excerpts": ["First", "Second"] }]
            }),
            "Parallel",
            5,
        );
        assert_eq!(parallel[0].snippet, "First Second");

        let brave = json_results(
            &json!({
                "web": { "results": [{ "title": "Brave result", "url": "https://example.com/brave", "description": "Snippet" }] }
            }),
            "Brave",
            5,
        );
        assert_eq!(brave[0].title, "Brave result");
        assert_eq!(brave[0].snippet, "Snippet");

        let exa = json_results(
            &json!({
                "results": [{ "title": "Exa result", "url": "https://example.com/exa", "highlights": ["Relevant excerpt"] }]
            }),
            "Exa",
            5,
        );
        assert_eq!(exa[0].snippet, "Relevant excerpt");
    }

    #[test]
    fn exa_empty_results_remain_empty_instead_of_becoming_duckduckgo_results() {
        let exa = json_results(&json!({ "results": [] }), "Exa", 5);

        assert!(exa.is_empty());
    }

    #[test]
    fn process_tree_drop_guard_runs_only_while_armed() {
        DROP_CLEANUP_PID.store(0, std::sync::atomic::Ordering::SeqCst);
        {
            let _guard = ProcessTreeDropGuard::with_cleanup(Some(42), record_drop_cleanup);
        }
        assert_eq!(
            DROP_CLEANUP_PID.load(std::sync::atomic::Ordering::SeqCst),
            42
        );

        DROP_CLEANUP_PID.store(0, std::sync::atomic::Ordering::SeqCst);
        {
            let mut guard = ProcessTreeDropGuard::with_cleanup(Some(43), record_drop_cleanup);
            guard.disarm();
        }
        assert_eq!(
            DROP_CLEANUP_PID.load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }

    #[tokio::test]
    async fn cleanup_deadline_bounds_a_stalled_future() {
        assert_eq!(
            complete_before_deadline(std::future::ready(7_u8), std::time::Duration::from_secs(1))
                .await,
            Some(7)
        );
        assert!(
            complete_before_deadline(std::future::pending::<()>(), std::time::Duration::ZERO,)
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn stalled_output_readers_trigger_cleanup_and_are_aborted() {
        let stdout = tokio::spawn(std::future::pending::<Vec<String>>());
        let stderr = tokio::spawn(std::future::pending::<Vec<String>>());
        let cleanup_called = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cleanup_observer = cleanup_called.clone();

        let (stdout_lines, stderr_lines, cleanup_result) = collect_shell_output(
            stdout,
            stderr,
            std::time::Duration::ZERO,
            std::time::Duration::ZERO,
            async move {
                cleanup_observer.store(true, std::sync::atomic::Ordering::SeqCst);
                true
            },
        )
        .await;

        assert!(stdout_lines.is_empty());
        assert!(stderr_lines.is_empty());
        assert_eq!(cleanup_result, Some(true));
        assert!(cleanup_called.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn shell_pipe_cap_is_chunk_bounded_and_still_drains_without_newlines() {
        use tokio::io::AsyncWriteExt as _;

        let payload = b"0123456789abcdefghijklmnopqrstuvwxyz".to_vec();
        let (mut writer, reader) = tokio::io::duplex(8);
        let (retained, written) = tokio::time::timeout(Duration::from_secs(1), async move {
            tokio::join!(read_shell_pipe_bounded(reader, 10, "stdout"), async move {
                writer.write_all(&payload).await?;
                writer.shutdown().await
            })
        })
        .await
        .expect("bounded reader must keep draining after reaching its cap");

        written.expect("write newline-free payload");
        assert_eq!(
            retained,
            vec!["0123456789\n... (stdout truncated at 10 bytes)".to_string()]
        );
    }

    #[test]
    fn truncation_preserves_utf8_boundaries() {
        let source = "🙂漢字é".repeat(40);
        let truncated = truncate_output(&source, 19);

        assert!(truncated.contains("bytes truncated"));
        assert!(std::str::from_utf8(truncated.as_bytes()).is_ok());
    }

    #[tokio::test]
    async fn read_offset_beyond_eof_returns_an_empty_page() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        std::fs::write(temp.path().join("short.txt"), "one\ntwo\n").expect("write fixture");
        let tool = ReadTool::new(temp.path().to_path_buf());

        let result = tool
            .execute(json!({ "path": "short.txt", "offset": u64::MAX }))
            .await
            .expect("read beyond EOF should not panic");

        assert_eq!(result.content, "");
        assert_eq!(result.metadata.expect("read metadata")["lines"], 2);
    }

    #[test]
    fn built_in_grep_is_portable_and_skips_generated_directories() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        std::fs::create_dir_all(temp.path().join("src/nested")).expect("create source dir");
        std::fs::create_dir_all(temp.path().join("node_modules/pkg"))
            .expect("create generated dir");
        std::fs::write(
            temp.path().join("src/nested/file with ünicode.txt"),
            "first\nPortable Needle\n",
        )
        .expect("write source fixture");
        std::fs::write(
            temp.path().join("node_modules/pkg/hidden.txt"),
            "portable needle\n",
        )
        .expect("write ignored fixture");

        let output = grep_in_process(InProcessGrepOptions {
            root: temp.path().to_path_buf(),
            target: temp.path().to_path_buf(),
            pattern: "portable needle".to_string(),
            include: Some("**/*.txt".to_string()),
            exclude: None,
            case_sensitive: false,
            fixed_strings: true,
            max_count: 20,
            head_limit: 50_000,
            deadline: std::time::Instant::now() + std::time::Duration::from_secs(1),
            file_byte_limit: MAX_GREP_FILE_BYTES,
        })
        .expect("portable grep should succeed");

        assert!(output.contains("src/nested/file with ünicode.txt:2:Portable Needle"));
        assert!(!output.contains("node_modules"));
        assert!(!output.contains('\\'));
    }

    #[test]
    fn built_in_grep_never_reads_past_the_per_file_cap() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        std::fs::write(temp.path().join("large.txt"), "before\nneedle\n")
            .expect("write capped fixture");

        let output = grep_in_process(InProcessGrepOptions {
            root: temp.path().to_path_buf(),
            target: temp.path().to_path_buf(),
            pattern: "needle".to_string(),
            include: None,
            exclude: None,
            case_sensitive: true,
            fixed_strings: true,
            max_count: 20,
            head_limit: 50_000,
            deadline: std::time::Instant::now() + std::time::Duration::from_secs(1),
            file_byte_limit: 7,
        })
        .expect("capped grep should complete");

        assert!(output.contains("No matches found"));
        assert!(!output.contains("needle"));
    }

    #[test]
    fn built_in_grep_rejects_an_expired_budget_without_walking() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        let error = grep_in_process(InProcessGrepOptions {
            root: temp.path().to_path_buf(),
            target: temp.path().to_path_buf(),
            pattern: "needle".to_string(),
            include: None,
            exclude: None,
            case_sensitive: true,
            fixed_strings: true,
            max_count: 20,
            head_limit: 50_000,
            deadline: std::time::Instant::now(),
            file_byte_limit: MAX_GREP_FILE_BYTES,
        })
        .expect_err("expired grep budget must fail closed");

        assert!(error.message.contains("timed out after 30s"));
    }

    #[tokio::test]
    async fn glob_uses_slash_separated_paths_and_exclusions() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        std::fs::create_dir_all(temp.path().join("src/nested")).expect("create source dir");
        std::fs::create_dir_all(temp.path().join("src/ignored")).expect("create ignored dir");
        std::fs::write(temp.path().join("src/nested/lib.rs"), "fn portable() {}")
            .expect("write source fixture");
        std::fs::write(temp.path().join("src/ignored/skip.rs"), "fn skip() {}")
            .expect("write ignored fixture");
        let tool = GlobTool::new(temp.path().to_path_buf());

        let result = tool
            .execute(json!({
                "pattern": "**/*.rs",
                "exclude": ["**/ignored/**"],
                "case_sensitive": true
            }))
            .await
            .expect("glob should succeed");

        assert!(result.content.contains("src/nested/lib.rs"));
        assert!(!result.content.contains("ignored"));
        assert!(!result.content.contains('\\'));
    }

    #[tokio::test]
    async fn shell_tool_runs_in_the_workspace_and_reports_its_backend() {
        let temp = tempfile::tempdir().expect("create temporary workspace");
        let tool = BashTool::new(temp.path().to_path_buf());

        let result = tool
            .execute(json!({ "command": "echo shell-ok", "timeout_ms": 5_000 }))
            .await
            .expect("platform shell should run");
        let metadata = result.metadata.expect("shell metadata");

        assert!(result.content.contains("shell-ok"));
        assert_eq!(metadata["exit_code"], 0);
        assert!(metadata["shell"]
            .as_str()
            .is_some_and(|shell| !shell.is_empty()));
    }

    #[cfg(windows)]
    #[test]
    fn windows_executable_resolution_expands_pathext_names() {
        let names = executable_names("rg");
        assert!(names
            .iter()
            .any(|name| name.to_string_lossy().eq_ignore_ascii_case("rg.exe")));
    }

    fn make_guard(worker_id: &str) -> (Arc<LeaseGuard>, Arc<std::sync::Mutex<LeaseManager>>) {
        let mgr = Arc::new(std::sync::Mutex::new(LeaseManager::new()));
        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        let guard = Arc::new(LeaseGuard::new(mgr.clone(), cache, worker_id));
        (guard, mgr)
    }

    fn span(start: usize, end: usize) -> NodeSpan {
        NodeSpan {
            path: NodePath::new(vec![
                ("source_file".to_string(), 0),
                ("function_item".to_string(), start),
            ]),
            byte_range: start..end,
        }
    }

    // ── Regression: WriteTool without guard behaves exactly as before ────

    #[tokio::test]
    async fn write_tool_without_guard_behaves_as_before() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = WriteTool::new(tmp.path().to_path_buf());
        let input = json!({ "path": "out.txt", "content": "hello" });
        let res = tool.execute(input).await.unwrap();
        assert!(res.content.contains("Wrote 5 bytes"));
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("out.txt")).unwrap(),
            "hello"
        );
    }

    #[tokio::test]
    async fn edit_tool_without_guard_behaves_as_before() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("e.txt");
        std::fs::write(&file, "fn foo() { 1 }").unwrap();
        let tool = EditTool::new(tmp.path().to_path_buf());
        let input = json!({ "path": "e.txt", "edits": [
            { "old_text": "1", "new_text": "99" }
        ]});
        let res = tool.execute(input).await.unwrap();
        assert!(res.content.contains("Applied 1/1 edits"));
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "fn foo() { 99 }");
    }

    // ── WriteTool with guard: conflict into another worker's lease ────────

    #[tokio::test]
    async fn write_tool_with_guard_conflict_returns_error_and_emits_event() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        std::fs::write(&file, "fn foo() { 1 }\nfn bar() { 2 }\n").unwrap();

        let (_guard, mgr) = make_guard("w2");
        // w1 owns the whole file.
        mgr.lock().unwrap().claim("w1", file.clone(), None).unwrap();

        // Attach an event tx to the guard.
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
        // Rebuild guard with event tx.
        let mgr2 = mgr.clone();
        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        // Pre-parse the file so the guard has a baseline.
        {
            let mut c = cache.lock().unwrap();
            c.parse(&file, &std::fs::read_to_string(&file).unwrap());
        }
        let guard = Arc::new(LeaseGuard::new(mgr2, cache, "w2").with_event_tx(tx));

        let tool = WriteTool::new(tmp.path().to_path_buf()).with_lease_guard(guard);
        let input = json!({
            "path": "lib.rs",
            "content": "fn foo() { 1; extra }\nfn bar() { 2 }\n",
        });
        let res = tool.execute(input).await;
        assert!(res.is_err(), "conflicting write should error");
        let err = res.unwrap_err();
        assert!(err.message.contains("lease_conflict"));
        assert!(err.message.contains("w1"));

        // Event emitted.
        let ev = rx.try_recv().expect("lease_conflict event");
        assert_eq!(ev.event_type, "lease_conflict");
    }

    #[tokio::test]
    async fn write_tool_with_guard_no_conflict_when_editing_own_region() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        std::fs::write(&file, "fn foo() { 1 }\n").unwrap();

        let (_guard, mgr) = make_guard("w1");
        // w1 owns the whole file.
        mgr.lock().unwrap().claim("w1", file.clone(), None).unwrap();

        // Pre-parse.
        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        {
            let mut c = cache.lock().unwrap();
            c.parse(&file, &std::fs::read_to_string(&file).unwrap());
        }
        let guard = Arc::new(LeaseGuard::new(mgr, cache, "w1"));

        let tool = WriteTool::new(tmp.path().to_path_buf()).with_lease_guard(guard);
        let input = json!({ "path": "lib.rs", "content": "fn foo() { 99 }\n" });
        let res = tool.execute(input).await;
        assert!(res.is_ok(), "editing own lease should succeed: {:?}", res);
    }

    // ── EditTool with guard: conflict into another worker's lease ────────

    #[tokio::test]
    async fn edit_tool_with_guard_conflict_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        std::fs::write(&file, "fn foo() { 1 }\nfn bar() { 2 }\n").unwrap();

        let (_guard, mgr) = make_guard("w2");
        // w1 owns bytes 0..14 (the foo function).
        mgr.lock()
            .unwrap()
            .claim("w1", file.clone(), Some(span(0, 14)))
            .unwrap();

        // Pre-parse.
        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        {
            let mut c = cache.lock().unwrap();
            c.parse(&file, &std::fs::read_to_string(&file).unwrap());
        }
        let guard = Arc::new(LeaseGuard::new(mgr, cache, "w2"));

        let tool = EditTool::new(tmp.path().to_path_buf()).with_lease_guard(guard);
        // Edit the foo function (inside w1's leased region).
        let input = json!({ "path": "lib.rs", "edits": [
            { "old_text": "fn foo() { 1 }", "new_text": "fn foo() { 1; 2 }" }
        ]});
        let res = tool.execute(input).await;
        assert!(res.is_err(), "edit into another's lease should error");
        let err = res.unwrap_err();
        assert!(err.message.contains("lease_conflict"));
        assert!(err.message.contains("w1"));
    }

    // ── Two workers editing different functions: no conflict ─────────────

    #[tokio::test]
    async fn write_tool_with_guard_no_conflict_different_functions() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        std::fs::write(&file, "fn foo() { 1 }\nfn bar() { 2 }\n").unwrap();

        // w1 owns bytes 0..14 (foo), w2 owns bytes 15..30 (bar) — distinct paths.
        let (_guard_w1, mgr) = make_guard("w1");
        mgr.lock()
            .unwrap()
            .claim("w1", file.clone(), Some(span(0, 14)))
            .unwrap();

        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        {
            let mut c = cache.lock().unwrap();
            c.parse(&file, &std::fs::read_to_string(&file).unwrap());
        }
        let guard_w1 = Arc::new(LeaseGuard::new(mgr.clone(), cache.clone(), "w1"));
        // w1 edits its own region.
        let tool_w1 = WriteTool::new(tmp.path().to_path_buf()).with_lease_guard(guard_w1);
        let input = json!({ "path": "lib.rs", "content": "fn foo() { 99 }\nfn bar() { 2 }\n" });
        let res = tool_w1.execute(input).await;
        assert!(res.is_ok(), "w1 editing own region: {:?}", res);

        // w2 claims bar region (bytes 15..30) and edits it — no conflict with w1.
        mgr.lock()
            .unwrap()
            .claim("w2", file.clone(), Some(span(15, 30)))
            .unwrap();
        let guard_w2 = Arc::new(LeaseGuard::new(mgr, cache, "w2"));
        let tool_w2 = WriteTool::new(tmp.path().to_path_buf()).with_lease_guard(guard_w2);
        let input2 = json!({ "path": "lib.rs", "content": "fn foo() { 99 }\nfn bar() { 42 }\n" });
        let res2 = tool_w2.execute(input2).await;
        // Note: w2's write replaces the whole file, which includes w1's region.
        // The changed range from the reparse will cover the edit in bar only
        // (common prefix/suffix diff). So this should NOT conflict if the
        // reparse correctly localizes the change to bar's region.
        assert!(
            res2.is_ok(),
            "w2 editing bar (distinct from foo): {:?}",
            res2
        );
    }
}
