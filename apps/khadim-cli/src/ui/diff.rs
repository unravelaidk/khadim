//! Simple unified-diff renderer for tool outputs.
//!
//! Inspired by Codex CLI's diff rendering: line numbers, gutter signs,
//! and optional syntax highlighting.

use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

/// Render a simple before/after diff as transcript lines.
///
/// `old_lines` and `new_lines` are the file content before and after the edit,
/// split by `\n`.  The diff is computed line-by-line (not a full Myers diff).
/// This is intentionally simple: it highlights changed lines in red/green
/// and shows context lines around them.
pub fn render_simple_diff(
    old_lines: &[&str],
    new_lines: &[&str],
    content_width: usize,
) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let max_width = content_width.saturating_sub(8); // gutter for line nums + sign

    // Use a simple LCS-like approach to find changed regions.
    let mut old_idx = 0usize;
    let mut new_idx = 0usize;

    while old_idx < old_lines.len() || new_idx < new_lines.len() {
        if old_idx < old_lines.len()
            && new_idx < new_lines.len()
            && old_lines[old_idx] == new_lines[new_idx]
        {
            // Context line
            let text = truncate(old_lines[old_idx], max_width);
            lines.push(context_line(&text));
            old_idx += 1;
            new_idx += 1;
        } else {
            // Find the next matching line to determine the hunk boundaries.
            let mut old_run = 0usize;
            let mut new_run = 0usize;
            let mut found_match = false;

            'outer: for o in 0..=3usize {
                for n in 0..=3usize {
                    let oi = old_idx + o;
                    let ni = new_idx + n;
                    if oi < old_lines.len()
                        && ni < new_lines.len()
                        && old_lines[oi] == new_lines[ni]
                    {
                        old_run = o;
                        new_run = n;
                        found_match = true;
                        break 'outer;
                    }
                }
            }

            if !found_match {
                old_run = old_lines.len().saturating_sub(old_idx).min(3);
                new_run = new_lines.len().saturating_sub(new_idx).min(3);
            }

            // Emit deleted lines
            for i in 0..old_run {
                let text = truncate(old_lines[old_idx + i], max_width);
                lines.push(del_line(&text));
            }
            // Emit inserted lines
            for i in 0..new_run {
                let text = truncate(new_lines[new_idx + i], max_width);
                lines.push(ins_line(&text));
            }

            old_idx += old_run;
            new_idx += new_run;

            if found_match && (old_idx < old_lines.len() || new_idx < new_lines.len()) {
                // Emit the matching context line
                let text = truncate(old_lines[old_idx], max_width);
                lines.push(context_line(&text));
                old_idx += 1;
                new_idx += 1;
            }
        }
    }

    lines
}

fn context_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled("     ", Style::default().fg(Color::DarkGray)),
        Span::styled(text.to_string(), Style::default().fg(Color::Gray)),
    ])
}

fn del_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled("  -  ", Style::default().fg(Color::Red)),
        Span::styled(
            text.to_string(),
            Style::default().fg(Color::Red).add_modifier(Modifier::CROSSED_OUT),
        ),
    ])
}

fn ins_line(text: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled("  +  ", Style::default().fg(Color::Green)),
        Span::styled(
            text.to_string(),
            Style::default().fg(Color::Green),
        ),
    ])
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let end = s
            .char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        format!("{}…", &s[..end])
    }
}
