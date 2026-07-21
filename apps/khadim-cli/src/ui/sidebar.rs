//! Multi-agent instrument rail (right sidebar).
//!
//! Dense industrial panel: goals, workers, leases. Hidden below ~100 columns
//! and when multi-agent is inactive.

use ratatui::layout::Rect;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use super::theme::{
    accent, accent_dim, border_idle, error, system_text, text_dim, text_muted, text_primary,
    tool_label, tool_text,
};

/// Snapshot of multi-agent run instrumentation for the sidebar.
#[derive(Debug, Clone, Default)]
pub struct MultiAgentOps {
    pub active: bool,
    pub total_goals: u64,
    pub goals: Vec<GoalRow>,
    pub workers: Vec<WorkerRow>,
    pub leases: Vec<String>,
    pub last_status: String,
}

#[derive(Debug, Clone)]
pub struct GoalRow {
    pub id: u64,
    pub description: String,
    pub status: GoalRowStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GoalRowStatus {
    Pending,
    Claimed,
    Satisfied,
    Blocked,
}

#[derive(Debug, Clone)]
pub struct WorkerRow {
    pub id: String,
    pub status: WorkerRowStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerRowStatus {
    Running,
    Done,
    Failed,
    Blocked,
}

impl MultiAgentOps {
    pub fn reset_for_run(&mut self) {
        self.active = true;
        self.total_goals = 0;
        self.goals.clear();
        self.workers.clear();
        self.leases.clear();
        self.last_status = "running".into();
    }

