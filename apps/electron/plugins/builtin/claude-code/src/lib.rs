use khadim_plugin_sdk::{export_plugin, Capabilities, HarnessCapability, Plugin, PluginInfo};
use serde_json::{json, Map, Value};

struct ClaudeCodePlugin;

impl Plugin for ClaudeCodePlugin {
    fn info() -> PluginInfo {
        PluginInfo {
            id: "khadim.claude-code".to_string(),
            name: "Claude Code".to_string(),
            version: "0.2.0".to_string(),
            api_version: 1,
        }
    }

    fn capabilities() -> Capabilities {
        Capabilities {
            harnesses: vec![HarnessCapability {
                id: "claude-code".to_string(),
                name: "Claude Code".to_string(),
                description: "Use the local Claude Code CLI as the agent harness.".to_string(),
                icon: Some("claude".to_string()),
            }],
        }
    }

    fn call(operation: &str, input: Value) -> Result<Value, String> {
        let context = input.as_object().ok_or("Harness input must be an object")?;
        match operation {
            "harness.endpoint" => endpoint(context),
            "harness.health" => Ok(request("GET", "/health", None)),
            "harness.session.get" => Ok(request("GET", &format!("/session/{}", session_id(context)?), None)),
            "harness.session.create" => Ok(request("POST", "/session", Some(json!({})))),
            "harness.session.parse" => parse_session(context),
            "harness.events" => Ok(request("GET", &format!("/session/{}/events", session_id(context)?), None)),
            "harness.prompt" => prompt_request(context),
            "harness.question.reply" => question_reply_request(context),
            "harness.approval.reply" => approval_reply_request(context),
            "harness.abort" => Ok(request("POST", &format!("/session/{}/abort", session_id(context)?), None)),
            "harness.event" => map_event(context),
            _ => Err(format!("Unsupported Claude Code operation: {operation}")),
        }
    }
}

fn config(context: &Map<String, Value>) -> Result<&Map<String, Value>, String> {
    context.get("config").and_then(Value::as_object).ok_or("Harness config is missing".to_string())
}

fn config_string(context: &Map<String, Value>, key: &str) -> Result<Option<String>, String> {
    match config(context)?.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) if value.trim().is_empty() => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.trim().to_string())),
        _ => Err(format!("Claude Code config {key} must be a string")),
    }
}

fn endpoint(context: &Map<String, Value>) -> Result<Value, String> {
    let base_url = config_string(context, "bridgeUrl")?.ok_or("Khadim did not prepare the Claude Code bridge")?;
    let token = config_string(context, "bridgeToken")?.ok_or("Khadim did not prepare Claude Code bridge authentication")?;
    Ok(json!({
        "baseUrl": base_url.trim_end_matches('/'),
        "headers": { "authorization": format!("Bearer {token}") }
    }))
}

fn request(method: &str, path: &str, body: Option<Value>) -> Value {
    let mut value = json!({ "method": method, "path": path });
    if let Some(body) = body { value["body"] = body; }
    value
}

