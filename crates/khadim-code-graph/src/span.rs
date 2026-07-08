//! Stable structural addressing for tree-sitter nodes.
//!
//! [`NodePath`] is a path of `(node_kind, child_index)` tuples from the root to
//! a node. It is *stable* across edits to *unrelated* parts of the file: if the
//! edit does not change the ancestry or sibling ordering of a node, the same
//! [`NodePath`] resolves to (a node with the same kind and content as) the
//! original. This is what makes AST-node-level lease claims meaningful.
//!
//! [`NodeSpan`] pairs a [`NodePath`] with the byte range the node occupies.
//! [`span_at`] returns the smallest enclosing *named* function/impl/class/module-
//! like node for a given byte range, per-language.

use std::ops::Range;

use tree_sitter::{Node, Tree};

use crate::parser::LangId;

/// A stable path from the tree root to a node: a list of
/// `(node_kind, child_index)` tuples.
///
/// `child_index` is the index among *all* children (named + anonymous) of the
/// parent, which is what tree-sitter's `Node::child(i)` indexes.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NodePath {
    pub steps: Vec<(String, usize)>,
}

impl NodePath {
    pub fn new(steps: Vec<(String, usize)>) -> Self {
        Self { steps }
    }

    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    pub fn len(&self) -> usize {
        self.steps.len()
    }
}

/// A [`NodePath`] plus the byte range the addressed node occupies.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NodeSpan {
    pub path: NodePath,
    pub byte_range: Range<usize>,
}

impl NodeSpan {
    pub fn new(path: NodePath, byte_range: Range<usize>) -> Self {
        Self { path, byte_range }
    }
}

/// Per-language kinds considered "container" nodes for [`span_at`]:
/// functions, methods, impls, classes, modules, structs, enums, traits, etc.
fn container_kinds_for(lang: LangId) -> &'static [&'static str] {
    match lang {
        LangId::Rust => &[
            "function_item",
            "impl_item",
            "mod_item",
            "struct_item",
            "enum_item",
            "trait_item",
        ],
        LangId::Python => &["function_definition", "class_definition"],
        LangId::Typescript | LangId::Tsx => &[
            "function_declaration",
            "method_definition",
            "class_declaration",
            "arrow_function",
            "lexical_declaration",
        ],
        LangId::Javascript => &[
            "function_declaration",
            "method_definition",
            "class_declaration",
            "arrow_function",
            "lexical_declaration",
        ],
        LangId::Go => &[
            "function_declaration",
            "method_declaration",
            "type_declaration",
        ],
    }
}

/// Returns true if `node` is a named container of interest for `lang`.
fn is_container(node: &Node, lang: LangId) -> bool {
    if !node.is_named() {
        return false;
    }
    let kind = node.kind();
    container_kinds_for(lang).contains(&kind)
}

/// Build a [`NodePath`] for `target` by walking up to the root.
fn path_of(mut target: Node) -> NodePath {
    let mut steps_rev: Vec<(String, usize)> = Vec::new();
    loop {
        if let Some(parent) = target.parent() {
            let idx = child_index_among(parent, target);
            steps_rev.push((target.kind().to_string(), idx));
            target = parent;
        } else {
            steps_rev.push((target.kind().to_string(), 0));
            break;
        }
    }
    steps_rev.reverse();
    NodePath::new(steps_rev)
}

/// Find a child's index among all children of a parent (match by node id).
fn child_index_among(parent: Node, child: Node) -> usize {
    let count = parent.child_count();
    for i in 0..count {
        if let Some(c) = parent.child(i) {
            if c.id() == child.id() {
                return i;
            }
        }
    }
    0
}

/// Build a [`NodeSpan`] directly from a node's ancestors (no `&Tree` needed).
pub(crate) fn node_span_of(node: Node) -> NodeSpan {
    NodeSpan {
        path: path_of(node),
        byte_range: node.start_byte()..node.end_byte(),
    }
}

/// Find the smallest enclosing named container node (function/impl/class/module)
/// that contains `byte_range`, and return its [`NodeSpan`].
///
/// `lang` identifies the grammar so per-language kind lists can be used.
/// Returns `None` if no container is found.
pub fn span_at(tree: &Tree, lang: LangId, _source: &str, byte_range: Range<usize>) -> Option<NodeSpan> {
    let root = tree.root_node();
    // Find the smallest named descendant that spans the range. If the range
    // covers the whole file, `descendant_for_byte_range` returns the root,
    // which is never a container; in that case fall back to the first named
    // child that covers the range.
    let start = root.descendant_for_byte_range(byte_range.start, byte_range.end);
    let mut node = start.unwrap_or(root);
    // If the descendant is the root itself (range spans the file), step into
    // its first named child that contains the range.
    if node.id() == root.id() {
        let mut cursor = root.walk();
        for child in root.named_children(&mut cursor) {
            if contains_range(&child, &byte_range) {
                node = child;
                break;
            }
        }
    }
    // Walk up from the smallest enclosing node; return the *smallest* (deepest)
    // named container that contains the range.
    loop {
        if is_container(&node, lang) && contains_range(&node, &byte_range) {
            return Some(node_span_of(node));
        }
        match node.parent() {
            Some(p) => node = p,
            None => return None,
        }
    }
}

