use crate::integrations::*;
use async_trait::async_trait;
pub struct SendGridIntegration;
#[async_trait]
impl Integration for SendGridIntegration {
    fn id(&self) -> &str {
        "sendgrid"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "sendgrid".into(),
            name: "SendGrid".into(),
            description: "Send transactional and marketing emails via SendGrid.".into(),
            category: IntegrationCategory::Email,
            icon: "ri-mail-send-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "API Key".into(),
                placeholder: Some("SG.xxx...".into()),
            },
            docs_url: Some("https://docs.sendgrid.com/api-reference".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![ActionDef {
            id: "sendgrid.send_email".into(),
            name: "Send Email".into(),
            description: "Send an email".into(),
            input_schema: serde_json::json!({ "type": "object", "required": ["to", "from", "subject", "content"], "properties": { "to": { "type": "string" }, "from": { "type": "string" }, "subject": { "type": "string" }, "content": { "type": "string" } } }),
            is_mutation: true,
            risk_level: RiskLevel::High,
        }]
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
            return ActionResult::err("Missing SendGrid API key");
        }
        match action_id {
            "sendgrid.send_email" => {
                let body = serde_json::json!({ "personalizations": [{ "to": [{ "email": params.get("to").and_then(|v| v.as_str()).unwrap_or("") }] }], "from": { "email": params.get("from").and_then(|v| v.as_str()).unwrap_or("") }, "subject": params.get("subject").and_then(|v| v.as_str()).unwrap_or(""), "content": [{ "type": "text/plain", "value": params.get("content").and_then(|v| v.as_str()).unwrap_or("") }] });
                match reqwest::Client::new()
                    .post("https://api.sendgrid.com/v3/mail/send")
                    .bearer_auth(token)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(r) if r.status().is_success() => {
                        ActionResult::ok_text("Email sent successfully")
                    }
                    Ok(r) => {
                        let t = r.text().await.unwrap_or_default();
                        ActionResult::err(format!("SendGrid error: {t}"))
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
            .get("https://api.sendgrid.com/v3/user/profile")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => ConnectionStatus {
                connected: true,
                account_label: Some("SendGrid".into()),
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
