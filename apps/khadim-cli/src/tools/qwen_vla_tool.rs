use async_trait::async_trait;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use serde_json::{json, Value};
use std::ffi::OsString;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::TempPath;
use tokio::io::AsyncReadExt as _;
use tokio::process::Command;
use tokio::task::JoinHandle;

const QWEN_VLA_CONTROLLER: &str = include_str!("../../scripts/qwen_vla_controller.py");
const DEFAULT_HELPER_TIMEOUT_MS: u64 = 600_000;
const PYTHON_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_CLEANUP_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_HELPER_OUTPUT_BYTES: usize = 8 * 1024 * 1024;
const OUTPUT_TRUNCATION_MARKER: &[u8] = b"\n...[output truncated by Khadim]...\n";
const SCREENSHOT_PREFLIGHT_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_SCREENSHOT_BYTES: u64 = 64 * 1024 * 1024;
const DEFAULT_QWEN_VLA_MODEL: &str = "Qwen/Qwen3.5-2B";
const DEFAULT_QWEN_VLA_REVISION: &str = "15852e8c16360a2fea060d615a32b45270f8a8fc";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PinnedModel {
    model: &'static str,
    revision: &'static str,
}

const BUILTIN_QWEN_VLA_MODELS: &[PinnedModel] = &[
    PinnedModel {
        model: DEFAULT_QWEN_VLA_MODEL,
        revision: DEFAULT_QWEN_VLA_REVISION,
    },
    PinnedModel {
        model: "Qwen/Qwen3-VL-2B-Instruct",
        revision: "89644892e4d85e24eaac8bacfd4f463576704203",
    },
];

pub fn qwen_vla_tools() -> Vec<Arc<dyn Tool>> {
    vec![Arc::new(QwenVlaTool)]
}

struct QwenVlaTool;

