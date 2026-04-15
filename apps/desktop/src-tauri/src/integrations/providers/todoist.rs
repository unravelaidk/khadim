use crate::integrations::*; use async_trait::async_trait;
pub struct TodoistIntegration;
#[async_trait] impl Integration for TodoistIntegration {
    fn id(&self) -> &str { "todoist" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "todoist".into(), name: "Todoist".into(), description: "Create, list, and manage tasks in Todoist.".into(), category: IntegrationCategory::ProjectManagement, icon: "ri-checkbox-circle-line".into(), auth_type: AuthKind::ApiKey { label: "API Token".into(), placeholder: Some("Your Todoist API token".into()) }, docs_url: Some("https://developer.todoist.com/rest/v2".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "todoist.list_tasks".into(), name: "List Tasks".into(), description: "List active tasks".into(), input_schema: serde_json::json!({ "type": "object", "properties": { "project_id": { "type": "string" }, "filter": { "type": "string" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ActionDef { id: "todoist.create_task".into(), name: "Create Task".into(), description: "Create a new task".into(), input_schema: serde_json::json!({ "type": "object", "required": ["content"], "properties": { "content": { "type": "string" }, "due_string": { "type": "string" }, "priority": { "type": "number" }, "project_id": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::Medium },
        ActionDef { id: "todoist.complete_task".into(), name: "Complete Task".into(), description: "Mark a task as complete".into(), input_schema: serde_json::json!({ "type": "object", "required": ["task_id"], "properties": { "task_id": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::Medium },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if token.is_empty() { return ActionResult::err("Missing Todoist token"); }
        let client = reqwest::Client::new();
        match action_id {
            "todoist.list_tasks" => { match client.get("https://api.todoist.com/rest/v2/tasks").bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "todoist.create_task" => { match client.post("https://api.todoist.com/rest/v2/tasks").bearer_auth(token).json(&params).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "todoist.complete_task" => { let id = params.get("task_id").and_then(|v| v.as_str()).unwrap_or(""); match client.post(format!("https://api.todoist.com/rest/v2/tasks/{id}/close")).bearer_auth(token).send().await { Ok(r) if r.status().is_success() => ActionResult::ok_text("Task completed"), Ok(r) => ActionResult::err(format!("HTTP {}", r.status())), Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get("https://api.todoist.com/rest/v2/projects").bearer_auth(token).send().await {
            Ok(r) if r.status().is_success() => ConnectionStatus { connected: true, account_label: Some("Todoist".into()), error: None },
            Ok(r) => ConnectionStatus { connected: false, account_label: None, error: Some(format!("HTTP {}", r.status())) },
            Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) },
        }
    }
}
