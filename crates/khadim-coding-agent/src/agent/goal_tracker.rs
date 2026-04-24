//! Goal-count heuristic for the Khadim agent.
//!
//! This module extracts implicit and explicit goals from the user's prompt,
//! tracks which goals have been satisfied based on tool usage, and generates
//! guidance nudges that steer the agent toward the remaining objectives.
//!
//! The **goal-count heuristic** is simply the number of unsatisfied goals.
//! A lower heuristic means the agent is closer to completing the task.

use serde_json::Value;
use std::collections::HashSet;

/// Kinds of goals the agent may need to satisfy.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum GoalKind {
    /// A file that must be created (e.g. "create src/foo.rs").
    CreateFile,
    /// A file that must be modified (e.g. "update src/foo.rs").
    ModifyFile,
    /// A command that must be executed successfully (e.g. "run cargo test").
    RunCommand,
    /// A test or verification that must pass (e.g. "ensure tests pass").
    VerifyOutcome,
    /// A catch-all goal extracted from explicit lists or directives.
    General,
}

impl GoalKind {
    pub fn label(&self) -> &'static str {
        match self {
            GoalKind::CreateFile => "create",
            GoalKind::ModifyFile => "modify",
            GoalKind::RunCommand => "run",
            GoalKind::VerifyOutcome => "verify",
            GoalKind::General => "do",
        }
    }
}

/// A single goal extracted from the prompt.
#[derive(Debug, Clone)]
pub struct Goal {
    pub kind: GoalKind,
    pub description: String,
    pub satisfied: bool,
}

impl Goal {
    fn new(kind: GoalKind, description: impl Into<String>) -> Self {
        Self {
            kind,
            description: description.into(),
            satisfied: false,
        }
    }
}

/// Tracks extracted goals and computes the goal-count heuristic.
#[derive(Debug, Clone, Default)]
pub struct GoalTracker {
    pub goals: Vec<Goal>,
}

impl GoalTracker {
    /// Build a tracker by scanning the prompt for goals.
    pub fn from_prompt(prompt: &str) -> Self {
        let mut goals = Vec::new();
        let lower = prompt.to_ascii_lowercase();

        // ── File paths in back-ticks / double quotes ─────────────────────
        for path in extract_quoted_paths(prompt) {
            let _path_lower = path.to_ascii_lowercase();
            // Heuristic: look at the text immediately before the path occurrence
            let ctx = prefix_context(prompt, &path, 80);
            let ctx_lower = ctx.to_ascii_lowercase();

            let create_score = last_keyword_pos(&ctx_lower, &["create", "write", "add", "generate", "produce", "new file"]);
            let modify_score = last_keyword_pos(&ctx_lower, &["edit", "modify", "update", "change", "fix", "refactor", "patch"]);

            if modify_score > create_score {
                goals.push(Goal::new(GoalKind::ModifyFile, path));
            } else if create_score > modify_score {
                goals.push(Goal::new(GoalKind::CreateFile, path));
            } else {
                // Ambiguous — register as a general file goal
                goals.push(Goal::new(GoalKind::General, format!("file: {}", path)));
            }
        }

        // ── Explicit command / run directives ────────────────────────────
        for cmd in extract_command_directives(&lower) {
            goals.push(Goal::new(GoalKind::RunCommand, cmd));
        }

        // ── Test / verify directives ─────────────────────────────────────
        for phrase in extract_verify_directives(&lower) {
            goals.push(Goal::new(GoalKind::VerifyOutcome, phrase));
        }

        // ── Explicit numbered goals ("1. do X", "2. do Y") ───────────────
        for item in extract_numbered_goals(prompt) {
            goals.push(Goal::new(GoalKind::General, item));
        }

        // ── Deduplicate by description (keep first kind) ─────────────────
        let mut seen = HashSet::new();
        goals.retain(|g| seen.insert(g.description.clone()));

        Self { goals }
    }

    /// Number of goals that are still unsatisfied (the heuristic value).
    pub fn heuristic(&self) -> usize {
        self.goals.iter().filter(|g| !g.satisfied).count()
    }

    /// Total number of goals tracked.
    pub fn total(&self) -> usize {
        self.goals.len()
    }

    /// Whether every tracked goal is satisfied.
    pub fn is_all_satisfied(&self) -> bool {
        self.heuristic() == 0 && !self.goals.is_empty()
    }

    /// Whether the tracker contains any goals.
    pub fn has_goals(&self) -> bool {
        !self.goals.is_empty()
    }

