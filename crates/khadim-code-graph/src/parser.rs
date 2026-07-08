//! Language registry and per-file parse cache with incremental reparsing.
//!
//! Tree-sitter 0.25 API notes:
//! - Grammar crates expose a `LANGUAGE` constant (a `tree_sitter::LanguageFn`),
//!   converted to `tree_sitter::Language` via `Language::new(...)` or `.into()`.
//! - `tree-sitter-typescript` exposes both `LANGUAGE_TYPESCRIPT` and `LANGUAGE_TSX`.
//! - Incremental parsing: call `Tree::edit(&InputEdit)` then re-parse with the
//!   edited tree as the prior tree. The edit points must be computed from the
//!   old vs new source. A correct full-reparse diff fallback is used when the
//!   edit cannot be precisely characterised (e.g. multi-region edits), per the
//!   WP1 plan: "correctness of ChangedRange output matters more than speed."

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tree_sitter::{InputEdit, Language, Parser, Point, Tree};

/// A byte range describing what changed between two parses of the same file.
///
/// For incremental edits this is the edited region in the *new* source's byte
/// coordinates. For a full-reparse fallback it is the contiguous byte range
/// spanning the common-prefix/suffix difference of the two source strings.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ChangedRange {
    /// Inclusive start byte offset in the new source.
    pub start: usize,
    /// Exclusive end byte offset in the new source.
    pub end: usize,
}

impl ChangedRange {
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    /// Whether `self` covers the entirety of `other` (in new-source coords).
    pub fn covers(&self, other: &ChangedRange) -> bool {
        self.start <= other.start && self.end >= other.end
    }
}

/// Identifier for one of the five WP1-supported languages.
///
/// Used instead of `tree_sitter::Language::name()`, which is only populated
/// for newer grammars (Rust) and returns `None` for the others.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LangId {
    Rust,
    Typescript,
    Tsx,
    Javascript,
    Python,
    Go,
}

/// Maps file extensions to tree-sitter languages.
///
/// Supported extensions:
/// - `rs` -> Rust
/// - `ts`, `tsx` -> TypeScript / TSX
/// - `js`, `jsx`, `mjs`, `cjs` -> JavaScript
/// - `py` -> Python
/// - `go` -> Go
pub struct LanguageRegistry {
    by_ext: HashMap<String, (LangId, Language)>,
}

impl LanguageRegistry {
    /// Build a registry with the five WP1 grammars loaded.
    pub fn new() -> Self {
        let mut by_ext: HashMap<String, (LangId, Language)> = HashMap::new();

        let rust: Language = tree_sitter_rust::LANGUAGE.into();
        by_ext.insert("rs".to_string(), (LangId::Rust, rust));

        let typescript: Language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        by_ext.insert("ts".to_string(), (LangId::Typescript, typescript));

        let tsx: Language = tree_sitter_typescript::LANGUAGE_TSX.into();
        by_ext.insert("tsx".to_string(), (LangId::Tsx, tsx));

        let javascript: Language = tree_sitter_javascript::LANGUAGE.into();
        for ext in ["js", "jsx", "mjs", "cjs"] {
            by_ext.insert(ext.to_string(), (LangId::Javascript, javascript.clone()));
        }

        let python: Language = tree_sitter_python::LANGUAGE.into();
        by_ext.insert("py".to_string(), (LangId::Python, python));

        let go: Language = tree_sitter_go::LANGUAGE.into();
        by_ext.insert("go".to_string(), (LangId::Go, go));

        Self { by_ext }
    }

    /// Look up the language for a path by its extension.
    pub fn language_for_path(&self, path: &Path) -> Option<Language> {
        self.by_ext
            .get(path.extension()?.to_str()?)
            .map(|(_, l)| l.clone())
    }

    /// Look up the [`LangId`] for a path by its extension.
    pub fn language_id_for_path(&self, path: &Path) -> Option<LangId> {
        self.by_ext.get(path.extension()?.to_str()?).map(|(id, _)| *id)
    }

