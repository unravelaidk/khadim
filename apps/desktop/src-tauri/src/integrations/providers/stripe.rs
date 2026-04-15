use crate::integrations::*;
use async_trait::async_trait;
pub struct StripeIntegration;
#[async_trait]
impl Integration for StripeIntegration {
    fn id(&self) -> &str { "stripe" }
    fn metadata(&self) -> IntegrationMeta { IntegrationMeta { id: "stripe".into(), name: "Stripe".into(), description: "Manage payments, customers, and invoices with Stripe.".into(), category: IntegrationCategory::Finance, icon: "ri-bank-card-line".into(), auth_type: AuthKind::ApiKey { label: "Secret Key".into(), placeholder: Some("sk_live_...".into()) }, docs_url: Some("https://stripe.com/docs/api".into()) } }
    fn actions(&self) -> Vec<ActionDef> { vec![
        ActionDef { id: "stripe.list_customers".into(), name: "List Customers".into(), description: "List recent customers".into(), input_schema: serde_json::json!({ "type": "object", "properties": { "limit": { "type": "number" } } }), is_mutation: false, risk_level: RiskLevel::Low },
        ActionDef { id: "stripe.create_customer".into(), name: "Create Customer".into(), description: "Create a new customer".into(), input_schema: serde_json::json!({ "type": "object", "required": ["email"], "properties": { "email": { "type": "string" }, "name": { "type": "string" } } }), is_mutation: true, risk_level: RiskLevel::Medium },
        ActionDef { id: "stripe.list_invoices".into(), name: "List Invoices".into(), description: "List invoices".into(), input_schema: serde_json::json!({ "type": "object", "properties": { "customer": { "type": "string" }, "limit": { "type": "number" } } }), is_mutation: false, risk_level: RiskLevel::Low },
    ] }
    async fn execute(&self, action_id: &str, params: serde_json::Value, ctx: &ActionContext) -> ActionResult {
        let key = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        if key.is_empty() { return ActionResult::err("Missing Stripe key"); }
        let client = reqwest::Client::new();
        match action_id {
            "stripe.list_customers" => { let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(10); match client.get(format!("https://api.stripe.com/v1/customers?limit={limit}")).bearer_auth(key).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "stripe.create_customer" => { let email = params.get("email").and_then(|v| v.as_str()).unwrap_or(""); let mut form = vec![("email", email)]; let name_str; if let Some(n) = params.get("name").and_then(|v| v.as_str()) { name_str = n.to_string(); form.push(("name", &name_str)); } match client.post("https://api.stripe.com/v1/customers").bearer_auth(key).form(&form).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            "stripe.list_invoices" => { match client.get("https://api.stripe.com/v1/invoices?limit=10").bearer_auth(key).send().await { Ok(r) => match r.json::<serde_json::Value>().await { Ok(j) => ActionResult::ok(j), Err(e) => ActionResult::err(e.to_string()) }, Err(e) => ActionResult::err(e.to_string()) } }
            _ => ActionResult::err(format!("Unknown action: {action_id}")),
        }
    }
    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let key = ctx.credentials.get("api_key").map(|s| s.as_str()).unwrap_or("");
        match reqwest::Client::new().get("https://api.stripe.com/v1/balance").bearer_auth(key).send().await {
            Ok(r) if r.status().is_success() => ConnectionStatus { connected: true, account_label: Some("Stripe".into()), error: None },
            Ok(r) => ConnectionStatus { connected: false, account_label: None, error: Some(format!("HTTP {}", r.status())) },
            Err(e) => ConnectionStatus { connected: false, account_label: None, error: Some(e.to_string()) },
        }
    }
}