    /// Generate a nudge message that tells the agent how many goals remain
    /// and lists the outstanding ones.
    pub fn nudge(&self) -> Option<String> {
        if self.goals.is_empty() {
            return None;
        }

        let remaining: Vec<&Goal> = self.goals.iter().filter(|g| !g.satisfied).collect();
        let total = self.goals.len();
        let done = total - remaining.len();

        if remaining.is_empty() {
            return Some(format!(
                "Goal-count heuristic: 0 remaining ({} of {} goals satisfied). \
                 Verify once more that everything is complete before finishing.",
                done, total
            ));
        }

        let mut lines = Vec::new();
        lines.push(format!(
            "Goal-count heuristic: {} of {} goals remain. Focus on the highest-impact next action.",
            remaining.len(),
            total
        ));
        lines.push("Outstanding goals:".to_string());
        for g in remaining.iter().take(8) {
            lines.push(format!("  - [{}] {}", g.kind.label(), g.description));
        }
        if remaining.len() > 8 {
            lines.push(format!("  ... and {} more", remaining.len() - 8));
        }
        lines.push(
            "Pick the cheapest tool call that satisfies the most goals. Verify an artifact or command soon."
                .to_string(),
        );

        Some(lines.join("\n"))
    }

    /// Update satisfaction state based on a tool that was just executed.
    /// This is heuristic — we look for evidence that a goal was addressed.
    pub fn update_from_tool(&mut self, tool_name: &str, args: &str, result: &str) {
        let args_lower = args.to_ascii_lowercase();
        let result_lower = result.to_ascii_lowercase();

        for goal in &mut self.goals {
            if goal.satisfied {
                continue;
            }
            match &goal.kind {
                GoalKind::CreateFile => {
                    if (tool_name == "write" || tool_name == "append")
                        && args.contains(&goal.description)
                    {
                        goal.satisfied = true;
                    }
                }
                GoalKind::ModifyFile => {
                    if ["edit", "line_edit", "patch", "append"].contains(&tool_name)
                        && args.contains(&goal.description)
                    {
                        goal.satisfied = true;
                    }
                }
                GoalKind::RunCommand => {
                    if tool_name == "bash" {
                        let goal_lower = goal.description.to_ascii_lowercase();
                        if args_lower.contains(&goal_lower)
                            || result_lower.contains(&goal_lower)
                        {
                            goal.satisfied = true;
                        }
                    }
                }
                GoalKind::VerifyOutcome => {
                    if tool_name == "bash" {
                        let goal_lower = goal.description.to_ascii_lowercase();
                        // Look for verification command run or success signal
                        if args_lower.contains(&goal_lower)
                            || result_lower.contains("test result: ok")
                            || result_lower.contains("passed")
                            || result_lower.contains("success")
                        {
                            goal.satisfied = true;
                        }
                    }
                }
                GoalKind::General => {
                    // Heuristic: if any tool result mentions the goal description
                    // with a success keyword, mark it satisfied.
                    let goal_lower = goal.description.to_ascii_lowercase();
                    if result_lower.contains(&goal_lower)
                        && (result_lower.contains("done")
                            || result_lower.contains("success")
                            || result_lower.contains("ok")
                            || result_lower.contains("created")
                            || result_lower.contains("updated"))
                    {
                        goal.satisfied = true;
                    }
                }
            }
        }
    }

    /// Convenience wrapper that parses args from a JSON string.
    pub fn update_from_tool_json(&mut self, tool_name: &str, args_json: &str, result: &str) {
        let args = serde_json::from_str::<Value>(args_json)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();

        // Build a flat string representation of the args for substring matching
        let mut arg_text = String::new();
        for (k, v) in args {
            arg_text.push_str(&k);
            arg_text.push(':');
            if let Some(s) = v.as_str() {
                arg_text.push_str(s);
            } else {
                arg_text.push_str(&v.to_string());
            }
            arg_text.push(' ');
        }
        self.update_from_tool(tool_name, &arg_text, result);
    }
}

// ── Extraction helpers ──────────────────────────────────────────────────

/// Pull out quoted segments that look like file paths.
fn extract_quoted_paths(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for delim in ['`', '"'] {
        let mut inside = false;
        let mut current = String::new();
        for ch in text.chars() {
            if ch == delim {
                if inside {
                    let trimmed = current.trim();
                    if looks_like_path(trimmed) && !paths.contains(&trimmed.to_string()) {
                        paths.push(trimmed.to_string());
                    }
                    current.clear();
                }
                inside = !inside;
                continue;
            }
            if inside {
                current.push(ch);
            }
        }
    }
    paths
}

/// Naive path heuristic: contains a slash, starts with ./ or /, or has a known extension.
fn looks_like_path(s: &str) -> bool {
    if s.is_empty() || s.contains(' ') {
        return false;
    }
    s.starts_with("./")
        || s.starts_with('/')
        || s.contains('/')
        || s.ends_with(".rs")
        || s.ends_with(".py")
        || s.ends_with(".js")
        || s.ends_with(".ts")
        || s.ends_with(".json")
        || s.ends_with(".toml")
        || s.ends_with(".yaml")
        || s.ends_with(".yml")
        || s.ends_with(".md")
        || s.ends_with(".txt")
        || s.ends_with(".sh")
        || s.ends_with(".html")
        || s.ends_with(".css")
}

