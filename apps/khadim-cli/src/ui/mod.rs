pub mod helpers;
pub mod markdown;
pub mod table;
pub mod theme;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Block, Borders, Clear, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState, Wrap,
};
use ratatui::Frame;

use crate::app::{spinner_frame, CachedTranscriptEntryRender, TranscriptEntryStamp, TuiApp};
use crate::args::CliConfig;
use crate::domain::commands::CommandPickerKind;
use crate::domain::login::LoginPhase;
use crate::domain::models::ProviderCatalog;
use crate::domain::settings::{SettingsFocus, SettingsMode, StoredSettings};
use crate::domain::transcript::TranscriptEntry;
use crate::services::catalog_service::{
    clamp_index, estimate_cost, format_cost, format_tokens, models_for_provider, provider_catalog,
};
use crate::services::settings_service::effective_settings;
use crate::ui::helpers::{
    count_wrapped_lines, cursor_to_row_col, truncate_str, wrap_text_to_width,
};
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
    let content_width = width.saturating_sub(2) as usize;
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
            lines.push(Line::from(vec![
                Span::styled(
                    "  ℹ ",
                    Style::default()
                        .fg(system_text())
                        .add_modifier(Modifier::DIM),
                ),
                Span::styled(text.clone(), Style::default().fg(system_text())),
            ]));
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
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(
                    if text.is_empty() {
                        "💭 Thinking...".to_string()
                    } else {
                        format!("💭 Thinking: {}", truncate_str(text, 60))
                    },
                    Style::default()
                        .fg(thinking())
                        .add_modifier(Modifier::ITALIC),
                ),
            ]));
        }
        TranscriptEntry::ToolStart { .. } => {}
        TranscriptEntry::ToolComplete {
            tool,
            content,
            is_error,
            collapsed,
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
                lines.push(Line::from(""));
            }
        }
        TranscriptEntry::Error { text } => {
            let box_width = content_width.min(76);
            let inner_width = box_width.saturating_sub(4);

            // Top border: ┌─ ERROR ─────────────────────────┐
            let label = " ERROR ";
            let border_len = box_width.saturating_sub(label.len() + 2);
            let left_border = "─".repeat(border_len / 2);
            let right_border = "─".repeat(border_len - border_len / 2);
            lines.push(Line::from(vec![
                Span::styled("  ┌", Style::default().fg(error())),
                Span::styled(left_border, Style::default().fg(error())),
                Span::styled(
                    label.to_string(),
                    Style::default().fg(error()).add_modifier(Modifier::BOLD),
                ),
                Span::styled(right_border, Style::default().fg(error())),
                Span::styled("┐", Style::default().fg(error())),
            ]));

            // Wrapped error text
            let wrapped = wrap_text_to_width(text, inner_width);
            for line in wrapped {
                let padding = inner_width.saturating_sub(line.chars().count());
                lines.push(Line::from(vec![
                    Span::styled("  │ ", Style::default().fg(error())),
                    Span::styled(line, Style::default().fg(error())),
                    Span::styled(" ".repeat(padding), Style::default()),
                    Span::styled(" │", Style::default().fg(error())),
                ]));
            }

            // Bottom border
            lines.push(Line::from(vec![
                Span::styled("  └", Style::default().fg(error())),
                Span::styled(
                    "─".repeat(box_width.saturating_sub(2)),
                    Style::default().fg(error()),
                ),
                Span::styled("┘", Style::default().fg(error())),
            ]));
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

    // Left side: cwd, session name, and mode
    let cwd_display = {
        let path = config.cwd.display().to_string();
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() > 2 {
            format!("…/{}", parts[parts.len() - 2..].join("/"))
        } else {
            path
        }
    };

    let session_tag = session_name
        .map(|n| format!(" [{}]", n))
        .unwrap_or_default();
    let mode_label = if mode == "auto" {
        "auto".to_string()
    } else {
        mode.clone()
    };
    let left = format!(" {} │{}{} │ {}", cwd_display, session_tag, "", mode_label);

    // Right side: model, tokens, cost
    let in_str = format_tokens(app.tokens_in);
    let out_str = format_tokens(app.tokens_out);
    let right = format!(
        "{} │ in:{} out:{} │ {} ",
        provider, in_str, out_str, cost_str
    );

    // Truncate model name if needed
    let model_tag = format!(" {} ", model);

    let left_width = left.len().min(area.width as usize);
    let right_width = right.len().min(area.width as usize);
    let model_width = model_tag.len().min(area.width as usize);
    let padding = (area.width as usize).saturating_sub(left_width + right_width + model_width);

    let footer_line = Line::from(vec![
        Span::styled(left, Style::default().fg(footer_text())),
        Span::styled(" ".repeat(padding), Style::default().bg(footer_bg())),
        Span::styled(right, Style::default().fg(footer_text())),
        Span::styled(
            model_tag,
            Style::default()
                .fg(accent_dim())
                .add_modifier(Modifier::BOLD),
        ),
    ]);

    let footer = Paragraph::new(footer_line).style(Style::default().bg(footer_bg()));
    frame.render_widget(footer, area);
}

