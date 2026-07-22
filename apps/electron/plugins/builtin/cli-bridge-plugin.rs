use khadim_plugin_sdk::{export_plugin, Capabilities, HarnessCapability, Plugin, PluginInfo};
use serde_json::{json, Map, Value};

struct CliBridgePlugin;

impl Plugin for CliBridgePlugin {
    fn info() -> PluginInfo {
        PluginInfo { id: PLUGIN_ID.into(), name: PLUGIN_NAME.into(), version: "0.1.0".into(), api_version: 1 }
    }

    fn capabilities() -> Capabilities {
        Capabilities { harnesses: vec![HarnessCapability {
            id: HARNESS_ID.into(), name: PLUGIN_NAME.into(), description: DESCRIPTION.into(), icon: Some(ICON.into()),
        }] }
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
            "harness.prompt" => prompt(context),
            "harness.abort" => Ok(request("POST", &format!("/session/{}/abort", session_id(context)?), None)),
            "harness.question.reply" => question_reply(context),
            "harness.approval.reply" => approval_reply(context),
            "harness.event" => map_event(context),
            _ => Err(format!("Unsupported {PLUGIN_NAME} operation: {operation}")),
        }
    }
}

fn config(context: &Map<String, Value>, key: &str) -> Result<String, String> {
    context.get("config").and_then(Value::as_object).and_then(|value| value.get(key)).and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty()).map(|value| value.trim().to_string())
        .ok_or(format!("{PLUGIN_NAME} config {key} is missing"))
}

fn endpoint(context: &Map<String, Value>) -> Result<Value, String> {
    Ok(json!({
        "baseUrl": config(context, "bridgeUrl")?.trim_end_matches('/'),
        "headers": { "authorization": format!("Bearer {}", config(context, "bridgeToken")?) }
    }))
}

fn request(method: &str, path: &str, body: Option<Value>) -> Value {
    let mut value = json!({ "method": method, "path": path });
    if let Some(body) = body { value["body"] = body; }
    value
}

fn session_id(context: &Map<String, Value>) -> Result<String, String> {
    context.get("remoteSessionId").and_then(Value::as_str).filter(|value| !value.is_empty())
        .map(url_segment).ok_or(format!("{PLUGIN_NAME} session id is missing"))
}

fn parse_session(context: &Map<String, Value>) -> Result<Value, String> {
    let id = context.get("response").and_then(|value| value.get("body")).and_then(|value| value.get("id")).and_then(Value::as_str)
        .ok_or(format!("{PLUGIN_NAME} create-session response has no id"))?;
    Ok(json!({ "sessionId": id }))
}

fn prompt(context: &Map<String, Value>) -> Result<Value, String> {
    let text = context.get("prompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).ok_or("Prompt is missing")?;
    let model = context.get("model").and_then(|value| value.get("model")).and_then(Value::as_str).filter(|value| !value.is_empty()).ok_or("Selected model is missing")?;
    let mut body = json!({ "prompt": text, "model": model });
    if let Some(system) = context.get("systemPrompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { body["systemPrompt"] = Value::String(system.into()); }
    if let Some(mode) = context.get("mode").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { body["mode"] = Value::String(mode.into()); }
    if let Some(runtime_mode) = context.get("runtimeMode").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { body["runtimeMode"] = Value::String(runtime_mode.into()); }
    Ok(request("POST", &format!("/session/{}/prompt", session_id(context)?), Some(body)))
}

fn question_reply(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("questionRequestId").and_then(Value::as_str).filter(|value| !value.is_empty()).map(url_segment).ok_or("Question request id is missing")?;
    let answers = context.get("questionAnswers").and_then(Value::as_object).ok_or("Question answers are missing")?;
    Ok(request("POST", &format!("/session/{}/question/{request_id}/reply", session_id(context)?), Some(json!({ "answers": answers }))))
}

fn approval_reply(context: &Map<String, Value>) -> Result<Value, String> {
    let request_id = context.get("approvalRequestId").and_then(Value::as_str).filter(|value| !value.is_empty()).map(url_segment).ok_or("Approval request id is missing")?;
    let decision = context.get("approvalDecision").and_then(Value::as_str).filter(|value| matches!(*value, "accept" | "acceptForSession" | "decline" | "cancel")).ok_or("Approval decision is missing")?;
    Ok(request("POST", &format!("/session/{}/approval/{request_id}/reply", session_id(context)?), Some(json!({ "decision": decision }))))
}

fn map_event(context: &Map<String, Value>) -> Result<Value, String> {
    let event = context.get("event").and_then(Value::as_object).ok_or(format!("{PLUGIN_NAME} event is missing"))?;
    let mapped = match event.get("type").and_then(Value::as_str).unwrap_or("") {
        "khadim.text_delta" => event.get("text").and_then(Value::as_str).filter(|value| !value.is_empty())
            .map(|text| json!({ "events": [{ "event_type": "text_delta", "content": text }] })).unwrap_or_else(|| json!({ "events": [] })),
        "khadim.question" => json!({ "events": [{ "event_type": "question", "metadata": {
            "requestId": event.get("request_id").and_then(Value::as_str).unwrap_or(""),
            "questions": event.get("questions").cloned().unwrap_or_else(|| json!([]))
        } }] }),
        "khadim.approval" => json!({ "events": [{ "event_type": "approval", "metadata": {
            "requestId": event.get("request_id").and_then(Value::as_str).unwrap_or(""),
            "kind": event.get("kind").and_then(Value::as_str).unwrap_or("tool"),
            "title": event.get("title").and_then(Value::as_str).unwrap_or("Approval required"),
            "detail": event.get("detail").and_then(Value::as_str).unwrap_or("")
        } }] }),
        "khadim.step_start" | "khadim.step_update" | "khadim.step_complete" => {
            let item = event.get("item").and_then(Value::as_object);
            let id = item.and_then(|value| value.get("id").or_else(|| value.get("toolCallId"))).and_then(Value::as_str).unwrap_or("tool");
            let title = item.and_then(|value| value.get("title")).and_then(Value::as_str).unwrap_or("Tool");
            let kind = event.get("type").and_then(Value::as_str).unwrap_or("").trim_start_matches("khadim.");
            json!({ "events": [{ "event_type": kind, "content": serde_json::to_string(&item).unwrap_or_default(), "metadata": { "id": id, "tool": title, "title": title } }] })
        }
        "khadim.usage" => json!({ "events": [{ "event_type": "usage", "metadata": event.get("usage").cloned().unwrap_or_else(|| json!({})) }] }),
        "khadim.done" => json!({ "events": [{ "event_type": "done", "content": "Run completed." }], "terminal": true }),
        "khadim.process_error" => json!({ "events": [{ "event_type": "error", "content": event.get("message").and_then(Value::as_str).unwrap_or("Harness failed.") }], "terminal": true }),
        _ => json!({ "events": [] }),
    };
    Ok(mapped)
}

fn url_segment(value: &str) -> String {
    value.bytes().map(|byte| match byte {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (byte as char).to_string(),
        _ => format!("%{byte:02X}"),
    }).collect()
}

export_plugin!(CliBridgePlugin);
