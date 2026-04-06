use crate::error::AppError;
use crate::khadim_agent::modes::{build_mode, chat_mode};
use crate::khadim_agent::session::KhadimSession;
use crate::khadim_ai::types::{
    AssistantStreamEvent, ChatMessage, Context, ModelSelection, ToolDefinition, ToolMessage,
};
use crate::khadim_ai::ModelClient;
use crate::khadim_code::AgentRuntime;
use crate::khadim_code::tools::Tool;
use crate::opencode::AgentStreamEvent;
use crate::plugins::PluginManager;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;

fn flush_missing_tool_results(
    repaired: &mut Vec<ChatMessage>,
    pending_tool_calls: &[String],
    existing_tool_results: &HashSet<String>,
) {
    for tool_call_id in pending_tool_calls {
        if existing_tool_results.contains(tool_call_id) {
            continue;
        }
        repaired.push(ChatMessage::Tool(ToolMessage {
            content: "No result provided".to_string(),
            tool_call_id: tool_call_id.clone(),
        }));
    }
}

fn repair_session_messages(messages: &mut Vec<ChatMessage>) {
    let mut repaired = Vec::with_capacity(messages.len());
    let mut pending_tool_calls = Vec::<String>::new();
    let mut existing_tool_results = HashSet::<String>::new();

    for message in messages.drain(..) {
        match &message {
            ChatMessage::System { .. } | ChatMessage::User { .. } => {
                flush_missing_tool_results(&mut repaired, &pending_tool_calls, &existing_tool_results);
                pending_tool_calls.clear();
                existing_tool_results.clear();
                repaired.push(message);
            }
            ChatMessage::Assistant {
                content,
                tool_calls,
                ..
            } => {
                flush_missing_tool_results(&mut repaired, &pending_tool_calls, &existing_tool_results);
                pending_tool_calls.clear();
                existing_tool_results.clear();

                let has_content = content
                    .as_ref()
                    .map(|value| !value.trim().is_empty())
                    .unwrap_or(false);
                if !has_content && tool_calls.is_empty() {
                    continue;
                }

                pending_tool_calls = tool_calls.iter().map(|tool_call| tool_call.id.clone()).collect();
                repaired.push(message);
            }
            ChatMessage::Tool(tool) => {
                existing_tool_results.insert(tool.tool_call_id.clone());
                repaired.push(message);
            }
        }
    }

    flush_missing_tool_results(&mut repaired, &pending_tool_calls, &existing_tool_results);
    *messages = repaired;
}

fn emit_tool_step_complete(
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    session: &KhadimSession,
    tool_call_id: &str,
    tool_name: &str,
    result: &str,
    is_error: bool,
) {
    let _ = tx.send(AgentStreamEvent {
        workspace_id: session.workspace_id.clone(),
        session_id: session.id.clone(),
        event_type: "step_complete".to_string(),
        content: Some(result.to_string()),
        metadata: Some(json!({
            "id": tool_call_id,
            "title": format!("Completed {}", tool_name),
            "tool": tool_name,
            "result": result,
            "is_error": is_error,
        })),
    });
}

pub async fn run_prompt(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
) -> Result<String, AppError> {
    run_prompt_with_plugins(session, prompt, selection, tx, None, "").await
}

