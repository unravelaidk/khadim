//! Shared, claimable goal board for multi-agent coordination.
//!
//! A [`GoalBoard`] generalizes [`crate::agent::goal_tracker::GoalTracker`]:
//! each goal carries a [`GoalStatus`] (`Pending`, `Claimed`, `Satisfied`, or
//! `Blocked`) and an optional set of dependencies on other goals. Workers
//! claim goals, work them, and either `satisfy` or `release`/`block` them.
//!
//! The board is a plain struct (no interior locks) so it can be shared as
//! `Arc<RwLock<GoalBoard>>` by callers.

use serde::Serialize;
use std::path::PathBuf;

use crate::agent::goal_tracker::{Goal, GoalTracker};

/// Identifier of a goal on the board (its index in the goals vector).
pub type GoalId = usize;

/// Lifecycle state of a board goal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum GoalStatus {
    /// Not yet claimed by any worker.
    Pending,
    /// Claimed by a worker; in progress.
    Claimed { worker_id: String },
    /// Satisfied; the goal is complete.
    Satisfied,
    /// Blocked from progress; `reason` explains why.
    Blocked { reason: String },
}

impl GoalStatus {
    /// True when this status is [`GoalStatus::Satisfied`].
    pub fn is_satisfied(&self) -> bool {
        matches!(self, GoalStatus::Satisfied)
    }

    /// True when this status is [`GoalStatus::Pending`].
    pub fn is_pending(&self) -> bool {
        matches!(self, GoalStatus::Pending)
    }

    /// True when this status is [`GoalStatus::Claimed`].
    pub fn is_claimed(&self) -> bool {
        matches!(self, GoalStatus::Claimed { .. })
    }
}

impl std::fmt::Display for GoalStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GoalStatus::Pending => write!(f, "pending"),
            GoalStatus::Claimed { worker_id } => write!(f, "claimed:{}", worker_id),
            GoalStatus::Satisfied => write!(f, "satisfied"),
            GoalStatus::Blocked { reason } => write!(f, "blocked:{}", reason),
        }
    }
}

/// A goal living on the board: the underlying [`Goal`], its [`GoalStatus`],
/// and the ids of goals that must be satisfied before this one is ready.
///
/// `target_files` is an optional list of file paths the goal touches (used by
/// the coordinator for locality-based assignment and lease scoping). It is
/// additive — `GoalBoard::from_tracker` leaves it empty, and the coordinator
/// populates it from the LLM decomposition. Existing callers are unaffected.
#[derive(Debug, Clone, Serialize)]
pub struct BoardGoal {
    pub goal: Goal,
    pub status: GoalStatus,
    pub deps: Vec<GoalId>,
    /// Files the goal is expected to touch. Empty by default; populated by
    /// the coordinator from the decomposition's `target_files` field.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub target_files: Vec<PathBuf>,
}

/// A flat collection of board goals with coordination operations.
///
/// Intended to be wrapped in `Arc<RwLock<GoalBoard>>` by callers; the struct
/// itself is plain data and all methods take `&mut self`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct GoalBoard {
    pub goals: Vec<BoardGoal>,
}

/// Error returned when a goal cannot be claimed because it is not in the
/// `Pending` state (already claimed, satisfied, or blocked).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimError {
    pub goal_id: GoalId,
    pub current_status: GoalStatus,
}

impl std::fmt::Display for ClaimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "goal {} is not pending (currently {})",
            self.goal_id, self.current_status
        )
    }
}

impl std::error::Error for ClaimError {}

impl GoalBoard {
    /// Construct an empty board.
    pub fn new() -> Self {
        Self { goals: Vec::new() }
    }

    /// Build a board from a [`GoalTracker`], flattening each tracker goal into
    /// a [`BoardGoal`] with status [`GoalStatus::Pending`], no dependencies,
    /// and no target files. The coordinator populates `target_files`/`deps`
    /// afterwards from the richer LLM decomposition when available.
    pub fn from_tracker(tracker: GoalTracker) -> Self {
        let goals = tracker
            .goals
            .into_iter()
            .map(|g| BoardGoal {
                goal: g,
                status: GoalStatus::Pending,
                deps: Vec::new(),
                target_files: Vec::new(),
            })
            .collect();
        Self { goals }
    }

    /// Total number of goals on the board.
    pub fn total(&self) -> usize {
        self.goals.len()
    }

