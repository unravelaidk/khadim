//! RPA and computer-use harness tools for Khadim.
//!
//! This crate owns desktop automation capabilities separately from the coding
//! agent. Platform integrations such as screen capture, input simulation, OCR,
//! and audio can be added behind feature flags without changing the agent loop.

use async_trait::async_trait;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn default_tools() -> Vec<Arc<dyn Tool>> {
    let mut tools: Vec<Arc<dyn Tool>> = vec![
        Arc::new(RpaCapabilitiesTool),
        Arc::new(ScreenCaptureTool),
        Arc::new(ComputerInputTool),
        Arc::new(AudioListenTool),
    ];
    #[cfg(feature = "rustautogui-backend")]
    tools.push(Arc::new(VisualFindTool));
    tools
}

struct RpaCapabilitiesTool;

#[async_trait]
impl Tool for RpaCapabilitiesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "rpa_capabilities".to_string(),
            description: "Report the RPA/computer-use capabilities available in this Khadim runtime."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
            prompt_snippet: "- rpa_capabilities: inspect which RPA, screen, input, and audio tools are available in this runtime.".to_string(),
        }
    }

    async fn execute(&self, _input: Value) -> Result<ToolResult, AppError> {
        Ok(ToolResult::with_metadata(
            "RPA harness loaded. Screen capture, input control, and audio listening are registered as tool boundaries; platform implementations are not enabled in this build.",
            json!({
                "harness": "rpa",
                "capabilities": {
                    "screen_capture": cfg!(feature = "screen"),
                    "computer_input": cfg!(feature = "input"),
                    "rustautogui_backend": cfg!(feature = "rustautogui-backend"),
                    "visual_template_match": cfg!(feature = "rustautogui-backend"),
                    "opencl_template_match": cfg!(feature = "rustautogui-opencl"),
                    "audio_listen": false,
                    "ocr": false,
                    "browser_automation": false
                },
                "registered_tool_boundaries": ["screen_capture", "computer_input", "visual_find", "audio_listen"],
                "next_implementation_features": ["screen", "input", "rustautogui-backend", "rustautogui-opencl", "audio"]
            }),
        ))
    }
}

struct ScreenCaptureTool;

#[async_trait]
impl Tool for ScreenCaptureTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "screen_capture".to_string(),
            description: "Capture the current desktop screen for visual RPA automation.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "display": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "Display index to capture. Defaults to the primary display."
                    },
                    "x": {
                        "type": "integer",
                        "description": "Optional region x coordinate relative to the selected display."
                    },
                    "y": {
                        "type": "integer",
                        "description": "Optional region y coordinate relative to the selected display."
                    },
                    "width": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional region width in pixels."
                    },
                    "height": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional region height in pixels."
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional PNG output path. Defaults to a file in the system temp directory."
                    },
                    "backend": {
                        "type": "string",
                        "enum": ["xcap", "rustautogui"],
                        "description": "Capture backend. Defaults to xcap; rustautogui is useful for X11 testing."
                    }
                },
                "additionalProperties": false
            }),
            prompt_snippet: "- screen_capture: capture the desktop or a screen region to a PNG file and return the file path.".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        capture_screen(input)
    }
}

struct ComputerInputTool;

