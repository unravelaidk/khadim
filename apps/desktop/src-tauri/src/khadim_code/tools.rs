use crate::backend::AgentStreamEvent;
use crate::db::{Database, MemoryEntry, MemoryStore};
use crate::error::AppError;
use crate::khadim_agent::KhadimManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// Re-export the shared trait and types so existing code keeps working.
pub use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};

fn normalize_path(root: &Path, raw: &str) -> Result<PathBuf, AppError> {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    let normalized = joined
        .components()
        .fold(PathBuf::new(), |mut acc, component| {
            use std::path::Component;
            match component {
                Component::CurDir => {}
                Component::ParentDir => {
                    acc.pop();
                }
                other => acc.push(other.as_os_str()),
            }
            acc
        });

    if !normalized.starts_with(root) {
        return Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {}",
            normalized.display()
        )));
    }

    Ok(normalized)
}

fn maybe_workspace_scope(workspace_id: &str) -> Option<&str> {
    (!matches!(workspace_id, "__chat__" | "__agent_builder__")).then_some(workspace_id)
}

fn split_terms(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|part| part.len() >= 2)
        .map(ToOwned::to_owned)
        .collect()
}

fn resolve_memory_stores(
    db: &Database,
    workspace_id: &str,
    conversation_id: Option<&str>,
) -> Result<(MemoryStore, Vec<MemoryStore>), AppError> {
    let workspace_scope = maybe_workspace_scope(workspace_id);
    let chat_store = db.get_or_create_chat_memory_store(workspace_scope)?;
    let mut stores = vec![chat_store.clone()];
    let mut seen = std::collections::HashSet::from([chat_store.id.clone()]);

    if db.get_setting("memory:chat_auto_access_shared")?.as_deref() == Some("true") {
        for store in db.list_memory_stores(workspace_scope)? {
            if store.scope_type == "shared"
                && store.chat_read_access == "read"
                && match workspace_scope {
                    Some(workspace_id) => store.workspace_id.as_deref() == Some(workspace_id),
                    None => store.workspace_id.is_none(),
                }
                && seen.insert(store.id.clone())
            {
                stores.push(store);
            }
        }
    }

    if let Some(agent_id) = conversation_id {
        for store in db.list_agent_memory_stores(agent_id)? {
            if seen.insert(store.id.clone()) {
                stores.push(store);
            }
        }
    }

    Ok((chat_store, stores))
}

fn score_memory_entry(
    entry: &MemoryEntry,
    store: &MemoryStore,
    query_terms: &[String],
    preferred_agent_id: Option<&str>,
    chat_store_id: &str,
) -> i64 {
    let mut score = 0_i64;
    let key = entry.key.to_lowercase();
    let content = entry.content.to_lowercase();

    if entry.is_pinned {
        score += 50;
    }
    if store.id == chat_store_id {
        score += 25;
    }
    if let Some(agent_id) = preferred_agent_id {
        if store.primary_for_agent_ids.iter().any(|id| id == agent_id) {
            score += 35;
        } else if store.linked_agent_ids.iter().any(|id| id == agent_id) {
            score += 20;
        }
    }

    for term in query_terms {
        if key == *term {
            score += 40;
        } else if key.contains(term) {
            score += 18;
        }
        if content.contains(term) {
            score += 10;
        }
    }

    score += (entry.confidence * 10.0).round() as i64;
    score += entry.recall_count.min(10);
    score
}

fn fallback_memory_score(
    entry: &MemoryEntry,
    store: &MemoryStore,
    preferred_agent_id: Option<&str>,
    chat_store_id: &str,
) -> i64 {
    let mut score = 0_i64;
    if entry.is_pinned {
        score += 50;
    }
    if store.id == chat_store_id {
        score += 20;
    }
    if let Some(agent_id) = preferred_agent_id {
        if store.primary_for_agent_ids.iter().any(|id| id == agent_id) {
            score += 30;
        } else if store.linked_agent_ids.iter().any(|id| id == agent_id) {
            score += 15;
        }
    }
    score += (entry.confidence * 10.0).round() as i64;
    score += entry.recall_count.min(10);
    score
}

fn resolve_memory_write_store(
    db: &Database,
    workspace_id: &str,
    conversation_id: Option<&str>,
) -> Result<MemoryStore, AppError> {
    if let Some(agent_id) = conversation_id {
        let linked = db.list_agent_memory_stores(agent_id)?;
        if let Some(primary) = linked
            .iter()
            .find(|store| store.primary_for_agent_ids.iter().any(|id| id == agent_id))
        {
            return Ok(primary.clone());
        }
        if let Some(existing) = linked.into_iter().next() {
            return Ok(existing);
        }

        if let Some(workspace_scope) = maybe_workspace_scope(workspace_id) {
            let now = chrono::Utc::now().to_rfc3339();
            let store = MemoryStore {
                id: uuid::Uuid::new_v4().to_string(),
                workspace_id: Some(workspace_scope.to_string()),
                scope_type: "agent".to_string(),
                name: format!("Agent Memory {}", &agent_id[..agent_id.len().min(8)]),
                description: "Private memory for this agent.".to_string(),
                chat_read_access: "none".to_string(),
                linked_agent_ids: vec![agent_id.to_string()],
                linked_agent_names: Vec::new(),
                primary_for_agent_ids: vec![agent_id.to_string()],
                entry_count: 0,
                created_at: now.clone(),
                updated_at: now,
            };
            db.create_memory_store(&store)?;
            return Ok(store);
        }
    }

    db.get_or_create_chat_memory_store(maybe_workspace_scope(workspace_id))
}

