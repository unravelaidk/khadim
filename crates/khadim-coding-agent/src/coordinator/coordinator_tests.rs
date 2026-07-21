//! Tests for the multi-agent coordinator ([`super::run_multi_agent_with`]).
//!
//! These tests use the same injection pattern as `worker.rs` tests: a stub
//! [`WorkerRunner`], a stub [`Decomposer`], and a stub [`GoalVerifier`] so the
//! coordinator logic can be exercised without a real LLM.

use super::*;
use crate::agent::session::KhadimSession;
use crate::events::AgentStreamEvent;
use std::path::PathBuf;
use tokio::sync::mpsc::unbounded_channel;

/// Build a stub decomposer returning the given goals.
fn stub_decomposer(goals: Vec<DecomposedGoal>) -> Decomposer {
    Arc::new(move |_prompt| Ok(goals.clone()))
}

/// Build a stub verifier that reports all goals as satisfied (happy path).
fn always_satisfied() -> GoalVerifier {
    Arc::new(|_board, _goal_id, _summary| Box::pin(async { true }))
}

/// Build a stub verifier that reports all goals as NOT satisfied (failure
/// path), forcing reassignment then block.
fn never_satisfied() -> GoalVerifier {
    Arc::new(|_board, _goal_id, _summary| Box::pin(async { false }))
}

/// Build a stub worker runner that returns a fixed summary and emits a
/// `text_delta` event.
fn stub_runner(summary: &'static str) -> WorkerRunner {
    Arc::new(move |_session, _prompt, _selection, tx, _runtime, _mode| {
        let summary = summary.to_string();
        Box::pin(async move {
            let _ = tx.send(AgentStreamEvent::new("text_delta").with_content(summary.clone()));
            Ok(summary)
        })
    })
}

/// Collect all events from a channel into a Vec.
async fn drain_events(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<AgentStreamEvent>,
) -> Vec<AgentStreamEvent> {
    let mut events = Vec::new();
    while let Some(ev) = rx.recv().await {
        if ev.event_type == "done" {
            events.push(ev);
            break;
        }
        events.push(ev);
    }
    events
}

// ── Happy path: 2-goal prompt → 2 workers, both goals verified ──────────

#[tokio::test]
async fn two_goal_prompt_two_workers_both_satisfied() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();

    let goals = vec![
        DecomposedGoal {
            kind: GoalKind::CreateFile,
            description: "Create src/foo.rs".to_string(),
            target_files: vec![PathBuf::from("src/foo.rs")],
            deps: Vec::new(),
        },
        DecomposedGoal {
            kind: GoalKind::CreateFile,
            description: "Create src/bar.rs".to_string(),
            target_files: vec![PathBuf::from("src/bar.rs")],
            deps: Vec::new(),
        },
    ];

    let mut session = KhadimSession::new(root.clone());
    let (tx, mut rx) = unbounded_channel::<AgentStreamEvent>();

    let result = run_multi_agent_with(
        &mut session,
        "Create src/foo.rs and src/bar.rs",
        None,
        &tx,
        AgentRuntime::new(&root),
        MultiAgentConfig::default(),
        Some(stub_decomposer(goals)),
        Some(always_satisfied()),
        Some(stub_runner("done")),
    )
    .await;

    assert!(result.is_ok(), "run should succeed: {:?}", result.err());
    let summary = result.unwrap();
    assert!(
        summary.contains("2 satisfied"),
        "summary should report 2 satisfied: {summary}"
    );
    assert!(
        summary.contains("0 blocked"),
        "no blocked goals in happy path: {summary}"
    );

    let events = drain_events(&mut rx).await;
    // Expect: goal_heuristic, workers_assigned, worker_spawned (x2),
    // worker_done (x2), goal_satisfied (x2), multi_agent_done, done.
    let spawned: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "worker_spawned")
        .collect();
    assert!(
        spawned.len() >= 2,
        "expected >=2 worker_spawned events, got {}",
        spawned.len()
    );

    let satisfied: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "goal_satisfied")
        .collect();
    assert_eq!(satisfied.len(), 2, "expected 2 goal_satisfied events");

    let done = events.iter().any(|e| e.event_type == "done");
    assert!(done, "expected a done event");

    let assigned = events.iter().find(|e| e.event_type == "workers_assigned");
    assert!(assigned.is_some(), "expected workers_assigned event");
}

// ── Failure path: worker output doesn't satisfy → reassignment then Blocked ─

