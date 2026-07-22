use khadim_plugin_sdk::{export_plugin, Capabilities, HarnessCapability, Plugin, PluginInfo};
use serde_json::{json, Map, Value};

struct OpenCodePlugin;

impl Plugin for OpenCodePlugin {
    fn info() -> PluginInfo {
        PluginInfo {
            id: "khadim.opencode".to_string(),
            name: "OpenCode".to_string(),
            version: "0.3.0".to_string(),
            api_version: 1,
        }
    }

    fn capabilities() -> Capabilities {
        Capabilities {
            harnesses: vec![HarnessCapability {
                id: "opencode".to_string(),
                name: "OpenCode".to_string(),
                description: "Use a loopback OpenCode server as the agent harness.".to_string(),
                icon: Some("opencode".to_string()),
            }],
        }
    }

    fn call(operation: &str, input: Value) -> Result<Value, String> {
        let context = input.as_object().ok_or("Harness input must be an object")?;
        match operation {
            "harness.endpoint" => endpoint(context),
            "harness.health" => Ok(request("GET", "/global/health", None)),
            "harness.session.get" => Ok(request("GET", &format!("/session/{}", session_id(context)?), None)),
            "harness.session.create" => Ok(request(
                "POST",
                "/session",
                Some(json!({ "title": session_title(context) })),
            )),
            "harness.session.parse" => parse_session(context),
            "harness.events" => Ok(request("GET", "/event", None)),
            "harness.prompt" => prompt_request(context),
            "harness.question.reply" => question_reply_request(context),
            "harness.approval.reply" => approval_reply_request(context),
            "harness.abort" => Ok(request("POST", &format!("/session/{}/abort", session_id(context)?), None)),
            "harness.event" => map_event(context),
            _ => Err(format!("Unsupported OpenCode operation: {operation}")),
        }
    }
}

fn config(context: &Map<String, Value>) -> Result<&Map<String, Value>, String> {
    context.get("config").and_then(Value::as_object).ok_or("Harness config is missing".to_string())
}

fn config_string(context: &Map<String, Value>, key: &str) -> Result<Option<String>, String> {
    let value = config(context)?.get(key);
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) if value.trim().is_empty() => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.trim().to_string())),
        _ => Err(format!("OpenCode config {key} must be a string")),
    }
}

fn endpoint(context: &Map<String, Value>) -> Result<Value, String> {
    let base_url = config_string(context, "baseUrl")?.ok_or("Khadim did not prepare an OpenCode server endpoint")?;
    let mut headers = Map::new();
    let project_path = context.get("projectPath").and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or("Khadim project path is missing")?;
    headers.insert("x-opencode-directory".to_string(), Value::String(project_path.to_string()));
    if let Some(password) = config_string(context, "password")? {
        let username = config_string(context, "username")?.unwrap_or_else(|| "opencode".to_string());
        headers.insert("authorization".to_string(), Value::String(format!("Basic {}", base64(&format!("{username}:{password}")))));
    }
    Ok(json!({ "baseUrl": base_url.trim_end_matches('/'), "headers": headers }))
}

fn request(method: &str, path: &str, body: Option<Value>) -> Value {
    let mut value = json!({ "method": method, "path": path });
    if let Some(body) = body { value["body"] = body; }
    value
}

