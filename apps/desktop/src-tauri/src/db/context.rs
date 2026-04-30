use crate::db::entities;
use crate::error::AppError;
use sea_orm::{
    ConnectionTrait, Database as SeaDatabase, DatabaseConnection, DbBackend, ExecResult,
    QueryResult, Schema, Statement, Value,
};
use std::future::Future;
use std::path::PathBuf;
use std::sync::Mutex;

const SCHEMA_VERSION: i32 = 15;

pub(crate) struct DbContext {
    conn: DatabaseConnection,
    runtime: Mutex<tokio::runtime::Runtime>,
}

impl DbContext {
    pub(crate) fn conn(&self) -> DatabaseConnection {
        self.conn.clone()
    }

    pub(crate) fn open() -> Result<Self, AppError> {
        let data_dir = Self::data_dir()?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::io(format!("Failed to create data dir: {e}")))?;
        let db_path = data_dir.join("khadim.db");
        Self::open_at(format!("sqlite:{}", db_path.display()))
    }

    pub(crate) fn open_memory() -> Result<Self, AppError> {
        Self::open_at("sqlite::memory:".to_string())
    }

    fn open_at(url: String) -> Result<Self, AppError> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| AppError::io(e.to_string()))?;
        let conn = runtime.block_on(async {
            let conn = SeaDatabase::connect(&url).await?;
            conn.execute(stmt("PRAGMA journal_mode = WAL")).await?;
            conn.execute(stmt("PRAGMA foreign_keys = ON")).await?;
            Ok::<_, sea_orm::DbErr>(conn)
        })?;
        let db = Self {
            conn,
            runtime: Mutex::new(runtime),
        };
        db.migrate()?;
        Ok(db)
    }

    fn data_dir() -> Result<PathBuf, AppError> {
        dirs::data_dir()
            .map(|d| d.join("khadim"))
            .ok_or_else(|| AppError::io("Cannot determine system data directory"))
    }

    pub(crate) fn run<F, T>(&self, fut: F) -> Result<T, AppError>
    where
        F: Future<Output = Result<T, AppError>>,
    {
        if tokio::runtime::Handle::try_current().is_ok() {
            tokio::task::block_in_place(|| {
                self.runtime
                    .lock()
                    .map_err(|_| AppError::io("Database runtime lock poisoned"))?
                    .block_on(fut)
            })
        } else {
            self.runtime
                .lock()
                .map_err(|_| AppError::io("Database runtime lock poisoned"))?
                .block_on(fut)
        }
    }

    pub(crate) fn execute(
        &self,
        sql: impl Into<String>,
        values: Vec<Value>,
    ) -> Result<ExecResult, AppError> {
        let conn = self.conn.clone();
        self.run(async move { conn.execute(stmtv(sql, values)).await.map_err(Into::into) })
    }

    pub(crate) fn execute_plain(&self, sql: impl Into<String>) -> Result<ExecResult, AppError> {
        let conn = self.conn.clone();
        self.run(async move { conn.execute(stmt(sql)).await.map_err(Into::into) })
    }

    pub(crate) fn query_all(
        &self,
        sql: impl Into<String>,
        values: Vec<Value>,
    ) -> Result<Vec<QueryResult>, AppError> {
        let conn = self.conn.clone();
        self.run(async move { conn.query_all(stmtv(sql, values)).await.map_err(Into::into) })
    }

    pub(crate) fn query_one(
        &self,
        sql: impl Into<String>,
        values: Vec<Value>,
    ) -> Result<Option<QueryResult>, AppError> {
        let conn = self.conn.clone();
        self.run(async move { conn.query_one(stmtv(sql, values)).await.map_err(Into::into) })
    }

    fn migrate(&self) -> Result<(), AppError> {
        let version = self
            .query_one("PRAGMA user_version", vec![])?
            .and_then(|row| col::<i32>(&row, "user_version").ok())
            .unwrap_or(0);
        if version == SCHEMA_VERSION {
            return Ok(());
        }

        match version {
            0 => self.create_schema_v15(),
            4 => {
                self.migrate_v4_to_v5()?;
                self.migrate_v5_to_v6()?;
                self.migrate_v6_to_v7()?;
                self.migrate_v7_to_v8()?;
                self.migrate_v8_to_v9()?;
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            5 => {
                self.migrate_v5_to_v6()?;
                self.migrate_v6_to_v7()?;
                self.migrate_v7_to_v8()?;
                self.migrate_v8_to_v9()?;
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            6 => {
                self.migrate_v6_to_v7()?;
                self.migrate_v7_to_v8()?;
                self.migrate_v8_to_v9()?;
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            7 => {
                self.migrate_v7_to_v8()?;
                self.migrate_v8_to_v9()?;
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            8 => {
                self.migrate_v8_to_v9()?;
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            9 => {
                self.migrate_v9_to_v10()?;
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            10 => {
                self.migrate_v10_to_v11()?;
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            11 => {
                self.migrate_v11_to_v12()?;
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            12 => {
                self.migrate_v12_to_v13()?;
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            13 => {
                self.migrate_v13_to_v14()?;
                self.migrate_v14_to_v15()
            }
            14 => self.migrate_v14_to_v15(),
            other => Err(AppError::db(format!(
                "Unsupported database schema version {other}. Expected 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, or {SCHEMA_VERSION}."
            ))),
        }
    }

    fn create_schema_v15(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);

            for create in [
                schema.create_table_from_entity(entities::workspaces::Entity),
                schema.create_table_from_entity(entities::conversations::Entity),
                schema.create_table_from_entity(entities::messages::Entity),
                schema.create_table_from_entity(entities::settings::Entity),
                schema.create_table_from_entity(entities::managed_agents::Entity),
                schema.create_table_from_entity(entities::schedules::Entity),
                schema.create_table_from_entity(entities::environments::Entity),
                schema.create_table_from_entity(entities::credentials::Entity),
                schema.create_table_from_entity(entities::memory_stores::Entity),
                schema.create_table_from_entity(entities::memory_entries::Entity),
                schema.create_table_from_entity(entities::agent_runs::Entity),
                schema.create_table_from_entity(entities::agent_run_turns::Entity),
                schema.create_table_from_entity(entities::run_events::Entity),
                schema.create_table_from_entity(entities::artifacts::Entity),
                schema.create_table_from_entity(entities::budget_ledger::Entity),
                schema.create_table_from_entity(entities::queues::Entity),
                schema.create_table_from_entity(entities::queue_items::Entity),
                schema.create_table_from_entity(entities::agent_health_snapshots::Entity),
                schema.create_table_from_entity(entities::approval_requests::Entity),
                schema.create_table_from_entity(entities::integration_connections::Entity),
                schema.create_table_from_entity(entities::integration_logs::Entity),
            ] {
                conn.execute(backend.build(&create)).await?;
            }

            conn.execute(stmt(
                "CREATE TABLE memory_store_agents (\
                    store_id TEXT NOT NULL, \
                    agent_id TEXT NOT NULL, \
                    is_primary_write_target INTEGER NOT NULL, \
                    created_at TEXT NOT NULL, \
                    PRIMARY KEY (store_id, agent_id)\
                )",
            ))
            .await?;

            for sql in [
                "CREATE INDEX idx_conversations_workspace ON conversations(workspace_id)",
                "CREATE INDEX idx_messages_conversation ON messages(conversation_id)",
                "CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_id, started_at DESC)",
                "CREATE INDEX idx_schedules_agent ON schedules(agent_id)",
                "CREATE INDEX idx_agent_run_turns_run ON agent_run_turns(run_id, turn_number ASC)",
                "CREATE INDEX idx_run_events_run_seq ON run_events(run_id, sequence_number ASC)",
                "CREATE INDEX idx_artifacts_run ON artifacts(run_id, created_at ASC)",
                "CREATE INDEX idx_budget_ledger_agent_window ON budget_ledger(agent_id, window_key, created_at ASC)",
                "CREATE INDEX idx_queue_items_queue_status ON queue_items(queue_id, status, priority DESC, created_at ASC)",
                "CREATE INDEX idx_agent_health_snapshots_agent_created ON agent_health_snapshots(agent_id, created_at DESC)",
                "CREATE INDEX idx_approval_requests_run_requested ON approval_requests(run_id, requested_at DESC)",
                "CREATE INDEX idx_memory_stores_workspace_scope ON memory_stores(workspace_id, scope_type)",
                "CREATE INDEX idx_memory_store_agents_agent ON memory_store_agents(agent_id)",
                "CREATE INDEX idx_memory_store_agents_store ON memory_store_agents(store_id)",
                "CREATE INDEX idx_memory_entries_store ON memory_entries(store_id, updated_at DESC)",
                "CREATE INDEX idx_memory_entries_store_key ON memory_entries(store_id, key)",
                "CREATE INDEX idx_integration_connections_integration ON integration_connections(integration_id)",
                "CREATE INDEX idx_integration_logs_connection ON integration_logs(connection_id, created_at DESC)",
                // FTS5 for cross-session message search
                "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content=messages, content_rowid=id)",
                "CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content) VALUES(new.rowid, new.content); END",
                "CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content); END",
                "CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content); INSERT INTO messages_fts(rowid, content) VALUES(new.rowid, new.content); END",
                &format!("PRAGMA user_version = {SCHEMA_VERSION}"),
            ] {
                conn.execute(stmt(sql)).await?;
            }

            Ok(())
        })
    }

    fn migrate_v4_to_v5(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);

            conn.execute(
                backend.build(&schema.create_table_from_entity(entities::run_events::Entity)),
            )
            .await?;
            conn.execute(stmt(
                "CREATE INDEX idx_run_events_run_seq ON run_events(run_id, sequence_number ASC)",
            ))
            .await?;
            conn.execute(stmt("PRAGMA user_version = 5")).await?;
            Ok(())
        })
    }

    fn migrate_v5_to_v6(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);

            conn.execute(
                backend.build(&schema.create_table_from_entity(entities::schedules::Entity)),
            )
            .await?;
            conn.execute(stmt(
                "CREATE INDEX idx_schedules_agent ON schedules(agent_id)",
            ))
            .await?;
            conn.execute(stmt("PRAGMA user_version = 6")).await?;
            Ok(())
        })
    }

    fn migrate_v6_to_v7(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);

            conn.execute(
                backend.build(&schema.create_table_from_entity(entities::artifacts::Entity)),
            )
            .await?;
            conn.execute(stmt(
                "CREATE INDEX idx_artifacts_run ON artifacts(run_id, created_at ASC)",
            ))
            .await?;
            conn.execute(stmt("PRAGMA user_version = 7")).await?;
            Ok(())
        })
    }

    fn migrate_v7_to_v8(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            conn.execute(stmt("ALTER TABLE managed_agents ADD COLUMN budget_policy_json TEXT NOT NULL DEFAULT '{}'"))
                .await?;
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);
            conn.execute(backend.build(&schema.create_table_from_entity(entities::budget_ledger::Entity))).await?;
            conn.execute(stmt("CREATE INDEX idx_budget_ledger_agent_window ON budget_ledger(agent_id, window_key, created_at ASC)")).await?;
            conn.execute(stmt("PRAGMA user_version = 8")).await?;
            Ok(())
        })
    }

    fn migrate_v8_to_v9(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);
            conn.execute(backend.build(&schema.create_table_from_entity(entities::queues::Entity))).await?;
            conn.execute(backend.build(&schema.create_table_from_entity(entities::queue_items::Entity))).await?;
            conn.execute(stmt("CREATE INDEX idx_queue_items_queue_status ON queue_items(queue_id, status, priority DESC, created_at ASC)")).await?;
            conn.execute(stmt("PRAGMA user_version = 9")).await?;
            Ok(())
        })
    }

    fn migrate_v9_to_v10(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);
            conn.execute(backend.build(&schema.create_table_from_entity(entities::agent_health_snapshots::Entity))).await?;
            conn.execute(stmt("CREATE INDEX idx_agent_health_snapshots_agent_created ON agent_health_snapshots(agent_id, created_at DESC)")).await?;
            conn.execute(stmt("PRAGMA user_version = 10")).await?;
            Ok(())
        })
    }

    fn migrate_v10_to_v11(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            conn.execute(stmt("ALTER TABLE agent_runs ADD COLUMN ended_reason TEXT")).await?;
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);
            conn.execute(backend.build(&schema.create_table_from_entity(entities::approval_requests::Entity))).await?;
            conn.execute(stmt("CREATE INDEX idx_approval_requests_run_requested ON approval_requests(run_id, requested_at DESC)")).await?;
            conn.execute(stmt("PRAGMA user_version = 11")).await?;
            Ok(())
        })
    }

    fn migrate_v11_to_v12(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            add_column_if_missing(
                &conn,
                "queue_items",
                "max_attempts",
                "INTEGER NOT NULL DEFAULT 3",
            )
            .await?;
            add_column_if_missing(&conn, "queue_items", "dead_lettered_at", "TEXT").await?;
            conn.execute(stmt("PRAGMA user_version = 12")).await?;
            Ok(())
        })
    }

    fn migrate_v12_to_v13(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            add_column_if_missing(
                &conn,
                "managed_agents",
                "artifact_policy_json",
                "TEXT NOT NULL DEFAULT '{\"retention_days\":14,\"max_artifacts_per_run\":50}'",
            )
            .await?;
            conn.execute(stmt("PRAGMA user_version = 13")).await?;
            Ok(())
        })
    }

    fn migrate_v13_to_v14(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            add_column_if_missing(&conn, "agent_runs", "work_dir", "TEXT").await?;
            conn.execute(stmt(&format!("PRAGMA user_version = {SCHEMA_VERSION}")))
                .await?;
            Ok(())
        })
    }

    fn migrate_v14_to_v15(&self) -> Result<(), AppError> {
        self.run(async {
            let conn = self.conn.clone();
            // FTS5 virtual table for cross-session message search
            conn.execute(stmt(
                "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content=messages, content_rowid=id)"
            )).await?;
            conn.execute(stmt(
                "CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content) VALUES(new.rowid, new.content); END"
            )).await?;
            conn.execute(stmt(
                "CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content); END"
            )).await?;
            conn.execute(stmt(
                "CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content); INSERT INTO messages_fts(rowid, content) VALUES(new.rowid, new.content); END"
            )).await?;
            // Backfill existing messages into FTS5
            conn.execute(stmt(
                "INSERT INTO messages_fts(rowid, content) SELECT rowid, content FROM messages WHERE content IS NOT NULL"
            )).await?;
            conn.execute(stmt(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))).await?;
            Ok(())
        })
    }
}

