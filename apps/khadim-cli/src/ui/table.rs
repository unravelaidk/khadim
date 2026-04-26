use pulldown_cmark::Alignment;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};

use super::theme::{md_table_border, md_table_header, text_primary};
use unicode_width::UnicodeWidthStr;

/// Border style for tables
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[allow(dead_code)]
pub enum TableBorderStyle {
    /// Unicode box-drawing characters (default)
    #[default]
    Unicode,
    /// ASCII characters only | - + =
    Ascii,
    /// Unicode heavy box-drawing characters ┏ ━ ┓ ┃ ┗ ━ ┛
    Heavy,
    /// Rounded corners ┌ ┐ └ ┘
    Rounded,
    /// Double box-drawing characters ╔ ═ ╗ ║ ╚ ═ ╝
    Double,
    /// No borders (space-separated columns)
    None,
}

fn align_cell(text: &str, width: usize, alignment: Alignment) -> String {
    let char_width = UnicodeWidthStr::width(text);
    if char_width >= width {
        // Truncate with ellipsis
        if width > 1 {
            let truncated = truncate_unicode(text, width - 1);
            format!("{truncated}…")
        } else if width == 1 {
            "…".to_string()
        } else {
            String::new()
        }
    } else {
        let padding = width - char_width;
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

/// Truncate a string to a given Unicode width
fn truncate_unicode(s: &str, max_width: usize) -> String {
    let mut width: usize = 0;
    let mut result = String::new();
    for c in s.chars() {
        let char_width = unicode_width::UnicodeWidthChar::width(c).unwrap_or(0);
        if width + char_width > max_width {
            break;
        }
        width += char_width;
        result.push(c);
    }
    result
}

/// Word-wrap text to fit within a given width, returning multiple lines
fn wrap_cell_text(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 {
        return vec![String::new()];
    }

    let mut lines = Vec::new();
    for paragraph in text.split('\n') {
        if paragraph.is_empty() {
            lines.push(String::new());
            continue;
        }

        let mut current_line = String::new();
        let mut current_width: usize = 0;

        for word in paragraph.split_whitespace() {
            let word_width = UnicodeWidthStr::width(word);
            let space_width = usize::from(!current_line.is_empty());

            if current_width + space_width + word_width > max_width && !current_line.is_empty() {
                lines.push(current_line);
                current_line = String::new();
                current_width = 0;
            }

            if !current_line.is_empty() {
                current_line.push(' ');
                current_width += 1;
            }
            current_line.push_str(word);
            current_width += word_width;
        }

        if !current_line.is_empty() {
            lines.push(current_line);
        }
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}

/// Get border characters based on style
const fn get_border_chars(
    style: TableBorderStyle,
) -> (&'static str, &'static str, &'static str, char) {
    match style {
        TableBorderStyle::Unicode => ("┌", "┬", "┐", '─'),
        TableBorderStyle::Ascii => ("+", "+", "+", '-'),
        TableBorderStyle::Heavy => ("┏", "┳", "┓", '━'),
        TableBorderStyle::Rounded => ("╭", "┬", "╮", '─'),
        TableBorderStyle::Double => ("╔", "╦", "╗", '═'),
        TableBorderStyle::None => (" ", " ", " ", ' '),
    }
}

/// Get separator characters based on style
const fn get_separator_chars(
    style: TableBorderStyle,
) -> (&'static str, &'static str, &'static str, char) {
    match style {
        TableBorderStyle::Unicode => ("├", "┼", "┤", '─'),
        TableBorderStyle::Ascii => ("+", "+", "+", '-'),
        TableBorderStyle::Heavy => ("┣", "╋", "┫", '━'),
        TableBorderStyle::Rounded => ("├", "┼", "┤", '─'),
        TableBorderStyle::Double => ("╠", "╬", "╣", '═'),
        TableBorderStyle::None => (" ", " ", " ", ' '),
    }
}

/// Get bottom border characters based on style
const fn get_bottom_border_chars(
    style: TableBorderStyle,
) -> (&'static str, &'static str, &'static str, char) {
    match style {
        TableBorderStyle::Unicode => ("└", "┴", "┘", '─'),
        TableBorderStyle::Ascii => ("+", "+", "+", '-'),
        TableBorderStyle::Heavy => ("┗", "┻", "┛", '━'),
        TableBorderStyle::Rounded => ("╰", "┴", "╯", '─'),
        TableBorderStyle::Double => ("╚", "╩", "╝", '═'),
        TableBorderStyle::None => (" ", " ", " ", ' '),
    }
}

/// Get vertical separator character
const fn get_vert_sep(style: TableBorderStyle) -> &'static str {
    match style {
        TableBorderStyle::Unicode => " │ ",
        TableBorderStyle::Ascii => " | ",
        TableBorderStyle::Heavy => " ┃ ",
        TableBorderStyle::Rounded => " │ ",
        TableBorderStyle::Double => " ║ ",
        TableBorderStyle::None => " ",
    }
}

/// Get left border prefix
const fn get_left_prefix(style: TableBorderStyle) -> &'static str {
    match style {
        TableBorderStyle::Unicode => "  │ ",
        TableBorderStyle::Ascii => "  | ",
        TableBorderStyle::Heavy => "  ┃ ",
        TableBorderStyle::Rounded => "  │ ",
        TableBorderStyle::Double => "  ║ ",
        TableBorderStyle::None => "  ",
    }
}

/// Get right border suffix
const fn get_right_suffix(style: TableBorderStyle) -> &'static str {
    match style {
        TableBorderStyle::Unicode => " │",
        TableBorderStyle::Ascii => " |",
        TableBorderStyle::Heavy => " ┃",
        TableBorderStyle::Rounded => " │",
        TableBorderStyle::Double => " ║",
        TableBorderStyle::None => "",
    }
}