    /// Heuristic value: count of goals that are NOT satisfied.
    pub fn heuristic(&self) -> usize {
        self.goals.iter().filter(|g| !g.status.is_satisfied()).count()
    }

    /// Borrow a goal by id.
    pub fn get(&self, goal_id: GoalId) -> Option<&BoardGoal> {
        self.goals.get(goal_id)
    }

    /// Borrow the full goal list.
    pub fn goals_ref(&self) -> &[BoardGoal] {
        &self.goals
    }

    /// Claim a goal for a worker. Returns [`ClaimError`] if the goal is not
    /// currently [`GoalStatus::Pending`].
    pub fn claim(&mut self, goal_id: GoalId, worker_id: impl Into<String>) -> Result<(), ClaimError> {
        let worker_id = worker_id.into();
        let goal = self
            .goals
            .get_mut(goal_id)
            .ok_or(ClaimError {
                goal_id,
                current_status: GoalStatus::Blocked {
                    reason: "no such goal".to_string(),
                },
            })?;
        if !goal.status.is_pending() {
            return Err(ClaimError {
                goal_id,
                current_status: goal.status.clone(),
            });
        }
        goal.status = GoalStatus::Claimed { worker_id };
        Ok(())
    }

    /// Release a claimed goal back to [`GoalStatus::Pending`] (no-op if not
    /// currently claimed).
    pub fn release(&mut self, goal_id: GoalId) {
        if let Some(goal) = self.goals.get_mut(goal_id) {
            if goal.status.is_claimed() {
                goal.status = GoalStatus::Pending;
            }
        }
    }

    /// Mark a goal as [`GoalStatus::Satisfied`].
    pub fn satisfy(&mut self, goal_id: GoalId) {
        if let Some(goal) = self.goals.get_mut(goal_id) {
            goal.status = GoalStatus::Satisfied;
        }
    }

    /// Mark a goal as [`GoalStatus::Blocked`] with a reason.
    pub fn block(&mut self, goal_id: GoalId, reason: impl Into<String>) {
        if let Some(goal) = self.goals.get_mut(goal_id) {
            goal.status = GoalStatus::Blocked {
                reason: reason.into(),
            };
        }
    }

    /// Return the ids of goals that are [`GoalStatus::Pending`] AND whose every
    /// dependency is [`GoalStatus::Satisfied`]. A goal with no deps is ready
    /// whenever it is pending.
    pub fn ready_goals(&self) -> Vec<GoalId> {
        self.goals
            .iter()
            .enumerate()
            .filter(|(_, g)| g.status.is_pending())
            .filter(|(_, g)| {
                g.deps
                    .iter()
                    .all(|dep| self.goals.get(*dep).is_some_and(|d| d.status.is_satisfied()))
            })
            .map(|(id, _)| id)
            .collect()
    }

