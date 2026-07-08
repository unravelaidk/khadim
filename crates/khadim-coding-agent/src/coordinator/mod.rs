//! Multi-agent coordinator: decompose → assign → spawn → monitor → aggregate.
//!
//! [`run_multi_agent`] is the top-level entry point. It takes a single user
//! prompt and fans it out across concurrent workers, each scoped to a subset
//! of goals and write paths, then aggregates their results.
//!
//! See `docs/plans/multi-agent-coordinator.md` (WP7) for the full design.
//!
//! # Ground rules
//!
//! - The single-agent path ([`crate::run_prompt_with_runtime`]) is untouched;
//!   multi-agent is strictly opt-in.
//! - Events use the existing string-typed [`crate::events::AgentStreamEvent`]
//!   — new event types are conventions (`event_type` string + JSON metadata).
//! - When WP6's `SearchMode` lands, [`MultiAgentConfig`] will gain a `search`
//!   field and the coordinator will thread it through the per-worker runs.
//!   Until then, search is not engaged.

pub mod assign;
pub mod lease;
pub mod lease_guard;
pub mod search;
pub mod worker;

pub use assign::WorkerAssignment;
pub use lease::{Conflict, Lease, LeaseId, LeaseManager};
pub use lease_guard::LeaseGuard;
pub use search::{ProposerFn, Scorer, SearchMode, SelectedAction, Candidate};
pub use worker::{spawn_worker, spawn_worker_with_runner, WorkerHandle, WorkerRunner, WorkerSpec, WriteScope};

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

use futures::future::BoxFuture;
use khadim_ai_core::error::AppError;
use khadim_ai_core::types::ModelSelection;
use khadim_code_graph::{CodeGraph, DistanceIndex, ParseCache};
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::agent::goal_board::{GoalBoard, GoalId, GoalStatus};
use crate::agent::goal_tracker::{GoalKind, GoalTracker};
use crate::agent::modes::{build_mode, chat_mode, explore_mode, sub_general_mode};
use crate::agent::session::KhadimSession;
use crate::agent::types::AgentModeDefinition;
use crate::events::AgentStreamEvent;
use crate::helpers::try_repair_json;
use crate::runtime::AgentRuntime;

/// Configuration for [`run_multi_agent`].
///
/// All fields have sensible defaults; callers override what they need.
#[derive(Debug, Clone)]
pub struct MultiAgentConfig {
    /// Upper bound on concurrently-running workers (default 3).
    pub max_workers: usize,
    /// Maximum number of times a goal may be reassigned to a fresh worker
    /// before it is marked [`GoalStatus::Blocked`] (default 2).
    pub max_reassignments: usize,
}

impl Default for MultiAgentConfig {
    fn default() -> Self {
        Self {
            max_workers: 3,
            max_reassignments: 2,
        }
    }
}

/// A decomposed goal as produced by the LLM decomposition step.
///
/// `kind` maps to [`GoalKind`]; `target_files` drive assignment and lease
/// scoping; `deps` is the list of goal indices this goal depends on.
#[derive(Debug, Clone)]
pub struct DecomposedGoal {
    pub kind: GoalKind,
    pub description: String,
    pub target_files: Vec<PathBuf>,
    pub deps: Vec<usize>,
}

/// The decomposer closure: takes the user prompt and returns a list of
/// decomposed goals. On any failure the caller falls back to
/// [`GoalTracker::from_prompt`], so the closure may return `Err` freely.
pub type Decomposer = Arc<
    dyn Fn(&str) -> Result<Vec<DecomposedGoal>, AppError> + Send + Sync,
>;

/// The goal-verifier closure: given a goal id, its target files/symbol, and
/// the worker's final summary, decide whether the goal is satisfied.
///
/// The default implementation reparses target files via [`ParseCache`] and
/// checks symbol existence (mirroring
/// [`GoalTracker::update_from_tool_json_with_graph`]). Tests inject a stub.
pub type GoalVerifier = Arc<
    dyn Fn(&GoalBoard, GoalId, &str) -> BoxFuture<'static, bool> + Send + Sync,
>;