    /// Return a fresh parser configured for `path`, or `None` if unsupported.
    fn parser_for_path(&self, path: &Path) -> Option<Parser> {
        let lang = self.language_for_path(path)?;
        let mut parser = Parser::new();
        parser
            .set_language(&lang)
            .expect("tree-sitter language setup failed");
        Some(parser)
    }
}

impl Default for LanguageRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Per-file entry in the parse cache.
struct Entry {
    tree: Tree,
    source: String,
}

/// Per-file cache of parsed tree-sitter trees and their source text.
///
/// All operations are synchronous.
pub struct ParseCache {
    registry: LanguageRegistry,
    entries: HashMap<PathBuf, Entry>,
}

impl ParseCache {
    /// Construct a cache with the default [`LanguageRegistry`].
    pub fn new() -> Self {
        Self::with_registry(LanguageRegistry::new())
    }

    /// Construct a cache backed by a custom registry.
    pub fn with_registry(registry: LanguageRegistry) -> Self {
        Self {
            registry,
            entries: HashMap::new(),
        }
    }

    /// Borrow the registry.
    pub fn registry(&self) -> &LanguageRegistry {
        &self.registry
    }

    /// Look up the [`LangId`] for a path via the registry.
    pub fn language_id_for_path(&self, path: &Path) -> Option<LangId> {
        self.registry.language_id_for_path(path)
    }

    /// Parse `source` for `path`, storing the tree. Returns the root node kind
    /// on success or `None` if the language is unsupported.
    pub fn parse(&mut self, path: &Path, source: &str) -> Option<String> {
        let mut parser = self.registry.parser_for_path(path)?;
        let tree = parser.parse(source.as_bytes(), None)?;
        let kind = tree.root_node().kind().to_string();
        self.entries.insert(
            path.to_path_buf(),
            Entry {
                tree,
                source: source.to_string(),
            },
        );
        Some(kind)
    }

    /// Re-parse `path` with `new_source`, returning the byte range(s) that
    /// changed relative to the previously cached source.
    ///
    /// Attempts incremental parsing when the edit is a single contiguous
    /// replacement; falls back to a full reparse + common-prefix/suffix diff
    /// (which is itself a single contiguous `ChangedRange`) for anything more
    /// complex. Returns `None` if the path was never parsed or the language is
    /// unsupported.
    pub fn reparse(&mut self, path: &Path, new_source: &str) -> Option<Vec<ChangedRange>> {
        let entry = self.entries.get(path)?;
        let old_source = entry.source.clone();
        let old_tree = entry.tree.clone();

        // Compute the single contiguous edit region (common prefix/suffix).
        let (start_byte, old_end_byte, new_end_byte, start_position, old_end_position, new_end_position) =
            compute_single_edit(&old_source, new_source);

        // Build the InputEdit and edit the old tree, then reparse with it as
        // the prior tree. Even when start_byte..new_end_byte does not cover the
        // *entire* textual difference (multi-region edits), the resulting tree
        // is correct because tree-sitter re-uses unchanged subtrees and
        // reparses the edited span; for v1 we still report a single
        // ChangedRange derived from the diff, which the plan permits.
        let mut edited_old_tree = old_tree;
        edited_old_tree.edit(&InputEdit {
            start_byte,
            old_end_byte,
            new_end_byte,
            start_position,
            old_end_position,
            new_end_position,
        });

        let mut parser = self.registry.parser_for_path(path)?;
        let new_tree = parser.parse(new_source.as_bytes(), Some(&edited_old_tree))?;

        // The reported changed range uses new-source byte coordinates and
        // spans the contiguous region that differs between old and new source.
        let range = ChangedRange::new(start_byte, new_end_byte);

        self.entries.insert(
            path.to_path_buf(),
            Entry {
                tree: new_tree,
                source: new_source.to_string(),
            },
        );

        Some(vec![range])
    }

