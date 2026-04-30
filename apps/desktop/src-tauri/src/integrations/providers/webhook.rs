use crate::integrations::*;
use async_trait::async_trait;
pub struct WebhookIntegration;
#[async_trait]
impl Integration for WebhookIntegration {
    fn id(&self) -> &str {
        "webhook"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "webhook".into(),
            name: "Webhook".into(),
            description:
                "Send data to any webhook URL. Perfect for Zapier, Make, n8n, or custom endpoints."
                    .into(),
            category: IntegrationCategory::Generic,
            icon: "ri-webhook-line".into(),
            auth_type: AuthKind::Credentials {
                fields: vec![
                    CredentialField {
                        key: "url".into(),
                        label: "Webhook URL".into(),
                        secret: false,
                        required: true,
                        placeholder: Some("https://hooks.example.com/...".into()),
                    },
                    CredentialField {
                        key: "secret".into(),
                        label: "Secret (optional)".into(),
                        secret: true,
                        required: false,
                        placeholder: None,
                    },
                ],
            },
            docs_url: None,
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![ActionDef {
            id: "webhook.send".into(),
            name: "Send Webhook".into(),
            description: "POST JSON to the configured webhook URL".into(),
            input_schema: serde_json::json!({ "type": "object", "required": ["payload"], "properties": { "payload": { "type": "object", "description": "JSON payload to send" } } }),
            is_mutation: true,
            risk_level: RiskLevel::Medium,
        }]
    }
    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: &ActionContext,
    ) -> ActionResult {
        let url = ctx.credentials.get("url").map(|s| s.as_str()).unwrap_or("");
        if url.is_empty() {
            return ActionResult::err("Missing webhook URL");
        }
        match action_id {
            "webhook.send" => {
                let payload = params
                    .get("payload")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                let mut req = reqwest::Client::new().post(url).json(&payload);
                if let Some(secret) = ctx.credentials.get("secret") {
                    if !secret.is_empty() {
                        req = req.header("X-Webhook-Secret", secret.as_str());
                    }
                }
                match req.send().await {
                    Ok(r) => {
                        let status = r.status().as_u16();
                        let body = r.text().await.unwrap_or_default();
                        if status >= 200 && status < 300 {
                            ActionResult::ok_text(format!("OK ({status})"))
                        } else {
                            ActionResult::err(format!("HTTP {status}: {body}"))
                        }
                    }
                    Err(e) => ActionResult::err(e.to_string()),
                }
            }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let url = ctx.credentials.get("url").map(|s| s.as_str()).unwrap_or("");
        if url.is_empty() {
            return ConnectionStatus {
                connected: false,
                account_label: None,
                error: Some("No URL configured".into()),
            };
        }
        ConnectionStatus {
            connected: true,
            account_label: Some(url.chars().take(60).collect()),
            error: None,
        }
    }
}