fn is_commit_revision(revision: &str) -> bool {
    revision.len() == 40 && revision.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Resolve an approved repository to an immutable Hugging Face commit.
/// Operator additions use `repository@40-hex-commit`; accepting a mutable
/// branch or tag here would let a later repository update change code/model
/// behavior without another local approval decision.
fn approved_model_revision(model: &str, configured_models: Option<&str>) -> Option<String> {
    if let Some(builtin) = BUILTIN_QWEN_VLA_MODELS
        .iter()
        .find(|candidate| candidate.model == model)
    {
        return Some(builtin.revision.to_string());
    }

    configured_models.and_then(|models| {
        models.split(',').map(str::trim).find_map(|candidate| {
            let (candidate_model, revision) = candidate.rsplit_once('@')?;
            (candidate_model == model && is_commit_revision(revision)).then(|| revision.to_string())
        })
    })
}

fn approved_model_labels() -> String {
    BUILTIN_QWEN_VLA_MODELS
        .iter()
        .map(|candidate| format!("{}@{}", candidate.model, candidate.revision))
        .collect::<Vec<_>>()
        .join(", ")
}

fn operator_allows_qwen_execution(value: Option<&str>) -> bool {
    value.is_some_and(|value| value.trim() == "1")
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PythonInterpreter {
    program: OsString,
    prefix_arguments: Vec<OsString>,
}

fn python_interpreters(
    platform: &str,
    override_program: Option<OsString>,
) -> Vec<PythonInterpreter> {
    if let Some(program) = override_program.filter(|program| !program.is_empty()) {
        return vec![PythonInterpreter {
            program,
            prefix_arguments: Vec::new(),
        }];
    }

    if platform == "windows" {
        vec![
            PythonInterpreter {
                program: "py".into(),
                prefix_arguments: vec!["-3".into()],
            },
            PythonInterpreter {
                program: "python".into(),
                prefix_arguments: Vec::new(),
            },
            PythonInterpreter {
                program: "python3".into(),
                prefix_arguments: Vec::new(),
            },
        ]
    } else {
        vec![
            PythonInterpreter {
                program: "python3".into(),
                prefix_arguments: Vec::new(),
            },
            PythonInterpreter {
                program: "python".into(),
                prefix_arguments: Vec::new(),
            },
        ]
    }
}

fn materialize_qwen_helper() -> Result<TempPath, AppError> {
    let mut helper = tempfile::Builder::new()
        .prefix("khadim-qwen-vla-controller-")
        .suffix(".py")
        .tempfile()
        .map_err(|error| AppError::io(format!("Failed to create Qwen VLA helper: {error}")))?;
    helper
        .write_all(QWEN_VLA_CONTROLLER.as_bytes())
        .and_then(|_| helper.flush())
        .map_err(|error| AppError::io(format!("Failed to write Qwen VLA helper: {error}")))?;
    Ok(helper.into_temp_path())
}

fn materialize_qwen_request(goal: &str) -> Result<TempPath, AppError> {
    let mut request = tempfile::Builder::new()
        .prefix("khadim-qwen-vla-request-")
        .suffix(".json")
        .tempfile()
        .map_err(|error| AppError::io(format!("Failed to create Qwen VLA request: {error}")))?;
    serde_json::to_writer(&mut request, &json!({ "goal": goal }))
        .map_err(|error| AppError::io(format!("Failed to serialize Qwen VLA request: {error}")))?;
    request
        .flush()
        .map_err(|error| AppError::io(format!("Failed to write Qwen VLA request: {error}")))?;
    Ok(request.into_temp_path())
}

struct HelperArguments<'a> {
    model: &'a str,
    revision: &'a str,
    steps: u64,
    max_side: u64,
    max_new_tokens: u64,
    screenshot_path: Option<&'a Path>,
    execute: bool,
    request_path: &'a Path,
}

fn helper_arguments(options: HelperArguments<'_>) -> Vec<OsString> {
    let mut arguments = vec![
        "--model".into(),
        options.model.into(),
        "--revision".into(),
        options.revision.into(),
        "--steps".into(),
        options.steps.to_string().into(),
        "--max-side".into(),
        options.max_side.to_string().into(),
        "--max-new-tokens".into(),
        options.max_new_tokens.to_string().into(),
    ];
    if let Some(path) = options.screenshot_path {
        arguments.push("--screenshot-path".into());
        arguments.push(path.as_os_str().to_owned());
    }
    if options.execute {
        arguments.push("--execute".into());
    }
    arguments.push("--request-file".into());
    arguments.push(options.request_path.as_os_str().to_owned());
    arguments
}

async fn validate_screenshot_path(path: &Path) -> Result<(), AppError> {
    let check = async {
        let metadata = tokio::fs::metadata(path)
            .await
            .map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            return Err("the path is not a regular file".to_string());
        }
        if metadata.len() == 0 {
            return Err("the file is empty".to_string());
        }
        if metadata.len() > MAX_SCREENSHOT_BYTES {
            return Err(format!(
                "the file is larger than the {} MiB safety limit",
                MAX_SCREENSHOT_BYTES / (1024 * 1024)
            ));
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if !matches!(extension.as_deref(), Some("png" | "jpg" | "jpeg")) {
            return Err("the file extension is not PNG or JPEG".to_string());
        }

        // Only regular files reach this open. Keep the whole metadata/open/read
        // sequence under a deadline so remote filesystems and a concurrent
        // file-type swap cannot stall the agent outside the helper timeout.
        let mut file = tokio::fs::File::open(path)
            .await
            .map_err(|error| error.to_string())?;
        let mut header = [0_u8; 8];
        file.read_exact(&mut header)
            .await
            .map_err(|error| error.to_string())?;
        let valid_magic = match extension.as_deref() {
            Some("png") => header == *b"\x89PNG\r\n\x1a\n",
            Some("jpg" | "jpeg") => header.starts_with(&[0xff, 0xd8, 0xff]),
            _ => false,
        };
        if !valid_magic {
            return Err("the contents do not match the PNG/JPEG extension".to_string());
        }
        Ok::<(), String>(())
    };

    match tokio::time::timeout(SCREENSHOT_PREFLIGHT_TIMEOUT, check).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(detail)) => Err(AppError::invalid_input(format!(
            "qwen_vla_action screenshot_path is not a readable file containing a regular PNG/JPEG image: {} ({detail})",
            path.display()
        ))),
        Err(_) => Err(AppError::invalid_input(format!(
            "qwen_vla_action screenshot_path validation timed out after {}ms: {}",
            SCREENSHOT_PREFLIGHT_TIMEOUT.as_millis(),
            path.display()
        ))),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum PythonProbe {
    Available,
    Unavailable(String),
}

async fn select_python3<F, Fut>(
    candidates: Vec<PythonInterpreter>,
    mut probe: F,
) -> Result<(Option<PythonInterpreter>, Vec<String>), AppError>
where
    F: FnMut(PythonInterpreter) -> Fut,
    Fut: std::future::Future<Output = Result<PythonProbe, AppError>>,
{
    let mut rejected = Vec::new();
    for interpreter in candidates {
        match probe(interpreter.clone()).await? {
            PythonProbe::Available => return Ok((Some(interpreter), rejected)),
            PythonProbe::Unavailable(reason) => rejected.push(reason),
        }
    }
    Ok((None, rejected))
}

fn configure_process_group(command: &mut Command) {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.as_std_mut().process_group(0);
    }
    #[cfg(windows)]
    crate::infrastructure::windows_job::configure_suspended(command);
}

