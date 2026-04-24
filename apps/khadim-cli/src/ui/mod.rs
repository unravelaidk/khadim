pub mod diff;
pub mod helpers;
pub mod highlight;
pub mod markdown;
pub mod paste;
pub mod table;
pub mod theme;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Clear, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState, Wrap,
};
use ratatui::Frame;

use crate::app::{spinner_frame, CachedTranscriptEntryRender, TranscriptEntryStamp, TuiApp};
use crate::args::CliConfig;
use crate::domain::commands::CommandPickerKind;
use crate::domain::login::LoginPhase;
use crate::domain::settings::{
    is_oauth_provider, SettingsFocus, SettingsPicker, StoredSettings,
};
use crate::domain::transcript::TranscriptEntry;
use crate::services::catalog_service::{
    context_window_for, estimate_cost, format_cost, format_tokens, models_for_provider,
    provider_catalog,
};
use crate::services::settings_service::effective_settings;
use crate::ui::helpers::{
    count_wrapped_lines, cursor_to_row_col, hard_wrap_lines, shimmer_spans, truncate_str,
    wrap_text_to_width,
};
use crate::ui::highlight::highlight_code_block;
use crate::ui::theme::*;

/// Fast plain-text renderer for the currently-streaming assistant entry.
/// Avoids expensive markdown parsing on every frame.
fn render_streaming_text(text: &str, content_width: usize) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let indent = "  ";
    let max_width = content_width.saturating_sub(2);

    for line in text.split('\n') {
        if line.is_empty() {
            lines.push(Line::from(indent.to_string()));
            continue;
        }
        if line.chars().count() <= max_width {
            lines.push(Line::from(vec![
                Span::raw(indent.to_string()),
                Span::raw(line.to_string()),
            ]));
            continue;
        }
        // Simple character-wrap for long lines
        let mut chunk = String::new();
        let mut col = 0;
        for ch in line.chars() {
            if col >= max_width {
                lines.push(Line::from(vec![
                    Span::raw(indent.to_string()),
                    Span::raw(chunk),
                ]));
                chunk = String::new();
                col = 0;
            }
            chunk.push(ch);
            col += 1;
        }
        if !chunk.is_empty() {
            lines.push(Line::from(vec![
                Span::raw(indent.to_string()),
                Span::raw(chunk),
            ]));
        }
    }
    lines
}

/// Render only the visible portion of the transcript (plus a small buffer).
/// Returns (visible_lines, total_line_count, effective_scroll, buffer).
pub fn render_transcript_viewport(
    app: &TuiApp,
    width: u16,
    visible_height: usize,
) -> (Vec<Line<'static>>, usize, usize, usize) {
    let content_width = width as usize;
    let mut cache = app.transcript_render_cache.borrow_mut();

    if cache.len() > app.entries.len() {
        cache.truncate(app.entries.len());
    }

    let last_index = app.entries.len().saturating_sub(1);
    let streaming_last = app.streaming_text
        && app
            .entries
            .last()
            .is_some_and(|e| matches!(e, TranscriptEntry::AssistantText { .. }));

    // ── First pass: update cache and compute per-entry heights ──
    let mut entry_heights = Vec::with_capacity(app.entries.len());
    let mut streaming_lines: Option<Vec<Line<'static>>> = None;

    for (index, entry) in app.entries.iter().enumerate() {
        if streaming_last && index == last_index {
            let text = match entry {
                TranscriptEntry::AssistantText { text } => text,
                _ => "",
            };
            let lines = render_streaming_text(text, content_width.saturating_sub(2));
            entry_heights.push(lines.len());
            streaming_lines = Some(lines);
        } else {
            let stamp = TranscriptEntryStamp::from_entry(entry);
            if cache.len() <= index {
                cache.push(CachedTranscriptEntryRender::default());
            }
            let cached = &mut cache[index];
            if cached.width != width || cached.stamp != stamp {
                cached.width = width;
                cached.stamp = stamp;
                cached.lines = render_transcript_entry(entry, content_width);
            }
            entry_heights.push(cached.lines.len());
        }
    }

    // Spinner height
    let spinner_height = if app.pending {
        let is_step = app
            .entries
            .last()
            .is_some_and(|e| matches!(e, TranscriptEntry::ToolComplete { .. }));
        if !is_step && !app.streaming_text {
            1
        } else {
            0
        }
    } else {
        0
    };

    let total_lines: usize = entry_heights.iter().sum::<usize>() + spinner_height;
    let max_scroll = total_lines.saturating_sub(visible_height);
    let scroll = if app.auto_scroll {
        max_scroll
    } else {
        app.scroll_offset.min(max_scroll)
    };

    // ── Second pass: collect only visible lines ──
    let buffer = visible_height; // one screenful buffer on each side for smoothness
    let viewport_start = scroll.saturating_sub(buffer);
    let viewport_end = (scroll + visible_height + buffer).min(total_lines);

    let mut lines = Vec::with_capacity(viewport_end.saturating_sub(viewport_start));
    let mut current_offset = 0usize;

    for (index, _entry) in app.entries.iter().enumerate() {
        let entry_height = entry_heights[index];
        let entry_start = current_offset;
        let entry_end = current_offset + entry_height;

        if entry_end <= viewport_start || entry_start >= viewport_end {
            current_offset = entry_end;
            continue;
        }

        let skip = viewport_start.saturating_sub(entry_start);
        let take = (entry_end.min(viewport_end) - entry_start).min(entry_height);

        if streaming_last && index == last_index {
            if let Some(ref streaming) = streaming_lines {
                for line in streaming.iter().take(take).skip(skip) {
                    lines.push(line.clone());
                }
            }
        } else {
            let cached = &cache[index];
            for line in cached.lines.iter().take(take).skip(skip) {
                lines.push(line.clone());
            }
        }

        current_offset = entry_end;
    }

    // Spinner
    if spinner_height > 0 {
        let spinner_offset = current_offset;
        if spinner_offset < viewport_end && spinner_offset + 1 > viewport_start {
            let spinner = spinner_frame(app.tick_count);
            let status = &app.status;
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(format!("{spinner} "), Style::default().fg(accent())),
                Span::styled(
                    status.clone(),
                    Style::default()
                        .fg(thinking())
                        .add_modifier(Modifier::ITALIC),
                ),
            ]));
        }
    }

    (lines, total_lines, scroll, buffer)
}

