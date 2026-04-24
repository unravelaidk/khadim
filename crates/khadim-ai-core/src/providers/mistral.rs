use crate::error::AppError;
use crate::providers::transform_messages::{finalize_tool_call, to_openai_messages, to_openai_tools};
use crate::providers::usage::simple_usage;
use crate::streaming::for_each_sse_event;
use crate::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::sync::Arc;

fn headers(model: &Model) -> reqwest::header::HeaderMap {
    model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_str(value),
        ) {
            acc.insert(name, val);
        }
        acc
    })
}

fn parse_response(body: serde_json::Value) -> Result<CompletionResponse, AppError> {
    let choice = body
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|v| v.first())
        .ok_or_else(|| AppError::health("Mistral response did not include choices"))?;
    let message = choice
        .get("message")
        .ok_or_else(|| AppError::health("Mistral response missing message"))?;
    let content = message.get("content").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let tool_calls = serde_json::from_value::<Vec<ToolCall>>(
        message.get("tool_calls").cloned().unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
    )
    .unwrap_or_default();
    let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));
    Ok(CompletionResponse {
        content,
        tool_calls,
        usage: simple_usage(
            usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        ),
        reasoning_content: None,
    })
}

pub fn complete(model: &Model, context: &Context, temperature: f32, api_key: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let messages = to_openai_messages(&context.messages);
    let tools = to_openai_tools(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let response = reqwest::Client::new()
            .post(format!("{}/chat/completions", model.base_url.trim_end_matches('/')))
            .bearer_auth(api_key)
            .headers(headers(&model))
            .json(&json!({
                "model": model.id,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "temperature": temperature,
                "stream": false,
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!("Khadim Mistral request failed: HTTP {status} - {body}")));
        }
        parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse Mistral completion response: {err}")))?)
    })
}

pub fn stream(model: &Model, context: &Context, temperature: f32, api_key: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let messages = to_openai_messages(&context.messages);
    let tools = to_openai_tools(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let response = reqwest::Client::new()
            .post(format!("{}/chat/completions", model.base_url.trim_end_matches('/')))
            .bearer_auth(api_key)
            .headers(headers(&model))
            .json(&json!({
                "model": model.id,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "temperature": temperature,
                "stream": true,
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!("Khadim Mistral streaming request failed: HTTP {status} - {body}")));
        }
        let mut content = String::new();
        let mut usage = Usage::default();
        let mut current_tool: Option<ToolCall> = None;
        let mut tool_calls = Vec::new();
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            if data == "[DONE]" { return Ok(()); }
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse Mistral stream event: {err}")))?;
            if let Some(choice) = payload.get("choices").and_then(|v| v.as_array()).and_then(|v| v.first()) {
                let delta = choice.get("delta").cloned().unwrap_or_else(|| json!({}));
                if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
                    if content.is_empty() { on_event(AssistantStreamEvent::TextStart); }
                    content.push_str(text);
                    on_event(AssistantStreamEvent::TextDelta(text.to_string()));
                }
                if let Some(calls) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                    for call in calls {
                        if let Some(id) = call.get("id").and_then(|v| v.as_str()) {
                            if let Some(existing) = current_tool.take() {
                                on_event(AssistantStreamEvent::ToolCallEnd(existing.clone()));
                                tool_calls.push(existing);
                            }
                            let name = call.get("function").and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or_default();
                            current_tool = Some(finalize_tool_call(id.to_string(), name.to_string(), String::new()));
                            on_event(AssistantStreamEvent::ToolCallStart { id: id.to_string(), name: name.to_string() });
                        }
                        if let Some(arguments) = call.get("function").and_then(|v| v.get("arguments")).and_then(|v| v.as_str()) {
                            if let Some(current) = current_tool.as_mut() {
                                current.function.arguments.push_str(arguments);
                                on_event(AssistantStreamEvent::ToolCallDelta { id: current.id.clone(), name: current.function.name.clone(), arguments: arguments.to_string() });
                            }
                        }
                    }
                }
                if choice.get("finish_reason").and_then(|v| v.as_str()).is_some() {
                    if !content.is_empty() { on_event(AssistantStreamEvent::TextEnd(content.clone())); }
                    if let Some(existing) = current_tool.take() {
                        on_event(AssistantStreamEvent::ToolCallEnd(existing.clone()));
                        tool_calls.push(existing);
                    }
                }
            }
            if let Some(raw_usage) = payload.get("usage") {
                usage.input = raw_usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.input);
                usage.output = raw_usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.output);
                on_event(AssistantStreamEvent::Usage(usage.clone()));
            }
            Ok(())
        }).await?;
        on_event(AssistantStreamEvent::Done);
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