fn cleanup_process_tree_on_drop(pid: u32) {
    #[cfg(unix)]
    unsafe {
        // Each helper/probe is the leader of its own process group.
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        // Keep the leader alive until this guard runs so taskkill can still
        // discover and terminate its descendants.
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
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
            registered: khadim_coding_agent::process_tree::register(pid),
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
        khadim_coding_agent::process_tree::unregister(self.pid, self.registered);
        self.registered = false;
        self.pid = None;
    }
}

impl Drop for ProcessTreeDropGuard {
    fn drop(&mut self) {
        if let Some(pid) = self.pid.take() {
            (self.cleanup)(pid);
            khadim_coding_agent::process_tree::unregister(Some(pid), self.registered);
            self.registered = false;
        }
    }
}

async fn terminate_process_tree(child: &mut tokio::process::Child, pid: Option<u32>) {
    #[cfg(unix)]
    if let Some(pid) = pid {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    if let Some(pid) = pid {
        let mut taskkill = Command::new("taskkill");
        taskkill
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let _ = tokio::time::timeout(PROCESS_CLEANUP_TIMEOUT, taskkill.status()).await;
    }
    #[cfg(not(any(unix, windows)))]
    let _ = pid;

    let _ = tokio::time::timeout(PROCESS_CLEANUP_TIMEOUT, child.kill()).await;
    let _ = tokio::time::timeout(PROCESS_CLEANUP_TIMEOUT, child.wait()).await;
}

async fn read_pipe_bounded<R>(mut pipe: R, max_bytes: usize) -> std::io::Result<Vec<u8>>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut bytes = Vec::with_capacity(max_bytes.min(64 * 1024));
    let mut buffer = [0_u8; 16 * 1024];
    let mut truncated = false;
    loop {
        let read = pipe.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let remaining = max_bytes.saturating_sub(bytes.len());
        let retained = remaining.min(read);
        bytes.extend_from_slice(&buffer[..retained]);
        truncated |= retained < read;
        // Keep draining after reaching the cap. Closing the pipe early could
        // make Python fail with BrokenPipeError or leave the child blocked.
    }
    if truncated {
        bytes.extend_from_slice(OUTPUT_TRUNCATION_MARKER);
    }
    Ok(bytes)
}

async fn collect_readers(
    stdout: &mut JoinHandle<std::io::Result<Vec<u8>>>,
    stderr: &mut JoinHandle<std::io::Result<Vec<u8>>>,
) -> std::io::Result<(Vec<u8>, Vec<u8>)> {
    let (stdout, stderr) = tokio::join!(&mut *stdout, &mut *stderr);
    let stdout = stdout.map_err(|error| std::io::Error::other(error.to_string()))??;
    let stderr = stderr.map_err(|error| std::io::Error::other(error.to_string()))??;
    Ok((stdout, stderr))
}