pub fn render_settings_overlay(frame: &mut Frame, app: &TuiApp) {
    let area = frame.area();
    let providers = provider_catalog();
    let provider = providers.get(clamp_index(app.settings.provider_index, providers.len()));
    let models = provider
        .map(|p| models_for_provider(&p.id))
        .unwrap_or_default();
    let model = models.get(clamp_index(app.settings.model_index, models.len()));

    match app.settings.mode {
        SettingsMode::Browsing => {
            render_settings_browsing(frame, area, app, &providers, &models, provider, model)
        }
        SettingsMode::Choosing => render_settings_choosing(frame, area, app, &providers, &models),
        SettingsMode::EditingKey => render_settings_editing_key(frame, area, app, provider, model),
    }
}

fn render_settings_browsing(
    frame: &mut Frame,
    area: Rect,
    app: &TuiApp,
    _providers: &[ProviderCatalog],
    _models: &[(String, String)],
    provider: Option<&ProviderCatalog>,
    model: Option<&(String, String)>,
) {
    let width = area.width.min(64);
    let height = area.height.min(14);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let focus = app.settings.focus;

    let focus_style = |active: bool| {
        if active {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(text_dim())
        }
    };

    let field_icon = |active: bool| -> &'static str {
        if active {
            "▸ "
        } else {
            "  "
        }
    };

    let provider_val = provider
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "(none)".into());
    let model_val = model
        .map(|(_, name)| name.clone())
        .unwrap_or_else(|| "(none)".into());
    let key_display = if app.settings.api_key.is_empty() {
        "(not set)".to_string()
    } else {
        let key = &app.settings.api_key;
        if key.len() > 8 {
            format!("{}••••{}", &key[..3], &key[key.len() - 3..])
        } else {
            "••••".to_string()
        }
    };

    let lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(
                field_icon(focus == SettingsFocus::Provider),
                Style::default().fg(accent()),
            ),
            Span::styled("Provider ", focus_style(focus == SettingsFocus::Provider)),
            Span::styled(provider_val, Style::default().fg(text_primary())),
            if focus == SettingsFocus::Provider {
                Span::styled("  ↵ choose", Style::default().fg(accent()))
            } else {
                Span::raw("")
            },
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(
                field_icon(focus == SettingsFocus::Model),
                Style::default().fg(accent()),
            ),
            Span::styled("Model    ", focus_style(focus == SettingsFocus::Model)),
            Span::styled(model_val, Style::default().fg(text_primary())),
            if focus == SettingsFocus::Model {
                Span::styled("  ↵ choose", Style::default().fg(accent()))
            } else {
                Span::raw("")
            },
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(
                field_icon(focus == SettingsFocus::ApiKey),
                Style::default().fg(accent()),
            ),
            Span::styled("API key  ", focus_style(focus == SettingsFocus::ApiKey)),
            Span::styled(key_display, Style::default().fg(text_primary())),
            if focus == SettingsFocus::ApiKey {
                Span::styled("  ↵ edit", Style::default().fg(accent()))
            } else {
                Span::raw("")
            },
        ]),
        Line::from(""),
        Line::from(Span::styled(
            "  ↑/↓ navigate  Enter: select  Ctrl+S: save  Esc: close",
            Style::default().fg(text_muted()),
        )),
        Line::from(if app.settings_dirty {
            Span::styled("  ● unsaved changes", Style::default().fg(thinking()))
        } else {
            Span::styled("  ✓ no changes", Style::default().fg(tool_label()))
        }),
    ];

    let widget = Paragraph::new(lines).block(
        Block::default()
            .title(Span::styled(
                " ⚙ Settings ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(accent())),
    );
    frame.render_widget(widget, rect);
}

fn render_settings_choosing(
    frame: &mut Frame,
    area: Rect,
    app: &TuiApp,
    providers: &[ProviderCatalog],
    models: &[(String, String)],
) {
    let items: Vec<(String, String)> = match app.settings.focus {
        SettingsFocus::Provider => providers
            .iter()
            .map(|p| (p.id.clone(), p.name.clone()))
            .collect(),
        SettingsFocus::Model => models
            .iter()
            .map(|(id, name)| (id.clone(), name.clone()))
            .collect(),
        SettingsFocus::ApiKey => vec![],
    };

    let current_index = match app.settings.focus {
        SettingsFocus::Provider => app.settings.provider_index,
        SettingsFocus::Model => app.settings.model_index,
        SettingsFocus::ApiKey => 0,
    };

    let list_scroll = app.settings.list_scroll;
    let max_visible = 8usize;
    let visible_count = items.len().min(max_visible).max(1);
    let height = (visible_count + 5) as u16; // title + spacing + items + help + border
    let width = area.width.min(56);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let title = match app.settings.focus {
        SettingsFocus::Provider => "Provider",
        SettingsFocus::Model => "Model",
        SettingsFocus::ApiKey => "API Key",
    };

    let mut lines: Vec<Line<'static>> = vec![Line::from("")];

    // Calculate visible window for scrolling
    let half_page = max_visible / 2;
    let start = if items.len() <= max_visible || list_scroll < half_page {
        0
    } else if list_scroll + half_page >= items.len() {
        items.len().saturating_sub(max_visible)
    } else {
        list_scroll - half_page
    };
    let end = (start + max_visible).min(items.len());

    for (i, (_id, name)) in items.iter().enumerate() {
        if i < start || i >= end {
            continue;
        }
        let is_selected = i == list_scroll;
        let is_current = i == current_index;
        let prefix = if is_current { "✓ " } else { "  " };
        let style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else if is_current {
            Style::default().fg(tool_label())
        } else {
            Style::default().fg(text_dim())
        };
        lines.push(Line::from(vec![
            Span::styled(prefix, style),
            Span::styled(name.to_string(), style),
        ]));
    }

    // Scroll indicator
    if items.len() > max_visible {
        let pct = if items.is_empty() {
            0
        } else {
            (list_scroll * 100) / items.len().saturating_sub(1)
        };
        lines.push(Line::from(Span::styled(
            format!(
                "  {} of {}  {}%",
                list_scroll + 1,
                items.len(),
                pct.min(100)
            ),
            Style::default().fg(text_muted()),
        )));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑/↓ navigate  Enter: select  Esc: back",
        Style::default().fg(text_muted()),
    )));

    let widget = Paragraph::new(lines).block(
        Block::default()
            .title(Span::styled(
                format!(" ⚙ Choose {} ", title),
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(accent())),
    );
    frame.render_widget(widget, rect);
}

