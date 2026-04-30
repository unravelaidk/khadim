use crate::integrations::*;
use async_trait::async_trait;
pub struct GoogleDriveIntegration;
#[async_trait]
impl Integration for GoogleDriveIntegration {
    fn id(&self) -> &str {
        "google_drive"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "google_drive".into(),
            name: "Google Drive".into(),
            description: "Upload, download, search, and manage files in Google Drive.".into(),
            category: IntegrationCategory::CloudStorage,
            icon: "ri-drive-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "OAuth Access Token".into(),
                placeholder: Some("ya29.a0...".into()),
            },
            docs_url: Some("https://developers.google.com/drive/api/v3".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "google_drive.list_files".into(),
                name: "List Files".into(),
                description: "List files and folders".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "query": { "type": "string", "description": "Search query (Drive API q param)" }, "page_size": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "google_drive.search".into(),
                name: "Search".into(),
                description: "Search for files by name".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["name"], "properties": { "name": { "type": "string" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
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
            return ActionResult::err("Missing Google access token");
        }
        let client = reqwest::Client::new();
        match action_id {
            "google_drive.list_files" | "google_drive.search" => {
                let q = if action_id == "google_drive.search" {
                    format!(
                        "name contains '{}'",
                        params.get("name").and_then(|v| v.as_str()).unwrap_or("")
                    )
                } else {
                    params
                        .get("query")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                };
                let size = params
                    .get("page_size")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20);
                let mut url = format!("https://www.googleapis.com/drive/v3/files?pageSize={size}&fields=files(id,name,mimeType,modifiedTime,size)");
                if !q.is_empty() {
                    url.push_str(&format!("&q={}", urlencoding::encode(&q)));
                }
                match client.get(&url).bearer_auth(token).send().await {
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
            .get("https://www.googleapis.com/drive/v3/about?fields=user")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let email = j
                        .pointer("/user/emailAddress")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Google Drive");
                    ConnectionStatus {
                        connected: true,
                        account_label: Some(email.into()),
                        error: None,
                    }
                }
                Err(e) => ConnectionStatus {
                    connected: false,
                    account_label: None,
                    error: Some(e.to_string()),
                },
            },
            Err(e) => ConnectionStatus {
                connected: false,
                account_label: None,
                error: Some(e.to_string()),
            },
        }
    }
}
