use crate::error::AppError;
use crate::providers::request_headers::build_codex_request_headers;
use crate::providers::transform_messages::{finalize_tool_call, normalize_tool_call_id};
use crate::providers::usage::openai_responses_usage;
use crate::types::ChatMessage;
use crate::streaming::for_each_sse_event;
use crate::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
use base64::Engine;
use futures_util::{future::BoxFuture, SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

type CodexSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct CachedWebSocket {
    socket: Arc<Mutex<CodexSocket>>,
}

fn websocket_cache() -> &'static Mutex<HashMap<String, CachedWebSocket>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedWebSocket>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn extract_account_id(token: &str) -> Option<String> {
    let parts = token.split('.').collect::<Vec<_>>();
    if parts.len() != 3 { return None; }
    let payload = parts[1];
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload).ok().or_else(|| base64::engine::general_purpose::URL_SAFE.decode(payload).ok())?;
    let json = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    json.get("https://api.openai.com/auth")?.get("chatgpt_account_id")?.as_str().map(ToOwned::to_owned)
}

fn headers(model: &Model, token: &str, session_id: Option<&str>, websocket: bool) -> reqwest::header::HeaderMap {
    let mut headers = model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_str(value),
        ) {
            acc.insert(name, val);
        }
        acc
    });
    headers.insert("originator", reqwest::header::HeaderValue::from_static("khadim"));
    if let Some(account_id) = extract_account_id(token) {
        if let Ok(val) = reqwest::header::HeaderValue::from_str(&account_id) {
            headers.insert("chatgpt-account-id", val);
        }
    }
    headers.insert(
        "OpenAI-Beta",
        reqwest::header::HeaderValue::from_static(if websocket {
            "responses_websockets=2026-02-06"
        } else {
            "responses=experimental"
        }),
    );
    for (key, value) in build_codex_request_headers(session_id) {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_str(&value),
        ) {
            headers.insert(name, val);
        }
    }
    headers
}

fn request_payload(
    model: &Model,
    instructions: String,
    input: Vec<serde_json::Value>,
    tools: Vec<serde_json::Value>,
    stream: bool,
    session_id: Option<&str>,
) -> serde_json::Value {
    let mut payload = json!({
        "model": model.id,
        "instructions": instructions,
        "input": input,
        "stream": stream,
        "store": false,
        "text": { "verbosity": "medium" },
        "include": ["reasoning.encrypted_content"],
        "tool_choice": "auto",
        "parallel_tool_calls": true,
    });

    if !tools.is_empty() {
        payload["tools"] = json!(tools);
    }

    if let Some(session_id) = session_id {
        payload["prompt_cache_key"] = json!(session_id);
    }

    payload
}

fn websocket_request_payload(payload: serde_json::Value) -> serde_json::Value {
    let mut request = payload;
    if let Some(object) = request.as_object_mut() {
        object.insert("type".to_string(), json!("response.create"));
    }
    request
}

fn endpoint(base_url: &str) -> String {
    let normalized = base_url.trim_end_matches('/');
    if normalized.ends_with("/codex/responses") { normalized.to_string() }
    else if normalized.ends_with("/codex") { format!("{normalized}/responses") }
    else { format!("{normalized}/codex/responses") }
}

fn websocket_endpoint(base_url: &str) -> String {
    let endpoint = endpoint(base_url);
    if let Some(rest) = endpoint.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = endpoint.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        endpoint
    }
}

fn convert_input(context: &Context) -> Vec<serde_json::Value> {
    let mut converted = Vec::new();
    let mut pending_tool_calls = Vec::<String>::new();
    let mut existing_tool_results = std::collections::HashSet::<String>::new();
    let mut message_index = 0usize;

    let flush_orphaned_tool_results = |
        converted: &mut Vec<serde_json::Value>,
        pending_tool_calls: &[String],
        existing_tool_results: &std::collections::HashSet<String>,
    | {
        for tool_call_id in pending_tool_calls {
            if existing_tool_results.contains(tool_call_id) {
                continue;
            }
            converted.push(json!({
                "type": "function_call_output",
                "call_id": tool_call_id,
                "output": "No result provided",
            }));
        }
    };

    for message in &context.messages {
        match message {
            ChatMessage::System { .. } => {}
            ChatMessage::User { content } => {
                flush_orphaned_tool_results(&mut converted, &pending_tool_calls, &existing_tool_results);
                pending_tool_calls.clear();
                existing_tool_results.clear();
                converted.push(json!({
                    "role": "user",
                    "content": [{ "type": "input_text", "text": content }],
                }));
            }
            ChatMessage::Assistant { content, tool_calls, .. } => {
                flush_orphaned_tool_results(&mut converted, &pending_tool_calls, &existing_tool_results);
                pending_tool_calls.clear();
                existing_tool_results.clear();

                if let Some(content) = content {
                    if !content.trim().is_empty() {
                        converted.push(json!({
                            "type": "message",
                            "role": "assistant",
                            "content": [{ "type": "output_text", "text": content }],
                            "status": "completed",
                            "id": format!("msg_{message_index}"),
                        }));
                    }
                }

                for tool_call in tool_calls {
                    let call_id = normalize_tool_call_id(&tool_call.id, 64);
                    pending_tool_calls.push(call_id.clone());
                    converted.push(json!({
                        "type": "function_call",
                        "call_id": call_id,
                        "name": tool_call.function.name,
                        "arguments": tool_call.function.arguments,
                    }));
                }
            }
            ChatMessage::Tool(tool) => {
                let call_id = normalize_tool_call_id(&tool.tool_call_id, 64);
                existing_tool_results.insert(call_id.clone());
                converted.push(json!({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": tool.content,
                }));
            }
        }

        message_index += 1;
    }

    flush_orphaned_tool_results(&mut converted, &pending_tool_calls, &existing_tool_results);
    converted
}