fn render_settings_editing_key(
    frame: &mut Frame,
    area: Rect,
    app: &TuiApp,
    provider: Option<&ProviderCatalog>,
    model: Option<&(String, String)>,
) {
    let width = area.width.min(64);
    let height = area.height.min(12);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let provider_val = provider
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "(none)".into());
    let model_val = model
        .map(|(_, name)| name.clone())
        .unwrap_or_else(|| "(none)".into());

    // Show the key — masked with dots except near cursor for security
    let key = &app.settings.api_key;
    let cursor = app.settings.api_key_cursor;
    let max_show = (width as usize).saturating_sub(22); // leave room for label
    let (key_display, cursor_offset) = if key.is_empty() {
        ("(type your API key)".to_string(), 0)
    } else {
        // Show masked key with a window around the cursor
        let char_count = key.chars().count();
        if char_count <= max_show {
            // Show all masked
            let masked: String = key
                .chars()
                .enumerate()
                .map(|(i, _)| {
                    if i >= cursor.saturating_sub(2) && i <= cursor + 2 {
                        key.chars().nth(i).unwrap_or('•')
                    } else {
                        '•'
                    }
                })
                .collect();
            (masked, cursor)
        } else {
            // Window around cursor
            let start = cursor.saturating_sub(max_show / 2);
            let end = (start + max_show).min(char_count);
            let actual_start = if end < char_count {
                start
            } else {
                char_count.saturating_sub(max_show)
            };
            let visible: String = key.chars().skip(actual_start).take(max_show).collect();
            let masked: String = visible
                .chars()
                .enumerate()
                .map(|(i, _)| {
                    let global_i = actual_start + i;
                    if global_i >= cursor.saturating_sub(2) && global_i <= cursor + 2 {
                        key.chars().nth(global_i).unwrap_or('•')
                    } else {
                        '•'
                    }
                })
                .collect();
            (masked, cursor.saturating_sub(actual_start))
        }
    };
    let key_style = if key.is_empty() {
        Style::default().fg(text_muted())
    } else {
        Style::default().fg(text_primary())
    };

    let lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("  Provider: ", Style::default().fg(text_dim())),
            Span::styled(provider_val, Style::default().fg(text_primary())),
        ]),
        Line::from(vec![
            Span::styled("  Model:    ", Style::default().fg(text_dim())),
            Span::styled(model_val, Style::default().fg(text_primary())),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(
                "  API key: ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ),
            Span::styled(key_display, key_style),
        ]),
        Line::from(vec![
            Span::styled("           ", Style::default()),
            Span::styled(
                format!("{}▲", " ".repeat(cursor_offset)),
                Style::default().fg(accent()),
            ),
        ]),
        Line::from(""),
        Line::from(Span::styled(
            "  Type key  ←/→ move  Home/End  Esc: done",
            Style::default().fg(text_muted()),
        )),
    ];

    let widget = Paragraph::new(lines).block(
        Block::default()
            .title(Span::styled(
                " ⚙ Edit API Key ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(accent())),
    );
    frame.render_widget(widget, rect);
}

pub fn render_login_overlay(frame: &mut Frame, app: &TuiApp) {
    let area = frame.area();
    let login = match &app.login_state {
        Some(l) => l,
        None => return,
    };

    match login.phase {
        LoginPhase::SelectProvider => {
            // Provider selector menu (same style as settings Choosing mode)
            let item_count = login.providers.len();
            let height = (item_count + 6) as u16;
            let width = area.width.min(52);
            let rect = Rect {
                x: area.x + (area.width.saturating_sub(width)) / 2,
                y: area.y + (area.height.saturating_sub(height)) / 2,
                width,
                height,
            };
            frame.render_widget(Clear, rect);

            let mut lines: Vec<Line<'static>> = vec![Line::from("")];

            for (i, provider) in login.providers.iter().enumerate() {
                let is_selected = i == login.selected_index;
                let status = if provider.logged_in {
                    Span::styled(" ✓ logged in", Style::default().fg(tool_label()))
                } else {
                    Span::raw("")
                };

                if is_selected {
                    lines.push(Line::from(vec![
                        Span::styled(
                            "  → ",
                            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            provider.name.clone(),
                            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                        ),
                        status,
                    ]));
                } else {
                    lines.push(Line::from(vec![
                        Span::styled("    ", Style::default()),
                        Span::styled(provider.name.clone(), Style::default().fg(text_dim())),
                        status,
                    ]));
                }
            }

            if login.providers.is_empty() {
                lines.push(Line::from(Span::styled(
                    "    No OAuth providers available",
                    Style::default().fg(text_muted()),
                )));
            }

            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                "  ↑/↓ navigate  Enter: select  Esc: cancel",
                Style::default().fg(text_muted()),
            )));

            let widget = Paragraph::new(lines).block(
                Block::default()
                    .title(Span::styled(
                        " 🔑 Login ",
                        Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                    ))
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(accent())),
            );
            frame.render_widget(widget, rect);
        }
        LoginPhase::InProgress => {
            // Login in-progress overlay
            let msg_count = login.messages.len();
            let has_url = login.url.is_some();
            let has_code = login.device_code.is_some();
            let extra_lines = if has_url { 3 } else { 0 } + if has_code { 2 } else { 0 };
            let height = (msg_count + extra_lines + 6) as u16;
            let width = area.width.min(64);
            let rect = Rect {
                x: area.x + (area.width.saturating_sub(width)) / 2,
                y: area.y + (area.height.saturating_sub(height)) / 2,
                width,
                height,
            };
            frame.render_widget(Clear, rect);

            let mut lines: Vec<Line<'static>> = vec![Line::from("")];

            // Show URL if available
            if let Some(ref url) = login.url {
                lines.push(Line::from(vec![
                    Span::styled("  🌐 ", Style::default()),
                    Span::styled(url.clone(), Style::default().fg(accent())),
                ]));
                let click_hint = if cfg!(target_os = "macos") {
                    "Cmd+click to open"
                } else {
                    "Ctrl+click to open (auto-opened)"
                };
                lines.push(Line::from(Span::styled(
                    format!("     {click_hint}"),
                    Style::default()
                        .fg(text_muted())
                        .add_modifier(Modifier::ITALIC),
                )));
                lines.push(Line::from(""));
            }

            // Show device code if available (GitHub Copilot flow)
            if let Some(ref code) = login.device_code {
                lines.push(Line::from(vec![
                    Span::styled("  📋 Code: ", Style::default().fg(text_dim())),
                    Span::styled(
                        code.clone(),
                        Style::default()
                            .fg(text_primary())
                            .add_modifier(Modifier::BOLD),
                    ),
                ]));
                lines.push(Line::from(""));
            }

            // Show progress messages
            for msg in &login.messages {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(msg.clone(), Style::default().fg(text_dim())),
                ]));
            }

            // Spinner on last line
            let spinner = spinner_frame(app.tick_count);
            lines.push(Line::from(""));
            lines.push(Line::from(vec![
                Span::styled(format!("  {spinner} "), Style::default().fg(accent())),
                Span::styled(
                    "Waiting...",
                    Style::default()
                        .fg(thinking())
                        .add_modifier(Modifier::ITALIC),
                ),
                Span::styled("  (Esc to cancel)", Style::default().fg(text_muted())),
            ]));

            let widget = Paragraph::new(lines).block(
                Block::default()
                    .title(Span::styled(
                        " 🔑 Login ",
                        Style::default().fg(accent()).add_modifier(Modifier::BOLD),
                    ))
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(accent())),
            );
            frame.render_widget(widget, rect);
        }
    }
}