fn session_id(context: &Map<String, Value>) -> Result<String, String> {
    context.get("remoteSessionId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment)
        .ok_or("OpenCode session id is missing".to_string())
}

fn session_title(context: &Map<String, Value>) -> String {
    let key = context.get("engineSessionKey").and_then(Value::as_str).unwrap_or("Khadim");
    format!("Khadim {}", key.chars().take(12).collect::<String>())
}

fn parse_session(context: &Map<String, Value>) -> Result<Value, String> {
    let response = context.get("response").and_then(Value::as_object).ok_or("OpenCode session response is missing")?;
    let body = response.get("body").unwrap_or(&Value::Null);
    let id = body.get("id").and_then(Value::as_str)
        .or_else(|| body.get("data").and_then(|data| data.get("id")).and_then(Value::as_str))
        .ok_or("OpenCode create-session response has no id")?;
    Ok(json!({ "sessionId": id }))
}

fn prompt_request(context: &Map<String, Value>) -> Result<Value, String> {
    let prompt = context.get("prompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).ok_or("Prompt is missing")?;
    let mut body = json!({ "parts": [{ "type": "text", "text": prompt }] });
    if let Some(system) = context.get("systemPrompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        body["system"] = Value::String(system.to_string());
    }
    if let Some(agent) = context.get("mode").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        body["agent"] = Value::String(agent.trim().to_string());
    } else if let Some(agent) = config_string(context, "agent")? {
        body["agent"] = Value::String(agent);
    }
    let model = context.get("model").and_then(Value::as_object).ok_or("Selected chat model is missing")?;
    let provider = model.get("provider").and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or("Selected chat model provider is missing")?;
    let model_id = model.get("model").and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or("Selected chat model ID is missing")?;
    body["model"] = json!({ "providerID": provider, "modelID": model_id });
    Ok(request("POST", &format!("/session/{}/prompt_async", session_id(context)?), Some(body)))
}

fn question_reply_request(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("questionRequestId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment).ok_or("OpenCode question request id is missing")?;
    let answers = context.get("questionAnswers").and_then(Value::as_object)
        .ok_or("OpenCode question answers are missing")?;
    let mut ordered = answers.iter().filter_map(|(id, answer)| {
        let index = id.strip_prefix("question-")?.split('-').next()?.parse::<usize>().ok()?;
        let values = answer.as_array()?.iter().filter_map(Value::as_str).map(Value::from).collect::<Vec<_>>();
        Some((index, Value::Array(values)))
    }).collect::<Vec<_>>();
    ordered.sort_by_key(|(index, _)| *index);
    Ok(request(
        "POST",
        &format!("/question/{request_id}/reply"),
        Some(json!({ "answers": ordered.into_iter().map(|(_, answer)| answer).collect::<Vec<_>>() })),
    ))
}

fn approval_reply_request(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("approvalRequestId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment).ok_or("OpenCode approval request id is missing")?;
    let decision = context.get("approvalDecision").and_then(Value::as_str).ok_or("OpenCode approval decision is missing")?;
    let reply = match decision {
        "accept" => "once",
        "acceptForSession" => "always",
        "decline" | "cancel" => "reject",
        _ => return Err("OpenCode approval decision is invalid".to_string()),
    };
    Ok(request("POST", &format!("/permission/{request_id}/reply"), Some(json!({ "reply": reply }))))
}

fn map_event(context: &Map<String, Value>) -> Result<Value, String> {
    let event = context.get("event").and_then(Value::as_object).ok_or("OpenCode event is missing")?;
    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
    let properties = event.get("properties").and_then(Value::as_object);
    let wanted_session = context.get("remoteSessionId").and_then(Value::as_str).unwrap_or("");
    let event_session = properties.and_then(event_session_id).unwrap_or("");
    if !event_session.is_empty() && event_session != wanted_session {
        return Ok(json!({ "events": [] }));
    }

    let result = match event_type {
        "message.part.updated" => map_part(properties),
        "message.part.delta" => map_part_delta(properties),
        "session.next.text.delta" => map_text_delta(properties),
        "question.asked" if event_session == wanted_session => map_question(properties),
        "question.replied" | "question.rejected" => {
            let request_id = properties.and_then(|props| props.get("requestID")).and_then(Value::as_str).unwrap_or("");
            json!({ "events": [{ "event_type": "question", "metadata": { "requestId": request_id, "resolved": true } }] })
        }
        "permission.asked" if event_session == wanted_session => map_permission(properties),
        "permission.replied" => {
            let request_id = properties.and_then(|props| props.get("requestID")).and_then(Value::as_str).unwrap_or("");
            json!({ "events": [{ "event_type": "approval", "metadata": { "requestId": request_id, "resolved": true } }] })
        }
        "session.status" if event_session == wanted_session => map_session_status(properties),
        "session.idle" if event_session == wanted_session => json!({ "events": [{ "event_type": "done", "content": "Run completed." }], "terminal": true }),
        "session.error" if event_session.is_empty() || event_session == wanted_session => {
            let message = properties.and_then(|props| props.get("error")).map(error_message).unwrap_or_else(|| "OpenCode session failed.".to_string());
            json!({ "events": [{ "event_type": "error", "content": message }], "terminal": true })
        }
        _ => json!({ "events": [] }),
    };
    Ok(result)
}

fn map_permission(properties: Option<&Map<String, Value>>) -> Value {
    let Some(properties) = properties else { return json!({ "events": [] }); };
    let Some(request_id) = properties.get("id").and_then(Value::as_str).filter(|value| !value.is_empty()) else { return json!({ "events": [] }); };
    let permission = properties.get("permission").and_then(Value::as_str).unwrap_or("tool");
    let kind = if permission.contains("bash") || permission.contains("command") { "command" }
        else if permission.contains("read") { "file-read" }
        else if permission.contains("edit") || permission.contains("write") { "file-change" }
        else { "tool" };
    let patterns = properties.get("patterns").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).collect::<Vec<_>>();
    let detail = if patterns.is_empty() { permission.to_string() } else { patterns.join("\n") };
    let title = if kind == "command" { "Run this command?" } else if kind == "file-read" { "Allow this file read?" } else if kind == "file-change" { "Allow this file change?" } else { "Allow this tool?" };
    json!({ "events": [{ "event_type": "approval", "metadata": {
        "requestId": request_id, "kind": kind, "title": title, "detail": detail
    } }] })
}

fn question_id(index: usize, header: &str) -> String {
    let slug = header.trim().to_ascii_lowercase().chars().map(|character| {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') { character } else { '-' }
    }).collect::<String>();
    let slug = slug.trim_matches('-');
    if slug.is_empty() { format!("question-{index}") } else { format!("question-{index}-{slug}") }
}

fn map_question(properties: Option<&Map<String, Value>>) -> Value {
    let Some(properties) = properties else { return json!({ "events": [] }); };
    let Some(request_id) = properties.get("id").and_then(Value::as_str).filter(|value| !value.is_empty()) else {
        return json!({ "events": [] });
    };
    let questions = properties.get("questions").and_then(Value::as_array).into_iter().flatten().enumerate().filter_map(|(index, value)| {
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
            "id": question_id(index, header),
            "header": header,
            "question": prompt,
            "options": options,
            "multiSelect": question.get("multiple").and_then(Value::as_bool).unwrap_or(false)
        }))
    }).collect::<Vec<_>>();
    if questions.is_empty() { json!({ "events": [] }) } else {
        json!({ "events": [{ "event_type": "question", "metadata": { "requestId": request_id, "questions": questions } }] })
    }
}