#[async_trait]
impl Tool for ComputerInputTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "computer_input".to_string(),
            description: "Control mouse and keyboard for desktop RPA automation.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["click", "move", "type", "key", "scroll"],
                        "description": "Input action to perform."
                    },
                    "x": { "type": "integer", "description": "Screen x coordinate for pointer actions." },
                    "y": { "type": "integer", "description": "Screen y coordinate for pointer actions." },
                    "text": { "type": "string", "description": "Text to type for the type action." },
                    "key": { "type": "string", "description": "Key or shortcut to press for the key action." },
                    "button": {
                        "type": "string",
                        "enum": ["left", "right", "middle"],
                        "description": "Mouse button for click actions. Defaults to left."
                    },
                    "clicks": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10,
                        "description": "Number of clicks for click actions. Defaults to 1."
                    },
                    "relative": {
                        "type": "boolean",
                        "description": "Whether move coordinates are relative to the current pointer location."
                    },
                    "amount": {
                        "type": "integer",
                        "description": "Scroll amount for scroll actions."
                    },
                    "axis": {
                        "type": "string",
                        "enum": ["vertical", "horizontal"],
                        "description": "Scroll axis. Defaults to vertical."
                    },
                    "moving_time": {
                        "type": "number",
                        "minimum": 0.0,
                        "description": "Seconds to spend moving the mouse when the backend supports animated movement. Defaults to 0.1."
                    },
                    "backend": {
                        "type": "string",
                        "enum": ["enigo", "rustautogui"],
                        "description": "Input backend. Defaults to enigo; rustautogui is useful for X11 testing."
                    }
                },
                "required": ["action"],
                "additionalProperties": false
            }),
            prompt_snippet: "- computer_input: move/click the mouse, type text, press keys, or scroll the active desktop.".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        control_computer(input)
    }
}

#[cfg(feature = "rustautogui-backend")]
struct VisualFindTool;

#[cfg(feature = "rustautogui-backend")]
#[async_trait]
impl Tool for VisualFindTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "visual_find".to_string(),
            description:
                "Find a template image on the current screen using RustAutoGUI template matching."
                    .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "template_path": {
                        "type": "string",
                        "description": "Path to a PNG/JPEG template image to search for."
                    },
                    "precision": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                        "description": "Correlation threshold. Defaults to 0.9."
                    },
                    "match_mode": {
                        "type": "string",
                        "enum": ["segmented", "fft", "segmented_opencl", "segmented_opencl_v2"],
                        "description": "Template matching mode. Defaults to segmented."
                    },
                    "x": { "type": "integer", "minimum": 0, "description": "Optional search region x coordinate." },
                    "y": { "type": "integer", "minimum": 0, "description": "Optional search region y coordinate." },
                    "width": { "type": "integer", "minimum": 1, "description": "Optional search region width." },
                    "height": { "type": "integer", "minimum": 1, "description": "Optional search region height." },
                    "move_mouse": {
                        "type": "boolean",
                        "description": "Move the pointer to the best match when a match is found."
                    },
                    "moving_time": {
                        "type": "number",
                        "minimum": 0.0,
                        "description": "Seconds to spend moving the mouse. Defaults to 0.1."
                    }
                },
                "required": ["template_path"],
                "additionalProperties": false
            }),
            prompt_snippet: "- visual_find: find a template image on screen using RustAutoGUI and optionally move the pointer to the best match.".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        visual_find(input)
    }
}

struct AudioListenTool;

#[async_trait]
impl Tool for AudioListenTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "audio_listen".to_string(),
            description: "Listen to system or microphone audio for assistant-style computer-use tasks."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "enum": ["microphone", "system"],
                        "description": "Audio source to listen to."
                    },
                    "duration_ms": {
                        "type": "integer",
                        "minimum": 100,
                        "maximum": 60000,
                        "description": "Capture duration in milliseconds."
                    }
                },
                "required": ["source"],
                "additionalProperties": false
            }),
            prompt_snippet: "- audio_listen: capture audio when the assistant runtime is built with audio support.".to_string(),
        }
    }

    async fn execute(&self, _input: Value) -> Result<ToolResult, AppError> {
        Ok(unavailable_tool(
            "audio_listen",
            "Build khadim-rpa-harness with the `audio` feature and an audio capture/transcription backend.",
        ))
    }
}

fn unavailable_tool(tool: &str, guidance: &str) -> ToolResult {
    ToolResult::with_metadata(
        format!("{tool} is registered, but its platform implementation is not enabled. {guidance}"),
        json!({
            "tool": tool,
            "available": false,
            "guidance": guidance
        }),
    )
}

