//! Import graph over a source tree: nodes = files, edges = imports + heuristic calls.
//!
//! [`CodeGraph::build`] walks a directory root with the `ignore` crate
//! (respecting `.gitignore` and skipping `node_modules`/`target`/`.git`/
//! `dist`/`build`), parses every recognised source file with a fresh
//! [`ParseCache`], and extracts two kinds of edges:
//!
//! - **[`EdgeKind::Import`]** — derived from language-level import/use/require
//!   statements, resolved to actual files under the root per the conventions
//!   documented on [`resolve_import`]. Unresolved imports are dropped (no edge).
//! - **[`EdgeKind::Call { callee }`]** — a *heuristic, name-matching* edge: every
//!   function-call site in a file is scanned and the callee identifier is
//!   matched against symbols defined in *other* files in the graph. This is
//!   approximate by design (no type resolution, no scope awareness, no
//!   cross-module qualification) — it exists only as a locality signal for the
//!   distance index. A call that resolves to a locally-defined function in the
//!   same file does NOT produce an edge.
//!
//! The graph is intentionally cheap: ~10^3–10^4 nodes, rebuilt on demand.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tree_sitter::{Node, Tree, TreeCursor};

use crate::parser::{LangId, LanguageRegistry, ParseCache};
use crate::predicates::symbols_with;
use crate::SymbolKind;

/// A file (or module) in the import graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphNode {
    /// Absolute-ish path of the source file (as walked from the root).
    pub file: PathBuf,
    /// Declared module name when extractable (e.g. `mod foo;` in Rust,
    /// `package main` in Go). `None` when not applicable.
    pub module_name: Option<String>,
}

/// Kind of relationship between two graph nodes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EdgeKind {
    /// `from` imports `to` (use/import/require/from).
    Import,
    /// `from` contains a call site whose callee identifier matches a symbol
    /// defined in `to`. Heuristic name-matching — see the module docs.
    Call { callee: String },
}

/// A directed edge in the import graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphEdge {
    pub from: usize,
    pub to: usize,
    pub kind: EdgeKind,
}

/// The import graph: nodes (files) and edges (imports + heuristic calls).
#[derive(Debug, Clone, Default)]
pub struct CodeGraph {
    nodes: Vec<GraphNode>,
    /// Path -> node index, for fast lookup.
    index: HashMap<PathBuf, usize>,
    edges: Vec<GraphEdge>,
}

impl CodeGraph {
    /// Build an empty graph.
    pub fn new() -> Self {
        Self::default()
    }

    /// Walk `root` and build the import graph.
    ///
    /// Uses the `ignore` crate to respect `.gitignore` and skip the usual
    /// build/vendor directories. Only files whose extension maps to a
    /// [`LanguageRegistry`] language are parsed.
    pub fn build(root: &Path) -> Self {
        let registry = LanguageRegistry::new();
        Self::build_with_registry(root, &registry)
    }