fn render_transcript_entry(entry: &TranscriptEntry, content_width: usize) -> Vec<Line<'static>> {
    let mut lines = Vec::new();

    match entry {
        TranscriptEntry::System { text } => {
            // Blank and indented rows render without the info glyph so
            // list-style system output (like /help) doesn't repeat " ℹ " on
            // every line.
            let is_list_row = text.is_empty() || text.starts_with(' ');
            if is_list_row {
                lines.push(Line::from(Span::styled(
                    text.clone(),
                    Style::default()
                        .fg(system_text())
                        .add_modifier(Modifier::DIM),
                )));
            } else {
                // Header / inline notice.
                lines.push(Line::from(Span::styled(
                    text.clone(),
                    Style::default()
                        .fg(system_text())
                        .add_modifier(Modifier::BOLD),
                )));
            }
        }
        TranscriptEntry::User { text } => {
            lines.push(Line::from(""));
            for (i, line) in text.lines().enumerate() {
                if i == 0 {
                    lines.push(Line::from(vec![
                        Span::styled(
                            " ▸ ",
                            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            line.to_string(),
                            Style::default()
                                .fg(text_primary())
                                .bg(user_bg())
                                .add_modifier(Modifier::BOLD),
                        ),
                    ]));
                } else {
                    lines.push(Line::from(vec![
                        Span::styled(
                            "   ",
                            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            line.to_string(),
                            Style::default()
                                .fg(text_primary())
                                .bg(user_bg())
                                .add_modifier(Modifier::BOLD),
                        ),
                    ]));
                }
            }
            if text.ends_with('\n') {
                lines.push(Line::from(vec![
                    Span::styled(
                        "   ",
                        Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(
                        " ",
                        Style::default()
                            .fg(text_primary())
                            .bg(user_bg())
                            .add_modifier(Modifier::BOLD),
                    ),
                ]));
            }
        }
        TranscriptEntry::AssistantText { text } => {
            lines.push(Line::from(""));
            lines.extend(markdown::render_markdown(
                text,
                content_width.saturating_sub(2),
            ));
        }
        TranscriptEntry::Thinking { text } => {
            let dim_italic = Style::default()
                .fg(thinking())
                .add_modifier(Modifier::DIM | Modifier::ITALIC);
            if text.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled("reasoning…", dim_italic),
                ]));
            } else {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled("reasoning  ", dim_italic),
                    Span::styled(
                        truncate_str(text, content_width.saturating_sub(14)).to_string(),
                        dim_italic,
                    ),
                ]));
            }
        }
        TranscriptEntry::ToolStart { .. } => {}
        TranscriptEntry::ToolComplete {
            tool,
            content,
            is_error,
            collapsed,
            diff_meta,
        } => {
            let (icon, status_color) = if *is_error {
                ("✗", error())
            } else {
                ("✓", tool_label())
            };

            let tool_display = friendly_tool_display(tool);

            if *collapsed {
                let preview = content.lines().next().unwrap_or("").to_string();
                let line_count = content.lines().count();
                let preview_text = if line_count > 1 {
                    format!(
                        "{}  [+{} more]  ctrl+o to expand",
                        truncate_str(&preview, 45),
                        line_count - 1
                    )
                } else {
                    truncate_str(&preview, 60).to_string()
                };
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(
                        format!("{icon} "),
                        Style::default()
                            .fg(status_color)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(
                        format!("{tool_display} "),
                        Style::default()
                            .fg(status_color)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(preview_text, Style::default().fg(tool_text())),
                ]));
                lines.push(Line::from(""));
            } else {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(
                        format!("{icon} {tool_display}"),
                        Style::default()
                            .fg(status_color)
                            .add_modifier(Modifier::BOLD),
                    ),
                ]));

                let max_lines = 20;
                let total_lines = content.lines().count();

                if let Some(meta) = diff_meta {
                    // Render a unified diff for edit tool results.
                    let old_lines: Vec<&str> = meta.before.lines().collect();
                    let new_lines: Vec<&str> = meta.after.lines().collect();
                    let diff_lines = crate::ui::diff::render_simple_diff(&old_lines, &new_lines, content_width);
                    for (i, line) in diff_lines.into_iter().enumerate() {
                        if i >= max_lines {
                            lines.push(Line::from(vec![
                                Span::styled("    ", Style::default()),
                                Span::styled(
                                    format!("⋯ {} more  ctrl+o to collapse", total_lines.saturating_sub(max_lines)),
                                    Style::default()
                                        .fg(text_muted())
                                        .add_modifier(Modifier::ITALIC),
                                ),
                            ]));
                            break;
                        }
                        lines.push(line);
                    }
                } else if tool == "read" && !content.is_empty() {
                    // Render read tool output with syntax highlighting and line numbers.
                    let rendered = render_read_content(content, content_width);
                    for (i, line) in rendered.into_iter().enumerate() {
                        if i >= max_lines {
                            lines.push(Line::from(vec![
                                Span::styled("    ", Style::default()),
                                Span::styled(
                                    format!("⋯ {} more  ctrl+o to collapse", total_lines - max_lines),
                                    Style::default()
                                        .fg(text_muted())
                                        .add_modifier(Modifier::ITALIC),
                                ),
                            ]));
                            break;
                        }
                        lines.push(line);
                    }
                } else {
                    for (i, line) in content.lines().enumerate() {
                        if i >= max_lines {
                            lines.push(Line::from(vec![
                                Span::styled("    ", Style::default()),
                                Span::styled(
                                    format!("⋯ {} more  ctrl+o to collapse", total_lines - max_lines),
                                    Style::default()
                                        .fg(text_muted())
                                        .add_modifier(Modifier::ITALIC),
                                ),
                            ]));
                            break;
                        }
                        lines.push(Line::from(vec![
                            Span::styled("    ", Style::default()),
                            Span::styled(
                                truncate_str(line, content_width.saturating_sub(4)).to_string(),
                                Style::default().fg(tool_text()),
                            ),
                        ]));
                    }
                }
                lines.push(Line::from(""));
            }
        }
        TranscriptEntry::Error { text } => {
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(
                    "✗ Error",
                    Style::default().fg(error()).add_modifier(Modifier::BOLD),
                ),
            ]));

            let wrapped = wrap_text_to_width(text, content_width.saturating_sub(4));
            for line in wrapped {
                lines.push(Line::from(vec![
                    Span::styled("    ", Style::default()),
                    Span::styled(line, Style::default().fg(error())),
                ]));
            }
            lines.push(Line::from(""));
        }
        TranscriptEntry::Separator => {
            let width = content_width.min(60);
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled("─".repeat(width), Style::default().fg(border_idle())),
            ]));
        }
    }

    lines
}