/// Return the text immediately before the first occurrence of `needle`.
fn prefix_context(text: &str, needle: &str, max_len: usize) -> String {
    if let Some(pos) = text.find(needle) {
        let start = pos.saturating_sub(max_len);
        text[start..pos].trim().to_string()
    } else {
        String::new()
    }
}

/// Find the position of the right-most occurrence of any keyword in `text`.
/// Returns `None` if no keyword is found.
fn last_keyword_pos(text: &str, keywords: &[&str]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for kw in keywords {
        if let Some(pos) = text.rfind(kw) {
            best = best.map(|b| b.max(pos)).or(Some(pos));
        }
    }
    best
}

/// Extract command directives like "run `cargo test`" or "execute ...".
fn extract_command_directives(lower: &str) -> Vec<String> {
    let mut cmds = Vec::new();
    let patterns = [
        "run ",
        "execute ",
        "start ",
        "launch ",
        "compile ",
        "build ",
    ];

    for pat in patterns {
        for line in lower.lines() {
            if let Some(pos) = line.find(pat) {
                let rest = &line[pos + pat.len()..];
                let cmd = rest
                    .trim_matches(|c: char| matches!(c, '`' | '"' | '\'' | ',' | '.' | ';'))
                    .trim();
                if !cmd.is_empty() && cmd.len() < 200 && !cmds.contains(&cmd.to_string()) {
                    cmds.push(cmd.to_string());
                }
            }
        }
    }
    cmds
}

/// Extract verification directives like "ensure tests pass".
fn extract_verify_directives(lower: &str) -> Vec<String> {
    let mut items = Vec::new();
    let patterns = [
        "test ",
        "verify ",
        "ensure ",
        "check ",
        "validate ",
        "confirm ",
        "assert ",
    ];

    for pat in patterns {
        for line in lower.lines() {
            if let Some(pos) = line.find(pat) {
                let rest = &line[pos..];
                let phrase = rest
                    .trim_matches(|c: char| matches!(c, '`' | '"' | '\'' | ',' | '.' | ';'))
                    .trim();
                if !phrase.is_empty()
                    && phrase.len() < 200
                    && !items.contains(&phrase.to_string())
                {
                    items.push(phrase.to_string());
                }
            }
        }
    }
    items
}

/// Extract numbered list items that look like goals.
fn extract_numbered_goals(text: &str) -> Vec<String> {
    let mut items = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.len() < 4 {
            continue;
        }
        // Match lines like "1. foo", "2) foo", "(3) foo"
        let first = trimmed.chars().next().unwrap();
        if first.is_ascii_digit() {
            let after_num = &trimmed[1..].trim_start();
            if after_num.starts_with('.') || after_num.starts_with(')') {
                let item = after_num[1..].trim().to_string();
                if !item.is_empty() && item.len() < 300 && !items.contains(&item) {
                    items.push(item);
                }
            }
        }
    }
    items
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extracts_file_goals() {
        let prompt = "Create `src/main.rs` and modify `Cargo.toml`. Then run `cargo test`.";
        let tracker = GoalTracker::from_prompt(prompt);
        assert_eq!(tracker.total(), 3);
        assert_eq!(tracker.heuristic(), 3);
        let kinds: Vec<_> = tracker.goals.iter().map(|g| g.kind.clone()).collect();
        assert!(kinds.contains(&GoalKind::CreateFile));
        assert!(kinds.contains(&GoalKind::ModifyFile));
        assert!(kinds.contains(&GoalKind::RunCommand));
    }

    #[test]
    fn test_satisfies_create_file() {
        let prompt = "Create `src/main.rs`";
        let mut tracker = GoalTracker::from_prompt(prompt);
        assert_eq!(tracker.heuristic(), 1);
        tracker.update_from_tool("write", "path:src/main.rs ", "ok");
        assert_eq!(tracker.heuristic(), 0);
    }

    #[test]
    fn test_satisfies_modify_file() {
        let prompt = "Update `src/lib.rs`";
        let mut tracker = GoalTracker::from_prompt(prompt);
        tracker.update_from_tool("edit", "path:src/lib.rs ", "ok");
        assert!(tracker.is_all_satisfied());
    }

    #[test]
    fn test_nudge_format() {
        let prompt = "Create `a.rs` and run `cargo build`.";
        let tracker = GoalTracker::from_prompt(prompt);
        let nudge = tracker.nudge().unwrap();
        assert!(nudge.contains("Goal-count heuristic"));
        assert!(nudge.contains("a.rs"));
        assert!(nudge.contains("cargo build"));
    }

    #[test]
    fn test_numbered_goals() {
        let prompt = "1. Fix the bug\n2. Add tests\n3. Update README";
        let tracker = GoalTracker::from_prompt(prompt);
        assert_eq!(tracker.total(), 3);
        assert!(tracker.goals.iter().all(|g| g.kind == GoalKind::General));
    }

    #[test]
    fn test_no_goals() {
        let tracker = GoalTracker::from_prompt("What is the weather?");
        assert!(!tracker.has_goals());
        assert!(tracker.nudge().is_none());
    }
}
