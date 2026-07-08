//! AST-node-level lease management for multi-agent coordination.
//!
//! A [`Lease`] is a MAPF-style "vertex claim" over a region of a file's syntax
//! tree. Two workers editing *different* functions in the same file can hold
//! non-overlapping leases simultaneously; a worker that edits into another
//! worker's leased region triggers a [`Conflict`].
//!
//! Overlap rule (same file required):
//! - If either lease has `span = None` (whole-file), it overlaps everything.
//! - If both leases have spans, they overlap when their byte ranges intersect
//!   *or* one lease's [`NodePath`] is an ancestor (prefix) of the other's.
//!   The ancestor rule catches the case where one worker claims a whole
//!   `impl` block and another claims a method inside it.
//!
//! Unparseable/unknown-language files degrade to whole-file leases (`None`).

use khadim_code_graph::{ChangedRange, NodePath, NodeSpan};
use std::path::PathBuf;

/// Identifier for a held lease.
pub type LeaseId = u64;

/// A claim over a file region. `span = None` means the whole file (used for
/// new files or unparseable/unknown-language files).
#[derive(Debug, Clone)]
pub struct Lease {
    pub lease_id: LeaseId,
    pub worker_id: String,
    pub file: PathBuf,
    pub span: Option<NodeSpan>,
}

/// A conflict between two leases. `lease` is the lease that was being
/// claimed/checked; `conflicting_lease` is the existing lease that blocks it.
/// `range` is the byte range (in the new source) where the overlap was
/// detected, when applicable.
#[derive(Debug, Clone)]
pub struct Conflict {
    pub lease: Lease,
    pub conflicting_lease: Lease,
    pub file: PathBuf,
    pub range: std::ops::Range<usize>,
}

/// Manages a set of leases. Wrap in `Arc<Mutex<LeaseManager>>` for sharing
/// across worker tasks.
#[derive(Debug, Default)]
pub struct LeaseManager {
    leases: Vec<Lease>,
    next_id: u64,
}

impl LeaseManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of currently-held leases.
    pub fn len(&self) -> usize {
        self.leases.len()
    }

    pub fn is_empty(&self) -> bool {
        self.leases.is_empty()
    }

    /// Borrow all held leases.
    pub fn leases(&self) -> &[Lease] {
        &self.leases
    }

    /// Claim a lease for `worker_id` over `file` (optionally bounded by
    /// `span`). Returns the new [`LeaseId`] on success, or the [`Conflict`]
    /// describing the existing lease that blocks the claim.
    pub fn claim(
        &mut self,
        worker_id: impl Into<String>,
        file: PathBuf,
        span: Option<NodeSpan>,
    ) -> Result<LeaseId, Conflict> {
        let worker_id = worker_id.into();
        for existing in &self.leases {
            if let Some(range) = overlap(file.as_path(), span.as_ref(), existing) {
                let new_lease = Lease {
                    lease_id: 0, // placeholder; not assigned yet
                    worker_id: worker_id.clone(),
                    file: file.clone(),
                    span: span.clone(),
                };
                return Err(Conflict {
                    lease: new_lease,
                    conflicting_lease: existing.clone(),
                    file: file.clone(),
                    range,
                });
            }
        }
        self.next_id += 1;
        let id = self.next_id;
        self.leases.push(Lease {
            lease_id: id,
            worker_id,
            file,
            span,
        });
        Ok(id)
    }

    /// Release a single lease by id. No-op if not found.
    pub fn release(&mut self, lease_id: LeaseId) {
        self.leases.retain(|l| l.lease_id != lease_id);
    }

    /// Release every lease held by `worker_id`. Used on worker exit
    /// (success, failure, or abort).
    pub fn release_worker(&mut self, worker_id: &str) {
        self.leases.retain(|l| l.worker_id != worker_id);
    }

    /// Check whether a set of `changed_ranges` (from a reparse of `file`)
    /// intersects any *other* worker's lease. Returns one [`Conflict`] per
    /// overlapping existing lease. Leases held by `worker_id` itself are
    /// ignored (a worker editing its own leased region is fine).
    pub fn check_edit(
        &self,
        worker_id: &str,
        file: &PathBuf,
        changed_ranges: &[ChangedRange],
    ) -> Vec<Conflict> {
        let mut conflicts = Vec::new();
        for existing in &self.leases {
            if existing.worker_id == worker_id {
                continue;
            }
            if existing.file != *file {
                continue;
            }
            // Determine the overlap range for reporting.
            let mut found_range: Option<std::ops::Range<usize>> = None;
            // If the existing lease is whole-file (None), any change conflicts.
            if existing.span.is_none() {
                // Report the union of all changed ranges (or 0..0 if empty).
                if let Some(first) = changed_ranges.first() {
                    let start = first.start;
                    let end = changed_ranges.iter().map(|r| r.end).max().unwrap_or(first.end);
                    found_range = Some(start..end);
                } else {
                    found_range = Some(0..0);
                }
            } else {
                let ex_span = existing.span.as_ref().unwrap();
                for cr in changed_ranges {
                    // Byte-range intersection.
                    let s = cr.start.max(ex_span.byte_range.start);
                    let e = cr.end.min(ex_span.byte_range.end);
                    if s < e {
                        found_range = Some(s..e);
                        break;
                    }
                }
                // Also treat NodePath containment (ancestor) as overlap: if the
                // existing lease's path is a prefix of (or equal to) the edited
                // region's enclosing node, and the edit is within the existing
                // lease's byte range, that's an overlap. Here we approximate by
                // checking byte-range containment of the change within the
                // existing lease's byte range even without a span on the edit.
                if found_range.is_none() {
                    for cr in changed_ranges {
                        if ex_span.byte_range.start <= cr.start
                            && ex_span.byte_range.end >= cr.end
                        {
                            found_range = Some(cr.start..cr.end);
                            break;
                        }
                    }
                }
            }
            if let Some(range) = found_range {
                let new_lease = Lease {
                    lease_id: 0,
                    worker_id: worker_id.to_string(),
                    file: file.clone(),
                    span: None,
                };
                conflicts.push(Conflict {
                    lease: new_lease,
                    conflicting_lease: existing.clone(),
                    file: file.clone(),
                    range,
                });
            }
        }
        conflicts
    }
}

