use crate::integrations::*;
use async_trait::async_trait;
pub struct OutlookIntegration;
#[async_trait]
impl Integration for OutlookIntegration {
    fn id(&self) -> &str {
        "outlook"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "outlook".into(),
            name: "Outlook".into(),
            description: "Read, search, and send emails with Outlook/Microsoft 365.".into(),
            category: IntegrationCategory::Email,
            icon: "ri-mail-open-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "OAuth Access Token".into(),
                placeholder: Some("EwB...".into()),
            },
            docs_url: Some(
                "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview".into(),
            ),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "outlook.list_messages".into(),
                name: "List Messages".into(),
                description: "List recent emails".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "folder": { "type": "string" }, "top": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "outlook.send_email".into(),
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
            return ActionResult::err("Missing Microsoft access token");
        }
        let client = reqwest::Client::new();
        match action_id {
            "outlook.list_messages" => {
                let top = params.get("top").and_then(|v| v.as_u64()).unwrap_or(10);
                match client.get(format!("https://graph.microsoft.com/v1.0/me/messages?$top={top}&$select=subject,from,receivedDateTime,isRead")).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) }
            }
            "outlook.send_email" => {
                let to = params.get("to").and_then(|v| v.as_str()).unwrap_or("");
                let body = serde_json::json!({ "message": { "subject": params.get("subject").and_then(|v| v.as_str()).unwrap_or(""), "body": { "contentType": "Text", "content": params.get("body").and_then(|v| v.as_str()).unwrap_or("") }, "toRecipients": [{ "emailAddress": { "address": to } }] } });
                match client
                    .post("https://graph.microsoft.com/v1.0/me/sendMail")
                    .bearer_auth(token)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(r) if r.status().is_success() => ActionResult::ok_text("Email sent"),
                    Ok(r) => {
                        let t = r.text().await.unwrap_or_default();
                        ActionResult::err(t)
                    }
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
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let name = j
                        .get("displayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Outlook");
                    ConnectionStatus {
                        connected: true,
                        account_label: Some(name.into()),
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
