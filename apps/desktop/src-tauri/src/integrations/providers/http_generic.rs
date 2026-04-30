use crate::integrations::*;
use async_trait::async_trait;

pub struct HttpGenericIntegration;

#[async_trait]
impl Integration for HttpGenericIntegration {
    fn id(&self) -> &str {
        "http"
    }

    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "http".into(),
            name: "HTTP / REST API".into(),
            description: "Call any REST API endpoint. Great for connecting services that don't have a dedicated integration.".into(),
            category: IntegrationCategory::Generic,
            icon: "ri-global-line".into(),
            auth_type: AuthKind::Credentials {
                fields: vec![
                    CredentialField { key: "base_url".into(), label: "Base URL".into(), secret: false, required: true, placeholder: Some("https://api.example.com".into()) },
                    CredentialField { key: "auth_header".into(), label: "Auth header name".into(), secret: false, required: false, placeholder: Some("Authorization".into()) },
                    CredentialField { key: "auth_value".into(), label: "Auth header value".into(), secret: true, required: false, placeholder: Some("Bearer sk-...".into()) },
                ],
            },
            docs_url: None,
        }
    }

    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "http.get".into(),
                name: "GET Request".into(),
                description: "Send an HTTP GET request".into(),
                input_schema: serde_json::json!({
                    "type": "object", "required": ["path"],
                    "properties": {
                        "path": { "type": "string", "description": "URL path (appended to base URL)" },
                        "headers": { "type": "object", "description": "Additional headers" }
                    }
                }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "http.post".into(),
                name: "POST Request".into(),
                description: "Send an HTTP POST request with a JSON body".into(),
                input_schema: serde_json::json!({
                    "type": "object", "required": ["path"],
                    "properties": {
                        "path": { "type": "string" },
                        "body": { "type": "object" },
                        "headers": { "type": "object" }
                    }
                }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "http.put".into(),
                name: "PUT Request".into(),
                description: "Send an HTTP PUT request".into(),
                input_schema: serde_json::json!({
                    "type": "object", "required": ["path"],
                    "properties": {
                        "path": { "type": "string" },
                        "body": { "type": "object" },
                        "headers": { "type": "object" }
                    }
                }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
            },
            ActionDef {
                id: "http.delete".into(),
                name: "DELETE Request".into(),
                description: "Send an HTTP DELETE request".into(),
                input_schema: serde_json::json!({
                    "type": "object", "required": ["path"],
                    "properties": { "path": { "type": "string" }, "headers": { "type": "object" } }
                }),
                is_mutation: true,
                risk_level: RiskLevel::High,
            },
        ]
    }

    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: &ActionContext,
    ) -> ActionResult {
        let base_url = match ctx.credentials.get("base_url") {
            Some(u) => u.trim_end_matches('/'),
            None => return ActionResult::err("Missing base_url"),
        };
        let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let url = format!("{}/{}", base_url, path.trim_start_matches('/'));

        let client = reqwest::Client::new();
        let mut builder = match action_id {
            "http.get" => client.get(&url),
            "http.post" => client.post(&url),
            "http.put" => client.put(&url),
            "http.delete" => client.delete(&url),
            _ => return ActionResult::err(format!("Unknown action: {action_id}")),
        };

        // Auth header
        if let (Some(header), Some(value)) = (
            ctx.credentials.get("auth_header"),
            ctx.credentials.get("auth_value"),
        ) {
            if !header.is_empty() && !value.is_empty() {
                builder = builder.header(header.as_str(), value.as_str());
            }
        }

        // Custom headers
        if let Some(headers) = params.get("headers").and_then(|v| v.as_object()) {
            for (k, v) in headers {
                if let Some(val) = v.as_str() {
                    builder = builder.header(k.as_str(), val);
                }
            }
        }

        // Body for POST/PUT
        if matches!(action_id, "http.post" | "http.put") {
            if let Some(body) = params.get("body") {
                builder = builder.json(body);
            }
        }

        match builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                if status >= 200 && status < 300 {
                    // Try to parse as JSON, fall back to text
                    match serde_json::from_str::<serde_json::Value>(&body) {
                        Ok(json) => {
                            ActionResult::ok(serde_json::json!({ "status": status, "body": json }))
                        }
                        Err(_) => {
                            ActionResult::ok(serde_json::json!({ "status": status, "body": body }))
                        }
                    }
                } else {
                    ActionResult::err(format!("HTTP {status}: {body}"))
                }
            }
            Err(e) => ActionResult::err(format!("Request failed: {e}")),
        }
    }

    async fn test_connection(&self, ctx: &ActionContext) -> ConnectionStatus {
        let base_url = match ctx.credentials.get("base_url") {
            Some(u) => u.clone(),
            None => {
                return ConnectionStatus {
                    connected: false,
                    account_label: None,
                    error: Some("No base URL configured".into()),
                }
            }
        };
        ConnectionStatus {
            connected: true,
            account_label: Some(base_url),
            error: None,
        }
    }
}
