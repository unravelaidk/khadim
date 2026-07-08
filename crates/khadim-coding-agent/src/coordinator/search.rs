//! Propose-k search (System-2): when the goal-count heuristic stalls (or
//! always, if configured), sample `k` candidate next actions from the LLM in
//! parallel and pick the best by a symbolic score.
//!
//! See `docs/plans/multi-agent-coordinator.md` (WP6) for the design.
//!
//! # Scoring formula
//!
//! Each candidate is scored by [`Scorer::score`] as:
//!
//! ```text
//! final = goal_delta + precondition_validity + lease_compatibility
//! ```
//!
//! - `goal_delta` (max 2.0):
//!   - +1.0 if the candidate's tool is `write`/`edit` and its arguments
//!     reference a file named in an unsatisfied goal's description.
//!   - +0.5 extra if that goal has a `symbol` and the tool would plausibly
//!     create/modify it (write to that file).
//!   - +1.0 if the tool is `bash`/`shell` and it matches a `VerifyOutcome`
//!     goal (the verification command is in the goal description or the
//!     arguments contain the goal description).
//!   - Capped at 2.0.
//! - `precondition_validity`:
//!   - -1.0 if the target file is in a supported language but does NOT
//!     currently parse (the file is broken — penalize edits to it).
//!   - +0.5 if the goal is a `ModifyFile` and `function_exists` for the
//!     goal's symbol (the thing to modify is present).
//!   - 0.0 neutral otherwise.
//! - `lease_compatibility`: 0.0 (neutral — WP7 wires WP4 leases).
//!
//! # Testability
//!
//! [`propose_and_select`] takes an injectable async closure
//! ([`ProposerFn`]) for the LLM call so tests can stub the proposer without a
//! real [`ModelClient`]. The real path constructs a `ProposerFn` from
//! [`ModelClient::complete`].

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use khadim_ai_core::error::AppError;
use khadim_ai_core::types::{ChatMessage, CompletionResponse, Context};
use khadim_ai_core::ModelClient;
use khadim_code_graph::ParseCache;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::agent::goal_tracker::{GoalKind, GoalTracker};
use crate::events::AgentStreamEvent;
use crate::helpers::try_repair_json;

/// When to engage the propose-k search layer.
///
/// `Off` is a true no-op: the orchestrator loop behaves identically to today.
/// `Stalled { turns }` engages when the heuristic has been flat for `turns`
/// consecutive turns and is still > 0 (not done). `Always` engages every turn
/// where the heuristic > 0.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum SearchMode {
    /// Never engage search. Behaviour-identical to the pre-WP6 loop.
    Off,
    /// Engage when the goal-count heuristic is flat for `turns` turns and > 0.
    Stalled { turns: usize },
    /// Engage every turn where the heuristic > 0.
    Always,
}

impl Default for SearchMode {
    fn default() -> Self {
        // 4-turn stall window. This keeps current behaviour effectively
        // unchanged until a stall actually happens; `Off` is the true no-op.
        SearchMode::Stalled { turns: 4 }
    }
}

/// The outcome of [`propose_and_select`]: the single best next action.
///
/// `tool_call` is `Some` when the winning candidate proposes a tool call (a
/// JSON object with `name` + `arguments`); the orchestrator synthesizes a
/// [`ToolCall`], executes it, and `continue`s the loop. `plan_note` is `Some`
/// when the winning candidate is a pure plan note (injected as a system nudge)
/// and the orchestrator proceeds with the normal LLM call. Both may be `Some`
/// (a tool call with an accompanying plan note); both being `None` means the
/// proposer returned nothing usable.
#[derive(Debug, Clone)]
pub struct SelectedAction {
    pub tool_call: Option<Value>,
    pub plan_note: Option<String>,
    pub rationale: String,
    pub score: f64,
}

/// A single candidate next action parsed from an LLM proposer reply.
///
/// Built either from the reply's `tool_calls` (preferred) or from a JSON object
/// in the reply content.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub tool_name: Option<String>,
    pub arguments: Option<Value>,
    pub plan_note: Option<String>,
    pub rationale: String,
}

