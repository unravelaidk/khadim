//! Integration system — trait, registry, types.
//!
//! Every integration (Gmail, Slack, etc.) implements the `Integration` trait.
//! The `IntegrationRegistry` discovers them, manages connections, and bridges
//! them to the agent engine as callable tools.

pub mod auth;
pub mod providers;
pub mod tool_bridge;

use crate::db::Database;
use crate::error::AppError;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// ── Metadata ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: IntegrationCategory,
    pub icon: String,
    pub auth_type: AuthKind,
    pub docs_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationCategory {
    CloudStorage,
    Email,
    Messaging,
    Spreadsheet,
    ProjectManagement,
    Calendar,
    Crm,
    Ecommerce,
    Database,
    DevOps,
    Documents,
    Finance,
    Notifications,
    Generic,
}

impl IntegrationCategory {
    pub fn label(&self) -> &'static str {
        match self {
            Self::CloudStorage => "Cloud Storage",
            Self::Email => "Email",
            Self::Messaging => "Messaging",
            Self::Spreadsheet => "Spreadsheets",
            Self::ProjectManagement => "Project Management",
            Self::Calendar => "Calendar",
            Self::Crm => "CRM & Marketing",
            Self::Ecommerce => "E-Commerce",
            Self::Database => "Databases",
            Self::DevOps => "Developer Tools",
            Self::Documents => "Documents",
            Self::Finance => "Finance",
            Self::Notifications => "Notifications",
            Self::Generic => "Generic",
        }
    }
}

// ── Auth ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthKind {
    None,
    ApiKey {
        label: String,
        placeholder: Option<String>,
    },
    OAuth2 {
        auth_url: String,
        token_url: String,
        scopes: Vec<String>,
    },
    Credentials {
        fields: Vec<CredentialField>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialField {
    pub key: String,
    pub label: String,
    pub secret: bool,
    pub required: bool,
    pub placeholder: Option<String>,
}

// ── Actions ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionDef {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub is_mutation: bool,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

// ── Execution ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ActionContext {
    pub credentials: HashMap<String, String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub output_text: Option<String>,
}

impl ActionResult {
    pub fn ok(data: serde_json::Value) -> Self {
        let text = serde_json::to_string_pretty(&data).ok();
        Self {
            success: true,
            data: Some(data),
            error: None,
            output_text: text,
        }
    }
    pub fn ok_text(text: impl Into<String>) -> Self {
        Self {
            success: true,
            data: None,
            error: None,
            output_text: Some(text.into()),
        }
    }
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
            output_text: None,
        }
    }
}

// ── Connection Status ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub account_label: Option<String>,
    pub error: Option<String>,
}

// ── The Trait ────────────────────────────────────────────────────────

#[async_trait]
pub trait Integration: Send + Sync {
    fn id(&self) -> &str;
    fn metadata(&self) -> IntegrationMeta;
    fn actions(&self) -> Vec<ActionDef>;
    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: &ActionContext,
    ) -> ActionResult;
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus;
}

// ── Stored Connection ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationConnection {
    pub id: String,
    pub integration_id: String,
    pub label: String,
    pub account_label: Option<String>,
    pub is_active: bool,
    pub last_verified_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Log entry ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationLog {
    pub id: String,
    pub connection_id: String,
    pub action_id: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub duration_ms: i64,
    pub created_at: String,
}

// ── Registry ─────────────────────────────────────────────────────────

pub struct IntegrationRegistry {
    integrations: RwLock<HashMap<String, Arc<dyn Integration>>>,
    db: Arc<Database>,
}

