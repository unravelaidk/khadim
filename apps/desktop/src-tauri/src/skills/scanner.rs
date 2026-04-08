use crate::db::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

// ── Types ────────────────────────────────────────────────────────────

/// A discovered skill on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillEntry {
    /// Unique id derived from the directory name.
    pub id: String,
    /// Human-readable name (from SKILL.md frontmatter or directory name).
    pub name: String,
    /// Short description (from frontmatter).
    pub description: String,
    /// The directory the skill lives in.
    pub dir: String,
    /// Which scan directory this skill was found in.
    pub source_dir: String,
    /// Whether the user has enabled this skill.
    pub enabled: bool,
    /// Optional metadata fields.
    pub author: Option<String>,
    pub version: Option<String>,
}

// ── Frontmatter parser (lightweight) ─────────────────────────────────

fn parse_frontmatter(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return map;
    }
    // Find closing ---
    let after_open = &trimmed[3..];
    let close = match after_open.find("\n---") {
        Some(pos) => pos,
        None => return map,
    };
    let block = &after_open[..close];
    for line in block.lines() {
        if let Some((key, value)) = line.split_once(':') {
            let k = key.trim().to_lowercase();
            let v = value.trim().trim_matches('"').trim_matches('\'').to_string();
            if !k.is_empty() && !v.is_empty() {
                map.insert(k, v);
            }
        }
    }
    map
}

/// Extract the first heading (# ...) from markdown content.
fn extract_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].trim().to_string());
        }
    }
    None
}

/// Extract description: first non-empty, non-heading, non-frontmatter paragraph.
fn extract_description(content: &str) -> String {
    let body = if content.trim().starts_with("---") {
        // Skip frontmatter
        let after = &content.trim()[3..];
        match after.find("\n---") {
            Some(pos) => &after[pos + 4..],
            None => content,
        }
    } else {
        content
    };

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("---") {
            continue;
        }
        // Take the first non-heading line as description
        return if trimmed.len() > 200 {
            format!("{}…", &trimmed[..200])
        } else {
            trimmed.to_string()
        };
    }
    String::new()
}

// ── SkillManager ─────────────────────────────────────────────────────

pub struct SkillManager {
    db: Arc<Database>,
    /// Discovered skills keyed by id.
    skills: RwLock<HashMap<String, SkillEntry>>,
}

