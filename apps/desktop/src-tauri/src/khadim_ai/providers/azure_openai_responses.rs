use crate::error::AppError;
use crate::khadim_ai::providers::transform_messages::finalize_tool_call;
use crate::khadim_ai::streaming::for_each_sse_event;
use crate::khadim_ai::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::sync::Arc;

fn api_version() -> String {
    std::env::var("AZURE_OPENAI_API_VERSION").unwrap_or_else(|_| "v1".to_string())
}

fn deployment_name(model: &Model) -> String {
    if let Ok(map) = std::env::var("AZURE_OPENAI_DEPLOYMENT_NAME_MAP") {
        for entry in map.split(',') {
            if let Some((left, right)) = entry.trim().split_once('=') {
                if left.trim() == model.id {
                    return right.trim().to_string();
                }
            }
        }
    }
    model.id.clone()
}

fn headers(model: &Model, api_key: &str) -> reqwest::header::HeaderMap {
    let mut headers = model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_str(value),
        ) {
            acc.insert(name, val);
        }
        acc
    });
    headers.insert("api-key", reqwest::header::HeaderValue::from_str(api_key).unwrap());
    headers
}

fn convert_input(context: &Context) -> Vec<serde_json::Value> {
    context
        .messages
        .iter()
        .map(|message| match message {
            crate::khadim_ai::types::ChatMessage::System { content } => json!({"role": "system", "content": content}),
            crate::khadim_ai::types::ChatMessage::User { content } => json!({"role": "user", "content": content}),
            crate::khadim_ai::types::ChatMessage::Assistant { content, tool_calls, .. } => {
                let mut blocks = Vec::new();
                if let Some(content) = content {
                    if !content.is_empty() {
                        blocks.push(json!({"type": "output_text", "text": content}));
                    }
                }
                for call in tool_calls {
                    blocks.push(json!({
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    }));
                }
                json!({"role": "assistant", "content": blocks})
            }
            crate::khadim_ai::types::ChatMessage::Tool(tool) => json!({
                "type": "function_call_output",
                "call_id": tool.tool_call_id,
                "output": tool.content,
            }),
        })
        .collect()
}

fn convert_tools(context: &Context) -> Vec<serde_json::Value> {
    context
        .tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            })
        })
        .collect()
}

fn parse_response(body: serde_json::Value) -> CompletionResponse {
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
                "function_call" => {
                    tool_calls.push(ToolCall {
                        id: item.get("call_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        call_type: "function".to_string(),
                        function: crate::khadim_ai::types::ToolFunction {
                            name: item.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                            arguments: item.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}").to_string(),
                        },
                    });
                }
                _ => {}
            }
        }
    }
    let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));
    CompletionResponse {
        content,
        tool_calls,
        usage: Usage {
            input: usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            output: usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_read: usage
                .get("input_tokens_details")
                .and_then(|v| v.get("cached_tokens"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            cache_write: 0,
        },
        reasoning_content: None,
    }
}

pub fn complete(model: &Model, context: &Context, temperature: f32, api_key: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let tools = convert_tools(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let response = reqwest::Client::new()
            .post(format!("{}/responses?api-version={}", model.base_url.trim_end_matches('/'), api_version()))
            .headers(headers(&model, &api_key))
            .json(&json!({
                "model": deployment_name(&model),
                "input": input,
                "tools": tools,
                "temperature": temperature,
                "stream": false,
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!("Khadim Azure request failed: HTTP {status} - {body}")));
        }
        Ok(parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse Azure response: {err}")))?))
    })
}

pub fn stream(model: &Model, context: &Context, temperature: f32, api_key: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let input = convert_input(context);
    let tools = convert_tools(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let response = reqwest::Client::new()
            .post(format!("{}/responses?api-version={}", model.base_url.trim_end_matches('/'), api_version()))
            .headers(headers(&model, &api_key))
            .json(&json!({
                "model": deployment_name(&model),
                "input": input,
                "tools": tools,
                "temperature": temperature,
                "stream": true,
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!("Khadim Azure streaming request failed: HTTP {status} - {body}")));
        }
        let mut content = String::new();
        let mut tool_calls = Vec::new();
        let mut usage = Usage::default();
        let mut current_tool: Option<ToolCall> = None;
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            if data == "[DONE]" { return Ok(()); }
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse Azure SSE: {err}")))?;
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
                "response.completed" => {
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
                }
                _ => {}
            }
            Ok(())
        }).await?;
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