/// Injectable proposer closure: takes a [`Context`] and returns a completion.
///
/// Tests pass a stub; the real path uses [`make_model_proposer`].
pub type ProposerFn = Arc<
    dyn Fn(Context, f32) -> Pin<Box<dyn Future<Output = Result<CompletionResponse, AppError>> + Send>>
        + Send
        + Sync,
>;

/// Score a candidate next action against the goal tracker and parse cache.
///
/// See the module docs for the full formula.
///
/// Note: `parse_cache` is `&mut` because [`ParseCache::parse_valid`] requires
/// `&mut self` to potentially parse uncached source. In practice the scorer
/// only calls `parse_valid` on already-cached files (checked via `tree()`),
/// so no mutation occurs on the hot path — but the signature must allow it.
pub struct Scorer;

impl Scorer {
    pub fn score(&self, candidate: &Candidate, goal_tracker: &GoalTracker, parse_cache: &mut ParseCache) -> f64 {
        let goal_delta = score_goal_delta(candidate, goal_tracker);
        let precondition = score_precondition_validity(candidate, goal_tracker, parse_cache);
        let lease_compatibility = 0.0;
        goal_delta + precondition + lease_compatibility
    }
}

/// `goal_delta` component (max 2.0).
fn score_goal_delta(candidate: &Candidate, goal_tracker: &GoalTracker) -> f64 {
    let tool = candidate.tool_name.as_deref().unwrap_or("");
    let args_text = candidate
        .arguments
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default())
        .unwrap_or_default();

    let mut delta = 0.0f64;
    for goal in goal_tracker.goals.iter().filter(|g| !g.satisfied) {
        match goal.kind {
            GoalKind::CreateFile | GoalKind::ModifyFile => {
                let is_write = matches!(tool, "write" | "edit" | "append" | "patch");
                if is_write && args_text.contains(&goal.description) {
                    delta += 1.0;
                    if goal.symbol.is_some() {
                        // The tool writes to this file, plausibly creating/modifying the symbol.
                        delta += 0.5;
                    }
                }
            }
            GoalKind::VerifyOutcome => {
                if matches!(tool, "bash" | "shell") {
                    let goal_lower = goal.description.to_ascii_lowercase();
                    let args_lower = args_text.to_ascii_lowercase();
                    if args_lower.contains(&goal_lower) {
                        delta += 1.0;
                    }
                }
            }
            GoalKind::RunCommand => {
                if matches!(tool, "bash" | "shell") {
                    let goal_lower = goal.description.to_ascii_lowercase();
                    let args_lower = args_text.to_ascii_lowercase();
                    if args_lower.contains(&goal_lower) {
                        delta += 1.0;
                    }
                }
            }
            GoalKind::General => {}
        }
    }
    delta.min(2.0)
}

/// `precondition_validity` component.
fn score_precondition_validity(
    candidate: &Candidate,
    goal_tracker: &GoalTracker,
    parse_cache: &mut ParseCache,
) -> f64 {
    // Find the target file referenced by the candidate's arguments.
    let Some(args) = candidate.arguments.as_ref() else {
        return 0.0;
    };
    let Some(file_path) = extract_file_path(args) else {
        return 0.0;
    };
    let path = std::path::Path::new(&file_path);

    // Only score for supported languages.
    if parse_cache.language_id_for_path(path).is_none() {
        return 0.0;
    }

    let mut score = 0.0;

    // -1.0 if the target file is in a supported language but doesn't parse.
    // (i.e. it's cached and the cached parse has errors, or it's not cached
    // at all — treat "not cached" as neutral, since we may not have seen it).
    if parse_cache.tree(path).is_some() && !parse_cache.parse_valid(path, None) {
        score -= 1.0;
    }

    // +0.5 if the goal is ModifyFile and the function_exists for the goal's
    // symbol (the thing to modify is present).
    let args_text = serde_json::to_string(args).unwrap_or_default();
    for goal in goal_tracker.goals.iter().filter(|g| !g.satisfied) {
        if matches!(goal.kind, GoalKind::ModifyFile) {
            if let Some(symbol) = goal.symbol.as_ref() {
                if args_text.contains(&goal.description) && parse_cache.function_exists(path, symbol) {
                    score += 0.5;
                }
            }
        }
    }

    score
}