impl SkillManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            skills: RwLock::new(HashMap::new()),
        }
    }

    // ── Directory management ─────────────────────────────────────────

    /// Get the list of skill scan directories.
    /// Default: `~/.agents/skills`.  User can add more via settings.
    pub fn list_dirs(&self) -> Vec<String> {
        let saved = self
            .db
            .get_setting("skills:dirs")
            .ok()
            .flatten()
            .unwrap_or_default();

        if saved.is_empty() {
            return vec![default_skills_dir()];
        }

        serde_json::from_str::<Vec<String>>(&saved).unwrap_or_else(|_| vec![default_skills_dir()])
    }

    /// Add a skill scan directory.
    pub fn add_dir(&self, dir: &str) -> Result<Vec<String>, AppError> {
        let mut dirs = self.list_dirs();
        let normalized = dir.trim().to_string();
        if normalized.is_empty() {
            return Err(AppError::invalid_input("Directory path cannot be empty"));
        }
        if !dirs.contains(&normalized) {
            dirs.push(normalized);
        }
        let json = serde_json::to_string(&dirs).unwrap_or_default();
        self.db.set_setting("skills:dirs", &json)?;
        Ok(dirs)
    }

    /// Remove a skill scan directory.
    pub fn remove_dir(&self, dir: &str) -> Result<Vec<String>, AppError> {
        let mut dirs = self.list_dirs();
        dirs.retain(|d| d != dir);
        // Always keep at least the default
        if dirs.is_empty() {
            dirs.push(default_skills_dir());
        }
        let json = serde_json::to_string(&dirs).unwrap_or_default();
        self.db.set_setting("skills:dirs", &json)?;
        Ok(dirs)
    }

    // ── Discovery ────────────────────────────────────────────────────

    /// Scan all configured directories and discover skills.
    pub fn discover(&self) -> Vec<SkillEntry> {
        let dirs = self.list_dirs();
        let mut all = HashMap::<String, SkillEntry>::new();

        for dir_path in &dirs {
            let dir = Path::new(dir_path);
            if !dir.is_dir() {
                log::debug!("Skills dir does not exist: {dir_path}");
                continue;
            }

            let entries = match std::fs::read_dir(dir) {
                Ok(e) => e,
                Err(e) => {
                    log::warn!("Failed to read skills dir {dir_path}: {e}");
                    continue;
                }
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let skill_md = path.join("SKILL.md");
                if !skill_md.exists() {
                    continue;
                }

                let dir_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let content = match std::fs::read_to_string(&skill_md) {
                    Ok(c) => c,
                    Err(e) => {
                        log::warn!("Failed to read {}: {e}", skill_md.display());
                        continue;
                    }
                };

                let frontmatter = parse_frontmatter(&content);
                let name = frontmatter
                    .get("name")
                    .cloned()
                    .or_else(|| extract_heading(&content))
                    .unwrap_or_else(|| dir_name.clone());

                let description = frontmatter
                    .get("description")
                    .cloned()
                    .unwrap_or_else(|| extract_description(&content));

                let enabled = self.is_enabled(&dir_name);

                let skill = SkillEntry {
                    id: dir_name.clone(),
                    name,
                    description,
                    dir: path.to_string_lossy().to_string(),
                    source_dir: dir_path.clone(),
                    enabled,
                    author: frontmatter.get("author").cloned()
                        .or_else(|| {
                            // Try metadata.json
                            let meta_path = path.join("metadata.json");
                            if meta_path.exists() {
                                let meta = std::fs::read_to_string(&meta_path).ok()?;
                                let meta_val: serde_json::Value = serde_json::from_str(&meta).ok()?;
                                meta_val.get("author").and_then(|v| v.as_str()).map(|s| s.to_string())
                            } else {
                                None
                            }
                        }),
                    version: frontmatter.get("version").cloned()
                        .or_else(|| {
                            let meta_path = path.join("metadata.json");
                            if meta_path.exists() {
                                let meta = std::fs::read_to_string(&meta_path).ok()?;
                                let meta_val: serde_json::Value = serde_json::from_str(&meta).ok()?;
                                meta_val.get("version").and_then(|v| v.as_str()).map(|s| s.to_string())
                            } else {
                                None
                            }
                        }),
                };

                all.insert(dir_name, skill);
            }
        }

        let mut list: Vec<SkillEntry> = all.values().cloned().collect();
        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        // Store discovered skills
        *self.skills.write().unwrap() = all;

        list
    }

    // ── Toggle ───────────────────────────────────────────────────────

    pub fn set_enabled(&self, skill_id: &str, enabled: bool) -> Result<(), AppError> {
        self.db.set_setting(
            &format!("skill:enabled:{skill_id}"),
            if enabled { "true" } else { "false" },
        )?;
        // Update in-memory state
        if let Some(skill) = self.skills.write().unwrap().get_mut(skill_id) {
            skill.enabled = enabled;
        }
        Ok(())
    }

    fn is_enabled(&self, skill_id: &str) -> bool {
        self.db
            .get_setting(&format!("skill:enabled:{skill_id}"))
            .ok()
            .flatten()
            .map(|v| v != "false")
            .unwrap_or(true) // enabled by default
    }

    // ── Prompt & tool integration ─────────────────────────────────

    /// Return lightweight summaries of enabled skills.
    pub fn active_skill_summaries(&self) -> Vec<(String, String, String)> {
        let skills = self.skills.read().unwrap();
        let mut results = Vec::new();

        for skill in skills.values() {
            if !skill.enabled {
                continue;
            }
            results.push((
                skill.id.clone(),
                skill.name.clone(),
                skill.description.clone(),
            ));
        }

        results.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));
        results
    }

    /// Get directories the read tool is allowed to access.
    /// Returns the scan directories themselves (e.g. ~/.agents/skills) so
    /// every skill and its subdirectories are readable.
    pub fn enabled_skill_dirs(&self) -> Vec<PathBuf> {
        let dirs: Vec<PathBuf> = self.list_dirs()
            .into_iter()
            .map(PathBuf::from)
            .collect();
        log::info!("SkillManager::enabled_skill_dirs() -> {:?}", dirs);
        dirs
    }

    /// Build the skills section for the system prompt, pi-style.
    /// Lists name, description, and absolute SKILL.md location so the
    /// agent can use the regular `read` tool to load skill content.
    pub fn build_prompt_section(&self) -> String {
        let skills = self.skills.read().unwrap();
        let visible: Vec<_> = skills.values().filter(|s| s.enabled).collect();
        if visible.is_empty() {
            return String::new();
        }

        let mut lines = vec![
            String::new(),
            String::new(),
            "The following skills provide specialized instructions for specific tasks.".into(),
            "Use the read tool to load a skill's file when the task matches its description.".into(),
            "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.".into(),
            String::new(),
            "<available_skills>".into(),
        ];

        let mut sorted: Vec<_> = visible.into_iter().collect();
        sorted.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        for skill in sorted {
            let skill_md = PathBuf::from(&skill.dir).join("SKILL.md");
            lines.push("  <skill>".into());
            lines.push(format!("    <name>{}</name>", xml_escape(&skill.name)));
            lines.push(format!(
                "    <description>{}</description>",
                xml_escape(&skill.description)
            ));
            lines.push(format!(
                "    <location>{}</location>",
                xml_escape(&skill_md.to_string_lossy())
            ));
            lines.push("  </skill>".into());
        }

        lines.push("</available_skills>".into());
        lines.join("\n")
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn default_skills_dir() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agents")
        .join("skills")
        .to_string_lossy()
        .to_string()
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