/// Run a prompt across multiple concurrent workers.
///
/// Steps: decompose → build goal board → assign → spawn workers → monitor →
/// aggregate. Never fails the run on decomposition failure — always falls
/// back to [`GoalTracker::from_prompt`].
pub async fn run_multi_agent(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &UnboundedSender<AgentStreamEvent>,
    runtime: AgentRuntime,
    config: MultiAgentConfig,
) -> Result<String, AppError> {
    run_multi_agent_with(
        session,
        prompt,
        selection,
        tx,
        runtime,
        config,
        None,
        None,
        None,
    )
    .await
}

/// Internal entry point with injectable decomposer, verifier, and worker
/// runner (for tests).
///
/// When `decomposer` is `None`, the default LLM decomposition path is used
/// (builds a [`khadim_ai_core::ModelClient`] from `selection`). When
/// `verifier` is `None`, the default AST-verification path is used. When
/// `worker_runner` is `None`, the default worker runner (real LLM via
/// [`crate::agent::orchestrator::run_prompt_with_runtime_and_explicit_mode_and_config`])
/// is used.
pub async fn run_multi_agent_with(
    session: &mut KhadimSession,
    prompt: &str,
    selection: Option<ModelSelection>,
    tx: &UnboundedSender<AgentStreamEvent>,
    _runtime: AgentRuntime,
    config: MultiAgentConfig,
    decomposer: Option<Decomposer>,
    verifier: Option<GoalVerifier>,
    worker_runner: Option<WorkerRunner>,
) -> Result<String, AppError> {
    let root = session.cwd.clone();

    // ── (a) Decompose ───────────────────────────────────────────────────
    let decomposed: Vec<DecomposedGoal> = match decomposer {
        Some(f) => match f(prompt) {
            Ok(goals) if !goals.is_empty() => goals,
            _ => fallback_decompose(prompt),
        },
        None => match default_decompose(prompt, selection.clone()).await {
            Ok(goals) if !goals.is_empty() => goals,
            _ => fallback_decompose(prompt),
        },
    };

    // Build a GoalTracker from the decomposition (so the board carries the
    // right kind/description/symbol), then convert to a GoalBoard.
    let mut tracker = GoalTracker { goals: Vec::new() };
    for g in &decomposed {
        let mut goal = crate::agent::goal_tracker::Goal {
            kind: g.kind.clone(),
            description: g.description.clone(),
            satisfied: false,
            symbol: None,
        };
        // If the description names a file and there's a backticked symbol in
        // the prompt near it, the from_prompt path would set it; here we
        // reuse from_prompt's symbol extraction by scanning the original
        // prompt for the goal's description and pulling a nearby symbol.
        if let Some(sym) = crate::agent::goal_tracker::GoalTracker::from_prompt(prompt)
            .goals
            .iter()
            .find(|tg| tg.description == goal.description)
            .and_then(|tg| tg.symbol.clone())
        {
            goal.symbol = Some(sym);
        }
        tracker.goals.push(goal);
    }
    let mut board = GoalBoard::from_tracker(tracker);

    // Populate target_files + deps on the board from the decomposition.
    for (i, g) in decomposed.iter().enumerate() {
        if let Some(bg) = board.goals.get_mut(i) {
            bg.target_files = g.target_files.clone();
            bg.deps = g.deps.clone();
        }
    }

    emit_board_heuristic(&board, tx);

    if board.total() == 0 {
        // No goals — nothing to parallelize. Push a final message and done.
        let summary = "No goals decomposed from the prompt; nothing to do.".to_string();
        push_assistant(session, &summary);
        let _ = tx.send(AgentStreamEvent::new("done"));
        return Ok(summary);
    }

    // ── (b/c) Build code graph + distance index, assign goals ───────────
    let graph = CodeGraph::build(&root);
    let mut distance_index = DistanceIndex::new(graph);

    let goal_targets: Vec<(usize, Vec<PathBuf>)> = board
        .goals
        .iter()
        .enumerate()
        .map(|(i, bg)| (i, bg.target_files.clone()))
        .collect();

    let assignments = assign::assign(&goal_targets, &mut distance_index, config.max_workers);

    let assignments_meta: Vec<Value> = assignments
        .iter()
        .enumerate()
        .map(|(wi, a)| {
            json!({
                "worker_index": wi,
                "goals": a.goals,
                "mode": a.suggested_mode_name,
            })
        })
        .collect();
    let _ = tx.send(
        AgentStreamEvent::new("workers_assigned")
            .with_content(format!("Assigned {} worker(s)", assignments.len()))
            .with_metadata(json!({ "assignments": assignments_meta })),
    );

    // ── (d) Spawn workers ───────────────────────────────────────────────
    let lease_manager: Arc<Mutex<LeaseManager>> = Arc::new(Mutex::new(LeaseManager::new()));

    let verifier = verifier.unwrap_or_else(default_verifier);

    // Track reassignment counts per goal.
    let mut reassignments: HashMap<GoalId, usize> = HashMap::new();

    // We run assignments in waves. Each wave spawns workers for the current
    // set of pending goals, awaits them all, then reassigns any unsatisfied
    // goals (up to max_reassignments) before the next wave.
    let mut wave = 0u32;
    let mut worker_summaries: Vec<(String, String)> = Vec::new(); // (worker_id, summary)

    loop {
        wave += 1;
        if wave > 100 {
            // Safety valve against infinite loops.
            break;
        }

        // Find pending goals ready to be assigned this wave.
        let ready: Vec<GoalId> = board.ready_goals();
        if ready.is_empty() {
            break;
        }

        // Re-run assignment for the remaining ready goals (their target files
        // inform locality clustering). Goals already claimed/satisfied are
        // excluded by ready_goals().
        let wave_targets: Vec<(usize, Vec<PathBuf>)> = ready
            .iter()
            .map(|&gid| (gid, board.goals[gid].target_files.clone()))
            .collect();
        let wave_assignments =
            assign::assign(&wave_targets, &mut distance_index, config.max_workers);

        if wave_assignments.is_empty() {
            break;
        }

        let mut handles: Vec<WorkerHandle> = Vec::new();
        for (wi, assignment) in wave_assignments.iter().enumerate() {
            let worker_id = format!("worker-{wi}-w{wave}");

            // Claim the goals for this worker on the board.
            let mut claimed: Vec<GoalId> = Vec::new();
            for &gid in &assignment.goals {
                if board.claim(gid, &worker_id).is_ok() {
                    claimed.push(gid);
                }
            }
            if claimed.is_empty() {
                continue;
            }

            // Build the worker task: list its goals with descriptions.
            let goal_lines: Vec<String> = claimed
                .iter()
                .map(|&gid| {
                    let bg = &board.goals[gid];
                    format!(
                        "  - [{}] {}{}",
                        bg.goal.kind.label(),
                        bg.goal.description,
                        bg.goal
                            .symbol
                            .as_deref()
                            .map(|s| format!(" (symbol: {s})"))
                            .unwrap_or_default()
                    )
                })
                .collect();

            let task = format!(
                "You are {worker_id} working on these goals:\n{}\n\nShared context: {prompt}",
                goal_lines.join("\n")
            );

            // Collect target files across the worker's goals for write scoping.
            let target_files: Vec<PathBuf> = claimed
                .iter()
                .flat_map(|&gid| board.goals[gid].target_files.clone())
                .collect();

            let write_scope = if target_files.is_empty() {
                WriteScope::ReadOnly
            } else {
                WriteScope::Paths(target_files.clone())
            };

            // Leases: one per target file (whole-file, span=None for v1).
            let leases: Vec<(PathBuf, Option<khadim_code_graph::NodeSpan>)> = target_files
                .iter()
                .map(|f| (f.clone(), None))
                .collect();

            let mode = resolve_worker_mode(&assignment.suggested_mode_name);

            let spec = WorkerSpec {
                worker_id: worker_id.clone(),
                mode,
                task,
                write_scope,
                max_turns: Some(40),
                leases,
            };

            // The worker module emits its own `worker_spawned` event; we emit
            // a complementary `worker_assigned` carrying the goal list.
            let _ = tx.send(
                AgentStreamEvent::new("worker_assigned")
                    .with_metadata(json!({
                        "worker_id": worker_id,
                        "goals": claimed,
                        "wave": wave,
                    })),
            );

            let handle = worker::spawn_worker_with_runner(
                spec,
                root.clone(),
                selection.clone(),
                tx.clone(),
                worker_runner.clone(),
                Some(lease_manager.clone()),
            );
            handles.push(handle);
        }

        if handles.is_empty() {
            break;
        }

        // ── (e) Monitor: await all workers in this wave ──────────────────
        for handle in handles {
            let wid = handle.worker_id.clone();
            match handle.join.await {
                Ok(Ok(summary)) => {
                    worker_summaries.push((wid.clone(), summary.clone()));
                    let _ = tx.send(
                        AgentStreamEvent::new("worker_done")
                            .with_content(summary.clone())
                            .with_metadata(json!({
                                "worker_id": wid,
                                "summary": summary,
                            })),
                    );
                }
                Ok(Err(err)) => {
                    let _ = tx.send(
                        AgentStreamEvent::new("worker_failed")
                            .with_content(err.message.clone())
                            .with_metadata(json!({
                                "worker_id": wid,
                                "error": err.message,
                            })),
                    );
                    worker_summaries.push((wid.clone(), String::new()));
                }
                Err(join_err) => {
                    let msg = format!("worker join error: {join_err}");
                    let _ = tx.send(
                        AgentStreamEvent::new("worker_failed")
                            .with_content(msg.clone())
                            .with_metadata(json!({
                                "worker_id": wid,
                                "error": msg,
                            })),
                    );
                    worker_summaries.push((wid.clone(), String::new()));
                }
            }
        }

        // ── Verify claimed goals ─────────────────────────────────────────
        // Release this wave's workers' leases.
        {
            let mut lm = lease_manager.lock().unwrap();
            // Release leases for all worker ids used in this wave.
            for (wid, _) in &worker_summaries {
                // worker_summaries may include prior waves; release is idempotent.
                lm.release_worker(wid);
            }
        }

        // For each goal claimed by a worker this wave, verify satisfaction.
        let wave_worker_ids: Vec<String> = worker_summaries.iter().map(|(w, _)| w.clone()).collect();
        let claimed_by_wave: Vec<GoalId> = board
            .goals
            .iter()
            .enumerate()
            .filter(|(_, bg)| {
                matches!(&bg.status, GoalStatus::Claimed { worker_id } if wave_worker_ids.contains(worker_id))
            })
            .map(|(gid, _)| gid)
            .collect();

        for gid in claimed_by_wave {
            let worker_id = match &board.goals[gid].status {
                GoalStatus::Claimed { worker_id } => worker_id.clone(),
                _ => continue,
            };
            // Find the worker's summary.
            let summary = worker_summaries
                .iter()
                .rev()
                .find(|(w, _)| *w == worker_id)
                .map(|(_, s)| s.clone())
                .unwrap_or_default();

            let satisfied = verifier.as_ref()(&board, gid, &summary).await;

            if satisfied {
                board.satisfy(gid);
                let _ = tx.send(
                    AgentStreamEvent::new("goal_satisfied")
                        .with_metadata(json!({
                            "goal_id": gid,
                            "kind": board.goals[gid].goal.kind.label(),
                            "description": board.goals[gid].goal.description,
                        })),
                );
            } else {
                let count = reassignments.entry(gid).or_insert(0);
                if *count < config.max_reassignments {
                    *count += 1;
                    board.release(gid);
                    let _ = tx.send(
                        AgentStreamEvent::new("goal_reassigned")
                            .with_metadata(json!({
                                "goal_id": gid,
                                "reassignment": *count,
                                "max": config.max_reassignments,
                            })),
                    );
                } else {
                    let reason = format!(
                        "not satisfied after {} reassignment(s)",
                        *count
                    );
                    board.block(gid, reason.clone());
                    let _ = tx.send(
                        AgentStreamEvent::new("goal_blocked")
                            .with_metadata(json!({
                                "goal_id": gid,
                                "reason": reason,
                                "kind": board.goals[gid].goal.kind.label(),
                                "description": board.goals[gid].goal.description,
                            })),
                    );
                }
            }
        }

        // Loop continues: next wave picks up released (pending) goals.
    }

    // ── (f) Aggregate ───────────────────────────────────────────────────
    let satisfied_count = board
        .goals
        .iter()
        .filter(|g| g.status.is_satisfied())
        .count();
    let blocked_count = board
        .goals
        .iter()
        .filter(|g| matches!(g.status, GoalStatus::Blocked { .. }))
        .count();

    let mut summary = String::new();
    summary.push_str("Multi-agent run complete.\n\n");
    summary.push_str(&format!("Goals: {} satisfied, {} blocked, {} total.\n", satisfied_count, blocked_count, board.total()));
    if !worker_summaries.is_empty() {
        summary.push_str("\nWorker results:\n");
        for (wid, s) in &worker_summaries {
            summary.push_str(&format!("  [{wid}] {s}\n"));
        }
    }
    if blocked_count > 0 {
        summary.push_str("\nBlocked goals:\n");
        for bg in &board.goals {
            if let GoalStatus::Blocked { reason } = &bg.status {
                summary.push_str(&format!(
                    "  - [{}] {}: {reason}\n",
                    bg.goal.kind.label(),
                    bg.goal.description
                ));
            }
        }
    }

    push_assistant(session, &summary);
    let _ = tx.send(
        AgentStreamEvent::new("multi_agent_done")
            .with_content(summary.clone())
            .with_metadata(json!({
                "satisfied": satisfied_count,
                "blocked": blocked_count,
                "total": board.total(),
            })),
    );
    let _ = tx.send(AgentStreamEvent::new("done"));
    Ok(summary)
}

