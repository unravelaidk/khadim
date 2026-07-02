use async_trait::async_trait;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub fn qwen_vla_tools() -> Vec<Arc<dyn Tool>> {
    vec![Arc::new(QwenVlaTool)]
}

struct QwenVlaTool;

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
                        "description": "Hugging Face model id. Defaults to Qwen/Qwen3.5-2B. Use Qwen/Qwen3-VL-2B-Instruct if available."
                    },
                    "steps": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "description": "Maximum observe/action iterations. Defaults to 3."
                    },
                    "dry_run": {
                        "type": "boolean",
                        "description": "If true, only report the predicted action with coordinate conversion metadata. Defaults to false so Khadim performs the action via the native computer_input tool when available, falling back to PyAutoGUI."
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
                    }
                },
                "required": ["goal"],
                "additionalProperties": false
            }),
            prompt_snippet: "- qwen_vla_action: use local Qwen VLA to inspect the screen; for observational goals ask it for a final description, and for simple visual desktop actions let Khadim execute the predicted UI action. The helper returns explicit coordinate metadata: model coordinates are in sent-image pixels and executed x/y are scaled to real screen pixels.".to_string(),
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
            .unwrap_or("Qwen/Qwen3.5-2B");
        let steps = input.get("steps").and_then(Value::as_u64).unwrap_or(3).clamp(1, 20);
        let dry_run = input.get("dry_run").and_then(Value::as_bool).unwrap_or(false);
        let screenshot_path = input
            .get("screenshot_path")
            .and_then(Value::as_str)
            .filter(|path| !path.trim().is_empty())
            .map(ToString::to_string);
        let mut auto_screenshot_path = None;
        if screenshot_path.is_none() {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default();
            let path = std::env::temp_dir().join(format!(
                "khadim-qwen-vla-screen-{}-{stamp}.png",
                std::process::id()
            ));
            let screen_tool = khadim_rpa_harness::default_tools()
                .into_iter()
                .find(|tool| tool.definition().name == "screen_capture");
            if let Some(tool) = screen_tool {
                if let Ok(result) = tool
                    .execute(json!({
                        "output_path": path,
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
                        auto_screenshot_path = result
                            .metadata
                            .as_ref()
                            .and_then(|metadata| metadata.get("path"))
                            .and_then(Value::as_str)
                            .map(ToString::to_string);
                    }
                }
            }
        }
        let screenshot_path = screenshot_path.as_deref().or(auto_screenshot_path.as_deref());
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

        let script = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("scripts/qwen_vla_controller.py")))
            .filter(|path| path.exists())
            .or_else(|| {
                let cwd_script = std::env::current_dir()
                    .ok()
                    .map(|cwd| cwd.join("scripts/qwen_vla_controller.py"));
                cwd_script.filter(|path| path.exists())
            })
            .unwrap_or_else(|| std::path::PathBuf::from("scripts/qwen_vla_controller.py"));

        let effective_steps = if screenshot_path.is_some() && !dry_run {
            1
        } else {
            steps
        };

        let mut command = Command::new("python3");
        command
            .arg(script)
            .arg("--model")
            .arg(model)
            .arg("--steps")
            .arg(effective_steps.to_string())
            .arg("--max-side")
            .arg(max_side.to_string())
            .arg("--max-new-tokens")
            .arg(max_new_tokens.to_string());
        if let Some(path) = screenshot_path {
            command.arg("--screenshot-path").arg(path);
        }
        if !dry_run {
            command.arg("--execute");
        }
        command.arg(goal);

        let output = command.output().await.map_err(|error| {
            AppError::io(format!(
                "Failed to start local Qwen VLA helper with python3: {error}. Install Python dependencies from README."
            ))
        })?;

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
                "steps": effective_steps,
                "requested_steps": steps,
                "dry_run": dry_run,
                "max_new_tokens": max_new_tokens,
                "auto_screenshot": auto_screenshot_path.is_some(),
                "screenshot_path": screenshot_path,
                "stdout": stdout,
                "stderr": stderr,
            }),
        ))
    }
}