pub struct MemorySearchTool {
    db: Database,
    workspace_id: String,
    conversation_id: Option<String>,
    agent_id: Option<String>,
}

impl MemorySearchTool {
    pub fn new(
        db: Database,
        workspace_id: String,
        conversation_id: Option<String>,
        agent_id: Option<String>,
    ) -> Self {
        Self {
            db,
            workspace_id,
            conversation_id,
            agent_id,
        }
    }
}

#[async_trait]
impl Tool for MemorySearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "memory_search".to_string(),
            description: "Search saved memory for prior preferences, project facts, workflows, and durable context relevant to the current task.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to search memory for"},
                    "limit": {"type": "integer", "description": "Maximum results to return (default: 5)"}
                },
                "required": ["query"]
            }),
            prompt_snippet: "- memory_search: Search saved memory before answering questions about prior preferences, decisions, workflows, or project facts".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let query = input
            .get("query")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let limit = input
            .get("limit")
            .and_then(|value| value.as_u64())
            .unwrap_or(5) as usize;

        let memory_scope_id = self.agent_id.as_deref().or(self.conversation_id.as_deref());
        let (chat_store, stores) =
            resolve_memory_stores(&self.db, &self.workspace_id, memory_scope_id)?;
        let query_terms = split_terms(query);
        let mut matches = Vec::<(MemoryStore, MemoryEntry, i64)>::new();

        for store in &stores {
            for entry in self.db.list_memory_entries(&store.id)? {
                let score = score_memory_entry(
                    &entry,
                    store,
                    &query_terms,
                    memory_scope_id,
                    &chat_store.id,
                );
                if score > 0 {
                    matches.push((store.clone(), entry, score));
                }
            }
        }

        if matches.is_empty() {
            for store in &stores {
                for entry in self.db.list_memory_entries(&store.id)? {
                    let score =
                        fallback_memory_score(&entry, store, memory_scope_id, &chat_store.id);
                    matches.push((store.clone(), entry, score));
                }
            }
        }

        matches.sort_by(|a, b| b.2.cmp(&a.2));
        matches.truncate(limit);

        if matches.is_empty() {
            return Ok(ToolResult {
                content: if query.is_empty() {
                    "No saved memory is available in the current scope.".to_string()
                } else {
                    format!("No memory matches found for: {query}")
                },
                metadata: Some(json!({"results": []})),
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        let mut result_rows = Vec::new();
        let mut lines = Vec::new();

        for (store, entry, score) in matches {
            let mut updated = entry.clone();
            updated.recall_count += 1;
            updated.last_recalled_at = Some(now.clone());
            updated.updated_at = now.clone();
            let _ = self.db.update_memory_entry(&updated);

            result_rows.push(json!({
                "id": entry.id,
                "store_id": store.id,
                "store_scope": store.scope_type,
                "key": entry.key,
                "kind": entry.kind,
                "content": entry.content,
                "confidence": entry.confidence,
                "score": score,
            }));
            lines.push(format!(
                "- id={} [{}:{}] {}",
                entry.id,
                store.scope_type,
                entry.key,
                entry.content.replace('\n', " ")
            ));
        }

        let mode_label = if matches!(self.workspace_id.as_str(), "__chat__" | "__agent_builder__") {
            "standalone chat"
        } else if self.agent_id.is_some() || self.conversation_id.is_some() {
            "agent/workspace"
        } else {
            "workspace"
        };

        Ok(ToolResult {
            content: format!("Memory scope: {mode_label}\n{}", lines.join("\n")),
            metadata: Some(json!({"results": result_rows, "scope": mode_label})),
        })
    }
}

pub struct MemoryGetTool {
    db: Database,
    workspace_id: String,
    conversation_id: Option<String>,
    agent_id: Option<String>,
}

pub struct MemorySaveTool {
    db: Database,
    workspace_id: String,
    conversation_id: Option<String>,
    agent_id: Option<String>,
}

impl MemorySaveTool {
    pub fn new(
        db: Database,
        workspace_id: String,
        conversation_id: Option<String>,
        agent_id: Option<String>,
    ) -> Self {
        Self {
            db,
            workspace_id,
            conversation_id,
            agent_id,
        }
    }
}

/// Default max entries per memory store before consolidation is recommended.
const MEMORY_STORE_MAX_ENTRIES: usize = 80;
/// Warn threshold — when exceeded, nudge the agent to consolidate.
const MEMORY_STORE_WARN_ENTRIES: usize = 60;

#[async_trait]
impl Tool for MemorySaveTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "memory_save".to_string(),
            description: format!(
                "Save a durable fact, preference, workflow, or project detail to memory when it will likely matter again later. \
                 Each memory store has a soft limit of {} entries. When the store is near capacity, \
                 the tool returns a warning with current entries so you can consolidate related facts before adding new ones.",
                MEMORY_STORE_MAX_ENTRIES
            ),
            parameters: json!({
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Short stable label for the memory, like 'preferred_answer_style'"},
                    "content": {"type": "string", "description": "The durable fact to save. Keep it compact and information-dense."},
                    "kind": {"type": "string", "description": "One of fact, preference, workflow, task, project, contact"},
                    "confidence": {"type": "number", "description": "Confidence from 0 to 1 (default: 0.9)"}
                },
                "required": ["key", "content"]
            }),
            prompt_snippet: "- memory_save: Save durable user preferences, project facts, and recurring workflows that will matter in future turns".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let key = input
            .get("key")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("memory_save requires a key"))?
            .trim();
        let content = input
            .get("content")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("memory_save requires content"))?
            .trim();
        if key.is_empty() || content.is_empty() {
            return Err(AppError::invalid_input(
                "memory_save requires non-empty key and content",
            ));
        }

        let memory_scope_id = self.agent_id.as_deref().or(self.conversation_id.as_deref());
        let store = resolve_memory_write_store(&self.db, &self.workspace_id, memory_scope_id)?;
        let kind = input
            .get("kind")
            .and_then(|value| value.as_str())
            .unwrap_or("fact")
            .trim()
            .to_string();
        let confidence = input
            .get("confidence")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.9)
            .clamp(0.0, 1.0);
        let now = chrono::Utc::now().to_rfc3339();

        let existing = self.db.list_memory_entries(&store.id)?;

        // Duplicate prevention
        if let Some(entry) = existing.iter().find(|entry| entry.key == key) {
            let mut updated = entry.clone();
            updated.content = content.to_string();
            updated.kind = kind.clone();
            updated.confidence = updated.confidence.max(confidence);
            updated.source_conversation_id = self.conversation_id.clone();
            updated.updated_at = now;
            self.db.update_memory_entry(&updated)?;
            return Ok(ToolResult {
                content: format!(
                    "Updated memory '{}' in {} store ({} entries)",
                    key,
                    store.scope_type,
                    existing.len()
                ),
                metadata: Some(json!({
                    "id": updated.id,
                    "store_id": store.id,
                    "store_scope": store.scope_type,
                    "action": "updated",
                    "entry_count": existing.len(),
                })),
            });
        }

        // Capacity check
        let at_capacity = existing.len() >= MEMORY_STORE_MAX_ENTRIES;
        let near_capacity = existing.len() >= MEMORY_STORE_WARN_ENTRIES;

        let entry = MemoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            store_id: store.id.clone(),
            key: key.to_string(),
            content: content.to_string(),
            kind,
            source_session_id: None,
            source_conversation_id: self.conversation_id.clone(),
            source_message_id: None,
            confidence,
            recall_count: 0,
            last_recalled_at: None,
            is_pinned: false,
            created_at: now.clone(),
            updated_at: now,
        };
        self.db.create_memory_entry(&entry)?;

        let mut content_lines = vec![format!(
            "Saved memory '{}' in {} store",
            key, store.scope_type
        )];

        if at_capacity {
            content_lines.push(format!(
                "\nWARNING: Memory store is at capacity ({}/{} entries). \
                 You MUST consolidate before adding more: use memory_search to list entries, \
                 then merge related entries by updating them with broader, denser facts, \
                 or remove outdated ones.",
                existing.len() + 1,
                MEMORY_STORE_MAX_ENTRIES
            ));
        } else if near_capacity {
            content_lines.push(format!(
                "\nNOTE: Memory store is {}% full ({}/{} entries). \
                 Consider consolidating related entries into fewer, denser facts.",
                (existing.len() + 1) * 100 / MEMORY_STORE_MAX_ENTRIES,
                existing.len() + 1,
                MEMORY_STORE_MAX_ENTRIES
            ));
        }

        Ok(ToolResult {
            content: content_lines.join(""),
            metadata: Some(json!({
                "id": entry.id,
                "store_id": store.id,
                "store_scope": store.scope_type,
                "action": "created",
                "entry_count": existing.len() + 1,
                "at_capacity": at_capacity,
                "near_capacity": near_capacity,
            })),
        })
    }
}