fn map_session_status(properties: Option<&Map<String, Value>>) -> Value {
    let status = properties.and_then(|properties| properties.get("status")).and_then(Value::as_object)
        .and_then(|status| status.get("type")).and_then(Value::as_str).unwrap_or("");
    if status == "idle" {
        json!({ "events": [{ "event_type": "done", "content": "Run completed." }], "terminal": true })
    } else {
        json!({ "events": [] })
    }
}

fn map_part_delta(properties: Option<&Map<String, Value>>) -> Value {
    let Some(properties) = properties else { return json!({ "events": [] }); };
    if properties.get("field").and_then(Value::as_str) != Some("text") {
        return json!({ "events": [] });
    }
    map_text_delta(Some(properties))
}

fn map_text_delta(properties: Option<&Map<String, Value>>) -> Value {
    properties.and_then(|properties| properties.get("delta")).and_then(Value::as_str).filter(|delta| !delta.is_empty())
        .map(|delta| json!({ "events": [{ "event_type": "text_delta", "content": delta }] }))
        .unwrap_or_else(|| json!({ "events": [] }))
}

fn event_session_id(properties: &Map<String, Value>) -> Option<&str> {
    properties.get("sessionID").and_then(Value::as_str).or_else(|| {
        properties.get("part").and_then(Value::as_object)?.get("sessionID")?.as_str()
    })
}

fn map_part(properties: Option<&Map<String, Value>>) -> Value {
    let Some(properties) = properties else { return json!({ "events": [] }); };
    let Some(part) = properties.get("part").and_then(Value::as_object) else { return json!({ "events": [] }); };
    match part.get("type").and_then(Value::as_str).unwrap_or("") {
        "text" => properties.get("delta").and_then(Value::as_str).filter(|delta| !delta.is_empty())
            .map(|delta| json!({ "events": [{ "event_type": "text_delta", "content": delta }] }))
            .unwrap_or_else(|| json!({ "events": [] })),
        "tool" => map_tool_part(part),
        "step-finish" => {
            let tokens = part.get("tokens").and_then(Value::as_object);
            let cache = tokens.and_then(|tokens| tokens.get("cache")).and_then(Value::as_object);
            json!({ "events": [{
                "event_type": "usage",
                "metadata": {
                    "input": tokens.and_then(|value| value.get("input")).and_then(Value::as_u64).unwrap_or(0),
                    "output": tokens.and_then(|value| value.get("output")).and_then(Value::as_u64).unwrap_or(0),
                    "cache_read": cache.and_then(|value| value.get("read")).and_then(Value::as_u64).unwrap_or(0),
                    "cache_write": cache.and_then(|value| value.get("write")).and_then(Value::as_u64).unwrap_or(0)
                }
            }] })
        }
        _ => json!({ "events": [] }),
    }
}

