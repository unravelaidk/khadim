//! Code presentation helpers inspired by Zed's editor:
//! - indent guides (editor_indent_guide)
//! - line-number styling (editor_line_number / active)
//! - soft-wrap-friendly gutters (see `gutter.rs`)

use ratatui::style::{Modifier, Style};
use ratatui::text::Span;

use crate::ui::theme::{accent_dim, text_muted};

/// Default indent width (Zed uses buffer tab size; we use 4 for display).
pub const TAB_SIZE: usize = 4;

/// Paint leading whitespace with faint vertical guides at each indent level.
///
/// Example (spaces shown as · for docs):
/// ```text
/// fn foo() {
/// │···let x = 1;
/// │···│···let y = 2;
/// }
/// ```
///
/// Only pure leading spaces/tabs are rewritten; the rest of the line is
/// returned as a single plain span so callers can restyle or re-highlight.
pub fn leading_indent_guide_spans(text: &str, style_code: Style) -> Vec<Span<'static>> {
    let mut spans = Vec::new();
    let mut chars = text.chars().peekable();
    let mut col = 0usize;
    let guide = Style::default()
        .fg(text_muted())
        .add_modifier(Modifier::DIM);
    let mut leading = String::new();

    while let Some(&ch) = chars.peek() {
        match ch {
            ' ' => {
                leading.push(' ');
                col += 1;
                chars.next();
            }
            '\t' => {
                // Expand tab to next tab stop.
                let spaces = TAB_SIZE - (col % TAB_SIZE);
                for _ in 0..spaces {
                    leading.push(' ');
                    col += 1;
                }
                chars.next();
            }
            _ => break,
        }
    }

    if !leading.is_empty() {
        // Replace every TAB_SIZE-th leading space with a guide bar.
        let mut painted = String::with_capacity(leading.len());
        for (i, ch) in leading.chars().enumerate() {
            if i % TAB_SIZE == 0 {
                painted.push('│');
            } else {
                painted.push(ch); // space
            }
        }
        // Guide bars dim; spaces between them inherit muted so they don't pop.
        spans.push(Span::styled(painted, guide));
    }

    let rest: String = chars.collect();
    if !rest.is_empty() {
        spans.push(Span::styled(rest, style_code));
    } else if spans.is_empty() {
        spans.push(Span::styled(String::new(), style_code));
    }
    spans
}

/// Apply indent guides to an already-highlighted span list by only rewriting
/// the pure-leading whitespace run at the start of the line.
pub fn apply_indent_guides_to_spans(spans: Vec<Span<'static>>) -> Vec<Span<'static>> {
    if spans.is_empty() {
        return spans;
    }

    let flat: String = spans.iter().map(|s| s.content.as_ref()).collect();
    let lead: usize = flat.chars().take_while(|c| *c == ' ' || *c == '\t').count();
    if lead == 0 {
        return spans;
    }

    // Expand tabs in leading for guide placement.
    let mut expanded_lead = 0usize;
    for ch in flat.chars().take(lead) {
        match ch {
            ' ' => expanded_lead += 1,
            '\t' => expanded_lead += TAB_SIZE - (expanded_lead % TAB_SIZE),
            _ => break,
        }
    }

    let mut guide_str = String::with_capacity(expanded_lead);
    for i in 0..expanded_lead {
        if i % TAB_SIZE == 0 {
            guide_str.push('│');
        } else {
            guide_str.push(' ');
        }
    }

    let guide_style = Style::default()
        .fg(text_muted())
        .add_modifier(Modifier::DIM);

    // Drop original leading chars from spans, keep the rest.
    let mut skip = lead;
    let mut rest: Vec<Span<'static>> = Vec::new();
    for span in spans {
        if skip == 0 {
            rest.push(span);
            continue;
        }
        let mut buf = String::new();
        for ch in span.content.chars() {
            if skip > 0 {
                skip -= 1;
            } else {
                buf.push(ch);
            }
        }
        if !buf.is_empty() {
            rest.push(Span::styled(buf, span.style));
        }
    }

    let mut out = vec![Span::styled(guide_str, guide_style)];
    out.extend(rest);
    out
}

/// Style for inactive line numbers (Zed: editor_line_number).
pub fn line_number_style() -> Style {
    Style::default()
        .fg(text_muted())
        .add_modifier(Modifier::DIM)
}

/// Style for a slightly more prominent number (Zed: editor_active_line_number).
/// Used for the first line of a block / file header context.
pub fn line_number_active_style() -> Style {
    Style::default().fg(accent_dim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::style::Style;

    #[test]
    fn guides_at_indent_boundaries() {
        let spans = leading_indent_guide_spans("        let x = 1;", Style::default());
        let flat: String = spans.iter().map(|s| s.content.as_ref()).collect();
        // 8 spaces → │   │   + "let x = 1;"
        assert!(flat.starts_with('│'), "flat={flat:?}");
        assert!(flat.contains("let x = 1;"));
        // Second guide at col 4
        let chars: Vec<char> = flat.chars().collect();
        assert_eq!(chars[0], '│');
        assert_eq!(chars[4], '│');
    }

    #[test]
    fn no_guides_without_indent() {
        let spans = leading_indent_guide_spans("fn main() {}", Style::default());
        let flat: String = spans.iter().map(|s| s.content.as_ref()).collect();
        assert_eq!(flat, "fn main() {}");
    }
}