// ── Memory Delete Tool ───────────────────────────────────────────────

pub struct MemoryDeleteTool {
    db: Database,
    workspace_id: String,
    conversation_id: Option<String>,
    agent_id: Option<String>,
}

impl MemoryDeleteTool {
    pub fn new(
        db: Database,
        workspace_id: String,
        conversation_id: Option<String>,
        agent_id: Option<String>,
    ) -> Self {
        Self {
            db,
            workspace_id,
            conversation_id,
            agent_id,
        }
    }
}

#[async_trait]
impl Tool for MemoryDeleteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "memory_delete".to_string(),
            description: "Remove a memory entry by id. Use this to clean up outdated, duplicated, or incorrect memories during consolidation.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "The memory entry id to delete"}
                },
                "required": ["id"]
            }),
            prompt_snippet: "- memory_delete: Remove outdated or duplicate memory entries during consolidation".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let id = input
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("memory_delete requires an id"))?;

        // Verify the entry is in an accessible store before deleting
        let memory_scope_id = self.agent_id.as_deref().or(self.conversation_id.as_deref());
        let (_, stores) = resolve_memory_stores(&self.db, &self.workspace_id, memory_scope_id)?;

        let mut found = false;
        for store in &stores {
            for entry in self.db.list_memory_entries(&store.id)? {
                if entry.id == id {
                    found = true;
                    break;
                }
            }
            if found {
                break;
            }
        }

        if !found {
            return Err(AppError::not_found(format!(
                "Memory entry {id} not found or not accessible in current scope"
            )));
        }

        self.db.delete_memory_entry(id)?;
        Ok(ToolResult {
            content: format!("Deleted memory entry {id}"),
            metadata: Some(json!({"id": id, "action": "deleted"})),
        })
    }
}

