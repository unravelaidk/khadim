use crate::integrations::*;
use async_trait::async_trait;
pub struct NotionIntegration;
#[async_trait]
impl Integration for NotionIntegration {
    fn id(&self) -> &str { "notion" }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta { id: "notion".into(), name: "Notion".into(), description: "Search, read, and create pages and databases in Notion.".into(), category: IntegrationCategory::Documents, icon: "ri-notion-line".into(), auth_type: AuthKind::ApiKey { label: "Integration Token".into(), placeholder: Some("ntn_...".into()) }, docs_url: Some("https://developers.notion.com".into()) }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef { id: "notion.search".into(), name: "Search".into(), description: "Search pages and databases".into(), input_schema: serde_json::json!({ "type": "object", "required": ["query"], "properties": { "query": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Low },
            ActionDef { id: "notion.get_page".into(), name: "Get Page".into(), description: "Get a page by ID".into(), input_schema: serde_json::json!({ "type": "object", "required": ["page_id"], "properties": { "page_id": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Low },
            ActionDef { id: "notion.create_page".into(), name: "Create Page".into(), description: "Create a new page in a database".into(), input_schema: serde_json::json!({ "type": "object", "required": ["parent_id", "title"], "properties": { "parent_id": { "type": "string" }, "title": { "type": "string" }, "content": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::Medium },
            ActionDef { id: "notion.query_database".into(), name: "Query Database".into(), description: "Query a Notion database".into(), input_schema: serde_json::json!({ "type": "object", "required": ["database_id"], "properties": { "database_id": { "type": "string" }, "filter": { "type": "object" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ]
    }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if token.is_empty() { return ActionResult::err("Missing Notion token"); }
        let client = reqwest::Client::new();
        let h = |b: reqwest::RequestBuilder| b.bearer_auth(token).header("Notion-Version", "2022-06-28");
        match action_id {
            "notion.search" => { let query = params.get("query").and_then(|v| v.as_str()).unwrap_or(""); match h(client.post("https://api.notion.com/v1/search")).json(&serde_json::json!({ "query": query })).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "notion.get_page" => { let id = params.get("page_id").and_then(|v| v.as_str()).unwrap_or(""); match h(client.get(format!("https://api.notion.com/v1/pages/{id}"))).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "notion.create_page" => { let parent = params.get("parent_id").and_then(|v| v.as_str()).unwrap_or(""); let title = params.get("title").and_then(|v| v.as_str()).unwrap_or(""); let body = serde_json::json!({ "parent": { "database_id": parent }, "properties": { "title": { "title": [{ "text": { "content": title } }] } } }); match h(client.post("https://api.notion.com/v1/pages")).json(&body).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "notion.query_database" => { let db = params.get("database_id").and_then(|v| v.as_str()).unwrap_or(""); let body = params.get("filter").cloned().unwrap_or(serde_json::json!({})); match h(client.post(format!("https://api.notion.com/v1/databases/{db}/query"))).json(&body).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        let client = reqwest::Client::new();
        match client.get("https://api.notion.com/v1/users/me").bearer_auth(token).header("Notion-Version", "2022-06-28").send().await {
            Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => { let name = j.get("name").and_then(|v| v.as_str()).unwrap_or("Notion"); ConnectionStatus { connected: true, account_label: Some(name.into()), error: None } }, Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) } },
            Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) },
        }
    }
}
