use crate::integrations::*;
use async_trait::async_trait;
pub struct ShopifyIntegration;
#[async_trait]
impl Integration for ShopifyIntegration {
    fn id(&self) -> &str {
        "shopify"
    }
    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "shopify".into(),
            name: "Shopify".into(),
            description: "Manage products, orders, and customers in your Shopify store.".into(),
            category: IntegrationCategory::Ecommerce,
            icon: "ri-shopping-bag-line".into(),
            auth_type: AuthKind::Credentials {
                fields: vec![
                    CredentialField {
                        key: "shop_domain".into(),
                        label: "Shop Domain".into(),
                        secret: false,
                        required: true,
                        placeholder: Some("your-store.myshopify.com".into()),
                    },
                    CredentialField {
                        key: "access_token".into(),
                        label: "Admin API Access Token".into(),
                        secret: true,
                        required: true,
                        placeholder: Some("shpat_...".into()),
                    },
                ],
            },
            docs_url: Some("https://shopify.dev/docs/api/admin-rest".into()),
        }
    }
    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "shopify.list_products".into(),
                name: "List Products".into(),
                description: "List products".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "limit": { "type": "number" } } }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
            },
            ActionDef {
                id: "shopify.list_orders".into(),
                name: "List Orders".into(),
                description: "List recent orders".into(),
                input_schema: serde_json::json!({ "type": "object", "properties": { "status": { "type": "string", "enum": ["open", "closed", "any"] } } }),
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
        let domain = ctx
            .credentials
            .get("shop_domain")
            .map(|s| s.as_str())
            .unwrap_or("");
        let token = ctx
            .credentials
            .get("access_token")
            .map(|s| s.as_str())
            .unwrap_or("");
        if domain.is_empty() || token.is_empty() {
            return ActionResult::err("Missing Shopify credentials");
        }
        let client = reqwest::Client::new();
        let base = format!("https://{domain}/admin/api/2024-01");
        match action_id {
            "shopify.list_products" => {
                match client
                    .get(format!("{base}/products.json?limit=20"))
                    .header("X-Shopify-Access-Token", token)
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
            "shopify.list_orders" => {
                let status = params
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("any");
                match client
                    .get(format!("{base}/orders.json?status={status}&limit=20"))
                    .header("X-Shopify-Access-Token", token)
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
            .get("shop_domain")
            .map(|s| s.as_str())
            .unwrap_or("");
        let token = ctx
            .credentials
            .get("access_token")
            .map(|s| s.as_str())
            .unwrap_or("");
        match reqwest::Client::new()
            .get(format!("https://{domain}/admin/api/2024-01/shop.json"))
            .header("X-Shopify-Access-Token", token)
            .send()
            .await
        {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => {
                    let name = j
                        .pointer("/shop/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Shopify");
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