    /// Build with a custom [`LanguageRegistry`] (mainly for testing).
    pub fn build_with_registry(root: &Path, registry: &LanguageRegistry) -> Self {
        let mut graph = CodeGraph::new();

        // Phase 1: discover and parse source files, collect nodes.
        let mut file_langs: Vec<(PathBuf, LangId)> = Vec::new();
        for entry in walk_source_files(root, registry) {
            if let Some(lang_id) = registry.language_id_for_path(&entry) {
                graph.nodes.push(GraphNode {
                    file: entry.clone(),
                    module_name: None,
                });
                graph.index.insert(entry.clone(), graph.nodes.len() - 1);
                file_langs.push((entry, lang_id));
            }
        }

        // Phase 2: parse each file once and extract symbols + imports + calls.
        let mut cache = ParseCache::with_registry(LanguageRegistry::new());
        // symbols_by_file[file_idx] = (lang, symbols)
        let mut symbols_by_file: Vec<(LangId, Vec<String>)> = Vec::with_capacity(file_langs.len());
        // pending imports: (from_idx, lang, raw import strings)
        let mut pending_imports: Vec<(usize, LangId, Vec<ImportSpec>)> = Vec::new();
        // pending calls: (from_idx, callee names)
        let mut pending_calls: Vec<(usize, Vec<String>)> = Vec::new();

        for (idx, (file, lang_id)) in file_langs.iter().enumerate() {
            let src = match std::fs::read_to_string(file) {
                Ok(s) => s,
                Err(_) => {
                    symbols_by_file.push((*lang_id, Vec::new()));
                    continue;
                }
            };
            cache.parse(file, &src).unwrap_or_default();
            let tree = cache.tree(file).cloned();
            let (syms, imports, calls) = match tree {
                Some(t) => extract(file, &src, *lang_id, registry, &t),
                None => (Vec::new(), Vec::new(), Vec::new()),
            };
            symbols_by_file.push((*lang_id, syms));
            pending_imports.push((idx, *lang_id, imports));
            pending_calls.push((idx, calls));
        }

        // Phase 3: resolve imports to edges.
        for (from_idx, lang, imports) in pending_imports {
            let from_file = &graph.nodes[from_idx].file;
            for spec in imports {
                if let Some(to_idx) = resolve_import(from_file, &spec, lang, &graph) {
                    if to_idx != from_idx {
                        graph.edges.push(GraphEdge {
                            from: from_idx,
                            to: to_idx,
                            kind: EdgeKind::Import,
                        });
                    }
                }
            }
            // set module_name where extractable
            if let Some(name) = module_name_for(from_file, lang, cache.source(from_file)) {
                graph.nodes[from_idx].module_name = Some(name);
            }
        }

        // Phase 4: heuristic call edges — match callee names to symbols in *other* files.
        for (from_idx, callees) in pending_calls {
            for callee in callees {
                // Find the first *other* file that defines a symbol with this name.
                for (to_idx, (_, syms)) in symbols_by_file.iter().enumerate() {
                    if to_idx == from_idx {
                        continue;
                    }
                    if syms.iter().any(|s| s == &callee) {
                        graph.edges.push(GraphEdge {
                            from: from_idx,
                            to: to_idx,
                            kind: EdgeKind::Call { callee: callee.clone() },
                        });
                        break;
                    }
                }
            }
        }

        graph
    }

    /// Index of `file` in the node list, if present.
    pub fn node_index(&self, file: &Path) -> Option<usize> {
        self.index.get(file).copied()
    }

    /// Borrow the node list.
    pub fn nodes(&self) -> &[GraphNode] {
        &self.nodes
    }

    /// Borrow the edge list.
    pub fn edges(&self) -> &[GraphEdge] {
        &self.edges
    }

    /// Number of nodes.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Emit a Graphviz DOT representation (for debugging).
    pub fn to_dot(&self) -> String {
        let mut out = String::from("digraph code {\n  rankdir=LR;\n");
        for (i, n) in self.nodes.iter().enumerate() {
            let label = n
                .file
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("node{i}"));
            out.push_str(&format!("  n{i} [label=\"{label}\"];\n"));
        }
        for e in &self.edges {
            let style = match &e.kind {
                EdgeKind::Import => "solid",
                EdgeKind::Call { .. } => "dashed",
            };
            let label = match &e.kind {
                EdgeKind::Import => String::new(),
                EdgeKind::Call { callee } => format!(" [label=\"{callee}\" fontsize=8]"),
            };
            out.push_str(&format!(
                "  n{} -> n{} [style={style}{}];\n",
                e.from, e.to, label
            ));
        }
        out.push_str("}\n");
        out
    }

    /// Add an edge directly (used by tests / incremental rebuilds).
    pub fn add_edge(&mut self, from: usize, to: usize, kind: EdgeKind) {
        self.edges.push(GraphEdge { from, to, kind });
    }

    /// Add a node directly (used by tests / incremental rebuilds). Returns its index.
    pub fn add_node(&mut self, file: PathBuf, module_name: Option<String>) -> usize {
        let idx = self.nodes.len();
        self.index.insert(file.clone(), idx);
        self.nodes.push(GraphNode { file, module_name });
        idx
    }
}