    pub fn apply_event(
        &mut self,
        event_type: &str,
        content: Option<&str>,
        metadata: Option<&serde_json::Value>,
    ) {
        match event_type {
            "goal_heuristic" => {
                self.active = true;
                if let Some(m) = metadata {
                    self.total_goals = m.get("total_goals").and_then(|v| v.as_u64()).unwrap_or(0);
                    if let Some(arr) = m.get("goals").and_then(|v| v.as_array()) {
                        self.goals = arr
                            .iter()
                            .enumerate()
                            .map(|(i, g)| GoalRow {
                                id: i as u64,
                                description: g
                                    .get("description")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("?")
                                    .to_string(),
                                status: GoalRowStatus::Pending,
                            })
                            .collect();
                    }
                }
                self.last_status = format!("{} goals", self.total_goals);
            }
            "workers_assigned" => {
                self.active = true;
                self.last_status = "assigned".into();
            }
            "worker_spawned" | "worker_assigned" => {
                self.active = true;
                if let Some(m) = metadata {
                    let wid = m
                        .get("worker_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("?")
                        .to_string();
                    let goals = m
                        .get("goals")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|n| n.as_u64())
                                .map(|n| n.to_string())
                                .collect::<Vec<_>>()
                                .join(",")
                        })
                        .unwrap_or_default();
                    if let Some(w) = self.workers.iter_mut().find(|w| w.id == wid) {
                        w.status = WorkerRowStatus::Running;
                        if !goals.is_empty() {
                            w.detail = format!("g:{goals}");
                        }
                    } else {
                        self.workers.push(WorkerRow {
                            id: wid,
                            status: WorkerRowStatus::Running,
                            detail: if goals.is_empty() {
                                String::new()
                            } else {
                                format!("g:{goals}")
                            },
                        });
                    }
                    // Mark claimed goals
                    if let Some(arr) = m.get("goals").and_then(|v| v.as_array()) {
                        for n in arr.iter().filter_map(|v| v.as_u64()) {
                            if let Some(g) = self.goals.iter_mut().find(|g| g.id == n) {
                                g.status = GoalRowStatus::Claimed;
                            }
                        }
                    }
                }
            }
            "worker_done" => {
                if let Some(m) = metadata {
                    let wid = m.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                    if let Some(w) = self.workers.iter_mut().find(|w| w.id == wid) {
                        w.status = WorkerRowStatus::Done;
                        w.detail = "done".into();
                    }
                }
            }
            "worker_failed" => {
                if let Some(m) = metadata {
                    let wid = m.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                    if let Some(w) = self.workers.iter_mut().find(|w| w.id == wid) {
                        w.status = WorkerRowStatus::Failed;
                        w.detail = m
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("failed")
                            .chars()
                            .take(24)
                            .collect();
                    }
                }
            }
            "worker_blocked" => {
                if let Some(m) = metadata {
                    let wid = m.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                    if let Some(w) = self.workers.iter_mut().find(|w| w.id == wid) {
                        w.status = WorkerRowStatus::Blocked;
                        w.detail = "blocked".into();
                    }
                }
            }
            "goal_satisfied" => {
                if let Some(m) = metadata {
                    let gid = m
                        .get("goal_id")
                        .or_else(|| m.get("goal_index"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if let Some(g) = self.goals.iter_mut().find(|g| g.id == gid) {
                        g.status = GoalRowStatus::Satisfied;
                    } else if (gid as usize) < self.goals.len() {
                        self.goals[gid as usize].status = GoalRowStatus::Satisfied;
                    }
                }
                self.last_status = "goal ok".into();
            }
            "goal_blocked" => {
                if let Some(m) = metadata {
                    let gid = m.get("goal_id").and_then(|v| v.as_u64()).unwrap_or(0);
                    if let Some(g) = self.goals.iter_mut().find(|g| g.id == gid) {
                        g.status = GoalRowStatus::Blocked;
                    }
                }
            }
            "lease_conflict" => {
                if let Some(m) = metadata {
                    let file = m.get("file").and_then(|v| v.as_str()).unwrap_or("?");
                    let a = m.get("worker_id").and_then(|v| v.as_str()).unwrap_or("?");
                    let b = m
                        .get("other_worker_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("?");
                    let line = format!("{a}↔{b} {file}");
                    if self.leases.len() >= 6 {
                        self.leases.remove(0);
                    }
                    self.leases.push(line);
                }
            }
            "multi_agent_done" => {
                self.last_status = content.unwrap_or("done").chars().take(40).collect();
            }
            _ => {}
        }
    }
}

/// Preferred sidebar width; collapses when terminal is too narrow.
pub fn sidebar_width(total_cols: u16, force_show: bool) -> u16 {
    if !force_show {
        return 0;
    }
    // Hide under ~100 cols so 80x24 stays single-column.
    if total_cols < 100 {
        return 0;
    }
    if total_cols < 120 {
        22
    } else {
        28
    }
}

/// Session row for the ops rail (name + relative age label).
#[derive(Debug, Clone)]
pub struct SessionRow {
    pub name: String,
    pub active: bool,
    pub age: String,
}

pub fn render_sidebar(
    frame: &mut Frame,
    area: Rect,
    ops: &MultiAgentOps,
    sessions: &[SessionRow],
    worker_filter: Option<&str>,
) {
    if area.width < 12 || area.height < 4 {
        return;
    }

    let title = if ops.active { " ops " } else { " rail " };
    let block = Block::default()
        .borders(Borders::LEFT)
        .border_style(Style::default().fg(border_idle()))
        .title(Span::styled(
            title,
            Style::default()
                .fg(accent_dim())
                .add_modifier(Modifier::BOLD),
        ));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let mut lines: Vec<Line<'static>> = Vec::new();
    let dim = Style::default()
        .fg(text_muted())
        .add_modifier(Modifier::DIM);
    let label = Style::default().fg(text_dim()).add_modifier(Modifier::BOLD);
    let body = Style::default().fg(text_primary());
    let w = inner.width as usize;

    // Status + progress
    if ops.active {
        let sat = ops
            .goals
            .iter()
            .filter(|g| g.status == GoalRowStatus::Satisfied)
            .count();
        let total = ops.goals.len().max(ops.total_goals as usize);
        let progress = if total > 0 {
            format!("{sat}/{total}")
        } else {
            ops.last_status.clone()
        };
        lines.push(Line::from(vec![
            Span::styled("· ", Style::default().fg(accent())),
            Span::styled(progress, Style::default().fg(system_text())),
            Span::styled(
                format!(" {}", ops.last_status),
                Style::default()
                    .fg(text_muted())
                    .add_modifier(Modifier::DIM),
            ),
        ]));
        // Mini progress bar
        if total > 0 {
            let bar_w = (inner.width as usize).saturating_sub(4).min(16).max(4);
            let filled = (sat * bar_w) / total;
            let bar: String = std::iter::repeat_n('█', filled)
                .chain(std::iter::repeat_n('░', bar_w.saturating_sub(filled)))
                .collect();
            lines.push(Line::from(Span::styled(
                format!("  {bar}"),
                Style::default()
                    .fg(tool_label())
                    .add_modifier(Modifier::DIM),
            )));
        }
        lines.push(Line::from(""));

        // Goals — denser: max 8 when sessions also shown
        let goal_cap = if sessions.is_empty() { 12 } else { 8 };
        lines.push(Line::from(Span::styled("GOALS", label)));
        if ops.goals.is_empty() {
            lines.push(Line::from(Span::styled("  —", dim)));
        } else {
            for g in ops.goals.iter().take(goal_cap) {
                let (mark, col) = match g.status {
                    GoalRowStatus::Pending => ("○", text_muted()),
                    GoalRowStatus::Claimed => ("◌", system_text()),
                    GoalRowStatus::Satisfied => ("●", tool_label()),
                    GoalRowStatus::Blocked => ("✗", error()),
                };
                let desc = truncate_display(&g.description, w.saturating_sub(5));
                lines.push(Line::from(vec![
                    Span::styled(format!(" {mark} "), Style::default().fg(col)),
                    Span::styled(desc, body),
                ]));
            }
            if ops.goals.len() > goal_cap {
                lines.push(Line::from(Span::styled(
                    format!("  +{}", ops.goals.len() - goal_cap),
                    dim,
                )));
            }
        }

        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled("WORKERS", label)));
        if ops.workers.is_empty() {
            lines.push(Line::from(Span::styled("  —", dim)));
        } else {
            for wk in ops.workers.iter().take(8) {
                let selected = worker_filter == Some(wk.id.as_str());
                let (mark, col) = match wk.status {
                    WorkerRowStatus::Running => ("▸", accent()),
                    WorkerRowStatus::Done => ("●", tool_label()),
                    WorkerRowStatus::Failed => ("✗", error()),
                    WorkerRowStatus::Blocked => ("◌", text_muted()),
                };
                let id = truncate_display(&wk.id, 12);
                let detail = if wk.detail.is_empty() {
                    String::new()
                } else {
                    format!(" {}", truncate_display(&wk.detail, 8))
                };
                let id_style = if selected {
                    Style::default()
                        .fg(accent())
                        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
                } else {
                    body
                };
                lines.push(Line::from(vec![
                    Span::styled(
                        format!(" {} ", if selected { "▸" } else { mark }),
                        Style::default().fg(if selected { accent() } else { col }),
                    ),
                    Span::styled(id, id_style),
                    Span::styled(detail, Style::default().fg(tool_text())),
                ]));
            }
        }