impl IntegrationRegistry {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            integrations: RwLock::new(HashMap::new()),
            db,
        }
    }

    pub async fn register(&self, integration: Arc<dyn Integration>) {
        let id = integration.id().to_string();
        log::info!("Registered integration: {}", id);
        self.integrations.write().await.insert(id, integration);
    }

    pub async fn get(&self, id: &str) -> Option<Arc<dyn Integration>> {
        self.integrations.read().await.get(id).cloned()
    }

    pub async fn list_available(&self) -> Vec<IntegrationMeta> {
        let guard = self.integrations.read().await;
        let mut metas: Vec<_> = guard.values().map(|i| i.metadata()).collect();
        metas.sort_by(|a, b| a.name.cmp(&b.name));
        metas
    }

    pub async fn list_by_category(
        &self,
        category: &IntegrationCategory,
    ) -> Vec<IntegrationMeta> {
        let guard = self.integrations.read().await;
        let mut metas: Vec<_> = guard
            .values()
            .filter(|i| &i.metadata().category == category)
            .map(|i| i.metadata())
            .collect();
        metas.sort_by(|a, b| a.name.cmp(&b.name));
        metas
    }

    /// List all connections stored in the DB.
    pub fn list_connections(&self) -> Result<Vec<IntegrationConnection>, AppError> {
        self.db.list_integration_connections()
    }

    fn find_connection(&self, connection_id: &str) -> Result<IntegrationConnection, AppError> {
        self.db
            .list_integration_connections()?
            .into_iter()
            .find(|c| c.id == connection_id)
            .ok_or_else(|| AppError::not_found("Connection not found"))
    }

    async fn find_integration_for_connection(
        &self,
        connection: &IntegrationConnection,
    ) -> Result<Arc<dyn Integration>, AppError> {
        self.get(&connection.integration_id).await.ok_or_else(|| {
            AppError::not_found(format!(
                "Integration {} not found",
                connection.integration_id
            ))
        })
    }

    fn log_action_result(
        &self,
        connection_id: &str,
        action_id: &str,
        result: &ActionResult,
        duration_ms: i64,
    ) {
        let log = IntegrationLog {
            id: uuid::Uuid::new_v4().to_string(),
            connection_id: connection_id.to_string(),
            action_id: action_id.to_string(),
            success: result.success,
            error_message: result.error.clone(),
            duration_ms,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = self.db.create_integration_log(&log);
    }

    /// Create a new connection, storing credentials securely.
    pub fn create_connection(
        &self,
        integration_id: &str,
        label: &str,
        credentials: HashMap<String, String>,
    ) -> Result<IntegrationConnection, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();
        let cred_json =
            serde_json::to_string(&credentials).map_err(|e| AppError::db(e.to_string()))?;

        let conn = IntegrationConnection {
            id: id.clone(),
            integration_id: integration_id.to_string(),
            label: label.to_string(),
            account_label: None,
            is_active: true,
            last_verified_at: None,
            created_at: now.clone(),
            updated_at: now,
        };
        self.db
            .create_integration_connection(&conn, Some(&cred_json))?;
        Ok(conn)
    }

    /// Delete a connection and its stored credentials.
    pub fn delete_connection(&self, connection_id: &str) -> Result<(), AppError> {
        self.db.delete_integration_connection(connection_id)
    }

    /// Build an ActionContext for a stored connection.
    pub fn build_context(
        &self,
        connection_id: &str,
    ) -> Result<ActionContext, AppError> {
        let secret = self.db.get_integration_connection_secret(connection_id)?;
        let credentials: HashMap<String, String> = match secret {
            Some(json) => {
                serde_json::from_str(&json).map_err(|e| AppError::db(e.to_string()))?
            }
            None => HashMap::new(),
        };
        // If there's a single "api_key" field, also set access_token for convenience
        let access_token = credentials.get("api_key").cloned();
        Ok(ActionContext {
            credentials,
            access_token,
        })
    }

    /// Execute an action on a connected integration and log the result.
    pub async fn execute_action(
        &self,
        connection_id: &str,
        action_id: &str,
        params: serde_json::Value,
    ) -> Result<ActionResult, AppError> {
        let conn = self.find_connection(connection_id)?;
        let integration = self.find_integration_for_connection(&conn).await?;
        let ctx = self.build_context(connection_id)?;

        let start = std::time::Instant::now();
        let result = integration.execute(action_id, params, &ctx).await;
        let duration_ms = start.elapsed().as_millis() as i64;

        self.log_action_result(connection_id, action_id, &result, duration_ms);

        Ok(result)
    }

    /// Test connection health.
    pub async fn test_connection(
        &self,
        connection_id: &str,
    ) -> Result<ConnectionStatus, AppError> {
        let conn = self.find_connection(connection_id)?;
        let integration = self.find_integration_for_connection(&conn).await?;
        let ctx = self.build_context(connection_id)?;
        let status = integration.test_connection(&ctx).await;

        // Update verification timestamp if connected
        if status.connected {
            let now = chrono::Utc::now().to_rfc3339();
            let _ = self.db.update_integration_connection_verified(connection_id, &now);
        }

        Ok(status)
    }

    /// List all actions across all connected integrations — for agent tool discovery.
    pub async fn connected_actions(
        &self,
    ) -> Result<Vec<(IntegrationConnection, Vec<ActionDef>)>, AppError> {
        let connections = self.db.list_integration_connections()?;
        let mut results = Vec::new();
        let guard = self.integrations.read().await;
        for conn in connections {
            if !conn.is_active {
                continue;
            }
            if let Some(integration) = guard.get(&conn.integration_id) {
                results.push((conn, integration.actions()));
            }
        }
        Ok(results)
    }

    /// List logs, optionally filtered by connection.
    pub fn list_logs(
        &self,
        connection_id: Option<&str>,
        limit: u32,
    ) -> Result<Vec<IntegrationLog>, AppError> {
        self.db.list_integration_logs(connection_id, limit)
    }
}