fn friendly_tool_display(tool: &str) -> String {
    match tool {
        "model" => "thinking".to_string(),
        "read" => "read".to_string(),
        "write" => "write".to_string(),
        "edit" => "edit".to_string(),
        "bash" => "bash".to_string(),
        "grep" => "grep".to_string(),
        "glob" => "glob".to_string(),
        "web_search" => "search".to_string(),
        "ls" => "ls".to_string(),
        "delegate_to_agent" => "agent".to_string(),
        _ => tool.to_string(),
    }
}

/// Try to guess a language from file content heuristics.
fn detect_lang_from_content(content: &str) -> Option<&str> {
    let first = content.lines().next()?;
    // Shebang detection
    if first.starts_with("#!/usr/bin/env python") || first.starts_with("#!/usr/bin/python") {
        return Some("python");
    }
    if first.starts_with("#!/bin/bash") || first.starts_with("#!/bin/sh") || first.starts_with("#!/usr/bin/env bash") {
        return Some("bash");
    }
    if first.starts_with("#!/usr/bin/env node") {
        return Some("javascript");
    }
    if first.starts_with("#!/usr/bin/env ruby") {
        return Some("ruby");
    }
    if first.starts_with("#!/usr/bin/env lua") {
        return Some("lua");
    }
    // Common header patterns
    if content.contains("package main") && content.contains("func ") {
        return Some("go");
    }
    if content.contains("fn main()") && content.contains("use std::") {
        return Some("rust");
    }
    if content.contains("import ") && content.contains("from ") && content.contains("def ") {
        return Some("python");
    }
    None
}

/// Render a `read` tool's file content with syntax highlighting and styled line numbers.
fn render_read_content(content: &str, content_width: usize) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let max_width = content_width.saturating_sub(6); // 4 indent + line number gutter

    // Try to detect language from content.
    let lang = detect_lang_from_content(content);
    let highlighted = lang.and_then(|l| highlight_code_block(l, content));

    // Build a map: line index -> Vec<Span> for highlighted content.
    let highlighted_lines: Option<Vec<Vec<Span<'static>>>> = highlighted.map(|hl| {
        hl.into_iter()
            .map(|(_no, spans)| spans)
            .collect()
    });

    for (i, raw) in content.lines().enumerate() {
        // Parse "123: content" line-number prefix from read tool output.
        let (num_str, body) = if let Some(pos) = raw.find(": ") {
            let num_part = &raw[..pos];
            if num_part.chars().all(|c| c.is_ascii_digit()) {
                (Some(num_part), &raw[pos + 2..])
            } else {
                (None, raw)
            }
        } else {
            (None, raw)
        };

        let mut spans: Vec<Span<'static>> = vec![Span::styled("    ", Style::default())];

        if let Some(num) = num_str {
            // Right-align line numbers in a 5-char gutter.
            let gutter = format!("{:>4} ", num);
            spans.push(Span::styled(
                gutter,
                Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
            ));

            if let Some(ref hl) = highlighted_lines {
                if let Some(line_spans) = hl.get(i) {
                    // Truncate spans to fit max_width while preserving styles.
                    let mut col = 0;
                    for span in line_spans {
                        let text = span.content.to_string();
                        let text_width = text.chars().count();
                        if col + text_width > max_width {
                            let take = max_width.saturating_sub(col);
                            let trimmed: String = text.chars().take(take).collect();
                            if !trimmed.is_empty() {
                                spans.push(Span::styled(trimmed, span.style));
                            }
                            break;
                        }
                        spans.push(span.clone());
                        col += text_width;
                    }
                } else {
                    spans.push(Span::styled(
                        truncate_str(body, max_width).to_string(),
                        Style::default().fg(tool_text()),
                    ));
                }
            } else {
                spans.push(Span::styled(
                    truncate_str(body, max_width).to_string(),
                    Style::default().fg(tool_text()),
                ));
            }
        } else {
            spans.push(Span::styled(
                truncate_str(raw, max_width + 5).to_string(),
                Style::default().fg(tool_text()),
            ));
        }
        lines.push(Line::from(spans));
    }
    lines
}