#[cfg(feature = "rustautogui-backend")]
fn new_rustautogui() -> Result<rustautogui::RustAutoGui, AppError> {
    rustautogui::RustAutoGui::new(false)
        .map_err(|error| AppError::io(format!("Failed to initialize RustAutoGUI: {error}")))
}

#[cfg(feature = "rustautogui-backend")]
fn capture_screen_rustautogui(input: Value) -> Result<ToolResult, AppError> {
    let output_path = output_path(input.get("output_path").and_then(Value::as_str))?;
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if ["x", "y", "width", "height"]
        .iter()
        .any(|key| input.get(*key).is_some())
    {
        return Err(AppError::invalid_input(
            "RustAutoGUI screen_capture backend only supports full-screen capture; use xcap for region capture",
        ));
    }

    let mut autogui = new_rustautogui()?;
    autogui
        .save_screenshot(&output_path.to_string_lossy())
        .map_err(|error| AppError::io(format!("RustAutoGUI screenshot failed: {error}")))?;
    let (width, height) = autogui.get_screen_size();

    Ok(ToolResult::with_metadata(
        format!("Captured screenshot to {}", output_path.display()),
        json!({
            "tool": "screen_capture",
            "available": true,
            "backend": "rustautogui",
            "path": output_path,
            "width": width,
            "height": height,
            "region": false
        }),
    ))
}

#[cfg(not(feature = "rustautogui-backend"))]
fn capture_screen_rustautogui(_input: Value) -> Result<ToolResult, AppError> {
    Ok(unavailable_tool(
        "screen_capture",
        "Build khadim-rpa-harness with the `rustautogui-backend` feature.",
    ))
}

#[cfg(feature = "rustautogui-backend")]
fn control_computer_rustautogui(input: Value) -> Result<ToolResult, AppError> {
    let action = input
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::invalid_input("computer_input requires an action"))?;
    let mut autogui = new_rustautogui()?;
    autogui.set_suppress_warnings(true);

    match action {
        "move" => {
            let x = required_i32(&input, "x")?;
            let y = required_i32(&input, "y")?;
            let moving_time = optional_f32(&input, "moving_time", 0.1)?;
            if input
                .get("relative")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                autogui
                    .move_mouse(x, y, moving_time)
                    .map_err(|error| AppError::io(format!("RustAutoGUI mouse move failed: {error}")))?;
            } else {
                let x = u32::try_from(x)
                    .map_err(|_| AppError::invalid_input("x must be non-negative"))?;
                let y = u32::try_from(y)
                    .map_err(|_| AppError::invalid_input("y must be non-negative"))?;
                autogui
                    .move_mouse_to_pos(x, y, moving_time)
                    .map_err(|error| AppError::io(format!("RustAutoGUI mouse move failed: {error}")))?;
            }
            Ok(ToolResult::with_metadata(
                format!("Moved mouse to {x}, {y}"),
                json!({"tool": "computer_input", "available": true, "backend": "rustautogui", "action": "move", "x": x, "y": y}),
            ))
        }
        "click" => {
            if input.get("x").is_some() || input.get("y").is_some() {
                let x = required_u32(&input, "x")?;
                let y = required_u32(&input, "y")?;
                let moving_time = optional_f32(&input, "moving_time", 0.1)?;
                autogui
                    .move_mouse_to_pos(x, y, moving_time)
                    .map_err(|error| AppError::io(format!("RustAutoGUI mouse move failed: {error}")))?;
            }
            let button_name = input.get("button").and_then(Value::as_str).unwrap_or("left");
            let clicks = input.get("clicks").and_then(Value::as_u64).unwrap_or(1);
            if !(1..=10).contains(&clicks) {
                return Err(AppError::invalid_input("clicks must be between 1 and 10"));
            }
            for _ in 0..clicks {
                autogui
                    .click(parse_rustautogui_button(button_name)?)
                    .map_err(|error| AppError::io(format!("RustAutoGUI click failed: {error}")))?;
            }
            Ok(ToolResult::with_metadata(
                format!("Clicked mouse {clicks} time(s)"),
                json!({"tool": "computer_input", "available": true, "backend": "rustautogui", "action": "click", "clicks": clicks}),
            ))
        }
        "type" => {
            let text = input
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_input("type action requires text"))?;
            autogui
                .keyboard_input(text)
                .map_err(|error| AppError::io(format!("RustAutoGUI typing failed: {error}")))?;
            Ok(ToolResult::with_metadata(
                format!("Typed {} character(s)", text.chars().count()),
                json!({"tool": "computer_input", "available": true, "backend": "rustautogui", "action": "type", "chars": text.chars().count()}),
            ))
        }
        "key" => {
            let key_spec = input
                .get("key")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_input("key action requires key"))?;
            press_rustautogui_key(&autogui, key_spec)?;
            Ok(ToolResult::with_metadata(
                format!("Pressed key {key_spec}"),
                json!({"tool": "computer_input", "available": true, "backend": "rustautogui", "action": "key", "key": key_spec}),
            ))
        }
        "scroll" => {
            let amount = input.get("amount").and_then(Value::as_i64).unwrap_or(1);
            let intensity = u32::try_from(amount.unsigned_abs())
                .map_err(|_| AppError::invalid_input("scroll amount is out of range"))?;
            let axis = input
                .get("axis")
                .and_then(Value::as_str)
                .unwrap_or("vertical");
            match (axis, amount >= 0) {
                ("vertical", true) => autogui.scroll_up(intensity),
                ("vertical", false) => autogui.scroll_down(intensity),
                ("horizontal", true) => autogui.scroll_right(intensity),
                ("horizontal", false) => autogui.scroll_left(intensity),
                (other, _) => {
                    return Err(AppError::invalid_input(format!(
                        "Unsupported scroll axis: {other}"
                    )))
                }
            }
            .map_err(|error| AppError::io(format!("RustAutoGUI scroll failed: {error}")))?;
            Ok(ToolResult::with_metadata(
                format!("Scrolled {amount}"),
                json!({"tool": "computer_input", "available": true, "backend": "rustautogui", "action": "scroll", "amount": amount}),
            ))
        }
        other => Err(AppError::invalid_input(format!(
            "Unsupported computer_input action: {other}"
        ))),
    }
}

