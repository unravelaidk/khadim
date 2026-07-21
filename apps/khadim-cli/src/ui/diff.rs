//! Unified-diff renderer for tool outputs.
//!
//! Industrial / editor-style hunks:
//! - file breadcrumb with +/− stats
//! - 1-col sign gutter (`+` / `−` / ` `)
//! - dim context, bold signs, clear add/remove colors
//! - skips large unchanged runs with a `···` elision

use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};

use crate::ui::theme::{error, text_muted, tool_label, tool_text};

/// Stats for a before/after pair (for collapsed tool headers).
#[derive(Debug, Clone, Copy, Default)]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
}

impl DiffStats {
    pub fn from_texts(before: &str, after: &str) -> Self {
        let old: Vec<&str> = before.lines().collect();
        let new: Vec<&str> = after.lines().collect();
        let mut added = 0usize;
        let mut removed = 0usize;
        let mut oi = 0usize;
        let mut ni = 0usize;
        while oi < old.len() || ni < new.len() {
            if oi < old.len() && ni < new.len() && old[oi] == new[ni] {
                oi += 1;
                ni += 1;
                continue;
            }
            let (or, nr) = find_hunk_runs(&old, &new, oi, ni);
            removed += or;
            added += nr;
            oi += or;
            ni += nr;
            if oi < old.len() && ni < new.len() && old[oi] == new[ni] {
                oi += 1;
                ni += 1;
            }
        }
        Self { added, removed }
    }

    pub fn chip(self) -> String {
        match (self.added, self.removed) {
            (0, 0) => String::new(),
            (a, 0) => format!("+{a}"),
            (0, r) => format!("−{r}"),
            (a, r) => format!("+{a} −{r}"),
        }
    }
}

/// Render a simple before/after diff as transcript lines (no outer indent).
pub fn render_simple_diff(
    old_lines: &[&str],
    new_lines: &[&str],
    content_width: usize,
    path: Option<&str>,
) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    // Sign col "±" (1) + space (1) = 2; caller may add a 1-col rail.
    let max_width = content_width.saturating_sub(3).max(8);

    let stats = DiffStats::from_texts(&old_lines.join("\n"), &new_lines.join("\n"));

    // File header breadcrumb
    if let Some(p) = path.filter(|s| !s.is_empty()) {
        let chip = stats.chip();
        let mut header = vec![
            Span::styled(
                "◆ ",
                Style::default()
                    .fg(tool_label())
                    .add_modifier(Modifier::DIM),
            ),
            Span::styled(
                truncate(p, max_width.saturating_sub(chip.len() + 4)),
                Style::default()
                    .fg(tool_text())
                    .add_modifier(Modifier::BOLD),
            ),
        ];
        if !chip.is_empty() {
            header.push(Span::styled(
                format!("  {chip}"),
                Style::default().fg(text_muted()),
            ));
        }
        lines.push(Line::from(header));
        lines.push(Line::from(Span::styled(
            "─".repeat(content_width.min(48).max(8)),
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        )));
    }

    let mut old_idx = 0usize;
    let mut new_idx = 0usize;
    let mut context_streak = 0usize;
    const CONTEXT_KEEP: usize = 2;
    const CONTEXT_SKIP_AFTER: usize = 4;

    while old_idx < old_lines.len() || new_idx < new_lines.len() {
        if old_idx < old_lines.len()
            && new_idx < new_lines.len()
            && old_lines[old_idx] == new_lines[new_idx]
        {
            context_streak += 1;
            if context_streak <= CONTEXT_KEEP {
                let text = truncate(old_lines[old_idx], max_width);
                lines.push(context_line(&text));
            } else if context_streak == CONTEXT_KEEP + 1 {
                // Look ahead: if many more context lines, elide.
                let mut ahead = 0usize;
                let mut a = old_idx;
                let mut b = new_idx;
                while a < old_lines.len() && b < new_lines.len() && old_lines[a] == new_lines[b] {
                    ahead += 1;
                    a += 1;
                    b += 1;
                    if ahead > CONTEXT_SKIP_AFTER + CONTEXT_KEEP {
                        break;
                    }
                }
                if ahead > CONTEXT_SKIP_AFTER + CONTEXT_KEEP {
                    let skip = ahead - CONTEXT_KEEP * 2;
                    lines.push(elision_line(skip));
                    old_idx += skip;
                    new_idx += skip;
                    context_streak = 0;
                    continue;
                } else {
                    let text = truncate(old_lines[old_idx], max_width);
                    lines.push(context_line(&text));
                }
            } else {
                let text = truncate(old_lines[old_idx], max_width);
                lines.push(context_line(&text));
            }
            old_idx += 1;
            new_idx += 1;
        } else {
            context_streak = 0;
            let (old_run, new_run) = find_hunk_runs(old_lines, new_lines, old_idx, new_idx);

            for i in 0..old_run {
                let text = truncate(old_lines[old_idx + i], max_width);
                lines.push(del_line(&text));
            }
            for i in 0..new_run {
                let text = truncate(new_lines[new_idx + i], max_width);
                lines.push(ins_line(&text));
            }

            old_idx += old_run;
            new_idx += new_run;

            if old_idx < old_lines.len()
                && new_idx < new_lines.len()
                && old_lines[old_idx] == new_lines[new_idx]
            {
                let text = truncate(old_lines[old_idx], max_width);
                lines.push(context_line(&text));
                old_idx += 1;
                new_idx += 1;
            }
        }
    }

    if lines.is_empty() {
        lines.push(Line::from(Span::styled(
            "  (no changes)",
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        )));
    }

    lines
}

