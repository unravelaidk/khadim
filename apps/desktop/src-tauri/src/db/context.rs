use crate::error::AppError;
use crate::db::entities;
use sea_orm::{
    ConnectionTrait, Database as SeaDatabase, DatabaseConnection, DbBackend, ExecResult,
    QueryResult, Schema, Statement, Value,
};
use sea_orm::sea_query::Table;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Mutex;

const SCHEMA_VERSION: i32 = 4;

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

        self.run(async {
            let conn = self.conn.clone();
            let backend = DbBackend::Sqlite;
            let schema = Schema::new(backend);
            conn.execute(stmt("PRAGMA foreign_keys = OFF")).await?;

            for drop in [
                Table::drop().table(entities::integration_logs::Entity).if_exists().to_owned(),
                Table::drop().table(entities::integration_connections::Entity).if_exists().to_owned(),
                Table::drop().table(entities::agent_run_turns::Entity).if_exists().to_owned(),
                Table::drop().table(entities::agent_runs::Entity).if_exists().to_owned(),
                Table::drop().table(entities::memory_entries::Entity).if_exists().to_owned(),
                Table::drop().table(entities::memory_store_agents::Entity).if_exists().to_owned(),
                Table::drop().table(entities::memory_stores::Entity).if_exists().to_owned(),
                Table::drop().table(entities::credentials::Entity).if_exists().to_owned(),
                Table::drop().table(entities::environments::Entity).if_exists().to_owned(),
                Table::drop().table(entities::managed_agents::Entity).if_exists().to_owned(),
                Table::drop().table(entities::messages::Entity).if_exists().to_owned(),
                Table::drop().table(entities::conversations::Entity).if_exists().to_owned(),
                Table::drop().table(entities::settings::Entity).if_exists().to_owned(),
                Table::drop().table(entities::workspaces::Entity).if_exists().to_owned(),
            ] {
                conn.execute(backend.build(&drop)).await?;
            }

            for create in [
                schema.create_table_from_entity(entities::workspaces::Entity),
                schema.create_table_from_entity(entities::conversations::Entity),
                schema.create_table_from_entity(entities::messages::Entity),
                schema.create_table_from_entity(entities::settings::Entity),
                schema.create_table_from_entity(entities::managed_agents::Entity),
                schema.create_table_from_entity(entities::environments::Entity),
                schema.create_table_from_entity(entities::credentials::Entity),
                schema.create_table_from_entity(entities::memory_stores::Entity),
                schema.create_table_from_entity(entities::memory_entries::Entity),
                schema.create_table_from_entity(entities::agent_runs::Entity),
                schema.create_table_from_entity(entities::agent_run_turns::Entity),
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
                "CREATE INDEX idx_agent_run_turns_run ON agent_run_turns(run_id, turn_number ASC)",
                "CREATE INDEX idx_memory_stores_workspace_scope ON memory_stores(workspace_id, scope_type)",
                "CREATE INDEX idx_memory_store_agents_agent ON memory_store_agents(agent_id)",
                "CREATE INDEX idx_memory_store_agents_store ON memory_store_agents(store_id)",
                "CREATE INDEX idx_memory_entries_store ON memory_entries(store_id, updated_at DESC)",
                "CREATE INDEX idx_memory_entries_store_key ON memory_entries(store_id, key)",
                "CREATE INDEX idx_integration_connections_integration ON integration_connections(integration_id)",
                "CREATE INDEX idx_integration_logs_connection ON integration_logs(connection_id, created_at DESC)",
                &format!("PRAGMA user_version = {SCHEMA_VERSION}"),
                "PRAGMA foreign_keys = ON",
            ] {
                conn.execute(stmt(sql)).await?;
            }
            Ok(())
        })
    }
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
