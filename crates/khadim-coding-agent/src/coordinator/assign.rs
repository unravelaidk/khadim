//! Locality-based goal-to-worker assignment.
//!
//! [`assign`] clusters goals by graph locality so that goals touching the same
//! module end up on the same worker (conflict avoidance beats conflict
//! resolution). It uses an agglomerative merge over [`DistanceIndex`] hop
//! distances: each goal starts as its own cluster, then the two clusters with
//! the smallest average inter-cluster distance are merged while
//!
//!   (a) average inter-cluster distance ≤ `merge_distance` (default 2), and
//!   (b) the resulting cluster has ≤ `max_goals_per_worker` goals (default 4).
//!
//! Disconnected goals (distance `None`) never merge. Goals with no target files
//! go to a single "general" worker bucket. The coordinator (WP7) bridges
//! [`crate::agent::goal_board::GoalBoard`] goals into the generic input shape
//! used here.
//!
//! The `suggested_mode_name` field is a placeholder for WP5 — it returns
//! `"build"` for any assignment touching code files and `"chat"` otherwise.
//! The real mode selection lives in [`crate::agent::mode_planner`].

use std::path::PathBuf;

use khadim_code_graph::DistanceIndex;

/// A worker's goal assignment produced by [`assign`].
///
/// `goals` holds goal indices (positions in the input `goal_targets` slice).
/// The coordinator maps these back to [`crate::agent::goal_board::GoalId`]s.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerAssignment {
    /// Indices into the input `goal_targets` slice assigned to this worker.
    pub goals: Vec<usize>,
    /// Placeholder mode name: `"build"` for code-touching work, `"chat"` otherwise.
    pub suggested_mode_name: String,
}

/// Configuration for [`assign`].
#[derive(Debug, Clone, Copy)]
pub struct AssignConfig {
    /// Maximum average inter-cluster distance at which two clusters may merge.
    pub merge_distance: u32,
    /// Maximum number of goals per worker (cluster size cap).
    pub max_goals_per_worker: usize,
}

impl Default for AssignConfig {
    fn default() -> Self {
        Self {
            merge_distance: 2,
            max_goals_per_worker: 4,
        }
    }
}

/// Assign goals to workers by graph locality.
///
/// `goal_targets` is `(goal_index, target_files)` per goal. A goal with no
/// target files goes to a single general worker. Goals with targets are
/// clustered by [`DistanceIndex`] hop distance. `max_workers` caps the total
/// number of workers; when `max_workers == 1` everything collapses into one
/// worker.
///
/// The returned assignments are ordered: the general worker (if any) comes
/// first, then locality clusters in descending size order.
pub fn assign(
    goal_targets: &[(usize, Vec<PathBuf>)],
    graph: &mut DistanceIndex,
    max_workers: usize,
) -> Vec<WorkerAssignment> {
    assign_with(goal_targets, graph, max_workers, AssignConfig::default())
}

