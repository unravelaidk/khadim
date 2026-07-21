//! Post-edit conflict guard combining a [`LeaseManager`] with a [`ParseCache`].
//!
//! [`LeaseGuard`] is attached to mutating tools (`WriteTool`/`EditTool`). After
//! a successful write/edit, the guard reparses the affected file via the
//! [`ParseCache`] to obtain [`ChangedRange`]s, then asks the [`LeaseManager`]
//! whether the edit collided with another worker's lease. On collision it
//! emits a `lease_conflict` event and the tool surfaces an error naming the
//! conflicting worker.
//!
//! When the file's language is unsupported or unparseable, the guard degrades
//! to a whole-file check (changed range 0..len).

use super::lease::{Conflict, LeaseManager};
use khadim_code_graph::{ChangedRange, ParseCache};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

use crate::events::AgentStreamEvent;

/// A guard pairing a lease manager with a parse cache for post-edit checks.
pub struct LeaseGuard {
    manager: Arc<std::sync::Mutex<LeaseManager>>,
    parse_cache: Arc<std::sync::Mutex<ParseCache>>,
    worker_id: String,
    /// Optional event sink for emitting `lease_conflict` events.
    event_tx: Option<UnboundedSender<AgentStreamEvent>>,
}

impl LeaseGuard {
    pub fn new(
        manager: Arc<std::sync::Mutex<LeaseManager>>,
        parse_cache: Arc<std::sync::Mutex<ParseCache>>,
        worker_id: impl Into<String>,
    ) -> Self {
        Self {
            manager,
            parse_cache,
            worker_id: worker_id.into(),
            event_tx: None,
        }
    }

    pub fn with_event_tx(mut self, tx: UnboundedSender<AgentStreamEvent>) -> Self {
        self.event_tx = Some(tx);
        self
    }

    pub fn worker_id(&self) -> &str {
        &self.worker_id
    }

    /// Reparse `file` (reading its current contents from disk) via the cache,
    /// then check the resulting changed ranges against the lease manager.
    /// Returns the list of conflicts (empty if none).
    ///
    /// If the file was never parsed before (first edit of a new file), the
    /// cache parses it fresh and the *entire* file is reported as changed.
    /// If the language is unsupported/unparseable, a single whole-file range
    /// `0..len` is used.
    pub fn check_after_edit(&self, file: &Path) -> Vec<Conflict> {
        let new_source = match std::fs::read_to_string(file) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let changed_ranges = self.reparse_or_full_range(file, &new_source);
        let mgr = self.manager.lock().unwrap();
        mgr.check_edit(&self.worker_id, &file.to_path_buf(), &changed_ranges)
    }

    /// Like [`check_after_edit`] but with an explicitly-provided new source
    /// (avoids re-reading from disk when the caller already has the bytes).
    pub fn check_after_edit_with_source(&self, file: &Path, new_source: &str) -> Vec<Conflict> {
        let changed_ranges = self.reparse_or_full_range(file, new_source);
        let mgr = self.manager.lock().unwrap();
        mgr.check_edit(&self.worker_id, &file.to_path_buf(), &changed_ranges)
    }

    /// Reparse via the cache, returning changed ranges. Falls back to a
    /// single `0..len` range when the file has no prior parse (new file) or
    /// the language is unsupported.
    fn reparse_or_full_range(&self, file: &Path, new_source: &str) -> Vec<ChangedRange> {
        let mut cache = self.parse_cache.lock().unwrap();
        // If the cache has no prior entry, parse fresh and treat the whole
        // file as the changed range.
        let has_prior = cache.tree(file).is_some();
        if !has_prior {
            let _ = cache.parse(file, new_source);
            return vec![ChangedRange::new(0, new_source.len())];
        }
        match cache.reparse(file, new_source) {
            Some(ranges) if !ranges.is_empty() => ranges,
            // Reparse succeeded but reported no changes (shouldn't happen
            // after an edit, but be safe): use the whole file.
            Some(_) => vec![ChangedRange::new(0, new_source.len())],
            // Unsupported/unparseable: whole-file range.
            None => vec![ChangedRange::new(0, new_source.len())],
        }
    }