fn convert_tools(context: &Context) -> Vec<serde_json::Value> {
    context.tools.iter().map(|tool| json!({
        "type": "function",
        "name": tool.name,
        "description": tool.description,
        "parameters": tool.parameters,
    })).collect()
}

/// Parse `<tool_call>...</tool_call>` blocks from the model's text response and
/// return them as `ToolCall` objects, plus the remaining text content with the
/// tool_call blocks stripped out.
fn parse_tool_calls_from_text(text: &str) -> (String, Vec<ToolCall>) {
    let mut tool_calls = Vec::new();
    let mut clean_text = String::new();
    let mut remaining = text;

    while let Some(start) = remaining.find("<tool_call>") {
        // Add text before the tag
        clean_text.push_str(&remaining[..start]);

        let after_tag = &remaining[start + "<tool_call>".len()..];
        if let Some(end) = after_tag.find("</tool_call>") {
            let json_str = after_tag[..end].trim();
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let arguments = parsed.get("arguments")
                    .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
                    .unwrap_or_else(|| "{}".to_string());
                let id = format!("call_{}", uuid::Uuid::new_v4().to_string().replace('-', "")[..24].to_string());
                tool_calls.push(finalize_tool_call(id, name, arguments));
            }
            remaining = &after_tag[end + "</tool_call>".len()..];
        } else {
            // Unclosed tag — keep the rest as text
            clean_text.push_str(&remaining[start..]);
            remaining = "";
            break;
        }
    }

    clean_text.push_str(remaining);
    let clean_text = clean_text.trim().to_string();
    (clean_text, tool_calls)
}

#[derive(Default)]
struct StreamState {
    content: String,
    tool_calls: Vec<ToolCall>,
    usage: Usage,
    current_tool: Option<InFlightToolCall>,
    text_started: bool,
}

struct InFlightToolCall {
    item_id: String,
    tool_call: ToolCall,
}

fn start_text_if_needed(state: &mut StreamState, on_event: &Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) {
    if !state.text_started {
        on_event(AssistantStreamEvent::TextStart);
        state.text_started = true;
    }
}

fn finish_text_if_started(state: &mut StreamState, on_event: &Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) {
    if state.text_started {
        on_event(AssistantStreamEvent::TextEnd(state.content.clone()));
        state.text_started = false;
    }
}

fn finish_current_tool(state: &mut StreamState, on_event: &Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) {
    if let Some(current) = state.current_tool.take() {
        on_event(AssistantStreamEvent::ToolCallEnd(current.tool_call.clone()));
        state.tool_calls.push(current.tool_call);
    }
}

fn handle_tool_delta(
    state: &mut StreamState,
    item_id: String,
    call_id: Option<String>,
    name: String,
    delta: &str,
    on_event: &Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) {
    let needs_new_tool = state.current_tool.as_ref().map(|current| current.item_id.as_str()) != Some(item_id.as_str());
    if needs_new_tool {
        finish_current_tool(state, on_event);
        let id = call_id.unwrap_or_else(|| item_id.clone());
        let tool_call = finalize_tool_call(id.clone(), name.clone(), String::new());
        on_event(AssistantStreamEvent::ToolCallStart { id, name });
        state.current_tool = Some(InFlightToolCall { item_id, tool_call });
    }

    if let Some(current) = state.current_tool.as_mut() {
        current.tool_call.function.arguments.push_str(delta);
        on_event(AssistantStreamEvent::ToolCallDelta {
            id: current.tool_call.id.clone(),
            name: current.tool_call.function.name.clone(),
            arguments: delta.to_string(),
        });
    }
}

