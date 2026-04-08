use crate::khadim_ai::types::{ChatMessage, Context, ToolCall};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn normalize_tool_call_id(id: &str, max_len: usize) -> String {
    let normalized = id.replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-',
        "_",
    );
    normalized.chars().take(max_len).collect()
}

pub fn to_openai_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut converted = Vec::new();
    let mut tool_call_id_map = HashMap::<String, String>::new();
    let mut pending_tool_calls = Vec::<String>::new();
    let mut existing_tool_results = HashSet::<String>::new();

    for message in messages {
        match message {
            ChatMessage::System { content } => {
                flush_orphaned_tool_results(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();
                converted.push(json!({ "role": "system", "content": content }));
            }
            ChatMessage::User { content } => {
                flush_orphaned_tool_results(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();
                converted.push(json!({ "role": "user", "content": content }));
            }
            ChatMessage::Assistant {
                content,
                tool_calls,
                reasoning_content,
            } => {
                flush_orphaned_tool_results(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();

                let normalized_tool_calls = tool_calls
                    .iter()
                    .cloned()
                    .map(|mut tool_call| {
                        let normalized_id = normalize_tool_call_id(&tool_call.id, 64);
                        tool_call_id_map.insert(tool_call.id.clone(), normalized_id.clone());
                        tool_call.id = normalized_id;
                        tool_call
                    })
                    .collect::<Vec<_>>();

                let assistant_content = content.clone().unwrap_or_default();
                if assistant_content.trim().is_empty() && normalized_tool_calls.is_empty() {
                    continue;
                }

                let mut value = json!({
                    "role": "assistant",
                    "content": assistant_content,
                });
                if !normalized_tool_calls.is_empty() {
                    pending_tool_calls = normalized_tool_calls
                        .iter()
                        .map(|tool_call| tool_call.id.clone())
                        .collect();
                    value["tool_calls"] =
                        serde_json::to_value(&normalized_tool_calls).unwrap_or_else(|_| json!([]));
                }
                // Some OpenAI-compatible reasoning providers require reasoning_content to be
                // present on assistant tool-call messages, even when the model did not emit a
                // separate reasoning stream for that turn.
                if let Some(reasoning) = reasoning_content {
                    value["reasoning_content"] = json!(reasoning);
                } else if !normalized_tool_calls.is_empty() {
                    value["reasoning_content"] = json!("");
                }
                converted.push(value);
            }
            ChatMessage::Tool(tool) => {
                let normalized_id = tool_call_id_map
                    .get(&tool.tool_call_id)
                    .cloned()
                    .unwrap_or_else(|| normalize_tool_call_id(&tool.tool_call_id, 64));
                existing_tool_results.insert(normalized_id.clone());
                converted.push(json!({
                    "role": "tool",
                    "content": tool.content,
                    "tool_call_id": normalized_id,
                }));
            }
        }
    }

    converted
}

fn flush_orphaned_tool_results(
    converted: &mut Vec<Value>,
    pending_tool_calls: &[String],
    existing_tool_results: &HashSet<String>,
) {
    for tool_call_id in pending_tool_calls {
        if existing_tool_results.contains(tool_call_id) {
            continue;
        }
        converted.push(json!({
            "role": "tool",
            "content": "No result provided",
            "tool_call_id": tool_call_id,
        }));
    }
}

pub fn to_openai_responses_input(messages: &[ChatMessage], include_system: bool) -> Vec<Value> {
    let mut converted = Vec::new();
    let mut tool_call_id_map = HashMap::<String, String>::new();
    let mut pending_tool_calls = Vec::<String>::new();
    let mut existing_tool_results = HashSet::<String>::new();

    let flush_orphaned_response_outputs = |
        converted: &mut Vec<Value>,
        pending_tool_calls: &[String],
        existing_tool_results: &HashSet<String>,
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

    for message in messages {
        match message {
            ChatMessage::System { content } => {
                flush_orphaned_response_outputs(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();
                if include_system {
                    converted.push(json!({ "role": "system", "content": content }));
                }
            }
            ChatMessage::User { content } => {
                flush_orphaned_response_outputs(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();
                converted.push(json!({ "role": "user", "content": content }));
            }
            ChatMessage::Assistant {
                content,
                tool_calls,
                reasoning_content: _,
            } => {
                flush_orphaned_response_outputs(
                    &mut converted,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();

                let normalized_tool_calls = tool_calls
                    .iter()
                    .cloned()
                    .map(|mut tool_call| {
                        let normalized_id = normalize_tool_call_id(&tool_call.id, 64);
                        tool_call_id_map.insert(tool_call.id.clone(), normalized_id.clone());
                        tool_call.id = normalized_id;
                        tool_call
                    })
                    .collect::<Vec<_>>();

                let mut blocks = Vec::new();
                if let Some(content) = content {
                    if !content.trim().is_empty() {
                        blocks.push(json!({ "type": "output_text", "text": content }));
                    }
                }
                for call in &normalized_tool_calls {
                    blocks.push(json!({
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    }));
                }

                if blocks.is_empty() {
                    continue;
                }

                if !normalized_tool_calls.is_empty() {
                    pending_tool_calls = normalized_tool_calls
                        .iter()
                        .map(|tool_call| tool_call.id.clone())
                        .collect();
                }

                converted.push(json!({ "role": "assistant", "content": blocks }));
            }
            ChatMessage::Tool(tool) => {
                let normalized_id = tool_call_id_map
                    .get(&tool.tool_call_id)
                    .cloned()
                    .unwrap_or_else(|| normalize_tool_call_id(&tool.tool_call_id, 64));
                existing_tool_results.insert(normalized_id.clone());
                converted.push(json!({
                    "type": "function_call_output",
                    "call_id": normalized_id,
                    "output": tool.content,
                }));
            }
        }
    }

    converted
}

pub fn to_openai_tools(context: &Context) -> Vec<serde_json::Value> {
    context
        .tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            })
        })
        .collect()
}

pub fn to_anthropic_messages(messages: &[ChatMessage]) -> (Option<String>, Vec<serde_json::Value>) {
    let mut system = None;
    let mut converted = Vec::new();

    for message in messages {
        match message {
            ChatMessage::System { content } => {
                if system.is_none() {
                    system = Some(content.clone());
                }
            }
            ChatMessage::User { content } => converted.push(json!({
                "role": "user",
                "content": [{"type": "text", "text": content}],
            })),
            ChatMessage::Assistant {
                content,
                tool_calls,
                reasoning_content: _,
            } => {
                let mut blocks = Vec::new();
                if let Some(content) = content {
                    if !content.trim().is_empty() {
                        blocks.push(json!({"type": "text", "text": content}));
                    }
                }
                for tool in tool_calls {
                    let input = serde_json::from_str::<serde_json::Value>(&tool.function.arguments)
                        .unwrap_or_else(|_| json!({}));
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": normalize_tool_call_id(&tool.id, 64),
                        "name": tool.function.name,
                        "input": input,
                    }));
                }
                if !blocks.is_empty() {
                    converted.push(json!({"role": "assistant", "content": blocks}));
                }
            }
            ChatMessage::Tool(tool) => converted.push(json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": normalize_tool_call_id(&tool.tool_call_id, 64),
                    "content": tool.content,
                }],
            })),
        }
    }

    (system, converted)
}

