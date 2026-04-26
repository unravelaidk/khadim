use crate::agent::goal_tracker::GoalTracker;
use crate::agent::mode_planner;
use crate::agent::modes::{build_mode, chat_mode, explore_mode, plan_mode, sub_general_mode, sub_explore_mode, sub_review_mode};
use crate::agent::session::KhadimSession;
use crate::agent::types::{AgentId, AgentModeDefinition};
use khadim_ai_core::error::AppError;
use crate::events::AgentStreamEvent;
use crate::helpers::try_repair_json;
use khadim_ai_core::types::{
    AssistantStreamEvent, ChatMessage, Context, ModelSelection, ToolCall, ToolMessage,
};
use khadim_ai_core::ModelClient;
use crate::runtime::AgentRuntime;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;

fn collect_quoted_segments(text: &str, delimiter: char) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_segment = false;

    for ch in text.chars() {
        if ch == delimiter {
            if in_segment {
                let value = current.trim();
                if !value.is_empty() {
                    values.push(value.to_string());
                }
                current.clear();
            }
            in_segment = !in_segment;
            continue;
        }

        if in_segment {
            current.push(ch);
        }
    }

    values
}

fn push_unique(target: &mut Vec<String>, value: impl Into<String>) {
    let value = value.into();
    if !target.iter().any(|existing| existing == &value) {
        target.push(value);
    }
}

fn extract_contract_summary(prompt: &str) -> Option<String> {
    let mut outputs = Vec::new();
    let mut commands = Vec::new();
    let mut forbidden_edits = Vec::new();
    let mut dependencies = Vec::new();

    for segment in collect_quoted_segments(prompt, '`') {
        let trimmed = segment.trim();
        if trimmed.starts_with('/') || trimmed.starts_with("./") {
            push_unique(&mut outputs, trimmed.to_string());
        }
        if trimmed.contains(' ') || trimmed.contains('/') {
            push_unique(&mut commands, trimmed.to_string());
        }
    }

    for segment in collect_quoted_segments(prompt, '"') {
        let trimmed = segment.trim();
        if trimmed.starts_with('/') || trimmed.starts_with("./") {
            push_unique(&mut outputs, trimmed.to_string());
        }
    }

    for raw_line in prompt.lines() {
        let line = raw_line.trim();
        let lower = line.to_ascii_lowercase();
        if lower.contains("store it in ") || lower.contains("save the results in") {
            for token in line.split_whitespace() {
                let cleaned = token.trim_matches(|c: char| matches!(c, '`' | '"' | '\'' | ',' | '.' | ':' | ';' | ')' | '('));
                if cleaned.starts_with('/') || cleaned.starts_with("./") {
                    push_unique(&mut outputs, cleaned.to_string());
                }
            }
        }
        if lower.contains("do not edit") || lower.contains("don't edit") || lower.contains("only edits you may make") {
            push_unique(&mut forbidden_edits, line.to_string());
        }
        if lower.contains("you can only use") || lower.contains("you have access to") || lower.contains("dependencies") {
            push_unique(&mut dependencies, line.to_string());
        }
        if lower.starts_with("usage:") || lower.contains("we will test") || lower.contains("sanity check") {
            push_unique(&mut commands, line.to_string());
        }
    }

    if outputs.is_empty() && commands.is_empty() && forbidden_edits.is_empty() && dependencies.is_empty() {
        return None;
    }

    let mut sections = Vec::new();
    if !outputs.is_empty() {
        sections.push(format!("outputs: {}", outputs.join(", ")));
    }
    if !commands.is_empty() {
        sections.push(format!("checks: {}", commands.join(" | ")));
    }
    if !forbidden_edits.is_empty() {
        sections.push(format!("constraints: {}", forbidden_edits.join(" | ")));
    }
    if !dependencies.is_empty() {
        sections.push(format!("dependencies: {}", dependencies.join(" | ")));
    }

    Some(format!(
        "Contract summary inferred from the user request: {}. Use this summary to guide exploration and verification before broad search.",
        sections.join("; ")
    ))
}

fn progress_nudge(turn_index: usize) -> String {
    format!(
        "Progress checkpoint after {turn_index} turns. Reduce the search space before continuing: \
         restate the exact success contract, keep at most 3 live hypotheses, pick the cheapest next \
         experiment, and verify an artifact or command soon. If a needed tool is missing, install it \
         or choose a different branch immediately."
    )
}

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