fn find_hunk_runs(old: &[&str], new: &[&str], old_idx: usize, new_idx: usize) -> (usize, usize) {
    let mut old_run = 0usize;
    let mut new_run = 0usize;
    let mut found = false;
    'outer: for o in 0..=5usize {
        for n in 0..=5usize {
            let oi = old_idx + o;
            let ni = new_idx + n;
            if oi < old.len() && ni < new.len() && old[oi] == new[ni] {
                old_run = o;
                new_run = n;
                found = true;
                break 'outer;
            }
        }
    }
    if !found {
        old_run = old.len().saturating_sub(old_idx).min(8);
        new_run = new.len().saturating_sub(new_idx).min(8);
    }
    (old_run, new_run)
}

fn context_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            " ",
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        ),
        Span::styled(
            " ",
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        ),
        Span::styled(
            text.to_string(),
            Style::default().fg(tool_text()).add_modifier(Modifier::DIM),
        ),
    ])
}

fn del_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            "−",
            Style::default().fg(error()).add_modifier(Modifier::BOLD),
        ),
        Span::styled(" ", Style::default().fg(error())),
        Span::styled(text.to_string(), Style::default().fg(error())),
    ])
}

fn ins_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            "+",
            Style::default()
                .fg(tool_label())
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(" ", Style::default().fg(tool_label())),
        Span::styled(text.to_string(), Style::default().fg(tool_label())),
    ])
}

fn elision_line(skipped: usize) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            "·",
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        ),
        Span::styled(
            format!("  ··· {skipped} unchanged ···"),
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        ),
    ])
}

fn truncate(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    let mut w = 0usize;
    let mut out = String::new();
    for ch in s.chars() {
        let cw = unicode_width::UnicodeWidthChar::width(ch).unwrap_or(1);
        if w + cw > max {
            if max > 1 {
                out.push('…');
            }
            break;
        }
        out.push(ch);
        w += cw;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stats_detect_add_remove() {
        let s = DiffStats::from_texts("a\nb\n", "a\nc\n");
        assert_eq!(s.removed, 1);
        assert_eq!(s.added, 1);
        assert!(s.chip().contains('+'));
    }

    #[test]
    fn render_includes_path_header() {
        let old = ["fn a() {}", "  1"];
        let new = ["fn a() {}", "  2"];
        let lines = render_simple_diff(&old, &new, 40, Some("src/main.rs"));
        let flat: String = lines
            .iter()
            .flat_map(|l| l.spans.iter().map(|s| s.content.as_ref()))
            .collect();
        assert!(flat.contains("src/main.rs"));
    }
}
