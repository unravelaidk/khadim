use crate::error::AppError;
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// All SQLite access goes through this handle.
pub struct Database {
    conn: Mutex<Connection>,
}

// ── Row types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub backend: String,          // "opencode" | "claude_code" | "khadim"
    pub execution_target: String, // "local" | "sandbox"
    pub sandbox_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub workspace_id: String,
    pub backend: String,
    pub backend_session_id: Option<String>,
    pub backend_session_cwd: Option<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub title: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Cumulative input tokens used in this conversation (context sent to model).
    pub input_tokens: i64,
    /// Cumulative output tokens generated in this conversation.
    pub output_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
    pub metadata: Option<String>, // JSON blob for tool calls, diffs, etc.
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

// ── Database impl ────────────────────────────────────────────────────

impl Database {
    /// Open (or create) the database at the Khadim data directory.
    pub fn open() -> Result<Self, AppError> {
        let data_dir = Self::data_dir()?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::io(format!("Failed to create data dir: {e}")))?;

        let db_path = data_dir.join("khadim.db");
        let conn = Connection::open(&db_path)?;

        // Enable WAL for concurrent reads
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (for tests).
    #[allow(dead_code)]
    pub fn open_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn data_dir() -> Result<PathBuf, AppError> {
        dirs::data_dir()
            .map(|d| d.join("khadim"))
            .ok_or_else(|| AppError::io("Cannot determine system data directory"))
    }

    fn migrate(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS workspaces (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                repo_path       TEXT NOT NULL,
                worktree_path   TEXT,
                branch          TEXT,
                backend         TEXT NOT NULL DEFAULT 'opencode',
                execution_target TEXT NOT NULL DEFAULT 'local',
                sandbox_id      TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id                  TEXT PRIMARY KEY,
                workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
                backend             TEXT NOT NULL,
                backend_session_id  TEXT,
                backend_session_cwd TEXT,
                branch              TEXT,
                worktree_path       TEXT,
                title               TEXT,
                is_active           INTEGER NOT NULL DEFAULT 1,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                metadata        TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_workspace
                ON conversations(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id);
            ",
        )?;

        // Additive migrations — ignore errors if columns already exist.
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN backend_session_cwd TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN branch TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN worktree_path TEXT",
            [],
        );

        Ok(())
    }

    // ── Workspace CRUD ───────────────────────────────────────────────

    pub fn create_workspace(&self, ws: &Workspace) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                ws.id,
                ws.name,
                ws.repo_path,
                ws.worktree_path,
                ws.branch,
                ws.backend,
                ws.execution_target,
                ws.sandbox_id,
                ws.created_at,
                ws.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, created_at, updated_at
             FROM workspaces ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                repo_path: row.get(2)?,
                worktree_path: row.get(3)?,
                branch: row.get(4)?,
                backend: row.get(5)?,
                execution_target: row.get(6)?,
                sandbox_id: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_workspace(&self, id: &str) -> Result<Workspace, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, created_at, updated_at
             FROM workspaces WHERE id = ?1",
            params![id],
            |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    repo_path: row.get(2)?,
                    worktree_path: row.get(3)?,
                    branch: row.get(4)?,
                    backend: row.get(5)?,
                    execution_target: row.get(6)?,
                    sandbox_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .map_err(|_| AppError::not_found(format!("Workspace {id} not found")))
    }

    pub fn update_workspace_backend(&self, id: &str, backend: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE workspaces SET backend = ?1, updated_at = ?2 WHERE id = ?3",
            params![backend, now, id],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Workspace {id} not found")));
        }
        Ok(())
    }

    pub fn update_workspace_branch(&self, id: &str, branch: Option<&str>) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE workspaces SET branch = ?1, updated_at = ?2 WHERE id = ?3",
            params![branch, now, id],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Workspace {id} not found")));
        }
        Ok(())
    }

    pub fn delete_workspace(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        // Delete messages belonging to conversations in this workspace
        conn.execute(
            "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ?1)",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM conversations WHERE workspace_id = ?1",
            params![id],
        )?;
        let changed = conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Workspace {id} not found")));
        }
        Ok(())
    }

    // ── Conversation CRUD ────────────────────────────────────────────

    pub fn create_conversation(&self, conv: &Conversation) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO conversations (id, workspace_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                conv.id,
                conv.workspace_id,
                conv.backend,
                conv.backend_session_id,
                conv.backend_session_cwd,
                conv.branch,
                conv.worktree_path,
                conv.title,
                conv.is_active as i32,
                conv.created_at,
                conv.updated_at,
                conv.input_tokens,
                conv.output_tokens,
            ],
        )?;
        Ok(())
    }

    /// Update the token usage for a conversation. Replaces the stored values
    /// (OpenCode reports cumulative per-request context, not deltas).
    pub fn update_conversation_tokens(
        &self,
        id: &str,
        input_tokens: i64,
        output_tokens: i64,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET input_tokens = ?1, output_tokens = ?2, updated_at = ?3 WHERE id = ?4",
            params![input_tokens, output_tokens, now, id],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![id],
        )?;
        let changed = conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Conversation {id} not found")));
        }
        Ok(())
    }

    pub fn list_conversations(&self, workspace_id: &str) -> Result<Vec<Conversation>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens
             FROM conversations WHERE workspace_id = ?1 ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                backend: row.get(2)?,
                backend_session_id: row.get(3)?,
                backend_session_cwd: row.get(4)?,
                branch: row.get(5)?,
                worktree_path: row.get(6)?,
                title: row.get(7)?,
                is_active: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                input_tokens: row.get::<_, i64>(11).unwrap_or(0),
                output_tokens: row.get::<_, i64>(12).unwrap_or(0),
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_conversation(&self, id: &str) -> Result<Conversation, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens
             FROM conversations WHERE id = ?1",
            params![id],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    backend: row.get(2)?,
                    backend_session_id: row.get(3)?,
                    backend_session_cwd: row.get(4)?,
                    branch: row.get(5)?,
                    worktree_path: row.get(6)?,
                    title: row.get(7)?,
                    is_active: row.get::<_, i32>(8)? != 0,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    input_tokens: row.get::<_, i64>(11).unwrap_or(0),
                    output_tokens: row.get::<_, i64>(12).unwrap_or(0),
                })
            },
        )
        .map_err(|_| AppError::not_found(format!("Conversation {id} not found")))
    }

    pub fn deactivate_workspace_conversations(&self, workspace_id: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET is_active = 0, updated_at = ?1 WHERE workspace_id = ?2 AND is_active = 1",
            params![now, workspace_id],
        )?;
        Ok(())
    }

    pub fn set_conversation_backend_session(
        &self,
        id: &str,
        backend_session_id: &str,
        backend_session_cwd: Option<&str>,
        branch: Option<&str>,
        worktree_path: Option<&str>,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET backend_session_id = ?1, backend_session_cwd = ?2, branch = ?3, worktree_path = ?4, updated_at = ?5 WHERE id = ?6",
            params![backend_session_id, backend_session_cwd, branch, worktree_path, now, id],
        )?;
        Ok(())
    }

    // ── Message CRUD ─────────────────────────────────────────────────

    pub fn insert_message(&self, msg: &ChatMessage) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                msg.id,
                msg.conversation_id,
                msg.role,
                msg.content,
                msg.metadata,
                msg.created_at,
            ],
        )?;
        conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![msg.created_at, msg.conversation_id],
        )?;
        Ok(())
    }

    pub fn list_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, role, content, metadata, created_at
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    // ── Settings ─────────────────────────────────────────────────────

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::db(e.to_string())),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}