pub fn render_command_preview(frame: &mut Frame, app: &TuiApp, input_area: Rect) {
    let commands = app.filtered_commands();
    if commands.is_empty() {
        return;
    }

    let item_count = commands.len();
    let max_visible = 12usize;
    let visible_count = item_count.min(max_visible);
    // Title row + items + border = visible_count + 3
    let height = (visible_count + 3).clamp(4, 15) as u16;
    // Don't let it extend above the screen
    let available_above = input_area.y;
    let actual_height = height.min(available_above);
    let width = input_area.width.min(52);

    let rect = Rect {
        x: input_area.x,
        y: input_area.y.saturating_sub(actual_height),
        width,
        height: actual_height,
    };
    frame.render_widget(Clear, rect);

    // Calculate scroll window
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

    // Title line showing match count
    let title = if item_count == 1 {
        " 1 command ".to_string()
    } else {
        format!(" {} commands ", item_count)
    };
    lines.push(Line::from(Span::styled(
        title,
        Style::default()
            .fg(text_muted())
            .add_modifier(Modifier::ITALIC),
    )));

    for i in start..end {
        let cmd = &commands[i];
        let is_selected = i == selected;
        let style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(text_dim())
        };
        let arrow = if is_selected { "→ " } else { "  " };
        lines.push(Line::from(vec![
            Span::styled(arrow, Style::default().fg(accent())),
            Span::styled(format!("{} ", cmd.icon), style),
            Span::styled(format!("{:14} ", cmd.name), style),
            Span::styled(
                cmd.description.to_string(),
                Style::default().fg(text_muted()),
            ),
        ]));
    }

    // Scroll indicator
    if item_count > max_visible {
        let pct = (selected * 100) / item_count.saturating_sub(1);
        lines.push(Line::from(Span::styled(
            format!("  {} of {}  {}%", selected + 1, item_count, pct.min(100)),
            Style::default().fg(text_muted()),
        )));
    }

    let widget = Paragraph::new(lines).block(
        Block::default()
            .title(Span::styled(
                " Commands ",
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(accent_dim())),
    );
    frame.render_widget(widget, rect);
}

