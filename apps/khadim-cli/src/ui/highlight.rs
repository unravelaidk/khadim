//! Syntax highlighting for fenced code blocks and tool outputs.
//!
//! Uses `syntect` with the default syntax set. Themes are picked to match
//! the active Khadim UI theme family (not a single fixed ocean palette).
//! Only foreground (+ bold/italic) is applied so the TUI theme owns the
//! code-block background surface.

use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;
use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::{FontStyle, Theme, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

use crate::themes::{ThemeFamily, ThemeVariant};
use crate::ui::theme::{md_code_fg, text_primary};

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME_SET: OnceLock<ThemeSet> = OnceLock::new();

/// Active UI theme (set when the TUI theme changes) so code colors track `/theme`.
static mut ACTIVE_FAMILY: ThemeFamily = ThemeFamily::Default;
static mut ACTIVE_VARIANT: ThemeVariant = ThemeVariant::Dark;

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_set() -> &'static ThemeSet {
    THEME_SET.get_or_init(ThemeSet::load_defaults)
}

/// Call from `set_current_theme` so highlighting tracks the UI palette.
pub fn set_highlight_theme(family: ThemeFamily, variant: ThemeVariant) {
    // SAFETY: single-threaded TUI main loop.
    unsafe {
        ACTIVE_FAMILY = family;
        ACTIVE_VARIANT = variant;
    }
}

fn active_family_variant() -> (ThemeFamily, ThemeVariant) {
    unsafe { (ACTIVE_FAMILY, ACTIVE_VARIANT) }
}

/// Map Khadim UI theme → syntect default theme name.
fn syntect_theme_name(family: ThemeFamily, variant: ThemeVariant) -> &'static str {
    let light = matches!(variant, ThemeVariant::Light | ThemeVariant::Latte);
    if light {
        return match family {
            ThemeFamily::Default => "Solarized (light)",
            _ => "base16-ocean.light",
        };
    }
    match family {
        ThemeFamily::Catppuccin | ThemeFamily::Dracula | ThemeFamily::OneDark => {
            "base16-mocha.dark"
        }
        ThemeFamily::Nord | ThemeFamily::TokyoNight => "base16-ocean.dark",
        ThemeFamily::Gruvbox => "base16-eighties.dark",
        ThemeFamily::Default => "base16-eighties.dark",
    }
}

fn theme() -> &'static Theme {
    let (family, variant) = active_family_variant();
    let name = syntect_theme_name(family, variant);
    let set = theme_set();
    set.themes
        .get(name)
        .or_else(|| set.themes.get("base16-ocean.dark"))
        .or_else(|| set.themes.values().next())
        .expect("syntect ships at least one default theme")
}

/// Convert a syntect style to ratatui — **foreground only**.
/// Backgrounds are left unset so the markdown/tool chrome owns the surface.
fn convert_style(fg: syntect::highlighting::Style) -> Style {
    let mut style = Style::default().fg(Color::Rgb(
        fg.foreground.r,
        fg.foreground.g,
        fg.foreground.b,
    ));
    if fg.font_style.contains(FontStyle::BOLD) {
        style = style.add_modifier(Modifier::BOLD);
    }
    if fg.font_style.contains(FontStyle::ITALIC) {
        style = style.add_modifier(Modifier::ITALIC);
    }
    if fg.font_style.contains(FontStyle::UNDERLINE) {
        style = style.add_modifier(Modifier::UNDERLINED);
    }
    style
}

fn highlight_line(line: &str, highlighter: &mut HighlightLines) -> Vec<Span<'static>> {
    match highlighter.highlight_line(line, syntax_set()) {
        Ok(regions) => {
            if regions.is_empty() {
                return vec![Span::styled(
                    line.to_string(),
                    Style::default().fg(md_code_fg()),
                )];
            }
            regions
                .into_iter()
                .map(|(style, text)| {
                    // Empty tokens still need width preservation (spaces).
                    if text.is_empty() {
                        Span::raw(String::new())
                    } else {
                        Span::styled(text.to_string(), convert_style(style))
                    }
                })
                .collect()
        }
        Err(_) => vec![Span::styled(
            line.to_string(),
            Style::default().fg(text_primary()),
        )],
    }
}

/// Highlight a code block given its language identifier and raw text.
///
/// Returns `None` when the language cannot be resolved. On success, returns
/// `(line_number, spans)` pairs (1-based line numbers).
pub fn highlight_code_block(lang: &str, text: &str) -> Option<Vec<(usize, Vec<Span<'static>>)>> {
    let ss = syntax_set();
    let normalized = normalize_lang(lang);
    let syntax = resolve_syntax(normalized, ss).or_else(|| detect_syntax_from_content(text, ss))?;
    let theme = theme();
    let mut highlighter = HighlightLines::new(syntax, theme);

    let mut lines = Vec::new();
    for (i, line) in LinesWithEndings::from(text).enumerate() {
        let line = line.strip_suffix('\n').unwrap_or(line);
        let line = line.strip_suffix('\r').unwrap_or(line);
        let spans = highlight_line(line, &mut highlighter);
        lines.push((i + 1, spans));
    }
    Some(lines)
}

/// Highlight when language is unknown — try content heuristics first.
pub fn highlight_code_block_auto(
    lang: &str,
    text: &str,
) -> Option<Vec<(usize, Vec<Span<'static>>)>> {
    if !lang.is_empty() {
        if let Some(lines) = highlight_code_block(lang, text) {
            return Some(lines);
        }
    }
    highlight_code_block("", text)
}