impl MemoryGetTool {
    pub fn new(
        db: Database,
        workspace_id: String,
        conversation_id: Option<String>,
        agent_id: Option<String>,
    ) -> Self {
        Self {
            db,
            workspace_id,
            conversation_id,
            agent_id,
        }
    }
}

#[async_trait]
impl Tool for MemoryGetTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "memory_get".to_string(),
            description: "Fetch a specific saved memory entry by id after using memory_search."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Memory entry id returned by memory_search"}
                },
                "required": ["id"]
            }),
            prompt_snippet:
                "- memory_get: Read the full details of a specific saved memory after searching"
                    .to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let id = input
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("memory_get requires an id"))?;

        let memory_scope_id = self.agent_id.as_deref().or(self.conversation_id.as_deref());
        let (_, stores) = resolve_memory_stores(&self.db, &self.workspace_id, memory_scope_id)?;

        for store in stores {
            for entry in self.db.list_memory_entries(&store.id)? {
                if entry.id == id {
                    let mut updated = entry.clone();
                    updated.recall_count += 1;
                    updated.last_recalled_at = Some(chrono::Utc::now().to_rfc3339());
                    updated.updated_at = chrono::Utc::now().to_rfc3339();
                    let _ = self.db.update_memory_entry(&updated);

                    return Ok(ToolResult {
                        content: format!(
                            "id: {}\nkey: {}\nkind: {}\nstore_scope: {}\nconfidence: {:.2}\ncontent: {}",
                            entry.id,
                            entry.key,
                            entry.kind,
                            store.scope_type,
                            entry.confidence,
                            entry.content,
                        ),
                        metadata: Some(json!({
                            "id": entry.id,
                            "store_id": store.id,
                            "store_scope": store.scope_type,
                            "key": entry.key,
                            "kind": entry.kind,
                            "content": entry.content,
                            "confidence": entry.confidence,
                            "source_conversation_id": entry.source_conversation_id,
                            "source_message_id": entry.source_message_id,
                        })),
                    });
                }
            }
        }

        Err(AppError::not_found(format!(
            "Memory entry not found or not accessible: {id}"
        )))
    }
}

// ── Session Search Tool ──────────────────────────────────────────────

pub struct SessionSearchTool {
    db: Database,
    workspace_id: String,
}

impl SessionSearchTool {
    pub fn new(db: Database, workspace_id: String) -> Self {
        Self { db, workspace_id }
    }
}

#[async_trait]
impl Tool for SessionSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "session_search".to_string(),
            description: "Search past conversations across all sessions to recall specific discussions, decisions, or facts. \
                          Use this when the user references something from a prior conversation or when you suspect relevant cross-session context exists. \
                          Returns matching message snippets with conversation IDs and dates.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Keywords or phrase to search for in past conversations"},
                    "limit": {"type": "integer", "description": "Maximum results to return (default: 5, max: 20)"}
                },
                "required": ["query"]
            }),
            prompt_snippet: "- session_search: Search past conversations when the user references something from before or you need cross-session recall".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let query = input
            .get("query")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let limit = input
            .get("limit")
            .and_then(|value| value.as_u64())
            .unwrap_or(5)
            .clamp(1, 20) as usize;

        if query.is_empty() {
            return Ok(ToolResult {
                content: "Please provide a search query.".to_string(),
                metadata: Some(json!({"results": []})),
            });
        }

        let workspace_scope = maybe_workspace_scope(&self.workspace_id);
        let results = self.db.search_messages(query, workspace_scope, limit)?;

        if results.is_empty() {
            return Ok(ToolResult {
                content: format!("No past conversations found matching: {query}"),
                metadata: Some(json!({"results": [], "query": query})),
            });
        }

        let mut lines = Vec::new();
        let mut json_results = Vec::new();

        for result in results {
            lines.push(format!(
                "- [{}] {} ({}): {}",
                result.conversation_id,
                result.role,
                result.created_at,
                result.content_snippet.replace('\n', " ")
            ));
            json_results.push(json!({
                "message_id": result.message_id,
                "conversation_id": result.conversation_id,
                "role": result.role,
                "snippet": result.content_snippet,
                "created_at": result.created_at,
            }));
        }

        Ok(ToolResult {
            content: format!(
                "Past conversation matches for '{}' ({} results):\n{}",
                query,
                json_results.len(),
                lines.join("\n")
            ),
            metadata: Some(json!({"results": json_results, "query": query})),
        })
    }
}