pub fn render_command_picker(frame: &mut Frame, app: &TuiApp) {
    let picker = match &app.command_picker {
        Some(p) => p,
        None => return,
    };

    let area = frame.area();
    let title = match picker.kind {
        CommandPickerKind::Provider => " 🔌 Switch Provider ",
        CommandPickerKind::Model => " 🧠 Switch Model ",
        CommandPickerKind::Theme => " 🎨 Switch Theme ",
        CommandPickerKind::Session => " 🗂 Switch Session ",
    };

    let max_visible = 10usize;
    let item_count = picker.items.len();
    let visible_count = item_count.min(max_visible).max(1);
    let height = (visible_count + 4) as u16;
    let width = area.width.min(60);
    let rect = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let mut lines: Vec<Line<'static>> = vec![Line::from("")];

    // Scrolling window
    let half = max_visible / 2;
    let start = if item_count <= max_visible || picker.selected_index < half {
        0
    } else if picker.selected_index + half >= item_count {
        item_count.saturating_sub(max_visible)
    } else {
        picker.selected_index - half
    };
    let end = (start + max_visible).min(item_count);

    for i in start..end {
        let (ref _id, ref name, ref status) = picker.items[i];
        let is_selected = i == picker.selected_index;
        let is_current = i == picker.current_index;
        let prefix = if is_current && is_selected {
            "✓→"
        } else if is_current {
            "✓ "
        } else if is_selected {
            " →"
        } else {
            "  "
        };
        let style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else if is_current {
            Style::default().fg(tool_label())
        } else {
            Style::default().fg(text_dim())
        };
        let mut spans = vec![
            Span::styled(format!(" {} ", prefix), style),
            Span::styled(name.clone(), style),
        ];
        if !status.is_empty() {
            spans.push(Span::styled(
                format!("  {}", status),
                Style::default().fg(text_muted()),
            ));
        }
        lines.push(Line::from(spans));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑/↓ navigate  Enter: select  Esc: cancel",
        Style::default().fg(text_muted()),
    )));

    let widget = Paragraph::new(lines).block(
        Block::default()
            .title(Span::styled(
                title,
                Style::default().fg(accent()).add_modifier(Modifier::BOLD),
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(accent())),
    );
    frame.render_widget(widget, rect);
}