/// A raw import as extracted from source, before path resolution.
#[derive(Debug, Clone)]
struct ImportSpec {
    /// The textual path/module string as written in the source (e.g.
    /// `crate::foo::bar`, `./foo`, `os`, `example.com/foo/bar`).
    raw: String,
    /// Whether `raw` is a relative path (starts with `./` or `../`).
    relative: bool,
}

/// Walk `root` with the `ignore` crate, yielding source file paths recognised
/// by `registry`.
fn walk_source_files(root: &Path, registry: &LanguageRegistry) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut builder = ignore::WalkBuilder::new(root);
    builder.standard_filters(true); // respect .gitignore/.ignore
    builder.hidden(false);
    builder.follow_links(false);
    builder.require_git(false);
    builder.sort_by_file_path(|a, b| a.cmp(b));

    let walker = builder.build();
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        // Belt-and-suspenders: skip common heavy dirs even if .gitignore misses them.
        if is_skipped_path(path) {
            continue;
        }
        if registry.language_id_for_path(path).is_some() {
            out.push(path.to_path_buf());
        }
    }
    out
}

/// Hard-coded skip list for build/vendor directories.
fn is_skipped_path(path: &Path) -> bool {
    for comp in path.components() {
        let name = comp.as_os_str().to_string_lossy();
        if matches!(
            name.as_ref(),
            "node_modules" | "target" | ".git" | "dist" | "build"
        ) {
            return true;
        }
    }
    false
}

/// Per-language extraction: returns `(symbol_names, imports, callee_names)`.
fn extract(
    file: &Path,
    source: &str,
    lang: LangId,
    registry: &LanguageRegistry,
    tree: &Tree,
) -> (Vec<String>, Vec<ImportSpec>, Vec<String>) {
    let language = match registry.language_for_path(file) {
        Some(l) => l,
        None => return (Vec::new(), Vec::new(), Vec::new()),
    };
    let syms = symbols_with(source, language, lang);
    let sym_names: Vec<String> = syms
        .iter()
        .filter(|s| matches!(s.kind, SymbolKind::Function | SymbolKind::Method))
        .map(|s| s.name.clone())
        .collect();

    let mut imports = Vec::new();
    let mut calls = Vec::new();
    let mut cursor = tree.root_node().walk();
    walk_extract(&mut cursor, source, lang, &mut imports, &mut calls);

    (sym_names, imports, calls)
}

/// Walk the tree collecting imports and call sites.
fn walk_extract(
    cursor: &mut TreeCursor,
    source: &str,
    lang: LangId,
    imports: &mut Vec<ImportSpec>,
    calls: &mut Vec<String>,
) {
    let node = cursor.node();
    if let Some(spec) = extract_import(node, source, lang) {
        imports.push(spec);
    }
    if let Some(callee) = extract_call_callee(node, source, lang) {
        calls.push(callee);
    }
    if cursor.goto_first_child() {
        loop {
            walk_extract(cursor, source, lang, imports, calls);
            if !cursor.goto_next_sibling() {
                break;
            }
        }
        cursor.goto_parent();
    }
}