pub struct ReadTool {
    root: PathBuf,
    /// Additional directories the read tool is allowed to access (e.g. skill dirs).
    extra_allowed: Vec<PathBuf>,
}

impl ReadTool {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            extra_allowed: default_skill_read_dirs(),
        }
    }

    pub fn with_extra_allowed(root: PathBuf, mut extra_allowed: Vec<PathBuf>) -> Self {
        // Always include default skill directories
        for dir in default_skill_read_dirs() {
            if !extra_allowed.contains(&dir) {
                extra_allowed.push(dir);
            }
        }
        Self {
            root,
            extra_allowed,
        }
    }
}

/// Default directories the read tool should always be able to access for skills.
fn default_skill_read_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".agents").join("skills"));
        dirs.push(home.join(".claude").join("skills"));
        dirs.push(home.join(".pi").join("agent").join("skills"));
    }
    dirs
}

#[async_trait]
impl Tool for ReadTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read".to_string(),
            description: "Read a file or directory. Supports offset and limit for text files."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path to read (relative to workspace root)"},
                    "offset": {"type": "integer", "description": "Line number to start reading from (1-indexed, default: 1)"},
                    "limit": {"type": "integer", "description": "Maximum number of lines to read (default: 200)"}
                },
                "required": ["path"]
            }),
            prompt_snippet: "- read: Read file contents or list a directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("read requires a path"))?;
        let offset = input
            .get("offset")
            .and_then(|value| value.as_u64())
            .unwrap_or(1) as usize;
        let limit = input
            .get("limit")
            .and_then(|value| value.as_u64())
            .unwrap_or(200) as usize;

        // Try workspace root first, then check extra allowed dirs (skill dirs)
        let target = match normalize_path(&self.root, path) {
            Ok(p) => p,
            Err(_) => {
                log::info!(
                    "read: path {:?} not in workspace {:?}, trying {} extra dirs",
                    path,
                    self.root,
                    self.extra_allowed.len()
                );
                self.resolve_extra_allowed(path)?
            }
        };

        if target.is_dir() {
            let mut entries = std::fs::read_dir(&target)?
                .filter_map(Result::ok)
                .map(|entry| {
                    let mut name = entry.file_name().to_string_lossy().to_string();
                    if entry.path().is_dir() {
                        name.push('/');
                    }
                    name
                })
                .collect::<Vec<_>>();
            entries.sort();
            return Ok(ToolResult {
                content: entries.join("\n"),
                metadata: None,
            });
        }

        let content = std::fs::read_to_string(&target)?;
        let lines = content.lines().collect::<Vec<_>>();
        let start = offset.saturating_sub(1);
        let end = usize::min(start + limit, lines.len());
        let body = lines[start..end]
            .iter()
            .enumerate()
            .map(|(index, line)| format!("{}: {}", start + index + 1, line))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(ToolResult {
            content: body,
            metadata: Some(json!({
                "filePath": target.to_string_lossy(),
                "filename": target.file_name().and_then(|value| value.to_str()),
            })),
        })
    }
}

impl ReadTool {
    /// Check if an absolute path falls within one of the extra allowed directories.
    fn resolve_extra_allowed(&self, raw: &str) -> Result<PathBuf, AppError> {
        let candidate = Path::new(raw);
        if !candidate.is_absolute() {
            return Err(AppError::invalid_input(format!(
                "Path is outside the allowed workspace: {raw}"
            )));
        }

        let normalized = candidate.components().fold(PathBuf::new(), |mut acc, c| {
            use std::path::Component;
            match c {
                Component::CurDir => {}
                Component::ParentDir => {
                    acc.pop();
                }
                other => acc.push(other.as_os_str()),
            }
            acc
        });

        for allowed in &self.extra_allowed {
            if normalized.starts_with(allowed) {
                log::debug!(
                    "read: path {:?} allowed by extra dir {:?}",
                    normalized,
                    allowed
                );
                return Ok(normalized);
            }
        }

        log::debug!(
            "read: path {:?} rejected. extra_allowed={:?}",
            normalized,
            self.extra_allowed
        );
        Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {raw}"
        )))
    }
}

