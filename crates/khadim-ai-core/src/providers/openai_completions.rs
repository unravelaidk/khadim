use crate::error::AppError;
use crate::providers::transform_messages::{finalize_tool_call, to_openai_messages, to_openai_tools};
use crate::streaming::for_each_sse_event;
use crate::types::{
    AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage,
};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Arc;

fn extract_reasoning_text(message: &serde_json::Value) -> Option<String> {
    ["reasoning_content", "reasoning", "reasoning_text"]
        .iter()
        .find_map(|field| {
            message
                .get(field)
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .filter(|value| !value.is_empty())
        })
}

fn extract_reasoning_delta(delta: &serde_json::Value) -> Option<String> {
    ["reasoning_content", "reasoning", "reasoning_text"]
        .iter()
        .find_map(|field| {
            delta
                .get(field)
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .filter(|value| !value.is_empty())
        })
}

fn choice_usage(payload: &serde_json::Value) -> Option<serde_json::Value> {
    payload
        .get("choices")
        .and_then(|value| value.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("usage"))
        .cloned()
}

pub fn complete(
    model: &Model,
    context: &Context,
    temperature: f32,
    api_key: &str,
) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let messages = to_openai_messages(&context.messages);
    let tools = to_openai_tools(context);
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
            "tool_choice": "auto",
            "stream": false,
        });
        if !model.reasoning {
            payload.as_object_mut().unwrap().insert("temperature".into(), json!(temperature));
        }

        let response = client
            .post(format!("{}/chat/completions", model.base_url.trim_end_matches('/')))
            .bearer_auth(api_key)
            .headers(model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
                if let (Ok(name), Ok(val)) = (
                    reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                    reqwest::header::HeaderValue::from_str(value),
                ) {
                    acc.insert(name, val);
                }
                acc
            }))
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Khadim OpenAI request failed: HTTP {status} - {body}"
            )));
        }

        let body = response.json::<serde_json::Value>().await.map_err(|err| {
            AppError::health(format!("Failed to parse OpenAI completion response: {err}"))
        })?;

        let choice = body
            .get("choices")
            .and_then(|value| value.as_array())
            .and_then(|choices| choices.first())
            .ok_or_else(|| AppError::health("OpenAI response did not include choices"))?;

        let message = choice
            .get("message")
            .ok_or_else(|| AppError::health("OpenAI response did not include a message"))?;

        let content = message
            .get("content")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();

        let reasoning_content = extract_reasoning_text(message);

        let tool_calls = serde_json::from_value::<Vec<ToolCall>>(
            message
                .get("tool_calls")
                .cloned()
                .unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
        )
        .unwrap_or_default();

        let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));

        Ok(CompletionResponse {
            content,
            tool_calls,
            usage: Usage {
                input: usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                output: usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                cache_read: usage
                    .get("prompt_tokens_details")
                    .and_then(|v| v.get("cached_tokens"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                cache_write: 0,
            },
            reasoning_content,
        })
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
    let messages = to_openai_messages(&context.messages);
    let tools = to_openai_tools(context);
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
            "tool_choice": "auto",
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        if !model.reasoning {
            payload.as_object_mut().unwrap().insert("temperature".into(), json!(temperature));
        }

        let response = client
            .post(format!("{}/chat/completions", model.base_url.trim_end_matches('/')))
            .bearer_auth(api_key)
            .headers(model.headers.iter().fold(reqwest::header::HeaderMap::new(), |mut acc, (key, value)| {
                if let (Ok(name), Ok(val)) = (
                    reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                    reqwest::header::HeaderValue::from_str(value),
                ) {
                    acc.insert(name, val);
                }
                acc
            }))
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::health(format!(
                "Khadim OpenAI streaming request failed: HTTP {status} - {body}"
            )));
        }

        let mut final_content = String::new();
        let mut final_reasoning = String::new();
        let mut tool_calls = Vec::<ToolCall>::new();
        let mut partial_tool_calls = BTreeMap::<usize, ToolCall>::new();
        let mut usage = Usage::default();
        let callback = on_event.clone();
        callback(AssistantStreamEvent::Start);

        for_each_sse_event(response, |data| {
            if data == "[DONE]" {
                return Ok(());
            }

            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| {
                AppError::health(format!("Failed to parse OpenAI streaming event: {err}"))
            })?;

            if let Some(raw_usage) = payload.get("usage").cloned().or_else(|| choice_usage(&payload)) {
                usage.input = raw_usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(usage.input);
                usage.output = raw_usage
                    .get("completion_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(usage.output);
                usage.cache_read = raw_usage
                    .get("prompt_tokens_details")
                    .and_then(|v| v.get("cached_tokens"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(usage.cache_read);
                on_event(AssistantStreamEvent::Usage(usage.clone()));
            }

            let choice = payload
                .get("choices")
                .and_then(|value| value.as_array())
                .and_then(|choices| choices.first())
                .cloned();

            if let Some(choice) = choice {
                let delta = choice.get("delta").cloned().unwrap_or_else(|| json!({}));
                if let Some(content) = delta.get("content").and_then(|value| value.as_str()) {
                    if final_content.is_empty() {
                        on_event(AssistantStreamEvent::TextStart);
                    }
                    final_content.push_str(content);
                    on_event(AssistantStreamEvent::TextDelta(content.to_string()));
                }

                // OpenAI-compatible providers emit reasoning under different fields.
                if let Some(reasoning) = extract_reasoning_delta(&delta) {
                    if final_reasoning.is_empty() {
                        on_event(AssistantStreamEvent::ThinkingStart);
                    }
                    final_reasoning.push_str(&reasoning);
                    on_event(AssistantStreamEvent::ThinkingDelta(reasoning));
                }

                if let Some(calls) = delta.get("tool_calls").and_then(|value| value.as_array()) {
                    for call in calls {
                        let index = call
                            .get("index")
                            .and_then(|value| value.as_u64())
                            .map(|value| value as usize)
                            .unwrap_or(partial_tool_calls.len());

                        let entry = partial_tool_calls.entry(index).or_insert_with(|| {
                            finalize_tool_call(String::new(), String::new(), String::new())
                        });

                        let had_id = !entry.id.is_empty();
                        if let Some(id) = call.get("id").and_then(|value| value.as_str()) {
                            if !had_id {
                                entry.id = id.to_string();
                            }
                        }

                        if let Some(name) = call
                            .get("function")
                            .and_then(|value| value.get("name"))
                            .and_then(|value| value.as_str())
                        {
                            if entry.function.name.is_empty() {
                                entry.function.name = name.to_string();
                            }
                        }

                        if !had_id && !entry.id.is_empty() {
                            on_event(AssistantStreamEvent::ToolCallStart {
                                id: entry.id.clone(),
                                name: entry.function.name.clone(),
                            });
                        }

                        if let Some(arguments) = call
                            .get("function")
                            .and_then(|value| value.get("arguments"))
                            .and_then(|value| value.as_str())
                        {
                            if !arguments.is_empty() {
                                entry.function.arguments.push_str(arguments);
                                on_event(AssistantStreamEvent::ToolCallDelta {
                                    id: entry.id.clone(),
                                    name: entry.function.name.clone(),
                                    arguments: arguments.to_string(),
                                });
                            }
                        }
                    }
                }

                if choice.get("finish_reason").and_then(|value| value.as_str()).is_some() {
                    if !final_reasoning.is_empty() {
                        on_event(AssistantStreamEvent::ThinkingEnd(final_reasoning.clone()));
                    }
                    if !final_content.is_empty() {
                        on_event(AssistantStreamEvent::TextEnd(final_content.clone()));
                    }
                    for (_, existing) in partial_tool_calls.iter() {
                        on_event(AssistantStreamEvent::ToolCallEnd(existing.clone()));
                        tool_calls.push(existing.clone());
                    }
                    partial_tool_calls.clear();
                }
            }

            Ok(())
        })
        .await?;

        on_event(AssistantStreamEvent::Done);

        Ok(CompletionResponse {
            content: final_content,
            tool_calls,
            usage,
            reasoning_content: if final_reasoning.is_empty() { None } else { Some(final_reasoning) },
        })
    })
}

#[cfg(test)]
mod tests {
    use super::{choice_usage, extract_reasoning_delta, extract_reasoning_text};
    use serde_json::json;

    #[test]
    fn extracts_reasoning_from_fallback_fields() {
        assert_eq!(
            extract_reasoning_text(&json!({ "reasoning": "step by step" })),
            Some("step by step".to_string())
        );
        assert_eq!(
            extract_reasoning_text(&json!({ "reasoning_text": "final trace" })),
            Some("final trace".to_string())
        );
        assert_eq!(
            extract_reasoning_delta(&json!({ "reasoning": "delta" })),
            Some("delta".to_string())
        );
    }

    #[test]
    fn reads_usage_from_choice_fallback() {
        assert_eq!(
            choice_usage(&json!({
                "choices": [{
                    "usage": {
                        "prompt_tokens": 12,
                        "completion_tokens": 3
                    }
                }]
            }))
            .and_then(|usage| usage.get("prompt_tokens").and_then(|value| value.as_u64())),
            Some(12)
        );
    }
}
