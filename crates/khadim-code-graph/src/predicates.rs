//! Checkable predicates over parsed source: validity, symbol extraction,
//! function existence, signature matching.
//!
//! There are two flavours of each predicate:
//! - methods on [`crate::ParseCache`] (e.g. [`ParseCache::symbols`]) that read
//!   the cached tree/source, and
//! - free functions taking `(source, language)` (e.g. [`symbols`]) for
//!   testability without a cache.

use std::path::Path;

use tree_sitter::{Language, Node, Parser, Tree, TreeCursor};

use crate::parser::{tree_has_errors, LangId, ParseCache};
use crate::span::{node_span_of, NodeSpan};

/// Broad category of an extracted symbol.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SymbolKind {
    Function,
    Method,
    Class,
    Struct,
    Enum,
    Trait,
    Module,
    Impl,
}

/// An extracted symbol: name, kind, source-text signature, and span.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub signature: String,
    pub span: NodeSpan,
}

/// Return true if `source` parses with no `ERROR` or `MISSING` nodes under
/// `language`.
pub fn parse_valid_with(source: &str, language: Language) -> bool {
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return false;
    }
    match parser.parse(source.as_bytes(), None) {
        Some(tree) => !tree_has_errors(&tree),
        None => false,
    }
}

/// Return true if the cached parse of `path` has no errors.
///
/// If `path` is not cached, parses `source` (when provided) into the cache
/// first. Returns `false` if the language is unsupported or parsing fails.
pub fn parse_valid(cache: &mut ParseCache, path: &Path, source: Option<&str>) -> bool {
    if cache.tree(path).is_none() {
        if let Some(src) = source {
            cache.parse(path, src);
        } else {
            return false;
        }
    }
    match cache.tree(path) {
        Some(tree) => !tree_has_errors(tree),
        None => false,
    }
}

/// Extract symbols from `source` under `language`/`lang`.
///
/// Walks the tree once and emits a [`Symbol`] for each named function, method,
/// impl block, class, module, struct, enum, and trait (per language).
pub fn symbols_with(source: &str, language: Language, lang: LangId) -> Vec<Symbol> {
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return Vec::new();
    }
    let tree = match parser.parse(source.as_bytes(), None) {
        Some(t) => t,
        None => return Vec::new(),
    };
    extract_symbols(&tree, source, lang)
}

/// Extract symbols from the cached parse of `path`.
pub fn symbols(cache: &ParseCache, path: &Path) -> Vec<Symbol> {
    let Some((tree, source)) = cache.tree_and_source(path) else {
        return Vec::new();
    };
    let Some(lang) = cache.language_id_for_path(path) else {
        return Vec::new();
    };
    extract_symbols(tree, source, lang)
}

impl ParseCache {
    /// Cached-path symbol extraction (see [`symbols`]).
    pub fn symbols(&self, path: &Path) -> Vec<Symbol> {
        symbols(self, path)
    }

    /// Cached-path validity check (see [`parse_valid`]).
    pub fn parse_valid(&mut self, path: &Path, source: Option<&str>) -> bool {
        parse_valid(self, path, source)
    }

    /// Cached-path function existence (see [`function_exists`]).
    pub fn function_exists(&self, path: &Path, name: &str) -> bool {
        function_exists(self, path, name)
    }

    /// Cached-path signature check (see [`has_signature`]).
    pub fn has_signature(&self, path: &Path, name: &str, sig_substring: &str) -> bool {
        has_signature(self, path, name, sig_substring)
    }
}

/// Return true if a function/method named `name` exists in the cached parse.
pub fn function_exists(cache: &ParseCache, path: &Path, name: &str) -> bool {
    cache
        .symbols(path)
        .iter()
        .any(|s| (s.kind == SymbolKind::Function || s.kind == SymbolKind::Method) && s.name == name)
}

/// Return true if a function/method named `name` has a signature containing
/// `sig_substring` (case-sensitive, byte-substring).
pub fn has_signature(cache: &ParseCache, path: &Path, name: &str, sig_substring: &str) -> bool {
    cache.symbols(path).iter().any(|s| {
        (s.kind == SymbolKind::Function || s.kind == SymbolKind::Method)
            && s.name == name
            && s.signature.contains(sig_substring)
    })
}

/// Walk `tree` and extract symbols for the active language.
fn extract_symbols(tree: &Tree, source: &str, lang: LangId) -> Vec<Symbol> {
    let mut out = Vec::new();
    let root = tree.root_node();
    let mut cursor = root.walk();
    walk_collect(&mut cursor, source, lang, &mut out);
    out
}

fn walk_collect<'tree>(
    cursor: &mut TreeCursor<'tree>,
    source: &str,
    lang: LangId,
    out: &mut Vec<Symbol>,
) {
    let node = cursor.node();
    if let Some(sym) = classify(node, source, lang) {
        out.push(sym);
    }
    if cursor.goto_first_child() {
        loop {
            walk_collect(cursor, source, lang, out);
            if !cursor.goto_next_sibling() {
                break;
            }
        }
        cursor.goto_parent();
    }
}