/// Options for table rendering
#[derive(Debug, Clone)]
pub struct TableRenderOptions {
    /// Border style to use
    pub border_style: TableBorderStyle,
    /// Enable zebra striping (alternating row backgrounds)
    pub zebra_stripes: bool,
    /// Enable word wrapping in cells instead of truncation
    pub word_wrap: bool,
    /// Minimum column width
    pub min_col_width: usize,
    /// Maximum cell lines before truncation
    pub max_cell_lines: usize,
}

impl Default for TableRenderOptions {
    fn default() -> Self {
        Self {
            border_style: TableBorderStyle::Unicode,
            zebra_stripes: true,
            word_wrap: false,
            min_col_width: 3,
            max_cell_lines: 3,
        }
    }
}

pub fn render_table_lines<'a>(
    rows: &[Vec<String>],
    alignments: &[Alignment],
    width: usize,
) -> Vec<Line<'a>> {
    render_table_lines_with_options(rows, alignments, width, &TableRenderOptions::default())
}

pub fn render_table_lines_with_options<'a>(
    rows: &[Vec<String>],
    alignments: &[Alignment],
    width: usize,
    options: &TableRenderOptions,
) -> Vec<Line<'a>> {
    if rows.is_empty() {
        return Vec::new();
    }
    let num_cols = rows.iter().map(std::vec::Vec::len).max().unwrap_or(0);
    if num_cols == 0 {
        return Vec::new();
    }

    let style = options.border_style;
    let zebra = options.zebra_stripes;
    let wrap = options.word_wrap;
    let min_width = options.min_col_width;
    let max_lines = options.max_cell_lines;

    // Calculate column widths considering multi-line content
    let mut col_widths: Vec<usize> = vec![min_width; num_cols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            if i < num_cols {
                let cell_width = if wrap {
                    // Find the longest line in wrapped cell content
                    let lines = wrap_cell_text(cell, width.saturating_sub(20)); // conservative estimate
                    lines
                        .iter()
                        .map(|l| UnicodeWidthStr::width(l.as_str()))
                        .max()
                        .unwrap_or(0)
                } else {
                    UnicodeWidthStr::width(cell.as_str())
                };
                col_widths[i] = col_widths[i].max(cell_width);
            }
        }
    }

    // Ensure minimum column widths
    for w in &mut col_widths {
        *w = (*w).max(min_width);
    }

    let indent_len = 2;
    let borders_overhead = 1 + num_cols * get_vert_sep(style).len() + 1;
    let available = width.saturating_sub(indent_len + borders_overhead);
    let total_width: usize = col_widths.iter().sum();

    // Scale columns to fit if needed
    if total_width > available && available > 0 {
        let scale = available as f64 / total_width as f64;
        let mut new_widths: Vec<usize> = col_widths
            .iter()
            .map(|&w| ((w as f64 * scale).max(min_width as f64)) as usize)
            .collect();
        let mut current_total: usize = new_widths.iter().sum();
        while current_total > available {
            let max_idx = new_widths
                .iter()
                .enumerate()
                .max_by_key(|(_, &w)| w)
                .map_or(0, |(i, _)| i);
            if new_widths[max_idx] > min_width {
                new_widths[max_idx] -= 1;
                current_total -= 1;
            } else {
                break;
            }
        }
        col_widths = new_widths;
    }

    let mut table_lines: Vec<Line<'a>> = Vec::new();

    let make_border = |left: &str, mid: &str, right: &str, fill: char| -> Line<'a> {
        let sep = get_vert_sep(style);
        let mut spans = vec![Span::styled(
            format!("  {left}"),
            Style::default().fg(md_table_border()),
        )];
        for (i, &w) in col_widths.iter().enumerate() {
            if i > 0 {
                spans.push(Span::styled(
                    mid.to_string(),
                    Style::default().fg(md_table_border()),
                ));
            }
            spans.push(Span::styled(
                fill.to_string().repeat(w + sep.len() - 1),
                Style::default().fg(md_table_border()),
            ));
        }
        spans.push(Span::styled(
            right.to_string(),
            Style::default().fg(md_table_border()),
        ));
        Line::from(spans)
    };

    let make_row = |cells: &[String], is_header: bool, row_idx: usize| -> Vec<Line<'a>> {
        let mut lines = Vec::new();
        let sep = get_vert_sep(style);
        let left = get_left_prefix(style);
        let right = get_right_suffix(style);

        // Process each cell - get wrapped content
        let cell_content: Vec<Vec<String>> = cells
            .iter()
            .enumerate()
            .map(|(i, cell)| {
                let col_w = col_widths.get(i).copied().unwrap_or(min_width);
                if wrap {
                    let lines = wrap_cell_text(cell, col_w);
                    // Limit number of lines
                    if lines.len() > max_lines {
                        let mut limited = lines[..max_lines].to_vec();
                        limited.push("…".to_string());
                        limited
                    } else {
                        lines
                    }
                } else {
                    vec![align_cell(
                        cell,
                        col_w,
                        alignments.get(i).copied().unwrap_or(Alignment::None),
                    )]
                }
            })
            .collect();

        // Find maximum lines in any cell
        let max_cell_lines_count = cell_content
            .iter()
            .map(std::vec::Vec::len)
            .max()
            .unwrap_or(1)
            .max(1);

        // Create a line for each row of cell content
        for line_idx in 0..max_cell_lines_count {
            let mut spans = Vec::new();

            if style != TableBorderStyle::None {
                spans.push(Span::styled(
                    left.to_string(),
                    Style::default().fg(md_table_border()),
                ));
            }

            for (i, cell_lines) in cell_content.iter().enumerate() {
                let content = cell_lines
                    .get(line_idx)
                    .map_or("", std::string::String::as_str);

                if i > 0 && style != TableBorderStyle::None {
                    spans.push(Span::styled(sep, Style::default().fg(md_table_border())));
                }

                let cell_styling = if is_header {
                    Style::default()
                        .fg(md_table_header())
                        .add_modifier(Modifier::BOLD)
                } else if zebra && row_idx % 2 == 1 {
                    // Zebra striping - use dim background
                    Style::default()
                        .fg(text_primary())
                        .add_modifier(Modifier::DIM)
                } else {
                    Style::default().fg(text_primary())
                };

                let padding = " ".to_string();

                spans.push(Span::styled(format!(" {content}{padding}"), cell_styling));
            }

            // Fill missing cells
            for i in cells.len()..num_cols {
                if i > 0 && style != TableBorderStyle::None {
                    spans.push(Span::styled(sep, Style::default().fg(md_table_border())));
                }
                let w = col_widths.get(i).copied().unwrap_or(min_width);
                let body_styling = if is_header {
                    Style::default()
                        .fg(md_table_header())
                        .add_modifier(Modifier::BOLD)
                } else if zebra && row_idx % 2 == 1 {
                    Style::default()
                        .fg(text_primary())
                        .add_modifier(Modifier::DIM)
                } else {
                    Style::default().fg(text_primary())
                };
                spans.push(Span::styled(format!(" {} ", " ".repeat(w)), body_styling));
            }

            if style != TableBorderStyle::None {
                spans.push(Span::styled(right, Style::default().fg(md_table_border())));
            }
            lines.push(Line::from(spans));
        }

        lines
    };

    // Top border
    let (top_l, top_m, top_r, top_f) = get_border_chars(style);
    table_lines.push(make_border(top_l, top_m, top_r, top_f));

    // Header row
    if !rows.is_empty() {
        let header_lines = make_row(&rows[0], true, 0);
        table_lines.extend(header_lines);
    }

    // Separator between header and body
    if rows.len() > 1 {
        let (sep_l, sep_m, sep_r, sep_f) = get_separator_chars(style);
        table_lines.push(make_border(sep_l, sep_m, sep_r, sep_f));

        // Body rows
        for (row_idx, row) in rows.iter().skip(1).enumerate() {
            let body_lines = make_row(row, false, row_idx + 1);
            table_lines.extend(body_lines);
        }
    }

    // Bottom border
    let (bot_l, bot_m, bot_r, bot_f) = get_bottom_border_chars(style);
    table_lines.push(make_border(bot_l, bot_m, bot_r, bot_f));

    table_lines
}