#[cfg(not(feature = "rustautogui-backend"))]
fn control_computer_rustautogui(_input: Value) -> Result<ToolResult, AppError> {
    Ok(unavailable_tool(
        "computer_input",
        "Build khadim-rpa-harness with the `rustautogui-backend` feature.",
    ))
}

#[cfg(feature = "rustautogui-backend")]
fn visual_find(input: Value) -> Result<ToolResult, AppError> {
    let template_path = input
        .get("template_path")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::invalid_input("visual_find requires template_path"))?;
    let precision = optional_f32(&input, "precision", 0.9)?;
    let moving_time = optional_f32(&input, "moving_time", 0.1)?;
    let move_mouse = input
        .get("move_mouse")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let region = optional_region(&input)?;
    let match_mode = parse_match_mode(
        input
            .get("match_mode")
            .and_then(Value::as_str)
            .unwrap_or("segmented"),
    )?;

    let mut autogui = new_rustautogui()?;
    autogui.set_suppress_warnings(true);
    autogui
        .prepare_template_from_file(template_path, region, match_mode)
        .map_err(|error| AppError::io(format!("RustAutoGUI template preparation failed: {error}")))?;
    let matches = autogui
        .find_image_on_screen(precision)
        .map_err(|error| AppError::io(format!("RustAutoGUI template search failed: {error}")))?
        .unwrap_or_default();

    if move_mouse {
        if let Some((x, y, _score)) = matches.first() {
            autogui
                .move_mouse_to_pos(*x, *y, moving_time)
                .map_err(|error| AppError::io(format!("RustAutoGUI mouse move failed: {error}")))?;
        }
    }

    let best = matches.first().map(|(x, y, score)| {
        json!({
            "x": x,
            "y": y,
            "score": score
        })
    });
    let all_matches: Vec<Value> = matches
        .into_iter()
        .map(|(x, y, score)| json!({"x": x, "y": y, "score": score}))
        .collect();

    Ok(ToolResult::with_metadata(
        if best.is_some() {
            "Template found on screen".to_string()
        } else {
            "Template not found on screen".to_string()
        },
        json!({
            "tool": "visual_find",
            "available": true,
            "backend": "rustautogui",
            "template_path": template_path,
            "precision": precision,
            "region": region,
            "match_count": all_matches.len(),
            "best": best,
            "matches": all_matches,
            "moved_mouse": move_mouse && best.is_some()
        }),
    ))
}

