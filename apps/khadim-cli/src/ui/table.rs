use pulldown_cmark::Alignment;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};

use super::theme::*;

fn align_cell(text: &str, width: usize, alignment: Alignment) -> String {
    let char_count = text.chars().count();
    if char_count >= width {
        // Truncate with ellipsis
        if width > 1 {
            let truncated: String = text.chars().take(width - 1).collect();
            format!("{}…", truncated)
        } else if width == 1 {
            "…".to_string()
        } else {
            String::new()
        }
    } else {
        let padding = width - char_count;
        match alignment {
            Alignment::Left | Alignment::None => format!("{}{}", text, " ".repeat(padding)),
            Alignment::Center => {
                let left_pad = padding / 2;
                let right_pad = padding - left_pad;
                format!("{}{}{}", " ".repeat(left_pad), text, " ".repeat(right_pad))
            }
            Alignment::Right => format!("{}{}", " ".repeat(padding), text),
        }
    }
}

pub fn render_table_lines<'a>(rows: &[Vec<String>], alignments: &[Alignment], width: usize) -> Vec<Line<'a>> {
    if rows.is_empty() { return Vec::new(); }
    let num_cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if num_cols == 0 { return Vec::new(); }

    let mut col_widths: Vec<usize> = vec![3; num_cols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            if i < num_cols { col_widths[i] = col_widths[i].max(cell.chars().count()); }
        }
    }

    let indent_len = 2;
    let borders_overhead = 1 + num_cols * 3 + 1;
    let available = width.saturating_sub(indent_len + borders_overhead);
    let total_width: usize = col_widths.iter().sum();

    if total_width > available && available > 0 {
        let scale = available as f64 / total_width as f64;
        let mut new_widths: Vec<usize> = col_widths.iter().map(|&w| {
            ((w as f64 * scale).max(3.0)) as usize
        }).collect();
        let mut current_total: usize = new_widths.iter().sum();
        while current_total > available {
            let max_idx = new_widths.iter().enumerate()
                .max_by_key(|(_, &w)| w)
                .map(|(i, _)| i)
                .unwrap_or(0);
            if new_widths[max_idx] > 3 { new_widths[max_idx] -= 1; current_total -= 1; }
            else { break; }
        }
        col_widths = new_widths;
    }

    let mut table_lines: Vec<Line<'a>> = Vec::new();

    let make_border = |left: &str, mid: &str, right: &str, fill: char| -> Line<'a> {
        let mut spans = vec![Span::styled(format!("  {left}"), Style::default().fg(md_table_border()))];
        for (i, &w) in col_widths.iter().enumerate() {
            if i > 0 { spans.push(Span::styled(mid.to_string(), Style::default().fg(md_table_border()))); }
            spans.push(Span::styled(fill.to_string().repeat(w + 2), Style::default().fg(md_table_border())));
        }
        spans.push(Span::styled(right.to_string(), Style::default().fg(md_table_border())));
        Line::from(spans)
    };

    let make_row = |cells: &[String], is_header: bool| -> Line<'a> {
        let mut spans = vec![Span::styled("  │ ".to_string(), Style::default().fg(md_table_border()))];
        for (i, cell) in cells.iter().enumerate() {
            if i > 0 { spans.push(Span::styled(" │ ".to_string(), Style::default().fg(md_table_border()))); }
            let w = col_widths.get(i).copied().unwrap_or(3);
            let aligned = align_cell(cell, w, alignments.get(i).copied().unwrap_or(Alignment::None));
            let style = if is_header { Style::default().fg(md_table_header()).add_modifier(Modifier::BOLD) } else { Style::default().fg(text_primary()) };
            spans.push(Span::styled(format!(" {aligned} "), style));
        }
        // Fill missing cells
        for i in cells.len()..num_cols {
            spans.push(Span::styled(" │ ".to_string(), Style::default().fg(md_table_border())));
            let w = col_widths.get(i).copied().unwrap_or(3);
            spans.push(Span::styled(format!(" {} ", " ".repeat(w)), Style::default().fg(text_primary())));
        }
        spans.push(Span::styled(" │".to_string(), Style::default().fg(md_table_border())));
        Line::from(spans)
    };

    table_lines.push(make_border("┌", "┬", "┐", '─'));
    if !rows.is_empty() {
        table_lines.push(make_row(&rows[0], true));
    }

    // Only add body separator and body rows if there are body rows
    if rows.len() > 1 {
        table_lines.push(make_border("├", "┼", "┤", '─'));
        for row in rows.iter().skip(1) {
            table_lines.push(make_row(row, false));
        }
    }

    table_lines.push(make_border("└", "┴", "┘", '─'));

    table_lines
}