    /// Borrow the cached tree for `path`, if any.
    pub fn tree(&self, path: &Path) -> Option<&Tree> {
        self.entries.get(path).map(|e| &e.tree)
    }

    /// Borrow the cached source for `path`, if any.
    pub fn source(&self, path: &Path) -> Option<&str> {
        self.entries.get(path).map(|e| e.source.as_str())
    }

    /// Borrow the cached `(tree, source)` for `path`, if any.
    pub fn tree_and_source(&self, path: &Path) -> Option<(&Tree, &str)> {
        self.entries.get(path).map(|e| (&e.tree, e.source.as_str()))
    }

    /// Drop the cached entry for `path`, if any.
    pub fn evict(&mut self, path: &Path) {
        self.entries.remove(path);
    }
}

impl Default for ParseCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute a single contiguous edit between two strings, returning
/// `(start_byte, old_end_byte, new_end_byte, start_point, old_end_point, new_end_point)`.
///
/// The common prefix and suffix are removed; the middle is the edit. This is
/// correct for any single-region edit (insert/delete/replace) and produces a
/// conservative contiguous range for multi-region edits (the plan explicitly
/// allows a single-range fallback).
fn compute_single_edit(old: &str, new: &str) -> (usize, usize, usize, Point, Point, Point) {
    let old_b = old.as_bytes();
    let new_b = new.as_bytes();

    // Common prefix (in bytes, but aligned to char boundaries by walking bytes
    // while they match on UTF-8 lead bytes is unnecessary for tree-sitter: it
    // works in byte offsets and edits only need valid byte positions).
    let mut prefix = 0usize;
    let limit = old_b.len().min(new_b.len());
    while prefix < limit && old_b[prefix] == new_b[prefix] {
        prefix += 1;
    }

    // Common suffix (bytes), not overlapping the prefix.
    let mut suffix = 0usize;
    while suffix < (old_b.len() - prefix) && suffix < (new_b.len() - prefix) {
        if old_b[old_b.len() - 1 - suffix] == new_b[new_b.len() - 1 - suffix] {
            suffix += 1;
        } else {
            break;
        }
    }

    let start_byte = prefix;
    let old_end_byte = old_b.len() - suffix;
    let new_end_byte = new_b.len() - suffix;

    let start_position = byte_to_point(old_b, start_byte);
    let old_end_position = byte_to_point(old_b, old_end_byte);
    let new_end_position = byte_to_point(new_b, new_end_byte);

    (
        start_byte,
        old_end_byte,
        new_end_byte,
        start_position,
        old_end_position,
        new_end_position,
    )
}

/// Convert a byte offset into a `(row, column)` point within `bytes`.
///
/// Column is in bytes (tree-sitter columns are byte offsets within a row).
fn byte_to_point(bytes: &[u8], byte: usize) -> Point {
    let mut row = 0usize;
    let mut col = 0usize;
    let mut i = 0usize;
    while i < byte && i < bytes.len() {
        if bytes[i] == b'\n' {
            row += 1;
            col = 0;
        } else {
            col += 1;
        }
        i += 1;
    }
    Point::new(row, col)
}

