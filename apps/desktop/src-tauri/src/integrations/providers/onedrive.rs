use crate::integrations::*; use async_trait::async_trait;
pub struct OneDriveIntegration;
#[async_trait] impl Integration for OneDriveIntegration {
    fn id(&self) -> &str { "onedrive" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "onedrive".into(), name: "OneDrive".into(), description: "Browse, search, and manage files in OneDrive.".into(), category: IntegrationCategory::CloudStorage, icon: "ri-cloud-line".into(), auth_type: AuthKind::ApiKey { label: "OAuth Access Token".into(), placeholder: Some("EwB...".into()) }, docs_url: Some("https://learn.microsoft.com/en-us/graph/api/resources/onedrive".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "onedrive.list_files".into(), name: "List Files".into(), description: "List files in root or a folder".into(), input_schema: serde_json::json!({ "type": "object", "properties": { "folder_path": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ActionDef { id: "onedrive.search".into(), name: "Search".into(), description: "Search files by name".into(), input_schema: serde_json::json!({ "type": "object", "required": ["query"], "properties": { "query": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Low },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if token.is_empty() { return ActionResult::err("Missing Microsoft access token"); }
        let client = reqwest::Client::new();
        match action_id {
            "onedrive.list_files" => { let path = params.get("folder_path").and_then(|v| v.as_str()).unwrap_or(""); let url = if path.is_empty() { "https://graph.microsoft.com/v1.0/me/drive/root/children".into() } else { format!("https://graph.microsoft.com/v1.0/me/drive/root:/{}:/children", path) }; match client.get(&url).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "onedrive.search" => { let q = params.get("query").and_then(|v| v.as_str()).unwrap_or(""); match client.get(format!("https://graph.microsoft.com/v1.0/me/drive/root/search(q='{q}')")).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get("https://graph.microsoft.com/v1.0/me").bearer_auth(token).send().await {
            Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => { let name = j.get("displayName").and_then(|v| v.as_str()).unwrap_or("Microsoft"); ConnectionStatus { connected: true, account_label: Some(name.into()), error: None } }, Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) } },
            Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) },
        }
    }
}