/// Extract an [`ImportSpec`] from an import-like node, if any.
fn extract_import(node: Node, source: &str, lang: LangId) -> Option<ImportSpec> {
    match lang {
        LangId::Rust => {
            // use_declaration: `use <path>;` — collect the path text.
            if node.kind() == "use_declaration" {
                let path_node = node.named_child(0)?;
                let raw = text_of(path_node, source);
                return Some(spec_from_rust(&raw));
            }
            // mod_item: `mod foo;` — the module name resolves to a sibling file.
            if node.kind() == "mod_item" {
                let name = node.child_by_field_name("name")?;
                let raw = text_of(name, source);
                // Treat as a sibling module: relative to current file's dir.
                return Some(ImportSpec {
                    raw,
                    relative: true,
                });
            }
            None
        }
        LangId::Python => {
            // import_statement: `import a.b.c` -> path = a.b.c
            if node.kind() == "import_statement" {
                let raw = text_of(node.named_child(0)?, source);
                return Some(ImportSpec {
                    raw: raw.replace('.', "/"),
                    relative: false,
                });
            }
            // import_from_statement: `from X import Y` -> path = X
            if node.kind() == "import_from_statement" {
                // module_name child (the first named child before `import`)
                let mod_node = node.named_child(0)?;
                let raw = text_of(mod_node, source);
                if raw.starts_with('.') {
                    // relative python import: `.foo`, `..bar`
                    let stripped = raw.trim_start_matches('.').to_string();
                    return Some(ImportSpec {
                        raw: stripped.replace('.', "/"),
                        relative: true,
                    });
                }
                return Some(ImportSpec {
                    raw: raw.replace('.', "/"),
                    relative: false,
                });
            }
            None
        }
        LangId::Javascript | LangId::Typescript | LangId::Tsx => {
            // import_statement: `import ... from '<path>';`
            if node.kind() == "import_statement" {
                // the string child is the source path
                for i in 0..node.named_child_count() {
                    let c = node.named_child(i)?;
                    if c.kind() == "string" {
                        let raw = string_content(c, source);
                        return Some(spec_from_js(&raw));
                    }
                }
                return None;
            }
            // require('path') — a call_expression whose function is `require`.
            if node.kind() == "call_expression" {
                let func = node.named_child(0)?;
                if text_of(func, source) == "require" {
                    if let Some(arg) = node.named_child(1) {
                        if arg.kind() == "arguments" {
                            if let Some(str_node) = arg.named_child(0) {
                                let raw = string_content(str_node, source);
                                return Some(spec_from_js(&raw));
                            }
                        }
                    }
                }
                return None;
            }
            None
        }
        LangId::Go => {
            // import_declaration -> import_spec* (each is a string literal)
            if node.kind() == "import_declaration" {
                // collect all import_spec children
                let mut specs = Vec::new();
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "import_spec" {
                        if let Some(str_node) = child.named_child(0) {
                            let raw = string_content(str_node, source);
                            specs.push(ImportSpec {
                                raw,
                                relative: false,
                            });
                        }
                    }
                }
                // Return only the first; the caller's `walk_extract` visits each
                // import_spec as a named child too, but import_spec is anonymous-ish
                // so we collect them here and emit via a single-return hack:
                // Actually return the first and stash the rest in a thread-local?
                // Simpler: return the first; the walk will descend into children
                // and re-encounter import_spec nodes, which we handle below.
                if specs.is_empty() {
                    return None;
                }
                return specs.into_iter().next();
            }
            if node.kind() == "import_spec" {
                let str_node = node.named_child(0)?;
                let raw = string_content(str_node, source);
                return Some(ImportSpec {
                    raw,
                    relative: false,
                });
            }
            None
        }
    }
}

/// Extract the callee identifier from a call site node, if any.
fn extract_call_callee(node: Node, source: &str, lang: LangId) -> Option<String> {
    let is_call = match lang {
        LangId::Rust | LangId::Javascript | LangId::Typescript | LangId::Tsx | LangId::Go => {
            node.kind() == "call_expression"
        }
        LangId::Python => node.kind() == "call",
    };
    if !is_call {
        return None;
    }
    let func = node.named_child(0)?;
    let name = text_of(func, source);
    // Only simple identifiers count (skip method chains / qualified paths).
    if name.chars().all(|c| c.is_alphanumeric() || c == '_') && !name.is_empty() {
        Some(name)
    } else {
        None
    }
}

