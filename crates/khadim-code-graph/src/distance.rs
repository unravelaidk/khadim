//! All-pairs BFS hop distance over the undirected import graph.
//!
//! [`DistanceIndex`] is the CPD analog for Khadim's locality-based goal
//! assignment: a precomputed matrix of hop distances between every pair of
//! files in a [`CodeGraph`].
//!
//! # Distance model
//!
//! The index treats the graph as **undirected** and includes **both**
//! [`EdgeKind::Import`] and [`EdgeKind::Call`] edges. Both signal locality
//! (a file that calls into another is co-located with it in the developer's
//! mental model), so collapsing them into a single undirected neighbourhood
//! gives a better locality signal than imports alone.
//!
//! # Storage
//!
//! Distances are stored as a `Vec<Vec<Option<u32>>>` of size `n x n` where
//! `n = graph.node_count()`. `distance(a, b)` is `None` when the nodes are
//! disconnected. For ~10^4 nodes this is ~400 MB worst case (`Option<u32>` is
//! 8 bytes); the plan calls graphs "~10^3–10^4 nodes; recompute is fine", so
//! the dense layout is acceptable for v1. A sparse hashmap variant can be
//! swapped in later if needed.
//!
//! # Invalidation
//!
//! [`DistanceIndex::invalidate`] marks the index stale (the underlying graph
//! may have changed) without recomputing. The next [`DistanceIndex::distance`]
//! call after invalidation triggers a lazy rebuild against the *currently
//! stored* graph reference — callers should mutate/replace the graph before
//! invalidating. [`DistanceIndex::rebuild`] forces an immediate recompute.

use std::collections::VecDeque;
use std::path::Path;

use crate::graph::{CodeGraph, EdgeKind};

/// Precomputed all-pairs BFS hop distance over the undirected import graph.
#[derive(Debug, Clone)]
pub struct DistanceIndex {
    /// Snapshot of node count at build time; used to validate `distance` args.
    n: usize,
    /// `dist[a][b]` = hop distance from `a` to `b`, or `None` if disconnected.
    dist: Vec<Vec<Option<u32>>>,
    /// When true, the next `distance()` call rebuilds from the current graph.
    dirty: bool,
    /// The graph the index was built from (kept for rebuilds).
    graph: CodeGraph,
}

impl DistanceIndex {
    /// Build the index from a [`CodeGraph`] (computes all-pairs BFS now).
    pub fn new(graph: CodeGraph) -> Self {
        let n = graph.node_count();
        let dist = all_pairs_bfs(&graph, n);
        Self {
            n,
            dist,
            dirty: false,
            graph,
        }
    }

    /// Hop distance between nodes `a` and `b`, or `None` if disconnected.
    ///
    /// Triggers a lazy rebuild if the index was invalidated.
    pub fn distance(&mut self, a: usize, b: usize) -> Option<u32> {
        if self.dirty {
            self.rebuild();
        }
        if a >= self.n || b >= self.n {
            return None;
        }
        self.dist[a][b]
    }

    /// Read-only distance without lazy rebuild (returns the cached value).
    ///
    /// Useful when callers know the index is fresh and want to avoid the
    /// `&mut self` requirement.
    pub fn distance_cached(&self, a: usize, b: usize) -> Option<u32> {
        if a >= self.n || b >= self.n {
            return None;
        }
        self.dist[a][b]
    }

    /// Mark the index as stale. The next `distance()` call rebuilds from the
    /// currently-held graph snapshot.
    ///
    /// Callers that mutate the graph must arrange for the updated graph to be
    /// visible to the index before invalidating (e.g. by replacing the graph
    /// via [`DistanceIndex::replace_graph`]).
    pub fn invalidate(&mut self, _changed_file: &Path) {
        self.dirty = true;
    }

    /// Replace the underlying graph and mark the index stale.
    pub fn replace_graph(&mut self, graph: CodeGraph) {
        self.graph = graph;
        self.dirty = true;
    }

    /// Force an immediate recompute from the held graph.
    pub fn rebuild(&mut self) {
        self.n = self.graph.node_count();
        self.dist = all_pairs_bfs(&self.graph, self.n);
        self.dirty = false;
    }

    /// Number of nodes in the index.
    pub fn node_count(&self) -> usize {
        self.n
    }

