use crate::integrations::*;
use async_trait::async_trait;
pub struct JiraIntegration;
#[async_trait]
impl Integration for JiraIntegration {
    fn id(&self) -> &str {
        "jira"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "jira".into(),
            name: "Jira".into(),
            description: "Create, search, and update issues in Jira.".into(),
            category: IntegrationCategory::ProjectManagement,
            icon: "ri-bug-line".into(),
            auth_type: AuthKind::Credentials {
                fields: vec![
                    CredentialField {
                        key: "domain".into(),
                        label: "Jira Domain".into(),
                        secret: false,
                        required: true,
                        placeholder: Some("yourteam.atlassian.net".into()),
                    },
                    CredentialField {
                        key: "email".into(),
                        label: "Email".into(),
                        secret: false,
                        required: true,
                        placeholder: Some("you@company.com".into()),
                    },
                    CredentialField {
                        key: "api_token".into(),
                        label: "API Token".into(),
                        secret: true,
                        required: true,
                        placeholder: Some("ATATT3...".into()),
                    },
                ],
            },
            docs_url: Some("https://developer.atlassian.com/cloud/jira/platform/rest/v3".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "jira.search".into(),
                name: "Search Issues".into(),
                description: "Search issues with JQL".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["jql"], "properties": { "jql": { "type": "string" }, "max_results": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "jira.create_issue".into(),
                name: "Create Issue".into(),
                description: "Create a new issue".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["project", "summary", "issue_type"], "properties": { "project": { "type": "string" }, "summary": { "type": "string" }, "description": { "type": "string" }, "issue_type": { "type": "string" } } }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "jira.update_issue".into(),
                name: "Update Issue".into(),
                description: "Update an existing issue".into(),
                input_schema: serde_json::json!({ "type": "object", "required": ["issue_key"], "properties": { "issue_key": { "type": "string" }, "summary": { "type": "string" }, "status": { "type": "string" }, "assignee": { "type": "string" } } }),
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
        let domain = ctx
            .credentials
            .get("domain")
            .map(|s| s.as_str())
            .unwrap_or("");
        let email = ctx
            .credentials
            .get("email")
            .map(|s| s.as_str())
            .unwrap_or("");
        let token = ctx
            .credentials
            .get("api_token")
            .map(|s| s.as_str())
            .unwrap_or("");
        if domain.is_empty() || token.is_empty() {
            return ActionResult::err("Missing Jira credentials");
        }
        let client = reqwest::Client::new();
        let base = format!("https://{domain}/rest/api/3");
        match action_id {
            "jira.search" => {
                let jql = params.get("jql").and_then(|v| v.as_str()).unwrap_or("");
                match client
                    .get(format!("{base}/search"))
                    .basic_auth(email, Some(token))
                    .query(&[("jql", jql)])
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
            "jira.create_issue" => {
                let project = params.get("project").and_then(|v| v.as_str()).unwrap_or("");
                let summary = params.get("summary").and_then(|v| v.as_str()).unwrap_or("");
                let itype = params
                    .get("issue_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Task");
                let body = serde_json::json!({ "fields": { "project": { "key": project }, "summary": summary, "issuetype": { "name": itype } } });
                match client
                    .post(format!("{base}/issue"))
                    .basic_auth(email, Some(token))
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
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let domain = ctx
            .credentials
            .get("domain")
            .map(|s| s.as_str())
            .unwrap_or("");
        let email = ctx
            .credentials
            .get("email")
            .map(|s| s.as_str())
            .unwrap_or("");
        let token = ctx
            .credentials
            .get("api_token")
            .map(|s| s.as_str())
            .unwrap_or("");
        match reqwest::Client::new()
            .get(format!("https://{domain}/rest/api/3/myself"))
            .basic_auth(email, Some(token))
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let name = j
                        .get("displayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Jira");
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