pub fn render(
    frame: &mut Frame,
    app: &TuiApp,
    config: &CliConfig,
    settings: &StoredSettings,
    session_name: Option<&str>,
) {
    let area = frame.area();

    // Calculate input box height based on wrapped text
    let input_inner_width = area.width.saturating_sub(2) as usize;
    let input_text_lines = count_wrapped_lines(&app.input, input_inner_width);
    let input_height = (input_text_lines + 2).clamp(3, 10);
    let input_visible_lines = input_height.saturating_sub(2);

    // Calculate input scroll so cursor is visible
    let (cursor_row, _) = cursor_to_row_col(&app.input, app.cursor, input_inner_width);
    let max_input_scroll = input_text_lines.saturating_sub(input_visible_lines);
    let input_scroll = if cursor_row >= input_visible_lines {
        (cursor_row - input_visible_lines + 1).min(max_input_scroll)
    } else {
        0
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(4),
            Constraint::Length(input_height),
            Constraint::Length(1),
        ])
        .split(area);

    let transcript_area = chunks[0];
    let input_area = chunks[1];
    let footer_area = chunks[2];

    // ── Transcript ───────────────────────────────────────────────
    let visible_height = transcript_area.height.saturating_sub(2) as usize;
    let (visible_lines, total_lines, scroll, buffer) =
        render_transcript_viewport(app, transcript_area.width, visible_height);

    app.content_lines.set(total_lines);
    app.visible_height.set(visible_height);

    let border_color = if app.pending {
        accent_dim()
    } else if app.status == "error" || app.status == "aborted" {
        border_error()
    } else {
        border_idle()
    };

    let paragraph_scroll_y = if scroll >= buffer {
        buffer as u16
    } else {
        scroll as u16
    };

    let transcript = Paragraph::new(visible_lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(border_color)),
        )
        .wrap(Wrap { trim: false })
        .scroll((paragraph_scroll_y, 0));

    frame.render_widget(transcript, transcript_area);

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
            y: transcript_area.y + 1,
            width: 1,
            height: visible_height as u16,
        };
        frame.render_stateful_widget(scrollbar, scrollbar_area, &mut scrollbar_state);
    }

    // ── Input ────────────────────────────────────────────────────
    let input_border_color = if app.pending {
        thinking()
    } else if app.status == "error" || app.status == "aborted" {
        border_error()
    } else {
        border_active()
    };

    let input_title = if app.pending {
        let spinner = spinner_frame(app.tick_count);
        Span::styled(
            format!(" {} waiting (Esc to abort) ", spinner),
            Style::default()
                .fg(thinking())
                .add_modifier(Modifier::ITALIC),
        )
    } else {
        let multi_line = app.input.contains('\n');
        let label = if multi_line {
            format!(" ▸ multiline ({} lines) ", app.input.lines().count())
        } else {
            " ▸ ".to_string()
        };
        Span::styled(
            label,
            Style::default().fg(accent()).add_modifier(Modifier::BOLD),
        )
    };

    let input_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(input_border_color))
        .title(input_title);

    let input_widget = Paragraph::new(app.input.as_str())
        .style(Style::default().fg(text_primary()))
        .block(input_block)
        .wrap(Wrap { trim: false })
        .scroll((input_scroll, 0));
    frame.render_widget(input_widget, input_area);

    if !app.settings_open && !app.pending {
        let (cursor_row, cursor_col) = cursor_to_row_col(&app.input, app.cursor, input_inner_width);
        frame.set_cursor_position((
            input_area.x + cursor_col + 1,
            input_area.y + cursor_row + 1 - input_scroll,
        ));
    }

    // ── Footer ───────────────────────────────────────────────────
    render_footer(frame, footer_area, app, config, settings, session_name);

    // ── Settings overlay ─────────────────────────────────────────
    if app.settings_open {
        render_settings_overlay(frame, app);
    }

    // ── Login overlay ────────────────────────────────────────────
    if app.login_state.is_some() {
        render_login_overlay(frame, app);
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