fn contains_range(node: &Node, range: &Range<usize>) -> bool {
    node.start_byte() <= range.start && node.end_byte() >= range.end
}

/// Re-locate a node in `tree` from a [`NodePath`].
///
/// Walks from the root following each `(kind, child_index)` step. Returns the
/// node if every step matches, otherwise `None` (the path is stale).
pub fn resolve<'tree>(tree: &'tree Tree, path: &NodePath) -> Option<Node<'tree>> {
    let mut node = tree.root_node();
    for (i, (kind, idx)) in path.steps.iter().enumerate() {
        if i == 0 {
            if node.kind() != kind.as_str() {
                return None;
            }
            continue;
        }
        let child = node.child(*idx)?;
        if child.kind() != kind.as_str() {
            return None;
        }
        node = child;
    }
    Some(node)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::{LangId, ParseCache};
    use std::path::Path;

    fn cache_for(lang_ext: &str, src: &str) -> (ParseCache, std::path::PathBuf, LangId) {
        let mut cache = ParseCache::new();
        let name = format!("t.{lang_ext}");
        let p = Path::new(&name);
        cache.parse(p, src).unwrap();
        let id = cache.language_id_for_path(p).unwrap();
        (cache, p.to_path_buf(), id)
    }

    #[test]
    fn span_at_rust_function() {
        let src = "fn foo() {\n  let x = 1;\n}\nfn bar() {}\n";
        let (cache, p, id) = cache_for("rs", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let x_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, x_off..x_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "function_item");
        let text = node.utf8_text(source.as_bytes()).unwrap();
        assert!(text.contains("foo"));
    }

    #[test]
    fn span_at_python_function() {
        let src = "def foo():\n    x = 1\n    return x\n\nclass C:\n    pass\n";
        let (cache, p, id) = cache_for("py", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let one_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "function_definition");
    }

    #[test]
    fn span_at_python_class() {
        let src = "def foo():\n    pass\n\nclass C:\n    x = 1\n";
        let (cache, p, id) = cache_for("py", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let one_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "class_definition");
    }

    #[test]
    fn span_at_typescript_function() {
        let src = "function foo(): number {\n  return 1;\n}\nconst bar = () => 2;\n";
        let (cache, p, id) = cache_for("ts", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let one_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "function_declaration");
    }

    #[test]
    fn span_at_javascript_method() {
        let src = "class C {\n  foo() { return 1; }\n}\n";
        let (cache, p, id) = cache_for("js", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let one_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "method_definition");
    }

    #[test]
    fn span_at_go_function() {
        let src = "package main\n\nfunc foo() int {\n\treturn 1\n}\n";
        let (cache, p, id) = cache_for("go", src);
        let (tree, source) = cache.tree_and_source(&p).unwrap();
        let one_off = src.find("1").unwrap();
        let span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let node = resolve(tree, &span.path).unwrap();
        assert_eq!(node.kind(), "function_declaration");
    }

    #[test]
    fn node_path_stable_across_unrelated_edit() {
        let src = "fn foo() {\n  let x = 1;\n}\nfn bar() { 2 }\n";
        let mut cache = ParseCache::new();
        let p = Path::new("t.rs");
        cache.parse(p, src).unwrap();
        let id = cache.language_id_for_path(p).unwrap();
        let (tree, source) = cache.tree_and_source(p).unwrap();
        let one_off = src.find("1").unwrap();
        let foo_span = span_at(tree, id, source, one_off..one_off + 1).unwrap();
        let foo_path = foo_span.path.clone();
        let foo_text = resolve(tree, &foo_path)
            .unwrap()
            .utf8_text(source.as_bytes())
            .unwrap()
            .to_string();

        let new_src = "fn foo() {\n  let x = 1;\n}\nfn bar() { 99 }\n";
        cache.reparse(p, new_src).unwrap();
        let (new_tree, new_source) = cache.tree_and_source(p).unwrap();
        let resolved = resolve(new_tree, &foo_path);
        assert!(resolved.is_some(), "foo path should still resolve");
        let node = resolved.unwrap();
        assert_eq!(node.kind(), "function_item");
        let new_text = node.utf8_text(new_source.as_bytes()).unwrap();
        assert_eq!(new_text, foo_text, "foo node text unchanged by bar edit");
    }

    #[test]
    fn resolve_returns_none_for_stale_path() {
        let src = "fn foo() {}\n";
        let mut cache = ParseCache::new();
        let p = Path::new("t.rs");
        cache.parse(p, src).unwrap();
        let id = cache.language_id_for_path(p).unwrap();
        let (tree, source) = cache.tree_and_source(p).unwrap();
        // Use a range inside the function body.
        let off = src.find("foo").unwrap();
        let span = span_at(tree, id, source, off..off + 3).unwrap();
        let mut bad = span.path.clone();
        bad.steps.push(("nonexistent".to_string(), 99));
        assert!(resolve(tree, &bad).is_none());
    }
}