pub struct WriteTool {
    root: PathBuf,
}

impl WriteTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for WriteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "write".to_string(),
            description: format!(
                "Write a full file to disk, creating parent directories when needed. \
                 CRITICAL: 'path' MUST be the FIRST key in the JSON arguments — before 'content'. \
                 The path must include subdirectories relative to workspace root (e.g. \"pong/index.html\", not just \"index.html\"). \
                 Workspace root: {}",
                self.root.display()
            ),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "REQUIRED FIRST — file path including subdirectories, relative to workspace root (e.g. 'myproject/src/main.rs')"},
                    "content": {"type": "string", "description": "The full file content to write"}
                },
                "required": ["path", "content"],
                "propertyOrder": ["path", "content"]
            }),
            prompt_snippet: format!(
                "- write({{\"path\": \"subdir/file.ext\", \"content\": \"...\"}}): Write a file. \
                 Path MUST be first and include subdirectories relative to workspace root: {}",
                self.root.display()
            ),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        // Check canonical names first, then common aliases models may use
        let path = input
            .get("path")
            .or_else(|| input.get("file_path"))
            .or_else(|| input.get("filepath"))
            .or_else(|| input.get("filename"))
            .or_else(|| input.get("file"))
            .and_then(|value| value.as_str());
        let content = input
            .get("content")
            .or_else(|| input.get("text"))
            .or_else(|| input.get("body"))
            .or_else(|| input.get("data"))
            .and_then(|value| value.as_str());
        // Optional target_dir hint — used when path is missing to place the file
        // in the correct subdirectory instead of the workspace root.
        let target_dir = input
            .get("target_dir")
            .or_else(|| input.get("directory"))
            .or_else(|| input.get("dir"))
            .and_then(|value| value.as_str());

        // If path is missing, try to recover or return a helpful soft error
        let (path, content) = match (path, content) {
            (Some(p), Some(c)) => (p.to_string(), c.to_string()),
            (Some(p), None) => {
                // Model sent path but no content — maybe it put content in another field
                // Check all string values that aren't "path"
                let fallback_content = input.as_object().and_then(|obj| {
                    obj.iter()
                        .find(|(k, v)| *k != "path" && v.is_string())
                        .and_then(|(_, v)| v.as_str())
                });
                match fallback_content {
                    Some(c) => (p.to_string(), c.to_string()),
                    None => return Ok(ToolResult {
                        content: format!(
                            "Error: write requires both 'path' and 'content' parameters.\n\
                             You provided path=\"{}\" but no content.\n\
                             Usage: write({{\"path\": \"subdir/file.ext\", \"content\": \"...\"}})\n\
                             IMPORTANT: path MUST come FIRST in the JSON and include the full relative path from workspace root: {}",
                            p, self.root.display()
                        ),
                        metadata: Some(json!({"error": "missing_content"})),
                    }),
                }
            }
            (None, Some(_c)) => {
                // Model sent content but no path. This often happens when the model
                // generates {"content":"...huge file...","path":"foo.html"} and output
                // gets truncated before "path" is emitted.
                // Return an error asking the model to retry with path FIRST.
                // Do NOT guess the filename — guessing loses the intended directory
                // and writes to the wrong location.
                let workspace = self.root.display();
                let dir_hint = target_dir
                    .map(|d| format!(" The user wanted the file in directory: {d}."))
                    .unwrap_or_default();
                return Ok(ToolResult {
                    content: format!(
                        "Error: write is missing the 'path' parameter — the file was NOT written.\n\
                         This usually happens when 'content' appears before 'path' in the JSON \
                         and the output gets truncated.\n\
                         IMPORTANT: You MUST call write again with 'path' as the FIRST key.\n\
                         Workspace root: {workspace}\n\
                         {dir_hint}\n\
                         Usage: write({{\"path\": \"subdir/filename.ext\", \"content\": \"...\"}})\n\
                         Include the full relative path (e.g. \"pong/index.html\", not just \"index.html\")."
                    ),
                    metadata: Some(json!({"error": "missing_path_truncated"})),
                });
            }
            (None, None) => {
                // Check if the model sent a single string with everything in it
                // or used non-standard parameter names
                let obj = input.as_object();
                let keys: Vec<String> =
                    obj.map(|o| o.keys().cloned().collect()).unwrap_or_default();
                return Ok(ToolResult {
                    content: format!(
                        "Error: write requires 'path' and 'content' parameters.\n\
                         Received keys: [{}]\n\
                         Workspace root: {}\n\
                         Usage: write({{\"path\": \"subdir/filename.ext\", \"content\": \"...\"}})\n\
                         IMPORTANT: 'path' MUST be the FIRST key and include subdirectories.",
                        keys.join(", "),
                        self.root.display()
                    ),
                    metadata: Some(json!({"error": "missing_params"})),
                });
            }
        };

        let target = normalize_path(&self.root, &path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, &content)?;
        Ok(ToolResult {
            content: format!("Wrote {} bytes to {}", content.len(), target.display()),
            metadata: Some(json!({
                "filePath": target.to_string_lossy(),
                "filename": target.file_name().and_then(|value| value.to_str()),
                "fileContent": content,
            })),
        })
    }
}