/// Assign with explicit [`AssignConfig`].
pub fn assign_with(
    goal_targets: &[(usize, Vec<PathBuf>)],
    graph: &mut DistanceIndex,
    max_workers: usize,
    cfg: AssignConfig,
) -> Vec<WorkerAssignment> {
    // Split goals into "with files" and "general" (no target files).
    let mut general_indices: Vec<usize> = Vec::new();
    let mut with_files: Vec<(usize, Vec<PathBuf>)> = Vec::new();
    for (_i, (goal_idx, files)) in goal_targets.iter().enumerate() {
        if files.is_empty() {
            general_indices.push(*goal_idx);
        } else {
            with_files.push((*goal_idx, files.clone()));
        }
    }

    let mut assignments: Vec<WorkerAssignment> = Vec::new();

    // General bucket: one worker holds all file-less goals.
    if !general_indices.is_empty() {
        let mut goals = general_indices.clone();
        goals.sort_unstable();
        assignments.push(WorkerAssignment {
            goals,
            suggested_mode_name: mode_for_goals(&general_indices, &with_files, &[]),
        });
    }

    // Cluster the file-touching goals.
    let clusters = cluster_by_locality(&with_files, graph, max_workers, cfg);

    for cluster in clusters {
        let mut goals: Vec<usize> = cluster.iter().map(|(gi, _)| *gi).collect();
        goals.sort_unstable();
        let touches_code = cluster.iter().any(|(_, f)| !f.is_empty());
        assignments.push(WorkerAssignment {
            goals,
            suggested_mode_name: if touches_code {
                "build".to_string()
            } else {
                "chat".to_string()
            },
        });
    }

    // Edge case: max_workers == 1 collapses everything into one worker.
    if max_workers == 1 && !assignments.is_empty() {
        let mut all_goals: Vec<usize> = Vec::new();
        let any_code = true; // single worker handles everything
        for a in &assignments {
            all_goals.extend_from_slice(&a.goals);
        }
        all_goals.sort_unstable();
        all_goals.dedup();
        assignments = vec![WorkerAssignment {
            goals: all_goals,
            suggested_mode_name: if any_code {
                "build".to_string()
            } else {
                "chat".to_string()
            },
        }];
    }

    assignments
}

/// Agglomerative clustering of file-touching goals by graph distance.
///
/// Each goal starts as its own cluster. The two clusters with the smallest
/// average inter-cluster distance are merged while (a) that distance ≤
/// `cfg.merge_distance`, (b) the merged size ≤ `cfg.max_goals_per_worker`, and
/// (c) the resulting cluster count ≥ `max_workers` (when max_workers > 0 we
/// don't merge below that count). Disconnected pairs (distance `None`) never
/// merge.
fn cluster_by_locality(
    with_files: &[(usize, Vec<PathBuf>)],
    graph: &mut DistanceIndex,
    _max_workers: usize,
    cfg: AssignConfig,
) -> Vec<Vec<(usize, Vec<PathBuf>)>> {
    let n = with_files.len();
    if n == 0 {
        return Vec::new();
    }

    // Start: each goal is its own cluster.
    let mut clusters: Vec<Vec<usize>> = (0..n).map(|i| vec![i]).collect();

    // Map file paths to graph node indices once.
    let node_for_file: Vec<Vec<Option<usize>>> = with_files
        .iter()
        .map(|(_, files)| files.iter().map(|f| graph.graph().node_index(f)).collect())
        .collect();

    loop {
        if clusters.len() <= 1 {
            break;
        }
        // When max_workers is set, we still merge qualifying (co-located) pairs
        // even if clusters.len() <= max_workers: max_workers is an upper bound
        // on output workers, not a target. Disconnected pairs never qualify, so
        // unrelated goals stay separate naturally.

        // Find the cheapest valid merge.
        let mut best: Option<(f64, usize, usize)> = None;
        for i in 0..clusters.len() {
            for j in (i + 1)..clusters.len() {
                let avg = average_inter_cluster_distance(
                    &clusters[i],
                    &clusters[j],
                    &node_for_file,
                    graph,
                );
                // Skip disconnected pairs.
                let avg = match avg {
                    Some(d) => d,
                    None => continue,
                };
                let merged_size = clusters[i].len() + clusters[j].len();
                // Cap by max goals per worker.
                if merged_size > cfg.max_goals_per_worker {
                    continue;
                }
                // Distance threshold.
                if avg as u32 > cfg.merge_distance {
                    continue;
                }
                match best {
                    Some((bd, _, _)) if avg >= bd => {}
                    _ => best = Some((avg, i, j)),
                }
            }
        }

        match best {
            Some((_, i, j)) => {
                // Merge cluster j into cluster i.
                let merged: Vec<usize> = clusters[i]
                    .iter()
                    .chain(clusters[j].iter())
                    .copied()
                    .collect();
                // Remove j first (higher index) then i.
                let (lo, hi) = if i < j { (i, j) } else { (j, i) };
                clusters.remove(hi);
                clusters[lo] = merged;
            }
            None => break, // no qualifying merge
        }
    }

    // Materialize clusters into (goal_idx, files) pairs.
    clusters
        .into_iter()
        .map(|c| {
            c.into_iter()
                .map(|gi| (with_files[gi].0, with_files[gi].1.clone()))
                .collect()
        })
        .collect()
}