pub fn render_footer(
    frame: &mut Frame,
    area: Rect,
    app: &TuiApp,
    config: &CliConfig,
    settings: &StoredSettings,
    session_name: Option<&str>,
) {
    let eff = effective_settings(config, settings);
    let provider = eff.provider.unwrap_or_else(|| "?".into());
    let model = eff.model_id.unwrap_or_else(|| "?".into());
    let mode = &app.current_mode;

    let cost = estimate_cost(
        &provider,
        &model,
        app.tokens_in,
        app.tokens_out,
        app.tokens_cache_read,
        app.tokens_cache_write,
    );
    let cost_str = format_cost(cost);

    let cwd_display = {
        let path = config.cwd.display().to_string();
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() > 2 {
            format!("…/{}", parts[parts.len() - 2..].join("/"))
        } else {
            path
        }
    };

    let mode_label = if app.has_pending_question() {
        "question"
    } else if mode == "auto" {
        "auto"
    } else {
        mode.as_str()
    };

    let dim = Style::default().fg(footer_text()).add_modifier(Modifier::DIM);
    let sep = Span::styled("  ·  ", dim);

    let mut left: Vec<Span<'static>> = vec![
        Span::styled(" ", dim),
        Span::styled(cwd_display, dim),
        sep.clone(),
        Span::styled(mode_label.to_string(), dim),
    ];
    if let Some(name) = session_name {
        left.push(sep.clone());
        left.push(Span::styled(name.to_string(), dim));
    }

    let model_label = format!("{}/{}", provider, model);
    let tokens_label = format!(
        "in {} · out {}",
        format_tokens(app.tokens_in),
        format_tokens(app.tokens_out)
    );
    let cost_label = cost_str.clone();

    // Context usage — prompt tokens from the most recent turn against the
    // model's window. Skip when we don't have a window (unknown model) or
    // no turn has happened yet.
    let window = context_window_for(&provider, &model);
    let context_label = if window > 0 && app.turn_tokens_in > 0 {
        let used = app.turn_tokens_in.min(window);
        let pct = (used as f64 / window as f64 * 100.0).round() as u64;
        Some(format!(
            "{}/{} · {}%",
            format_tokens(used),
            format_tokens(window),
            pct.min(100)
        ))
    } else {
        None
    };

    let width = area.width as usize;
    let left_width: usize = left.iter().map(|s| s.content.chars().count()).sum();

    // Pick the richest right-side content that still fits.
    let full_right = match &context_label {
        Some(ctx) => format!(
            " {}  ·  {}  ·  {}  ·  {} ",
            model_label, ctx, tokens_label, cost_label
        ),
        None => format!(" {}  ·  {}  ·  {} ", model_label, tokens_label, cost_label),
    };
    let mid_right = match &context_label {
        Some(ctx) => format!(" {}  ·  {}  ·  {} ", model_label, ctx, cost_label),
        None => format!(" {}  ·  {} ", model_label, cost_label),
    };
    let context_right = match &context_label {
        Some(ctx) => format!(" {}  ·  {} ", model_label, ctx),
        None => format!(" {} ", model_label),
    };
    let slim_right = format!(" {} ", model_label);

    let right_text = if left_width + full_right.chars().count() <= width {
        full_right
    } else if left_width + mid_right.chars().count() <= width {
        mid_right
    } else if left_width + context_right.chars().count() <= width {
        context_right
    } else if left_width + slim_right.chars().count() <= width {
        slim_right
    } else {
        String::new()
    };

    let right_width = right_text.chars().count();
    let pad = width.saturating_sub(left_width + right_width);

    let mut spans = left;
    spans.push(Span::styled(" ".repeat(pad), dim));
    spans.push(Span::styled(right_text, dim));

    let footer = Paragraph::new(Line::from(spans));
    frame.render_widget(footer, area);
}

// ── Settings overlay ─────────────────────────────────────────────────
//
// Single flat renderer covering both browsing and picker-open states.
// Rows: provider · model · auth (api key field or login action). When a
// picker is open, a list panel replaces the content below the rule.

pub fn render_settings_overlay(
    frame: &mut Frame,
    app: &TuiApp,
    settings: &StoredSettings,
) {
    let area = frame.area();

    let provider_id = settings.provider.clone().unwrap_or_default();
    let provider_name = provider_catalog()
        .iter()
        .find(|p| p.id == provider_id)
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "(none)".into());
    let model_id = settings.model_id.clone().unwrap_or_default();
    let model_name = models_for_provider(&provider_id)
        .into_iter()
        .find(|(id, _)| id == &model_id)
        .map(|(_, name)| name)
        .unwrap_or_else(|| "(none)".into());

    let is_oauth = is_oauth_provider(&provider_id);

    // Lay out content then size the panel to fit it.
    let dim = Style::default().fg(text_muted()).add_modifier(Modifier::DIM);
    let bold_accent = Style::default().fg(accent()).add_modifier(Modifier::BOLD);

    match app.settings.picker {
        Some(SettingsPicker::Provider) => render_settings_picker(
            frame,
            area,
            "choose provider",
            &provider_picker_items(settings),
            app.settings.picker_index,
            &provider_id,
        ),
        Some(SettingsPicker::Model) => render_settings_picker(
            frame,
            area,
            "choose model",
            &model_picker_items(&provider_id),
            app.settings.picker_index,
            &model_id,
        ),
        None => {
            // ── Browsing view ──
            let focus = app.settings.focus;
            let mut lines: Vec<Line<'static>> = Vec::new();
            lines.push(Line::from(vec![
                Span::raw(" "),
                Span::styled("settings", bold_accent),
            ]));

            let width = area.width.min(64);
            let height = 10u16;
            let rect = Rect {
                x: area.x + (area.width.saturating_sub(width)) / 2,
                y: area.y + (area.height.saturating_sub(height)) / 2,
                width,
                height,
            };

            lines.push(Line::from(Span::styled(
                "─".repeat(rect.width as usize),
                Style::default().fg(border_idle()).add_modifier(Modifier::DIM),
            )));
            lines.push(Line::from(""));

            lines.push(settings_value_row(
                "provider",
                &provider_name,
                focus == SettingsFocus::Provider,
                Some("enter to choose"),
            ));
            lines.push(settings_value_row(
                "model",
                &model_name,
                focus == SettingsFocus::Model,
                Some("enter to choose"),
            ));

            // Auth row: adapts to the provider type.
            let active = focus == SettingsFocus::Auth;
            if is_oauth {
                let signed_in = oauth_signed_in(&provider_id);
                let value = if signed_in {
                    "signed in"
                } else {
                    "not signed in"
                };
                let hint = if signed_in {
                    "enter to sign in again"
                } else {
                    "enter to sign in"
                };
                lines.push(settings_value_row("auth", value, active, Some(hint)));
            } else {
                let masked = mask_api_key(&app.settings.api_key_buffer);
                let display = if app.settings.api_key_buffer.is_empty() {
                    "(type your key)".to_string()
                } else {
                    masked
                };
                let hint = if active {
                    "type to edit · enter to save"
                } else {
                    "enter to edit"
                };
                lines.push(settings_value_row("api key", &display, active, Some(hint)));
            }

            lines.push(Line::from(""));

            // Status line — does this provider/model combo work?
            lines.push(settings_status_line(settings, &provider_id));

            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                "  ↑↓ move · enter activate · esc close",
                dim,
            )));

            frame.render_widget(Clear, rect);
            frame.render_widget(Paragraph::new(lines), rect);

            // Position the terminal cursor inside the api-key field when
            // editing, so typed characters feel like they're going into it.
            if active && !is_oauth {
                // Row 5 = header(0) + rule(1) + blank(2) + provider(3) + model(4) + auth(5)
                // Column: "  api key    " = 2 + 7 + 4 = 13 cols of label+gap.
                let label_cols = 13u16;
                let cursor_x = rect.x
                    + label_cols
                    + (app.settings.api_key_cursor as u16)
                        .min(rect.width.saturating_sub(label_cols + 1));
                let cursor_y = rect.y + 5;
                frame.set_cursor_position((cursor_x, cursor_y));
            }
        }
    }
}

