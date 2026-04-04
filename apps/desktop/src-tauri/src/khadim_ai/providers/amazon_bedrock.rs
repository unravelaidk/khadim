use crate::error::AppError;
use crate::khadim_ai::env_api_keys::is_authenticated_placeholder;
use crate::khadim_ai::streaming::for_each_sse_event;
use crate::khadim_ai::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ToolCall, Usage};
use futures_util::future::BoxFuture;
use serde_json::json;
use std::sync::Arc;

fn bearer_token(api_key: &str) -> Result<&str, AppError> {
    if api_key.is_empty() {
        Err(AppError::invalid_input("Amazon Bedrock in Khadim currently requires AWS_BEARER_TOKEN_BEDROCK or KHADIM_API_KEY"))
    } else if is_authenticated_placeholder(api_key) {
        Err(AppError::invalid_input(
            "Amazon Bedrock credentials were detected from AWS profile or IAM environment, but Khadim's native provider cannot execute that auth path in this build environment",
        ))
    } else {
        Ok(api_key)
    }
}

fn endpoint(model: &Model, stream: bool) -> String {
    format!("{}/model/{}/{}", model.base_url.trim_end_matches('/'), model.id, if stream { "converse-stream" } else { "converse" })
}

fn convert_messages(context: &Context) -> Vec<serde_json::Value> {
    let mut result = Vec::new();
    for message in &context.messages {
        match message {
            crate::khadim_ai::types::ChatMessage::System { .. } => {}
            crate::khadim_ai::types::ChatMessage::User { content } => result.push(json!({"role":"user","content":[{"text":content}]})),
            crate::khadim_ai::types::ChatMessage::Assistant { content, tool_calls, .. } => {
                let mut blocks = Vec::new();
                if let Some(content) = content { if !content.is_empty() { blocks.push(json!({"text":content})); } }
                for tool in tool_calls {
                    let args = serde_json::from_str::<serde_json::Value>(&tool.function.arguments).unwrap_or_else(|_| json!({}));
                    blocks.push(json!({"toolUse":{"toolUseId":tool.id,"name":tool.function.name,"input":args}}));
                }
                if !blocks.is_empty() { result.push(json!({"role":"assistant","content":blocks})); }
            }
            crate::khadim_ai::types::ChatMessage::Tool(tool) => result.push(json!({
                "role":"user",
                "content":[{"toolResult":{"toolUseId":tool.tool_call_id,"content":[{"text":tool.content}],"status":"success"}}]
            })),
        }
    }
    result
}

fn convert_tools(context: &Context) -> Option<serde_json::Value> {
    if context.tools.is_empty() { return None; }
    Some(json!({
        "tools": context.tools.iter().map(|tool| json!({
            "toolSpec": {"name": tool.name, "description": tool.description, "inputSchema": {"json": tool.parameters}}
        })).collect::<Vec<_>>()
    }))
}

fn system_prompt(context: &Context) -> Option<Vec<serde_json::Value>> {
    let text = context.messages.iter().filter_map(|message| match message {
        crate::khadim_ai::types::ChatMessage::System { content } => Some(content.as_str()),
        _ => None,
    }).collect::<Vec<_>>().join("\n\n");
    if text.is_empty() { None } else { Some(vec![json!({"text": text})]) }
}

fn parse_converse_output(body: serde_json::Value) -> CompletionResponse {
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    let blocks = body.get("output").and_then(|v| v.get("message")).and_then(|v| v.get("content")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    for block in blocks {
        if let Some(text) = block.get("text").and_then(|v| v.as_str()) { content.push_str(text); }
        if let Some(tool_use) = block.get("toolUse") {
            tool_calls.push(ToolCall {
                id: tool_use.get("toolUseId").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                call_type: "function".to_string(),
                function: crate::khadim_ai::types::ToolFunction {
                    name: tool_use.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    arguments: serde_json::to_string(&tool_use.get("input").cloned().unwrap_or_else(|| json!({}))).unwrap_or_else(|_| "{}".to_string()),
                },
            });
        }
    }
    let usage = body.get("usage").cloned().unwrap_or_else(|| json!({}));
    CompletionResponse {
        content,
        tool_calls,
        usage: Usage {
            input: usage.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            output: usage.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_read: usage.get("cacheReadInputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_write: usage.get("cacheWriteInputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
        },
        reasoning_content: None,
    }
}

pub fn complete(model: &Model, context: &Context, temperature: f32, api_key: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let messages = convert_messages(context);
    let tools = convert_tools(context);
    let system = system_prompt(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let token = bearer_token(&api_key)?;
        let mut payload = json!({"messages": messages, "inferenceConfig": {"temperature": temperature, "maxTokens": model.max_tokens}});
        if let Some(system) = system { payload["system"] = json!(system); }
        if let Some(tools) = tools { payload["toolConfig"] = tools; }
        let response = reqwest::Client::new().post(endpoint(&model, false)).bearer_auth(token).json(&payload).send().await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim Bedrock request failed: HTTP {status} - {body}"))); }
        Ok(parse_converse_output(response.json().await.map_err(|err| AppError::health(format!("Failed to parse Bedrock response: {err}")))?))
    })
}

pub fn stream(model: &Model, context: &Context, temperature: f32, api_key: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    let model = model.clone();
    let messages = convert_messages(context);
    let tools = convert_tools(context);
    let system = system_prompt(context);
    let api_key = api_key.to_string();
    Box::pin(async move {
        let token = bearer_token(&api_key)?;
        let mut payload = json!({"messages": messages, "inferenceConfig": {"temperature": temperature, "maxTokens": model.max_tokens}});
        if let Some(system) = system { payload["system"] = json!(system); }
        if let Some(tools) = tools { payload["toolConfig"] = tools; }
        let response = reqwest::Client::new().post(endpoint(&model, true)).bearer_auth(token).json(&payload).send().await?;
        if !response.status().is_success() { let status=response.status(); let body=response.text().await.unwrap_or_default(); return Err(AppError::health(format!("Khadim Bedrock streaming request failed: HTTP {status} - {body}"))); }
        let mut content = String::new();
        let mut usage = Usage::default();
        let tool_calls = Vec::new();
        on_event(AssistantStreamEvent::Start);
        for_each_sse_event(response, |data| {
            let payload = serde_json::from_str::<serde_json::Value>(&data).map_err(|err| AppError::health(format!("Failed to parse Bedrock event: {err}")))?;
            if let Some(text) = payload.get("contentBlockDelta").and_then(|v| v.get("delta")).and_then(|v| v.get("text")).and_then(|v| v.as_str()) {
                if content.is_empty() { on_event(AssistantStreamEvent::TextStart); }
                content.push_str(text);
                on_event(AssistantStreamEvent::TextDelta(text.to_string()));
            }
            if let Some(meta) = payload.get("metadata").and_then(|v| v.get("usage")) {
                usage.input = meta.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(usage.input);
                usage.output = meta.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(usage.output);
                usage.cache_read = meta.get("cacheReadInputTokens").and_then(|v| v.as_u64()).unwrap_or(usage.cache_read);
                usage.cache_write = meta.get("cacheWriteInputTokens").and_then(|v| v.as_u64()).unwrap_or(usage.cache_write);
                on_event(AssistantStreamEvent::Usage(usage.clone()));
            }
            Ok(())
        }).await?;
        if !content.is_empty() { on_event(AssistantStreamEvent::TextEnd(content.clone())); }
        on_event(AssistantStreamEvent::Done);
        Ok(CompletionResponse { content, tool_calls, usage, reasoning_content: None })
    })
}
