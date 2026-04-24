use crate::error::AppError;
use crate::providers::transform_messages::{
    finalize_tool_call, to_anthropic_messages, to_anthropic_tools,
};
use crate::providers::usage::anthropic_usage;
use crate::streaming::for_each_sse_event;
use crate::types::{
    AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage,
};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::sync::Arc;

/// Select the appropriate anthropic-version header based on the model.
/// Claude 4+ models and models with extended thinking require newer API versions.
fn select_anthropic_version(model_id: &str) -> &'static str {
    // Claude 4+ models need 2025-04-15 for extended thinking / newer features
    if model_id.contains("claude-4")
        || model_id.contains("claude-opus-4")
        || model_id.contains("claude-sonnet-4")
        || model_id.contains("claude-haiku-4")
    {
        "2025-04-15"
    } else {
        // Claude 3.x and older
        "2023-06-01"
    }
}

pub fn complete(
    model: &Model,
    context: &Context,
    temperature: f32,
    api_key: &str,
) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let (system, messages) = to_anthropic_messages(&context.messages);
    let tools = to_anthropic_tools(context);
    let api_key = api_key.to_string();

    Box::pin(async move {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|err| AppError::health(format!("Failed to build HTTP client: {err}")))?;

        let mut payload = json!({
            "model": model.id,
            "messages": messages,
            "tools": tools,
            "max_tokens": model.max_tokens.max(4096),
            "temperature": temperature,
        });
        if let Some(system) = system {
            payload["system"] = json!(system);
        }

        let api_version = select_anthropic_version(&model.id);
        let base_url = if model.base_url.trim().is_empty() {
            "https://api.anthropic.com/v1"
        } else {
            model.base_url.trim_end_matches('/')
        };

        let request = client
            .post(format!("{base_url}/messages"))
            .headers(model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
                if let (Ok(name), Ok(val)) = (
                    reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                    reqwest::header::HeaderValue::from_str(value),
                ) {
                    acc.insert(name, val);
                }
                acc
            }))
            .header("anthropic-version", api_version);

        let response = if model.provider == "anthropic" {
            // Native Anthropic API uses x-api-key header
            request
                .header("x-api-key", api_key)
                .json(&payload)
                .send()
                .await?
        } else {
            // Third-party providers (opencode, kimi-coding, minimax, etc.)
            // use Bearer token authentication
            request
                .bearer_auth(api_key)
                .json(&payload)
                .send()
                .await?
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Khadim Anthropic request failed: HTTP {status} (url: {base_url}/messages) - {body}"
            )));
        }

        let body = response.json::<serde_json::Value>().await.map_err(|err| {
            AppError::health(format!("Failed to parse Anthropic completion response: {err}"))
        })?;

        let mut content = String::new();
        let mut tool_calls = Vec::new();
        if let Some(blocks) = body.get("content").and_then(|value| value.as_array()) {
            for block in blocks {
                match block.get("type").and_then(|value| value.as_str()) {
                    Some("text") => {
                        if let Some(text) = block.get("text").and_then(|value| value.as_str()) {
                            content.push_str(text);
                        }
                    }
                    Some("tool_use") => {
                        tool_calls.push(ToolCall {
                            id: block.get("id").and_then(|value| value.as_str()).unwrap_or_default().to_string(),
                            call_type: "function".to_string(),
                            function: crate::types::ToolFunction {
                                name: block.get("name").and_then(|value| value.as_str()).unwrap_or_default().to_string(),
                                arguments: serde_json::to_string(
                                    &block.get("input").cloned().unwrap_or_else(|| json!({})),
                                )
                                .unwrap_or_else(|_| "{}".to_string()),
                            },
                        });
                    }
                    _ => {}
                }
            }
        }

        let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));

        Ok(CompletionResponse { content, tool_calls, usage: anthropic_usage(&usage), reasoning_content: None })
    })
}