pub async fn run_prompt_with_plugins(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    plugin_manager: Option<&Arc<PluginManager>>,
    skills_section: &str,
) -> Result<String, AppError> {
    let plugin_tools: Vec<Arc<dyn Tool>> = plugin_manager
        .map(|pm| crate::plugins::collect_plugin_tools(pm))
        .unwrap_or_default();

    let runtime = if plugin_tools.is_empty() {
        AgentRuntime::new(&session.cwd)
    } else {
        AgentRuntime::with_plugin_tools(&session.cwd, plugin_tools)
    };
    let mode = if session.workspace_id == "__chat__" {
        chat_mode()
    } else {
        build_mode()
    };
    let client = ModelClient::from_selection(selection).await?;
    let system_prompt = runtime.build_prompt(&mode, skills_section);

    repair_session_messages(&mut session.messages);

    if session.messages.is_empty() {
        session
            .messages
            .push(ChatMessage::System { content: system_prompt });
    }

    session
        .messages
        .push(ChatMessage::User { content: prompt.to_string() });

    let _ = tx.send(AgentStreamEvent {
        workspace_id: session.workspace_id.clone(),
        session_id: session.id.clone(),
        event_type: "usage_update".to_string(),
        content: None,
        metadata: Some(json!({
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
            "provider": client.model().provider,
            "model": client.model().id,
        })),
    });

    for turn_index in 0..12 {
        let context = Context {
            messages: session.messages.clone(),
            tools: runtime
                .definitions()
                .into_iter()
                .map(|tool| ToolDefinition {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                })
                .collect(),
            session_id: Some(session.id.clone()),
        };
        let provider_name = client.model().provider.clone();
        let model_name = client.model().id.clone();
        let workspace_id = session.workspace_id.clone();
        let session_id = session.id.clone();
        let stream_tx = tx.clone();
        let thinking_step_id = format!("llm-thinking-{turn_index}");
        let reply = client
            .stream(
                &context,
                mode.temperature,
                Arc::new(move |event| match event {
                    AssistantStreamEvent::TextDelta(delta) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "text_delta".to_string(),
                            content: Some(delta),
                            metadata: None,
                        });
                    }
                    AssistantStreamEvent::ThinkingStart => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_start".to_string(),
                            content: Some("Thinking".to_string()),
                            metadata: Some(json!({
                                "id": thinking_step_id,
                                "title": "Thinking",
                                "tool": "model",
                            })),
                        });
                    }
                    AssistantStreamEvent::ThinkingDelta(delta) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_update".to_string(),
                            content: Some(delta),
                            metadata: Some(json!({
                                "id": thinking_step_id,
                                "title": "Thinking",
                                "tool": "model",
                            })),
                        });
                    }
                    AssistantStreamEvent::ThinkingEnd(content) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_complete".to_string(),
                            content: Some(content),
                            metadata: Some(json!({
                                "id": thinking_step_id,
                                "title": "Thinking",
                                "tool": "model",
                            })),
                        });
                    }
                    AssistantStreamEvent::ToolCallStart { id, name } => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_start".to_string(),
                            content: Some(format!("Preparing {}", name)),
                            metadata: Some(json!({
                                "id": id,
                                "title": format!("Preparing {}", name),
                                "tool": name,
                            })),
                        });
                    }
                    AssistantStreamEvent::ToolCallDelta { id, name, arguments } => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_update".to_string(),
                            content: Some(arguments),
                            metadata: Some(json!({
                                "id": id,
                                "title": format!("Preparing {}", name),
                                "tool": name,
                            })),
                        });
                    }
                    AssistantStreamEvent::ToolCallEnd(tool_call) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "step_update".to_string(),
                            content: Some(tool_call.function.arguments),
                            metadata: Some(json!({
                                "id": tool_call.id,
                                "title": format!("Preparing {}", tool_call.function.name),
                                "tool": tool_call.function.name,
                            })),
                        });
                    }
                    AssistantStreamEvent::Usage(usage) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "usage_update".to_string(),
                            content: None,
                            metadata: Some(json!({
                                "input_tokens": usage.input,
                                "output_tokens": usage.output,
                                "cache_read_tokens": usage.cache_read,
                                "cache_write_tokens": usage.cache_write,
                                "provider": provider_name.clone(),
                                "model": model_name.clone(),
                            })),
                        });
                    }
                    AssistantStreamEvent::Error(message) => {
                        let _ = stream_tx.send(AgentStreamEvent {
                            workspace_id: workspace_id.clone(),
                            session_id: session_id.clone(),
                            event_type: "error".to_string(),
                            content: Some(message),
                            metadata: None,
                        });
                    }
                    _ => {}
                }),
            )
            .await?;

        let _ = tx.send(AgentStreamEvent {
            workspace_id: session.workspace_id.clone(),
            session_id: session.id.clone(),
            event_type: "usage_update".to_string(),
            content: None,
            metadata: Some(json!({
                "input_tokens": reply.usage.input,
                "output_tokens": reply.usage.output,
                "cache_read_tokens": reply.usage.cache_read,
                "cache_write_tokens": reply.usage.cache_write,
                "provider": client.model().provider,
                "model": client.model().id,
            })),
        });

        if !reply.tool_calls.is_empty() {
            session.messages.push(ChatMessage::Assistant {
                content: if reply.content.trim().is_empty() {
                    None
                } else {
                    Some(reply.content.clone())
                },
                tool_calls: reply.tool_calls.clone(),
                reasoning_content: reply.reasoning_content.clone(),
            });

            for tool_call in reply.tool_calls {
                let step_id = tool_call.id.clone();
                let args = serde_json::from_str::<Value>(&tool_call.function.arguments)
                    .unwrap_or_else(|_| json!({}));
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: session.workspace_id.clone(),
                    session_id: session.id.clone(),
                    event_type: "step_start".to_string(),
                    content: Some(format!("Running {}", tool_call.function.name)),
                    metadata: Some(json!({
                        "id": step_id,
                        "title": format!("Running {}", tool_call.function.name),
                        "tool": tool_call.function.name,
                    })),
                });

                let tool = runtime.get(&tool_call.function.name).ok_or_else(|| {
                    AppError::invalid_input(format!(
                        "Requested tool is not available: {}",
                        tool_call.function.name
                    ))
                });

                let tool = match tool {
                    Ok(tool) => tool,
                    Err(error) => {
                        emit_tool_step_complete(
                            tx,
                            session,
                            &tool_call.id,
                            &tool_call.function.name,
                            &error.message,
                            true,
                        );
                        session.messages.push(ChatMessage::Tool(ToolMessage {
                            content: error.message.clone(),
                            tool_call_id: step_id,
                        }));
                        return Err(error);
                    }
                };

                let result = match tool.execute(args).await {
                    Ok(result) => result,
                    Err(error) => {
                        emit_tool_step_complete(
                            tx,
                            session,
                            &tool_call.id,
                            &tool_call.function.name,
                            &error.message,
                            true,
                        );
                        session.messages.push(ChatMessage::Tool(ToolMessage {
                            content: error.message.clone(),
                            tool_call_id: step_id,
                        }));
                        return Err(error);
                    }
                };
                let _ = tx.send(AgentStreamEvent {
                    workspace_id: session.workspace_id.clone(),
                    session_id: session.id.clone(),
                    event_type: "step_complete".to_string(),
                    content: Some(result.content.clone()),
                    metadata: Some({
                        let mut base = json!({
                            "id": tool_call.id,
                            "title": format!("Completed {}", tool_call.function.name),
                            "tool": tool_call.function.name,
                            "result": result.content,
                            "is_error": false,
                        });
                        if let Some(meta) = result.metadata {
                            if let Some(object) = meta.as_object() {
                                for (key, value) in object {
                                    base[key] = value.clone();
                                }
                            }
                        }
                        base
                    }),
                });

                session.messages.push(ChatMessage::Tool(ToolMessage {
                    content: result.content,
                    tool_call_id: step_id,
                }));
            }

            continue;
        }

        if !reply.content.trim().is_empty() || reply.reasoning_content.is_some() {
            session.messages.push(ChatMessage::Assistant {
                content: if reply.content.trim().is_empty() {
                    None
                } else {
                    Some(reply.content.clone())
                },
                tool_calls: Vec::new(),
                reasoning_content: reply.reasoning_content.clone(),
            });
        }
        let final_text = reply.content;
        let _ = tx.send(AgentStreamEvent {
            workspace_id: session.workspace_id.clone(),
            session_id: session.id.clone(),
            event_type: "done".to_string(),
            content: None,
            metadata: None,
        });
        return Ok(final_text);
    }

    Err(AppError::backend_busy(
        "Khadim reached the maximum number of tool-call iterations",
    ))
}

#[cfg(test)]
mod tests {
    use super::repair_session_messages;
    use crate::khadim_ai::types::{ChatMessage, ToolCall, ToolFunction, ToolMessage};

    #[test]
    fn repairs_orphaned_tool_calls_in_session_history() {
        let mut messages = vec![
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

        repair_session_messages(&mut messages);

        assert_eq!(messages.len(), 3);
        assert!(matches!(messages[1], ChatMessage::Tool(_)));
    }

    #[test]
    fn drops_empty_assistant_messages_without_tool_calls() {
        let mut messages = vec![
            ChatMessage::Assistant {
                content: None,
                tool_calls: Vec::new(),
                reasoning_content: None,
            },
            ChatMessage::User {
                content: "hello".to_string(),
            },
        ];

        repair_session_messages(&mut messages);

        assert_eq!(messages.len(), 1);
        assert!(matches!(messages[0], ChatMessage::User { .. }));
    }

    #[test]
    fn keeps_existing_tool_results() {
        let mut messages = vec![
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
            ChatMessage::Tool(ToolMessage {
                content: "ok".to_string(),
                tool_call_id: "call_123".to_string(),
            }),
        ];

        repair_session_messages(&mut messages);

        assert_eq!(messages.len(), 2);
    }
}