/// Push an assistant ChatMessage into the session (for the final summary).
fn push_assistant(session: &mut KhadimSession, text: &str) {
    use khadim_ai_core::types::ChatMessage;
    session.messages.push(ChatMessage::Assistant {
        content: Some(text.to_string()),
        tool_calls: Vec::new(),
        reasoning_content: None,
    });
}

/// Emit a `goal_heuristic` event with the board state.
fn emit_board_heuristic(board: &GoalBoard, tx: &UnboundedSender<AgentStreamEvent>) {
    let _ = tx.send(
        AgentStreamEvent::new("goal_heuristic")
            .with_content(format!("Decomposed {} goals", board.total()))
            .with_metadata(json!({
                "total_goals": board.total(),
                "goals": board.goals.iter().map(|bg| json!({
                    "kind": bg.goal.kind.label(),
                    "description": bg.goal.description,
                    "symbol": bg.goal.symbol,
                    "target_files": bg.target_files.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
                    "deps": bg.deps,
                })).collect::<Vec<_>>(),
            })),
    );
}

/// Resolve a suggested mode name to an [`AgentModeDefinition`].
fn resolve_worker_mode(name: &str) -> AgentModeDefinition {
    match name {
        "build" => build_mode(),
        "chat" => chat_mode(),
        "explore" => explore_mode(),
        _ => sub_general_mode(),
    }
}