/// Try to guess a reasonable filename from the file content.
fn guess_filename(content: &str) -> Option<&str> {
    let trimmed = content.trim();
    if trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<HTML")
    {
        Some("index.html")
    } else if trimmed.starts_with("<?xml") || trimmed.starts_with("<svg") {
        Some("index.svg")
    } else if trimmed.starts_with("<") && trimmed.contains("className=") {
        // JSX/TSX component
        Some("page.tsx")
    } else if trimmed.starts_with("import ") || trimmed.starts_with("export ") {
        if trimmed.contains("React") || trimmed.contains("jsx") || trimmed.contains("className") {
            Some("page.tsx")
        } else {
            Some("index.ts")
        }
    } else if trimmed.contains("export ") || trimmed.contains("import ") {
        Some("index.ts")
    } else if trimmed.starts_with("{") || trimmed.starts_with("[") {
        Some("data.json")
    } else if trimmed.starts_with("---") {
        Some("document.md")
    } else if trimmed.starts_with("@")
        || trimmed.starts_with(":root")
        || trimmed.starts_with("body")
        || trimmed.starts_with("*")
        || trimmed.contains("--color")
    {
        Some("styles.css")
    } else if trimmed.starts_with("// @ts-")
        || trimmed.starts_with("'use ")
        || trimmed.starts_with("\"use ")
    {
        Some("index.ts")
    } else {
        None
    }
}

pub struct ListFilesTool {
    root: PathBuf,
    /// Additional directories the ls tool is allowed to access (e.g. skill dirs).
    extra_allowed: Vec<PathBuf>,
}

impl ListFilesTool {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            extra_allowed: default_skill_read_dirs(),
        }
    }

    pub fn with_extra_allowed(root: PathBuf, mut extra_allowed: Vec<PathBuf>) -> Self {
        for dir in default_skill_read_dirs() {
            if !extra_allowed.contains(&dir) {
                extra_allowed.push(dir);
            }
        }
        Self {
            root,
            extra_allowed,
        }
    }

    /// Check if an absolute path falls within one of the extra allowed directories.
    fn resolve_extra_allowed(&self, raw: &str) -> Result<PathBuf, AppError> {
        let candidate = Path::new(raw);
        if !candidate.is_absolute() {
            return Err(AppError::invalid_input(format!(
                "Path is outside the allowed workspace: {raw}"
            )));
        }

        let normalized = candidate.components().fold(PathBuf::new(), |mut acc, c| {
            use std::path::Component;
            match c {
                Component::CurDir => {}
                Component::ParentDir => {
                    acc.pop();
                }
                other => acc.push(other.as_os_str()),
            }
            acc
        });

        for allowed in &self.extra_allowed {
            if normalized.starts_with(allowed) {
                return Ok(normalized);
            }
        }

        Err(AppError::invalid_input(format!(
            "Path is outside the allowed workspace: {raw}"
        )))
    }
}

#[async_trait]
impl Tool for ListFilesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "ls".to_string(),
            description: "List files under a directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path to list (relative to workspace root, default: '.')"}
                }
            }),
            prompt_snippet: "- ls: List files in a directory".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let path = input
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or(".");
        let target = match normalize_path(&self.root, path) {
            Ok(p) => p,
            Err(_) => self.resolve_extra_allowed(path)?,
        };
        let mut entries = std::fs::read_dir(&target)?
            .filter_map(Result::ok)
            .map(|entry| {
                let mut name = entry.file_name().to_string_lossy().to_string();
                if entry.path().is_dir() {
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
}

pub struct BashTool {
    root: PathBuf,
}

impl BashTool {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}

#[async_trait]
impl Tool for BashTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "bash".to_string(),
            description: "Execute a bash command in the current working directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The bash command to execute"},
                    "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default: 120000)"}
                },
                "required": ["command"]
            }),
            prompt_snippet: "- bash: Execute shell commands in the workspace".to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let command = input
            .get("command")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::invalid_input("bash requires a command"))?;
        let timeout_ms = input
            .get("timeout_ms")
            .and_then(|value| value.as_u64())
            .unwrap_or(120_000);

        let mut child = Command::new("bash")
            .arg("-lc")
            .arg(command)
            .current_dir(&self.root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|err| AppError::process_spawn(format!("Failed to spawn bash: {err}")))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            let mut lines = Vec::new();
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    lines.push(line);
                }
            }
            lines
        });

        let stderr_task = tokio::spawn(async move {
            let mut lines = Vec::new();
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    lines.push(line);
                }
            }
            lines
        });

        let status =
            tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), child.wait())
                .await
                .map_err(|_| {
                    AppError::process_kill(format!("bash timed out after {timeout_ms}ms"))
                })?
                .map_err(|err| AppError::process_kill(format!("Failed to wait for bash: {err}")))?;

        let stdout_lines = stdout_task.await.unwrap_or_default();
        let stderr_lines = stderr_task.await.unwrap_or_default();
        let mut output = stdout_lines.join("\n");
        if !stderr_lines.is_empty() {
            if !output.is_empty() {
                output.push_str("\n");
            }
            output.push_str(&stderr_lines.join("\n"));
        }
        if output.is_empty() {
            output = "(no output)".to_string();
        }
        if !status.success() {
            output.push_str(&format!("\n\nCommand exited with status {}", status));
        }

        Ok(ToolResult {
            content: output,
            metadata: Some(json!({
                "result": if status.success() { "success" } else { "failure" },
            })),
        })
    }
}