pub fn to_anthropic_tools(context: &Context) -> Vec<serde_json::Value> {
    context
        .tools
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.parameters,
            })
        })
        .collect()
}

pub fn finalize_tool_call(id: String, name: String, arguments: String) -> ToolCall {
    ToolCall {
        id,
        call_type: "function".to_string(),
        function: crate::khadim_ai::types::ToolFunction { name, arguments },
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_tool_call_id, to_openai_messages, to_openai_responses_input};
    use crate::khadim_ai::types::{ChatMessage, ToolCall, ToolFunction, ToolMessage};

    #[test]
    fn assistant_tool_calls_include_empty_reasoning_content() {
        let messages = vec![ChatMessage::Assistant {
            content: None,
            tool_calls: vec![ToolCall {
                id: "call_123".to_string(),
                call_type: "function".to_string(),
                function: ToolFunction {
                    name: "read_file".to_string(),
                    arguments: "{}".to_string(),
                },
            }],
            reasoning_content: None,
        }];

        let converted = to_openai_messages(&messages);
        let assistant = &converted[0];

        assert_eq!(
            assistant.get("role").and_then(|value| value.as_str()),
            Some("assistant")
        );
        assert_eq!(
            assistant
                .get("reasoning_content")
                .and_then(|value| value.as_str()),
            Some("")
        );
        assert!(assistant
            .get("tool_calls")
            .and_then(|value| value.as_array())
            .is_some());
    }

    #[test]
    fn assistant_and_tool_result_ids_are_normalized_together() {
        let original_id = "call|abc+/=";
        let messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: original_id.to_string(),
                    call_type: "function".to_string(),
                    function: ToolFunction {
                        name: "read_file".to_string(),
                        arguments: "{}".to_string(),
                    },
                }],
                reasoning_content: None,
            },
            ChatMessage::Tool(ToolMessage {
                content: "ok".to_string(),
                tool_call_id: original_id.to_string(),
            }),
        ];

        let converted = to_openai_messages(&messages);
        let expected_id = normalize_tool_call_id(original_id, 64);

        assert_eq!(
            converted[0]
                .get("tool_calls")
                .and_then(|value| value.as_array())
                .and_then(|calls| calls.first())
                .and_then(|call| call.get("id"))
                .and_then(|value| value.as_str()),
            Some(expected_id.as_str())
        );
        assert_eq!(
            converted[1]
                .get("tool_call_id")
                .and_then(|value| value.as_str()),
            Some(expected_id.as_str())
        );
    }

    #[test]
    fn inserts_synthetic_tool_result_for_orphaned_call() {
        let messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: "call_123".to_string(),
                    call_type: "function".to_string(),
                    function: ToolFunction {
                        name: "read_file".to_string(),
                        arguments: "{}".to_string(),
                    },
                }],
                reasoning_content: Some("thought".to_string()),
            },
            ChatMessage::User {
                content: "continue".to_string(),
            },
        ];

        let converted = to_openai_messages(&messages);

        assert_eq!(converted.len(), 3);
        assert_eq!(
            converted[1].get("role").and_then(|value| value.as_str()),
            Some("tool")
        );
        assert_eq!(
            converted[1].get("content").and_then(|value| value.as_str()),
            Some("No result provided")
        );
        assert_eq!(
            converted[2].get("role").and_then(|value| value.as_str()),
            Some("user")
        );
    }

    #[test]
    fn skips_empty_assistant_messages_without_tool_calls() {
        let messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: Vec::new(),
                reasoning_content: None,
            },
            ChatMessage::User {
                content: "hello".to_string(),
            },
        ];

        let converted = to_openai_messages(&messages);

        assert_eq!(converted.len(), 1);
        assert_eq!(
            converted[0].get("role").and_then(|value| value.as_str()),
            Some("user")
        );
    }

    #[test]
    fn responses_input_normalizes_tool_call_ids_and_tool_outputs_together() {
        let original_id = "call:with spaces/and?symbols";
        let expected_id = normalize_tool_call_id(original_id, 64);
        let messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: original_id.to_string(),
                    call_type: "function".to_string(),
                    function: ToolFunction {
                        name: "read_file".to_string(),
                        arguments: "{}".to_string(),
                    },
                }],
                reasoning_content: None,
            },
            ChatMessage::Tool(ToolMessage {
                content: "ok".to_string(),
                tool_call_id: original_id.to_string(),
            }),
        ];

        let converted = to_openai_responses_input(&messages, true);
        assert_eq!(
            converted[0]
                .get("content")
                .and_then(|value| value.as_array())
                .and_then(|parts| parts.first())
                .and_then(|part| part.get("call_id"))
                .and_then(|value| value.as_str()),
            Some(expected_id.as_str())
        );
        assert_eq!(
            converted[1].get("call_id").and_then(|value| value.as_str()),
            Some(expected_id.as_str())
        );
    }

    #[test]
    fn responses_input_flushes_missing_tool_outputs() {
        let messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: "call_123".to_string(),
                    call_type: "function".to_string(),
                    function: ToolFunction {
                        name: "read_file".to_string(),
                        arguments: "{}".to_string(),
                    },
                }],
                reasoning_content: None,
            },
            ChatMessage::User {
                content: "continue".to_string(),
            },
        ];

        let converted = to_openai_responses_input(&messages, true);

        assert_eq!(converted.len(), 3);
        assert_eq!(
            converted[1].get("type").and_then(|value| value.as_str()),
            Some("function_call_output")
        );
        assert_eq!(
            converted[1].get("call_id").and_then(|value| value.as_str()),
            Some("call_123")
        );
        assert_eq!(
            converted[1].get("output").and_then(|value| value.as_str()),
            Some("No result provided")
        );
    }
}
