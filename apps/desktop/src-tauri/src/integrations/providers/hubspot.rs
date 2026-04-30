use crate::integrations::*;
use async_trait::async_trait;
pub struct HubSpotIntegration;
#[async_trait]
impl Integration for HubSpotIntegration {
    fn id(&self) -> &str {
        "hubspot"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "hubspot".into(),
            name: "HubSpot".into(),
            description: "Manage contacts, deals, and tickets in HubSpot CRM.".into(),
            category: IntegrationCategory::Crm,
            icon: "ri-user-heart-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Private App Token".into(),
                placeholder: Some("pat-...".into()),
            },
            docs_url: Some("https://developers.hubspot.com/docs/api".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "hubspot.list_contacts".into(),
                name: "List Contacts".into(),
                description: "List CRM contacts".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "limit": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "hubspot.create_contact".into(),
                name: "Create Contact".into(),
                description: "Create a new contact".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["email"], "properties": { "email": { "type": "string" }, "firstname": { "type": "string" }, "lastname": { "type": "string" } } }),
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
            return ActionResult::err("Missing HubSpot token");
        }
        let client = reqwest::Client::new();
        match action_id {
            "hubspot.list_contacts" => {
                let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(10);
                match client
                    .get(format!(
                        "https://api.hubapi.com/crm/v3/objects/contacts?limit={limit}"
                    ))
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
            "hubspot.create_contact" => {
                let body = serde_json::json!({ "properties": { "email": params.get("email").and_then(|v| v.as_str()).unwrap_or(""), "firstname": params.get("firstname").and_then(|v| v.as_str()).unwrap_or(""), "lastname": params.get("lastname").and_then(|v| v.as_str()).unwrap_or("") } });
                match client
                    .post("https://api.hubapi.com/crm/v3/objects/contacts")
                    .bearer_auth(token)
                    .json(&body)
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
            .get("https://api.hubapi.com/crm/v3/objects/contacts?limit=1")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => ConnectionStatus {
                connected: true,
                account_label: Some("HubSpot".into()),
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