#[cfg(feature = "screen")]
fn capture_screen(input: Value) -> Result<ToolResult, AppError> {
    use xcap::Monitor;

    if input
        .get("backend")
        .and_then(Value::as_str)
        .is_some_and(|backend| backend == "rustautogui")
    {
        return capture_screen_rustautogui(input);
    }

    let monitors = Monitor::all()
        .map_err(|error| AppError::io(format!("Failed to list monitors: {error}")))?;
    if monitors.is_empty() {
        return Err(AppError::not_found("No monitors available for screen capture"));
    }

    let requested_display = input
        .get("display")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let monitor_index = requested_display.unwrap_or_else(|| {
        monitors
            .iter()
            .position(|monitor| monitor.is_primary().unwrap_or(false))
            .unwrap_or(0)
    });
    let monitor = monitors
        .get(monitor_index)
        .ok_or_else(|| AppError::invalid_input(format!("Display index {monitor_index} not found")))?;

    let output_path = output_path(input.get("output_path").and_then(Value::as_str))?;
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let has_region = ["x", "y", "width", "height"]
        .iter()
        .any(|key| input.get(*key).is_some());
    let image = if has_region {
        let x = required_u32(&input, "x")?;
        let y = required_u32(&input, "y")?;
        let width = required_u32(&input, "width")?;
        let height = required_u32(&input, "height")?;
        monitor
            .capture_region(x, y, width, height)
            .map_err(|error| AppError::io(format!("Failed to capture screen region: {error}")))?
    } else {
        monitor
            .capture_image()
            .map_err(|error| AppError::io(format!("Failed to capture screen: {error}")))?
    };

    let width = image.width();
    let height = image.height();
    image
        .save(&output_path)
        .map_err(|error| AppError::io(format!("Failed to save screenshot: {error}")))?;

    Ok(ToolResult::with_metadata(
        format!("Captured screenshot to {}", output_path.display()),
        json!({
            "tool": "screen_capture",
            "available": true,
            "path": output_path,
            "width": width,
            "height": height,
            "display": monitor_index,
            "region": has_region,
            "backend": "xcap"
        }),
    ))
}

#[cfg(not(feature = "screen"))]
fn capture_screen(_input: Value) -> Result<ToolResult, AppError> {
    Ok(unavailable_tool(
        "screen_capture",
        "Build khadim-rpa-harness with the `screen` feature and a platform screen-capture backend such as xcap.",
    ))
}