/// Run a bounded child while retaining ownership of the leader until its
/// process tree has been terminated on timeout or cancellation.
async fn run_process_output(
    mut command: Command,
    timeout: Duration,
) -> std::io::Result<Option<Output>> {
    configure_process_group(&mut command);
    let mut child = command.spawn()?;
    let pid = child.id();
    let mut cleanup_guard = ProcessTreeDropGuard::new(pid);
    #[cfg(windows)]
    let process_job =
        match crate::infrastructure::windows_job::KillOnDropJob::assign_suspended_and_resume(&child)
        {
            Ok(job) => job,
            Err(error) => {
                if let Some(pid) = pid {
                    cleanup_process_tree_on_drop(pid);
                }
                let _ = child.start_kill();
                return Err(std::io::Error::other(format!(
                    "failed to place helper in a kill-on-close Windows Job Object: {error}"
                )));
            }
        };
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| std::io::Error::other("child stdout was not piped"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| std::io::Error::other("child stderr was not piped"))?;
    let mut stdout_task = tokio::spawn(read_pipe_bounded(stdout, MAX_HELPER_OUTPUT_BYTES));
    let mut stderr_task = tokio::spawn(read_pipe_bounded(stderr, MAX_HELPER_OUTPUT_BYTES));
    let deadline = Instant::now() + timeout;

    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(status) => status?,
        Err(_) => {
            #[cfg(windows)]
            let _ = process_job.terminate();
            terminate_process_tree(&mut child, pid).await;
            stdout_task.abort();
            stderr_task.abort();
            cleanup_guard.disarm();
            return Ok(None);
        }
    };

    let remaining = deadline.saturating_duration_since(Instant::now());
    let (stdout, stderr) = match tokio::time::timeout(
        remaining,
        collect_readers(&mut stdout_task, &mut stderr_task),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => {
            // Descendants can retain inherited output pipes after the helper
            // leader exits. Treat that as a timeout and tear down the group.
            #[cfg(windows)]
            let _ = process_job.terminate();
            terminate_process_tree(&mut child, pid).await;
            stdout_task.abort();
            stderr_task.abort();
            cleanup_guard.disarm();
            return Ok(None);
        }
    };
    cleanup_guard.disarm();
    Ok(Some(Output {
        status,
        stdout,
        stderr,
    }))
}