/// Average inter-cluster distance: mean over all cross-cluster node-pair
/// distances. Returns `None` if *any* cross-cluster pair is disconnected
/// (so disconnected clusters never merge).
fn average_inter_cluster_distance(
    cluster_a: &[usize],
    cluster_b: &[usize],
    node_for_file: &[Vec<Option<usize>>],
    graph: &mut DistanceIndex,
) -> Option<f64> {
    let mut sum: f64 = 0.0;
    let mut count: u32 = 0;
    for &gi_a in cluster_a {
        for &node_a in &node_for_file[gi_a] {
            let Some(na) = node_a else { continue };
            for &gi_b in cluster_b {
                for &node_b in &node_for_file[gi_b] {
                    let Some(nb) = node_b else { continue };
                    let d = graph.distance(na, nb)?;
                    sum += d as f64;
                    count += 1;
                }
            }
        }
    }
    if count == 0 {
        return None;
    }
    Some(sum / count as f64)
}

/// Placeholder mode helper for the general bucket.
fn mode_for_goals(
    general: &[usize],
    _with_files: &[(usize, Vec<PathBuf>)],
    cluster: &[(usize, Vec<PathBuf>)],
) -> String {
    // General bucket: chat unless the cluster (unused here) touches code.
    if !cluster.is_empty() {
        "build"
    } else if !general.is_empty() {
        "chat"
    } else {
        "chat"
    }
    .to_string()
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use khadim_code_graph::{CodeGraph, EdgeKind};
    use std::path::PathBuf;

    /// Build a small graph: a(0)-b(1)-c(2) chain + isolated d(3).
    fn fixture_graph() -> CodeGraph {
        let mut g = CodeGraph::new();
        let a = g.add_node(PathBuf::from("/proj/a.rs"), None);
        let b = g.add_node(PathBuf::from("/proj/b.rs"), None);
        let c = g.add_node(PathBuf::from("/proj/c.rs"), None);
        let d = g.add_node(PathBuf::from("/proj/d.rs"), None);
        g.add_edge(a, b, EdgeKind::Import);
        g.add_edge(b, c, EdgeKind::Import);
        let _ = d;
        g
    }

    #[test]
    fn two_goals_same_module_cluster_into_one_worker() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        // Goal 0 touches a.rs and b.rs (distance 1); goal 1 touches b.rs.
        let targets = vec![
            (0, vec![PathBuf::from("/proj/a.rs")]),
            (1, vec![PathBuf::from("/proj/b.rs")]),
        ];
        let assignments = assign(&targets, &mut idx, 4);
        let assigned_goal_sets: Vec<Vec<usize>> =
            assignments.iter().map(|a| a.goals.clone()).collect();
        // Both goals on the same worker.
        assert!(
            assigned_goal_sets
                .iter()
                .any(|s| s.contains(&0) && s.contains(&1)),
            "goals 0 and 1 should cluster together: {assigned_goal_sets:?}"
        );
    }

    #[test]
    fn two_unrelated_goals_split_across_workers() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        // Goal 0 touches a.rs; goal 1 touches the isolated d.rs (no path).
        let targets = vec![
            (0, vec![PathBuf::from("/proj/a.rs")]),
            (1, vec![PathBuf::from("/proj/d.rs")]),
        ];
        let assignments = assign(&targets, &mut idx, 4);
        // Two separate workers.
        assert_eq!(assignments.len(), 2, "expected 2 workers: {assignments:?}");
        assert!(
            assignments.iter().any(|a| a.goals == vec![0]),
            "one worker should have only goal 0"
        );
        assert!(
            assignments.iter().any(|a| a.goals == vec![1]),
            "one worker should have only goal 1"
        );
    }

    #[test]
    fn max_workers_one_collapses_all() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        let targets = vec![
            (0, vec![PathBuf::from("/proj/a.rs")]),
            (1, vec![PathBuf::from("/proj/d.rs")]),
            (2, vec![PathBuf::from("/proj/c.rs")]),
        ];
        let assignments = assign(&targets, &mut idx, 1);
        assert_eq!(
            assignments.len(),
            1,
            "max_workers=1 => one worker: {assignments:?}"
        );
        let mut all: Vec<usize> = assignments[0].goals.clone();
        all.sort_unstable();
        assert_eq!(all, vec![0, 1, 2]);
        assert_eq!(assignments[0].suggested_mode_name, "build");
    }

    #[test]
    fn goal_with_no_target_files_goes_to_general_bucket() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        let targets = vec![
            (0, vec![]), // general
            (1, vec![PathBuf::from("/proj/a.rs")]),
        ];
        let assignments = assign(&targets, &mut idx, 4);
        // The general goal (0) should be on its own worker.
        assert!(
            assignments.iter().any(|a| a.goals == vec![0]),
            "general goal 0 should be alone: {assignments:?}"
        );
        // The file-touching goal (1) on another.
        assert!(
            assignments.iter().any(|a| a.goals == vec![1]),
            "goal 1 should be alone: {assignments:?}"
        );
    }

    #[test]
    fn disconnected_goals_never_merge() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        // a.rs and d.rs are disconnected (distance None).
        let targets = vec![
            (0, vec![PathBuf::from("/proj/a.rs")]),
            (1, vec![PathBuf::from("/proj/d.rs")]),
        ];
        let assignments = assign(&targets, &mut idx, 4);
        // Two workers — they did not merge.
        assert_eq!(assignments.len(), 2);
    }

    #[test]
    fn build_mode_for_code_goals() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        let targets = vec![(0, vec![PathBuf::from("/proj/a.rs")])];
        let assignments = assign(&targets, &mut idx, 4);
        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].suggested_mode_name, "build");
    }

    #[test]
    fn chat_mode_for_general_only() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        let targets = vec![(0, vec![]), (1, vec![])];
        let assignments = assign(&targets, &mut idx, 4);
        // Two general goals merge into one general worker (no files => chat).
        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].suggested_mode_name, "chat");
    }

    #[test]
    fn empty_input_returns_empty() {
        let g = fixture_graph();
        let mut idx = DistanceIndex::new(g);
        let assignments = assign(&[], &mut idx, 4);
        assert!(assignments.is_empty());
    }

    #[test]
    fn cluster_size_cap_respected() {
        let mut g = CodeGraph::new();
        // 6 files all interconnected so distance <= 1 between any pair.
        let nodes: Vec<usize> = (0..6)
            .map(|i| g.add_node(PathBuf::from(format!("/proj/f{i}.rs")), None))
            .collect();
        for i in 0..6 {
            for j in (i + 1)..6 {
                g.add_edge(nodes[i], nodes[j], EdgeKind::Import);
            }
        }
        let mut idx = DistanceIndex::new(g);
        let targets: Vec<(usize, Vec<PathBuf>)> = (0..6)
            .map(|i| (i, vec![PathBuf::from(format!("/proj/f{i}.rs"))]))
            .collect();
        let assignments = assign_with(
            &targets,
            &mut idx,
            8,
            AssignConfig {
                merge_distance: 2,
                max_goals_per_worker: 2,
            },
        );
        // No worker should have more than 2 goals.
        for a in &assignments {
            assert!(
                a.goals.len() <= 2,
                "worker {:?} exceeds cap: {} goals",
                a.goals,
                a.goals.len()
            );
        }
    }
}
