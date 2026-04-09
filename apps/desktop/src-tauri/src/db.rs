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
    pub sandbox_root_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub backend: String,
    pub substrate: String,
    pub wasm_enabled: bool,
    pub docker_image: Option<String>,
    pub docker_workdir: Option<String>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<i64>,
    pub ssh_user: Option<String>,
    pub ssh_path: Option<String>,
    pub source_cwd: String,
    pub effective_cwd: String,
    pub sandbox_id: Option<String>,
    pub sandbox_root_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSession {
    pub id: String,
    pub environment_id: String,
    pub backend: String,
    pub backend_session_id: Option<String>,
    pub backend_session_cwd: Option<String>,
    pub shared: bool,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub workspace_id: String,
    pub environment_id: Option<String>,
    pub runtime_session_id: Option<String>,
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
                sandbox_root_path TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id                  TEXT PRIMARY KEY,
                workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
                environment_id      TEXT REFERENCES environments(id),
                runtime_session_id  TEXT REFERENCES runtime_sessions(id),
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

            CREATE TABLE IF NOT EXISTS environments (
                id                TEXT PRIMARY KEY,
                workspace_id      TEXT NOT NULL REFERENCES workspaces(id),
                name              TEXT NOT NULL,
                backend           TEXT NOT NULL,
                execution_target  TEXT NOT NULL DEFAULT 'local',
                wasm_enabled      INTEGER NOT NULL DEFAULT 0,
                docker_image      TEXT,
                docker_workdir    TEXT,
                ssh_host          TEXT,
                ssh_port          INTEGER,
                ssh_user          TEXT,
                ssh_path          TEXT,
                source_cwd        TEXT NOT NULL,
                effective_cwd     TEXT NOT NULL,
                branch            TEXT,
                worktree_path     TEXT,
                sandbox_id        TEXT,
                sandbox_root_path TEXT,
                created_at        TEXT NOT NULL,
                updated_at        TEXT NOT NULL,
                last_used_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runtime_sessions (
                id                  TEXT PRIMARY KEY,
                environment_id      TEXT NOT NULL REFERENCES environments(id),
                backend             TEXT NOT NULL,
                backend_session_id  TEXT,
                backend_session_cwd TEXT,
                shared              INTEGER NOT NULL DEFAULT 0,
                status              TEXT NOT NULL DEFAULT 'idle',
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL,
                last_active_at      TEXT NOT NULL
            );

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
        let _ = conn.execute("ALTER TABLE conversations ADD COLUMN branch TEXT", []);
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN worktree_path TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN environment_id TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE conversations ADD COLUMN runtime_session_id TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE workspaces ADD COLUMN sandbox_root_path TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE environments ADD COLUMN wasm_enabled INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute("ALTER TABLE environments ADD COLUMN docker_image TEXT", []);
        let _ = conn.execute(
            "ALTER TABLE environments ADD COLUMN docker_workdir TEXT",
            [],
        );
        let _ = conn.execute("ALTER TABLE environments ADD COLUMN ssh_host TEXT", []);
        let _ = conn.execute("ALTER TABLE environments ADD COLUMN ssh_port INTEGER", []);
        let _ = conn.execute("ALTER TABLE environments ADD COLUMN ssh_user TEXT", []);
        let _ = conn.execute("ALTER TABLE environments ADD COLUMN ssh_path TEXT", []);

        conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_conversations_workspace
                ON conversations(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_environment
                ON conversations(environment_id);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_environments_workspace
                ON environments(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_runtime_sessions_environment
                ON runtime_sessions(environment_id);
            ",
        )?;

        Ok(())
    }

    // ── Workspace CRUD ───────────────────────────────────────────────

    pub fn create_workspace(&self, ws: &Workspace) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, sandbox_root_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                ws.id,
                ws.name,
                ws.repo_path,
                ws.worktree_path,
                ws.branch,
                ws.backend,
                ws.execution_target,
                ws.sandbox_id,
                ws.sandbox_root_path,
                ws.created_at,
                ws.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, sandbox_root_path, created_at, updated_at
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
                sandbox_root_path: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_workspace(&self, id: &str) -> Result<Workspace, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, name, repo_path, worktree_path, branch, backend, execution_target, sandbox_id, sandbox_root_path, created_at, updated_at
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
                    sandbox_root_path: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
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

    pub fn update_workspace_execution_target(
        &self,
        id: &str,
        execution_target: &str,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE workspaces SET execution_target = ?1, updated_at = ?2 WHERE id = ?3",
            params![execution_target, now, id],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Workspace {id} not found")));
        }
        Ok(())
    }

    pub fn update_workspace_sandbox(
        &self,
        id: &str,
        sandbox_id: &str,
        sandbox_root_path: &str,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE workspaces SET sandbox_id = ?1, sandbox_root_path = ?2, updated_at = ?3 WHERE id = ?4",
            params![sandbox_id, sandbox_root_path, now, id],
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
            "INSERT INTO conversations (id, workspace_id, environment_id, runtime_session_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                conv.id,
                conv.workspace_id,
                conv.environment_id,
                conv.runtime_session_id,
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
            "SELECT id, workspace_id, environment_id, runtime_session_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens
             FROM conversations WHERE workspace_id = ?1 ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                environment_id: row.get(2)?,
                runtime_session_id: row.get(3)?,
                backend: row.get(4)?,
                backend_session_id: row.get(5)?,
                backend_session_cwd: row.get(6)?,
                branch: row.get(7)?,
                worktree_path: row.get(8)?,
                title: row.get(9)?,
                is_active: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                input_tokens: row.get::<_, i64>(13).unwrap_or(0),
                output_tokens: row.get::<_, i64>(14).unwrap_or(0),
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_conversation(&self, id: &str) -> Result<Conversation, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, environment_id, runtime_session_id, backend, backend_session_id, backend_session_cwd, branch, worktree_path, title, is_active, created_at, updated_at, input_tokens, output_tokens
             FROM conversations WHERE id = ?1",
            params![id],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    environment_id: row.get(2)?,
                    runtime_session_id: row.get(3)?,
                    backend: row.get(4)?,
                    backend_session_id: row.get(5)?,
                    backend_session_cwd: row.get(6)?,
                    branch: row.get(7)?,
                    worktree_path: row.get(8)?,
                    title: row.get(9)?,
                    is_active: row.get::<_, i32>(10)? != 0,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                    input_tokens: row.get::<_, i64>(13).unwrap_or(0),
                    output_tokens: row.get::<_, i64>(14).unwrap_or(0),
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

    pub fn set_conversation_environment(
        &self,
        id: &str,
        environment_id: Option<&str>,
        runtime_session_id: Option<&str>,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET environment_id = ?1, runtime_session_id = ?2, updated_at = ?3 WHERE id = ?4",
            params![environment_id, runtime_session_id, now, id],
        )?;
        Ok(())
    }

    // ── Environment CRUD ──────────────────────────────────────────────

    pub fn create_environment(&self, environment: &Environment) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO environments (id, workspace_id, name, backend, execution_target, wasm_enabled, docker_image, docker_workdir, ssh_host, ssh_port, ssh_user, ssh_path, source_cwd, effective_cwd, sandbox_id, sandbox_root_path, created_at, updated_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                environment.id,
                environment.workspace_id,
                environment.name,
                environment.backend,
                environment.substrate,
                environment.wasm_enabled as i32,
                environment.docker_image,
                environment.docker_workdir,
                environment.ssh_host,
                environment.ssh_port,
                environment.ssh_user,
                environment.ssh_path,
                environment.source_cwd,
                environment.effective_cwd,
                environment.sandbox_id,
                environment.sandbox_root_path,
                environment.created_at,
                environment.updated_at,
                environment.last_used_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_environments(&self, workspace_id: &str) -> Result<Vec<Environment>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, backend, execution_target, wasm_enabled, docker_image, docker_workdir, ssh_host, ssh_port, ssh_user, ssh_path, source_cwd, effective_cwd, sandbox_id, sandbox_root_path, created_at, updated_at, last_used_at
             FROM environments WHERE workspace_id = ?1 ORDER BY last_used_at DESC, created_at DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(Environment {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                backend: row.get(3)?,
                substrate: row.get(4)?,
                wasm_enabled: row.get::<_, i32>(5)? != 0,
                docker_image: row.get(6)?,
                docker_workdir: row.get(7)?,
                ssh_host: row.get(8)?,
                ssh_port: row.get(9)?,
                ssh_user: row.get(10)?,
                ssh_path: row.get(11)?,
                source_cwd: row.get(12)?,
                effective_cwd: row.get(13)?,
                sandbox_id: row.get(14)?,
                sandbox_root_path: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
                last_used_at: row.get(18)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_environment(&self, id: &str) -> Result<Environment, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, name, backend, execution_target, wasm_enabled, docker_image, docker_workdir, ssh_host, ssh_port, ssh_user, ssh_path, source_cwd, effective_cwd, sandbox_id, sandbox_root_path, created_at, updated_at, last_used_at
             FROM environments WHERE id = ?1",
            params![id],
            |row| {
                Ok(Environment {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    name: row.get(2)?,
                    backend: row.get(3)?,
                    substrate: row.get(4)?,
                    wasm_enabled: row.get::<_, i32>(5)? != 0,
                    docker_image: row.get(6)?,
                    docker_workdir: row.get(7)?,
                    ssh_host: row.get(8)?,
                    ssh_port: row.get(9)?,
                    ssh_user: row.get(10)?,
                    ssh_path: row.get(11)?,
                    source_cwd: row.get(12)?,
                    effective_cwd: row.get(13)?,
                    sandbox_id: row.get(14)?,
                    sandbox_root_path: row.get(15)?,
                    created_at: row.get(16)?,
                    updated_at: row.get(17)?,
                    last_used_at: row.get(18)?,
                })
            },
        )
        .map_err(|_| AppError::not_found(format!("Environment {id} not found")))
    }

    pub fn update_environment(&self, environment: &Environment) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE environments
             SET name = ?1,
                 backend = ?2,
                 execution_target = ?3,
                 wasm_enabled = ?4,
                 docker_image = ?5,
                 docker_workdir = ?6,
                 ssh_host = ?7,
                 ssh_port = ?8,
                 ssh_user = ?9,
                 ssh_path = ?10,
                 updated_at = ?11,
                 last_used_at = ?12
             WHERE id = ?13",
            params![
                environment.name,
                environment.backend,
                environment.substrate,
                environment.wasm_enabled as i32,
                environment.docker_image,
                environment.docker_workdir,
                environment.ssh_host,
                environment.ssh_port,
                environment.ssh_user,
                environment.ssh_path,
                environment.updated_at,
                environment.last_used_at,
                environment.id,
            ],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!(
                "Environment {} not found",
                environment.id
            )));
        }
        Ok(())
    }

    pub fn update_environment_execution_root(
        &self,
        id: &str,
        source_cwd: &str,
        effective_cwd: &str,
        sandbox_id: Option<&str>,
        sandbox_root_path: Option<&str>,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE environments
             SET source_cwd = ?1,
                 effective_cwd = ?2,
                 sandbox_id = ?3,
                 sandbox_root_path = ?4,
                 updated_at = ?5,
                 last_used_at = ?5
             WHERE id = ?6",
            params![
                source_cwd,
                effective_cwd,
                sandbox_id,
                sandbox_root_path,
                now,
                id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Environment {id} not found")));
        }
        Ok(())
    }

    pub fn delete_environment(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET environment_id = NULL, runtime_session_id = NULL WHERE environment_id = ?1",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM runtime_sessions WHERE environment_id = ?1",
            params![id],
        )?;
        let changed = conn.execute("DELETE FROM environments WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Environment {id} not found")));
        }
        Ok(())
    }

    pub fn touch_environment(&self, id: &str, effective_cwd: Option<&str>) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE environments SET effective_cwd = COALESCE(?1, effective_cwd), updated_at = ?2, last_used_at = ?2 WHERE id = ?3",
            params![effective_cwd, now, id],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!("Environment {id} not found")));
        }
        Ok(())
    }

    // ── Runtime Session CRUD ─────────────────────────────────────────

    pub fn create_runtime_session(&self, session: &RuntimeSession) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO runtime_sessions (id, environment_id, backend, backend_session_id, backend_session_cwd, shared, status, created_at, updated_at, last_active_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                session.id,
                session.environment_id,
                session.backend,
                session.backend_session_id,
                session.backend_session_cwd,
                session.shared as i32,
                session.status,
                session.created_at,
                session.updated_at,
                session.last_active_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_runtime_sessions(
        &self,
        environment_id: &str,
    ) -> Result<Vec<RuntimeSession>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, environment_id, backend, backend_session_id, backend_session_cwd, shared, status, created_at, updated_at, last_active_at
             FROM runtime_sessions WHERE environment_id = ?1 ORDER BY last_active_at DESC, created_at DESC",
        )?;
        let rows = stmt.query_map(params![environment_id], |row| {
            Ok(RuntimeSession {
                id: row.get(0)?,
                environment_id: row.get(1)?,
                backend: row.get(2)?,
                backend_session_id: row.get(3)?,
                backend_session_cwd: row.get(4)?,
                shared: row.get::<_, i32>(5)? != 0,
                status: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                last_active_at: row.get(9)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::db(e.to_string()))
    }

    pub fn get_runtime_session(&self, id: &str) -> Result<RuntimeSession, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, environment_id, backend, backend_session_id, backend_session_cwd, shared, status, created_at, updated_at, last_active_at
             FROM runtime_sessions WHERE id = ?1",
            params![id],
            |row| {
                Ok(RuntimeSession {
                    id: row.get(0)?,
                    environment_id: row.get(1)?,
                    backend: row.get(2)?,
                    backend_session_id: row.get(3)?,
                    backend_session_cwd: row.get(4)?,
                    shared: row.get::<_, i32>(5)? != 0,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    last_active_at: row.get(9)?,
                })
            },
        )
        .map_err(|_| AppError::not_found(format!("Runtime session {id} not found")))
    }

    pub fn update_runtime_session_backend(
        &self,
        id: &str,
        backend_session_id: Option<&str>,
        backend_session_cwd: Option<&str>,
        status: Option<&str>,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE runtime_sessions
             SET backend_session_id = COALESCE(?1, backend_session_id),
                 backend_session_cwd = COALESCE(?2, backend_session_cwd),
                 status = COALESCE(?3, status),
                 updated_at = ?4,
                 last_active_at = ?4
             WHERE id = ?5",
            params![backend_session_id, backend_session_cwd, status, now, id],
        )?;
        if changed == 0 {
            return Err(AppError::not_found(format!(
                "Runtime session {id} not found"
            )));
        }
        Ok(())
    }

    pub fn delete_runtime_session(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET runtime_session_id = NULL WHERE runtime_session_id = ?1",
            params![id],
        )?;
        let changed = conn.execute("DELETE FROM runtime_sessions WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::not_found(format!(
                "Runtime session {id} not found"
            )));
        }
        Ok(())
    }
}