/// Fallback decomposition using [`GoalTracker::from_prompt`] when the LLM
/// decomposition is unavailable or unparseable. Synthesizes empty
/// `target_files` and `deps` for each goal.
fn fallback_decompose(prompt: &str) -> Vec<DecomposedGoal> {
    let tracker = GoalTracker::from_prompt(prompt);
    tracker
        .goals
        .into_iter()
        .map(|g| DecomposedGoal {
            kind: g.kind,
            description: g.description,
            target_files: Vec::new(),
            deps: Vec::new(),
        })
        .collect()
}

/// Default LLM decomposition: makes one [`ModelClient`] call requesting
/// structured JSON goals, parses with tolerant JSON repair, and maps the
/// result to [`DecomposedGoal`]s.
async fn default_decompose(
    prompt: &str,
    selection: Option<ModelSelection>,
) -> Result<Vec<DecomposedGoal>, AppError> {
    use khadim_ai_core::types::{ChatMessage, Context};
    use khadim_ai_core::ModelClient;

    let client = ModelClient::from_selection(selection).await?;

    let system = "You are a task decomposer. Decompose the user's task into independent goals. \
                  Output a JSON array of objects: [{\"kind\": \"create|modify|run|verify|general\", \
                  \"description\": string, \"target_files\": [string], \"deps\": [int]}]. \
                  `kind` maps: create→CreateFile, modify→ModifyFile, run→RunCommand, \
                  verify→VerifyOutcome, general→General. `deps` lists 0-based indices of goals \
                  that must complete before this one. Output ONLY the JSON array.";

    let context = Context {
        messages: vec![
            ChatMessage::System { content: system.to_string() },
            ChatMessage::User { content: prompt.to_string() },
        ],
        tools: Vec::new(),
        session_id: None,
    };

    let response = client.complete(&context, 0.2).await?;
    let raw = response.content.trim();

    // Try direct parse, then tolerant repair.
    let value: Value = if let Ok(v) = serde_json::from_str::<Value>(raw) {
        v
    } else if let Some(v) = try_repair_json(raw) {
        v
    } else {
        return Err(AppError::invalid_input("decomposition output is not valid JSON"));
    };

    parse_decomposed_goals(&value)
}

