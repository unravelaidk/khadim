use crate::error::AppError;
use crate::providers::request_headers::build_codex_request_headers;
use crate::providers::transform_messages::{finalize_tool_call, to_openai_responses_input};
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

fn headers(model: &Model, token: &str, session_id: Option<&str>) -> reqwest::header::HeaderMap {
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
    headers.insert("OpenAI-Beta", reqwest::header::HeaderValue::from_static("responses=experimental"));
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
    to_openai_responses_input(&context.messages, false)
}

/// Build a tool-use prompt block that describes all available tools so the model
/// can invoke them via structured text output.  The chatgpt.com Codex backend
/// does NOT support custom `"type":"function"` tools — only built-in tools are
/// accepted.  We embed tool definitions in the instructions instead and parse
/// tool calls from the model's text response.
fn build_tool_instructions(context: &Context) -> String {
    if context.tools.is_empty() {
        return String::new();
    }

    let mut prompt = String::from(
        "\n\n# Available Tools\n\
         You have access to the following tools. To call a tool, output a JSON block \
         wrapped in <tool_call> tags on its own line. You may call multiple tools in \
         sequence. After each tool call the user will provide the result.\n\n\
         Format:\n\
         <tool_call>\n\
         {\"name\": \"tool_name\", \"arguments\": { ... }}\n\
         </tool_call>\n\n\
         Tools:\n",
    );

    for tool in &context.tools {
        prompt.push_str(&format!(
            "\n## {}\n{}\nParameters: {}\n",
            tool.name,
            tool.description,
            serde_json::to_string_pretty(&tool.parameters).unwrap_or_else(|_| "{}".to_string()),
        ));
    }

    prompt
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

pub fn complete(model: &Model, context: &Context, temperature: f32, token: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let token = token.to_string();
    let tool_prompt = build_tool_instructions(context);
    let instructions = format!("{}{}", context_to_system_prompt(context), tool_prompt);
    let session_id = context.session_id.clone();
    Box::pin(async move {
        let _ = temperature;
        let response = reqwest::Client::new()
            .post(endpoint(&model.base_url))
            .bearer_auth(&token)
            .headers(headers(&model, &token, session_id.as_deref()))
            .json(&json!({"model":model.id,"instructions":instructions,"input":input,"stream":false,"store":false}))
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim OpenAI Codex request failed: HTTP {status} - {body}"))); }
        let mut result = parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse OpenAI Codex response: {err}")))?)?;
        // Parse tool calls from the text content since we embed tools in instructions
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

    let headers = headers(model, token, Some(session_id));
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
    session_id: &str,
    model: &Model,
    payload: serde_json::Value,
    on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) -> Result<CompletionResponse, AppError> {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    let mut usage = Usage::default();
    let mut current_tool: Option<ToolCall> = None;
    let mut ws = socket.lock().await;
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        serde_json::to_string(&json!({"type": "response.create", "session_id": session_id, "payload": payload}))
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
        match payload.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
            "response.output_text.delta" => {
                let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
                if content.is_empty() { on_event(AssistantStreamEvent::TextStart); }
                content.push_str(delta);
                on_event(AssistantStreamEvent::TextDelta(delta.to_string()));
            }
            "response.function_call_arguments.delta" => {
                let id = payload.get("item_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                if current_tool.as_ref().map(|t| &t.id) != Some(&id) {
                    if let Some(existing) = current_tool.take() {
                        on_event(AssistantStreamEvent::ToolCallEnd(existing.clone()));
                        tool_calls.push(existing);
                    }
                    current_tool = Some(finalize_tool_call(id.clone(), name.clone(), String::new()));
                    on_event(AssistantStreamEvent::ToolCallStart { id, name });
                }
                let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
                if let Some(current) = current_tool.as_mut() {
                    current.function.arguments.push_str(delta);
                    on_event(AssistantStreamEvent::ToolCallDelta { id: current.id.clone(), name: current.function.name.clone(), arguments: delta.to_string() });
                }
            }
            "response.completed" | "response.done" | "response.incomplete" => {
                if !content.is_empty() { on_event(AssistantStreamEvent::TextEnd(content.clone())); }
                if let Some(existing) = current_tool.take() {
                    on_event(AssistantStreamEvent::ToolCallEnd(existing.clone()));
                    tool_calls.push(existing);
                }
                if let Some(raw_usage) = payload.get("response").and_then(|v| v.get("usage")) {
                    usage.input = raw_usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.input);
                    usage.output = raw_usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.output);
                    usage.cache_read = raw_usage.get("input_tokens_details").and_then(|v| v.get("cached_tokens")).and_then(|v| v.as_u64()).unwrap_or(usage.cache_read);
                    on_event(AssistantStreamEvent::Usage(usage.clone()));
                }
                on_event(AssistantStreamEvent::Done);
                // Parse tool calls from text content
                let (clean_text, text_tool_calls) = parse_tool_calls_from_text(&content);
                if !text_tool_calls.is_empty() {
                    for tc in &text_tool_calls {
                        on_event(AssistantStreamEvent::ToolCallStart { id: tc.id.clone(), name: tc.function.name.clone() });
                        on_event(AssistantStreamEvent::ToolCallDelta { id: tc.id.clone(), name: tc.function.name.clone(), arguments: tc.function.arguments.clone() });
                        on_event(AssistantStreamEvent::ToolCallEnd(tc.clone()));
                    }
                    tool_calls.extend(text_tool_calls);
                    content = clean_text;
                }
                return Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None });
            }
            "error" | "response.failed" => {
                let message = payload.get("message").and_then(|v| v.as_str()).unwrap_or("Codex websocket request failed");
                return Err(AppError::health(message));
            }
            _ => {}
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
    Ok(CompletionResponse { content, tool_calls, usage: Usage {
        input: usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        output: usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_read: usage.get("input_tokens_details").and_then(|v| v.get("cached_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
        cache_write: 0,
    }, reasoning_content: None})
}

pub fn stream(model: &Model, context: &Context, temperature: f32, token: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let token = token.to_string();
    let tool_prompt = build_tool_instructions(context);
    let instructions = format!("{}{}", context_to_system_prompt(context), tool_prompt);
    let session_id = context.session_id.clone();
    Box::pin(async move {
        let _ = temperature;
        let request_payload = json!({"model":model.id,"instructions":instructions,"input":input,"stream":true,"store":false});

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
            .headers(headers(&model, &token, session_id.as_deref()))
            .json(&request_payload)
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim OpenAI Codex streaming request failed: HTTP {status} - {body}"))); }
        let mut content = String::new();
        let mut tool_calls = Vec::new();
        let mut usage = Usage::default();
        let mut current_tool: Option<ToolCall> = None;
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            if data == "[DONE]" { return Ok(()); }
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse OpenAI Codex SSE: {err}")))?;
            match payload.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                "response.output_text.delta" => {
                    let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
                    if content.is_empty() { on_event(AssistantStreamEvent::TextStart); }
                    content.push_str(delta);
                    on_event(AssistantStreamEvent::TextDelta(delta.to_string()));
                }
                "response.function_call_arguments.delta" => {
                    let id = payload.get("item_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    if current_tool.as_ref().map(|t| &t.id) != Some(&id) {
                        if let Some(existing) = current_tool.take() { on_event(AssistantStreamEvent::ToolCallEnd(existing.clone())); tool_calls.push(existing); }
                        current_tool = Some(finalize_tool_call(id.clone(), name.clone(), String::new()));
                        on_event(AssistantStreamEvent::ToolCallStart { id, name });
                    }
                    let delta = payload.get("delta").and_then(|v| v.as_str()).unwrap_or_default();
                    if let Some(current) = current_tool.as_mut() {
                        current.function.arguments.push_str(delta);
                        on_event(AssistantStreamEvent::ToolCallDelta { id: current.id.clone(), name: current.function.name.clone(), arguments: delta.to_string() });
                    }
                }
                "response.completed" | "response.done" => {
                    if !content.is_empty() { on_event(AssistantStreamEvent::TextEnd(content.clone())); }
                    if let Some(existing) = current_tool.take() { on_event(AssistantStreamEvent::ToolCallEnd(existing.clone())); tool_calls.push(existing); }
                    if let Some(raw_usage) = payload.get("response").and_then(|v| v.get("usage")) {
                        usage.input = raw_usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.input);
                        usage.output = raw_usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.output);
                        usage.cache_read = raw_usage.get("input_tokens_details").and_then(|v| v.get("cached_tokens")).and_then(|v| v.as_u64()).unwrap_or(usage.cache_read);
                        on_event(AssistantStreamEvent::Usage(usage.clone()));
                    }
                    on_event(AssistantStreamEvent::Done);
                }
                _ => {}
            }
            Ok(())
        }).await?;
        // Parse tool calls embedded in the text content
        let (clean_text, text_tool_calls) = parse_tool_calls_from_text(&content);
        if !text_tool_calls.is_empty() {
            // Re-emit events for the parsed tool calls so the agent loop picks them up
            for tc in &text_tool_calls {
                on_event(AssistantStreamEvent::ToolCallStart { id: tc.id.clone(), name: tc.function.name.clone() });
                on_event(AssistantStreamEvent::ToolCallDelta { id: tc.id.clone(), name: tc.function.name.clone(), arguments: tc.function.arguments.clone() });
                on_event(AssistantStreamEvent::ToolCallEnd(tc.clone()));
            }
            tool_calls.extend(text_tool_calls);
            content = clean_text;
        }
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