#[cfg(feature = "input")]
fn control_computer(input: Value) -> Result<ToolResult, AppError> {
    use enigo::{Axis, Coordinate, Direction::Click, Enigo, Keyboard, Mouse, Settings};

    if input
        .get("backend")
        .and_then(Value::as_str)
        .is_some_and(|backend| backend == "rustautogui")
    {
        return control_computer_rustautogui(input);
    }

    let action = input
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::invalid_input("computer_input requires an action"))?;
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|error| AppError::io(format!("Failed to initialize input backend: {error}")))?;

    match action {
        "move" => {
            let x = required_i32(&input, "x")?;
            let y = required_i32(&input, "y")?;
            let coordinate = if input
                .get("relative")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                Coordinate::Rel
            } else {
                Coordinate::Abs
            };
            enigo
                .move_mouse(x, y, coordinate)
                .map_err(|error| AppError::io(format!("Failed to move mouse: {error}")))?;
            Ok(ToolResult::with_metadata(
                format!("Moved mouse to {x}, {y}"),
                json!({"tool": "computer_input", "available": true, "backend": "enigo", "action": "move", "x": x, "y": y}),
            ))
        }
        "click" => {
            if input.get("x").is_some() || input.get("y").is_some() {
                let x = required_i32(&input, "x")?;
                let y = required_i32(&input, "y")?;
                enigo
                    .move_mouse(x, y, Coordinate::Abs)
                    .map_err(|error| AppError::io(format!("Failed to move mouse: {error}")))?;
            }
            let button = parse_button(input.get("button").and_then(Value::as_str).unwrap_or("left"))?;
            let clicks = input.get("clicks").and_then(Value::as_u64).unwrap_or(1);
            if !(1..=10).contains(&clicks) {
                return Err(AppError::invalid_input("clicks must be between 1 and 10"));
            }
            for _ in 0..clicks {
                enigo
                    .button(button, Click)
                    .map_err(|error| AppError::io(format!("Failed to click mouse: {error}")))?;
            }
            Ok(ToolResult::with_metadata(
                format!("Clicked mouse {clicks} time(s)"),
                json!({"tool": "computer_input", "available": true, "backend": "enigo", "action": "click", "clicks": clicks}),
            ))
        }
        "type" => {
            let text = input
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_input("type action requires text"))?;
            enigo
                .text(text)
                .map_err(|error| AppError::io(format!("Failed to type text: {error}")))?;
            Ok(ToolResult::with_metadata(
                format!("Typed {} character(s)", text.chars().count()),
                json!({"tool": "computer_input", "available": true, "backend": "enigo", "action": "type", "chars": text.chars().count()}),
            ))
        }
        "key" => {
            let key_spec = input
                .get("key")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_input("key action requires key"))?;
            press_key_combo(&mut enigo, key_spec)?;
            Ok(ToolResult::with_metadata(
                format!("Pressed key {key_spec}"),
                json!({"tool": "computer_input", "available": true, "backend": "enigo", "action": "key", "key": key_spec}),
            ))
        }
        "scroll" => {
            let amount = input.get("amount").and_then(Value::as_i64).unwrap_or(1) as i32;
            let axis = match input
                .get("axis")
                .and_then(Value::as_str)
                .unwrap_or("vertical")
            {
                "vertical" => Axis::Vertical,
                "horizontal" => Axis::Horizontal,
                other => {
                    return Err(AppError::invalid_input(format!(
                        "Unsupported scroll axis: {other}"
                    )))
                }
            };
            enigo
                .scroll(amount, axis)
                .map_err(|error| AppError::io(format!("Failed to scroll: {error}")))?;
            Ok(ToolResult::with_metadata(
                format!("Scrolled {amount}"),
                json!({"tool": "computer_input", "available": true, "backend": "enigo", "action": "scroll", "amount": amount}),
            ))
        }
        other => Err(AppError::invalid_input(format!(
            "Unsupported computer_input action: {other}"
        ))),
    }
}

#[cfg(not(feature = "input"))]
fn control_computer(_input: Value) -> Result<ToolResult, AppError> {
    Ok(unavailable_tool(
        "computer_input",
        "Build khadim-rpa-harness with the `input` feature and an input backend such as enigo.",
    ))
}

