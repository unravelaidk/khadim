use crate::integrations::*; use async_trait::async_trait;
pub struct PostgresIntegration;
#[async_trait] impl Integration for PostgresIntegration {
    fn id(&self) -> &str { "postgres" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "postgres".into(), name: "PostgreSQL".into(), description: "Query and manage PostgreSQL databases.".into(), category: IntegrationCategory::Database, icon: "ri-database-2-line".into(), auth_type: AuthKind::Credentials { fields: vec![ CredentialField { key: "connection_string".into(), label: "Connection String".into(), secret: true, required: true, placeholder: Some("postgresql://user:pass@host:5432/db".into()) } ] }, docs_url: None } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "postgres.query".into(), name: "Run Query".into(), description: "Execute a SQL query (read-only recommended)".into(), input_schema: serde_json::json!({ "type": "object", "required": ["sql"], "properties": { "sql": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Medium },
    ] }
    async fn execute(&self, _action_id: &str, _params: serde_json::Value, _ctx: &ActionContext) -> ActionResult {
        // PostgreSQL requires a native driver (tokio-postgres or sqlx).
        // For Phase 1, we document the integration and defer the runtime.
        ActionResult::err("PostgreSQL integration requires native driver — coming in Phase 3. Use the HTTP integration with a database API proxy for now.")
    }
    async fn test_connection(&self, _ctx: &ActionContext) -> ConnectionStatus {
        ConnectionStatus { connected: false, account_label: None, error: Some("Native driver not yet wired. Coming soon.".into()) }
    }
}
