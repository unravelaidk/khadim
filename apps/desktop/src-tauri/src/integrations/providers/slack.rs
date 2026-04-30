use crate::integrations::*;
use async_trait::async_trait;

pub struct SlackIntegration;

#[async_trait]
impl Integration for SlackIntegration {
    fn id(&self) -> &str {
        "slack"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "slack".into(),
            name: "Slack".into(),
            description: "Send messages, read channels, and manage conversations in Slack.".into(),
            category: IntegrationCategory::Messaging,
            icon: "ri-slack-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Bot Token".into(),
                placeholder: Some("xoxb-...".into()),
            },
            docs_url: Some("https://api.slack.com/".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "slack.send_message".into(),
                name: "Send Message".into(),
                description: "Send a message to a channel or DM".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["channel", "text"], "properties": { "channel": { "type": "string" }, "text": { "type": "string" }, "thread_ts": { "type": "string" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "slack.list_channels".into(),
                name: "List Channels".into(),
                description: "List channels the bot can see".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "limit": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "slack.read_history".into(),
                name: "Read History".into(),
                description: "Read recent messages from a channel".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["channel"], "properties": { "channel": { "type": "string" }, "limit": { "type": "number" } } }),
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
            return ActionResult::err("Missing Slack bot token");
        }
        let client = reqwest::Client::new();
        match action_id {
            "slack.send_message" => {
                let channel = params.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                let text = params.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let mut body = serde_json::json!({ "channel": channel, "text": text });
                if let Some(ts) = params.get("thread_ts").and_then(|v| v.as_str()) {
                    body["thread_ts"] = serde_json::Value::String(ts.into());
                }
                match client
                    .post("https://slack.com/api/chat.postMessage")
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
            "slack.list_channels" => {
                let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(100);
                match client
                    .get(format!(
                        "https://slack.com/api/conversations.list?limit={limit}"
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
            "slack.read_history" => {
                let channel = params.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(20);
                match client.get(format!("https://slack.com/api/conversations.history?channel={channel}&limit={limit}")).bearer_auth(token).send().await {
                    Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) },
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
        if token.is_empty() {
            return ConnectionStatus {
                connected: false,
                account_label: None,
                error: Some("No token".into()),
            };
        }
        let client = reqwest::Client::new();
        match client
            .get("https://slack.com/api/auth.test")
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) if j.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) => {
                    let team = j.get("team").and_then(|v| v.as_str()).unwrap_or("Slack");
                    ConnectionStatus {
                        connected: true,
                        account_label: Some(team.into()),
                        error: None,
                    }
                }
                Ok(j) => ConnectionStatus {
                    connected: false,
                    account_label: None,
                    error: Some(
                        j.get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Auth failed")
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