/// Resolve an [`ImportSpec`] to a node index in `graph`, per-language.
///
/// Best-effort: unresolved imports return `None` (no edge emitted).
fn resolve_import(
    from_file: &Path,
    spec: &ImportSpec,
    lang: LangId,
    graph: &CodeGraph,
) -> Option<usize> {
    let dir = from_file.parent().unwrap_or_else(|| Path::new("."));
    match lang {
        LangId::Rust => {
            // `use crate::foo::bar` -> foo/bar; `use std::...` -> skip (external).
            // `mod baz;` -> baz.rs or baz/mod.rs in the same dir.
            let cleaned = spec.raw.trim_start_matches("crate::").replace("::", "/");
            if cleaned.starts_with("std") || cleaned.starts_with("core") || cleaned.starts_with("alloc") {
                return None; // stdlib
            }
            // Try <dir>/<cleaned>.rs, <dir>/<cleaned>/mod.rs, <dir>/<last>.rs
            let candidates = rust_candidates(dir, &cleaned);
            find_first_node(&candidates, graph)
        }
        LangId::Python => {
            // <name>.py in same dir or <name>/__init__.py
            let mut candidates = Vec::new();
            if spec.relative {
                candidates.push(dir.join(format!("{}.py", spec.raw)));
                candidates.push(dir.join(spec.raw.as_str()).join("__init__.py"));
            } else {
                // absolute python import: best-effort search from root is not feasible
                // without knowing the package root; try same dir as a fallback.
                candidates.push(dir.join(format!("{}.py", spec.raw)));
                candidates.push(dir.join(spec.raw.as_str()).join("__init__.py"));
            }
            find_first_node(&candidates, graph)
        }
        LangId::Javascript | LangId::Typescript | LangId::Tsx => {
            // relative import -> resolve against dir with extensions.
            if spec.relative {
                let base = dir.join(&spec.raw);
                let candidates = js_ts_candidates(&base, lang);
                find_first_node(&candidates, graph)
            } else {
                // bare import: try node_modules/<name> index, else basename match.
                // Best-effort: find any node whose file stem == spec.raw basename.
                let stem = Path::new(&spec.raw)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| spec.raw.clone());
                for (i, n) in graph.nodes.iter().enumerate() {
                    if n.file.file_stem().map(|s| s.to_string_lossy()) == Some(stem.as_str().into()) {
                        return Some(i);
                    }
                }
                None
            }
        }
        LangId::Go => {
            // import "example.com/foo/bar" -> the package lives in a directory
            // whose name is the last import path segment. Resolve to any .go
            // file under a directory named after that last segment.
            let last = spec.raw.rsplit('/').next().unwrap_or(&spec.raw);
            let mut best: Option<usize> = None;
            for (i, n) in graph.nodes.iter().enumerate() {
                // The file's parent directory should be named `last`.
                if n
                    .file
                    .parent()
                    .and_then(|d| d.file_name())
                    .map(|s| s == last)
                    .unwrap_or(false)
                {
                    best = Some(i);
                    break;
                }
            }
            // Fallback: any file whose stem matches `last`.
            if best.is_none() {
                for (i, n) in graph.nodes.iter().enumerate() {
                    if n
                        .file
                        .file_stem()
                        .map(|s| s.to_string_lossy() == last)
                        .unwrap_or(false)
                    {
                        best = Some(i);
                        break;
                    }
                }
            }
            best
        }
    }
}

/// Candidate paths for a Rust `use` of `cleaned` (a `/`-joined path).
fn rust_candidates(dir: &Path, cleaned: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    out.push(dir.join(format!("{}.rs", cleaned)));
    out.push(dir.join(cleaned).join("mod.rs"));
    // last segment as a file in dir
    if let Some(last) = cleaned.rsplit('/').next() {
        out.push(dir.join(format!("{}.rs", last)));
    }
    out
}

/// Candidate paths for a JS/TS relative import `base` (without extension).
fn js_ts_candidates(base: &Path, lang: LangId) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let exts: &[&str] = match lang {
        LangId::Tsx => &["tsx", "ts", "js", "jsx"],
        LangId::Typescript => &["ts", "tsx", "js", "jsx"],
        LangId::Javascript => &["js", "jsx", "ts", "tsx"],
        _ => &["js", "ts", "tsx", "jsx"],
    };
    for ext in exts {
        out.push(base.with_extension(ext));
    }
    // index files
    for ext in exts {
        out.push(base.join(format!("index.{ext}")));
    }
    out
}

