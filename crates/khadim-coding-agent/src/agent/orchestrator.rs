use crate::agent::goal_tracker::GoalTracker;
use crate::agent::mode_planner;
use crate::agent::modes::{
    build_mode, chat_mode, explore_mode, plan_mode, sub_explore_mode, sub_general_mode,
    sub_review_mode,
};
use crate::agent::session::KhadimSession;
use crate::agent::types::{AgentId, AgentModeDefinition};
use crate::coordinator::search::{self, ProposerFn, Scorer, SearchMode};
use crate::events::AgentStreamEvent;
use crate::helpers::try_repair_json;
use crate::runtime::AgentRuntime;
use khadim_ai_core::error::AppError;
use khadim_ai_core::types::{
    AssistantStreamEvent, ChatMessage, Context, ModelSelection, ToolCall, ToolFunction, ToolMessage,
};
use khadim_ai_core::{ModelClient, ModelExecutor};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

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

pub(crate) fn extract_contract_summary(prompt: &str) -> Option<String> {
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
                let cleaned = token.trim_matches(|c: char| {
                    matches!(c, '`' | '"' | '\'' | ',' | '.' | ':' | ';' | ')' | '(')
                });
                if cleaned.starts_with('/') || cleaned.starts_with("./") {
                    push_unique(&mut outputs, cleaned.to_string());
                }
            }
        }
        if lower.contains("do not edit")
            || lower.contains("don't edit")
            || lower.contains("only edits you may make")
        {
            push_unique(&mut forbidden_edits, line.to_string());
        }
        if lower.contains("you can only use")
            || lower.contains("you have access to")
            || lower.contains("dependencies")
        {
            push_unique(&mut dependencies, line.to_string());
        }
        if lower.starts_with("usage:")
            || lower.contains("we will test")
            || lower.contains("sanity check")
        {
            push_unique(&mut commands, line.to_string());
        }
    }

    if outputs.is_empty()
        && commands.is_empty()
        && forbidden_edits.is_empty()
        && dependencies.is_empty()
    {
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
                flush_missing_tool_results(
                    &mut repaired,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();
                repaired.push(message);
            }
            ChatMessage::Assistant {
                content,
                tool_calls,
                ..
            } => {
                flush_missing_tool_results(
                    &mut repaired,
                    &pending_tool_calls,
                    &existing_tool_results,
                );
                pending_tool_calls.clear();
                existing_tool_results.clear();

                let has_content = content
                    .as_ref()
                    .map(|value| !value.trim().is_empty())
                    .unwrap_or(false);
                if !has_content && tool_calls.is_empty() {
                    continue;
                }

                pending_tool_calls = tool_calls
                    .iter()
                    .map(|tool_call| tool_call.id.clone())
                    .collect();
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

const MAX_LLM_ATTEMPTS: u32 = 3;

async fn initialize_model_client(
    selection: Option<ModelSelection>,
    session: &KhadimSession,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
) -> Result<ModelClient, AppError> {
    match ModelClient::from_selection(selection).await {
        Ok(client) => Ok(client),
        Err(err) => {
            let _ = tx.send(
                make_event(session, "error")
                    .with_content(format!(
                        "Failed to initialize model client: {}",
                        err.message
                    ))
                    .with_metadata(json!({
                        "kind": "llm_initialization_failure",
                    })),
            );
            Err(err)
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum LlmFailureDisposition {
    RetryAfter(Duration),
    Exhausted,
}

fn emit_llm_failure_event(
    session: &KhadimSession,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    attempt_number: u32,
    max_attempts: u32,
    retry_base_delay: Duration,
    err: &AppError,
) -> LlmFailureDisposition {
    assert!(
        attempt_number > 0 && attempt_number <= max_attempts,
        "LLM attempt must be within the configured attempt limit"
    );

    if attempt_number < max_attempts {
        let _ = tx.send(
            make_event(session, "step_update")
                .with_content(format!(
                    "LLM call failed (attempt {attempt_number}/{max_attempts}); retrying: {}",
                    err.message
                ))
                .with_metadata(json!({
                    "id": format!("llm-retry-{attempt_number}"),
                    "title": format!("Retrying model call ({attempt_number}/{max_attempts})"),
                    "tool": "model",
                    "kind": "retry",
                    "attempt": attempt_number,
                    "max_attempts": max_attempts,
                })),
        );
        let multiplier = 2u32.checked_pow(attempt_number).unwrap_or(u32::MAX);
        LlmFailureDisposition::RetryAfter(retry_base_delay.saturating_mul(multiplier))
    } else {
        let _ = tx.send(
            make_event(session, "error")
                .with_content(format!(
                    "LLM call failed after {attempt_number} attempts: {}",
                    err.message
                ))
                .with_metadata(json!({
                    "kind": "llm_failure",
                    "attempts": attempt_number,
                })),
        );
        LlmFailureDisposition::Exhausted
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
    "read",
    "ls",
    "grep",
    "glob",
    "web_search",
    "delegate_to_agent",
];

/// Result of executing a single tool call.
struct ToolExecResult {
    tool_call_id: String,
    content: String,
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
                content: "Tool not available".to_string(),
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
                content: result.content,
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
                content: format!("Error: {}", error.message),
            }
        }
    }
}

/// Execute a batch of tool calls with parallelism where safe.
///
/// Strategy:
/// - Consecutive read-only tools and independent delegations are batched.
/// - Delegation batches are chunked to the configured helper limit.
/// - Mutating tools (bash, write, edit, memory) execute one at a time, flushing
///   any pending parallel batch first.
/// - Results are always appended to session messages in the original order.
async fn execute_tool_calls(
    tool_calls: Vec<ToolCall>,
    runtime: &AgentRuntime,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    session: &mut KhadimSession,
    mut goal_tracker: Option<&mut GoalTracker>,
    mut parse_cache: Option<&mut khadim_code_graph::ParseCache>,
    max_workers: usize,
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
            let parallel_limit = if batch
                .iter()
                .any(|call| call.function.name == "delegate_to_agent")
            {
                max_workers.max(1)
            } else {
                batch.len().max(1)
            };

            for chunk in batch.chunks(parallel_limit) {
                let futures: Vec<_> = chunk
                    .iter()
                    .map(|tc| {
                        execute_single_tool(tc, runtime, tx, &session.workspace_id, &session.id)
                    })
                    .collect();
                let results = futures::future::join_all(futures).await;

                for (idx, result) in results.into_iter().enumerate() {
                    if let Some(ref mut gt) = goal_tracker {
                        let tc = &chunk[idx];
                        let newly = if let Some(cache) = parse_cache.as_mut() {
                            gt.update_from_tool_json_with_graph(
                                &tc.function.name,
                                &tc.function.arguments,
                                &result.content,
                                cache,
                            )
                        } else {
                            gt.update_from_tool_json(
                                &tc.function.name,
                                &tc.function.arguments,
                                &result.content,
                            );
                            newly_satisfied_indices(gt)
                        };
                        emit_goal_satisfied_events(&newly, gt, session, tx);
                    }
                    session.messages.push(ChatMessage::Tool(ToolMessage {
                        content: result.content,
                        tool_call_id: result.tool_call_id,
                    }));
                }
            }
        }

        // Execute sequential tool (if we stopped on one)
        if i < tool_calls.len() {
            let tc = &tool_calls[i];
            let result =
                execute_single_tool(tc, runtime, tx, &session.workspace_id, &session.id).await;

            if let Some(ref mut gt) = goal_tracker {
                let newly = if let Some(cache) = parse_cache.as_mut() {
                    gt.update_from_tool_json_with_graph(
                        &tc.function.name,
                        &tc.function.arguments,
                        &result.content,
                        cache,
                    )
                } else {
                    let before: Vec<bool> = gt.goals.iter().map(|g| g.satisfied).collect();
                    gt.update_from_tool_json(
                        &tc.function.name,
                        &tc.function.arguments,
                        &result.content,
                    );
                    newly_satisfied_from_before(&before, gt)
                };
                emit_goal_satisfied_events(&newly, gt, session, tx);
            }

            session.messages.push(ChatMessage::Tool(ToolMessage {
                content: result.content,
                tool_call_id: result.tool_call_id,
            }));
            i += 1;
        }
    }
}

/// Return the indices of goals that are currently satisfied (used as the
/// "newly satisfied" list when the graph variant isn't available and we fall
/// back to the legacy `update_from_tool_json`, which doesn't return indices).
fn newly_satisfied_indices(gt: &GoalTracker) -> Vec<usize> {
    gt.goals
        .iter()
        .enumerate()
        .filter(|(_, g)| g.satisfied)
        .map(|(i, _)| i)
        .collect()
}

/// Given the pre-update `satisfied` flags, return the indices of goals that
/// flipped from unsatisfied to satisfied.
fn newly_satisfied_from_before(before: &[bool], gt: &GoalTracker) -> Vec<usize> {
    gt.goals
        .iter()
        .enumerate()
        .filter(|(i, g)| !before.get(*i).copied().unwrap_or(false) && g.satisfied)
        .map(|(i, _)| i)
        .collect()
}

/// Emit a `goal_satisfied` event for each newly-satisfied goal index.
fn emit_goal_satisfied_events(
    newly: &[usize],
    gt: &GoalTracker,
    session: &KhadimSession,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
) {
    for &idx in newly {
        if let Some(goal) = gt.goals.get(idx) {
            let _ = tx.send(
                make_event(session, "goal_satisfied")
                    .with_content(format!("Goal satisfied: {}", goal.description))
                    .with_metadata(json!({
                        "goal_index": idx,
                        "kind": goal.kind.label(),
                        "description": goal.description,
                    })),
            );
        }
    }
}

/// Configuration for the orchestrator loop.
pub struct RunConfig {
    /// Per-run sampling temperature override. `None` keeps the selected
    /// agent mode's temperature.
    pub temperature: Option<f32>,
    /// Maximum number of tool-call turns before stopping (default: 200).
    pub max_turns: usize,
    /// Maximum number of attempts for each model call (default: 3).
    /// Values below 1 are treated as 1.
    pub max_llm_attempts: u32,
    /// Base delay used for exponential model-call retry backoff (default: 1s).
    /// Set to [`Duration::ZERO`] for deterministic runs that must not sleep.
    pub llm_retry_base_delay: Duration,
    /// Interval (in turns) for injecting progress nudges (default: 6). Set to 0 to disable.
    pub nudge_interval: usize,
    /// Whether to inject contract summaries from the prompt (default: true).
    pub extract_contracts: bool,
    /// Whether to extract goals from the prompt and inject goal-count heuristic nudges (default: true).
    pub goal_tracking: bool,
    /// Upper bound on concurrently-running delegated workers (default: 3).
    pub max_workers: usize,
    /// Additional per-run system guidance. This is inserted immediately before
    /// the user turn, so it works with both default and caller-supplied prompts.
    pub system_instructions: Option<String>,
    /// When to engage the propose-k search layer (System-2). Default is
    /// [`SearchMode::Stalled { turns: 4 }`]; set to [`SearchMode::Off`] for a
    /// true no-op (byte-identical to the pre-WP6 loop).
    pub search: SearchMode,
}

impl Default for RunConfig {
    fn default() -> Self {
        Self {
            temperature: None,
            max_turns: 200,
            max_llm_attempts: MAX_LLM_ATTEMPTS,
            llm_retry_base_delay: Duration::from_secs(1),
            nudge_interval: 6,
            extract_contracts: true,
            goal_tracking: true,
            max_workers: 3,
            system_instructions: None,
            search: SearchMode::default(),
        }
    }
}

fn sampling_temperature(config: &RunConfig, default: f32) -> f32 {
    config.temperature.unwrap_or(default)
}

fn system_instruction_count(messages: &[ChatMessage], instruction: Option<&str>) -> usize {
    let Some(instruction) = instruction else {
        return 0;
    };
    messages
        .iter()
        .filter(
            |message| matches!(message, ChatMessage::System { content } if content == instruction),
        )
        .count()
}

fn remove_added_system_instruction(
    messages: &mut Vec<ChatMessage>,
    instruction: Option<&str>,
    previous_count: usize,
) {
    let Some(instruction) = instruction else {
        return;
    };
    if system_instruction_count(messages, Some(instruction)) <= previous_count {
        return;
    }
    if let Some(index) = messages.iter().rposition(
        |message| matches!(message, ChatMessage::System { content } if content == instruction),
    ) {
        messages.remove(index);
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
    run_prompt_with_runtime(
        session,
        prompt,
        selection,
        tx,
        runtime,
        RunConfig::default(),
    )
    .await
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
    let instruction = config.system_instructions.clone();
    let previous_count = system_instruction_count(&session.messages, instruction.as_deref());
    let result =
        run_prompt_with_runtime_inner(session, prompt, selection, tx, runtime, config).await;
    remove_added_system_instruction(
        &mut session.messages,
        instruction.as_deref(),
        previous_count,
    );
    result
}

async fn run_prompt_with_runtime_inner(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: RunConfig,
) -> Result<String, AppError> {
    // If the runtime has no event sink set, attach this run's `tx` so that
    // `delegate_to_agent` subagent events stream to the parent by default.
    // Callers that pre-wired a sink keep their context.
    let runtime = if runtime.has_event_sink() {
        runtime
    } else {
        runtime.with_delegate_context(tx.clone(), selection.clone())
    };
    // If the session has a system prompt override, use chat mode.
    // Otherwise, auto-select mode based on the prompt.
    let (mode, mode_reasoning) = if session.system_prompt_override.is_some() {
        (
            chat_mode(),
            "Using system prompt override — chat mode".to_string(),
        )
    } else {
        auto_select_mode(prompt)
    };

    let client = initialize_model_client(selection, session, tx).await?;

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
        session.messages.push(ChatMessage::System {
            content: system_prompt,
        });
    }

    if let Some(instructions) = config.system_instructions.as_ref() {
        session.messages.push(ChatMessage::System {
            content: instructions.clone(),
        });
    }

    if config.extract_contracts {
        if let Some(contract_summary) = extract_contract_summary(prompt) {
            session.messages.push(ChatMessage::System {
                content: contract_summary,
            });
        }
    }

    session.messages.push(ChatMessage::User {
        content: prompt.to_string(),
    });

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
                            "symbol": g.symbol,
                        })).collect::<Vec<_>>(),
                    })),
            );
        }
        Some(gt)
    } else {
        None
    };

    // Parse cache shared across this run for AST-verified goal satisfaction
    // (WP2). Only constructed when goal tracking is enabled.
    let mut parse_cache = if config.goal_tracking {
        Some(khadim_code_graph::ParseCache::new())
    } else {
        None
    };

    let max_turns = config.max_turns;
    let mut turn_index: usize = 0;
    // Per-turn goal-count heuristic history (WP6). Pushed after each turn's
    // goal_tracker update; used by the search trigger to detect stalls.
    let mut heuristic_history: Vec<usize> = Vec::new();
    // Lazy-initialized proposer for the propose-k search layer. Built on first
    // engagement so we don't pay the cost (or hold the Arc) when search is Off.
    let mut proposer: Option<ProposerFn> = None;
    let scorer = Scorer;
    loop {
        if turn_index >= max_turns {
            let message = format!("Reached maximum turn limit ({max_turns}). Stopping.");
            let _ = tx.send(make_event(session, "error").with_content(message.clone()));
            return Err(AppError::health(message));
        }
        if config.nudge_interval > 0 && turn_index > 0 && turn_index % config.nudge_interval == 0 {
            let nudge = goal_tracker
                .as_ref()
                .and_then(|gt| gt.nudge())
                .unwrap_or_else(|| progress_nudge(turn_index));
            session
                .messages
                .push(ChatMessage::System { content: nudge });
        }

        // ── WP6: propose-k search trigger ──────────────────────────────────
        // Check whether the search layer should engage this turn. Only engages
        // when goal tracking is on and we have a goal tracker + parse cache.
        if let (Some(gt), Some(pc)) = (goal_tracker.as_ref(), parse_cache.as_mut()) {
            let current_h = gt.heuristic();
            if let Some(trigger) =
                search::should_engage(&config.search, &heuristic_history, current_h)
            {
                // Emit search_engaged.
                let stall_length = match &config.search {
                    SearchMode::Stalled { turns } => Some(*turns),
                    _ => None,
                };
                let _ = tx.send(make_event(session, "search_engaged").with_metadata(json!({
                    "turn": turn_index,
                    "trigger": trigger,
                    "stall_length": stall_length,
                })));

                // Build the proposer on first engagement.
                if proposer.is_none() {
                    proposer = Some(search::make_model_proposer(client.clone()));
                }

                let context = Context {
                    messages: session.messages.clone(),
                    tools: runtime.definitions(),
                    session_id: Some(session.id.clone()),
                };

                let action = search::propose_and_select(
                    proposer.as_ref().unwrap(),
                    &context,
                    3,
                    &scorer,
                    gt,
                    pc,
                    tx,
                    sampling_temperature(&config, 0.9),
                )
                .await?;

                // If the selected action is a tool call, synthesize it,
                // execute it, and continue the loop (skip the normal LLM call).
                if let Some(tool_call_json) = action.tool_call {
                    let name = tool_call_json
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let arguments = tool_call_json
                        .get("arguments")
                        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
                        .unwrap_or_else(|| "{}".to_string());
                    let id = format!("search-{turn_index}");
                    let tool_call = ToolCall {
                        id: id.clone(),
                        call_type: "function".to_string(),
                        function: ToolFunction { name, arguments },
                    };

                    session.messages.push(ChatMessage::Assistant {
                        content: Some(format!("[search] {}", action.rationale)),
                        tool_calls: vec![tool_call.clone()],
                        reasoning_content: None,
                    });

                    execute_tool_calls(
                        vec![tool_call],
                        &runtime,
                        tx,
                        session,
                        goal_tracker.as_mut(),
                        parse_cache.as_mut(),
                        config.max_workers,
                    )
                    .await;

                    // Push the post-turn heuristic.
                    if let Some(gt) = goal_tracker.as_ref() {
                        heuristic_history.push(gt.heuristic());
                    }
                    turn_index += 1;
                    continue;
                }

                // If only a plan note, inject it as a system nudge and fall
                // through to the normal LLM call.
                if let Some(note) = action.plan_note {
                    session.messages.push(ChatMessage::System {
                        content: format!("[search note] {note}"),
                    });
                }
            }
        }
        // ── end WP6 trigger ─────────────────────────────────────────────────

        let context = Context {
            messages: session.messages.clone(),
            tools: runtime.definitions(),
            session_id: Some(session.id.clone()),
        };

        let mut retry_count = 0u32;
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
                    sampling_temperature(&config, mode.temperature),
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
                                let _ = stream_tx_inner
                                    .send(make_ev_inner("text_delta").with_content(delta));
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
                            AssistantStreamEvent::ToolCallDelta {
                                id,
                                name,
                                arguments,
                            } => {
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
                                            "title": format!(
                                                "Preparing {}",
                                                tool_call.function.name
                                            ),
                                            "tool": tool_call.function.name,
                                        })),
                                );
                            }
                            AssistantStreamEvent::Error(message) => {
                                let _ = stream_tx_inner.send(
                                    make_ev_inner("step_update")
                                        .with_content(message)
                                        .with_metadata(json!({
                                            "id": thinking_id,
                                            "title": "Model stream error",
                                            "tool": "model",
                                            "kind": "stream_error",
                                        })),
                                );
                            }
                            AssistantStreamEvent::Usage(usage) => {
                                let _ = stream_tx_inner.send(make_ev_inner("usage").with_metadata(
                                    json!({
                                        "input": usage.input,
                                        "output": usage.output,
                                        "cache_read": usage.cache_read,
                                        "cache_write": usage.cache_write,
                                    }),
                                ));
                            }
                            AssistantStreamEvent::Start
                            | AssistantStreamEvent::TextStart
                            | AssistantStreamEvent::TextEnd(_)
                            | AssistantStreamEvent::Done => {}
                        }
                    }),
                )
                .await;
            let _ = tx.send(make_event(session, "llm_call_end"));

            match result {
                Ok(reply) => break reply,
                Err(err) => {
                    retry_count += 1;
                    match emit_llm_failure_event(
                        session,
                        tx,
                        retry_count,
                        config.max_llm_attempts.max(1),
                        config.llm_retry_base_delay,
                        &err,
                    ) {
                        LlmFailureDisposition::RetryAfter(delay) => {
                            if !delay.is_zero() {
                                tokio::time::sleep(delay).await;
                            }
                        }
                        LlmFailureDisposition::Exhausted => return Err(err),
                    }
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

            execute_tool_calls(
                reply.tool_calls,
                &runtime,
                tx,
                session,
                goal_tracker.as_mut(),
                parse_cache.as_mut(),
                config.max_workers,
            )
            .await;

            // WP6: record the post-turn heuristic for stall detection.
            if let Some(gt) = goal_tracker.as_ref() {
                heuristic_history.push(gt.heuristic());
            }
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
    let runtime = AgentRuntime::new(&session.cwd);
    run_prompt_with_runtime_and_explicit_mode_and_config(
        session,
        prompt,
        selection,
        mode,
        tx,
        runtime,
        RunConfig::default(),
    )
    .await
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
    run_prompt_with_runtime_and_explicit_mode_and_config(
        session,
        prompt,
        selection,
        mode,
        tx,
        runtime,
        RunConfig::default(),
    )
    .await
}

/// Run a prompt with an explicit mode, pre-configured runtime, and explicit
/// `RunConfig`. Used by the worker infrastructure (and power callers) to apply
/// per-run limits (e.g. bounded subagent turns).
pub async fn run_prompt_with_runtime_and_explicit_mode_and_config(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    mode: AgentModeDefinition,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: RunConfig,
) -> Result<String, AppError> {
    let runtime = if runtime.has_event_sink() {
        runtime
    } else {
        runtime.with_delegate_context(tx.clone(), selection.clone())
    };
    let saved_override = session.system_prompt_override.take();
    let result = match initialize_model_client(selection, session, tx).await {
        Ok(client) => {
            let executor: Arc<dyn ModelExecutor> = Arc::new(client);
            run_prompt_inner(session, prompt, executor, tx, runtime, mode, config).await
        }
        Err(err) => Err(err),
    };
    session.system_prompt_override = saved_override;
    result
}

/// Run an explicit-mode session with an injected model executor.
///
/// This is the durable session-level integration seam for tests and alternate
/// model runtimes. It runs the same streaming, tool execution, retry, message,
/// and terminal-event logic as the production explicit-mode wrappers.
pub async fn run_prompt_with_model_executor(
    session: &mut KhadimSession,
    prompt: &str,
    executor: Arc<dyn ModelExecutor>,
    mode: AgentModeDefinition,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: RunConfig,
) -> Result<String, AppError> {
    // Explicit modes deliberately ignore a session override for this run, but
    // the caller's session setting must survive both success and failure.
    let saved_override = session.system_prompt_override.take();
    let result = run_prompt_inner(session, prompt, executor, tx, runtime, mode, config).await;
    session.system_prompt_override = saved_override;
    result
}

/// Internal: Run the loop with an explicit mode (no auto-selection).
async fn run_prompt_inner(
    session: &mut KhadimSession,
    prompt: &str,
    client: Arc<dyn ModelExecutor>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    mode: AgentModeDefinition,
    config: RunConfig,
) -> Result<String, AppError> {
    let instruction = config.system_instructions.clone();
    let previous_count = system_instruction_count(&session.messages, instruction.as_deref());
    let result = run_prompt_inner_body(session, prompt, client, tx, runtime, mode, config).await;
    remove_added_system_instruction(
        &mut session.messages,
        instruction.as_deref(),
        previous_count,
    );
    result
}

async fn run_prompt_inner_body(
    session: &mut KhadimSession,
    prompt: &str,
    client: Arc<dyn ModelExecutor>,
    tx: &tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    mode: AgentModeDefinition,
    config: RunConfig,
) -> Result<String, AppError> {
    let system_prompt = match &session.system_prompt_override {
        Some(override_prompt) => override_prompt.clone(),
        None => runtime.build_prompt(&mode),
    };

    repair_session_messages(&mut session.messages);

    if session.messages.is_empty() {
        session.messages.push(ChatMessage::System {
            content: system_prompt,
        });
    }

    if let Some(instructions) = config.system_instructions.as_ref() {
        session.messages.push(ChatMessage::System {
            content: instructions.clone(),
        });
    }

    if config.extract_contracts {
        if let Some(contract_summary) = extract_contract_summary(prompt) {
            session.messages.push(ChatMessage::System {
                content: contract_summary,
            });
        }
    }

    session.messages.push(ChatMessage::User {
        content: prompt.to_string(),
    });

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
                            "symbol": g.symbol,
                        })).collect::<Vec<_>>(),
                    })),
            );
        }
        Some(gt)
    } else {
        None
    };

    // Parse cache shared across this run for AST-verified goal satisfaction
    // (WP2). Only constructed when goal tracking is enabled.
    let mut parse_cache = if config.goal_tracking {
        Some(khadim_code_graph::ParseCache::new())
    } else {
        None
    };

    let max_turns = config.max_turns;
    let mut turn_index: usize = 0;
    loop {
        if turn_index >= max_turns {
            let message = format!("Reached maximum turn limit ({max_turns}). Stopping.");
            let _ = tx.send(make_event(session, "error").with_content(message.clone()));
            return Err(AppError::health(message));
        }
        if config.nudge_interval > 0 && turn_index > 0 && turn_index % config.nudge_interval == 0 {
            let nudge = goal_tracker
                .as_ref()
                .and_then(|gt| gt.nudge())
                .unwrap_or_else(|| progress_nudge(turn_index));
            session
                .messages
                .push(ChatMessage::System { content: nudge });
        }

        let context = Context {
            messages: session.messages.clone(),
            tools: runtime.definitions(),
            session_id: Some(session.id.clone()),
        };

        let mut retry_count = 0u32;
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
                    sampling_temperature(&config, mode.temperature),
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
                                let _ = stream_tx_inner
                                    .send(make_ev_inner("text_delta").with_content(delta));
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
                            AssistantStreamEvent::ToolCallDelta {
                                id,
                                name,
                                arguments,
                            } => {
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
                                            "title": format!(
                                                "Preparing {}",
                                                tool_call.function.name
                                            ),
                                            "tool": tool_call.function.name,
                                        })),
                                );
                            }
                            AssistantStreamEvent::Error(message) => {
                                let _ = stream_tx_inner.send(
                                    make_ev_inner("step_update")
                                        .with_content(message)
                                        .with_metadata(json!({
                                            "id": thinking_id,
                                            "title": "Model stream error",
                                            "tool": "model",
                                            "kind": "stream_error",
                                        })),
                                );
                            }
                            AssistantStreamEvent::Usage(usage) => {
                                let _ = stream_tx_inner.send(make_ev_inner("usage").with_metadata(
                                    json!({
                                        "input": usage.input,
                                        "output": usage.output,
                                        "cache_read": usage.cache_read,
                                        "cache_write": usage.cache_write,
                                    }),
                                ));
                            }
                            AssistantStreamEvent::Start
                            | AssistantStreamEvent::TextStart
                            | AssistantStreamEvent::TextEnd(_)
                            | AssistantStreamEvent::Done => {}
                        }
                    }),
                )
                .await;
            let _ = tx.send(make_event(session, "llm_call_end"));

            match result {
                Ok(reply) => break reply,
                Err(err) => {
                    retry_count += 1;
                    match emit_llm_failure_event(
                        session,
                        tx,
                        retry_count,
                        config.max_llm_attempts.max(1),
                        config.llm_retry_base_delay,
                        &err,
                    ) {
                        LlmFailureDisposition::RetryAfter(delay) => {
                            if !delay.is_zero() {
                                tokio::time::sleep(delay).await;
                            }
                        }
                        LlmFailureDisposition::Exhausted => return Err(err),
                    }
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

            execute_tool_calls(
                reply.tool_calls,
                &runtime,
                tx,
                session,
                goal_tracker.as_mut(),
                parse_cache.as_mut(),
                config.max_workers,
            )
            .await;

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

#[cfg(test)]
mod temperature_tests {
    use super::*;

    #[test]
    fn per_run_temperature_overrides_mode_temperature_and_none_preserves_it() {
        let mut config = RunConfig::default();
        assert_eq!(sampling_temperature(&config, 0.4), 0.4);

        config.temperature = Some(1.25);
        assert_eq!(sampling_temperature(&config, 0.4), 1.25);
    }
}

#[cfg(test)]
mod retry_tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn fail_once_then_succeed_emits_only_nonterminal_retry_event() {
        let session = KhadimSession::new(PathBuf::from("/tmp"));
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let disposition = emit_llm_failure_event(
            &session,
            &tx,
            1,
            3,
            Duration::from_secs(1),
            &AppError::health("temporary outage"),
        );

        assert_eq!(
            disposition,
            LlmFailureDisposition::RetryAfter(Duration::from_secs(2))
        );

        let events: Vec<_> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        let retry_events: Vec<_> = events
            .iter()
            .filter(|event| {
                event.event_type == "step_update"
                    && event.metadata.as_ref().and_then(|value| value.get("kind"))
                        == Some(&json!("retry"))
            })
            .collect();

        assert_eq!(retry_events.len(), 1);
        assert_eq!(retry_events[0].metadata.as_ref().unwrap()["attempt"], 1);
        assert_eq!(
            retry_events[0].metadata.as_ref().unwrap()["max_attempts"],
            3
        );
        assert_eq!(retry_events[0].metadata.as_ref().unwrap()["tool"], "model");
        assert_eq!(
            retry_events[0].metadata.as_ref().unwrap()["id"],
            "llm-retry-1"
        );
        assert_eq!(
            retry_events[0].metadata.as_ref().unwrap()["title"],
            "Retrying model call (1/3)"
        );
        assert!(events.iter().all(|event| event.event_type != "error"));
    }

    #[test]
    fn always_fail_emits_one_terminal_error_after_retry_updates() {
        let session = KhadimSession::new(PathBuf::from("/tmp"));
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let errors = [
            AppError::health("outage 1"),
            AppError::health("outage 2"),
            AppError::health("outage 3"),
        ];
        let dispositions: Vec<_> = errors
            .iter()
            .enumerate()
            .map(|(index, err)| {
                emit_llm_failure_event(
                    &session,
                    &tx,
                    index as u32 + 1,
                    3,
                    Duration::from_secs(1),
                    err,
                )
            })
            .collect();

        assert_eq!(
            dispositions,
            vec![
                LlmFailureDisposition::RetryAfter(Duration::from_secs(2)),
                LlmFailureDisposition::RetryAfter(Duration::from_secs(4)),
                LlmFailureDisposition::Exhausted,
            ]
        );

        let events: Vec<_> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        let retry_events: Vec<_> = events
            .iter()
            .filter(|event| {
                event.event_type == "step_update"
                    && event.metadata.as_ref().and_then(|value| value.get("kind"))
                        == Some(&json!("retry"))
            })
            .collect();
        let error_events: Vec<_> = events
            .iter()
            .filter(|event| event.event_type == "error")
            .collect();

        assert_eq!(retry_events.len(), 2);
        assert_eq!(error_events.len(), 1);
        assert_eq!(
            error_events[0].content.as_deref(),
            Some("LLM call failed after 3 attempts: outage 3")
        );
        assert_eq!(
            error_events[0].metadata.as_ref().unwrap()["kind"],
            "llm_failure"
        );
        assert_eq!(error_events[0].metadata.as_ref().unwrap()["attempts"], 3);
        assert!(events.iter().all(|event| event.event_type != "done"));
    }

    #[tokio::test]
    async fn model_client_initialization_failure_emits_one_terminal_error() {
        let mut session = KhadimSession::new(PathBuf::from("/tmp"));
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let selection = ModelSelection {
            provider: "missing-key-test-provider".to_string(),
            model_id: "test-model".to_string(),
            display_name: None,
            api_key: None,
            base_url: None,
        };

        let result =
            run_prompt_with_explicit_mode(&mut session, "hello", Some(selection), chat_mode(), &tx)
                .await;

        assert!(result.is_err());
        let events: Vec<_> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        let error_events: Vec<_> = events
            .iter()
            .filter(|event| event.event_type == "error")
            .collect();

        assert_eq!(error_events.len(), 1);
        assert!(error_events[0]
            .content
            .as_deref()
            .unwrap()
            .starts_with("Failed to initialize model client: Missing API key"));
        assert_eq!(
            error_events[0].metadata.as_ref().unwrap()["kind"],
            "llm_initialization_failure"
        );
        assert!(events.iter().all(|event| event.event_type != "done"));
    }
}