    /// Emit a `lease_conflict` event for each conflict (if an event sink is
    /// attached). Metadata includes both worker ids, the file, and the range.
    pub fn emit_conflict_events(&self, conflicts: &[Conflict]) {
        let Some(tx) = self.event_tx.as_ref() else {
            return;
        };
        for c in conflicts {
            let other = &c.conflicting_lease.worker_id;
            let file = c.file.display().to_string();
            let range = format!("{}..{}", c.range.start, c.range.end);
            let _ = tx.send(AgentStreamEvent::new("lease_conflict").with_metadata(
                serde_json::json!({
                    "worker_id": self.worker_id,
                    "other_worker_id": other,
                    "file": file,
                    "range": range,
                }),
            ));
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coordinator::lease::LeaseManager;
    use khadim_code_graph::{NodePath, NodeSpan};
    use std::path::PathBuf;

    fn make_guard(worker_id: &str) -> (LeaseGuard, Arc<std::sync::Mutex<LeaseManager>>) {
        let mgr = Arc::new(std::sync::Mutex::new(LeaseManager::new()));
        let cache = Arc::new(std::sync::Mutex::new(ParseCache::new()));
        let guard = LeaseGuard::new(mgr.clone(), cache, worker_id);
        (guard, mgr)
    }

    fn span(start: usize, end: usize) -> NodeSpan {
        NodeSpan {
            path: NodePath::new(vec![("source_file".to_string(), 0)]),
            byte_range: start..end,
        }
    }

    #[test]
    fn guard_detects_conflict_after_edit() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        let src = "fn foo() { 1 }\nfn bar() { 2 }\n";
        std::fs::write(&file, src).unwrap();

        let (guard, mgr) = make_guard("w2");
        // w1 owns the whole foo function region (bytes 0..14).
        {
            let mut m = mgr.lock().unwrap();
            m.claim("w1", file.clone(), Some(span(0, 14))).unwrap();
        }
        // w2 edits the file (into w1's region) — append to foo.
        let new_src = "fn foo() { 1; extra }\nfn bar() { 2 }\n";
        std::fs::write(&file, new_src).unwrap();
        let conflicts = guard.check_after_edit(&file);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflicting_lease.worker_id, "w1");
    }

    #[test]
    fn guard_no_conflict_for_own_region() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        let src = "fn foo() { 1 }\nfn bar() { 2 }\n";
        std::fs::write(&file, src).unwrap();

        let (guard, mgr) = make_guard("w1");
        {
            let mut m = mgr.lock().unwrap();
            m.claim("w1", file.clone(), Some(span(0, 14))).unwrap();
        }
        let new_src = "fn foo() { 99 }\nfn bar() { 2 }\n";
        std::fs::write(&file, new_src).unwrap();
        let conflicts = guard.check_after_edit(&file);
        assert!(
            conflicts.is_empty(),
            "editing own lease should not conflict"
        );
    }

    #[test]
    fn guard_no_conflict_different_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_a = tmp.path().join("a.rs");
        let file_b = tmp.path().join("b.rs");
        std::fs::write(&file_a, "fn foo() {}").unwrap();
        std::fs::write(&file_b, "fn bar() {}").unwrap();

        let (guard, mgr) = make_guard("w2");
        {
            let mut m = mgr.lock().unwrap();
            m.claim("w1", file_a.clone(), None).unwrap();
        }
        std::fs::write(&file_b, "fn bar() { 1 }").unwrap();
        let conflicts = guard.check_after_edit(&file_b);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn guard_emits_event_when_tx_attached() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("lib.rs");
        std::fs::write(&file, "fn foo() { 1 }\n").unwrap();

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentStreamEvent>();
        let (guard, mgr) = make_guard("w2");
        let guard = guard.with_event_tx(tx);
        {
            let mut m = mgr.lock().unwrap();
            m.claim("w1", file.clone(), None).unwrap();
        }
        std::fs::write(&file, "fn foo() { 1; 2 }\n").unwrap();
        let conflicts = guard.check_after_edit(&file);
        guard.emit_conflict_events(&conflicts);

        let ev = rx.try_recv().expect("event emitted");
        assert_eq!(ev.event_type, "lease_conflict");
        let meta = ev.metadata.unwrap();
        assert_eq!(meta["worker_id"], "w2");
        assert_eq!(meta["other_worker_id"], "w1");
    }

    #[test]
    fn guard_new_file_whole_range() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("new.rs");
        // w1 has a whole-file lease on a *different* file; no conflict.
        let other = tmp.path().join("other.rs");
        std::fs::write(&other, "fn x() {}").unwrap();

        let (guard, mgr) = make_guard("w2");
        {
            let mut m = mgr.lock().unwrap();
            m.claim("w1", other.clone(), None).unwrap();
        }
        std::fs::write(&file, "fn new() { 1 }\n").unwrap();
        let conflicts = guard.check_after_edit(&file);
        assert!(conflicts.is_empty());
    }
}
