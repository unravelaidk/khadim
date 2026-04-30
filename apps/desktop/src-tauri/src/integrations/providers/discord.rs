use crate::integrations::*;
use async_trait::async_trait;

pub struct DiscordIntegration;

#[async_trait]
impl Integration for DiscordIntegration {
    fn id(&self) -> &str {
        "discord"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "discord".into(),
            name: "Discord".into(),
            description: "Send messages and manage channels in Discord servers.".into(),
            category: IntegrationCategory::Messaging,
            icon: "ri-discord-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Bot Token".into(),
                placeholder: Some("MTIz...".into()),
            },
            docs_url: Some("https://discord.com/developers/docs".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "discord.send_message".into(),
                name: "Send Message".into(),
                description: "Send a message to a Discord channel".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["channel_id", "content"], "properties": { "channel_id": { "type": "string" }, "content": { "type": "string" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "discord.list_channels".into(),
                name: "List Channels".into(),
                description: "List channels in a server".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["guild_id"], "properties": { "guild_id": { "type": "string" } } }),
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
            return ActionResult::err("Missing Discord bot token");
        }
        let client = reqwest::Client::new();
        match action_id {
            "discord.send_message" => {
                let channel_id = params
                    .get("channel_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let content = params.get("content").and_then(|v| v.as_str()).unwrap_or("");
                match client
                    .post(format!(
                        "https://discord.com/api/v10/channels/{channel_id}/messages"
                    ))
                    .header("Authorization", format!("Bot {token}"))
                    .json(&serde_json::json!({ "content": content }))
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
            "discord.list_channels" => {
                let guild_id = params
                    .get("guild_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match client
                    .get(format!(
                        "https://discord.com/api/v10/guilds/{guild_id}/channels"
                    ))
                    .header("Authorization", format!("Bot {token}"))
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
            .get("https://discord.com/api/v10/users/@me")
            .header("Authorization", format!("Bot {token}"))
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let name = j
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Discord Bot");
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