pub fn repair_session_messages(messages: &mut Vec<ChatMessage>) {
    let mut repaired = Vec::with_capacity(messages.len());
    let mut pending_tool_calls = Vec::<String>::new();
    let mut existing_tool_results = HashSet::<String>::new();

    for message in messages.drain(..) {
        match &message {
            ChatMessage::System { .. }
            | ChatMessage::User { .. }
            | ChatMessage::UserWithImages { .. } => {
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

/// Resolve a mode definition from an AgentId.
fn resolve_mode(mode_id: &AgentId) -> AgentModeDefinition {
    match mode_id {
        AgentId::Build => build_mode(),
        AgentId::Chat => chat_mode(),
        AgentId::Plan => plan_mode(),
        AgentId::Explore => explore_mode(),
        AgentId::SubGeneral => sub_general_mode(),
        AgentId::SubExplore => sub_explore_mode(),
        AgentId::SubReview => sub_review_mode(),
    }
}

/// Helper to create a scoped or unscoped event based on session context.
fn make_event(session: &KhadimSession, event_type: &str) -> AgentStreamEvent {
    if session.workspace_id.is_empty() {
        AgentStreamEvent::new(event_type)
    } else {
        AgentStreamEvent::scoped(&session.workspace_id, &session.id, event_type)
    }
}

/// Automatically determine the best mode for a prompt using the PDDL-based planner.
/// Returns the mode definition and a human-readable description of the reasoning.
pub fn auto_select_mode(prompt: &str) -> (AgentModeDefinition, String) {
    let plan = mode_planner::determine_mode(prompt);
    let mode = resolve_mode(&plan.mode);
    let reasoning = format!(
        "Auto-selected mode '{}' (confidence: {:.2}) — {}",
        mode.name, plan.confidence, plan.reasoning
    );
    (mode, reasoning)
}

/// Tools that are safe to execute in parallel (read-only, no side effects between each other).
const PARALLEL_SAFE_TOOLS: &[&str] = &[
    "read", "ls", "grep", "glob", "web_search",
];

/// Result of executing a single tool call.
#[allow(dead_code)]
struct ToolExecResult {
    tool_call_id: String,
    tool_name: String,
    content: String,
    is_error: bool,
    metadata: Option<Value>,
}

/// Execute a single tool call: resolve → run → emit events → return result.
async fn execute_single_tool(
    tool_call: &ToolCall,
    runtime: &AgentRuntime,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    workspace_id: &str,
    session_id: &str,
) -> ToolExecResult {
    let step_id = tool_call.id.clone();
    let tool_name = tool_call.function.name.clone();
    let raw_args = &tool_call.function.arguments;
    let args = serde_json::from_str::<Value>(raw_args)
        .unwrap_or_else(|_| try_repair_json(raw_args).unwrap_or_else(|| json!({})));

    let make_ev = |etype: &str| -> AgentStreamEvent {
        if workspace_id.is_empty() {
            AgentStreamEvent::new(etype)
        } else {
            AgentStreamEvent::scoped(workspace_id, session_id, etype)
        }
    };

    let _ = tx.send(
        make_ev("step_start")
            .with_content(format!("Running {}", tool_name))
            .with_metadata(json!({
                "id": step_id,
                "title": format!("Running {}", tool_name),
                "tool": tool_name,
            })),
    );

    let tool = match runtime.get(&tool_name) {
        Some(tool) => tool,
        None => {
            let msg = format!("Requested tool is not available: {}", tool_name);
            let _ = tx.send(
                make_ev("step_complete")
                    .with_content(msg.clone())
                    .with_metadata(json!({
                        "id": step_id,
                        "title": format!("Completed {}", tool_name),
                        "tool": tool_name,
                        "result": msg,
                        "is_error": true,
                    })),
            );
            return ToolExecResult {
                tool_call_id: step_id,
                tool_name,
                content: "Tool not available".to_string(),
                is_error: true,
                metadata: None,
            };
        }
    };

    match tool.execute(args).await {
        Ok(result) => {
            let mut step_meta = json!({
                "id": step_id,
                "title": format!("Completed {}", tool_name),
                "tool": tool_name,
                "result": result.content,
                "is_error": false,
            });
            if let Some(meta) = &result.metadata {
                if let Some(object) = meta.as_object() {
                    for (key, value) in object {
                        step_meta[key] = value.clone();
                    }
                }
            }
            let _ = tx.send(
                make_ev("step_complete")
                    .with_content(result.content.clone())
                    .with_metadata(step_meta),
            );
            ToolExecResult {
                tool_call_id: step_id,
                tool_name,
                content: result.content,
                is_error: false,
                metadata: result.metadata,
            }
        }
        Err(error) => {
            let _ = tx.send(
                make_ev("step_complete")
                    .with_content(error.message.clone())
                    .with_metadata(json!({
                        "id": step_id,
                        "title": format!("Completed {}", tool_name),
                        "tool": tool_name,
                        "result": error.message,
                        "is_error": true,
                    })),
            );
            ToolExecResult {
                tool_call_id: step_id,
                tool_name,
                content: format!("Error: {}", error.message),
                is_error: true,
                metadata: None,
            }
        }
    }
}

/// Execute a batch of tool calls with parallelism where safe.
///
/// Strategy:
/// - Consecutive read-only tools (read, ls, grep, glob, web_search) are batched
///   and executed concurrently via `join_all`.
/// - Mutating tools (bash, write, edit, memory, delegate_to_agent) are executed
///   one at a time, flushing any pending parallel batch first.
/// - Results are always appended to session messages in the original order.
async fn execute_tool_calls(
    tool_calls: Vec<ToolCall>,
    runtime: &AgentRuntime,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    session: &mut KhadimSession,
    mut goal_tracker: Option<&mut GoalTracker>,
) {
    // Split tool calls into runs of parallel-safe and sequential tools.
    // We process them in order, batching adjacent parallel-safe calls.
    let mut i = 0;
    while i < tool_calls.len() {
        // Collect a run of parallel-safe tools
        let batch_start = i;
        while i < tool_calls.len()
            && PARALLEL_SAFE_TOOLS.contains(&tool_calls[i].function.name.as_str())
        {
            i += 1;
        }

        // Execute the parallel batch
        if i > batch_start {
            let batch = &tool_calls[batch_start..i];
            let futures: Vec<_> = batch
                .iter()
                .map(|tc| {
                    execute_single_tool(
                        tc,
                        runtime,
                        tx,
                        &session.workspace_id,
                        &session.id,
                    )
                })
                .collect();

            let results = futures::future::join_all(futures).await;

            for (idx, result) in results.into_iter().enumerate() {
                if let Some(ref mut gt) = goal_tracker {
                    let tc = &batch[idx];
                    gt.update_from_tool_json(&tc.function.name, &tc.function.arguments, &result.content);
                }
                session.messages.push(ChatMessage::Tool(ToolMessage {
                    content: result.content,
                    tool_call_id: result.tool_call_id,
                }));
            }
        }

        // Execute sequential tool (if we stopped on one)
        if i < tool_calls.len() {
            let tc = &tool_calls[i];
            let result = execute_single_tool(
                tc,
                runtime,
                tx,
                &session.workspace_id,
                &session.id,
            )
            .await;

            if let Some(ref mut gt) = goal_tracker {
                gt.update_from_tool_json(&tc.function.name, &tc.function.arguments, &result.content);
            }

            session.messages.push(ChatMessage::Tool(ToolMessage {
                content: result.content,
                tool_call_id: result.tool_call_id,
            }));
            i += 1;
        }
    }
}

/// Configuration for the orchestrator loop.
pub struct RunConfig {
    /// Maximum number of tool-call turns before stopping (default: 200).
    pub max_turns: usize,
    /// Interval (in turns) for injecting progress nudges (default: 6). Set to 0 to disable.
    pub nudge_interval: usize,
    /// Whether to inject contract summaries from the prompt (default: true).
    pub extract_contracts: bool,
    /// Whether to extract goals from the prompt and inject goal-count heuristic nudges (default: true).
    pub goal_tracking: bool,
}

impl Default for RunConfig {
    fn default() -> Self {
        Self {
            max_turns: 200,
            nudge_interval: 6,
            extract_contracts: true,
            goal_tracking: true,
        }
    }
}

/// Run a prompt with automatic mode selection.
/// The mode is determined by the PDDL-based planner based on the prompt content.
pub async fn run_prompt(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
) -> Result<String, AppError> {
    let runtime = AgentRuntime::new(&session.cwd);
    run_prompt_with_runtime(session, prompt, selection, tx, runtime, RunConfig::default()).await
}

/// Run a prompt with a pre-configured runtime (supports extra tools, plugins, etc.).
pub async fn run_prompt_with_runtime(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: RunConfig,
) -> Result<String, AppError> {
    // If the session has a system prompt override, use chat mode.
    // Otherwise, auto-select mode based on the prompt.
    let (mode, mode_reasoning) = if session.system_prompt_override.is_some() {
        (chat_mode(), "Using system prompt override — chat mode".to_string())
    } else {
        auto_select_mode(prompt)
    };

    let client = ModelClient::from_selection(selection).await?;

    // Build the system prompt: override or mode-based
    let system_prompt = match &session.system_prompt_override {
        Some(override_prompt) => override_prompt.clone(),
        None => runtime.build_prompt(&mode),
    };

    repair_session_messages(&mut session.messages);

    // Emit mode reasoning
    let _ = tx.send(
        make_event(session, "mode_selected")
            .with_content(mode_reasoning)
            .with_metadata(json!({ "mode": mode.name })),
    );

    if session.messages.is_empty() {
        session.messages.push(ChatMessage::System { content: system_prompt });
    }

    if config.extract_contracts {
        if let Some(contract_summary) = extract_contract_summary(prompt) {
            session.messages.push(ChatMessage::System { content: contract_summary });
        }
    }

    session.messages.push(ChatMessage::User { content: prompt.to_string() });

    let mut goal_tracker = if config.goal_tracking {
        let gt = GoalTracker::from_prompt(prompt);
        if gt.has_goals() {
            let _ = tx.send(
                make_event(session, "goal_heuristic")
                    .with_content(format!("Extracted {} goals", gt.total()))
                    .with_metadata(json!({
                        "total_goals": gt.total(),
                        "goals": gt.goals.iter().map(|g| json!({
                            "kind": g.kind.label(),
                            "description": g.description,
                        })).collect::<Vec<_>>(),
                    })),
            );
        }
        Some(gt)
    } else {
        None
    };

    let max_turns = config.max_turns;
    let mut turn_index: usize = 0;
    loop {
        if turn_index >= max_turns {
            let _ = tx.send(
                make_event(session, "error")
                    .with_content(format!("Reached maximum turn limit ({max_turns}). Stopping.")),
            );
            let _ = tx.send(make_event(session, "done"));
            return Ok("Reached max turn limit".to_string());
        }
        if config.nudge_interval > 0 && turn_index > 0 && turn_index % config.nudge_interval == 0 {
            let nudge = goal_tracker
                .as_ref()
                .and_then(|gt| gt.nudge())
                .unwrap_or_else(|| progress_nudge(turn_index));
            session.messages.push(ChatMessage::System {
                content: nudge,
            });
        }

        let context = Context {
            messages: session.messages.clone(),
            tools: runtime.definitions(),
            session_id: Some(session.id.clone()),
        };

        // Retry LLM calls up to 3 times on transient errors
        let mut retry_count = 0u32;
        let max_retries = 3u32;
        let reply = loop {
            let stream_tx_inner = tx.clone();
            let thinking_id = format!("llm-thinking-{turn_index}");

            // Clone for the closure
            let ws_id2 = session.workspace_id.clone();
            let sess_id2 = session.id.clone();
            let has_ws2 = !ws_id2.is_empty();

            let _ = tx.send(make_event(session, "llm_call_start"));
            let result = client
            .stream(
                &context,
                mode.temperature,
                Arc::new(move |event| {
                    let make_ev_inner = |etype: &str| -> AgentStreamEvent {
                        if has_ws2 {
                            AgentStreamEvent::scoped(&ws_id2, &sess_id2, etype)
                        } else {
                            AgentStreamEvent::new(etype)
                        }
                    };

                    match event {
                    AssistantStreamEvent::TextDelta(delta) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("text_delta").with_content(delta),
                        );
                    }
                    AssistantStreamEvent::ThinkingStart => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_start")
                                .with_content("Thinking")
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ThinkingDelta(delta) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(delta)
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ThinkingEnd(content) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_complete")
                                .with_content(content)
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallStart { id, name } => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_start")
                                .with_content(format!("Preparing {name}"))
                                .with_metadata(json!({
                                    "id": id,
                                    "title": format!("Preparing {name}"),
                                    "tool": name,
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallDelta { id, name, arguments } => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(arguments)
                                .with_metadata(json!({
                                    "id": id,
                                    "title": format!("Preparing {name}"),
                                    "tool": name,
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallEnd(tool_call) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(tool_call.function.arguments)
                                .with_metadata(json!({
                                    "id": tool_call.id,
                                    "title": format!("Preparing {}", tool_call.function.name),
                                    "tool": tool_call.function.name,
                                })),
                        );
                    }
                    AssistantStreamEvent::Error(message) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("error").with_content(message),
                        );
                    }
                    AssistantStreamEvent::Usage(usage) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("usage").with_metadata(json!({
                                "input": usage.input,
                                "output": usage.output,
                                "cache_read": usage.cache_read,
                                "cache_write": usage.cache_write,
                            })),
                        );
                    }
                    AssistantStreamEvent::Start | AssistantStreamEvent::TextStart | AssistantStreamEvent::TextEnd(_) | AssistantStreamEvent::Done => {}
                }}),
            )
            .await;
            let _ = tx.send(make_event(session, "llm_call_end"));

            match result {
                Ok(reply) => break reply,
                Err(err) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(err);
                    }
                    let _ = tx.send(
                        make_event(session, "error")
                            .with_content(format!("LLM error (retry {retry_count}/{max_retries}): {}", err.message)),
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(2u64.pow(retry_count))).await;
                }
            }
        };

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

            execute_tool_calls(reply.tool_calls, &runtime, tx, session, goal_tracker.as_mut()).await;

            turn_index += 1;
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
        let _ = tx.send(make_event(session, "done"));
        return Ok(final_text);
    }
}

