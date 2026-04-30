use crate::integrations::*;
use async_trait::async_trait;
pub struct GmailIntegration;
#[async_trait]
impl Integration for GmailIntegration {
    fn id(&self) -> &str {
        "gmail"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "gmail".into(),
            name: "Gmail".into(),
            description: "Read, search, and send emails with Gmail.".into(),
            category: IntegrationCategory::Email,
            icon: "ri-mail-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "OAuth Access Token".into(),
                placeholder: Some("ya29.a0...".into()),
            },
            docs_url: Some("https://developers.google.com/gmail/api".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "gmail.search".into(),
                name: "Search Emails".into(),
                description: "Search emails with Gmail query syntax".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["query"], "properties": { "query": { "type": "string", "description": "Gmail search query" }, "max_results": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "gmail.send".into(),
                name: "Send Email".into(),
                description: "Send an email".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["to", "subject", "body"], "properties": { "to": { "type": "string" }, "subject": { "type": "string" }, "body": { "type": "string" } } }),
                is_mutation: true,
                risk_level: RiskLevel::High,
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
            "gmail.search" => {
                let q = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let max = params
                    .get("max_results")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10);
                match client.get(format!("https://gmail.googleapis.com/gmail/v1/users/me/messages?q={}&maxResults={max}", urlencoding::encode(q))).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) }
            }
            "gmail.send" => {
                let to = params.get("to").and_then(|v| v.as_str()).unwrap_or("");
                let subject = params.get("subject").and_then(|v| v.as_str()).unwrap_or("");
                let body = params.get("body").and_then(|v| v.as_str()).unwrap_or("");
                let raw = base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, format!("To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"));
                let msg = serde_json::json!({ "raw": raw });
                match client
                    .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
                    .bearer_auth(token)
                    .json(&msg)
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
            .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let email = j
                        .get("emailAddress")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Gmail");
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
