use crate::integrations::*;
use async_trait::async_trait;
pub struct AirtableIntegration;
#[async_trait]
impl Integration for AirtableIntegration {
    fn id(&self) -> &str {
        "airtable"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "airtable".into(),
            name: "Airtable".into(),
            description: "Read, create, and update records in Airtable bases.".into(),
            category: IntegrationCategory::Spreadsheet,
            icon: "ri-table-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Personal Access Token".into(),
                placeholder: Some("pat...".into()),
            },
            docs_url: Some("https://airtable.com/developers/web/api".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "airtable.list_records".into(),
                name: "List Records".into(),
                description: "List records from a table".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["base_id", "table_name"], "properties": { "base_id": { "type": "string" }, "table_name": { "type": "string" }, "max_records": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "airtable.create_record".into(),
                name: "Create Record".into(),
                description: "Create a new record".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["base_id", "table_name", "fields"], "properties": { "base_id": { "type": "string" }, "table_name": { "type": "string" }, "fields": { "type": "object" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
        ]
    }
    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: &ActionContext,
    ) -> ActionResult {
        let token = ctx
            .credentials
            .get("api_key")
            .map(|s| s.as_str())
            .unwrap_or("");
        if token.is_empty() {
            return ActionResult::err("Missing Airtable token");
        }
        let client = reqwest::Client::new();
        let base_id = params.get("base_id").and_then(|v| v.as_str()).unwrap_or("");
        let table = params
            .get("table_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        match action_id {
            "airtable.list_records" => {
                match client
                    .get(format!("https://api.airtable.com/v0/{base_id}/{table}"))
                    .bearer_auth(token)
                    .send()
                    .await
                {
                    Ok(r) => match r.json::<serde_json::Value>().await {
                        Ok(j) => ActionResult::ok(j),
                        Err(e) => ActionResult::err(e.to_string()),
                    },
                    Err(e) => ActionResult::err(e.to_string()),
                }
            }
            "airtable.create_record" => {
                let fields = params
                    .get("fields")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                match client
                    .post(format!("https://api.airtable.com/v0/{base_id}/{table}"))
                    .bearer_auth(token)
                    .json(&serde_json::json!({ "fields": fields }))
                    .send()
                    .await
                {
                    Ok(r) => match r.json::<serde_json::Value>().await {
                        Ok(j) => ActionResult::ok(j),
                        Err(e) => ActionResult::err(e.to_string()),
                    },
                    Err(e) => ActionResult::err(e.to_string()),
                }
            }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx
            .credentials
            .get("api_key")
            .map(|s| s.as_str())
            .unwrap_or("");
        match reqwest::Client::new()
            .get("https://api.airtable.com/v0/meta/whoami")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => ConnectionStatus {
                connected: true,
                account_label: Some("Airtable".into()),
                error: None,
            },
            Ok(r) => ConnectionStatus {
                connected: false,
                account_label: None,
                error: Some(format!("HTTP {}", r.status())),
            },
            Err(e) => ConnectionStatus {
                connected: false,
                account_label: None,
                error: Some(e.to_string()),
            },
        }
    }
}