/// Run a prompt with an explicitly specified mode (bypassing the PDDL planner).
pub async fn run_prompt_with_explicit_mode(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    mode: AgentModeDefinition,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
) -> Result<String, AppError> {
    session.system_prompt_override = None; // Ensure we use the explicit mode, not an override
    let old_override = session.system_prompt_override.take();
    let runtime = AgentRuntime::new(&session.cwd);
    let result = run_prompt_inner(session, prompt, selection, tx, runtime, mode, RunConfig::default()).await;
    session.system_prompt_override = old_override;
    result
}

/// Run a prompt with an explicit mode and a pre-configured runtime.
/// Used by the CLI to inject custom tools (e.g. the question tool).
pub async fn run_prompt_with_runtime_and_explicit_mode(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    mode: AgentModeDefinition,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
) -> Result<String, AppError> {
    session.system_prompt_override = None;
    let old_override = session.system_prompt_override.take();
    let result = run_prompt_inner(session, prompt, selection, tx, runtime, mode, RunConfig::default()).await;
    session.system_prompt_override = old_override;
    result
}

/// Internal: Run the loop with an explicit mode (no auto-selection).
async fn run_prompt_inner(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    mode: AgentModeDefinition,
    config: RunConfig,
) -> Result<String, AppError> {
    let client = ModelClient::from_selection(selection).await?;
    let system_prompt = match &session.system_prompt_override {
        Some(override_prompt) => override_prompt.clone(),
        None => runtime.build_prompt(&mode),
    };

    repair_session_messages(&mut session.messages);

    if session.messages.is_empty() {
        session.messages.push(ChatMessage::System { content: system_prompt });
    }

    if config.extract_contracts {
        if let Some(contract_summary) = extract_contract_summary(prompt) {
            session.messages.push(ChatMessage::System { content: contract_summary });
        }
    }

    session.messages.push(ChatMessage::User { content: prompt.to_string() });

    let mut goal_tracker = if config.goal_tracking {
        let gt = GoalTracker::from_prompt(prompt);
        if gt.has_goals() {
            let _ = tx.send(
                make_event(session, "goal_heuristic")
                    .with_content(format!("Extracted {} goals", gt.total()))
                    .with_metadata(json!({
                        "total_goals": gt.total(),
                        "goals": gt.goals.iter().map(|g| json!({
                            "kind": g.kind.label(),
                            "description": g.description,
                        })).collect::<Vec<_>>(),
                    })),
            );
        }
        Some(gt)
    } else {
        None
    };

    let max_turns = config.max_turns;
    let mut turn_index: usize = 0;
    loop {
        if turn_index >= max_turns {
            let _ = tx.send(
                make_event(session, "error")
                    .with_content(format!("Reached maximum turn limit ({max_turns}). Stopping.")),
            );
            let _ = tx.send(make_event(session, "done"));
            return Ok("Reached max turn limit".to_string());
        }
        if config.nudge_interval > 0 && turn_index > 0 && turn_index % config.nudge_interval == 0 {
            let nudge = goal_tracker
                .as_ref()
                .and_then(|gt| gt.nudge())
                .unwrap_or_else(|| progress_nudge(turn_index));
            session.messages.push(ChatMessage::System {
                content: nudge,
            });
        }

        let context = Context {
            messages: session.messages.clone(),
            tools: runtime.definitions(),
            session_id: Some(session.id.clone()),
        };

        let mut retry_count = 0u32;
        let max_retries = 3u32;
        let reply = loop {
            let stream_tx_inner = tx.clone();
            let thinking_id = format!("llm-thinking-{turn_index}");
            let ws_id = session.workspace_id.clone();
            let sess_id = session.id.clone();
            let has_ws = !ws_id.is_empty();

            let _ = tx.send(make_event(session, "llm_call_start"));
            let result = client
            .stream(
                &context,
                mode.temperature,
                Arc::new(move |event| {
                    let make_ev_inner = |etype: &str| -> AgentStreamEvent {
                        if has_ws {
                            AgentStreamEvent::scoped(&ws_id, &sess_id, etype)
                        } else {
                            AgentStreamEvent::new(etype)
                        }
                    };

                    match event {
                    AssistantStreamEvent::TextDelta(delta) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("text_delta").with_content(delta),
                        );
                    }
                    AssistantStreamEvent::ThinkingStart => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_start")
                                .with_content("Thinking")
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ThinkingDelta(delta) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(delta)
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ThinkingEnd(content) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_complete")
                                .with_content(content)
                                .with_metadata(json!({
                                    "id": thinking_id,
                                    "title": "Thinking",
                                    "tool": "model",
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallStart { id, name } => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_start")
                                .with_content(format!("Preparing {name}"))
                                .with_metadata(json!({
                                    "id": id,
                                    "title": format!("Preparing {name}"),
                                    "tool": name,
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallDelta { id, name, arguments } => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(arguments)
                                .with_metadata(json!({
                                    "id": id,
                                    "title": format!("Preparing {name}"),
                                    "tool": name,
                                })),
                        );
                    }
                    AssistantStreamEvent::ToolCallEnd(tool_call) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("step_update")
                                .with_content(tool_call.function.arguments)
                                .with_metadata(json!({
                                    "id": tool_call.id,
                                    "title": format!("Preparing {}", tool_call.function.name),
                                    "tool": tool_call.function.name,
                                })),
                        );
                    }
                    AssistantStreamEvent::Error(message) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("error").with_content(message),
                        );
                    }
                    AssistantStreamEvent::Usage(usage) => {
                        let _ = stream_tx_inner.send(
                            make_ev_inner("usage").with_metadata(json!({
                                "input": usage.input,
                                "output": usage.output,
                                "cache_read": usage.cache_read,
                                "cache_write": usage.cache_write,
                            })),
                        );
                    }
                    AssistantStreamEvent::Start | AssistantStreamEvent::TextStart | AssistantStreamEvent::TextEnd(_) | AssistantStreamEvent::Done => {}
                }}),
            )
            .await;
            let _ = tx.send(make_event(session, "llm_call_end"));

            match result {
                Ok(reply) => break reply,
                Err(err) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(err);
                    }
                    let _ = tx.send(
                        make_event(session, "error")
                            .with_content(format!("LLM error (retry {retry_count}/{max_retries}): {}", err.message)),
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(2u64.pow(retry_count))).await;
                }
            }
        };

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

            execute_tool_calls(reply.tool_calls, &runtime, tx, session, goal_tracker.as_mut()).await;

            turn_index += 1;
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
        let _ = tx.send(make_event(session, "done"));
        return Ok(final_text);
    }
}