pub fn default_tools(root: &Path) -> Vec<Arc<dyn Tool>> {
    default_tools_with_skill_dirs(root, Vec::new())
}

pub fn default_tools_with_skill_dirs(root: &Path, skill_dirs: Vec<PathBuf>) -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(ReadTool::with_extra_allowed(
            root.to_path_buf(),
            skill_dirs.clone(),
        )),
        Arc::new(WriteTool::new(root.to_path_buf())),
        Arc::new(ListFilesTool::with_extra_allowed(
            root.to_path_buf(),
            skill_dirs,
        )),
        Arc::new(BashTool::new(root.to_path_buf())),
    ]
}

// ── Question tool ─────────────────────────────────────────────────────

/// A tool that lets the agent ask the user a question and wait for an answer.
/// The tool emits a `"question"` stream event, then parks on a oneshot channel
/// until the frontend calls `khadim_answer_question`.
pub struct QuestionTool {
    session_id: String,
    workspace_id: String,
    tx: tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
    manager: Arc<KhadimManager>,
}

impl QuestionTool {
    pub fn new(
        session_id: String,
        workspace_id: String,
        tx: tokio::sync::mpsc::UnboundedSender<AgentStreamEvent>,
        manager: Arc<KhadimManager>,
    ) -> Self {
        Self {
            session_id,
            workspace_id,
            tx,
            manager,
        }
    }
}

#[async_trait]
impl Tool for QuestionTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "question".to_string(),
            description: "Ask the user a question when you need clarification or a decision. \
                          Provide a list of questions, each with a header, the question text, \
                          and a set of option labels. The user's answer is returned as text."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "description": "One or more questions to present to the user",
                        "items": {
                            "type": "object",
                            "properties": {
                                "header": {
                                    "type": "string",
                                    "description": "Short label for the question category"
                                },
                                "question": {
                                    "type": "string",
                                    "description": "The question text to display"
                                },
                                "options": {
                                    "type": "array",
                                    "description": "Suggested answer options",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "label": { "type": "string" },
                                            "description": { "type": "string" }
                                        },
                                        "required": ["label"]
                                    }
                                },
                                "multiple": {
                                    "type": "boolean",
                                    "description": "Whether the user may select more than one option (default false)"
                                },
                                "custom": {
                                    "type": "boolean",
                                    "description": "Whether the user may type a free-form answer (default true)"
                                }
                            },
                            "required": ["header", "question", "options"]
                        }
                    }
                },
                "required": ["questions"]
            }),
            prompt_snippet:
                "- question: Ask the user a question when you need clarification or a decision"
                    .to_string(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let questions = input
            .get("questions")
            .cloned()
            .unwrap_or(Value::Array(vec![]));

        if !questions.is_array() || questions.as_array().map(|a| a.is_empty()).unwrap_or(true) {
            return Err(AppError::invalid_input(
                "question tool requires a non-empty 'questions' array",
            ));
        }

        let part_id = uuid::Uuid::new_v4().to_string();

        // Emit the question event so the frontend shows the overlay.
        let _ = self.tx.send(AgentStreamEvent {
            workspace_id: self.workspace_id.clone(),
            session_id: self.session_id.clone(),
            event_type: "question".to_string(),
            content: None,
            metadata: Some(json!({
                "id": part_id,
                "questions": questions,
            })),
        });

        // Park a oneshot channel and wait for the answer.
        let (answer_tx, answer_rx) = tokio::sync::oneshot::channel::<String>();
        self.manager
            .park_question(self.session_id.clone(), answer_tx);

        let answer = answer_rx.await.map_err(|_| {
            AppError::backend_busy("Question was cancelled (session aborted or dismissed)")
        })?;

        // Emit a step_complete so the thinking-steps panel records it.
        let _ = self.tx.send(AgentStreamEvent {
            workspace_id: self.workspace_id.clone(),
            session_id: self.session_id.clone(),
            event_type: "step_complete".to_string(),
            content: Some(answer.clone()),
            metadata: Some(json!({
                "id": part_id,
                "title": "Question answered",
                "tool": "question",
                "result": answer,
            })),
        });

        Ok(ToolResult {
            content: format!("User answered: {answer}"),
            metadata: None,
        })
    }
}