/// One label/value row in the browsing view. When `active`, the row is
/// prefixed with `❯ ` and the label is bolded; otherwise it sits dim.
fn settings_value_row(
    label: &str,
    value: &str,
    active: bool,
    hint: Option<&str>,
) -> Line<'static> {
    let marker = if active {
        Span::styled(
            " ❯ ",
            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::raw("   ")
    };
    let label_style = if active {
        Style::default().fg(accent()).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(text_dim())
    };
    let mut spans = vec![
        marker,
        Span::styled(format!("{:<9}", label), label_style),
        Span::styled(value.to_string(), Style::default().fg(text_primary())),
    ];
    if active {
        if let Some(h) = hint {
            spans.push(Span::styled(
                format!("   {}", h),
                Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
            ));
        }
    }
    Line::from(spans)
}

/// Short line summarising whether the current provider/model is ready to use.
fn settings_status_line(settings: &StoredSettings, provider_id: &str) -> Line<'static> {
    let ok_style = Style::default()
        .fg(tool_label())
        .add_modifier(Modifier::BOLD);
    let warn_style = Style::default()
        .fg(thinking())
        .add_modifier(Modifier::BOLD);
    let bad_style = Style::default().fg(error()).add_modifier(Modifier::BOLD);

    if provider_id.is_empty() {
        return Line::from(vec![
            Span::raw("  "),
            Span::styled("✗ ", bad_style),
            Span::styled("no provider selected", Style::default().fg(error())),
        ]);
    }

    if is_oauth_provider(provider_id) {
        if oauth_signed_in(provider_id) {
            Line::from(vec![
                Span::raw("  "),
                Span::styled("✓ ", ok_style),
                Span::styled("ready", Style::default().fg(tool_label())),
            ])
        } else {
            Line::from(vec![
                Span::raw("  "),
                Span::styled("! ", warn_style),
                Span::styled(
                    "sign-in required",
                    Style::default().fg(thinking()),
                ),
            ])
        }
    } else if settings.get_api_key_for(provider_id).is_some() {
        Line::from(vec![
            Span::raw("  "),
            Span::styled("✓ ", ok_style),
            Span::styled("ready", Style::default().fg(tool_label())),
        ])
    } else {
        Line::from(vec![
            Span::raw("  "),
            Span::styled("! ", warn_style),
            Span::styled(
                "api key missing",
                Style::default().fg(thinking()),
            ),
        ])
    }
}

/// Replace all characters except the last four with '•'. Used for in-place
/// masking of the saved key when the auth row isn't focused.
fn mask_api_key(key: &str) -> String {
    let len = key.chars().count();
    if len == 0 {
        return String::new();
    }
    if len <= 4 {
        return "•".repeat(len);
    }
    let tail: String = key.chars().skip(len - 4).collect();
    format!("{}{}", "•".repeat(len - 4), tail)
}

fn oauth_signed_in(provider_id: &str) -> bool {
    match provider_id {
        "github-copilot" => {
            khadim_ai_core::oauth::has_copilot_auth_sync().unwrap_or(false)
        }
        "openai-codex" => {
            khadim_ai_core::oauth::has_openai_codex_auth_sync().unwrap_or(false)
        }
        _ => false,
    }
}

/// (display_name, id, status_label) for the provider picker.
fn provider_picker_items(settings: &StoredSettings) -> Vec<(String, String, String)> {
    provider_catalog()
        .into_iter()
        .map(|p| {
            let status = if is_oauth_provider(&p.id) {
                if oauth_signed_in(&p.id) {
                    "signed in".to_string()
                } else {
                    "login required".to_string()
                }
            } else if settings.get_api_key_for(&p.id).is_some() {
                "configured".to_string()
            } else {
                "missing key".to_string()
            };
            (p.name, p.id, status)
        })
        .collect()
}

fn model_picker_items(provider_id: &str) -> Vec<(String, String, String)> {
    models_for_provider(provider_id)
        .into_iter()
        .map(|(id, name)| (name, id, String::new()))
        .collect()
}

/// Shared picker renderer for both provider and model selection.
fn render_settings_picker(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    items: &[(String, String, String)],
    selected_index: usize,
    current_id: &str,
) {
    let max_visible = 10usize;
    let visible_count = items.len().min(max_visible).max(1);
    // title + rule + items + blank + hint
    let height = (visible_count + 4) as u16;
    let width = area.width.min(60);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let half = max_visible / 2;
    let start = if items.len() <= max_visible || selected_index < half {
        0
    } else if selected_index + half >= items.len() {
        items.len().saturating_sub(max_visible)
    } else {
        selected_index - half
    };
    let end = (start + max_visible).min(items.len());

    let dim = Style::default().fg(text_muted()).add_modifier(Modifier::DIM);
    let bold_accent = Style::default().fg(accent()).add_modifier(Modifier::BOLD);

    let mut lines: Vec<Line<'static>> = Vec::new();
    lines.push(Line::from(vec![
        Span::raw(" "),
        Span::styled(title.to_string(), bold_accent),
    ]));
    lines.push(Line::from(Span::styled(
        "─".repeat(rect.width as usize),
        Style::default().fg(border_idle()).add_modifier(Modifier::DIM),
    )));

    for i in start..end {
        let (name, id, status) = &items[i];
        let is_selected = i == selected_index;
        let is_current = id == current_id;

        let marker = if is_selected {
            Span::styled(" ❯ ", bold_accent)
        } else {
            Span::raw("   ")
        };
        let current_mark = if is_current {
            Span::styled(
                "✓ ",
                Style::default()
                    .fg(tool_label())
                    .add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        let name_style = if is_selected {
            bold_accent
        } else {
            Style::default().fg(text_primary())
        };
        let mut spans = vec![
            marker,
            current_mark,
            Span::styled(name.clone(), name_style),
        ];
        if !status.is_empty() {
            spans.push(Span::styled(format!("  {}", status), dim));
        }
        lines.push(Line::from(spans));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑↓ move · enter select · esc cancel",
        dim,
    )));

    frame.render_widget(Paragraph::new(lines), rect);
}

