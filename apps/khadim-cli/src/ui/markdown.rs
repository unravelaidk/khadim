use pulldown_cmark::{Alignment, BlockQuoteKind, Event as MdEvent, Options, Parser, Tag, TagEnd, CodeBlockKind};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};

use super::theme::*;
use super::helpers::{wrap_text, truncate_str};

/// Languages that are diagram types and should get special rendering
const DIAGRAM_LANGS: &[&str] = &["mermaid", "plantuml", "graphviz", "dot", "d2", "vega", "vega-lite", "tikz"];

/// Map a GFM blockquote kind to an icon, label, and color
fn blockquote_kind_info(kind: &BlockQuoteKind) -> (&'static str, &'static str, ratatui::style::Color) {
    match kind {
        BlockQuoteKind::Note => ("📝", "Note", md_bq_note()),
        BlockQuoteKind::Tip => ("💡", "Tip", md_bq_tip()),
        BlockQuoteKind::Important => ("❗", "Important", md_bq_important()),
        BlockQuoteKind::Warning => ("⚠️", "Warning", md_bq_warning()),
        BlockQuoteKind::Caution => ("🔥", "Caution", md_bq_caution()),
    }
}

pub fn render_markdown<'a>(md: &str, width: usize) -> Vec<Line<'a>> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    options.insert(Options::ENABLE_MATH);
    options.insert(Options::ENABLE_GFM);
    options.insert(Options::ENABLE_DEFINITION_LIST);
    options.insert(Options::ENABLE_SUPERSCRIPT);
    options.insert(Options::ENABLE_SUBSCRIPT);

    let parser = Parser::new_ext(md, options);
    let mut lines: Vec<Line<'a>> = Vec::new();
    let mut current_spans: Vec<Span<'a>> = Vec::new();
    let indent = "  ";

    // ── Inline style state ──
    let mut bold = false;
    let mut italic = false;
    let mut strikethrough = false;
    let mut superscript = false;
    let mut subscript = false;
    let mut in_link = false;
    let mut in_image = false;
    let mut image_alt_buf = String::new();
    let mut image_url = String::new();

    // ── Block state ──
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();
    let mut is_diagram = false;
    let mut heading_level: Option<u8> = None;
    let mut list_depth: u16 = 0;
    let mut ordered_indices: Vec<u64> = Vec::new();
    let mut task_checked: Option<bool> = None;
    let mut in_blockquote = false;
    let mut blockquote_kind: Option<BlockQuoteKind> = None;
    let mut in_html_block = false;
    let mut in_metadata_block = false;

    // ── Table state ──
    let mut in_table = false;
    let mut table_alignments: Vec<Alignment> = Vec::new();
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut in_table_cell = false;
    let mut table_cell_buf = String::new();
    let mut table_current_row: Vec<String> = Vec::new();

    // ── Footnote state ──
    let mut in_footnote_def = false;

    // ── Definition list state ──
    let mut in_definition_title = false;
    let mut in_definition_def = false;

    let flush_line = |spans: &mut Vec<Span<'a>>, lines: &mut Vec<Line<'a>>, prefix: &str| {
        if spans.is_empty() {
            lines.push(Line::from(format!("{prefix}")));
        } else {
            let mut full = vec![Span::raw(prefix.to_string())];
            full.append(spans);
            lines.push(Line::from(full));
        }
    };

    for event in parser {
        match event {
            // ── Headings ──
            MdEvent::Start(Tag::Heading { level, .. }) => {
                heading_level = Some(level as u8);
                current_spans.clear();
            }
            MdEvent::End(TagEnd::Heading(_)) => {
                let prefix_char = match heading_level.unwrap_or(1) {
                    1 => "# ",
                    2 => "## ",
                    3 => "### ",
                    4 => "#### ",
                    5 => "##### ",
                    _ => "###### ",
                };
                let mut spans = vec![
                    Span::raw(indent.to_string()),
                    Span::styled(prefix_char.to_string(), Style::default().fg(md_heading())),
                ];
                spans.append(&mut current_spans);
                let styled: Vec<Span<'a>> = spans.into_iter().map(|s| {
                    Span::styled(
                        s.content.to_string(),
                        Style::default().fg(md_heading()).add_modifier(Modifier::BOLD),
                    )
                }).collect();
                lines.push(Line::from(""));
                lines.push(Line::from(styled));
                heading_level = None;
            }

            // ── Code blocks ──
            MdEvent::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_buf.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
                is_diagram = DIAGRAM_LANGS.iter().any(|&l| l == code_lang.to_lowercase());
            }
            MdEvent::End(TagEnd::CodeBlock) => {
                in_code_block = false;
                if is_diagram {
                    // Diagram rendering
                    let icon = "📊";
                    let label = if code_lang.is_empty() { "diagram".to_string() } else { code_lang.clone() };
                    lines.push(Line::from(vec![
                        Span::raw(format!("{indent}  ")),
                        Span::styled(
                            format!("{icon} Diagram ({label})"),
                            Style::default().fg(md_diagram()).add_modifier(Modifier::BOLD),
                        ),
                    ]));
                    let max_w = width.saturating_sub(6);
                    for code_line in code_buf.lines() {
                        let display = if code_line.chars().count() > max_w {
                            truncate_str(code_line, max_w).to_string()
                        } else {
                            code_line.to_string()
                        };
                        lines.push(Line::from(vec![
                            Span::styled(
                                format!("{indent}  │ "),
                                Style::default().fg(md_diagram()).add_modifier(Modifier::DIM),
                            ),
                            Span::styled(
                                display,
                                Style::default().fg(md_diagram()),
                            ),
                        ]));
                    }
                    lines.push(Line::from(Span::styled(
                        format!("{indent}  └──────"),
                        Style::default().fg(md_diagram()).add_modifier(Modifier::DIM),
                    )));
                    is_diagram = false;
                } else {
                    // Regular code block rendering
                    let header = if code_lang.is_empty() {
                        format!("{indent}  ┌──────")
                    } else {
                        format!("{indent}  ┌── {} ──", code_lang)
                    };
                    lines.push(Line::from(Span::styled(
                        header,
                        Style::default().fg(md_code_fg()).add_modifier(Modifier::DIM),
                    )));
                    let max_w = width.saturating_sub(6);
                    for code_line in code_buf.lines() {
                        let display = if code_line.chars().count() > max_w {
                            truncate_str(code_line, max_w).to_string()
                        } else {
                            code_line.to_string()
                        };
                        lines.push(Line::from(vec![
                            Span::styled(
                                format!("{indent}  │ "),
                                Style::default().fg(md_code_fg()).add_modifier(Modifier::DIM),
                            ),
                            Span::styled(
                                display,
                                Style::default().fg(md_code_fg()).bg(md_code_bg()),
                            ),
                        ]));
                    }
                    lines.push(Line::from(Span::styled(
                        format!("{indent}  └──────"),
                        Style::default().fg(md_code_fg()).add_modifier(Modifier::DIM),
                    )));
                }
                code_lang.clear();
            }

            // ── Lists ──
            MdEvent::Start(Tag::List(first_index)) => {
                list_depth += 1;
                if let Some(start) = first_index {
                    ordered_indices.push(start);
                } else {
                    ordered_indices.push(0);
                }
            }
            MdEvent::End(TagEnd::List(_)) => {
                list_depth = list_depth.saturating_sub(1);
                ordered_indices.pop();
            }
            MdEvent::Start(Tag::Item) => {
                current_spans.clear();
            }
            MdEvent::End(TagEnd::Item) => {
                let depth_indent = "  ".repeat(list_depth.saturating_sub(1) as usize);
                let (bullet_str, bullet_st) = if let Some(checked) = task_checked.take() {
                    if checked {
                        ("✓ ".to_string(), Style::default().fg(md_task_checked()).add_modifier(Modifier::BOLD))
                    } else {
                        ("○ ".to_string(), Style::default().fg(md_task_unchecked()))
                    }
                } else if let Some(idx) = ordered_indices.last_mut() {
                    if *idx > 0 {
                        let b = format!("{}. ", idx);
                        *idx += 1;
                        (b, Style::default().fg(md_list_bullet()))
                    } else {
                        ("• ".to_string(), Style::default().fg(md_list_bullet()))
                    }
                } else {
                    ("• ".to_string(), Style::default().fg(md_list_bullet()))
                };
                let mut spans = vec![
                    Span::raw(format!("{indent}{depth_indent}")),
                    Span::styled(bullet_str, bullet_st),
                ];
                spans.append(&mut current_spans);
                lines.push(Line::from(spans));
            }

            // ── Task list markers ──
            MdEvent::TaskListMarker(checked) => {
                task_checked = Some(checked);
            }

            // ── Tables ──
            MdEvent::Start(Tag::Table(alignment)) => {
                in_table = true;
                table_alignments = alignment;
                table_rows.clear();
            }
            MdEvent::End(TagEnd::Table) => {
                in_table = false;
                let table_lines = super::table::render_table_lines(&table_rows, &table_alignments, width);
                lines.push(Line::from(""));
                lines.extend(table_lines);
                lines.push(Line::from(""));
            }
            MdEvent::Start(Tag::TableHead) => { table_current_row.clear(); }
            MdEvent::End(TagEnd::TableHead) => {
                table_rows.push(table_current_row.clone());
                table_current_row.clear();
            }
            MdEvent::Start(Tag::TableRow) => { table_current_row.clear(); }
            MdEvent::End(TagEnd::TableRow) => {
                table_rows.push(table_current_row.clone());
                table_current_row.clear();
            }
            MdEvent::Start(Tag::TableCell) => { in_table_cell = true; table_cell_buf.clear(); }
            MdEvent::End(TagEnd::TableCell) => {
                in_table_cell = false;
                table_current_row.push(table_cell_buf.trim().to_string());
            }

            // ── Paragraphs ──
            MdEvent::Start(Tag::Paragraph) => { current_spans.clear(); }
            MdEvent::End(TagEnd::Paragraph) => {
                if !in_table && !in_footnote_def && !in_definition_title && !in_definition_def {
                    if !current_spans.is_empty() {
                        let bq_color = blockquote_kind.as_ref().map_or(md_blockquote(), |k| blockquote_kind_info(k).2);
                        let prefix = if in_blockquote {
                            format!("{indent}  │ ")
                        } else {
                            indent.to_string()
                        };
                        let full_text: String = current_spans.iter().map(|s| s.content.to_string()).collect();
                        if full_text.len() <= width.saturating_sub(4) {
                            flush_line(&mut current_spans, &mut lines, &prefix);
                        } else {
                            let style = if in_blockquote {
                                Style::default().fg(bq_color).add_modifier(Modifier::ITALIC)
                            } else {
                                let mut s = Style::default().fg(text_primary());
                                if bold { s = s.add_modifier(Modifier::BOLD); }
                                if italic { s = s.add_modifier(Modifier::ITALIC); }
                                s
                            };
                            for wl in wrap_text(&full_text, width.saturating_sub(4)) {
                                lines.push(Line::from(vec![
                                    Span::raw(prefix.clone()),
                                    Span::styled(wl, style),
                                ]));
                            }
                            current_spans.clear();
                        }
                    }
                    lines.push(Line::from(""));
                }
            }

            // ── Inline styles ──
            MdEvent::Start(Tag::Strong) => { bold = true; }
            MdEvent::End(TagEnd::Strong) => { bold = false; }
            MdEvent::Start(Tag::Emphasis) => { italic = true; }
            MdEvent::End(TagEnd::Emphasis) => { italic = false; }
            MdEvent::Start(Tag::Strikethrough) => { strikethrough = true; }
            MdEvent::End(TagEnd::Strikethrough) => { strikethrough = false; }
            MdEvent::Start(Tag::Superscript) => { superscript = true; }
            MdEvent::End(TagEnd::Superscript) => { superscript = false; }
            MdEvent::Start(Tag::Subscript) => { subscript = true; }
            MdEvent::End(TagEnd::Subscript) => { subscript = false; }

            // ── Links ──
            MdEvent::Start(Tag::Link { .. }) => { in_link = true; }
            MdEvent::End(TagEnd::Link) => { in_link = false; }

            // ── Images ──
            MdEvent::Start(Tag::Image { dest_url, .. }) => {
                in_image = true;
                image_alt_buf.clear();
                // Store URL for later display
                image_url = dest_url.to_string();
            }
            MdEvent::End(TagEnd::Image) => {
                in_image = false;
                let alt = if image_alt_buf.is_empty() { "image".to_string() } else { image_alt_buf.clone() };
                let url_display = if image_url.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", truncate_str(&image_url, 40))
                };
                lines.push(Line::from(vec![
                    Span::raw(format!("{indent}  ")),
                    Span::styled("🖼 ".to_string(), Style::default().fg(md_image())),
                    Span::styled(alt, Style::default().fg(md_image()).add_modifier(Modifier::ITALIC)),
                    Span::styled(url_display, Style::default().fg(md_image()).add_modifier(Modifier::DIM)),
                ]));
                image_alt_buf.clear();
                image_url.clear();
            }

            // ── Block quotes ──
            MdEvent::Start(Tag::BlockQuote(kind)) => {
                in_blockquote = true;
                blockquote_kind = kind;
                if let Some(bk) = &blockquote_kind {
                    let (icon, label, color) = blockquote_kind_info(bk);
                    lines.push(Line::from(vec![
                        Span::raw(format!("{indent}  ")),
                        Span::styled(format!("{icon} {label}"), Style::default().fg(color).add_modifier(Modifier::BOLD)),
                    ]));
                }
            }
            MdEvent::End(TagEnd::BlockQuote(_)) => {
                in_blockquote = false;
                blockquote_kind = None;
            }

            // ── Horizontal rule ──
            MdEvent::Rule => {
                let rule = "─".repeat(width.saturating_sub(4).min(60));
                lines.push(Line::from(vec![
                    Span::raw(indent.to_string()),
                    Span::styled(rule, Style::default().fg(md_hr())),
                ]));
            }

            // ── Footnotes ──
            MdEvent::Start(Tag::FootnoteDefinition(label)) => {
                in_footnote_def = true;
                current_spans.clear();
                lines.push(Line::from(vec![
                    Span::raw(format!("{indent}  ")),
                    Span::styled(
                        format!("[{}]:", label),
                        Style::default().fg(md_footnote()).add_modifier(Modifier::BOLD),
                    ),
                ]));
            }
            MdEvent::End(TagEnd::FootnoteDefinition) => {
                in_footnote_def = false;
                if !current_spans.is_empty() {
                    let prefix = format!("{indent}     ");
                    flush_line(&mut current_spans, &mut lines, &prefix);
                }
                lines.push(Line::from(""));
            }
            MdEvent::FootnoteReference(label) => {
                current_spans.push(Span::styled(
                    format!("[{}]", label),
                    Style::default().fg(md_footnote()).add_modifier(Modifier::BOLD),
                ));
            }

            // ── Definition lists ──
            MdEvent::Start(Tag::DefinitionList) => { /* container, no special rendering */ }
            MdEvent::End(TagEnd::DefinitionList) => {}
            MdEvent::Start(Tag::DefinitionListTitle) => {
                in_definition_title = true;
                current_spans.clear();
            }
            MdEvent::End(TagEnd::DefinitionListTitle) => {
                in_definition_title = false;
                if !current_spans.is_empty() {
                    let mut spans = vec![Span::raw(format!("{indent}  "))];
                    spans.append(&mut current_spans);
                    let styled: Vec<Span<'a>> = spans.into_iter().map(|s| {
                        Span::styled(
                            s.content.to_string(),
                            Style::default().fg(md_definition_term()).add_modifier(Modifier::BOLD),
                        )
                    }).collect();
                    lines.push(Line::from(styled));
                }
            }
            MdEvent::Start(Tag::DefinitionListDefinition) => {
                in_definition_def = true;
                current_spans.clear();
            }
            MdEvent::End(TagEnd::DefinitionListDefinition) => {
                in_definition_def = false;
                if !current_spans.is_empty() {
                    let prefix = format!("{indent}    ");
                    let full_text: String = current_spans.iter().map(|s| s.content.to_string()).collect();
                    for wl in wrap_text(&full_text, width.saturating_sub(6)) {
                        lines.push(Line::from(vec![
                            Span::raw(prefix.clone()),
                            Span::styled(wl, Style::default().fg(text_primary())),
                        ]));
                    }
                    current_spans.clear();
                }
                lines.push(Line::from(""));
            }

            // ── Math ──
            MdEvent::InlineMath(expr) => {
                current_spans.push(Span::styled(
                    expr.to_string(),
                    Style::default().fg(md_math()).add_modifier(Modifier::ITALIC),
                ));
            }
            MdEvent::DisplayMath(expr) => {
                lines.push(Line::from(Span::styled(
                    format!("{indent}  ┌── ∑ ──"),
                    Style::default().fg(md_math()).add_modifier(Modifier::DIM),
                )));
                let max_w = width.saturating_sub(6);
                for math_line in expr.lines() {
                    let display = if math_line.chars().count() > max_w {
                        truncate_str(math_line, max_w).to_string()
                    } else {
                        math_line.to_string()
                    };
                    lines.push(Line::from(vec![
                        Span::styled(
                            format!("{indent}  │ "),
                            Style::default().fg(md_math()).add_modifier(Modifier::DIM),
                        ),
                        Span::styled(
                            display,
                            Style::default().fg(md_math()),
                        ),
                    ]));
                }
                lines.push(Line::from(Span::styled(
                    format!("{indent}  └──────"),
                    Style::default().fg(md_math()).add_modifier(Modifier::DIM),
                )));
            }

            // ── HTML blocks (skip) ──
            MdEvent::Start(Tag::HtmlBlock) => { in_html_block = true; }
            MdEvent::End(TagEnd::HtmlBlock) => { in_html_block = false; }
            MdEvent::Html(_) => { /* skip inline HTML */ }

            // ── Metadata blocks (skip) ──
            MdEvent::Start(Tag::MetadataBlock(_)) => { in_metadata_block = true; }
            MdEvent::End(TagEnd::MetadataBlock(_)) => { in_metadata_block = false; }

            // ── Text ──
            MdEvent::Text(text) => {
                if in_html_block || in_metadata_block {
                    // Skip HTML and metadata content
                } else if in_table_cell {
                    table_cell_buf.push_str(&text);
                } else if in_code_block {
                    code_buf.push_str(&text);
                } else if in_image {
                    image_alt_buf.push_str(&text);
                } else {
                    let mut style = Style::default().fg(text_primary());
                    if bold { style = style.add_modifier(Modifier::BOLD); }
                    if italic { style = style.add_modifier(Modifier::ITALIC); }
                    if strikethrough { style = style.fg(md_strikethrough()).add_modifier(Modifier::CROSSED_OUT); }
                    if superscript { style = style.fg(md_superscript()); }
                    if subscript { style = style.fg(md_subscript()); }
                    if in_link { style = style.fg(md_link()).add_modifier(Modifier::UNDERLINED); }
                    if in_blockquote {
                        let bq_color = blockquote_kind.as_ref().map_or(md_blockquote(), |k| blockquote_kind_info(k).2);
                        style = style.fg(bq_color).add_modifier(Modifier::ITALIC);
                        // Preserve other modifiers
                        if bold { style = style.add_modifier(Modifier::BOLD); }
                    }
                    if heading_level.is_some() {
                        style = style.fg(md_heading()).add_modifier(Modifier::BOLD);
                    }
                    if in_footnote_def {
                        style = style.fg(md_footnote());
                    }
                    if in_definition_title {
                        style = style.fg(md_definition_term()).add_modifier(Modifier::BOLD);
                    }
                    if in_definition_def {
                        style = style.fg(text_primary());
                    }
                    current_spans.push(Span::styled(text.to_string(), style));
                }
            }

            // ── Inline code ──
            MdEvent::Code(code) => {
                if in_table_cell {
                    table_cell_buf.push_str(&code);
                } else {
                    current_spans.push(Span::styled(
                        format!(" {} ", code),
                        Style::default().fg(md_code_fg()).bg(md_code_bg()),
                    ));
                }
            }

            // ── Line breaks ──
            MdEvent::SoftBreak | MdEvent::HardBreak => {
                if in_table_cell {
                    table_cell_buf.push(' ');
                } else if in_code_block || in_html_block || in_metadata_block {
                    // handled by text events
                } else if !current_spans.is_empty() {
                    let prefix = if in_blockquote {
                        format!("{indent}  │ ")
                    } else {
                        indent.to_string()
                    };
                    flush_line(&mut current_spans, &mut lines, &prefix);
                }
            }

            _ => {}
        }
    }

    // Flush any remaining spans
    if !current_spans.is_empty() {
        let prefix = indent.to_string();
        flush_line(&mut current_spans, &mut lines, &prefix);
    }

    lines
}