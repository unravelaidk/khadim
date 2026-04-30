use crate::integrations::*;
use async_trait::async_trait;
pub struct GitHubExtIntegration;
#[async_trait]
impl Integration for GitHubExtIntegration {
    fn id(&self) -> &str {
        "github"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "github".into(),
            name: "GitHub".into(),
            description: "Create issues, PRs, search repos, and manage GitHub projects.".into(),
            category: IntegrationCategory::DevOps,
            icon: "ri-github-line".into(),
            auth_type: AuthKind::ApiKey {
                label: "Personal Access Token".into(),
                placeholder: Some("ghp_...".into()),
            },
            docs_url: Some("https://docs.github.com/en/rest".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "github.search_repos".into(),
                name: "Search Repos".into(),
                description: "Search GitHub repositories".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["query"], "properties": { "query": { "type": "string" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "github.create_issue".into(),
                name: "Create Issue".into(),
                description: "Create a new issue in a repo".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["owner", "repo", "title"], "properties": { "owner": { "type": "string" }, "repo": { "type": "string" }, "title": { "type": "string" }, "body": { "type": "string" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "github.list_issues".into(),
                name: "List Issues".into(),
                description: "List issues for a repo".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["owner", "repo"], "properties": { "owner": { "type": "string" }, "repo": { "type": "string" }, "state": { "type": "string", "enum": ["open", "closed", "all"] } } }),
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
            return ActionResult::err("Missing GitHub token");
        }
        let client = reqwest::Client::new();
        let h = |b: reqwest::RequestBuilder| {
            b.bearer_auth(token)
                .header("User-Agent", "Khadim-Desktop")
                .header("Accept", "application/vnd.github+json")
        };
        match action_id {
            "github.search_repos" => {
                let q = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
                match h(client.get("https://api.github.com/search/repositories"))
                    .query(&[("q", q)])
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
            "github.create_issue" => {
                let owner = params.get("owner").and_then(|v| v.as_str()).unwrap_or("");
                let repo = params.get("repo").and_then(|v| v.as_str()).unwrap_or("");
                let body = serde_json::json!({ "title": params.get("title").and_then(|v| v.as_str()).unwrap_or(""), "body": params.get("body").and_then(|v| v.as_str()).unwrap_or("") });
                match h(client.post(format!(
                    "https://api.github.com/repos/{owner}/{repo}/issues"
                )))
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
            "github.list_issues" => {
                let owner = params.get("owner").and_then(|v| v.as_str()).unwrap_or("");
                let repo = params.get("repo").and_then(|v| v.as_str()).unwrap_or("");
                let state = params
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("open");
                match h(client.get(format!(
                    "https://api.github.com/repos/{owner}/{repo}/issues"
                )))
                .query(&[("state", state)])
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
            .get("https://api.github.com/user")
            .bearer_auth(token)
            .header("User-Agent", "Khadim")
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let login = j.get("login").and_then(|v| v.as_str()).unwrap_or("GitHub");
                    ConnectionStatus {
                        connected: true,
                        account_label: Some(format!("@{login}")),
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