async fn column_exists(
    conn: &DatabaseConnection,
    table: &str,
    column: &str,
) -> Result<bool, AppError> {
    let rows = conn
        .query_all(stmt(&format!("PRAGMA table_info({table})")))
        .await?;
    for row in rows {
        if let Ok(name) = row.try_get::<String>("", "name") {
            if name == column {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

async fn add_column_if_missing(
    conn: &DatabaseConnection,
    table: &str,
    column: &str,
    column_def: &str,
) -> Result<(), AppError> {
    if column_exists(conn, table, column).await? {
        return Ok(());
    }
    conn.execute(stmt(&format!(
        "ALTER TABLE {table} ADD COLUMN {column} {column_def}"
    )))
    .await?;
    Ok(())
}

pub(crate) fn stmt(sql: impl Into<String>) -> Statement {
    Statement::from_string(DbBackend::Sqlite, sql.into())
}

pub(crate) fn stmtv(sql: impl Into<String>, values: Vec<Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, sql.into(), values)
}

pub(crate) fn col<T: sea_orm::TryGetable>(row: &QueryResult, name: &str) -> Result<T, AppError> {
    row.try_get("", name)
        .map_err(|e| AppError::db(e.to_string()))
}

pub(crate) fn encode_json<T: serde::Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|e| AppError::db(e.to_string()))
}

pub(crate) fn decode_json<T: for<'de> serde::Deserialize<'de> + Default>(
    value: Option<String>,
) -> Result<T, AppError> {
    match value {
        Some(raw) if !raw.trim().is_empty() => {
            serde_json::from_str(&raw).map_err(|e| AppError::db(e.to_string()))
        }
        _ => Ok(T::default()),
    }
}

pub(crate) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
