//! Syntax highlighting for fenced code blocks and tool outputs.
//!
//! Uses `syntect` with the default syntax set.  Languages are resolved by
//! file extension or by the info string on fenced code blocks.

use ratatui::style::{Color, Style};
use ratatui::text::Span;
use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::{Theme, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME_SET: OnceLock<ThemeSet> = OnceLock::new();

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_set() -> &'static ThemeSet {
    THEME_SET.get_or_init(ThemeSet::load_defaults)
}

fn theme() -> &'static Theme {
    &theme_set().themes["base16-ocean.dark"]
}

/// Highlight a single line of code into styled spans.
fn highlight_line(line: &str, highlighter: &mut HighlightLines) -> Vec<Span<'static>> {
    let highlighted = highlighter.highlight_line(line, syntax_set());
    match highlighted {
        Ok(regions) => regions
            .into_iter()
            .map(|(style, text)| Span::styled(text.to_string(), convert_style(style)))
            .collect(),
        Err(_) => vec![Span::raw(line.to_string())],
    }
}

/// Convert a syntect `HighlightStyle` to a ratatui `Style`.
fn convert_style(fg: syntect::highlighting::Style) -> Style {
    Style::default()
        .fg(Color::Rgb(fg.foreground.r, fg.foreground.g, fg.foreground.b))
        .bg(Color::Rgb(fg.background.r, fg.background.g, fg.background.b))
}

/// Highlight a code block given its language identifier and raw text.
///
/// Returns `None` when the language cannot be resolved or highlighting fails.
/// On success, returns a vector of `(line_number, spans)` pairs.
pub fn highlight_code_block(lang: &str, text: &str) -> Option<Vec<(usize, Vec<Span<'static>>)>> {
    let ss = syntax_set();
    let syntax = resolve_syntax(lang, ss)?;
    let theme = theme();
    let mut highlighter = HighlightLines::new(syntax, theme);

    let mut lines = Vec::new();
    for (i, line) in LinesWithEndings::from(text).enumerate() {
        // Strip trailing newline that syntect keeps so the line renders cleanly.
        let line = line.strip_suffix('\n').unwrap_or(line);
        let spans = highlight_line(line, &mut highlighter);
        lines.push((i + 1, spans));
    }
    Some(lines)
}

/// Try to resolve a language identifier to a syntect `SyntaxReference`.
fn resolve_syntax<'a>(lang: &str, ss: &'a SyntaxSet) -> Option<&'a syntect::parsing::SyntaxReference> {
    if lang.is_empty() {
        return None;
    }
    // Try by extension first (most common for info strings like "rust", "py", "js").
    if let Some(s) = ss.find_syntax_by_extension(lang) {
        return Some(s);
    }
    // Try by token (e.g. "rs" for Rust).
    if let Some(s) = ss.find_syntax_by_token(lang) {
        return Some(s);
    }
    // Try by name (e.g. "Python", "JavaScript").
    if let Some(s) = ss.find_syntax_by_name(lang) {
        return Some(s);
    }
    None
}

/// Common extension → language token mappings for better detection.
pub fn normalize_lang(lang: &str) -> &str {
    match lang {
        "rs" => "rust",
        "py" => "python",
        "js" => "javascript",
        "ts" => "typescript",
        "jsx" => "javascript",
        "tsx" => "typescript",
        "sh" | "bash" | "zsh" => "bash",
        "yml" => "yaml",
        "md" => "markdown",
        "json" => "json",
        "toml" => "toml",
        "cpp" | "cc" | "cxx" => "cpp",
        "h" | "hpp" => "cpp",
        "go" => "go",
        "rb" => "ruby",
        "ex" | "exs" => "elixir",
        other => other,
    }
}
