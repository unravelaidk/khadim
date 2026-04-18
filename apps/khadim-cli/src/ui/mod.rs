pub mod helpers;
pub mod markdown;
pub mod table;
pub mod theme;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState, Wrap};
use ratatui::Frame;

use crate::app::{SettingsFocus, StoredSettings, TuiApp, TranscriptEntry, LoginPhase,
    clamp_index, effective_settings, estimate_cost, format_cost, format_tokens,
    models_for_provider, provider_catalog, ProviderCatalog, SettingsMode, spinner_frame,
    CommandPickerKind};
use crate::args::CliConfig;
use crate::ui::theme::*;
use crate::ui::helpers::{count_wrapped_lines, cursor_to_row_col, truncate_str};

pub fn render_transcript_lines(app: &TuiApp, width: u16) -> Vec<Line<'static>> {
    let mut lines: Vec<Line<'static>> = Vec::new();
    let content_width = width.saturating_sub(2) as usize;

    for entry in &app.entries {
        match entry {
            TranscriptEntry::System { text } => {
                // System messages: subtle with a prefix icon
                lines.push(Line::from(vec![
                    Span::styled("  ℹ ", Style::default().fg(system_text()).add_modifier(Modifier::DIM)),
                    Span::styled(text.clone(), Style::default().fg(system_text())),
                ]));
            }
            TranscriptEntry::User { text } => {
                lines.push(Line::from(""));
                for (i, line) in text.lines().enumerate() {
                    if i == 0 {
                        lines.push(Line::from(vec![
                            Span::styled(" ▸ ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
                            Span::styled(line.to_string(), Style::default().fg(text_primary()).bg(user_bg()).add_modifier(Modifier::BOLD)),
                        ]));
                    } else {
                        lines.push(Line::from(vec![
                            Span::styled("   ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
                            Span::styled(line.to_string(), Style::default().fg(text_primary()).bg(user_bg()).add_modifier(Modifier::BOLD)),
                        ]));
                    }
                }
                if text.ends_with('\n') {
                    lines.push(Line::from(vec![
                        Span::styled("   ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
                        Span::styled(" ", Style::default().fg(text_primary()).bg(user_bg()).add_modifier(Modifier::BOLD)),
                    ]));
                }
            }
            TranscriptEntry::AssistantText { text } => {
                lines.push(Line::from(""));
                let md_lines = markdown::render_markdown(text, content_width.saturating_sub(2));
                lines.extend(md_lines);
            }
            TranscriptEntry::Thinking { text } => {
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(
                        if text.is_empty() { "💭 Thinking...".to_string() } else { format!("💭 Thinking: {}", truncate_str(text, 60)) },
                        Style::default().fg(thinking()).add_modifier(Modifier::ITALIC),
                    ),
                ]));
            }
            TranscriptEntry::ToolStart { .. } => {}
            TranscriptEntry::ToolComplete { tool, content, is_error, collapsed } => {
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
                        format!("{} ({} more lines, ctrl+o to expand)", truncate_str(&preview, 50), line_count - 1)
                    } else {
                        truncate_str(&preview, 60).to_string()
                    };
                    lines.push(Line::from(vec![
                        Span::styled("  ", Style::default()),
                        Span::styled(
                            format!("{icon} "),
                            Style::default().fg(status_color).add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            format!("{tool_display} "),
                            Style::default().fg(status_color).add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            preview_text,
                            Style::default().fg(tool_text()),
                        ),
                    ]));
                } else {
                    // Expanded: show header + content
                    lines.push(Line::from(vec![
                        Span::styled("  ", Style::default()),
                        Span::styled(
                            format!("{icon} {tool_display}"),
                            Style::default().fg(status_color).add_modifier(Modifier::BOLD),
                        ),
                    ]));

                    let max_lines = 20;
                    let total_lines = content.lines().count();
                    for (i, line) in content.lines().enumerate() {
                        if i >= max_lines {
                            lines.push(Line::from(vec![
                                Span::styled("    ", Style::default()),
                                Span::styled(
                                    format!("⋯ {} more lines (ctrl+o to collapse)", total_lines - max_lines),
                                    Style::default().fg(text_muted()).add_modifier(Modifier::ITALIC),
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
            }
            TranscriptEntry::Error { text } => {
                lines.push(Line::from(""));
                lines.push(Line::from(vec![
                    Span::styled("  ⚠ ", Style::default().fg(error()).add_modifier(Modifier::BOLD)),
                    Span::styled(
                        text.clone(),
                        Style::default().fg(error()),
                    ),
                ]));
                lines.push(Line::from(""));
            }
            TranscriptEntry::Separator => {
                // Subtle horizontal rule instead of blank line
                let width = content_width.min(60);
                lines.push(Line::from(vec![
                    Span::styled("  ", Style::default()),
                    Span::styled(
                        "─".repeat(width),
                        Style::default().fg(border_idle()),
                    ),
                ]));
            }
        }
    }

    // Show animated spinner when pending
    if app.pending {
        let is_step = app.entries.last().map_or(false, |e| matches!(e, TranscriptEntry::ToolComplete { .. }));
        if !is_step && !app.streaming_text {
            let spinner = spinner_frame(app.tick_count);
            let status = &app.status;
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(
                    format!("{spinner} "),
                    Style::default().fg(accent()),
                ),
                Span::styled(
                    status.clone(),
                    Style::default().fg(thinking()).add_modifier(Modifier::ITALIC),
                ),
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

pub fn render_footer(frame: &mut Frame, area: Rect, app: &TuiApp, config: &CliConfig, settings: &StoredSettings) {
    let eff = effective_settings(config, settings);
    let provider = eff.provider.unwrap_or_else(|| "?".into());
    let model = eff.model_id.unwrap_or_else(|| "?".into());
    let mode = &app.current_mode;

    let cost = estimate_cost(&provider, &model, app.tokens_in, app.tokens_out, app.tokens_cache_read, app.tokens_cache_write);
    let cost_str = format_cost(cost);

    // Left side: cwd and mode
    let cwd_display = {
        let path = config.cwd.display().to_string();
        // Show just the last 2 components of the path for brevity
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() > 2 {
            format!("…/{}", parts[parts.len() - 2..].join("/"))
        } else {
            path
        }
    };

    let left = format!(" {} │ {}", cwd_display, mode);

    // Right side: model, tokens, cost
    let in_str = format_tokens(app.tokens_in);
    let out_str = format_tokens(app.tokens_out);
    let right = format!("{} │ in:{} out:{} │ {} ", provider, in_str, out_str, cost_str);

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
        Span::styled(model_tag, Style::default().fg(accent_dim()).add_modifier(Modifier::BOLD)),
    ]);

    let footer = Paragraph::new(footer_line)
        .style(Style::default().bg(footer_bg()));
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
        SettingsMode::Browsing => render_settings_browsing(frame, area, app, &providers, &models, provider, model),
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
        if active { Style::default().fg(accent()).add_modifier(Modifier::BOLD) }
        else { Style::default().fg(text_dim()) }
    };

    let field_icon = |active: bool| -> &'static str {
        if active { "▸ " } else { "  " }
    };

    let provider_val = provider.map(|p| p.name.clone()).unwrap_or_else(|| "(none)".into());
    let model_val = model.map(|(_, name)| name.clone()).unwrap_or_else(|| "(none)".into());
    let key_display = if app.settings.api_key.is_empty() {
        "(not set)".to_string()
    } else {
        let key = &app.settings.api_key;
        if key.len() > 8 {
            format!("{}••••{}", &key[..3], &key[key.len()-3..])
        } else {
            "••••".to_string()
        }
    };

    let lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(field_icon(focus == SettingsFocus::Provider), Style::default().fg(accent())),
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
            Span::styled(field_icon(focus == SettingsFocus::Model), Style::default().fg(accent())),
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
            Span::styled(field_icon(focus == SettingsFocus::ApiKey), Style::default().fg(accent())),
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

    let widget = Paragraph::new(lines)
        .block(
            Block::default()
                .title(Span::styled(" ⚙ Settings ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(accent()))
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
        SettingsFocus::Provider => providers.iter().map(|p| (p.id.clone(), p.name.clone())).collect(),
        SettingsFocus::Model => models.iter().map(|(id, name)| (id.clone(), name.clone())).collect(),
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
        let pct = if items.is_empty() { 0 } else { (list_scroll * 100) / items.len().saturating_sub(1) };
        lines.push(Line::from(Span::styled(
            format!("  {} of {}  {}%", list_scroll + 1, items.len(), pct.min(100)),
            Style::default().fg(text_muted()),
        )));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑/↓ navigate  Enter: select  Esc: back",
        Style::default().fg(text_muted()),
    )));

    let widget = Paragraph::new(lines)
        .block(
            Block::default()
                .title(Span::styled(format!(" ⚙ Choose {} ", title), Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(accent()))
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

    let provider_val = provider.map(|p| p.name.clone()).unwrap_or_else(|| "(none)".into());
    let model_val = model.map(|(_, name)| name.clone()).unwrap_or_else(|| "(none)".into());

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
            let masked: String = key.chars().enumerate().map(|(i, _)| {
                if i >= cursor.saturating_sub(2) && i <= cursor + 2 {
                    key.chars().nth(i).unwrap_or('•')
                } else {
                    '•'
                }
            }).collect();
            (masked, cursor)
        } else {
            // Window around cursor
            let start = cursor.saturating_sub(max_show / 2);
            let end = (start + max_show).min(char_count);
            let actual_start = if end < char_count { start } else { char_count.saturating_sub(max_show) };
            let visible: String = key.chars().skip(actual_start).take(max_show).collect();
            let masked: String = visible.chars().enumerate().map(|(i, _)| {
                let global_i = actual_start + i;
                if global_i >= cursor.saturating_sub(2) && global_i <= cursor + 2 {
                    key.chars().nth(global_i).unwrap_or('•')
                } else {
                    '•'
                }
            }).collect();
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
            Span::styled("  API key: ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
            Span::styled(key_display, key_style),
        ]),
        Line::from(vec![
            Span::styled("           ", Style::default()),
            Span::styled(format!("{}▲", " ".repeat(cursor_offset)), Style::default().fg(accent())),
        ]),
        Line::from(""),
        Line::from(Span::styled(
            "  Type key  ←/→ move  Home/End  Esc: done",
            Style::default().fg(text_muted()),
        )),
    ];

    let widget = Paragraph::new(lines)
        .block(
            Block::default()
                .title(Span::styled(" ⚙ Edit API Key ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(accent()))
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
                        Span::styled("  → ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
                        Span::styled(provider.name.clone(), Style::default().fg(accent()).add_modifier(Modifier::BOLD)),
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

            let widget = Paragraph::new(lines)
                .block(
                    Block::default()
                        .title(Span::styled(" 🔑 Login ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                        .borders(Borders::ALL)
                        .border_style(Style::default().fg(accent()))
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
                    Style::default().fg(text_muted()).add_modifier(Modifier::ITALIC),
                )));
                lines.push(Line::from(""));
            }

            // Show device code if available (GitHub Copilot flow)
            if let Some(ref code) = login.device_code {
                lines.push(Line::from(vec![
                    Span::styled("  📋 Code: ", Style::default().fg(text_dim())),
                    Span::styled(
                        code.clone(),
                        Style::default().fg(text_primary()).add_modifier(Modifier::BOLD),
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
                Span::styled("Waiting...", Style::default().fg(thinking()).add_modifier(Modifier::ITALIC)),
                Span::styled("  (Esc to cancel)", Style::default().fg(text_muted())),
            ]));

            let widget = Paragraph::new(lines)
                .block(
                    Block::default()
                        .title(Span::styled(" 🔑 Login ", Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                        .borders(Borders::ALL)
                        .border_style(Style::default().fg(accent()))
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

    let count = commands.len().min(9);
    let height = count as u16 + 2; // border
    let width = input_area.width.min(50);

    // Position above the input box
    let rect = Rect {
        x: input_area.x,
        y: input_area.y.saturating_sub(height),
        width,
        height,
    };
    frame.render_widget(Clear, rect);

    let mut lines: Vec<Line<'static>> = Vec::new();
    for (i, cmd) in commands.iter().enumerate().take(count) {
        let is_selected = i == app.command_preview_index;
        let style = if is_selected {
            Style::default().fg(accent()).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(text_dim())
        };
        let arrow = if is_selected { "→ " } else { "  " };
        lines.push(Line::from(vec![
            Span::styled(arrow, Style::default().fg(accent())),
            Span::styled(format!("{} ", cmd.icon), style),
            Span::styled(format!("{:12} ", cmd.name), style),
            Span::styled(cmd.description.to_string(), Style::default().fg(text_muted())),
        ]));
    }

    let widget = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(accent_dim()))
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
            spans.push(Span::styled(format!("  {}", status), Style::default().fg(text_muted())));
        }
        lines.push(Line::from(spans));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  ↑/↓ navigate  Enter: select  Esc: cancel",
        Style::default().fg(text_muted()),
    )));

    let widget = Paragraph::new(lines)
        .block(
            Block::default()
                .title(Span::styled(title, Style::default().fg(accent()).add_modifier(Modifier::BOLD)))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(accent()))
        );
    frame.render_widget(widget, rect);
}

pub fn render(frame: &mut Frame, app: &TuiApp, config: &CliConfig, settings: &StoredSettings) {
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
    let all_lines = render_transcript_lines(app, transcript_area.width);
    let total_lines = all_lines.len() as u16;
    let visible_height = transcript_area.height.saturating_sub(2);

    app.content_lines.set(total_lines);
    app.visible_height.set(visible_height);

    // Clamp scroll_offset to valid range
    let max_scroll = total_lines.saturating_sub(visible_height);
    let scroll = if app.auto_scroll {
        max_scroll
    } else {
        app.scroll_offset.min(max_scroll)
    };

    let border_color = if app.pending {
        accent_dim()
    } else if app.status == "error" || app.status == "aborted" {
        border_error()
    } else {
        border_idle()
    };

    let transcript = Paragraph::new(all_lines)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(border_color)))
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));

    frame.render_widget(transcript, transcript_area);

    // Scrollbar
    if total_lines > visible_height {
        let mut scrollbar_state = ScrollbarState::new(max_scroll as usize).position(scroll as usize);
        let scrollbar = Scrollbar::new(ScrollbarOrientation::VerticalRight)
            .begin_symbol(None).end_symbol(None)
            .track_symbol(Some(" ")).thumb_symbol("┃")
            .track_style(Style::default().fg(border_idle()))
            .thumb_style(Style::default().fg(accent_dim()));
        let scrollbar_area = Rect {
            x: transcript_area.x + transcript_area.width - 1,
            y: transcript_area.y + 1,
            width: 1,
            height: visible_height,
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
            Style::default().fg(thinking()).add_modifier(Modifier::ITALIC),
        )
    } else {
        Span::styled(" ▸ ", Style::default().fg(accent()).add_modifier(Modifier::BOLD))
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
    render_footer(frame, footer_area, app, config, settings);

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