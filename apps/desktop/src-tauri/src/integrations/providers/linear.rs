use crate::integrations::*;
use async_trait::async_trait;
pub struct LinearIntegration;
#[async_trait]
impl Integration for LinearIntegration {
    fn id(&self) -> &str {
        "linear"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "linear".into(),
            name: "Linear".into(),
            description: "Create, search, and manage issues in Linear.".into(),
            category: IntegrationCategory::ProjectManagement,
            icon: "ri-flashlight-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "API Key".into(),
                placeholder: Some("lin_api_...".into()),
            },
            docs_url: Some("https://developers.linear.app".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "linear.list_issues".into(),
                name: "List Issues".into(),
                description: "List your assigned issues".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "first": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "linear.create_issue".into(),
                name: "Create Issue".into(),
                description: "Create a new issue".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["team_id", "title"], "properties": { "team_id": { "type": "string" }, "title": { "type": "string" }, "description": { "type": "string" }, "priority": { "type": "number" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
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
            return ActionResult::err("Missing Linear API key");
        }
        let client = reqwest::Client::new();
        match action_id {
            "linear.list_issues" => {
                let first = params.get("first").and_then(|v| v.as_u64()).unwrap_or(20);
                let q = format!(
                    r#"{{ "query": "{{ issues(first: {first}) {{ nodes {{ id title state {{ name }} priority assignee {{ name }} }} }} }}" }}"#
                );
                match client
                    .post("https://api.linear.app/graphql")
                    .bearer_auth(token)
                    .header("Content-Type", "application/json")
                    .body(q)
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
            "linear.create_issue" => {
                let team = params.get("team_id").and_then(|v| v.as_str()).unwrap_or("");
                let title = params.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let desc = params
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let q = serde_json::json!({ "query": format!("mutation {{ issueCreate(input: {{ teamId: \"{team}\", title: \"{title}\", description: \"{desc}\" }}) {{ success issue {{ id identifier title url }} }} }}") });
                match client
                    .post("https://api.linear.app/graphql")
                    .bearer_auth(token)
                    .json(&q)
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
        let q = serde_json::json!({ "query": "{ viewer { id name email } }" });
        match reqwest::Client::new()
            .post("https://api.linear.app/graphql")
            .bearer_auth(token)
            .json(&q)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let name = j
                        .pointer("/data/viewer/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Linear");
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