async fn probe_python3(interpreter: PythonInterpreter) -> Result<PythonProbe, AppError> {
    let display_name = interpreter.program.to_string_lossy().into_owned();
    let mut command = Command::new(&interpreter.program);
    command.args(&interpreter.prefix_arguments).args([
        "-c",
        "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)",
    ]);
    match run_process_output(command, PYTHON_PROBE_TIMEOUT).await {
        Ok(Some(output)) if output.status.success() => Ok(PythonProbe::Available),
        Ok(Some(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let detail = if stderr.is_empty() {
                format!(
                    "{display_name}: Python 3 probe exited with {}",
                    output.status
                )
            } else {
                format!("{display_name}: {stderr}")
            };
            Ok(PythonProbe::Unavailable(detail))
        }
        Ok(None) => Ok(PythonProbe::Unavailable(format!(
            "{display_name}: Python 3 probe timed out"
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(PythonProbe::Unavailable(
            format!("{display_name}: executable not found"),
        )),
        Err(error) => Err(AppError::io(format!(
            "Failed to probe Python interpreter {display_name}: {error}"
        ))),
    }
}

async fn run_qwen_helper(
    helper_path: &Path,
    arguments: &[OsString],
    timeout: Duration,
) -> Result<std::process::Output, AppError> {
    let override_program = std::env::var_os("KHADIM_PYTHON").filter(|value| !value.is_empty());
    let candidates = python_interpreters(std::env::consts::OS, override_program.clone());
    let (interpreter, rejected) =
        select_python3(candidates, |candidate| probe_python3(candidate)).await?;

    let override_hint = if override_program.is_some() {
        " Check that KHADIM_PYTHON points to an executable Python 3 interpreter."
    } else {
        " Install Python 3 or set KHADIM_PYTHON to its executable path."
    };
    let Some(interpreter) = interpreter else {
        return Err(AppError::not_found(format!(
            "No usable Python 3 interpreter was found ({}).{override_hint}",
            rejected.join("; ")
        )));
    };

    // Once a candidate has proven it is Python 3, any helper failure belongs
    // to the helper/model environment and must not be hidden by trying a
    // different interpreter.
    let display_name = interpreter.program.to_string_lossy().into_owned();
    let mut command = Command::new(&interpreter.program);
    command
        .args(&interpreter.prefix_arguments)
        .arg(helper_path)
        .args(arguments);
    match run_process_output(command, timeout).await {
        Ok(Some(output)) => Ok(output),
        Ok(None) => Err(AppError::process_kill(format!(
            "qwen_vla_action timed out after {}ms while using {display_name}; its process tree was terminated",
            timeout.as_millis()
        ))),
        Err(error) => Err(AppError::io(format!(
            "Failed to start local Qwen VLA helper with {display_name}: {error}"
        ))),
    }
}

#[async_trait]
impl Tool for QwenVlaTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "qwen_vla_action".to_string(),
            description: "Ask a local Hugging Face Qwen vision-language model to inspect a desktop screenshot. It can either return a useful final visual description for observational goals or perform a small Khadim computer-use action for UI-control goals.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "The concrete desktop UI goal or observational question. Examples: 'describe what is on the screen', 'click the wifi icon'."
                    },
                    "model": {
                        "type": "string",
                        "description": "Operator-approved Hugging Face model id. Defaults to a pinned Qwen/Qwen3.5-2B commit. Custom repositories must be allowlisted as repository@40-hex-commit through KHADIM_QWEN_VLA_ALLOWED_MODELS."
                    },
                    "steps": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "description": "Maximum observe/action iterations. Defaults to 3."
                    },
                    "dry_run": {
                        "type": "boolean",
                        "default": true,
                        "description": "If true, only report the predicted action with coordinate conversion metadata. Defaults to true. Setting false also requires the operator to start Khadim with KHADIM_QWEN_VLA_ALLOW_EXECUTION=1."
                    },
                    "screenshot_path": {
                        "type": "string",
                        "description": "Optional existing PNG/JPEG screenshot to inspect instead of capturing the desktop inside the Python helper. Useful when the Rust screen_capture tool works but PyAutoGUI/mss cannot capture this Wayland/X11 session."
                    },
                    "max_side": {
                        "type": "integer",
                        "minimum": 256,
                        "maximum": 4096,
                        "description": "Resize screenshots so the longest side is at most this many pixels. Defaults to 1280."
                    },
                    "max_new_tokens": {
                        "type": "integer",
                        "minimum": 32,
                        "maximum": 2048,
                        "description": "Maximum model output tokens. Defaults to 512 so visual descriptions are not truncated."
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "minimum": 1000,
                        "maximum": 3600000,
                        "description": "Maximum helper runtime in milliseconds. Defaults to 600000 (10 minutes)."
                    }
                },
                "required": ["goal"],
                "additionalProperties": false
            }),
            prompt_snippet: "- qwen_vla_action: use a pinned local Qwen VLA revision to inspect the screen. It is observation-only by default; direct UI actions require an explicit operator execution gate. The helper returns coordinate metadata: model coordinates are in sent-image pixels and executed x/y are scaled to real screen pixels.".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let goal = input
            .get("goal")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::invalid_input("qwen_vla_action requires goal"))?;
        let model = input
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_QWEN_VLA_MODEL);
        let configured_models = std::env::var("KHADIM_QWEN_VLA_ALLOWED_MODELS").ok();
        let revision = approved_model_revision(model, configured_models.as_deref()).ok_or_else(|| {
            AppError::invalid_input(format!(
                "Qwen VLA model '{model}' is not approved at an immutable commit. Use one of: {}, or add repository@40-hex-commit to KHADIM_QWEN_VLA_ALLOWED_MODELS before starting Khadim.",
                approved_model_labels()
            ))
        })?;
        let steps = input
            .get("steps")
            .and_then(Value::as_u64)
            .unwrap_or(3)
            .clamp(1, 20);
        let dry_run = input
            .get("dry_run")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let execution_approval = std::env::var("KHADIM_QWEN_VLA_ALLOW_EXECUTION").ok();
        if !dry_run && !operator_allows_qwen_execution(execution_approval.as_deref()) {
            return Err(AppError::invalid_input(
                "qwen_vla_action is observation-only unless the operator starts Khadim with KHADIM_QWEN_VLA_ALLOW_EXECUTION=1; keep dry_run=true or restart with that explicit execution gate",
            ));
        }
        let provided_screenshot = input
            .get("screenshot_path")
            .and_then(Value::as_str)
            .filter(|path| !path.trim().is_empty())
            .map(PathBuf::from);
        let mut auto_screenshot = None;
        if provided_screenshot.is_none() {
            let temporary_screenshot = tempfile::Builder::new()
                .prefix("khadim-qwen-vla-screen-")
                .suffix(".png")
                .tempfile()
                .map_err(|error| {
                    AppError::io(format!("Failed to reserve a temporary screenshot: {error}"))
                })?
                .into_temp_path();
            let screen_tool = khadim_rpa_harness::default_tools()
                .into_iter()
                .find(|tool| tool.definition().name == "screen_capture");
            if let Some(tool) = screen_tool {
                let output_path = temporary_screenshot.to_string_lossy().into_owned();
                if let Ok(result) = tool
                    .execute(json!({
                        "output_path": output_path,
                        "backend": "xcap"
                    }))
                    .await
                {
                    if result
                        .metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("available"))
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                    {
                        auto_screenshot = Some(temporary_screenshot);
                    }
                }
            }
        }
        let screenshot_path = provided_screenshot
            .as_deref()
            .or_else(|| auto_screenshot.as_deref());
        if let Some(path) = screenshot_path {
            validate_screenshot_path(path).await?;
        }
        let max_side = input
            .get("max_side")
            .and_then(Value::as_u64)
            .unwrap_or(1280)
            .clamp(256, 4096);
        let max_new_tokens = input
            .get("max_new_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(512)
            .clamp(32, 2048);
        let timeout_ms = input
            .get("timeout_ms")
            .and_then(Value::as_u64)
            .unwrap_or(DEFAULT_HELPER_TIMEOUT_MS)
            .clamp(1_000, 3_600_000);

        let effective_steps = if screenshot_path.is_some() && !dry_run {
            1
        } else {
            steps
        };
        let helper = materialize_qwen_helper()?;
        // Keep arbitrarily long and Unicode-rich goals out of the Windows
        // command line. The temporary request is owned through helper exit.
        let request = materialize_qwen_request(goal)?;
        let arguments = helper_arguments(HelperArguments {
            model,
            revision: &revision,
            steps: effective_steps,
            max_side,
            max_new_tokens,
            screenshot_path,
            execute: !dry_run,
            request_path: request.as_ref(),
        });
        let output = run_qwen_helper(
            helper.as_ref(),
            &arguments,
            Duration::from_millis(timeout_ms),
        )
        .await?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !output.status.success() {
            return Err(AppError::io(format!(
                "qwen_vla_action failed with status {}. stdout: {} stderr: {}",
                output.status, stdout, stderr
            )));
        }

        Ok(ToolResult::with_metadata(
            if stdout.is_empty() {
                "qwen_vla_action completed".to_string()
            } else {
                stdout.clone()
            },
            json!({
                "tool": "qwen_vla_action",
                "goal": goal,
                "model": model,
                "model_revision": revision,
                "steps": effective_steps,
                "requested_steps": steps,
                "dry_run": dry_run,
                "max_new_tokens": max_new_tokens,
                "timeout_ms": timeout_ms,
                "auto_screenshot": auto_screenshot.is_some(),
                "screenshot_path": screenshot_path.map(|path| path.to_string_lossy().into_owned()),
                "stdout": stdout,
                "stderr": stderr,
            }),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;

    #[test]
    fn python_candidates_cover_windows_and_unix_without_shell_parsing() {
        assert_eq!(
            python_interpreters("windows", None),
            vec![
                PythonInterpreter {
                    program: "py".into(),
                    prefix_arguments: vec!["-3".into()],
                },
                PythonInterpreter {
                    program: "python".into(),
                    prefix_arguments: Vec::new(),
                },
                PythonInterpreter {
                    program: "python3".into(),
                    prefix_arguments: Vec::new(),
                },
            ]
        );
        assert_eq!(
            python_interpreters("linux", None),
            vec![
                PythonInterpreter {
                    program: "python3".into(),
                    prefix_arguments: Vec::new(),
                },
                PythonInterpreter {
                    program: "python".into(),
                    prefix_arguments: Vec::new(),
                },
            ]
        );

        let override_program = OsString::from("C:\\Program Files\\Python\\python.exe");
        assert_eq!(
            python_interpreters("windows", Some(override_program.clone())),
            vec![PythonInterpreter {
                program: override_program,
                prefix_arguments: Vec::new(),
            }]
        );
    }

    #[test]
    fn embedded_helper_is_materialized_for_packaged_native_binaries() {
        let helper = materialize_qwen_helper().expect("materialize embedded helper");
        let contents = std::fs::read_to_string(&helper).expect("read materialized helper");

        assert_eq!(contents, QWEN_VLA_CONTROLLER);
        assert_eq!(
            helper.extension().and_then(|value| value.to_str()),
            Some("py")
        );
        assert!(contents.contains("def main"));
        assert!(contents.contains("trust_remote_code=False"));
        assert!(!contents.contains("trust_remote_code=True"));
        assert!(contents.contains("use_safetensors=True"));
        assert!(contents.contains("tempfile.NamedTemporaryFile"));
        assert!(contents.contains("--request-file"));
        assert!(contents.contains("import pyautogui"));
        assert!(!contents.contains("KHADIM_CLI"));
        assert!(!contents.contains("\"computer_input\""));
    }

    #[test]
    fn remote_model_repositories_require_immutable_operator_allowlisting() {
        for model in BUILTIN_QWEN_VLA_MODELS {
            assert_eq!(
                approved_model_revision(model.model, None).as_deref(),
                Some(model.revision)
            );
        }
        assert_eq!(approved_model_revision("attacker/remote-code", None), None);
        let revision = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            approved_model_revision(
                "team/reviewed-model",
                Some(&format!(
                    " another/model@{revision}, team/reviewed-model@{revision} "
                ))
            )
            .as_deref(),
            Some(revision)
        );
        assert_eq!(
            approved_model_revision("team/reviewed-model", Some("team/reviewed-model@main")),
            None
        );
        assert_eq!(
            approved_model_revision(
                "team/reviewed-model-extra",
                Some(&format!("team/reviewed-model@{revision}"))
            ),
            None
        );
    }

    #[tokio::test]
    async fn unapproved_remote_model_fails_before_python_or_ui_access() {
        let error = QwenVlaTool
            .execute(json!({
                "goal": "describe the screen",
                "model": "attacker/remote-code",
            }))
            .await
            .expect_err("unapproved model must fail locally");

        assert!(error
            .message
            .contains("not approved at an immutable commit"));
    }

    #[test]
    fn qwen_ui_execution_requires_the_explicit_operator_gate() {
        assert!(!operator_allows_qwen_execution(None));
        assert!(!operator_allows_qwen_execution(Some("true")));
        assert!(!operator_allows_qwen_execution(Some("0")));
        assert!(operator_allows_qwen_execution(Some(" 1 ")));

        let definition = QwenVlaTool.definition();
        assert_eq!(
            definition.parameters["properties"]["dry_run"]["default"],
            Value::Bool(true)
        );
    }

    #[test]
    fn helper_arguments_preserve_unicode_paths_and_keep_goal_off_command_line() {
        let screenshot = Path::new("C:\\Users\\Example User\\skærm billede.png");
        let request_path = Path::new("C:\\Users\\Example User\\lang forespørgsel.json");
        let arguments = helper_arguments(HelperArguments {
            model: "Qwen/example",
            revision: "0123456789abcdef0123456789abcdef01234567",
            steps: 2,
            max_side: 1024,
            max_new_tokens: 256,
            screenshot_path: Some(screenshot),
            execute: true,
            request_path,
        });

        assert_eq!(
            arguments,
            vec![
                "--model".into(),
                "Qwen/example".into(),
                "--revision".into(),
                "0123456789abcdef0123456789abcdef01234567".into(),
                "--steps".into(),
                "2".into(),
                "--max-side".into(),
                "1024".into(),
                "--max-new-tokens".into(),
                "256".into(),
                "--screenshot-path".into(),
                screenshot.as_os_str().to_owned(),
                "--execute".into(),
                "--request-file".into(),
                request_path.as_os_str().to_owned(),
            ]
        );
    }

    #[test]
    fn long_unicode_goal_is_owned_by_temporary_json_request() {
        let goal = format!("klik på café-knappen 🌍 {}", "x".repeat(40_000));
        let request = materialize_qwen_request(&goal).expect("materialize request");
        let value: Value =
            serde_json::from_slice(&std::fs::read(&request).expect("read temporary request"))
                .expect("parse request JSON");

        assert_eq!(
            value.get("goal").and_then(Value::as_str),
            Some(goal.as_str())
        );
        let arguments = helper_arguments(HelperArguments {
            model: DEFAULT_QWEN_VLA_MODEL,
            revision: DEFAULT_QWEN_VLA_REVISION,
            steps: 1,
            max_side: 1280,
            max_new_tokens: 512,
            screenshot_path: None,
            execute: false,
            request_path: request.as_ref(),
        });
        assert!(!arguments.iter().any(|argument| argument == goal.as_str()));
        assert!(arguments
            .iter()
            .any(|argument| argument == "--request-file"));
    }

    #[tokio::test]
    async fn unavailable_windows_launcher_falls_through_to_next_python3() {
        let candidates = python_interpreters("windows", None);
        let calls = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&calls);
        let (selected, rejected) = select_python3(candidates, move |candidate| {
            let observed = Arc::clone(&observed);
            async move {
                observed
                    .lock()
                    .expect("probe call lock")
                    .push(candidate.program.clone());
                if candidate.program == "py" {
                    Ok(PythonProbe::Unavailable(
                        "py: no installed Python 3 runtime".to_string(),
                    ))
                } else {
                    Ok(PythonProbe::Available)
                }
            }
        })
        .await
        .expect("select fallback interpreter");

        assert_eq!(
            selected,
            Some(PythonInterpreter {
                program: "python".into(),
                prefix_arguments: Vec::new(),
            })
        );
        assert_eq!(rejected, vec!["py: no installed Python 3 runtime"]);
        assert_eq!(
            *calls.lock().expect("probe call lock"),
            vec![OsString::from("py"), OsString::from("python")]
        );
    }

    #[tokio::test]
    async fn pipe_collection_caps_retained_bytes_but_drains_to_eof() {
        use tokio::io::AsyncWriteExt as _;

        let payload = b"0123456789abcdefghijklmnopqrstuvwxyz".to_vec();
        let (mut writer, reader) = tokio::io::duplex(8);
        let (retained, written) = tokio::time::timeout(Duration::from_secs(1), async move {
            tokio::join!(read_pipe_bounded(reader, 10), async move {
                writer.write_all(&payload).await?;
                writer.shutdown().await
            })
        })
        .await
        .expect("bounded reader must keep draining after reaching its cap");
        written.expect("write complete payload");
        let retained = retained.expect("read bounded output");
        let payload = b"0123456789abcdefghijklmnopqrstuvwxyz";
        let mut expected = payload[..10].to_vec();
        expected.extend_from_slice(OUTPUT_TRUNCATION_MARKER);
        assert_eq!(retained, expected);

        let exact = read_pipe_bounded(&payload[..10], 10)
            .await
            .expect("read exact bounded output");
        assert_eq!(exact, payload[..10]);
    }

    #[test]
    fn dropping_process_guard_requests_tree_cleanup_once() {
        static CLEANED_PID: AtomicU32 = AtomicU32::new(0);
        fn record_cleanup(pid: u32) {
            CLEANED_PID.store(pid, Ordering::SeqCst);
        }

        CLEANED_PID.store(0, Ordering::SeqCst);
        {
            let _guard = ProcessTreeDropGuard::with_cleanup(Some(4242), record_cleanup);
        }
        assert_eq!(CLEANED_PID.load(Ordering::SeqCst), 4242);

        CLEANED_PID.store(0, Ordering::SeqCst);
        {
            let mut guard = ProcessTreeDropGuard::with_cleanup(Some(4242), record_cleanup);
            guard.disarm();
        }
        assert_eq!(CLEANED_PID.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn missing_provided_screenshot_fails_before_python_or_ui_access() {
        let temp = tempfile::tempdir().expect("temporary workspace");
        let missing = temp.path().join("missing screenshot.png");

        let error = QwenVlaTool
            .execute(json!({
                "goal": "describe the screen",
                "screenshot_path": missing,
            }))
            .await
            .expect_err("missing screenshot must fail locally");

        assert!(error
            .message
            .contains("screenshot_path is not a readable file"));
    }

    #[tokio::test]
    async fn screenshot_preflight_accepts_only_bounded_regular_png_or_jpeg_files() {
        let temp = tempfile::tempdir().expect("temporary workspace");
        let png = temp.path().join("screen.png");
        std::fs::write(&png, b"\x89PNG\r\n\x1a\nfixture")
            .expect("write minimal PNG-signature fixture");
        validate_screenshot_path(&png)
            .await
            .expect("regular PNG signature should pass preflight");

        let disguised = temp.path().join("not-an-image.jpg");
        std::fs::write(&disguised, b"not really an image").expect("write invalid image fixture");
        let error = validate_screenshot_path(&disguised)
            .await
            .expect_err("extension alone must not pass image validation");
        assert!(error.message.contains("contents do not match"));

        let directory = temp.path().join("directory.png");
        std::fs::create_dir(&directory).expect("create directory fixture");
        let error = validate_screenshot_path(&directory)
            .await
            .expect_err("directory must not be opened as a screenshot");
        assert!(error.message.contains("not a regular file"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn screenshot_preflight_rejects_a_fifo_without_opening_or_blocking() {
        use std::os::unix::ffi::OsStrExt as _;

        let temp = tempfile::tempdir().expect("temporary workspace");
        let fifo = temp.path().join("hostile.png");
        let fifo_path =
            std::ffi::CString::new(fifo.as_os_str().as_bytes()).expect("FIFO path without NUL");
        let result = unsafe { libc::mkfifo(fifo_path.as_ptr(), 0o600) };
        assert_eq!(result, 0, "create FIFO fixture");

        let error = tokio::time::timeout(Duration::from_secs(1), validate_screenshot_path(&fifo))
            .await
            .expect("FIFO preflight must be bounded")
            .expect_err("FIFO must not be accepted as a screenshot");
        assert!(error.message.contains("not a regular file"));
    }
}