    /// Borrow the held graph snapshot.
    pub fn graph(&self) -> &CodeGraph {
        &self.graph
    }
}

/// Compute all-pairs BFS hop distance over the undirected version of `graph`.
///
/// Both `Import` and `Call` edges are treated as undirected links.
fn all_pairs_bfs(graph: &CodeGraph, n: usize) -> Vec<Vec<Option<u32>>> {
    // Build adjacency list (undirected).
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for e in graph.edges() {
        // Skip self-loops; they don't affect distance.
        if e.from == e.to || e.from >= n || e.to >= n {
            continue;
        }
        match e.kind {
            EdgeKind::Import | EdgeKind::Call { .. } => {
                adj[e.from].push(e.to);
                adj[e.to].push(e.from);
            }
        }
    }

    let mut dist = vec![vec![None; n]; n];
    for src in 0..n {
        // BFS from src.
        dist[src][src] = Some(0);
        let mut queue = VecDeque::with_capacity(n);
        queue.push_back(src);
        while let Some(u) = queue.pop_front() {
            let du = dist[src][u].unwrap_or(0);
            for &v in &adj[u] {
                if dist[src][v].is_none() {
                    dist[src][v] = Some(du + 1);
                    queue.push_back(v);
                }
            }
        }
    }
    dist
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{CodeGraph, EdgeKind, GraphEdge, GraphNode};
    use std::path::PathBuf;

    /// Build a tiny graph: a(0) -import- b(1) -import- c(2), plus isolated d(3).
    fn fixture() -> (CodeGraph, [usize; 4]) {
        let mut g = CodeGraph::new();
        let a = g.add_node(PathBuf::from("/t/a.rs"), None);
        let b = g.add_node(PathBuf::from("/t/b.rs"), None);
        let c = g.add_node(PathBuf::from("/t/c.rs"), None);
        let d = g.add_node(PathBuf::from("/t/d.rs"), None);
        g.add_edge(a, b, EdgeKind::Import);
        g.add_edge(b, c, EdgeKind::Import);
        (g, [a, b, c, d])
    }

    #[test]
    fn distances_on_chain() {
        let (g, [a, b, c, d]) = fixture();
        let mut idx = DistanceIndex::new(g);
        assert_eq!(idx.distance(a, b), Some(1));
        assert_eq!(idx.distance(a, c), Some(2));
        assert_eq!(idx.distance(b, c), Some(1));
        assert_eq!(idx.distance(a, a), Some(0));
        // d is isolated.
        assert_eq!(idx.distance(a, d), None);
        assert_eq!(idx.distance(d, a), None);
    }

    #[test]
    fn distance_cached_skips_rebuild() {
        let (g, [a, b, _c, _d]) = fixture();
        let idx = DistanceIndex::new(g);
        assert_eq!(idx.distance_cached(a, b), Some(1));
    }

    #[test]
    fn invalidate_then_rebuild_after_edge_add() {
        let (mut g, [a, _b, c, d]) = fixture();
        let mut idx = DistanceIndex::new(g.clone());
        // Initially a-d disconnected.
        assert_eq!(idx.distance(a, d), None);

        // Simulate a new edge c-d in the held graph, then invalidate + rebuild.
        g.add_edge(c, d, EdgeKind::Import);
        idx.replace_graph(g);
        idx.invalidate(Path::new("/t/c.rs"));

        // After lazy rebuild (triggered by distance()), a-d should now be 3
        // (a-b-c-d).
        assert_eq!(idx.distance(a, d), Some(3));
        assert!(!idx.dirty, "rebuild should clear dirty flag");
    }

    #[test]
    fn rebuild_is_idempotent_when_unchanged() {
        let (g, [a, b, _c, _d]) = fixture();
        let mut idx = DistanceIndex::new(g);
        let before = idx.distance(a, b);
        idx.rebuild();
        assert_eq!(idx.distance(a, b), before);
    }

    #[test]
    fn out_of_range_returns_none() {
        let (g, [a, _b, _c, _d]) = fixture();
        let mut idx = DistanceIndex::new(g);
        assert_eq!(idx.distance(a, 999), None);
        assert_eq!(idx.distance(999, a), None);
    }
}