/// Determine whether a new claim `(new_file, new_span)` overlaps an existing
/// `lease`. Returns the overlapping byte range if so, `None` otherwise.
///
/// See the module docs for the overlap rule.
fn overlap(
    new_file: &std::path::Path,
    new_span: Option<&NodeSpan>,
    existing: &Lease,
) -> Option<std::ops::Range<usize>> {
    if existing.file != new_file {
        return None;
    }
    let ex_span = existing.span.as_ref();
    match (new_span, ex_span) {
        // Both whole-file → overlap at 0..0 (whole file).
        (None, None) => Some(0..0),
        // New is whole-file, existing is bounded → overlap the existing range.
        (None, Some(ex)) => Some(ex.byte_range.clone()),
        // New is bounded, existing is whole-file → overlap the new range.
        (Some(ns), None) => Some(ns.byte_range.clone()),
        // Both bounded → byte-range intersection or NodePath ancestry.
        (Some(ns), Some(ex)) => byte_or_path_overlap(ns, ex),
    }
}

/// Combined byte-range + NodePath-ancestry overlap check for two bounded spans.
fn byte_or_path_overlap(ns: &NodeSpan, ex: &NodeSpan) -> Option<std::ops::Range<usize>> {
    // Byte-range intersection.
    let s = ns.byte_range.start.max(ex.byte_range.start);
    let e = ns.byte_range.end.min(ex.byte_range.end);
    if s < e {
        return Some(s..e);
    }
    // NodePath ancestry (one is a prefix of the other).
    if path_is_prefix(&ns.path, &ex.path) || path_is_prefix(&ex.path, &ns.path) {
        // Return the smaller (deeper) byte range.
        let deeper = if ns.byte_range.start >= ex.byte_range.start {
            ns
        } else {
            ex
        };
        return Some(deeper.byte_range.clone());
    }
    None
}

