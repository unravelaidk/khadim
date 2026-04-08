use crate::error::AppError;
use crate::khadim_ai::streaming::for_each_sse_event;
use crate::khadim_ai::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::sync::Arc;

fn convert_contents(context: &Context) -> Vec<serde_json::Value> {
    context.messages.iter().filter_map(|message| match message {
        crate::khadim_ai::types::ChatMessage::System { .. } => None,
        crate::khadim_ai::types::ChatMessage::User { content } => Some(json!({"role":"user","parts":[{"text":content}]})),
        crate::khadim_ai::types::ChatMessage::Assistant { content, tool_calls, .. } => {
            let mut parts = Vec::new();
            if let Some(content) = content { if !content.is_empty() { parts.push(json!({"text":content})); } }
            for tool in tool_calls {
                let args = serde_json::from_str::<serde_json::Value>(&tool.function.arguments).unwrap_or_else(|_| json!({}));
                parts.push(json!({"functionCall":{"name":tool.function.name,"args":args}}));
            }
            Some(json!({"role":"model","parts":parts}))
        }
        crate::khadim_ai::types::ChatMessage::Tool(tool) => Some(json!({
            "role":"user",
            "parts":[{"functionResponse":{"name":tool.tool_call_id,"response":{"content":tool.content}}}],
        })),
    }).collect()
}

fn convert_tools(context: &Context) -> Option<Vec<serde_json::Value>> {
    if context.tools.is_empty() { return None; }
    Some(vec![json!({
        "functionDeclarations": context.tools.iter().map(|tool| json!({
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        })).collect::<Vec<_>>()
    })])
}

fn system_instruction(context: &Context) -> Option<serde_json::Value> {
    let text = context.messages.iter().filter_map(|message| match message {
        crate::khadim_ai::types::ChatMessage::System { content } => Some(content.as_str()),
        _ => None,
    }).collect::<Vec<_>>().join("\n\n");
    if text.is_empty() { None } else { Some(json!({"parts":[{"text":text}]})) }
}

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
    let candidate = body.get("candidates").and_then(|v| v.as_array()).and_then(|v| v.first()).ok_or_else(|| AppError::health("Google response missing candidates"))?;
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    if let Some(parts) = candidate.get("content").and_then(|v| v.get("parts")).and_then(|v| v.as_array()) {
        for part in parts {
            if let Some(text) = part.get("text").and_then(|v| v.as_str()) { content.push_str(text); }
            if let Some(call) = part.get("functionCall") {
                tool_calls.push(ToolCall {
                    id: call.get("id").and_then(|v| v.as_str()).unwrap_or_else(|| call.get("name").and_then(|v| v.as_str()).unwrap_or_default()).to_string(),
                    call_type: "function".to_string(),
                    function: crate::khadim_ai::types::ToolFunction {
                        name: call.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        arguments: serde_json::to_string(&call.get("args").cloned().unwrap_or_else(|| json!({}))).unwrap_or_else(|_| "{}".to_string()),
                    },
                });
            }
        }
    }
    let usage = body.get("usageMetadata").cloned().unwrap_or_else(|| json!({}));
    Ok(CompletionResponse {
        content,
        tool_calls,
        usage: Usage {
            input: usage.get("promptTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
            output: usage.get("candidatesTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_read: usage.get("cachedContentTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_write: 0,
        },
        reasoning_content: None,
    })
}

pub fn complete(model: &Model, context: &Context, temperature: f32, api_key: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let contents = convert_contents(context);
    let tools = convert_tools(context);
    let system = system_instruction(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let mut payload = json!({"contents": contents, "generationConfig": {"temperature": temperature}});
        if let Some(system) = system { payload["systemInstruction"] = system; }
        if let Some(tools) = tools { payload["tools"] = json!(tools); }
        let response = reqwest::Client::new()
            .post(format!("{}/models/{}:generateContent?key={}", model.base_url.trim_end_matches('/'), model.id, api_key))
            .headers(headers(&model))
            .json(&payload)
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim Google request failed: HTTP {status} - {body}"))); }
        parse_response(response.json().await.map_err(|err| AppError::health(format!("Failed to parse Google response: {err}")))?)
    })
}

pub fn stream(model: &Model, context: &Context, temperature: f32, api_key: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let contents = convert_contents(context);
    let tools = convert_tools(context);
    let system = system_instruction(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let mut payload = json!({"contents": contents, "generationConfig": {"temperature": temperature}});
        if let Some(system) = system { payload["systemInstruction"] = system; }
        if let Some(tools) = tools { payload["tools"] = json!(tools); }
        let response = reqwest::Client::new()
            .post(format!("{}/models/{}:streamGenerateContent?alt=sse&key={}", model.base_url.trim_end_matches('/'), model.id, api_key))
            .headers(headers(&model))
            .json(&payload)
            .send()
            .await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim Google streaming request failed: HTTP {status} - {body}"))); }
        let mut content = String::new();
        let mut tool_calls = Vec::new();
        let mut usage = Usage::default();
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            let parsed = parse_response(serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse Google SSE: {err}")))?)?;
            if !parsed.content.is_empty() {
                if content.is_empty() { on_event(AssistantStreamEvent::TextStart); }
                let delta = parsed.content.strip_prefix(&content).unwrap_or(&parsed.content).to_string();
                if !delta.is_empty() {
                    content.push_str(&delta);
                    on_event(AssistantStreamEvent::TextDelta(delta));
                }
            }
            for tool in parsed.tool_calls {
                on_event(AssistantStreamEvent::ToolCallStart { id: tool.id.clone(), name: tool.function.name.clone() });
                on_event(AssistantStreamEvent::ToolCallDelta { id: tool.id.clone(), name: tool.function.name.clone(), arguments: tool.function.arguments.clone() });
                on_event(AssistantStreamEvent::ToolCallEnd(tool.clone()));
                tool_calls.push(tool);
            }
            usage = parsed.usage;
            on_event(AssistantStreamEvent::Usage(usage.clone()));
            Ok(())
        }).await?;
        if !content.is_empty() { on_event(AssistantStreamEvent::TextEnd(content.clone())); }
        on_event(AssistantStreamEvent::Done);
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
