use crate::integrations::*; use async_trait::async_trait;
pub struct GoogleSheetsIntegration;
#[async_trait] impl Integration for GoogleSheetsIntegration {
    fn id(&self) -> &str { "google_sheets" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "google_sheets".into(), name: "Google Sheets".into(), description: "Read, write, and manage spreadsheets in Google Sheets.".into(), category: IntegrationCategory::Spreadsheet, icon: "ri-file-excel-line".into(), auth_type: AuthKind::ApiKey { label: "OAuth Access Token".into(), placeholder: Some("ya29.a0...".into()) }, docs_url: Some("https://developers.google.com/sheets/api".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "google_sheets.read_range".into(), name: "Read Range".into(), description: "Read values from a spreadsheet range".into(), input_schema: serde_json::json!({ "type": "object", "required": ["spreadsheet_id", "range"], "properties": { "spreadsheet_id": { "type": "string" }, "range": { "type": "string", "description": "A1 notation, e.g. Sheet1!A1:D10" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ActionDef { id: "google_sheets.append_row".into(), name: "Append Row".into(), description: "Append a row to a sheet".into(), input_schema: serde_json::json!({ "type": "object", "required": ["spreadsheet_id", "range", "values"], "properties": { "spreadsheet_id": { "type": "string" }, "range": { "type": "string" }, "values": { "type": "array", "items": { "type": "string" } } } }), is_mutation: true, risk_level: RiskLevel::Medium },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if token.is_empty() { return ActionResult::err("Missing Google access token"); }
        let sid = params.get("spreadsheet_id").and_then(|v| v.as_str()).unwrap_or("");
        let range = params.get("range").and_then(|v| v.as_str()).unwrap_or("");
        let client = reqwest::Client::new();
        match action_id {
            "google_sheets.read_range" => { match client.get(format!("https://sheets.googleapis.com/v4/spreadsheets/{sid}/values/{range}")).bearer_auth(token).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "google_sheets.append_row" => { let values = params.get("values").cloned().unwrap_or(serde_json::json!([])); let body = serde_json::json!({ "values": [values] }); match client.post(format!("https://sheets.googleapis.com/v4/spreadsheets/{sid}/values/{range}:append?valueInputOption=USER_ENTERED")).bearer_auth(token).json(&body).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let token = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get("https://www.googleapis.com/drive/v3/about?fields=user").bearer_auth(token).send().await {
            Ok(r) if r.status().is_success() => ConnectionStatus { connected: true, account_label: Some("Google Sheets".into()), error: None },
            _ => ConnectionStatus { connected: false, account_label: None, error: Some("Auth failed".into()) },
        }
    }
}