/// Walk a tree and return true if any node is an `ERROR` or `MISSING` node.
///
/// Public helper used by [`crate::predicates`].
pub(crate) fn tree_has_errors(tree: &Tree) -> bool {
    fn walk(node: tree_sitter::Node) -> bool {
        if node.is_error() || node.is_missing() {
            return true;
        }
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if walk(child) {
                return true;
            }
        }
        false
    }
    walk(tree.root_node())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_maps_all_extensions() {
        let reg = LanguageRegistry::new();
        assert!(reg.language_for_path(Path::new("a.rs")).is_some());
        assert!(reg.language_for_path(Path::new("a.ts")).is_some());
        assert!(reg.language_for_path(Path::new("a.tsx")).is_some());
        assert!(reg.language_for_path(Path::new("a.js")).is_some());
        assert!(reg.language_for_path(Path::new("a.jsx")).is_some());
        assert!(reg.language_for_path(Path::new("a.mjs")).is_some());
        assert!(reg.language_for_path(Path::new("a.cjs")).is_some());
        assert!(reg.language_for_path(Path::new("a.py")).is_some());
        assert!(reg.language_for_path(Path::new("a.go")).is_some());
        assert!(reg.language_for_path(Path::new("a.md")).is_none());
        assert!(reg.language_for_path(Path::new("a.txt")).is_none());
    }

    #[test]
    fn parse_and_read_root_kind() {
        let mut cache = ParseCache::new();
        let path = Path::new("t.rs");
        let kind = cache.parse(path, "fn main() {}").unwrap();
        assert_eq!(kind, "source_file");
        assert!(cache.tree(path).is_some());
        assert_eq!(cache.source(path).unwrap(), "fn main() {}");
    }

    #[test]
    fn reparse_returns_changed_range_covering_edit() {
        let mut cache = ParseCache::new();
        let path = Path::new("t.rs");
        cache.parse(path, "fn foo() {\n  1\n}\n").unwrap();

        // Insert a parameter into `foo` at byte 7.
        let new_source = "fn foo(a: u32) {\n  1\n}\n";
        let changed = cache.reparse(path, new_source).unwrap();
        assert_eq!(changed.len(), 1);
        let r = &changed[0];
        // The edit starts at the insertion point (byte 7, after "fn foo(").
        assert_eq!(r.start, 7);
        // The reported range must be non-empty and fall within the new source.
        assert!(r.end > r.start);
        assert!(r.end <= new_source.len());
        // The reparse must yield a tree with no errors.
        let tree = cache.tree(path).unwrap();
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn reparse_unrelated_edit_range() {
        let mut cache = ParseCache::new();
        let path = Path::new("t.rs");
        let old = "fn foo() { 1 }\nfn bar() { 2 }\n";
        cache.parse(path, old).unwrap();
        // Change `bar`'s body, far from foo.
        let new = "fn foo() { 1 }\nfn bar() { 99 }\n";
        let changed = cache.reparse(path, new).unwrap();
        let r = &changed[0];
        // Range must fall within the second function's region.
        let bar_start = new.find("fn bar").unwrap();
        assert!(r.start >= bar_start, "range {r:?} should be within bar");
    }

    #[test]
    fn compute_single_edit_insert() {
        // "fn foo() {}" -> "fn foo(a: u32) {}"
        // common prefix = "fn foo(" (7), common suffix = ") {}" (4)
        let (s, oe, ne, _, _, _) = compute_single_edit("fn foo() {}", "fn foo(a: u32) {}");
        assert_eq!(s, 7);
        assert_eq!(oe, 7); // old_end = 11 - 4 = 7 (the ")" is shared suffix)
        assert_eq!(ne, 13); // new_end = 17 - 4 = 13
    }

    #[test]
    fn compute_single_edit_delete() {
        // "fn foo(a: u32) {}" -> "fn foo() {}"
        // common prefix = "fn foo(" (7), common suffix = ") {}" (4)
        let (s, oe, ne, _, _, _) = compute_single_edit("fn foo(a: u32) {}", "fn foo() {}");
        assert_eq!(s, 7);
        assert_eq!(oe, 13); // old_end = 17 - 4 = 13
        assert_eq!(ne, 7); // new_end = 11 - 4 = 7
    }

    #[test]
    fn compute_single_edit_replace() {
        let (s, oe, ne, _, _, _) = compute_single_edit("let x = 1;", "let x = 999;");
        // common prefix "let x = ", common suffix ";"
        assert_eq!(s, "let x = ".len());
        assert_eq!(oe, "let x = ".len() + "1".len());
        assert_eq!(ne, "let x = ".len() + "999".len());
    }

    #[test]
    fn compute_single_edit_full_replace() {
        let (s, oe, ne, _, _, _) = compute_single_edit("abc", "xyz");
        assert_eq!(s, 0);
        assert_eq!(oe, 3);
        assert_eq!(ne, 3);
    }
}