pub fn stream(
    model: &Model,
    context: &Context,
    temperature: f32,
    api_key: &str,
    on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let (system, messages) = to_anthropic_messages(&context.messages);
    let tools = to_anthropic_tools(context);
    let api_key = api_key.to_string();

    Box::pin(async move {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|err| AppError::health(format!("Failed to build HTTP client: {err}")))?;

        let mut payload = json!({
            "model": model.id,
            "messages": messages,
            "tools": tools,
            "max_tokens": model.max_tokens.max(4096),
            "temperature": temperature,
            "stream": true,
        });
        if let Some(system) = system {
            payload["system"] = json!(system);
        }

        let api_version = select_anthropic_version(&model.id);
        let base_url = if model.base_url.trim().is_empty() {
            "https://api.anthropic.com/v1"
        } else {
            model.base_url.trim_end_matches('/')
        };

        let request = client
            .post(format!("{base_url}/messages"))
            .headers(model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
                if let (Ok(name), Ok(val)) = (
                    reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                    reqwest::header::HeaderValue::from_str(value),
                ) {
                    acc.insert(name, val);
                }
                acc
            }))
            .header("anthropic-version", api_version);

        let response = if model.provider == "anthropic" {
            // Native Anthropic API uses x-api-key header
            request
                .header("x-api-key", api_key)
                .json(&payload)
                .send()
                .await?
        } else {
            // Third-party providers (opencode, kimi-coding, minimax, etc.)
            // use Bearer token authentication
            request
                .bearer_auth(api_key)
                .json(&payload)
                .send()
                .await?
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Khadim Anthropic streaming request failed: HTTP {status} (url: {base_url}/messages) - {body}"
            )));
        }

        let mut final_content = String::new();
        let mut tool_calls = Vec::<ToolCall>::new();
        let mut current_tool: Option<ToolCall> = None;
        let mut usage = Usage::default();
        on_event(AssistantStreamEvent::Start);

        for_each_sse_event(response, |data| {
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| {
                AppError::health(format!("Failed to parse Anthropic streaming event: {err}"))
            })?;

            match payload.get("type").and_then(|value| value.as_str()).unwrap_or_default() {
                "message_start" => {
                    if let Some(raw_usage) = payload.get("message").and_then(|v| v.get("usage")) {
                        usage = anthropic_usage(raw_usage);
                        on_event(AssistantStreamEvent::Usage(usage.clone()));
                    }
                }
                "content_block_start" => {
                    let index = payload.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                    let block = payload.get("content_block").cloned().unwrap_or_else(|| json!({}));
                    match block.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                        "text" => on_event(AssistantStreamEvent::TextStart),
                        "thinking" => on_event(AssistantStreamEvent::ThinkingStart),
                        "tool_use" => {
                            let id = block.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                            let name = block.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                            current_tool = Some(finalize_tool_call(id.clone(), name.clone(), String::new()));
                            let _ = index;
                            on_event(AssistantStreamEvent::ToolCallStart { id, name });
                        }
                        _ => {}
                    }
                }
                "content_block_delta" => {
                    let delta = payload.get("delta").cloned().unwrap_or_else(|| json!({}));
                    match delta.get("type").and_then(|v| v.as_str()).unwrap_or_default() {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                                final_content.push_str(text);
                                on_event(AssistantStreamEvent::TextDelta(text.to_string()));
                            }
                        }
                        "thinking_delta" => {
                            if let Some(thinking) = delta.get("thinking").and_then(|v| v.as_str()) {
                                on_event(AssistantStreamEvent::ThinkingDelta(thinking.to_string()));
                            }
                        }
                        "input_json_delta" => {
                            if let Some(partial_json) = delta.get("partial_json").and_then(|v| v.as_str()) {
                                if let Some(current) = current_tool.as_mut() {
                                    current.function.arguments.push_str(partial_json);
                                    on_event(AssistantStreamEvent::ToolCallDelta {
                                        id: current.id.clone(),
                                        name: current.function.name.clone(),
                                        arguments: partial_json.to_string(),
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                }
                "content_block_stop" => {
                    if let Some(current) = current_tool.take() {
                        on_event(AssistantStreamEvent::ToolCallEnd(current.clone()));
                        tool_calls.push(current);
                    } else if !final_content.is_empty() {
                        on_event(AssistantStreamEvent::TextEnd(final_content.clone()));
                    }
                }
                "message_delta" => {
                    if let Some(raw_usage) = payload.get("usage") {
                        usage = anthropic_usage(raw_usage);
                        on_event(AssistantStreamEvent::Usage(usage.clone()));
                    }
                }
                "message_stop" => {
                    on_event(AssistantStreamEvent::Done);
                }
                _ => {}
            }

            Ok(())
        })
        .await?;

        Ok(CompletionResponse {
            content: final_content,
            tool_calls,
            usage,
            reasoning_content: None,
        })
    })
}