fn map_tool_part(part: &Map<String, Value>) -> Value {
    let state = part.get("state").and_then(Value::as_object);
    let status = state.and_then(|state| state.get("status")).and_then(Value::as_str).unwrap_or("pending");
    let tool = part.get("tool").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or("tool");
    let id = part.get("callID").and_then(Value::as_str).filter(|value| !value.trim().is_empty())
        .or_else(|| part.get("id").and_then(Value::as_str).filter(|value| !value.trim().is_empty()))
        .unwrap_or(tool);
    // OpenCode currently sends an explicitly empty title for some completed
    // tools (for example glob). Empty transient labels are not valid durable
    // Khadim tool activities, so use the stable tool name instead.
    let title = state.and_then(|state| state.get("title")).and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty()).unwrap_or(tool);
    let input = state.and_then(|state| state.get("input")).cloned().unwrap_or_else(|| json!({}));
    match status {
        "pending" | "running" => json!({ "events": [{
            "event_type": if status == "pending" { "step_start" } else { "step_update" },
            "content": serde_json::to_string(&input).unwrap_or_default(),
            "metadata": { "id": id, "tool": tool, "title": title }
        }] }),
        "completed" => {
            let output = state.and_then(|state| state.get("output")).and_then(Value::as_str).unwrap_or("");
            json!({ "events": [{ "event_type": "step_complete", "content": output, "metadata": { "id": id, "tool": tool, "title": title, "result": output } }] })
        }
        "error" => {
            let error = state.and_then(|state| state.get("error")).and_then(Value::as_str).unwrap_or("Tool failed");
            json!({ "events": [{ "event_type": "step_complete", "content": error, "metadata": { "id": id, "tool": tool, "title": title, "result": error, "is_error": true } }] })
        }
        _ => json!({ "events": [] }),
    }
}

fn error_message(value: &Value) -> String {
    value.get("data").and_then(|data| data.get("message")).and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .or_else(|| value.get("name").and_then(Value::as_str))
        .unwrap_or("OpenCode session failed.").to_string()
}

fn url_segment(value: &str) -> String {
    value.bytes().map(|byte| match byte {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (byte as char).to_string(),
        _ => format!("%{byte:02X}"),
    }).collect()
}

fn base64(value: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = value.as_bytes();
    let mut output = String::new();
    for chunk in bytes.chunks(3) {
        let packed = ((chunk[0] as u32) << 16) | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8) | chunk.get(2).copied().unwrap_or(0) as u32;
        output.push(TABLE[((packed >> 18) & 63) as usize] as char);
        output.push(TABLE[((packed >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((packed >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(packed & 63) as usize] as char } else { '=' });
    }
    output
}

export_plugin!(OpenCodePlugin);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_text_and_terminal_events() {
        let context = json!({
            "remoteSessionId": "ses_123",
            "event": { "type": "message.part.delta", "properties": { "sessionID": "ses_123", "messageID": "msg_123", "partID": "prt_123", "field": "text", "delta": "Hello" } }
        });
        let mapped = map_event(context.as_object().unwrap()).unwrap();
        assert_eq!(mapped["events"][0]["event_type"], "text_delta");
        assert_eq!(mapped["events"][0]["content"], "Hello");

        let idle = json!({
            "remoteSessionId": "ses_123",
            "event": { "type": "session.status", "properties": { "sessionID": "ses_123", "status": { "type": "idle" } } }
        });
        let mapped_idle = map_event(idle.as_object().unwrap()).unwrap();
        assert_eq!(mapped_idle["terminal"], true);
        assert_eq!(mapped_idle["events"][0]["event_type"], "done");
    }

    #[test]
    fn replaces_empty_opencode_tool_titles_with_the_tool_name() {
        let context = json!({
            "remoteSessionId": "ses_123",
            "event": {
                "type": "message.part.updated",
                "properties": {
                    "sessionID": "ses_123",
                    "part": {
                        "type": "tool",
                        "tool": "glob",
                        "callID": "call_123",
                        "state": { "status": "completed", "title": "", "output": "No files found" }
                    }
                }
            }
        });

        let mapped = map_event(context.as_object().unwrap()).unwrap();

        assert_eq!(mapped["events"][0]["metadata"]["title"], "glob");
    }

    #[test]
    fn ignores_events_from_another_session() {
        let context = json!({
            "remoteSessionId": "ses_123",
            "event": { "type": "session.idle", "properties": { "sessionID": "ses_other" } }
        });
        assert_eq!(map_event(context.as_object().unwrap()).unwrap()["events"], json!([]));
    }

    #[test]
    fn builds_basic_auth_without_host_imports() {
        assert_eq!(base64("opencode:secret"), "b3BlbmNvZGU6c2VjcmV0");
    }

    #[test]
    fn scopes_requests_to_the_active_project() {
        let context = json!({
            "projectPath": "/workspace/project",
            "config": { "baseUrl": "http://127.0.0.1:4096" }
        });
        let value = endpoint(context.as_object().unwrap()).unwrap();
        assert_eq!(value["headers"]["x-opencode-directory"], "/workspace/project");
    }
}
