use crate::error::AppError;
use crate::khadim_ai::providers::request_headers::build_codex_request_headers;
use crate::khadim_ai::providers::transform_messages::finalize_tool_call;
use crate::khadim_ai::streaming::for_each_sse_event;
use crate::khadim_ai::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
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
    context.messages.iter().filter_map(|message| match message {
        crate::khadim_ai::types::ChatMessage::System { .. } => None,
        crate::khadim_ai::types::ChatMessage::User { content } => Some(json!({"role":"user","content":content})),
        crate::khadim_ai::types::ChatMessage::Assistant { content, tool_calls, .. } => {
            let mut blocks = Vec::new();
            if let Some(content) = content { if !content.is_empty() { blocks.push(json!({"type":"output_text","text":content})); } }
            for call in tool_calls {
                blocks.push(json!({"type":"function_call","call_id":call.id,"name":call.function.name,"arguments":call.function.arguments}));
            }
            Some(json!({"role":"assistant","content":blocks}))
        }
        crate::khadim_ai::types::ChatMessage::Tool(tool) => Some(json!({"type":"function_call_output","call_id":tool.tool_call_id,"output":tool.content})),
    }).collect()
}

fn convert_tools(context: &Context) -> Vec<serde_json::Value> {
    context.tools.iter().map(|tool| json!({
        "type":"function",
        "name":tool.name,
        "description":tool.description,
        "parameters":tool.parameters,
    })).collect()
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
            .headers(headers(&model, &token, session_id.as_deref()))
            .json(&json!({"model":model.id,"instructions":instructions,"input":input,"tools":tools,"stream":false,"store":false}))
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim OpenAI Codex request failed: HTTP {status} - {body}"))); }
        parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse OpenAI Codex response: {err}")))?)
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
        crate::khadim_ai::types::ChatMessage::System { content } => Some(content.as_str()),
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
                    function: crate::khadim_ai::types::ToolFunction {
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
    let tools = convert_tools(context);
    let token = token.to_string();
    let instructions = context_to_system_prompt(context);
    let session_id = context.session_id.clone();
    Box::pin(async move {
        let _ = temperature;
        let request_payload = json!({"model":model.id,"instructions":instructions,"input":input,"tools":tools,"stream":true,"store":false});

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
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