/// True if `a` is an ancestor (prefix) of `b` in the path-step sense.
/// A path is a prefix of another if its steps are the leading subsequence.
/// Equal paths are also considered prefixes (overlap with self).
fn path_is_prefix(a: &NodePath, b: &NodePath) -> bool {
    if a.steps.len() > b.steps.len() {
        return false;
    }
    a.steps
        .iter()
        .zip(b.steps.iter())
        .all(|((ak, ai), (bk, bi))| ak == bk && ai == bi)
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use khadim_code_graph::{NodePath, NodeSpan};

    fn span(start: usize, end: usize) -> NodeSpan {
        // Each byte range gets a distinct path so non-overlapping byte ranges
        // are treated as separate nodes (real usage: different functions have
        // different NodePaths). The path encodes the byte range as a child
        // index to keep test spans distinct.
        NodeSpan {
            path: NodePath::new(vec![
                ("source_file".to_string(), 0),
                ("function_item".to_string(), start),
            ]),
            byte_range: start..end,
        }
    }

    fn span_with_path(start: usize, end: usize, steps: Vec<(&str, usize)>) -> NodeSpan {
        NodeSpan {
            path: NodePath::new(steps.into_iter().map(|(k, i)| (k.to_string(), i)).collect()),
            byte_range: start..end,
        }
    }

    #[test]
    fn claim_whole_file_twice_conflicts() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/a.rs");
        let id1 = mgr.claim("w1", f.clone(), None).unwrap();
        assert_eq!(id1, 1);
        // Second whole-file claim on the same file → conflict.
        let err = mgr.claim("w2", f.clone(), None).unwrap_err();
        assert_eq!(err.conflicting_lease.worker_id, "w1");
        assert_eq!(err.file, f);
    }

    #[test]
    fn two_different_functions_same_file_no_conflict() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        let s1 = span(0, 50);
        let s2 = span(60, 120);
        let id1 = mgr.claim("w1", f.clone(), Some(s1)).unwrap();
        let id2 = mgr.claim("w2", f.clone(), Some(s2)).unwrap();
        assert_ne!(id1, id2);
        assert_eq!(mgr.len(), 2);
    }

    #[test]
    fn overlapping_spans_second_claim_rejected() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        let s1 = span(0, 100);
        let s2 = span(50, 150); // overlaps s1 in bytes 50..100
        mgr.claim("w1", f.clone(), Some(s1)).unwrap();
        let err = mgr.claim("w2", f.clone(), Some(s2)).unwrap_err();
        assert_eq!(err.conflicting_lease.worker_id, "w1");
        assert_eq!(err.range, 50..100);
    }

    #[test]
    fn node_path_ancestry_counts_as_overlap() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        // Existing: an impl block covering bytes 0..200.
        let impl_span = span_with_path(0, 200, vec![
            ("source_file", 0),
            ("impl_item", 0),
        ]);
        // New: a method inside the impl, bytes 20..80 (within 0..200) but
        // non-overlapping byte ranges are impossible here since it's inside.
        // Use a method whose byte range is WITHIN the impl but disjoint in
        // the *byte range* sense is impossible; instead test a sibling method
        // outside the impl byte range to confirm ancestry is the trigger.
        // Actually for ancestry we need the method path to be a descendant.
        let method_span = span_with_path(20, 80, vec![
            ("source_file", 0),
            ("impl_item", 0),
            ("function_item", 1),
        ]);
        mgr.claim("w1", f.clone(), Some(impl_span)).unwrap();
        // Method is a descendant of impl → conflict via ancestry.
        let res = mgr.claim("w2", f.clone(), Some(method_span));
        assert!(res.is_err(), "descendant path should conflict via ancestry");
        let err = res.unwrap_err();
        assert_eq!(err.conflicting_lease.worker_id, "w1");
    }

    #[test]
    fn release_removes_lease() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/a.rs");
        let id = mgr.claim("w1", f.clone(), None).unwrap();
        assert_eq!(mgr.len(), 1);
        mgr.release(id);
        assert_eq!(mgr.len(), 0);
        // Can now re-claim.
        mgr.claim("w2", f, None).unwrap();
        assert_eq!(mgr.len(), 1);
    }

    #[test]
    fn release_worker_removes_all_their_leases() {
        let mut mgr = LeaseManager::new();
        let f1 = PathBuf::from("src/a.rs");
        let f2 = PathBuf::from("src/b.rs");
        mgr.claim("w1", f1.clone(), Some(span(0, 50))).unwrap();
        mgr.claim("w1", f2.clone(), Some(span(0, 50))).unwrap();
        mgr.claim("w2", f1, Some(span(60, 100))).unwrap();
        assert_eq!(mgr.len(), 3);
        mgr.release_worker("w1");
        assert_eq!(mgr.len(), 1);
        assert_eq!(mgr.leases()[0].worker_id, "w2");
    }

    #[test]
    fn check_edit_detects_incursion_into_other_lease() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        // w1 owns bytes 0..100.
        mgr.claim("w1", f.clone(), Some(span(0, 100))).unwrap();
        // w2 owns bytes 200..300 (non-overlapping).
        mgr.claim("w2", f.clone(), Some(span(200, 300))).unwrap();

        // w2 edits into w1's region (bytes 40..60).
        let conflicts = mgr.check_edit(
            "w2",
            &f,
            &[ChangedRange::new(40, 60)],
        );
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflicting_lease.worker_id, "w1");
        assert_eq!(conflicts[0].range, 40..60);
    }

    #[test]
    fn check_edit_ignores_own_lease() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        mgr.claim("w1", f.clone(), Some(span(0, 100))).unwrap();
        // w1 edits its own region → no conflict.
        let conflicts = mgr.check_edit("w1", &f, &[ChangedRange::new(10, 20)]);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn check_edit_into_whole_file_lease_conflicts() {
        let mut mgr = LeaseManager::new();
        let f = PathBuf::from("src/lib.rs");
        mgr.claim("w1", f.clone(), None).unwrap();
        let conflicts = mgr.check_edit("w2", &f, &[ChangedRange::new(5, 15)]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].range, 5..15);
    }

    #[test]
    fn check_edit_different_file_no_conflict() {
        let mut mgr = LeaseManager::new();
        let f1 = PathBuf::from("src/a.rs");
        let f2 = PathBuf::from("src/b.rs");
        mgr.claim("w1", f1, None).unwrap();
        let conflicts = mgr.check_edit("w2", &f2, &[ChangedRange::new(0, 10)]);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn path_is_prefix_basic() {
        let a = NodePath::new(vec![("root".to_string(), 0), ("impl".to_string(), 0)]);
        let b = NodePath::new(vec![
            ("root".to_string(), 0),
            ("impl".to_string(), 0),
            ("fn".to_string(), 1),
        ]);
        assert!(path_is_prefix(&a, &b));
        assert!(!path_is_prefix(&b, &a));
        // Equal paths are prefixes of each other.
        assert!(path_is_prefix(&a, &a));
    }
}