/// Classify a node into a [`Symbol`] if it is a container of interest.
fn classify(node: Node, source: &str, lang: LangId) -> Option<Symbol> {
    if !node.is_named() {
        return None;
    }
    let kind = node.kind();
    let (name, sym_kind) = match lang {
        LangId::Rust => match kind {
            "function_item" => (
                ident_text(node, source, "name")?,
                SymbolKind::Function,
            ),
            "struct_item" => (ident_text(node, source, "name")?, SymbolKind::Struct),
            "enum_item" => (ident_text(node, source, "name")?, SymbolKind::Enum),
            "trait_item" => (ident_text(node, source, "name")?, SymbolKind::Trait),
            "mod_item" => (ident_text(node, source, "name")?, SymbolKind::Module),
            "impl_item" => (impl_name_rust(node, source), SymbolKind::Impl),
            _ => return None,
        },
        LangId::Python => match kind {
            "function_definition" => (
                ident_text(node, source, "name")?,
                SymbolKind::Function,
            ),
            "class_definition" => (ident_text(node, source, "name")?, SymbolKind::Class),
            _ => return None,
        },
        LangId::Typescript | LangId::Tsx => match kind {
            "function_declaration" => (
                ident_text(node, source, "name")?,
                SymbolKind::Function,
            ),
            "method_definition" => (ident_text(node, source, "name")?, SymbolKind::Method),
            "class_declaration" => (ident_text(node, source, "name")?, SymbolKind::Class),
            _ => return None,
        },
        LangId::Javascript => match kind {
            "function_declaration" => (
                ident_text(node, source, "name")?,
                SymbolKind::Function,
            ),
            "method_definition" => (ident_text(node, source, "name")?, SymbolKind::Method),
            "class_declaration" => (ident_text(node, source, "name")?, SymbolKind::Class),
            _ => return None,
        },
        LangId::Go => match kind {
            "function_declaration" => (
                ident_text(node, source, "name")?,
                SymbolKind::Function,
            ),
            "method_declaration" => (
                method_name_go(node, source),
                SymbolKind::Method,
            ),
            "type_declaration" => (type_decl_name_go(node, source), SymbolKind::Struct),
            _ => return None,
        },
    };

    let signature = signature_text(node, source);
    let span = node_span_of(node);

    Some(Symbol {
        name,
        kind: sym_kind,
        signature,
        span,
    })
}

/// Get the text of the child field named `field` (an identifier).
fn ident_text(node: Node, source: &str, field: &str) -> Option<String> {
    let child = node.child_by_field_name(field)?;
    let text = child.utf8_text(source.as_bytes()).ok()?;
    Some(text.to_string())
}

/// Rust impl: `impl <Type>` or `impl <Trait> for <Type>` -> use the type name,
/// or `Type` if a trait is present.
fn impl_name_rust(node: Node, source: &str) -> String {
    // type field is the implemented type; trait field may be present.
    if let Some(t) = node.child_by_field_name("type") {
        if let Ok(text) = t.utf8_text(source.as_bytes()) {
            return text.to_string();
        }
    }
    "impl".to_string()
}

/// Go method_declaration: name is the `name` field (the method identifier).
fn method_name_go(node: Node, source: &str) -> String {
    ident_text(node, source, "name").unwrap_or_else(|| "method".to_string())
}

/// Go type_declaration: contains one or more type specs; take the first spec's
/// name.
fn type_decl_name_go(node: Node, source: &str) -> String {
    let mut cursor = node.walk();
    if node.children(&mut cursor).any(|c| c.kind() == "type_spec") {
        // re-walk to find first type_spec
        let mut cursor2 = node.walk();
        for c in node.children(&mut cursor2) {
            if c.kind() == "type_spec" {
                if let Some(name) = c.child_by_field_name("name") {
                    if let Ok(t) = name.utf8_text(source.as_bytes()) {
                        return t.to_string();
                    }
                }
            }
        }
    }
    "type".to_string()
}