fn session_id(context: &Map<String, Value>) -> Result<String, String> {
    context.get("remoteSessionId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment)
        .ok_or("Claude Code session id is missing".to_string())
}

fn parse_session(context: &Map<String, Value>) -> Result<Value, String> {
    let response = context.get("response").and_then(Value::as_object).ok_or("Claude Code session response is missing")?;
    let id = response.get("body").and_then(|body| body.get("id")).and_then(Value::as_str)
        .ok_or("Claude Code create-session response has no id")?;
    Ok(json!({ "sessionId": id }))
}

fn prompt_request(context: &Map<String, Value>) -> Result<Value, String> {
    let prompt = context.get("prompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty())
        .ok_or("Prompt is missing")?;
    let mut body = json!({ "prompt": prompt });
    if let Some(system_prompt) = context.get("systemPrompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        body["systemPrompt"] = Value::String(system_prompt.to_string());
    }
    let model = context.get("model").and_then(Value::as_object)
        .and_then(|model| model.get("model")).and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or("Selected chat model ID is missing")?;
    body["model"] = Value::String(model.to_string());
    if let Some(mode) = context.get("mode").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        body["mode"] = Value::String(mode.trim().to_string());
    }
    if let Some(runtime_mode) = context.get("runtimeMode").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { body["runtimeMode"] = Value::String(runtime_mode.to_string()); }
    Ok(request("POST", &format!("/session/{}/prompt", session_id(context)?), Some(body)))
}

fn question_reply_request(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("questionRequestId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment).ok_or("Claude Code question request id is missing")?;
    let answers = context.get("questionAnswers").and_then(Value::as_object)
        .ok_or("Claude Code question answers are missing")?;
    Ok(request(
        "POST",
        &format!("/session/{}/question/{request_id}/reply", session_id(context)?),
        Some(json!({ "answers": answers })),
    ))
}

fn approval_reply_request(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("approvalRequestId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment).ok_or("Claude Code approval request id is missing")?;
    let decision = context.get("approvalDecision").and_then(Value::as_str).filter(|value| matches!(*value, "accept" | "acceptForSession" | "decline" | "cancel"))
        .ok_or("Claude Code approval decision is missing")?;
    Ok(request(
        "POST",
        &format!("/session/{}/approval/{request_id}/reply", session_id(context)?),
        Some(json!({ "decision": decision })),
    ))
}

fn map_event(context: &Map<String, Value>) -> Result<Value, String> {
    let event = context.get("event").and_then(Value::as_object).ok_or("Claude Code event is missing")?;
    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
    let wanted_session = context.get("remoteSessionId").and_then(Value::as_str).unwrap_or("");
    let event_session = event.get("session_id").and_then(Value::as_str).unwrap_or("");
    if !event_session.is_empty() && !wanted_session.is_empty() && event_session != wanted_session {
        return Ok(json!({ "events": [] }));
    }
    match event_type {
        "stream_event" => Ok(map_stream_event(event)),
        "assistant" => Ok(map_assistant(event)),
        "user" => Ok(map_user(event)),
        "result" => Ok(map_result(event)),
        "khadim.question" => Ok(map_question(event)),
        "khadim.approval" => Ok(json!({ "events": [{ "event_type": "approval", "metadata": {
            "requestId": event.get("request_id").and_then(Value::as_str).unwrap_or(""),
            "kind": event.get("kind").and_then(Value::as_str).unwrap_or("tool"),
            "title": event.get("title").and_then(Value::as_str).unwrap_or("Approval required"),
            "detail": event.get("detail").and_then(Value::as_str).unwrap_or("")
        } }] })),
        "khadim.process_error" => {
            let message = event.get("message").and_then(Value::as_str).filter(|value| !value.is_empty())
                .unwrap_or("Claude Code process failed.");
            Ok(json!({ "events": [{ "event_type": "error", "content": message }], "terminal": true }))
        }
        _ => Ok(json!({ "events": [] })),
    }
}

fn map_question(message: &Map<String, Value>) -> Value {
    let Some(request_id) = message.get("request_id").and_then(Value::as_str).filter(|value| !value.is_empty()) else {
        return json!({ "events": [] });
    };
    let questions = message.get("questions").and_then(Value::as_array).into_iter().flatten().filter_map(|value| {
        let question = value.as_object()?;
        let prompt = question.get("question").and_then(Value::as_str)?.trim();
        if prompt.is_empty() { return None; }
        let header = question.get("header").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or("Question");
        let options = question.get("options").and_then(Value::as_array).into_iter().flatten().filter_map(|value| {
            let option = value.as_object()?;
            let label = option.get("label").and_then(Value::as_str)?.trim();
            if label.is_empty() { return None; }
            let description = option.get("description").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or(label);
            Some(json!({ "label": label, "description": description }))
        }).collect::<Vec<_>>();
        Some(json!({
            "id": prompt,
            "header": header,
            "question": prompt,
            "options": options,
            "multiSelect": question.get("multiSelect").and_then(Value::as_bool).unwrap_or(false)
        }))
    }).collect::<Vec<_>>();
    if questions.is_empty() { json!({ "events": [] }) } else {
        json!({ "events": [{ "event_type": "question", "metadata": { "requestId": request_id, "questions": questions } }] })
    }
}

fn map_stream_event(message: &Map<String, Value>) -> Value {
    let Some(event) = message.get("event").and_then(Value::as_object) else { return json!({ "events": [] }); };
    match event.get("type").and_then(Value::as_str).unwrap_or("") {
        "content_block_delta" => {
            let Some(delta) = event.get("delta").and_then(Value::as_object) else { return json!({ "events": [] }); };
            if delta.get("type").and_then(Value::as_str) == Some("text_delta") {
                if let Some(text) = delta.get("text").and_then(Value::as_str).filter(|value| !value.is_empty()) {
                    return json!({ "events": [{ "event_type": "text_delta", "content": text }] });
                }
            }
            json!({ "events": [] })
        }
        "content_block_start" => {
            let Some(block) = event.get("content_block").and_then(Value::as_object) else { return json!({ "events": [] }); };
            let block_type = block.get("type").and_then(Value::as_str).unwrap_or("");
            if !matches!(block_type, "tool_use" | "server_tool_use" | "mcp_tool_use") {
                return json!({ "events": [] });
            }
            let id = block.get("id").and_then(Value::as_str).unwrap_or("claude-tool");
            let tool = block.get("name").and_then(Value::as_str).unwrap_or("Claude tool");
            let input = block.get("input").cloned().unwrap_or_else(|| json!({}));
            json!({ "events": [{
                "event_type": "step_start",
                "content": tool,
                "metadata": { "id": id, "tool": tool, "title": tool, "input": input }
            }] })
        }
        _ => json!({ "events": [] }),
    }
}

fn map_assistant(message: &Map<String, Value>) -> Value {
    let content = message.get("message").and_then(|value| value.get("content")).and_then(Value::as_array);
    let mut events = Vec::new();
    for block in content.into_iter().flatten().filter_map(Value::as_object) {
        if !matches!(block.get("type").and_then(Value::as_str), Some("tool_use" | "server_tool_use" | "mcp_tool_use")) { continue; }
        let id = block.get("id").and_then(Value::as_str).unwrap_or("claude-tool");
        let tool = block.get("name").and_then(Value::as_str).unwrap_or("Claude tool");
        let input = block.get("input").cloned().unwrap_or_else(|| json!({}));
        events.push(json!({
            "event_type": "step_update",
            "content": json_text(&input),
            "metadata": { "id": id, "tool": tool, "title": tool, "input": input }
        }));
    }
    json!({ "events": events })
}

fn map_user(message: &Map<String, Value>) -> Value {
    let content = message.get("message").and_then(|value| value.get("content")).and_then(Value::as_array);
    let mut events = Vec::new();
    for block in content.into_iter().flatten().filter_map(Value::as_object) {
        if block.get("type").and_then(Value::as_str) != Some("tool_result") { continue; }
        let id = block.get("tool_use_id").and_then(Value::as_str).unwrap_or("claude-tool");
        let result = block.get("content").map(content_text).unwrap_or_default();
        let is_error = block.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        events.push(json!({
            "event_type": "step_complete",
            "content": result,
            "metadata": {
                "id": id,
                "result": result,
                "is_error": is_error
            }
        }));
    }
    json!({ "events": events })
}

fn map_result(message: &Map<String, Value>) -> Value {
    let mut events = Vec::new();
    if let Some(usage) = message.get("usage").and_then(Value::as_object) {
        events.push(json!({
            "event_type": "usage",
            "metadata": {
                "input": usage_number(usage, "input_tokens"),
                "output": usage_number(usage, "output_tokens"),
                "cache_read": usage_number(usage, "cache_read_input_tokens"),
                "cache_write": usage_number(usage, "cache_creation_input_tokens")
            }
        }));
    }
    if message.get("subtype").and_then(Value::as_str) == Some("success") {
        events.push(json!({ "event_type": "done", "content": "Run completed." }));
    } else {
        let error = message.get("errors").and_then(Value::as_array)
            .and_then(|errors| errors.iter().find_map(Value::as_str))
            .or_else(|| message.get("result").and_then(Value::as_str))
            .filter(|value| !value.is_empty())
            .unwrap_or("Claude Code run failed.");
        events.push(json!({ "event_type": "error", "content": error }));
    }
    json!({ "events": events, "terminal": true })
}

fn usage_number(usage: &Map<String, Value>, key: &str) -> u64 {
    usage.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn content_text(value: &Value) -> String {
    if let Some(text) = value.as_str() { return text.to_string(); }
    if let Some(blocks) = value.as_array() {
        let text = blocks.iter().filter_map(|block| {
            block.as_object()?.get("text")?.as_str()
        }).collect::<Vec<_>>().join("\n");
        if !text.is_empty() { return text; }
    }
    json_text(value)
}

fn json_text(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

fn url_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

export_plugin!(ClaudeCodePlugin);