pub fn render_login_overlay(frame: &mut Frame, app: &TuiApp) {
    let area = frame.area();
    let login = match &app.login_state {
        Some(l) => l,
        None => return,
    };

    let dim = Style::default().fg(text_muted()).add_modifier(Modifier::DIM);
    let bold_accent = Style::default().fg(accent()).add_modifier(Modifier::BOLD);

    match login.phase {
        LoginPhase::SelectProvider => {
            let item_count = login.providers.len().max(1);
            // title + rule + items + blank + hint
            let height = (item_count + 4) as u16;
            let width = area.width.min(56);
            let rect = Rect {
                x: area.x + (area.width.saturating_sub(width)) / 2,
                y: area.y + (area.height.saturating_sub(height)) / 2,
                width,
                height,
            };
            frame.render_widget(Clear, rect);

            let mut lines: Vec<Line<'static>> = Vec::new();
            lines.push(Line::from(vec![
                Span::raw(" "),
                Span::styled("sign in", bold_accent),
            ]));
            lines.push(Line::from(Span::styled(
                "─".repeat(rect.width as usize),
                Style::default().fg(border_idle()).add_modifier(Modifier::DIM),
            )));

            for (i, provider) in login.providers.iter().enumerate() {
                let is_selected = i == login.selected_index;
                let marker = if is_selected {
                    Span::styled(" ❯ ", bold_accent)
                } else {
                    Span::raw("   ")
                };
                let name_style = if is_selected {
                    bold_accent
                } else {
                    Style::default().fg(text_primary())
                };
                let mut spans = vec![marker, Span::styled(provider.name.clone(), name_style)];
                if provider.logged_in {
                    spans.push(Span::styled(
                        "  signed in",
                        Style::default()
                            .fg(tool_label())
                            .add_modifier(Modifier::DIM),
                    ));
                }
                lines.push(Line::from(spans));
            }

            if login.providers.is_empty() {
                lines.push(Line::from(Span::styled(
                    "    no oauth providers available",
                    dim,
                )));
            }

            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                "  ↑↓ move · enter select · esc cancel",
                dim,
            )));

            frame.render_widget(Paragraph::new(lines), rect);
        }
        LoginPhase::InProgress => {
            let msg_count = login.messages.len();
            let has_url = login.url.is_some();
            let has_code = login.device_code.is_some();
            let extra_lines = if has_url { 3 } else { 0 } + if has_code { 2 } else { 0 };
            // title + rule + body
            let height = (msg_count + extra_lines + 5) as u16;
            let width = area.width.min(64);
            let rect = Rect {
                x: area.x + (area.width.saturating_sub(width)) / 2,
                y: area.y + (area.height.saturating_sub(height)) / 2,
                width,
                height,
            };
            frame.render_widget(Clear, rect);

            let mut lines: Vec<Line<'static>> = Vec::new();
            lines.push(Line::from(vec![
                Span::raw(" "),
                Span::styled("signing in", bold_accent),
            ]));
            lines.push(Line::from(Span::styled(
                "─".repeat(rect.width as usize),
                Style::default().fg(border_idle()).add_modifier(Modifier::DIM),
            )));

            if let Some(ref url) = login.url {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(url.clone(), Style::default().fg(accent())),
                ]));
                let click_hint = if cfg!(target_os = "macos") {
                    "cmd+click to open"
                } else {
                    "ctrl+click to open (auto-opened)"
                };
                lines.push(Line::from(Span::styled(
                    format!("  {click_hint}"),
                    dim,
                )));
                lines.push(Line::from(""));
            }

            if let Some(ref code) = login.device_code {
                lines.push(Line::from(vec![
                    Span::styled("  code  ", dim),
                    Span::styled(
                        code.clone(),
                        Style::default()
                            .fg(text_primary())
                            .add_modifier(Modifier::BOLD),
                    ),
                ]));
                lines.push(Line::from(""));
            }

            for msg in &login.messages {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(msg.clone(), dim),
                ]));
            }

            let spinner = spinner_frame(app.tick_count);
            lines.push(Line::from(""));
            let mut pending_spans: Vec<Span<'static>> = vec![Span::styled(
                format!("  {spinner} "),
                Style::default().fg(thinking()).add_modifier(Modifier::BOLD),
            )];
            pending_spans.extend(shimmer_spans("waiting", app.tick_count, thinking()));
            pending_spans.push(Span::styled("  ·  esc to cancel", dim));
            lines.push(Line::from(pending_spans));

            frame.render_widget(Paragraph::new(lines), rect);
        }
    }
}

pub fn render_command_preview(frame: &mut Frame, app: &TuiApp, input_area: Rect) {
    let commands = app.filtered_commands();
    if commands.is_empty() {
        return;
    }

    let item_count = commands.len();
    let max_visible = 10usize;
    let visible_count = item_count.min(max_visible);
    // No border. Rows: items + (1 scroll indicator if needed).
    let needs_indicator = item_count > max_visible;
    let height = (visible_count + if needs_indicator { 1 } else { 0 }).clamp(1, 12) as u16;
    let available_above = input_area.y;
    let actual_height = height.min(available_above);
    let width = input_area.width.min(60);

    let rect = Rect {
        x: input_area.x,
        y: input_area.y.saturating_sub(actual_height),
        width,
        height: actual_height,
    };
    frame.render_widget(Clear, rect);

    let selected = app.command_preview_index;
    let half = max_visible / 2;
    let start = if item_count <= max_visible || selected < half {
        0
    } else if selected + half >= item_count {
        item_count.saturating_sub(max_visible)
    } else {
        selected - half
    };
    let end = (start + max_visible).min(item_count);

    let mut lines: Vec<Line<'static>> = Vec::new();

    for i in start..end {
        let cmd = &commands[i];
        let is_selected = i == selected;
        let name_style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(text_primary())
        };
        let desc_style = Style::default()
            .fg(text_muted())
            .add_modifier(Modifier::DIM);
        let marker = if is_selected {
            Span::styled(
                "❯ ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        lines.push(Line::from(vec![
            marker,
            Span::styled(format!("{:<15}", cmd.name), name_style),
            Span::styled(" ", Style::default()),
            Span::styled(cmd.description.to_string(), desc_style),
        ]));
    }

    if needs_indicator {
        lines.push(Line::from(Span::styled(
            format!("  {} of {}", selected + 1, item_count),
            Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
        )));
    }

    frame.render_widget(Paragraph::new(lines), rect);
}

