//! Native tree-sitter syntax highlighting.
//!
//! Parses source code using tree-sitter grammars at native speed and emits
//! pre-tokenized HTML with CSS class names. The frontend renders this with
//! `dangerouslySetInnerHTML` — zero JS tokenization overhead.
//!
//! This is the same fundamental approach Zed uses: tree-sitter parse →
//! highlight query → token spans with semantic class names.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tree_sitter_highlight::{Highlight, HighlightConfiguration, HighlightEvent, Highlighter};

// ── Highlight names (CSS class mapping) ──────────────────────────────
//
// These must match the capture names in the highlight queries. The index
// in this array maps to `Highlight(idx)` from tree-sitter-highlight.

const HIGHLIGHT_NAMES: &[&str] = &[
    "attribute",
    "boolean",
    "comment",
    "comment.documentation",
    "constant",
    "constant.builtin",
    "constructor",
    "embedded",
    "error",
    "escape",
    "function",
    "function.builtin",
    "keyword",
    "markup",
    "markup.bold",
    "markup.heading",
    "markup.italic",
    "markup.link",
    "markup.link.url",
    "markup.list",
    "markup.quote",
    "markup.raw",
    "markup.strikethrough",
    "module",
    "number",
    "operator",
    "property",
    "property.builtin",
    "punctuation",
    "punctuation.bracket",
    "punctuation.delimiter",
    "punctuation.special",
    "string",
    "string.escape",
    "string.regexp",
    "string.special",
    "tag",
    "type",
    "type.builtin",
    "variable",
    "variable.builtin",
    "variable.member",
    "variable.parameter",
];

// ── Language registry ────────────────────────────────────────────────

struct LangEntry {
    config: HighlightConfiguration,
}

static LANGUAGES: LazyLock<Mutex<HashMap<&'static str, LangEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn ensure_language(lang_id: &str) -> Option<&'static str> {
    let mut map = LANGUAGES.lock().unwrap();
    // Return the canonical key if already loaded
    let canonical = canonical_lang_id(lang_id)?;
    if map.contains_key(canonical) {
        return Some(canonical);
    }

    let config = build_config(canonical)?;
    map.insert(canonical, LangEntry { config });
    Some(canonical)
}

fn canonical_lang_id(lang_id: &str) -> Option<&'static str> {
    match lang_id {
        "rust" => Some("rust"),
        "javascript" | "jsx" => Some("javascript"),
        "typescript" | "tsx" => Some("typescript"),
        "json" | "jsonc" => Some("json"),
        "python" => Some("python"),
        "go" => Some("go"),
        "c" => Some("c"),
        "cpp" | "cxx" => Some("cpp"),
        "html" | "htm" => Some("html"),
        "css" | "scss" | "less" => Some("css"),
        "bash" | "sh" | "zsh" | "fish" => Some("bash"),
        "toml" => Some("toml"),
        "yaml" | "yml" => Some("yaml"),
        "markdown" | "md" | "mdx" => Some("markdown"),
        "zig" => Some("zig"),
        _ => None,
    }
}

fn build_config(lang_id: &'static str) -> Option<HighlightConfiguration> {
    let (language, highlights_query) = match lang_id {
        "rust" => (
            tree_sitter_rust::LANGUAGE.into(),
            include_str!("queries/rust.scm"),
        ),
        "javascript" => (
            tree_sitter_javascript::LANGUAGE.into(),
            include_str!("queries/javascript.scm"),
        ),
        "typescript" => (
            tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            include_str!("queries/typescript.scm"),
        ),
        "json" => (
            tree_sitter_json::LANGUAGE.into(),
            include_str!("queries/json.scm"),
        ),
        "go" => (
            tree_sitter_go::LANGUAGE.into(),
            include_str!("queries/go.scm"),
        ),
        "python" => (
            tree_sitter_python::LANGUAGE.into(),
            // Python grammar ships HIGHLIGHTS_QUERY
            tree_sitter_python::HIGHLIGHTS_QUERY,
        ),
        "c" => (
            tree_sitter_c::LANGUAGE.into(),
            tree_sitter_c::HIGHLIGHT_QUERY,
        ),
        "cpp" => (
            tree_sitter_cpp::LANGUAGE.into(),
            tree_sitter_cpp::HIGHLIGHT_QUERY,
        ),
        "html" => (
            tree_sitter_html::LANGUAGE.into(),
            include_str!("queries/html.scm"),
        ),
        "css" => (
            tree_sitter_css::LANGUAGE.into(),
            tree_sitter_css::HIGHLIGHTS_QUERY,
        ),
        "bash" => (
            tree_sitter_bash::LANGUAGE.into(),
            tree_sitter_bash::HIGHLIGHT_QUERY,
        ),
        "toml" => (
            tree_sitter_toml_ng::LANGUAGE.into(),
            tree_sitter_toml_ng::HIGHLIGHTS_QUERY,
        ),
        "yaml" => (
            tree_sitter_yaml::LANGUAGE.into(),
            tree_sitter_yaml::HIGHLIGHTS_QUERY,
        ),
        "markdown" => (
            tree_sitter_md::LANGUAGE.into(),
            // Markdown queries from gpui-component
            include_str!("queries/markdown.scm") as &str,
        ),
        "zig" => (
            tree_sitter_zig::LANGUAGE.into(),
            include_str!("queries/zig.scm"),
        ),
        _ => return None,
    };

    let mut config =
        HighlightConfiguration::new(language, lang_id, highlights_query, "", "").ok()?;
    config.configure(HIGHLIGHT_NAMES);
    Some(config)
}