/// Find the first candidate path that exists as a graph node.
fn find_first_node(candidates: &[PathBuf], graph: &CodeGraph) -> Option<usize> {
    for c in candidates {
        if let Some(idx) = graph.node_index(c) {
            return Some(idx);
        }
    }
    None
}

/// Module name for a file, when extractable (Rust `mod foo;`, Go `package x`).
fn module_name_for(_file: &Path, lang: LangId, source: Option<&str>) -> Option<String> {
    let src = source?;
    match lang {
        LangId::Rust => {
            // First top-level `mod foo;` declaration name.
            for line in src.lines() {
                let t = line.trim_start();
                if let Some(rest) = t.strip_prefix("mod ") {
                    let name = rest.split(|c: char| !c.is_alphanumeric() && c != '_').next()?;
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
            }
            None
        }
        LangId::Go => {
            for line in src.lines() {
                let t = line.trim_start();
                if let Some(rest) = t.strip_prefix("package ") {
                    let name = rest.split_whitespace().next()?;
                    return Some(name.to_string());
                }
            }
            None
        }
        _ => None,
    }
}

/// Text of a node.
fn text_of(node: Node, source: &str) -> String {
    node.utf8_text(source.as_bytes()).unwrap_or("").to_string()
}

/// Content of a string-literal node (strips quotes).
fn string_content(node: Node, source: &str) -> String {
    let raw = text_of(node, source);
    let raw = raw.trim();
    if (raw.starts_with('"') && raw.ends_with('"') && raw.len() >= 2)
        || (raw.starts_with('\'') && raw.ends_with('\'') && raw.len() >= 2)
    {
        raw[1..raw.len() - 1].to_string()
    } else {
        raw.to_string()
    }
}

/// Build an [`ImportSpec`] from a raw Rust `use` path.
fn spec_from_rust(raw: &str) -> ImportSpec {
    let cleaned = raw.trim_start_matches("crate::").replace("::", "/");
    ImportSpec {
        raw: cleaned,
        relative: false,
    }
}

/// Build an [`ImportSpec`] from a raw JS/TS import path.
fn spec_from_js(raw: &str) -> ImportSpec {
    let relative = raw.starts_with("./") || raw.starts_with("../");
    ImportSpec {
        raw: raw.to_string(),
        relative,
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write(dir: &Path, name: &str, contents: &str) -> PathBuf {
        let p = dir.join(name);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&p, contents).unwrap();
        p
    }

    fn import_edges_between(graph: &CodeGraph, from: usize) -> Vec<usize> {
        graph
            .edges()
            .iter()
            .filter(|e| e.from == from && e.kind == EdgeKind::Import)
            .map(|e| e.to)
            .collect()
    }

    fn call_edges_between(graph: &CodeGraph, from: usize) -> Vec<(usize, String)> {
        graph
            .edges()
            .iter()
            .filter_map(|e| match e {
                GraphEdge {
                    from: f,
                    to,
                    kind: EdgeKind::Call { callee },
                } if *f == from => Some((*to, callee.clone())),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn build_rust_import_chain() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(root, "a.rs", "mod b;\nfn run() { foo(); }\n");
        write(root, "b.rs", "mod c;\npub fn foo() {}\n");
        write(root, "c.rs", "pub fn bar() {}\n");

        let g = CodeGraph::build(root);
        assert_eq!(g.node_count(), 3, "should have 3 nodes");

        let a = g.node_index(&root.join("a.rs")).unwrap();
        let b = g.node_index(&root.join("b.rs")).unwrap();
        let c = g.node_index(&root.join("c.rs")).unwrap();

        // a imports b (mod b; -> b.rs), b imports c (mod c; -> c.rs).
        let a_imports = import_edges_between(&g, a);
        assert_eq!(a_imports, vec![b], "a should import b: {a_imports:?}");

        let b_imports = import_edges_between(&g, b);
        assert_eq!(b_imports, vec![c], "b should import c: {b_imports:?}");

        // c has no imports.
        let c_imports = import_edges_between(&g, c);
        assert!(c_imports.is_empty(), "c should not import anything");
    }

    #[test]
    fn heuristic_call_edge_links_a_to_b() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // a.rs calls foo(), which is defined in b.rs -> a Call edge a->b.
        write(root, "a.rs", "mod b;\nfn run() { foo(); }\n");
        write(root, "b.rs", "pub fn foo() {}\n");
        write(root, "c.rs", "pub fn unrelated() {}\n");

        let g = CodeGraph::build(root);
        let a = g.node_index(&root.join("a.rs")).unwrap();
        let b = g.node_index(&root.join("b.rs")).unwrap();

        let calls = call_edges_between(&g, a);
        assert!(
            calls.iter().any(|(to, name)| *to == b && name == "foo"),
            "expected a call edge a->b (foo), got {calls:?}"
        );
    }

    #[test]
    fn ignores_build_and_vendor_dirs() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(root, "src/a.rs", "fn main() {}\n");
        // target/ is skipped.
        write(root, "target/b.rs", "fn ignored() {}\n");
        // node_modules/ is skipped.
        write(root, "node_modules/c.js", "function ignored() {}\n");

        let g = CodeGraph::build(root);
        let names: Vec<_> = g
            .nodes()
            .iter()
            .filter_map(|n| n.file.file_name().map(|f| f.to_string_lossy().to_string()))
            .collect();
        assert!(names.contains(&"a.rs".to_string()), "src/a.rs present");
        assert!(!names.contains(&"b.rs".to_string()), "target/ skipped");
        assert!(!names.contains(&"c.js".to_string()), "node_modules skipped");
    }

    #[test]
    fn python_import_chain() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(root, "a.py", "import b\nb.do()\n");
        write(root, "b.py", "import c\ndef do():\n    pass\n");
        write(root, "c.py", "def helper():\n    pass\n");

        let g = CodeGraph::build(root);
        let a = g.node_index(&root.join("a.py")).unwrap();
        let b = g.node_index(&root.join("b.py")).unwrap();
        let c = g.node_index(&root.join("c.py")).unwrap();

        assert_eq!(import_edges_between(&g, a), vec![b]);
        assert_eq!(import_edges_between(&g, b), vec![c]);
    }

    #[test]
    fn js_import_chain() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(root, "a.js", "import { foo } from './b';\nfoo();\n");
        write(root, "b.js", "import { bar } from './c';\nexport function foo() {}\n");
        write(root, "c.js", "export function bar() {}\n");

        let g = CodeGraph::build(root);
        let a = g.node_index(&root.join("a.js")).unwrap();
        let b = g.node_index(&root.join("b.js")).unwrap();
        let c = g.node_index(&root.join("c.js")).unwrap();

        assert_eq!(import_edges_between(&g, a), vec![b]);
        assert_eq!(import_edges_between(&g, b), vec![c]);
    }

    #[test]
    fn go_import_chain() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // Go imports are by full path; we resolve by matching the last segment.
        write(root, "main.go", "package main\n\nimport (\n\t\"example.com/m/b\"\n)\n\nfunc main() { b.Foo() }\n");
        write(root, "b/b.go", "package b\n\nfunc Foo() {}\n");
        write(root, "c/c.go", "package c\n\nfunc Bar() {}\n");

        let g = CodeGraph::build(root);
        let main = g.node_index(&root.join("main.go")).unwrap();
        let bgo = g.node_index(&root.join("b/b.go")).unwrap();

        let main_imports = import_edges_between(&g, main);
        assert!(
            main_imports.contains(&bgo),
            "main.go should import b/b.go: {main_imports:?}"
        );
    }

    #[test]
    fn to_dot_emits_nodes_and_edges() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(root, "a.rs", "mod b;\nfn run() { foo(); }\n");
        write(root, "b.rs", "pub fn foo() {}\n");

        let g = CodeGraph::build(root);
        let dot = g.to_dot();
        assert!(dot.starts_with("digraph code {"));
        assert!(dot.contains("n0 -> n1"));
    }
}