#[cfg(feature = "input")]
fn press_key_combo(enigo: &mut enigo::Enigo, key_spec: &str) -> Result<(), AppError> {
    use enigo::{
        Direction::{Click, Press, Release},
        Keyboard,
    };

    let parts = key_spec
        .split(['+', '-'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err(AppError::invalid_input("key cannot be empty"));
    }

    let mut keys = Vec::with_capacity(parts.len());
    for part in parts {
        keys.push(parse_key(part)?);
    }

    if keys.len() == 1 {
        enigo
            .key(keys[0], Click)
            .map_err(|error| AppError::io(format!("Failed to press key: {error}")))?;
        return Ok(());
    }

    for key in keys.iter().take(keys.len() - 1) {
        enigo
            .key(*key, Press)
            .map_err(|error| AppError::io(format!("Failed to press modifier: {error}")))?;
    }
    let final_key = *keys.last().expect("keys is not empty");
    let click_result = enigo
        .key(final_key, Click)
        .map_err(|error| AppError::io(format!("Failed to press key: {error}")));
    for key in keys.iter().take(keys.len() - 1).rev() {
        let _ = enigo.key(*key, Release);
    }
    click_result
}

#[cfg(feature = "input")]
fn parse_button(value: &str) -> Result<enigo::Button, AppError> {
    match value.to_ascii_lowercase().as_str() {
        "left" => Ok(enigo::Button::Left),
        "right" => Ok(enigo::Button::Right),
        "middle" => Ok(enigo::Button::Middle),
        other => Err(AppError::invalid_input(format!(
            "Unsupported mouse button: {other}"
        ))),
    }
}

#[cfg(feature = "input")]
fn parse_key(value: &str) -> Result<enigo::Key, AppError> {
    let lower = value.to_ascii_lowercase();
    let key = match lower.as_str() {
        "alt" | "option" => enigo::Key::Alt,
        "backspace" => enigo::Key::Backspace,
        "ctrl" | "control" => enigo::Key::Control,
        "delete" | "del" => enigo::Key::Delete,
        "down" | "downarrow" => enigo::Key::DownArrow,
        "end" => enigo::Key::End,
        "enter" | "return" => enigo::Key::Return,
        "escape" | "esc" => enigo::Key::Escape,
        "home" => enigo::Key::Home,
        "left" | "leftarrow" => enigo::Key::LeftArrow,
        "meta" | "cmd" | "command" | "super" | "win" | "windows" => enigo::Key::Meta,
        "pagedown" | "page_down" => enigo::Key::PageDown,
        "pageup" | "page_up" => enigo::Key::PageUp,
        "right" | "rightarrow" => enigo::Key::RightArrow,
        "shift" => enigo::Key::Shift,
        "space" => enigo::Key::Space,
        "tab" => enigo::Key::Tab,
        "up" | "uparrow" => enigo::Key::UpArrow,
        "f1" => enigo::Key::F1,
        "f2" => enigo::Key::F2,
        "f3" => enigo::Key::F3,
        "f4" => enigo::Key::F4,
        "f5" => enigo::Key::F5,
        "f6" => enigo::Key::F6,
        "f7" => enigo::Key::F7,
        "f8" => enigo::Key::F8,
        "f9" => enigo::Key::F9,
        "f10" => enigo::Key::F10,
        "f11" => enigo::Key::F11,
        "f12" => enigo::Key::F12,
        _ => {
            let mut chars = value.chars();
            if let (Some(ch), None) = (chars.next(), chars.next()) {
                enigo::Key::Unicode(ch)
            } else {
                return Err(AppError::invalid_input(format!("Unsupported key: {value}")));
            }
        }
    };
    Ok(key)
}

#[cfg(feature = "rustautogui-backend")]
fn parse_rustautogui_button(value: &str) -> Result<rustautogui::MouseClick, AppError> {
    match value.to_ascii_lowercase().as_str() {
        "left" => Ok(rustautogui::MouseClick::LEFT),
        "right" => Ok(rustautogui::MouseClick::RIGHT),
        "middle" => Ok(rustautogui::MouseClick::MIDDLE),
        other => Err(AppError::invalid_input(format!(
            "Unsupported mouse button: {other}"
        ))),
    }
}

#[cfg(feature = "rustautogui-backend")]
fn press_rustautogui_key(
    autogui: &rustautogui::RustAutoGui,
    key_spec: &str,
) -> Result<(), AppError> {
    let parts = key_spec
        .split(['+', '-'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    match parts.as_slice() {
        [] => Err(AppError::invalid_input("key cannot be empty")),
        [key] => autogui
            .keyboard_command(key)
            .map_err(|error| AppError::io(format!("RustAutoGUI key press failed: {error}"))),
        [first, second] => autogui
            .keyboard_multi_key(first, second, None)
            .map_err(|error| AppError::io(format!("RustAutoGUI key combo failed: {error}"))),
        [first, second, third] => autogui
            .keyboard_multi_key(first, second, Some(third))
            .map_err(|error| AppError::io(format!("RustAutoGUI key combo failed: {error}"))),
        _ => Err(AppError::invalid_input(
            "RustAutoGUI key combos support up to three keys",
        )),
    }
}

#[cfg(feature = "rustautogui-backend")]
fn parse_match_mode(value: &str) -> Result<rustautogui::MatchMode, AppError> {
    match value.to_ascii_lowercase().as_str() {
        "segmented" => Ok(rustautogui::MatchMode::Segmented),
        "fft" => Ok(rustautogui::MatchMode::FFT),
        "segmented_opencl" => {
            #[cfg(feature = "rustautogui-opencl")]
            {
                return Ok(rustautogui::MatchMode::SegmentedOcl);
            }
            #[cfg(not(feature = "rustautogui-opencl"))]
            {
                Err(AppError::invalid_input(
                    "OpenCL matching requires the `rustautogui-opencl` feature",
                ))
            }
        }
        "segmented_opencl_v2" => {
            #[cfg(feature = "rustautogui-opencl")]
            {
                return Ok(rustautogui::MatchMode::SegmentedOclV2);
            }
            #[cfg(not(feature = "rustautogui-opencl"))]
            {
                Err(AppError::invalid_input(
                    "OpenCL matching requires the `rustautogui-opencl` feature",
                ))
            }
        }
        other => Err(AppError::invalid_input(format!(
            "Unsupported match_mode: {other}"
        ))),
    }
}

#[cfg(feature = "screen")]
fn output_path(requested: Option<&str>) -> Result<PathBuf, AppError> {
    if let Some(path) = requested {
        if path.trim().is_empty() {
            return Err(AppError::invalid_input("output_path cannot be empty"));
        }
        return Ok(PathBuf::from(path));
    }

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::io(format!("System clock error: {error}")))?
        .as_millis();
    Ok(std::env::temp_dir()
        .join("khadim-rpa")
        .join(format!("screen-{millis}.png")))
}

fn required_i32(input: &Value, key: &str) -> Result<i32, AppError> {
    let value = input
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::invalid_input(format!("{key} is required")))?;
    i32::try_from(value).map_err(|_| AppError::invalid_input(format!("{key} is out of range")))
}

fn required_u32(input: &Value, key: &str) -> Result<u32, AppError> {
    let value = input
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| AppError::invalid_input(format!("{key} is required")))?;
    u32::try_from(value).map_err(|_| AppError::invalid_input(format!("{key} is out of range")))
}

#[cfg(feature = "rustautogui-backend")]
fn optional_f32(input: &Value, key: &str, default: f32) -> Result<f32, AppError> {
    let Some(value) = input.get(key) else {
        return Ok(default);
    };
    let value = value
        .as_f64()
        .ok_or_else(|| AppError::invalid_input(format!("{key} must be a number")))?;
    if !value.is_finite() {
        return Err(AppError::invalid_input(format!("{key} must be finite")));
    }
    Ok(value as f32)
}

#[cfg(feature = "rustautogui-backend")]
fn optional_region(input: &Value) -> Result<Option<(u32, u32, u32, u32)>, AppError> {
    let has_region = ["x", "y", "width", "height"]
        .iter()
        .any(|key| input.get(*key).is_some());
    if !has_region {
        return Ok(None);
    }
    Ok(Some((
        required_u32(input, "x")?,
        required_u32(input, "y")?,
        required_u32(input, "width")?,
        required_u32(input, "height")?,
    )))
}