        if !ops.leases.is_empty() {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled("LEASES", label)));
            for l in ops.leases.iter().rev().take(3) {
                lines.push(Line::from(Span::styled(
                    format!("  {}", truncate_display(l, w.saturating_sub(3))),
                    Style::default().fg(error()).add_modifier(Modifier::DIM),
                )));
            }
        }
    }

    // Sessions (always when provided) — industrial session strip
    if !sessions.is_empty() {
        if ops.active {
            lines.push(Line::from(""));
        }
        lines.push(Line::from(Span::styled("SESSIONS", label)));
        for s in sessions.iter().take(6) {
            let mark = if s.active { "●" } else { "·" };
            let col = if s.active { accent() } else { text_muted() };
            let name = truncate_display(&s.name, w.saturating_sub(10));
            let age = truncate_display(&s.age, 6);
            lines.push(Line::from(vec![
                Span::styled(format!(" {mark} "), Style::default().fg(col)),
                Span::styled(name, body),
                Span::styled(format!(" {age}"), dim),
            ]));
        }
    } else if !ops.active {
        lines.push(Line::from(Span::styled(
            " multi mode",
            Style::default()
                .fg(text_muted())
                .add_modifier(Modifier::DIM),
        )));
        lines.push(Line::from(Span::styled(" idle · /sessions", dim)));
    }

    // Fit to height
    let max_h = inner.height as usize;
    if lines.len() > max_h {
        lines.truncate(max_h);
    }

    frame.render_widget(Paragraph::new(lines), inner);
}

fn truncate_display(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    let mut out = String::new();
    let mut w = 0usize;
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