pub fn render_command_picker(frame: &mut Frame, app: &TuiApp) {
    let picker = match &app.command_picker {
        Some(p) => p,
        None => return,
    };

    let area = frame.area();
    let title = match picker.kind {
        CommandPickerKind::Provider => "provider",
        CommandPickerKind::Model => "model",
        CommandPickerKind::Theme => "theme",
        CommandPickerKind::Session => "session",
    };

    let max_visible = 10usize;
    let item_count = picker.items.len();
    let visible_count = item_count.min(max_visible).max(1);
    // title + rule + items + blank + hint = visible_count + 4
    let height = (visible_count + 4) as u16;
    let width = area.width.min(60);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let half = max_visible / 2;
    let start = if item_count <= max_visible || picker.selected_index < half {
        0
    } else if picker.selected_index + half >= item_count {
        item_count.saturating_sub(max_visible)
    } else {
        picker.selected_index - half
    };
    let end = (start + max_visible).min(item_count);

    let mut lines: Vec<Line<'static>> = Vec::new();
    lines.push(Line::from(vec![
        Span::raw(" "),
        Span::styled(
            title.to_string(),
            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
        ),
    ]));
    lines.push(Line::from(Span::styled(
        "─".repeat(rect.width as usize),
        Style::default().fg(border_idle()).add_modifier(Modifier::DIM),
    )));

    for i in start..end {
        let (_id, name, status) = &picker.items[i];
        let is_selected = i == picker.selected_index;
        let is_current = i == picker.current_index;

        let marker = if is_selected {
            Span::styled(
                " ❯ ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("   ")
        };
        let current_mark = if is_current {
            Span::styled(
                "✓ ",
                Style::default()
                    .fg(tool_label())
                    .add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        let name_style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(text_primary())
        };

        let mut spans = vec![marker, current_mark, Span::styled(name.clone(), name_style)];
        if !status.is_empty() {
            spans.push(Span::styled(
                format!("  {}", status),
                Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
            ));
        }
        lines.push(Line::from(spans));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑↓ move · enter select · esc cancel",
        Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
    )));

    frame.render_widget(Paragraph::new(lines), rect);
}