// ── Public API ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct HighlightResult {
    /// Pre-tokenized HTML string with `<span class="ts-{name}">` wrappers.
    pub html: String,
    /// The language that was used (canonical form).
    pub language: String,
    /// Number of lines in the source.
    pub line_count: usize,
    /// Whether tree-sitter was able to parse the file (false = plain fallback).
    pub parsed: bool,
}

/// Map a file extension to the canonical tree-sitter language ID.
pub fn ext_to_lang(filename: &str) -> Option<&'static str> {
    let lower = filename.to_lowercase();
    if lower == "dockerfile" {
        return None;
    }
    if lower == "makefile" || lower == "gnumakefile" {
        return None;
    }

    let ext = filename.rsplit('.').next().map(|s| s.to_lowercase());
    let lang = match ext.as_deref() {
        Some("rs") => "rust",
        Some("js") | Some("mjs") | Some("cjs") => "javascript",
        Some("jsx") => "javascript",
        Some("ts") | Some("mts") | Some("cts") => "typescript",
        Some("tsx") => "typescript",
        Some("json") | Some("jsonc") => "json",
        Some("py") | Some("pyi") => "python",
        Some("go") => "go",
        Some("c") | Some("h") => "c",
        Some("cpp") | Some("cxx") | Some("cc") | Some("hpp") | Some("hxx") => "cpp",
        Some("html") | Some("htm") => "html",
        Some("css") => "css",
        Some("scss") | Some("less") => "css",
        Some("sh") | Some("bash") | Some("zsh") | Some("fish") => "bash",
        Some("toml") => "toml",
        Some("yaml") | Some("yml") => "yaml",
        Some("md") | Some("mdx") => "markdown",
        Some("zig") => "zig",
        _ => return None,
    };
    Some(lang)
}

/// Highlight source code and return pre-tokenized HTML.
///
/// Falls back to plain escaped HTML when no grammar is available.
pub fn highlight(source: &str, filename: &str) -> HighlightResult {
    let line_count = source.lines().count().max(1);
    let lang_id = ext_to_lang(filename);

    let canonical = lang_id.and_then(ensure_language);

    let Some(canonical) = canonical else {
        return HighlightResult {
            html: plain_html(source),
            language: lang_id.unwrap_or("text").to_string(),
            line_count,
            parsed: false,
        };
    };

    let map = LANGUAGES.lock().unwrap();
    let entry = match map.get(canonical) {
        Some(e) => e,
        None => {
            return HighlightResult {
                html: plain_html(source),
                language: canonical.to_string(),
                line_count,
                parsed: false,
            };
        }
    };

    let mut highlighter = Highlighter::new();

    let events = highlighter.highlight(&entry.config, source.as_bytes(), None, |_| None);
    let Ok(events) = events else {
        return HighlightResult {
            html: plain_html(source),
            language: canonical.to_string(),
            line_count,
            parsed: false,
        };
    };

    let mut html = String::with_capacity(source.len() * 2);
    let mut stack_depth: usize = 0;

    for event in events {
        match event {
            Ok(HighlightEvent::Source { start, end }) => {
                html_escape_into(&mut html, &source[start..end]);
            }
            Ok(HighlightEvent::HighlightStart(Highlight(idx))) => {
                let class = HIGHLIGHT_NAMES
                    .get(idx)
                    .map(|n| n.replace('.', "-"))
                    .unwrap_or_default();
                html.push_str("<span class=\"ts-");
                html.push_str(&class);
                html.push_str("\">");
                stack_depth += 1;
            }
            Ok(HighlightEvent::HighlightEnd) => {
                html.push_str("</span>");
                if stack_depth > 0 {
                    stack_depth -= 1;
                }
            }
            Err(_) => {
                // Parse error — just output the rest as plain text
                break;
            }
        }
    }

    // Close any unclosed spans
    for _ in 0..stack_depth {
        html.push_str("</span>");
    }

    HighlightResult {
        html,
        language: canonical.to_string(),
        line_count,
        parsed: true,
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn plain_html(source: &str) -> String {
    let mut html = String::with_capacity(source.len() + source.len() / 8);
    html_escape_into(&mut html, source);
    html
}

fn html_escape_into(buf: &mut String, text: &str) {
    for ch in text.chars() {
        match ch {
            '<' => buf.push_str("&lt;"),
            '>' => buf.push_str("&gt;"),
            '&' => buf.push_str("&amp;"),
            '"' => buf.push_str("&quot;"),
            _ => buf.push(ch),
        }
    }
}

/// List supported languages.
pub fn supported_languages() -> Vec<&'static str> {
    vec![
        "rust",
        "javascript",
        "typescript",
        "json",
        "python",
        "go",
        "c",
        "cpp",
        "html",
        "css",
        "bash",
        "toml",
        "yaml",
        "markdown",
        "zig",
    ]
}