fn handle_stream_event(
    payload: &serde_json::Value,
    state: &mut StreamState,
    on_event: &Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) -> Result<Option<CompletionResponse>, AppError> {
    match payload.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
        "response.output_item.added" => {
            if let Some(item) = payload.get("item") {
                match item.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                    "message" => start_text_if_needed(state, on_event),
                    "function_call" => {
                        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                        let call_id = item.get("call_id").and_then(|v| v.as_str()).map(ToOwned::to_owned);
                        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                        handle_tool_delta(state, item_id, call_id, name, "", on_event);
                    }
                    _ => {}
                }
            }
        }
        "response.output_text.delta" => {
            let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
            start_text_if_needed(state, on_event);
            state.content.push_str(delta);
            on_event(AssistantStreamEvent::TextDelta(delta.to_string()));
        }
        "response.function_call_arguments.delta" => {
            let item_id = payload.get("item_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let call_id = payload.get("call_id").and_then(|v| v.as_str()).map(ToOwned::to_owned);
            let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
            handle_tool_delta(state, item_id, call_id, name, delta, on_event);
        }
        "response.function_call_arguments.done" => {
            let item_id = payload.get("item_id").and_then(|v| v.as_str()).unwrap_or_default();
            let arguments = payload.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}");
            if let Some(current) = state.current_tool.as_mut() {
                if current.item_id == item_id {
                    current.tool_call.function.arguments = arguments.to_string();
                }
            }
        }
        "response.output_item.done" => {
            if let Some(item) = payload.get("item") {
                match item.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                    "message" => finish_text_if_started(state, on_event),
                    "function_call" => {
                        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                        let arguments = item.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}");
                        if let Some(current) = state.current_tool.as_mut() {
                            if current.item_id == item_id {
                                current.tool_call.function.arguments = arguments.to_string();
                            }
                        }
                        finish_current_tool(state, on_event);
                    }
                    _ => {}
                }
            }
        }
        "response.completed" | "response.done" | "response.incomplete" => {
            finish_text_if_started(state, on_event);
            finish_current_tool(state, on_event);
            if let Some(raw_usage) = payload.get("response").and_then(|v| v.get("usage")) {
                state.usage = openai_responses_usage(raw_usage);
                on_event(AssistantStreamEvent::Usage(state.usage.clone()));
            }
            on_event(AssistantStreamEvent::Done);

            let (clean_text, text_tool_calls) = parse_tool_calls_from_text(&state.content);
            if !text_tool_calls.is_empty() {
                state.tool_calls.extend(text_tool_calls);
                state.content = clean_text;
            }

            return Ok(Some(CompletionResponse {
                content: state.content.clone(),
                tool_calls: state.tool_calls.clone(),
                usage: state.usage.clone(),
                reasoning_content: None,
            }));
        }
        "error" | "response.failed" => {
            let message = payload
                .get("message")
                .and_then(|v| v.as_str())
                .or_else(|| payload.get("response").and_then(|v| v.get("error")).and_then(|v| v.get("message")).and_then(|v| v.as_str()))
                .unwrap_or("Codex request failed");
            return Err(AppError::health(message));
        }
        _ => {}
    }

    Ok(None)
}

pub fn complete(model: &Model, context: &Context, temperature: f32, token: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let tools = convert_tools(context);
    let token = token.to_string();
    let instructions = context_to_system_prompt(context);
    let session_id = context.session_id.clone();
    Box::pin(async move {
        let _ = temperature;
        let response = reqwest::Client::new()
            .post(endpoint(&model.base_url))
            .bearer_auth(&token)
            .headers(headers(&model, &token, session_id.as_deref(), false))
            .json(&request_payload(&model, instructions, input, tools, false, session_id.as_deref()))
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim OpenAI Codex request failed: HTTP {status} - {body}"))); }
        let mut result = parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse OpenAI Codex response: {err}")))?)?;
        let (clean_text, text_tool_calls) = parse_tool_calls_from_text(&result.content);
        if !text_tool_calls.is_empty() {
            result.content = clean_text;
            result.tool_calls.extend(text_tool_calls);
        }
        Ok(result)
    })
}

async fn get_or_connect_websocket(
    model: &Model,
    token: &str,
    session_id: &str,
) -> Result<Arc<Mutex<CodexSocket>>, AppError> {
    let mut cache = websocket_cache().lock().await;
    if let Some(entry) = cache.get(session_id) {
        return Ok(entry.socket.clone());
    }

    let headers = headers(model, token, Some(session_id), true);
    let mut builder = http::Request::builder().uri(websocket_endpoint(&model.base_url));
    for (key, value) in headers.iter() {
        builder = builder.header(key, value);
    }
    let request = builder.body(()).map_err(|err| AppError::health(format!("Failed to build Codex websocket request: {err}")))?;
    let (socket, _) = connect_async(request)
        .await
        .map_err(|err| AppError::health(format!("Failed to connect Codex websocket: {err}")))?;
    let socket = Arc::new(Mutex::new(socket));
    cache.insert(session_id.to_string(), CachedWebSocket { socket: socket.clone() });
    Ok(socket)
}