fn resolve_syntax<'a>(
    lang: &str,
    ss: &'a SyntaxSet,
) -> Option<&'a syntect::parsing::SyntaxReference> {
    if lang.is_empty() {
        return None;
    }
    let lower = lang.to_ascii_lowercase();
    ss.find_syntax_by_extension(&lower)
        .or_else(|| ss.find_syntax_by_token(&lower))
        .or_else(|| ss.find_syntax_by_name(&lower))
        // Title-case fallback (e.g. "Rust", "Python")
        .or_else(|| {
            let titled: String = lower
                .split(|c: char| c == '-' || c == '_' || c == ' ')
                .map(|part| {
                    let mut c = part.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            ss.find_syntax_by_name(&titled)
        })
}

/// Content-based language guess when the fence has no info string.
fn detect_syntax_from_content<'a>(
    text: &str,
    ss: &'a SyntaxSet,
) -> Option<&'a syntect::parsing::SyntaxReference> {
    let sample: String = text.lines().take(40).collect::<Vec<_>>().join("\n");
    let s = sample.as_str();

    let guess =
        if s.contains("fn ") && (s.contains("pub ") || s.contains("let ") || s.contains("impl ")) {
            "rust"
        } else if s.contains("def ")
            && (s.contains("import ") || s.contains("self") || s.contains("print("))
        {
            "python"
        } else if s.contains("function ")
            || s.contains("const ")
            || s.contains("=>")
            || s.contains("console.")
        {
            if s.contains(": ")
                && (s.contains("interface ") || s.contains("type ") || s.contains(": string"))
            {
                "typescript"
            } else {
                "javascript"
            }
        } else if s.contains("package ") && s.contains("func ") {
            "go"
        } else if s.trim_start().starts_with('{') || s.trim_start().starts_with('[') {
            "json"
        } else if s.contains("#!/bin/bash") || s.contains("#!/usr/bin/env bash") {
            "bash"
        } else if s.contains("---") && (s.contains("name:") || s.contains("on:")) {
            "yaml"
        } else if s.contains("[package]") || s.contains("[dependencies]") {
            "toml"
        } else {
            return None;
        };
    resolve_syntax(guess, ss)
}

/// Common extension / alias → language token for syntect.
pub fn normalize_lang(lang: &str) -> &str {
    let lang = lang.trim().trim_matches(['`', '"', '\'']);
    // Fence info can be "rust,ignore" or "ts title=foo"
    let lang = lang
        .split([',', ' ', '\t', '{'])
        .next()
        .unwrap_or(lang)
        .trim();
    match lang {
        "rs" | "rust" => "rust",
        "py" | "python" | "py3" => "python",
        "js" | "javascript" | "mjs" | "cjs" => "javascript",
        "ts" | "typescript" | "mts" | "cts" => "typescript",
        "jsx" => "javascript",
        "tsx" => "typescript",
        "sh" | "bash" | "zsh" | "shell" | "shellscript" => "bash",
        "yml" | "yaml" => "yaml",
        "md" | "markdown" | "mdx" => "markdown",
        "json" | "jsonc" => "json",
        "toml" => "toml",
        "cpp" | "cc" | "cxx" | "c++" | "hpp" | "hh" => "cpp",
        "h" | "c" => "c",
        "go" | "golang" => "go",
        "rb" | "ruby" => "ruby",
        "ex" | "exs" | "elixir" => "elixir",
        "kt" | "kotlin" => "kotlin",
        "swift" => "swift",
        "java" => "java",
        "cs" | "csharp" | "c#" => "csharp",
        "fs" | "fsharp" | "f#" => "fsharp",
        "hs" | "haskell" => "haskell",
        "lua" => "lua",
        "r" => "r",
        "sql" => "sql",
        "html" | "htm" => "html",
        "css" | "scss" | "sass" => "css",
        "xml" => "xml",
        "dockerfile" | "docker" => "dockerfile",
        "makefile" | "make" => "makefile",
        "diff" | "patch" => "diff",
        "txt" | "text" | "plain" => "",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlights_rust_keywords() {
        let src = "fn main() {\n    let x = 1;\n}\n";
        let lines = highlight_code_block("rust", src).expect("rust should resolve");
        assert!(lines.len() >= 2);
        // At least one colored span that isn't pure default/raw.
        let any_styled = lines.iter().any(|(_, spans)| {
            spans
                .iter()
                .any(|s| s.style.fg.is_some() && !s.content.trim().is_empty())
        });
        assert!(any_styled, "expected styled spans, got {lines:?}");
    }

    #[test]
    fn normalizes_common_aliases() {
        assert_eq!(normalize_lang("rs"), "rust");
        assert_eq!(normalize_lang("ts"), "typescript");
        assert_eq!(normalize_lang("py"), "python");
        assert_eq!(normalize_lang("rust,ignore"), "rust");
    }

    #[test]
    fn auto_detects_rust_from_content() {
        let src = "pub fn foo() -> i32 {\n    let x = 42;\n    x\n}\n";
        let lines = highlight_code_block_auto("", src);
        assert!(lines.is_some(), "should detect rust from content");
    }

    #[test]
    fn no_background_on_spans() {
        let src = "let x = 1;\n";
        let lines = highlight_code_block("rust", src).unwrap();
        for (_, spans) in lines {
            for s in spans {
                assert!(s.style.bg.is_none(), "highlight must not set bg: {s:?}");
            }
        }
    }
}