/// Extract the target file path from a candidate's arguments JSON.
fn extract_file_path(args: &Value) -> Option<String> {
    let obj = args.as_object()?;
    for key in ["path", "file_path", "file"] {
        if let Some(s) = obj.get(key).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Build the default [`ProposerFn`] backed by a real [`ModelClient`].
///
/// Each call issues `client.complete(context, temperature)`. The client is
/// wrapped in an [`Arc`] so the closure is cheaply cloneable.
pub fn make_model_proposer(client: ModelClient) -> ProposerFn {
    let client = Arc::new(client);
    Arc::new(move |context: Context, temperature: f32| {
        let client = client.clone();
        Box::pin(async move { client.complete(&context, temperature).await })
    })
}

/// The system message appended to the context for proposer calls.
const PROPOSER_SYSTEM: &str = "You are a proposer. Output JSON: \
{\"action_type\":\"tool_call\"|\"plan_note\",\"name\":\"<tool>\",\
\"arguments\":<json>,\"plan_note\":\"<text>\",\"rationale\":\"<text>\"}. \
Pick the single best next action toward the goals.";

/// Issue `k` parallel proposer calls, parse each reply into a [`Candidate`],
/// score them, and return the best one. Emits a `search_candidates` event with
/// metadata `{ candidates: [{ index, score, rationale }], selected_index }`.
///
/// `proposer` is the LLM-call closure (real or stub). `temperature` is the
/// sampling temperature for the proposer calls (default 0.9 for diversity).
pub async fn propose_and_select(
    proposer: &ProposerFn,
    context: &Context,
    k: usize,
    scorer: &Scorer,
    goal_tracker: &GoalTracker,
    parse_cache: &mut ParseCache,
    tx: &UnboundedSender<AgentStreamEvent>,
    temperature: f32,
) -> Result<SelectedAction, AppError> {
    // Build k contexts, each with the proposer system message appended.
    let contexts: Vec<Context> = (0..k)
        .map(|_| {
            let mut messages = context.messages.clone();
            messages.push(ChatMessage::System {
                content: PROPOSER_SYSTEM.to_string(),
            });
            Context {
                messages,
                tools: context.tools.clone(),
                session_id: context.session_id.clone(),
            }
        })
        .collect();

    // Issue k calls concurrently.
    let calls: Vec<_> = contexts
        .into_iter()
        .map(|ctx| {
            let proposer = proposer.clone();
            async move { proposer(ctx, temperature).await }
        })
        .collect();
    let replies: Vec<Result<CompletionResponse, AppError>> =
        futures::future::join_all(calls).await;

    // Parse each reply into a candidate (first usable candidate per reply).
    let mut candidates: Vec<Candidate> = Vec::with_capacity(k);
    for reply in replies.into_iter() {
        let candidate = match reply {
            Ok(r) => parse_candidate(&r),
            Err(_) => None,
        };
        candidates.push(candidate.unwrap_or(Candidate {
            tool_name: None,
            arguments: None,
            plan_note: None,
            rationale: "no candidate".to_string(),
        }));
    }

    // Score each candidate and pick the max (ties → first).
    let mut best_index = 0usize;
    let mut best_score = f64::NEG_INFINITY;
    let mut scored: Vec<(usize, f64, String)> = Vec::with_capacity(candidates.len());
    for (i, c) in candidates.iter().enumerate() {
        let s = scorer.score(c, goal_tracker, parse_cache);
        scored.push((i, s, c.rationale.clone()));
        if s > best_score {
            best_score = s;
            best_index = i;
        }
    }

    let selected = candidates.into_iter().nth(best_index).unwrap_or(Candidate {
        tool_name: None,
        arguments: None,
        plan_note: None,
        rationale: "no candidate".to_string(),
    });

    // Build the SelectedAction.
    let tool_call = if let (Some(name), Some(args)) = (selected.tool_name, selected.arguments) {
        Some(json!({
            "name": name,
            "arguments": args,
        }))
    } else {
        None
    };
    let selected_action = SelectedAction {
        tool_call,
        plan_note: selected.plan_note,
        rationale: selected.rationale.clone(),
        score: best_score,
    };

    // Emit the search_candidates event.
    let candidates_meta: Vec<Value> = scored
        .iter()
        .map(|(i, s, r)| {
            json!({
                "index": i,
                "score": s,
                "rationale": r,
            })
        })
        .collect();
    let _ = tx.send(
        AgentStreamEvent::new("search_candidates").with_metadata(json!({
            "candidates": candidates_meta,
            "selected_index": best_index,
        })),
    );

    Ok(selected_action)
}

/// Parse a [`CompletionResponse`] into a [`Candidate`].
///
/// Preference order:
/// 1. If the reply has `tool_calls`, use the first one directly.
/// 2. Else parse the content as JSON (tolerantly) and extract the fields.
fn parse_candidate(reply: &CompletionResponse) -> Option<Candidate> {
    // 1. Native tool calls.
    if let Some(first) = reply.tool_calls.first() {
        let args: Value = serde_json::from_str(&first.function.arguments)
            .ok()
            .or_else(|| try_repair_json(&first.function.arguments))
            .unwrap_or(json!({}));
        return Some(Candidate {
            tool_name: Some(first.function.name.clone()),
            arguments: Some(args),
            plan_note: None,
            rationale: String::new(),
        });
    }

    // 2. JSON in the content.
    let raw = reply.content.trim();
    if raw.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(raw).ok().or_else(|| try_repair_json(raw))?;

    let action_type = value
        .get("action_type")
        .and_then(|v| v.as_str())
        .unwrap_or("tool_call");
    let name = value.get("name").and_then(|v| v.as_str()).map(String::from);
    let arguments = value.get("arguments").cloned();
    let plan_note = value
        .get("plan_note")
        .and_then(|v| v.as_str())
        .map(String::from);
    let rationale = value
        .get("rationale")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_default();

    // If it's a plan_note action with no tool name, drop the tool fields.
    let (tool_name, arguments) = if action_type == "plan_note" {
        (None, None)
    } else {
        (name, arguments)
    };

    Some(Candidate {
        tool_name,
        arguments,
        plan_note,
        rationale,
    })
}

/// Decide whether the propose-k search should engage this turn.
///
/// Returns `Some(trigger)` when it should engage, where `trigger` is
/// `"stalled"` or `"always"`. Returns `None` when it should not.
///
/// `heuristic_history` is the per-turn sequence of heuristic values (after the
/// goal tracker update of each turn). `current_heuristic` is the latest value.
pub fn should_engage(
    mode: &SearchMode,
    heuristic_history: &[usize],
    current_heuristic: usize,
) -> Option<&'static str> {
    if current_heuristic == 0 {
        return None;
    }
    match mode {
        SearchMode::Off => None,
        SearchMode::Always => Some("always"),
        SearchMode::Stalled { turns } => {
            if heuristic_history.len() < *turns {
                return None;
            }
            // Last `turns` values all equal → stalled.
            let tail = &heuristic_history[heuristic_history.len() - turns..];
            let first = tail[0];
            if tail.iter().all(|v| *v == first) {
                Some("stalled")
            } else {
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::goal_tracker::Goal;
    use khadim_ai_core::types::{ToolCall, ToolFunction, Usage};
    use std::sync::Arc;
    use tokio::sync::mpsc::unbounded_channel;

    // ── Scorer tests ───────────────────────────────────────────────────────

    fn tracker_with(goals: Vec<Goal>) -> GoalTracker {
        GoalTracker { goals }
    }

    fn make_goal(kind: GoalKind, desc: &str, symbol: Option<&str>) -> Goal {
        Goal {
            kind,
            description: desc.to_string(),
            satisfied: false,
            symbol: symbol.map(String::from),
        }
    }

    #[test]
    fn scorer_write_to_goal_file_with_symbol_scores_high() {
        let gt = tracker_with(vec![make_goal(
            GoalKind::CreateFile,
            "src/foo.rs",
            Some("bar"),
        )]);
        let mut cache = ParseCache::new();
        let scorer = Scorer;
        let candidate = Candidate {
            tool_name: Some("write".to_string()),
            arguments: Some(json!({"path": "src/foo.rs", "content": "fn bar() {}"})),
            plan_note: None,
            rationale: "writes foo.rs with bar".to_string(),
        };
        let score = scorer.score(&candidate, &gt, &mut cache);
        // +1.0 (write to goal file) + 0.5 (symbol present) + 0.0 precondition (not cached) = 1.5
        assert!(
            score >= 1.4,
            "write to goal file with symbol should score >=1.4, got {score}"
        );
    }

    #[test]
    fn scorer_unrelated_write_scores_lower() {
        let gt = tracker_with(vec![make_goal(
            GoalKind::CreateFile,
            "src/foo.rs",
            Some("bar"),
        )]);
        let mut cache = ParseCache::new();
        let scorer = Scorer;
        let related = Candidate {
            tool_name: Some("write".to_string()),
            arguments: Some(json!({"path": "src/foo.rs"})),
            plan_note: None,
            rationale: "writes foo.rs".to_string(),
        };
        let unrelated = Candidate {
            tool_name: Some("write".to_string()),
            arguments: Some(json!({"path": "other.rs"})),
            plan_note: None,
            rationale: "writes other.rs".to_string(),
        };
        let rel_score = scorer.score(&related, &gt, &mut cache);
        let unrel_score = scorer.score(&unrelated, &gt, &mut cache);
        assert!(
            rel_score > unrel_score,
            "related write ({rel_score}) should outscore unrelated ({unrel_score})"
        );
    }

    #[test]
    fn scorer_unparseable_file_gets_precondition_penalty() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("foo.rs");
        let path_str = file_path.to_str().unwrap().to_string();

        let gt = tracker_with(vec![make_goal(
            GoalKind::ModifyFile,
            &path_str,
            Some("bar"),
        )]);
        let mut cache = ParseCache::new();
        // Parse a broken file into the cache so parse_valid is false.
        let _ = cache.parse(&file_path, "fn bar( { broken\n");

        let scorer = Scorer;
        let candidate = Candidate {
            tool_name: Some("edit".to_string()),
            arguments: Some(json!({"path": path_str.clone()})),
            plan_note: None,
            rationale: "edit foo.rs".to_string(),
        };
        let score = scorer.score(&candidate, &gt, &mut cache);
        // goal_delta: +1.0 (edit to goal file) + 0.5 (symbol) = 1.5
        // precondition: -1.0 (file cached but doesn't parse) — and function_exists is false (bar not defined), so no +0.5
        // total: 1.5 - 1.0 = 0.5
        assert!(
            score <= 0.6,
            "broken file should incur precondition penalty, got {score}"
        );
    }

    #[test]
    fn scorer_bash_matching_verifyoutcome_gets_goal_delta() {
        let gt = tracker_with(vec![make_goal(
            GoalKind::VerifyOutcome,
            "ensure tests pass",
            None,
        )]);
        let mut cache = ParseCache::new();
        let scorer = Scorer;
        let candidate = Candidate {
            tool_name: Some("bash".to_string()),
            arguments: Some(json!({"command": "ensure tests pass && cargo test"})),
            plan_note: None,
            rationale: "run tests".to_string(),
        };
        let score = scorer.score(&candidate, &gt, &mut cache);
        assert!(
            score >= 1.0,
            "bash matching VerifyOutcome should get goal_delta >=1.0, got {score}"
        );
    }

    #[test]
    fn scorer_modifyfile_function_exists_gets_precondition_bonus() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("foo.rs");
        let path_str = file_path.to_str().unwrap().to_string();

        let gt = tracker_with(vec![make_goal(
            GoalKind::ModifyFile,
            &path_str,
            Some("bar"),
        )]);
        let mut cache = ParseCache::new();
        let _ = cache.parse(&file_path, "fn bar() -> i32 { 1 }\n");

        let scorer = Scorer;
        let candidate = Candidate {
            tool_name: Some("edit".to_string()),
            arguments: Some(json!({"path": path_str.clone()})),
            plan_note: None,
            rationale: "edit foo.rs".to_string(),
        };
        let score = scorer.score(&candidate, &gt, &mut cache);
        // goal_delta: +1.0 (edit to goal file) + 0.5 (symbol) = 1.5
        // precondition: +0.5 (function_exists for bar) — file parses fine so no -1.0
        // total: 1.5 + 0.5 = 2.0
        assert!(
            score >= 1.9,
            "modify with existing function should get bonus, got {score}"
        );
    }

    // ── parse_candidate tests ─────────────────────────────────────────────

    #[test]
    fn parse_candidate_from_tool_call() {
        let reply = CompletionResponse {
            content: String::new(),
            tool_calls: vec![ToolCall {
                id: "c1".to_string(),
                call_type: "function".to_string(),
                function: ToolFunction {
                    name: "write".to_string(),
                    arguments: r#"{"path":"src/x.rs"}"#.to_string(),
                },
            }],
            usage: Usage::default(),
            reasoning_content: None,
        };
        let c = parse_candidate(&reply).unwrap();
        assert_eq!(c.tool_name.as_deref(), Some("write"));
        assert_eq!(c.arguments.unwrap()["path"], "src/x.rs");
    }

    #[test]
    fn parse_candidate_from_json_content() {
        let reply = CompletionResponse {
            content: r#"{"action_type":"plan_note","plan_note":"try X","rationale":"because"}"#.to_string(),
            tool_calls: vec![],
            usage: Usage::default(),
            reasoning_content: None,
        };
        let c = parse_candidate(&reply).unwrap();
        assert_eq!(c.plan_note.as_deref(), Some("try X"));
        assert!(c.tool_name.is_none(), "plan_note should drop tool name");
    }

    #[test]
    fn parse_candidate_tolerates_truncated_json() {
        let reply = CompletionResponse {
            content: r#"{"action_type":"tool_call","name":"write","arguments":{"path":"x.rs""#.to_string(),
            tool_calls: vec![],
            usage: Usage::default(),
            reasoning_content: None,
        };
        let c = parse_candidate(&reply).unwrap();
        assert_eq!(c.tool_name.as_deref(), Some("write"));
    }

    #[test]
    fn parse_candidate_returns_none_for_empty() {
        let reply = CompletionResponse {
            content: String::new(),
            tool_calls: vec![],
            usage: Usage::default(),
            reasoning_content: None,
        };
        assert!(parse_candidate(&reply).is_none());
    }

    // ── should_engage tests ────────────────────────────────────────────────

    #[test]
    fn engage_off_never() {
        let hist = vec![3, 3, 3, 3];
        assert!(should_engage(&SearchMode::Off, &hist, 3).is_none());
    }

    #[test]
    fn engage_stalled_flat_history() {
        let mode = SearchMode::Stalled { turns: 4 };
        let hist = vec![3, 3, 3, 3];
        assert_eq!(should_engage(&mode, &hist, 3), Some("stalled"));
    }

    #[test]
    fn engage_stalled_decreasing_history_no_engage() {
        let mode = SearchMode::Stalled { turns: 4 };
        let hist = vec![5, 4, 3, 2];
        assert!(should_engage(&mode, &hist, 2).is_none());
    }

    #[test]
    fn engage_stalled_short_history_no_engage() {
        let mode = SearchMode::Stalled { turns: 4 };
        let hist = vec![3, 3];
        assert!(should_engage(&mode, &hist, 3).is_none());
    }

    #[test]
    fn engage_stalled_heuristic_zero_no_engage() {
        let mode = SearchMode::Stalled { turns: 4 };
        let hist = vec![0, 0, 0, 0];
        assert!(should_engage(&mode, &hist, 0).is_none());
    }

    #[test]
    fn engage_always_when_heuristic_positive() {
        let mode = SearchMode::Always;
        let hist = vec![5];
        assert_eq!(should_engage(&mode, &hist, 5), Some("always"));
    }

    #[test]
    fn engage_always_zero_no_engage() {
        let mode = SearchMode::Always;
        assert!(should_engage(&mode, &[0], 0).is_none());
    }

    // ── propose_and_select with a stub proposer ────────────────────────────

    fn stub_proposer(reply: CompletionResponse) -> ProposerFn {
        Arc::new(move |_ctx: Context, _temp: f32| {
            let r = reply.clone();
            Box::pin(async move { Ok(r) })
        })
    }

    fn empty_context() -> Context {
        Context {
            messages: vec![ChatMessage::User { content: "do it".to_string() }],
            tools: vec![],
            session_id: None,
        }
    }

    #[tokio::test]
    async fn propose_and_select_picks_highest_scoring() {
        let gt = tracker_with(vec![make_goal(
            GoalKind::CreateFile,
            "src/foo.rs",
            Some("bar"),
        )]);
        let mut cache = ParseCache::new();

        // Reply A: a write to the goal file (high score).
        let reply_a = CompletionResponse {
            content: r#"{"action_type":"tool_call","name":"write","arguments":{"path":"src/foo.rs","content":"fn bar() {}"},"rationale":"writes goal file"}"#.to_string(),
            tool_calls: vec![],
            usage: Usage::default(),
            reasoning_content: None,
        };

        // We need a proposer that returns reply_a for every call (k=3). Since
        // the closure is called multiple times, clone inside the async block.
        let proposer: ProposerFn = Arc::new(move |_ctx: Context, _temp: f32| {
            let r = reply_a.clone();
            Box::pin(async move { Ok(r) })
        });

        let (tx, mut rx) = unbounded_channel::<AgentStreamEvent>();
        let scorer = Scorer;
        let action = propose_and_select(
            &proposer,
            &empty_context(),
            3,
            &scorer,
            &gt,
            &mut cache,
            &tx,
            0.9,
        )
        .await
        .expect("propose_and_select should succeed");

        assert!(action.tool_call.is_some(), "should select a tool call");
        let tc = action.tool_call.unwrap();
        assert_eq!(tc["name"], "write");
        assert_eq!(tc["arguments"]["path"], "src/foo.rs");

        // search_candidates event emitted.
        let ev = rx.recv().await.expect("event");
        assert_eq!(ev.event_type, "search_candidates");
        let meta = ev.metadata.unwrap();
        assert!(meta["candidates"].as_array().unwrap().len() == 3);
        assert!(meta["selected_index"].as_u64().is_some());
    }

    #[tokio::test]
    async fn propose_and_select_plan_note_when_no_tool() {
        let gt = tracker_with(vec![make_goal(
            GoalKind::General,
            "do something",
            None,
        )]);
        let mut cache = ParseCache::new();
        let reply = CompletionResponse {
            content: r#"{"action_type":"plan_note","plan_note":"consider X","rationale":"because"}"#.to_string(),
            tool_calls: vec![],
            usage: Usage::default(),
            reasoning_content: None,
        };
        let proposer = stub_proposer(reply);
        let (tx, _rx) = unbounded_channel::<AgentStreamEvent>();
        let scorer = Scorer;
        let action = propose_and_select(
            &proposer,
            &empty_context(),
            1,
            &scorer,
            &gt,
            &mut cache,
            &tx,
            0.9,
        )
        .await
        .unwrap();
        assert!(action.tool_call.is_none(), "plan_note should not produce a tool call");
        assert_eq!(action.plan_note.as_deref(), Some("consider X"));
    }

    #[tokio::test]
    async fn propose_and_select_handles_all_failures() {
        let gt = tracker_with(vec![]);
        let mut cache = ParseCache::new();
        let proposer: ProposerFn =
            Arc::new(|_ctx, _t| Box::pin(async { Err(AppError::invalid_input("boom")) }));
        let (tx, _rx) = unbounded_channel::<AgentStreamEvent>();
        let scorer = Scorer;
        let action = propose_and_select(
            &proposer,
            &empty_context(),
            2,
            &scorer,
            &gt,
            &mut cache,
            &tx,
            0.9,
        )
        .await
        .unwrap();
        // All candidates are empty; selected should have no tool_call.
        assert!(action.tool_call.is_none());
        assert!(action.plan_note.is_none());
    }
}