/// Parse the JSON decomposition output into [`DecomposedGoal`]s.
fn parse_decomposed_goals(value: &Value) -> Result<Vec<DecomposedGoal>, AppError> {
    let arr = value
        .as_array()
        .ok_or_else(|| AppError::invalid_input("decomposition output is not a JSON array"))?;

    let mut goals = Vec::new();
    for item in arr {
        let kind_str = item
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("general");
        let kind = match kind_str {
            "create" | "create_file" | "createfile" => GoalKind::CreateFile,
            "modify" | "modify_file" | "modifyfile" => GoalKind::ModifyFile,
            "run" | "run_command" | "runcommand" => GoalKind::RunCommand,
            "verify" | "verify_outcome" | "verifyoutcome" => GoalKind::VerifyOutcome,
            _ => GoalKind::General,
        };
        let description = item
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if description.is_empty() {
            continue;
        }
        let target_files = item
            .get("target_files")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str())
                    .map(PathBuf::from)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let deps = item
            .get("deps")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_u64())
                    .map(|n| n as usize)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        goals.push(DecomposedGoal {
            kind,
            description,
            target_files,
            deps,
        });
    }
    Ok(goals)
}

/// Build the default goal verifier: checks target files via [`ParseCache`]
/// for CreateFile/ModifyFile goals with a symbol, and uses the worker summary
/// text as a fallback heuristic for other kinds.
fn default_verifier() -> GoalVerifier {
    Arc::new(|board: &GoalBoard, goal_id: GoalId, summary: &str| {
        let board = board.clone();
        let summary = summary.to_string();
        Box::pin(async move {
            let bg = match board.goals.get(goal_id) {
                Some(bg) => bg,
                None => return false,
            };
            let goal = &bg.goal;
            match goal.kind {
                GoalKind::CreateFile | GoalKind::ModifyFile => {
                    // If there's a symbol, verify via ParseCache; else use
                    // the summary heuristic (summary mentions the file path
                    // and a success keyword).
                    if let Some(symbol) = goal.symbol.as_ref() {
                        let mut cache = ParseCache::new();
                        for tf in &bg.target_files {
                            if cache.language_id_for_path(tf).is_none() {
                                continue;
                            }
                            // Try to parse the current on-disk content.
                            if let Ok(src) = std::fs::read_to_string(tf) {
                                let _ = cache.parse(tf, &src);
                            }
                            if cache.parse_valid(tf, None) && cache.function_exists(tf, symbol) {
                                return true;
                            }
                        }
                        // Symbol not found in any target file.
                        return false;
                    }
                    // No symbol: fall back to heuristic.
                    let lower = summary.to_ascii_lowercase();
                    bg.target_files.iter().any(|tf| {
                        let s = tf.display().to_string();
                        (lower.contains(&s.to_ascii_lowercase())
                            || lower.contains(&tf.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default().to_ascii_lowercase()))
                            && (lower.contains("done")
                                || lower.contains("ok")
                                || lower.contains("success")
                                || lower.contains("created")
                                || lower.contains("updated")
                                || lower.contains("wrote"))
                    })
                }
                GoalKind::RunCommand | GoalKind::VerifyOutcome => {
                    let lower = summary.to_ascii_lowercase();
                    lower.contains("ok")
                        || lower.contains("success")
                        || lower.contains("passed")
                        || lower.contains("test result: ok")
                        || lower.contains(&goal.description.to_ascii_lowercase())
                }
                GoalKind::General => {
                    let lower = summary.to_ascii_lowercase();
                    lower.contains("done")
                        || lower.contains("success")
                        || lower.contains("ok")
                        || lower.contains(&goal.description.to_ascii_lowercase())
                }
            }
        })
    })
}

#[cfg(test)]
mod coordinator_tests;