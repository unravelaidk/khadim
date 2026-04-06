//! A tool that gives the agent read access to skill directories.
//!
//! The agent uses `read_skill` to read files from any enabled skill's
//! directory.  This keeps skill content out of the system prompt and
//! lets the agent pull it on demand.

use crate::error::AppError;
use crate::khadim_code::tools::{Tool, ToolDefinition, ToolResult};
use crate::skills::SkillManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;

pub struct SkillReadTool {
    manager: Arc<SkillManager>,
}

impl SkillReadTool {
    pub fn new(manager: Arc<SkillManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for SkillReadTool {
    fn definition(&self) -> ToolDefinition {
        // Build a dynamic description that lists available skills.
        let summaries = self.manager.active_skill_summaries();
        let skill_list = if summaries.is_empty() {
            "No skills are currently enabled.".to_string()
        } else {
            let mut lines = Vec::new();
            for (id, name, description) in &summaries {
                lines.push(format!("  - `{}` — {} — {}", id, name, description));
            }
            format!("Available skills:\n{}", lines.join("\n"))
        };

        ToolDefinition {
            name: "read_skill".to_string(),
            description: format!(
                "Read a file from an enabled skill directory. \
                 Use this to load skill instructions, rules, and reference material. \
                 Pass the skill id and a relative file path within that skill.\n\n\
                 To get started with a skill, read its SKILL.md first.\n\n\
                 {}",
                skill_list
            ),
            parameters: json!({
                "type": "object",
                "properties": {
                    "skill": {
                        "type": "string",
                        "description": "The skill id (directory name)"
                    },
                    "path": {
                        "type": "string",
                        "description": "Relative file path within the skill directory (e.g. 'SKILL.md', 'rules/color-theme.md'). Use '.' to list the directory contents."
                    }
                },
                "required": ["skill"]
            }),
            prompt_snippet: format!(
                "- read_skill: Read files from enabled skill directories. {}",
                if summaries.is_empty() {
                    "No skills enabled.".to_string()
                } else {
                    format!(
                        "Skills: {}",
                        summaries
                            .iter()
                            .map(|(id, name, _)| format!("{} ({})", name, id))
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
            ),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let skill_id = input
            .get("skill")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::invalid_input("read_skill requires a skill id"))?;

        let skill_dir = self.manager.resolve_skill_dir(skill_id).ok_or_else(|| {
            let available = self
                .manager
                .active_skill_summaries()
                .iter()
                .map(|(id, _, _)| id.clone())
                .collect::<Vec<_>>()
                .join(", ");
            AppError::not_found(format!(
                "Skill '{}' not found or disabled. Available: {}",
                skill_id, available
            ))
        })?;

        let relative = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("SKILL.md");

        // List directory if path is "." or empty
        if relative == "." || relative.is_empty() {
            return list_skill_dir(&skill_dir);
        }

        // Resolve and validate path stays inside the skill directory
        let target = skill_dir.join(relative);
        let canonical_dir = skill_dir
            .canonicalize()
            .unwrap_or_else(|_| skill_dir.clone());
        let canonical_target = target
            .canonicalize()
            .map_err(|_| AppError::not_found(format!("File not found: {relative}")))?;

        if !canonical_target.starts_with(&canonical_dir) {
            return Err(AppError::invalid_input(
                "Path escapes the skill directory",
            ));
        }

        if canonical_target.is_dir() {
            return list_skill_dir(&canonical_target);
        }

        // Read the file
        let content = std::fs::read_to_string(&canonical_target).map_err(|e| {
            AppError::io(format!("Failed to read {}: {e}", canonical_target.display()))
        })?;

        let lines: Vec<&str> = content.lines().collect();
        let body = lines
            .iter()
            .enumerate()
            .map(|(i, line)| format!("{}: {}", i + 1, line))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(ToolResult {
            content: body,
            metadata: Some(json!({
                "skill": skill_id,
                "filePath": canonical_target.to_string_lossy(),
                "filename": canonical_target.file_name().and_then(|f| f.to_str()),
            })),
        })
    }
}

fn list_skill_dir(dir: &Path) -> Result<ToolResult, AppError> {
    let mut entries = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|e| {
            let mut name = e.file_name().to_string_lossy().to_string();
            if e.path().is_dir() {
                name.push('/');
            }
            name
        })
        .collect::<Vec<_>>();
    entries.sort();
    Ok(ToolResult {
        content: entries.join("\n"),
        metadata: None,
    })
}