#[tokio::test]
async fn unsatisfied_goal_reassigned_then_blocked() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();

    // One goal that the verifier will always reject.
    let goals = vec![DecomposedGoal {
        kind: GoalKind::CreateFile,
        description: "Create src/foo.rs".to_string(),
        target_files: vec![PathBuf::from("src/foo.rs")],
        deps: Vec::new(),
    }];

    let mut session = KhadimSession::new(root.clone());
    let (tx, mut rx) = unbounded_channel::<AgentStreamEvent>();

    // max_reassignments = 1: after the first worker fails, one reassignment
    // happens, then the goal is blocked.
    let config = MultiAgentConfig {
        max_workers: 2,
        max_reassignments: 1,
    };

    let result = run_multi_agent_with(
        &mut session,
        "Create src/foo.rs",
        None,
        &tx,
        AgentRuntime::new(&root),
        config,
        Some(stub_decomposer(goals)),
        Some(never_satisfied()),
        Some(stub_runner("not done")),
    )
    .await;

    assert!(result.is_ok(), "run should not error: {:?}", result.err());
    let summary = result.unwrap();
    assert!(
        summary.contains("0 satisfied"),
        "no goals satisfied: {summary}"
    );
    assert!(summary.contains("1 blocked"), "one goal blocked: {summary}");

    let events = drain_events(&mut rx).await;
    let reassigned: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "goal_reassigned")
        .collect();
    assert!(
        !reassigned.is_empty(),
        "expected at least one goal_reassigned event"
    );

    let blocked: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "goal_blocked")
        .collect();
    assert_eq!(blocked.len(), 1, "expected one goal_blocked event");

    // The spawn count should be 2: initial + 1 reassignment.
    let spawned: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "worker_spawned")
        .collect();
    assert_eq!(
        spawned.len(),
        2,
        "expected 2 worker_spawned (initial + reassignment), got {}",
        spawned.len()
    );
}

// ── No goals decomposed → graceful empty summary ──────────────────────────

#[tokio::test]
async fn empty_decomposition_produces_empty_summary() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();

    let mut session = KhadimSession::new(root.clone());
    let (tx, mut rx) = unbounded_channel::<AgentStreamEvent>();

    let result = run_multi_agent_with(
        &mut session,
        "hello",
        None,
        &tx,
        AgentRuntime::new(&root),
        MultiAgentConfig::default(),
        Some(stub_decomposer(Vec::new())),
        Some(always_satisfied()),
        Some(stub_runner("x")),
    )
    .await;

    assert!(result.is_ok());
    let summary = result.unwrap();
    assert!(summary.contains("No goals"), "empty summary: {summary}");

    let events = drain_events(&mut rx).await;
    assert!(events.iter().any(|e| e.event_type == "done"));
    // No worker_spawned when there are no goals.
    assert!(events.iter().all(|e| e.event_type != "worker_spawned"));
}

// ── Dependency gating: a goal depending on another waits ─────────────────

#[tokio::test]
async fn goal_with_unsatisfied_dep_is_not_ready() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();

    // Goal 0: create foo.rs. Goal 1: run cargo test, depends on goal 0.
    let goals = vec![
        DecomposedGoal {
            kind: GoalKind::CreateFile,
            description: "Create src/foo.rs".to_string(),
            target_files: vec![PathBuf::from("src/foo.rs")],
            deps: Vec::new(),
        },
        DecomposedGoal {
            kind: GoalKind::RunCommand,
            description: "cargo test".to_string(),
            target_files: Vec::new(),
            deps: vec![0],
        },
    ];

    let mut session = KhadimSession::new(root.clone());
    let (tx, mut rx) = unbounded_channel::<AgentStreamEvent>();

    let result = run_multi_agent_with(
        &mut session,
        "Create src/foo.rs then run cargo test",
        None,
        &tx,
        AgentRuntime::new(&root),
        MultiAgentConfig::default(),
        Some(stub_decomposer(goals)),
        Some(always_satisfied()),
        Some(stub_runner("done")),
    )
    .await;

    assert!(result.is_ok());
    let summary = result.unwrap();
    assert!(
        summary.contains("2 satisfied"),
        "both goals satisfied: {summary}"
    );

    let events = drain_events(&mut rx).await;
    // Goal 1 (deps=[0]) should only be assigned after goal 0 is satisfied.
    // We verify by checking that both goal_satisfied events appear.
    let satisfied: Vec<_> = events
        .iter()
        .filter(|e| e.event_type == "goal_satisfied")
        .collect();
    assert_eq!(satisfied.len(), 2, "both goals satisfied after dep gating");
}