    /// Return the ids of goals currently claimed by `worker_id`.
    pub fn claim_worker_goals(&self, worker_id: &str) -> Vec<GoalId> {
        self.goals
            .iter()
            .enumerate()
            .filter(|(_, g)| matches!(&g.status, GoalStatus::Claimed { worker_id: w } if w == worker_id))
            .map(|(id, _)| id)
            .collect()
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::goal_tracker::GoalKind;
    use std::sync::Arc;
    use std::thread;
    use tokio::sync::RwLock;

    fn sample_tracker() -> GoalTracker {
        GoalTracker::from_prompt("Create `src/foo.rs` and run `cargo test`.")
    }

    /// Build a deterministic 2-goal board for dependency-gating tests.
    fn two_goal_board() -> GoalBoard {
        let mut board = GoalBoard::new();
        board.goals.push(BoardGoal {
            goal: Goal {
                kind: GoalKind::CreateFile,
                description: "src/foo.rs".to_string(),
                satisfied: false,
                symbol: None,
            },
            status: GoalStatus::Pending,
            deps: Vec::new(),
            target_files: Vec::new(),
        });
        board.goals.push(BoardGoal {
            goal: Goal {
                kind: GoalKind::RunCommand,
                description: "cargo test".to_string(),
                satisfied: false,
                symbol: None,
            },
            status: GoalStatus::Pending,
            deps: Vec::new(),
            target_files: Vec::new(),
        });
        board
    }

    #[test]
    fn from_tracker_preserves_count_and_descriptions() {
        let tracker = sample_tracker();
        let n = tracker.total();
        let descs: Vec<_> = tracker.goals.iter().map(|g| g.description.clone()).collect();
        let board = GoalBoard::from_tracker(tracker);
        assert_eq!(board.total(), n);
        assert_eq!(board.goals_ref().len(), n);
        for (bg, d) in board.goals_ref().iter().zip(descs.iter()) {
            assert_eq!(bg.goal.description, *d);
            assert!(bg.status.is_pending());
            assert!(bg.deps.is_empty());
        }
    }

    #[test]
    fn claim_release_satisfy_block_transitions() {
        let tracker = sample_tracker();
        let mut board = GoalBoard::from_tracker(tracker);
        assert_eq!(board.heuristic(), board.total());

        // Claim goal 0.
        assert!(board.claim(0, "w1").is_ok());
        assert!(board.get(0).unwrap().status.is_claimed());
        assert_eq!(board.claim_worker_goals("w1"), vec![0]);

        // Double-claim fails.
        let err = board.claim(0, "w2").unwrap_err();
        assert_eq!(err.goal_id, 0);

        // Release returns to pending.
        board.release(0);
        assert!(board.get(0).unwrap().status.is_pending());

        // Satisfy removes from heuristic.
        board.satisfy(0);
        assert!(board.get(0).unwrap().status.is_satisfied());
        assert_eq!(board.heuristic(), board.total() - 1);

        // Block goal 1 with a reason.
        let total = board.total();
        board.block(1, "missing input");
        match &board.get(1).unwrap().status {
            GoalStatus::Blocked { reason } => assert_eq!(reason, "missing input"),
            other => panic!("expected blocked, got {other:?}"),
        }
        assert_eq!(board.heuristic(), total - 1); // blocked still counts as not satisfied
    }

    #[test]
    fn ready_goals_excludes_unsatisfied_deps() {
        let mut board = two_goal_board();
        // Make goal 1 depend on goal 0.
        board.goals[1].deps.push(0);

        // Initially both pending, but goal 1's dep (0) is not satisfied.
        let ready: Vec<GoalId> = board.ready_goals();
        assert_eq!(ready, vec![0]);

        // Claiming goal 0 still leaves 1 not ready (dep not satisfied).
        board.claim(0, "w1").unwrap();
        let ready: Vec<GoalId> = board.ready_goals();
        assert_eq!(ready, Vec::<GoalId>::new());

        // Satisfy goal 0; now goal 1 is ready.
        board.satisfy(0);
        let ready: Vec<GoalId> = board.ready_goals();
        assert_eq!(ready, vec![1]);

        // Claim goal 1; no longer ready.
        board.claim(1, "w2").unwrap();
        let ready: Vec<GoalId> = board.ready_goals();
        assert_eq!(ready, Vec::<GoalId>::new());
    }

    #[test]
    fn ready_goals_excludes_claimed_satisfied_blocked() {
        let mut board = two_goal_board();
        board.claim(0, "w1").unwrap();
        board.satisfy(1);
        let ready = board.ready_goals();
        assert!(ready.is_empty());
    }

    #[test]
    fn concurrent_claim_exactly_one_wins() {
        let tracker = sample_tracker();
        let board = GoalBoard::from_tracker(tracker);
        let board = Arc::new(RwLock::new(board));
        let goal_id = 0;

        let b1 = board.clone();
        let b2 = board.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let tx2 = tx.clone();

        let t1 = thread::spawn(move || {
            let r = tokio::runtime::Runtime::new().unwrap().block_on(async {
                b1.write().await.claim(goal_id, "worker-a").is_ok()
            });
            let _ = tx.send(("a", r));
        });
        let t2 = thread::spawn(move || {
            let r = tokio::runtime::Runtime::new().unwrap().block_on(async {
                b2.write().await.claim(goal_id, "worker-b").is_ok()
            });
            let _ = tx2.send(("b", r));
        });
        t1.join().unwrap();
        t2.join().unwrap();

        let results: Vec<_> = rx.iter().collect();
        let winners = results.iter().filter(|(_, ok)| *ok).count();
        assert_eq!(winners, 1, "exactly one claim must win: {results:?}");

        let claimed_by = {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async { board.read().await.get(goal_id).unwrap().status.clone() })
        };
        match &claimed_by {
            GoalStatus::Claimed { worker_id } => {
                assert!(worker_id == "worker-a" || worker_id == "worker-b");
            }
            other => panic!("expected claimed, got {other:?}"),
        }
    }
}