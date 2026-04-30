use crate::integrations::*;
use async_trait::async_trait;

pub struct TelegramIntegration;

#[async_trait]
impl Integration for TelegramIntegration {
    fn id(&self) -> &str {
        "telegram"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "telegram".into(),
            name: "Telegram".into(),
            description: "Send messages and manage Telegram bots.".into(),
            category: IntegrationCategory::Messaging,
            icon: "ri-telegram-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Bot Token".into(),
                placeholder: Some("123456:ABC-DEF...".into()),
            },
            docs_url: Some("https://core.telegram.org/bots/api".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "telegram.send_message".into(),
                name: "Send Message".into(),
                description: "Send a message to a chat".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["chat_id", "text"], "properties": { "chat_id": { "type": "string" }, "text": { "type": "string" }, "parse_mode": { "type": "string", "enum": ["HTML", "Markdown", "MarkdownV2"] } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "telegram.get_updates".into(),
                name: "Get Updates".into(),
                description: "Get recent messages/updates".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "limit": { "type": "number" }, "offset": { "type": "number" } } }),
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
            return ActionResult::err("Missing Telegram bot token");
        }
        let client = reqwest::Client::new();
        let base = format!("https://api.telegram.org/bot{token}");
        match action_id {
            "telegram.send_message" => {
                match client
                    .post(format!("{base}/sendMessage"))
                    .json(&params)
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
            "telegram.get_updates" => {
                match client
                    .get(format!("{base}/getUpdates"))
                    .query(&[(
                        "limit",
                        params
                            .get("limit")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(10)
                            .to_string(),
                    )])
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
        let client = reqwest::Client::new();
        match client
            .get(format!("https://api.telegram.org/bot{token}/getMe"))
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) if j.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) => {
                    let name = j
                        .pointer("/result/username")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Bot");
                    ConnectionStatus {
                        connected: true,
                        account_label: Some(format!("@{name}")),
                        error: None,
                    }
                }
                Ok(j) => ConnectionStatus {
                    connected: false,
                    account_label: None,
                    error: Some(
                        j.get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Failed")
                            .into(),
                    ),
                },
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
