use crate::integrations::*; use async_trait::async_trait;
pub struct GoogleCalendarIntegration;
#[async_trait] impl Integration for GoogleCalendarIntegration {
    fn id(&self) -> &str { "google_calendar" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "google_calendar".into(), name: "Google Calendar".into(), description: "Read, create, and manage calendar events.".into(), category: IntegrationCategory::Calendar, icon: "ri-calendar-line".into(), auth_type: AuthKind::ApiKey { label: "OAuth Access Token".into(), placeholder: Some("ya29.a0...".into()) }, docs_url: Some("https://developers.google.com/calendar/api".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "google_calendar.list_events".into(), name: "List Events".into(), description: "List upcoming events".into(), input_schema: serde_json::json!({ "type": "object", "properties": { "max_results": { "type": "number" }, "time_min": { "type": "string", "description": "RFC3339 start time" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ActionDef { id: "google_calendar.create_event".into(), name: "Create Event".into(), description: "Create a new calendar event".into(), input_schema: serde_json::json!({ "type": "object", "required": ["summary", "start", "end"], "properties": { "summary": { "type": "string" }, "start": { "type": "string" }, "end": { "type": "string" }, "description": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::Medium },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if token.is_empty() { return ActionResult::err("Missing Google access token"); }
        let client = reqwest::Client::new();
        match action_id {
            "google_calendar.list_events" => { let max = params.get("max_results").and_then(|v| v.as_u64()).unwrap_or(10); let now = chrono::Utc::now().to_rfc3339(); let time_min = params.get("time_min").and_then(|v| v.as_str()).unwrap_or(&now); match client.get(format!("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults={max}&timeMin={}", urlencoding::encode(time_min))).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "google_calendar.create_event" => { let body = serde_json::json!({ "summary": params.get("summary").and_then(|v| v.as_str()).unwrap_or(""), "start": { "dateTime": params.get("start").and_then(|v| v.as_str()).unwrap_or("") }, "end": { "dateTime": params.get("end").and_then(|v| v.as_str()).unwrap_or("") }, "description": params.get("description").and_then(|v| v.as_str()).unwrap_or("") }); match client.post("https://www.googleapis.com/calendar/v3/calendars/primary/events").bearer_auth(token).json(&body).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get("https://www.googleapis.com/calendar/v3/calendars/primary").bearer_auth(token).send().await {
            Ok(r) if r.status().is_success() => ConnectionStatus { connected: true, account_label: Some("Google Calendar".into()), error: None },
            _ => ConnectionStatus { connected: false, account_label: None, error: Some("Auth failed".into()) },
        }
    }
}