async fn process_websocket(
    socket: Arc<Mutex<CodexSocket>>,
    _session_id: &str,
    model: &Model,
    payload: serde_json::Value,
    on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) -> Result<CompletionResponse, AppError> {
    let mut state = StreamState::default();
    let mut ws = socket.lock().await;
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        serde_json::to_string(&websocket_request_payload(payload))
            .map_err(|err| AppError::health(format!("Failed to encode Codex websocket payload: {err}")))?
            .into(),
    ))
    .await
    .map_err(|err| AppError::health(format!("Failed to send Codex websocket payload: {err}")))?;

    on_event(AssistantStreamEvent::Start);
    while let Some(message) = ws.next().await {
        let message = message.map_err(|err| AppError::health(format!("Codex websocket error: {err}")))?;
        let text = match message {
            tokio_tungstenite::tungstenite::Message::Text(text) => text.to_string(),
            tokio_tungstenite::tungstenite::Message::Binary(bin) => String::from_utf8_lossy(&bin).to_string(),
            tokio_tungstenite::tungstenite::Message::Close(_) => {
                return Err(AppError::health("Codex websocket closed before completion"));
            }
            _ => continue,
        };

        let payload = serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|err| AppError::health(format!("Failed to parse Codex websocket event: {err}")))?;
        if let Some(result) = handle_stream_event(&payload, &mut state, &on_event)? {
            return Ok(result);
        }
    }

    let _ = model;
    Err(AppError::health("Codex websocket closed before completion"))
}

fn context_to_system_prompt(context: &Context) -> String {
    context.messages.iter().filter_map(|message| match message {
        crate::types::ChatMessage::System { content } => Some(content.as_str()),
        _ => None,
    }).collect::<Vec<_>>().join("\n\n")
}

fn parse_response(body: serde_json::Value) -> Result<CompletionResponse, AppError> {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(output) = body.get("output").and_then(|v| v.as_array()) {
        for item in output {
            match item.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                "message" => {
                    if let Some(parts) = item.get("content").and_then(|v| v.as_array()) {
                        for part in parts {
                            if part.get("type").and_then(|v| v.as_str()) == Some("output_text") {
                                content.push_str(part.get("text").and_then(|v| v.as_str()).unwrap_or_default());
                            }
                        }
                    }
                }
                "function_call" => tool_calls.push(ToolCall {
                    id: item.get("call_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    call_type: "function".to_string(),
                    function: crate::types::ToolFunction {
                        name: item.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        arguments: item.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}").to_string(),
                    },
                }),
                _ => {}
            }
        }
    }
    let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));
    Ok(CompletionResponse { content, tool_calls, usage: openai_responses_usage(&usage), reasoning_content: None})
}

pub fn stream(model: &Model, context: &Context, temperature: f32, token: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let tools = convert_tools(context);
    let token = token.to_string();
    let instructions = context_to_system_prompt(context);
    let session_id = context.session_id.clone();
    Box::pin(async move {
        let _ = temperature;
        let request_payload = request_payload(&model, instructions, input, tools, true, session_id.as_deref());

        if let Some(session_id) = session_id.as_deref() {
            match get_or_connect_websocket(&model, &token, session_id).await {
                Ok(socket) => match process_websocket(socket, session_id, &model, request_payload.clone(), on_event.clone()).await {
                    Ok(result) => return Ok(result),
                    Err(_) => {
                        websocket_cache().lock().await.remove(session_id);
                    }
                },
                Err(_) => {}
            }
        }

        let response = reqwest::Client::new()
            .post(endpoint(&model.base_url))
            .bearer_auth(&token)
            .headers(headers(&model, &token, session_id.as_deref(), false))
            .json(&request_payload)
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim OpenAI Codex streaming request failed: HTTP {status} - {body}"))); }
        let mut state = StreamState::default();
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            if data == "[DONE]" { return Ok(()); }
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse OpenAI Codex SSE: {err}")))?;
            let _ = handle_stream_event(&payload, &mut state, &on_event)?;
            Ok(())
        }).await?;
        finish_text_if_started(&mut state, &on_event);
        finish_current_tool(&mut state, &on_event);
        let (clean_text, text_tool_calls) = parse_tool_calls_from_text(&state.content);
        if !text_tool_calls.is_empty() {
            state.tool_calls.extend(text_tool_calls);
            state.content = clean_text;
        }
        Ok(CompletionResponse { content: state.content, tool_calls: state.tool_calls, usage: state.usage, reasoning_content: None })
    })
}
