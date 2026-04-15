use crate::integrations::*; use async_trait::async_trait;
pub struct RssIntegration;
#[async_trait] impl Integration for RssIntegration {
    fn id(&self) -> &str { "rss" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "rss".into(), name: "RSS / Atom".into(), description: "Read and monitor RSS and Atom feeds from any website.".into(), category: IntegrationCategory::Generic, icon: "ri-rss-line".into(), auth_type: AuthKind::None, docs_url: None } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "rss.read_feed".into(), name: "Read Feed".into(), description: "Fetch and parse an RSS/Atom feed".into(), input_schema: serde_json::json!({ "type": "object", "required": ["url"], "properties": { "url": { "type": "string", "description": "Feed URL" } } }), is_mutation: false, risk_level: RiskLevel::Low },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let _ = ctx;
        match action_id {
            "rss.read_feed" => { let url = params.get("url").and_then(|v| v.as_str()).unwrap_or("");
                match reqwest::Client::new().get(url).header("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml").send().await {
                    Ok(r) => { let text = r.text().await.unwrap_or_default(); ActionResult::ok_text(text) },
                    Err(e) => ActionResult::err(e.to_string()),
                }
            }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, _ctx: &ActionContext) -> ConnectionStatus {
        ConnectionStatus { connected: true, account_label: Some("No auth required".into()), error: None }
    }
}
