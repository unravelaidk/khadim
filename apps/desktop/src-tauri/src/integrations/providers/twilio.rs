use crate::integrations::*;
use async_trait::async_trait;
pub struct TwilioIntegration;
#[async_trait]
impl Integration for TwilioIntegration {
    fn id(&self) -> &str { "twilio" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "twilio".into(), name: "Twilio".into(), description: "Send SMS and make calls via Twilio.".into(), category: IntegrationCategory::Notifications, icon: "ri-phone-line".into(), auth_type: AuthKind::Credentials { fields: vec![ CredentialField { key: "account_sid".into(), label: "Account SID".into(), secret: false, required: true, placeholder: Some("AC...".into()) }, CredentialField { key: "auth_token".into(), label: "Auth Token".into(), secret: true, required: true, placeholder: None }, CredentialField { key: "from_number".into(), label: "From Number".into(), secret: false, required: true, placeholder: Some("+1234567890".into()) } ] }, docs_url: Some("https://www.twilio.com/docs/usage/api".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "twilio.send_sms".into(), name: "Send SMS".into(), description: "Send an SMS message".into(), input_schema: serde_json::json!({ "type": "object", "required": ["to", "body"], "properties": { "to": { "type": "string", "description": "Phone number (E.164)" }, "body": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::High },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let sid = ctx.credentials.get("account_sid").map(|s| s.as_str()).unwrap_or("");
        let token = ctx.credentials.get("auth_token").map(|s| s.as_str()).unwrap_or("");
        let from = ctx.credentials.get("from_number").map(|s| s.as_str()).unwrap_or("");
        if sid.is_empty() || token.is_empty() { return ActionResult::err("Missing Twilio credentials"); }
        match action_id {
            "twilio.send_sms" => { let to = params.get("to").and_then(|v| v.as_str()).unwrap_or(""); let body = params.get("body").and_then(|v| v.as_str()).unwrap_or(""); match reqwest::Client::new().post(format!("https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json")).basic_auth(sid, Some(token)).form(&[("To", to), ("From", from), ("Body", body)]).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let sid = ctx.credentials.get("account_sid").map(|s| s.as_str()).unwrap_or("");
        let token = ctx.credentials.get("auth_token").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get(format!("https://api.twilio.com/2010-04-01/Accounts/{sid}.json")).basic_auth(sid, Some(token)).send().await {
            Ok(r) if r.status().is_success() => ConnectionStatus { connected: true, account_label: Some(format!("Twilio ({sid})")), error: None },
            Ok(r) => ConnectionStatus { connected: false, account_label: None, error: Some(format!("HTTP {}", r.status())) },
            Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) },
        }
    }
}