/// Render a question overlay at the bottom of the transcript area.
/// Shows the current question, options (if any), and answer hints.
pub fn render_question_overlay(frame: &mut Frame, app: &TuiApp, transcript_area: Rect) {
    let Some(ref state) = app.pending_question else { return };
    let Some(q) = state.current_question() else { return };

    let mut lines: Vec<Line<'static>> = Vec::new();

    // Header showing progress
    let progress = format!(
        "  Question {}/{} ",
        state.current_idx + 1,
        state.request.questions.len()
    );
    lines.push(Line::from(Span::styled(
        progress,
        Style::default().fg(accent()).add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::from(""));

    // Question text
    let question_lines = wrap_text_to_width(&q.question, transcript_area.width.saturating_sub(4) as usize);
    for line in question_lines {
        lines.push(Line::from(Span::styled(
            format!("  {}", line),
            Style::default().fg(text_primary()),
        )));
    }

    // Options
    if let Some(ref options) = q.options {
        lines.push(Line::from(""));
        for (i, opt) in options.iter().enumerate() {
            let opt_text = format!(
                "  {}. {}{}",
                i + 1,
                opt.label,
                opt.description.as_deref().map(|d| format!(" — {}", d)).unwrap_or_default()
            );
            lines.push(Line::from(Span::styled(
                opt_text,
                Style::default().fg(text_dim()),
            )));
        }
        if q.allow_other {
            lines.push(Line::from(Span::styled(
                "  0. Other (type your own answer)",
                Style::default().fg(text_muted()),
            )));
        }
    }

    // Hints
    lines.push(Line::from(""));
    if q.secret {
        lines.push(Line::from(Span::styled(
            "  Type your answer (hidden) · enter to submit · esc to skip",
            Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
        )));
    } else {
        lines.push(Line::from(Span::styled(
            "  Type your answer · enter to submit · esc to skip",
            Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
        )));
    }

    let content_height = lines.len() as u16;
    let overlay_height = content_height.min(transcript_area.height.saturating_sub(2)).max(6);
    let overlay_y = transcript_area.y + transcript_area.height - overlay_height - 1;

    let overlay_rect = Rect {
        x: transcript_area.x + 1,
        y: overlay_y,
        width: transcript_area.width.saturating_sub(2),
        height: overlay_height,
    };

    // Clear background
    frame.render_widget(Clear, overlay_rect);

    // Border block
    let border_style = Style::default().fg(accent());
    let block = ratatui::widgets::Block::default()
        .borders(ratatui::widgets::Borders::ALL)
        .border_style(border_style)
        .title(Span::styled(" 🤔 Question ", border_style));

    let inner = block.inner(overlay_rect);
    frame.render_widget(block, overlay_rect);

    let paragraph = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .style(Style::default().fg(text_primary()));
    frame.render_widget(paragraph, inner);
}

pub fn render(
    frame: &mut Frame,
    app: &TuiApp,
    config: &CliConfig,
    settings: &StoredSettings,
    session_name: Option<&str>,
) {
    let area = frame.area();

    // Composer layout: a 1-line dim rule + N lines of wrapped input.
    // Left gutter is 2 cols (❯ + space) so the effective text width is area - 2.
    const COMPOSER_GUTTER: u16 = 2;
    let input_inner_width = area.width.saturating_sub(COMPOSER_GUTTER) as usize;
    let input_text_lines = count_wrapped_lines(&app.input, input_inner_width);
    let input_text_height = input_text_lines.clamp(3, 16);
    // Cap composer height so the transcript area always gets at least
    // its minimum 4 rows + 1 footer row, preventing content from
    // spilling under the input area.
    let max_composer = area.height.saturating_sub(5);
    let composer_height = (1 + input_text_height).min(max_composer).max(4);

    let (cursor_row, _) = cursor_to_row_col(&app.input, app.cursor, input_inner_width);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(4),
            Constraint::Length(composer_height),
            Constraint::Length(1),
        ])
        .split(area);

    let transcript_area = chunks[0];
    let composer_area = chunks[1];
    let footer_area = chunks[2];

    // Split composer into separator rule and text area.
    let separator_area = Rect {
        x: composer_area.x,
        y: composer_area.y,
        width: composer_area.width,
        height: 1,
    };
    // Clamp input area height to the composer's remaining space so
    // the input never renders past the composer's bottom edge.
    let actual_input_height = (composer_area.height.saturating_sub(1)).min(input_text_height);
    let input_area = Rect {
        x: composer_area.x,
        y: composer_area.y + 1,
        width: composer_area.width,
        height: actual_input_height,
    };
    // Recalculate input scroll for the actual (possibly clamped) height.
    let max_input_scroll = input_text_lines.saturating_sub(actual_input_height);
    let input_scroll = if cursor_row >= actual_input_height {
        (cursor_row - actual_input_height + 1).min(max_input_scroll)
    } else {
        0
    };

    // ── Transcript ───────────────────────────────────────────────
    // Leave a 1-col right gutter for the scrollbar so text doesn't collide with it.
    let transcript_content_width = transcript_area.width.saturating_sub(1);
    let visible_height = transcript_area.height as usize;
    let (visible_lines, total_lines, scroll, buffer) =
        render_transcript_viewport(app, transcript_content_width, visible_height);

    app.content_lines.set(total_lines);
    app.visible_height.set(visible_height);

    let paragraph_scroll_y = if scroll >= buffer {
        buffer as u16
    } else {
        scroll as u16
    };

    let transcript_content_area = Rect {
        x: transcript_area.x,
        y: transcript_area.y,
        width: transcript_content_width,
        height: transcript_area.height,
    };
    let transcript = Paragraph::new(visible_lines)
        .scroll((paragraph_scroll_y, 0));
    frame.render_widget(transcript, transcript_content_area);

    // Scrollbar
    if total_lines > visible_height {
        let max_scroll = total_lines.saturating_sub(visible_height);
        let mut scrollbar_state = ScrollbarState::new(max_scroll).position(scroll);
        let scrollbar = Scrollbar::new(ScrollbarOrientation::VerticalRight)
            .begin_symbol(None)
            .end_symbol(None)
            .track_symbol(Some(" "))
            .thumb_symbol("┃")
            .track_style(Style::default().fg(border_idle()))
            .thumb_style(Style::default().fg(accent_dim()));
        let scrollbar_area = Rect {
            x: transcript_area.x + transcript_area.width - 1,
            y: transcript_area.y,
            width: 1,
            height: visible_height as u16,
        };
        frame.render_stateful_widget(scrollbar, scrollbar_area, &mut scrollbar_state);
    }

    // ── Composer separator (dim horizontal rule) ─────────────────
    let rule_color = if app.pending {
        thinking()
    } else if app.status == "error" || app.status == "aborted" {
        border_error()
    } else {
        border_idle()
    };
    let rule = Paragraph::new(Line::from(Span::styled(
        "─".repeat(separator_area.width as usize),
        Style::default().fg(rule_color).add_modifier(Modifier::DIM),
    )));
    frame.render_widget(rule, separator_area);

    // ── Composer body ────────────────────────────────────────────
    if app.pending && !app.has_pending_question() {
        let spinner = spinner_frame(app.tick_count);
        let mut spans: Vec<Span<'static>> = vec![
            Span::styled("  ", Style::default()),
            Span::styled(
                format!("{} ", spinner),
                Style::default()
                    .fg(thinking())
                    .add_modifier(Modifier::BOLD),
            ),
        ];
        spans.extend(shimmer_spans("thinking…", app.tick_count, thinking()));
        spans.push(Span::styled(
            "  ·  esc to abort",
            Style::default().fg(text_muted()).add_modifier(Modifier::DIM),
        ));
        let status = Paragraph::new(Line::from(spans));
        frame.render_widget(status, input_area);
    } else {
        let prompt_color = if app.status == "error" || app.status == "aborted" {
            border_error()
        } else {
            accent()
        };

        // Render the ❯ gutter as a column next to the textarea.
        let gutter_area = Rect {
            x: input_area.x,
            y: input_area.y,
            width: COMPOSER_GUTTER,
            height: input_area.height,
        };
        let text_area = Rect {
            x: input_area.x + COMPOSER_GUTTER,
            y: input_area.y,
            width: input_area.width.saturating_sub(COMPOSER_GUTTER),
            height: input_area.height,
        };

        let gutter_lines: Vec<Line<'static>> = (0..input_area.height)
            .map(|row| {
                if row == 0 {
                    Line::from(Span::styled(
                        "❯ ",
                        Style::default()
                            .fg(prompt_color)
                            .add_modifier(Modifier::BOLD),
                    ))
                } else {
                    Line::from("  ")
                }
            })
            .collect();
        let gutter = Paragraph::new(gutter_lines);
        frame.render_widget(gutter, gutter_area);

        let wrapped_input: Vec<Line> = hard_wrap_lines(&app.input, input_inner_width)
            .into_iter()
            .map(Line::from)
            .collect();
        let input_widget = Paragraph::new(wrapped_input)
            .style(Style::default().fg(text_primary()))
            .scroll((input_scroll, 0));
        frame.render_widget(input_widget, text_area);

        if !app.settings_open {
            let (cur_row, cur_col) =
                cursor_to_row_col(&app.input, app.cursor, input_inner_width);
            frame.set_cursor_position((
                text_area.x + cur_col,
                text_area.y + cur_row - input_scroll,
            ));
        }
    }

    // ── Footer ───────────────────────────────────────────────────
    render_footer(frame, footer_area, app, config, settings, session_name);

    // ── Settings overlay ─────────────────────────────────────────
    if app.settings_open {
        render_settings_overlay(frame, app, settings);
    }

    // ── Login overlay ────────────────────────────────────────────
    if app.login_state.is_some() {
        render_login_overlay(frame, app);
    }

    // ── Question overlay ───────────────────────────────────────
    if app.has_pending_question() {
        render_question_overlay(frame, app, transcript_area);
    }

    // ── Command picker overlay ──────────────────────────────────
    if app.command_picker.is_some() {
        render_command_picker(frame, app);
    }

    // ── Slash command preview ───────────────────────────────────
    if app.slash_preview_visible() && !app.filtered_commands().is_empty() {
        render_command_preview(frame, app, input_area);
    }
}