/// Best-effort signature text: the node's text up to the start of its body, or
/// the full text for bodyless declarations.
fn signature_text(node: Node, source: &str) -> String {
    // For nodes with a `body` field, signature = text[start..body.start].
    if let Some(body) = node.child_by_field_name("body") {
    if let Some(text) = source.get(node.start_byte()..body.start_byte()) {
        return text.trim().to_string();
    }
    }
    // Fallback: first line of the node text.
    let text = node.utf8_text(source.as_bytes()).unwrap_or("");
    match text.split_once('\n') {
        Some((first, _)) => first.trim().to_string(),
        None => text.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::LanguageRegistry;
    use std::path::Path;

    fn parse_symbols(ext: &str, src: &str) -> Vec<Symbol> {
        let mut cache = ParseCache::new();
        let name = format!("t.{ext}");
        let p = Path::new(&name);
        cache.parse(p, src).unwrap();
        cache.symbols(p)
    }

    fn names(syms: &[Symbol]) -> Vec<String> {
        syms.iter().map(|s| s.name.clone()).collect()
    }

    #[test]
    fn rust_symbols() {
        let src = r#"
mod m {
    struct Point { x: i32 }
    enum E { A, B }
    trait T { fn f(&self); }
    fn foo() {}
    impl T for Point {
        fn f(&self) {}
    }
}
"#;
        let syms = parse_symbols("rs", src);
        let ns = names(&syms);
        assert!(ns.contains(&"m".to_string()), "module m: {ns:?}");
        assert!(ns.contains(&"Point".to_string()), "struct Point: {ns:?}");
        assert!(ns.contains(&"E".to_string()), "enum E: {ns:?}");
        assert!(ns.contains(&"T".to_string()), "trait T: {ns:?}");
        assert!(ns.contains(&"foo".to_string()), "fn foo: {ns:?}");
        assert!(ns.contains(&"Point".to_string()), "impl Point: {ns:?}");
        assert!(ns.contains(&"f".to_string()), "method f: {ns:?}");
        // verify byte ranges are within source
        for s in &syms {
            assert!(s.span.byte_range.end <= src.len());
        }
    }

    #[test]
    fn python_symbols() {
        let src = "def foo():\n    pass\n\nclass C:\n    def m(self):\n        pass\n";
        let syms = parse_symbols("py", src);
        let ns = names(&syms);
        assert!(ns.contains(&"foo".to_string()));
        assert!(ns.contains(&"C".to_string()));
        assert!(ns.contains(&"m".to_string()));
    }

    #[test]
    fn typescript_symbols() {
        let src = "function foo(): void {}\nclass C {\n  bar(): void {}\n}\n";
        let syms = parse_symbols("ts", src);
        let ns = names(&syms);
        assert!(ns.contains(&"foo".to_string()));
        assert!(ns.contains(&"C".to_string()));
        assert!(ns.contains(&"bar".to_string()));
    }

    #[test]
    fn javascript_symbols() {
        let src = "function foo() {}\nclass C {\n  bar() {}\n}\n";
        let syms = parse_symbols("js", src);
        let ns = names(&syms);
        assert!(ns.contains(&"foo".to_string()));
        assert!(ns.contains(&"C".to_string()));
        assert!(ns.contains(&"bar".to_string()));
    }

    #[test]
    fn go_symbols() {
        let src = "package main\n\nfunc foo() {}\nfunc (r R) bar() {}\ntype R struct{ x int }\n";
        let syms = parse_symbols("go", src);
        let ns = names(&syms);
        assert!(ns.contains(&"foo".to_string()));
        assert!(ns.contains(&"bar".to_string()));
        assert!(ns.contains(&"R".to_string()));
    }

    #[test]
    fn parse_valid_true_for_good_source() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.rs");
        assert!(cache.parse_valid(p, Some("fn foo() {}")));
    }

    #[test]
    fn parse_valid_false_for_broken_rust() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.rs");
        assert!(!cache.parse_valid(p, Some("fn foo( {")));
    }

    #[test]
    fn parse_valid_false_for_broken_python() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.py");
        assert!(!cache.parse_valid(p, Some("def foo(:\n    pass\n")));
    }

    #[test]
    fn parse_valid_false_for_broken_typescript() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.ts");
        assert!(!cache.parse_valid(p, Some("function foo( {}")));
    }

    #[test]
    fn parse_valid_false_for_broken_go() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.go");
        assert!(!cache.parse_valid(p, Some("func foo( {}")));
    }

    #[test]
    fn function_exists_and_signature() {
        let mut cache = ParseCache::new();
        let p = Path::new("t.rs");
        cache.parse(p, "fn foo(a: i32) -> i32 { a }\nfn bar() {}\n").unwrap();
        assert!(cache.function_exists(p, "foo"));
        assert!(!cache.function_exists(p, "baz"));
        assert!(cache.has_signature(p, "foo", "a: i32"));
        assert!(!cache.has_signature(p, "foo", "b: i32"));
    }

    #[test]
    fn free_function_parse_valid() {
        let reg = LanguageRegistry::new();
        let p = Path::new("t.rs");
        let lang = reg.language_for_path(p).unwrap();
        assert!(parse_valid_with("fn foo() {}", lang.clone()));
        assert!(!parse_valid_with("fn foo( {", lang));
    }

    #[test]
    fn free_function_symbols() {
        let reg = LanguageRegistry::new();
        let p = Path::new("t.py");
        let lang = reg.language_for_path(p).unwrap();
        let id = reg.language_id_for_path(p).unwrap();
        let syms = symbols_with("def foo():\n    pass\n", lang, id);
        assert!(names(&syms).contains(&"foo".to_string()));
    }
}