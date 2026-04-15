use crate::db::context::{now, DbContext};
use crate::db::entities::{integration_connections, integration_logs};
use crate::error::AppError;
use crate::integrations::{IntegrationConnection, IntegrationLog};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct IntegrationRepository {
    ctx: Arc<DbContext>,
}

impl IntegrationRepository {
    pub fn new(ctx: Arc<DbContext>) -> Self {
        Self { ctx }
    }

    pub fn list_connections(&self) -> Result<Vec<IntegrationConnection>, AppError> {
        self.ctx.run(async {
            let conn = self.ctx.conn();
            let rows = integration_connections::Entity::find()
                .order_by_desc(integration_connections::Column::CreatedAt)
                .all(&conn)
                .await?;
            Ok(rows.into_iter().map(|r| IntegrationConnection {
                id: r.id,
                integration_id: r.integration_id,
                label: r.label,
                account_label: r.account_label,
                is_active: r.is_active != 0,
                last_verified_at: r.last_verified_at,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }).collect())
        })
    }

    pub fn create_connection(
        &self,
        conn_data: &IntegrationConnection,
        secret_json: Option<&str>,
    ) -> Result<(), AppError> {
        let model = integration_connections::ActiveModel {
            id: Set(conn_data.id.clone()),
            integration_id: Set(conn_data.integration_id.clone()),
            label: Set(conn_data.label.clone()),
            account_label: Set(conn_data.account_label.clone()),
            is_active: Set(if conn_data.is_active { 1 } else { 0 }),
            secret_json: Set(secret_json.map(String::from)),
            last_verified_at: Set(conn_data.last_verified_at.clone()),
            created_at: Set(conn_data.created_at.clone()),
            updated_at: Set(conn_data.updated_at.clone()),
        };
        self.ctx.run(async {
            let conn = self.ctx.conn();
            model.insert(&conn).await?;
            Ok(())
        })
    }

    pub fn delete_connection(&self, id: &str) -> Result<(), AppError> {
        let id = id.to_string();
        self.ctx.run(async {
            let conn = self.ctx.conn();
            // Delete logs first
            integration_logs::Entity::delete_many()
                .filter(integration_logs::Column::ConnectionId.eq(&id))
                .exec(&conn)
                .await?;
            integration_connections::Entity::delete_by_id(&id)
                .exec(&conn)
                .await?;
            Ok(())
        })
    }

    pub fn get_connection_secret(&self, id: &str) -> Result<Option<String>, AppError> {
        let id = id.to_string();
        self.ctx.run(async {
            let conn = self.ctx.conn();
            let row = integration_connections::Entity::find_by_id(&id)
                .one(&conn)
                .await?;
            Ok(row.and_then(|r| r.secret_json))
        })
    }

    pub fn update_verified(&self, id: &str, timestamp: &str) -> Result<(), AppError> {
        let id = id.to_string();
        let ts = timestamp.to_string();
        self.ctx.run(async {
            let conn = self.ctx.conn();
            let row = integration_connections::Entity::find_by_id(&id)
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found("Connection not found"))?;
            let mut active: integration_connections::ActiveModel = row.into();
            active.last_verified_at = Set(Some(ts.clone()));
            active.updated_at = Set(ts);
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub fn update_account_label(&self, id: &str, label: &str) -> Result<(), AppError> {
        let id = id.to_string();
        let label = label.to_string();
        self.ctx.run(async {
            let conn = self.ctx.conn();
            let row = integration_connections::Entity::find_by_id(&id)
                .one(&conn)
                .await?
                .ok_or_else(|| AppError::not_found("Connection not found"))?;
            let mut active: integration_connections::ActiveModel = row.into();
            active.account_label = Set(Some(label));
            active.updated_at = Set(now());
            active.update(&conn).await?;
            Ok(())
        })
    }

    pub fn create_log(&self, log: &IntegrationLog) -> Result<(), AppError> {
        let model = integration_logs::ActiveModel {
            id: Set(log.id.clone()),
            connection_id: Set(log.connection_id.clone()),
            action_id: Set(log.action_id.clone()),
            success: Set(if log.success { 1 } else { 0 }),
            error_message: Set(log.error_message.clone()),
            duration_ms: Set(log.duration_ms),
            created_at: Set(log.created_at.clone()),
        };
        self.ctx.run(async {
            let conn = self.ctx.conn();
            model.insert(&conn).await?;
            Ok(())
        })
    }

    pub fn list_logs(
        &self,
        connection_id: Option<&str>,
        limit: u32,
    ) -> Result<Vec<IntegrationLog>, AppError> {
        let cid = connection_id.map(String::from);
        let limit = limit as u64;
        self.ctx.run(async {
            let conn = self.ctx.conn();
            let mut query = integration_logs::Entity::find()
                .order_by_desc(integration_logs::Column::CreatedAt);
            if let Some(ref id) = cid {
                query = query.filter(integration_logs::Column::ConnectionId.eq(id));
            }
            let rows = query
                .all(&conn)
                .await?;
            Ok(rows.into_iter().take(limit as usize).map(|r| IntegrationLog {
                id: r.id,
                connection_id: r.connection_id,
                action_id: r.action_id,
                success: r.success != 0,
                error_message: r.error_message,
                duration_ms: r.duration_ms,
                created_at: r.created_at,
            }).collect())
        })
    }
}
