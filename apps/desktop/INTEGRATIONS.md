# Khadim Integrations — Scalable Backend Plan

## Design Principles

1. **Every integration is a plugin** — same trait, same lifecycle, same discovery
2. **Auth is a first-class subsystem** — OAuth2, API key, and credentials are handled by a shared auth engine, not per-integration
3. **Actions are the unit of work** — every integration exposes typed actions the agent can call
4. **Registry is dynamic** — integrations can be built-in, loaded from WASM plugins, or community-contributed
5. **Credentials stay local** — secrets never leave the device unless the user explicitly deploys to cloud

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      IntegrationRegistry                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ Built-in  │  │ Built-in  │  │ Built-in  │  │   WASM      │ │
│  │ Google    │  │ Slack     │  │ HTTP      │  │   Plugin    │ │
│  │ Suite     │  │           │  │ Generic   │  │   Bridge    │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘ │
│        │              │              │               │         │
│  ┌─────┴──────────────┴──────────────┴───────────────┴───────┐ │
│  │                  Integration Trait                         │ │
│  │  id() → &str                                              │ │
│  │  metadata() → IntegrationMeta                             │ │
│  │  auth_type() → AuthType                                   │ │
│  │  actions() → Vec<ActionDef>                               │ │
│  │  execute(action, params, ctx) → ActionResult              │ │
│  │  test_connection(creds) → ConnectionStatus                │ │
│  │  webhooks() → Vec<WebhookDef>  (optional)                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────┴──────────────────────────────┐  │
│  │                    Shared Services                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ AuthMgr  │  │ SecretMgr│  │ RateLimtr│  │ EventBus │ │  │
│  │  │ OAuth2   │  │ Keyring  │  │ per-svc  │  │ Tauri    │ │  │
│  │  │ API Key  │  │ SQLite   │  │ backoff  │  │ events   │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │        Agent Engine        │
                │  tool_call("gmail.send",   │
                │    { to, subject, body })   │
                │                            │
                │  → IntegrationRegistry     │
                │    .resolve("gmail")       │
                │    .execute("send", ...)   │
                └────────────────────────────┘
```

---

## Core Rust Modules

### File Structure

```
src-tauri/src/integrations/
├── mod.rs                  // Registry, trait, shared types
├── auth.rs                 // OAuth2 engine, token refresh, PKCE
├── secrets.rs              // Keyring + DB secret storage
├── rate_limit.rs           // Per-service rate limiting
├── webhook.rs              // Inbound webhook listener (local HTTP server)
│
├── providers/
│   ├── mod.rs              // Provider discovery + registration
│   │
│   ├── google/
│   │   ├── mod.rs          // Google OAuth2 shared client
│   │   ├── gmail.rs        // Gmail actions
│   │   ├── drive.rs        // Google Drive actions
│   │   ├── sheets.rs       // Google Sheets actions
│   │   ├── calendar.rs     // Google Calendar actions
│   │   └── docs.rs         // Google Docs actions
│   │
│   ├── microsoft/
│   │   ├── mod.rs          // Microsoft Graph shared client
│   │   ├── outlook.rs      // Outlook Mail actions
│   │   ├── onedrive.rs     // OneDrive actions
│   │   ├── excel.rs        // Excel Online actions
│   │   ├── calendar.rs     // Outlook Calendar actions
│   │   ├── teams.rs        // Teams actions
│   │   └── sharepoint.rs   // SharePoint actions
│   │
│   ├── slack.rs            // Slack Bot/OAuth
│   ├── discord.rs          // Discord Bot
│   ├── telegram.rs         // Telegram Bot API
│   ├── notion.rs           // Notion API
│   ├── airtable.rs         // Airtable API
│   ├── jira.rs             // Jira Cloud REST
│   ├── linear.rs           // Linear GraphQL
│   ├── github_ext.rs       // Extended GitHub (wraps existing github.rs)
│   ├── gitlab.rs           // GitLab REST
│   ├── stripe.rs           // Stripe API
│   ├── shopify.rs          // Shopify Admin API
│   ├── hubspot.rs          // HubSpot API
│   ├── salesforce.rs       // Salesforce REST
│   ├── twilio.rs           // Twilio SMS/Voice
│   ├── sendgrid.rs         // SendGrid email
│   ├── postgres.rs         // PostgreSQL connector
│   ├── mysql.rs            // MySQL connector
│   ├── mongodb.rs          // MongoDB connector
│   ├── redis_int.rs        // Redis connector
│   ├── http_generic.rs     // Generic HTTP/REST
│   ├── graphql_generic.rs  // Generic GraphQL
│   ├── webhook_out.rs      // Outbound webhooks
│   ├── rss.rs              // RSS/Atom feed reader
│   ├── s3.rs               // S3-compatible storage
│   ├── smtp.rs             // Generic SMTP email
│   ├── imap.rs             // Generic IMAP read
│   └── caldav.rs           // CalDAV calendar
│
└── bridge.rs               // WASM plugin → Integration trait adapter
```

---

## Core Trait

```rust
// src-tauri/src/integrations/mod.rs

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Metadata ─────────────────────────────────────────────────────

/// Unique identifier for an integration (e.g. "google.gmail", "slack")
pub type IntegrationId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationMeta {
    /// Machine-readable id: "google.gmail"
    pub id: IntegrationId,
    /// Human name: "Gmail"
    pub name: String,
    /// Short description for UI
    pub description: String,
    /// Category for grouping in UI
    pub category: IntegrationCategory,
    /// Icon identifier or SVG data
    pub icon: String,
    /// Whether this integration is built-in vs loaded from a plugin
    pub source: IntegrationSource,
    /// Documentation URL
    pub docs_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationCategory {
    CloudStorage,
    Email,
    Messaging,
    Spreadsheet,
    ProjectManagement,
    Calendar,
    Crm,
    Ecommerce,
    Database,
    DevOps,
    Documents,
    Finance,
    Ai,
    Notifications,
    WebAutomation,
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationSource {
    Builtin,
    Plugin { plugin_id: String },
}

// ── Auth ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthType {
    /// No auth required (e.g. RSS)
    None,
    /// Simple API key in a header
    ApiKey {
        header_name: String,
        prefix: Option<String>,  // e.g. "Bearer", "Bot"
    },
    /// OAuth2 Authorization Code + PKCE
    OAuth2 {
        auth_url: String,
        token_url: String,
        scopes: Vec<String>,
        /// If true, uses the shared provider client (Google/Microsoft)
        /// instead of requiring user to bring their own client_id
        builtin_client: bool,
    },
    /// Username + password / connection string
    Credentials {
        fields: Vec<CredentialField>,
    },
    /// Custom (e.g. Slack bot token install flow)
    Custom {
        setup_url: Option<String>,
        fields: Vec<CredentialField>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialField {
    pub key: String,
    pub label: String,
    pub field_type: FieldType,
    pub required: bool,
    pub placeholder: Option<String>,
    pub help_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldType {
    Text,
    Password,
    Url,
    Number,
    Toggle,
    Select { options: Vec<SelectOption> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

// ── Actions ──────────────────────────────────────────────────────

/// An action the integration can perform — exposed to the agent as a tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionDef {
    /// Fully qualified: "google.gmail.send"
    pub id: String,
    /// Short name for display: "Send Email"
    pub name: String,
    pub description: String,
    /// JSON Schema for input parameters
    pub input_schema: serde_json::Value,
    /// JSON Schema for output
    pub output_schema: serde_json::Value,
    /// Whether this action modifies state (vs read-only)
    pub is_mutation: bool,
    /// Estimated cost/risk level for approval UI
    pub risk_level: RiskLevel,
    /// Rate limit group (actions sharing a group share a limit)
    pub rate_limit_group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Safe to auto-approve (read operations)
    Low,
    /// Show in activity feed, auto-approve unless user opts in to confirm
    Medium,
    /// Always require explicit approval (delete, send, pay)
    High,
}

// ── Execution ────────────────────────────────────────────────────

/// Context passed to every action execution
#[derive(Debug, Clone)]
pub struct ActionContext {
    /// Resolved credentials for this integration instance
    pub credentials: HashMap<String, String>,
    /// OAuth2 access token (already refreshed if needed)
    pub access_token: Option<String>,
    /// Which agent/run is calling this
    pub caller: ActionCaller,
    /// Rate limiter handle
    pub rate_limiter: Option<RateLimitHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionCaller {
    pub agent_id: Option<String>,
    pub run_id: Option<String>,
    pub conversation_id: Option<String>,
    pub user_approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    /// Structured output for the agent to consume
    pub output_text: Option<String>,
    /// Artifacts (e.g. downloaded files, screenshots)
    pub artifacts: Vec<Artifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub name: String,
    pub mime_type: String,
    /// Base64-encoded or file path
    pub content: ArtifactContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ArtifactContent {
    Base64 { data: String },
    FilePath { path: String },
    Url { url: String },
}

// ── Connection ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub account_name: Option<String>,
    pub account_email: Option<String>,
    pub account_avatar: Option<String>,
    pub scopes: Vec<String>,
    pub expires_at: Option<String>,
    pub error: Option<String>,
}

// ── Webhooks ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookDef {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Expected payload schema
    pub payload_schema: Option<serde_json::Value>,
}

// ── Rate Limiting ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RateLimitHandle; // Placeholder — implemented in rate_limit.rs

// ── The Trait ────────────────────────────────────────────────────

#[async_trait]
pub trait Integration: Send + Sync {
    /// Unique id for this integration
    fn id(&self) -> &str;

    /// UI metadata
    fn metadata(&self) -> IntegrationMeta;

    /// What auth this integration requires
    fn auth_type(&self) -> AuthType;

    /// All actions this integration exposes
    fn actions(&self) -> Vec<ActionDef>;

    /// Execute a single action
    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: ActionContext,
    ) -> ActionResult;

    /// Test whether the current credentials work
    async fn test_connection(&self, ctx: ActionContext) -> ConnectionStatus;

    /// Inbound webhook definitions (if any)
    fn webhooks(&self) -> Vec<WebhookDef> {
        vec![]
    }

    /// Called when a webhook payload arrives for this integration
    async fn handle_webhook(
        &self,
        _webhook_id: &str,
        _payload: serde_json::Value,
        _ctx: ActionContext,
    ) -> ActionResult {
        ActionResult {
            success: false,
            data: None,
            error: Some("Webhooks not supported".into()),
            output_text: None,
            artifacts: vec![],
        }
    }
}
```

---

## Integration Registry

```rust
// Also in src-tauri/src/integrations/mod.rs (continued)

use std::sync::Arc;
use tokio::sync::RwLock;

pub struct IntegrationRegistry {
    integrations: RwLock<HashMap<IntegrationId, Arc<dyn Integration>>>,
}

impl IntegrationRegistry {
    pub fn new() -> Self {
        Self {
            integrations: RwLock::new(HashMap::new()),
        }
    }

    /// Register a built-in or plugin integration
    pub async fn register(&self, integration: Arc<dyn Integration>) {
        let id = integration.id().to_string();
        self.integrations.write().await.insert(id, integration);
    }

    /// Get an integration by id
    pub async fn get(&self, id: &str) -> Option<Arc<dyn Integration>> {
        self.integrations.read().await.get(id).cloned()
    }

    /// List all registered integrations
    pub async fn list(&self) -> Vec<IntegrationMeta> {
        self.integrations
            .read()
            .await
            .values()
            .map(|i| i.metadata())
            .collect()
    }

    /// List integrations by category
    pub async fn list_by_category(&self, category: &IntegrationCategory) -> Vec<IntegrationMeta> {
        let cat = serde_json::to_string(category).unwrap_or_default();
        self.integrations
            .read()
            .await
            .values()
            .filter(|i| {
                serde_json::to_string(&i.metadata().category).unwrap_or_default() == cat
            })
            .map(|i| i.metadata())
            .collect()
    }

    /// List all actions across all integrations (for agent tool discovery)
    pub async fn all_actions(&self) -> Vec<ActionDef> {
        let mut actions = Vec::new();
        for integration in self.integrations.read().await.values() {
            actions.extend(integration.actions());
        }
        actions
    }

    /// Execute an action by fully qualified id ("google.gmail.send")
    pub async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: ActionContext,
    ) -> ActionResult {
        // Parse "google.gmail.send" → integration "google.gmail", action "send"
        // Or try prefix matching for nested providers
        let integrations = self.integrations.read().await;

        // Try exact integration match first, then prefix
        for (int_id, integration) in integrations.iter() {
            for action in integration.actions() {
                if action.id == action_id {
                    return integration.execute(&action.id, params, ctx).await;
                }
            }
        }

        ActionResult {
            success: false,
            data: None,
            error: Some(format!("Unknown action: {action_id}")),
            output_text: None,
            artifacts: vec![],
        }
    }
}
```

---

## OAuth2 Auth Engine

```rust
// src-tauri/src/integrations/auth.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Stored token set for an OAuth2 integration instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenSet {
    pub integration_id: String,
    pub instance_id: String,  // User can have multiple Google accounts
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,  // Unix timestamp
    pub scopes: Vec<String>,
    pub token_type: String,
    pub account_email: Option<String>,
}

/// Manages OAuth2 flows and token storage for all integrations
pub struct AuthManager {
    /// Active tokens keyed by "{integration_id}:{instance_id}"
    tokens: RwLock<HashMap<String, OAuthTokenSet>>,
    /// HTTP client for token refresh
    http: reqwest::Client,
    /// Database for persisting tokens
    db: Arc<crate::db::Database>,
}

impl AuthManager {
    pub fn new(db: Arc<crate::db::Database>) -> Self {
        Self {
            tokens: RwLock::new(HashMap::new()),
            http: reqwest::Client::new(),
            db,
        }
    }

    /// Start OAuth2 PKCE flow — returns the authorization URL to open
    pub async fn start_oauth_flow(
        &self,
        integration_id: &str,
        auth_url: &str,
        scopes: &[String],
        redirect_port: u16,
    ) -> Result<OAuthFlowState, String> {
        // 1. Generate code_verifier + code_challenge (S256)
        // 2. Generate state parameter
        // 3. Build authorization URL with PKCE
        // 4. Start local HTTP listener on redirect_port for callback
        // 5. Return URL for frontend to open in browser/webview
        todo!()
    }

    /// Complete OAuth2 flow after receiving callback
    pub async fn complete_oauth_flow(
        &self,
        state: &OAuthFlowState,
        authorization_code: &str,
        token_url: &str,
    ) -> Result<OAuthTokenSet, String> {
        // 1. Exchange code for tokens using PKCE verifier
        // 2. Store tokens in keyring + DB
        // 3. Return token set
        todo!()
    }

    /// Get a valid access token, refreshing if expired
    pub async fn get_access_token(
        &self,
        integration_id: &str,
        instance_id: &str,
        token_url: &str,
    ) -> Result<String, String> {
        let key = format!("{integration_id}:{instance_id}");
        let tokens = self.tokens.read().await;

        if let Some(token_set) = tokens.get(&key) {
            // Check if expired (with 60s buffer)
            let now = chrono::Utc::now().timestamp();
            if let Some(expires_at) = token_set.expires_at {
                if now < expires_at - 60 {
                    return Ok(token_set.access_token.clone());
                }
            } else {
                return Ok(token_set.access_token.clone());
            }
        }
        drop(tokens);

        // Token expired or missing — try refresh
        self.refresh_token(integration_id, instance_id, token_url).await
    }

    /// Refresh an expired access token
    async fn refresh_token(
        &self,
        integration_id: &str,
        instance_id: &str,
        token_url: &str,
    ) -> Result<String, String> {
        // 1. Load refresh_token from storage
        // 2. POST to token_url with grant_type=refresh_token
        // 3. Update stored tokens
        // 4. Return new access_token
        todo!()
    }

    /// Revoke tokens and clear storage
    pub async fn disconnect(
        &self,
        integration_id: &str,
        instance_id: &str,
    ) -> Result<(), String> {
        let key = format!("{integration_id}:{instance_id}");
        self.tokens.write().await.remove(&key);
        // Also clear from DB + keyring
        todo!()
    }

    /// Load all persisted tokens on startup
    pub async fn load_from_storage(&self) -> Result<(), String> {
        // Load from DB settings or dedicated tokens table
        todo!()
    }
}

#[derive(Debug, Clone)]
pub struct OAuthFlowState {
    pub integration_id: String,
    pub auth_url: String,
    pub code_verifier: String,
    pub state: String,
    pub redirect_uri: String,
}
```

---

## Database: Integration Connections Table

New entity to track which integrations a user has connected:

```rust
// Add to src-tauri/src/db/entities.rs

pub mod integration_connections {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "integration_connections")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// Integration id: "google.gmail", "slack", etc.
        pub integration_id: String,
        /// User-given label: "Work Gmail", "Personal Slack"
        pub label: String,
        /// Account email/username if available
        pub account_identifier: Option<String>,
        /// Auth type used: "oauth2", "api_key", "credentials"
        pub auth_type: String,
        /// Non-secret metadata (scopes, account info)
        pub metadata_json: String,
        /// Whether this connection is active
        pub is_active: i32,
        /// Last successful connection test
        pub last_verified_at: Option<String>,
        pub created_at: String,
        pub updated_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod integration_logs {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "integration_logs")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// Which connection was used
        pub connection_id: String,
        /// Action executed: "google.gmail.send"
        pub action_id: String,
        /// Who triggered it
        pub caller_agent_id: Option<String>,
        pub caller_run_id: Option<String>,
        pub caller_conversation_id: Option<String>,
        /// Outcome
        pub success: i32,
        pub error_message: Option<String>,
        /// Timing
        pub duration_ms: i64,
        pub created_at: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
```

---

## Tauri Commands

```rust
// src-tauri/src/commands/integrations.rs

use crate::AppState;
use crate::error::AppError;
use crate::integrations::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Discovery ────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn list_integrations(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<IntegrationMeta>, AppError> {
    Ok(state.integrations.list().await)
}

#[tauri::command]
pub(crate) async fn list_integrations_by_category(
    state: State<'_, Arc<AppState>>,
    category: IntegrationCategory,
) -> Result<Vec<IntegrationMeta>, AppError> {
    Ok(state.integrations.list_by_category(&category).await)
}

#[tauri::command]
pub(crate) async fn get_integration_actions(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
) -> Result<Vec<ActionDef>, AppError> {
    let integration = state.integrations.get(&integration_id).await
        .ok_or_else(|| AppError::not_found(format!("Integration {integration_id} not found")))?;
    Ok(integration.actions())
}

#[tauri::command]
pub(crate) async fn get_integration_auth_type(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
) -> Result<AuthType, AppError> {
    let integration = state.integrations.get(&integration_id).await
        .ok_or_else(|| AppError::not_found(format!("Integration {integration_id} not found")))?;
    Ok(integration.auth_type())
}

// ── Connections ──────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn list_integration_connections(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<IntegrationConnection>, AppError> {
    state.db.list_integration_connections()
}

#[tauri::command]
pub(crate) async fn connect_integration(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
    label: String,
    credentials: serde_json::Value,
) -> Result<IntegrationConnection, AppError> {
    // 1. Validate integration exists
    // 2. Store credentials via SecretManager
    // 3. Test connection
    // 4. Persist connection record
    todo!()
}

#[tauri::command]
pub(crate) async fn start_oauth_connect(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
    label: String,
) -> Result<String, AppError> {
    // Returns URL to open for OAuth2 flow
    todo!()
}

#[tauri::command]
pub(crate) async fn disconnect_integration(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
) -> Result<(), AppError> {
    // 1. Revoke tokens if OAuth2
    // 2. Clear secrets
    // 3. Delete connection record
    todo!()
}

#[tauri::command]
pub(crate) async fn test_integration_connection(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
) -> Result<ConnectionStatus, AppError> {
    todo!()
}

// ── Execution ────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn execute_integration_action(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
    action_id: String,
    params: serde_json::Value,
) -> Result<ActionResult, AppError> {
    // 1. Load connection + credentials
    // 2. Build ActionContext
    // 3. Check risk_level → maybe require approval
    // 4. Execute
    // 5. Log
    todo!()
}

// ── Logs ─────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn list_integration_logs(
    state: State<'_, Arc<AppState>>,
    connection_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<IntegrationLog>, AppError> {
    todo!()
}
```

---

## Agent Tool Bridge

This is how the agent engine sees integrations — as callable tools:

```rust
// src-tauri/src/integrations/tool_bridge.rs

use crate::integrations::{ActionContext, ActionCaller, IntegrationRegistry};
use std::sync::Arc;

/// Converts all connected integration actions into agent-callable tools.
///
/// When the agent requests tool "google.gmail.send", this bridge:
/// 1. Finds the integration + action
/// 2. Resolves credentials from the active connection
/// 3. Checks approval requirements
/// 4. Executes and returns structured output
pub struct IntegrationToolBridge {
    registry: Arc<IntegrationRegistry>,
}

impl IntegrationToolBridge {
    pub fn new(registry: Arc<IntegrationRegistry>) -> Self {
        Self { registry }
    }

    /// Generate tool definitions for connected integrations only.
    /// These get injected into the agent's system prompt / tool list.
    pub async fn available_tools(
        &self,
        connected_integration_ids: &[String],
    ) -> Vec<AgentToolDef> {
        let mut tools = Vec::new();
        for id in connected_integration_ids {
            if let Some(integration) = self.registry.get(id).await {
                for action in integration.actions() {
                    tools.push(AgentToolDef {
                        name: action.id.clone(),
                        description: action.description.clone(),
                        input_schema: action.input_schema.clone(),
                        requires_approval: matches!(action.risk_level,
                            crate::integrations::RiskLevel::High),
                    });
                }
            }
        }
        tools
    }

    /// Execute a tool call from the agent
    pub async fn call(
        &self,
        tool_name: &str,
        params: serde_json::Value,
        caller: ActionCaller,
    ) -> Result<String, String> {
        let ctx = ActionContext {
            credentials: std::collections::HashMap::new(), // Resolved by registry
            access_token: None,  // Resolved by auth manager
            caller,
            rate_limiter: None,
        };
        let result = self.registry.execute(tool_name, params, ctx).await;
        if result.success {
            Ok(result.output_text.unwrap_or_else(||
                serde_json::to_string_pretty(&result.data).unwrap_or_default()
            ))
        } else {
            Err(result.error.unwrap_or_else(|| "Unknown error".into()))
        }
    }
}

#[derive(Debug, Clone)]
pub struct AgentToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub requires_approval: bool,
}
```

---

## Example: Slack Integration

Shows how a single provider implements the trait:

```rust
// src-tauri/src/integrations/providers/slack.rs

use crate::integrations::*;
use async_trait::async_trait;

pub struct SlackIntegration;

#[async_trait]
impl Integration for SlackIntegration {
    fn id(&self) -> &str { "slack" }

    fn metadata(&self) -> IntegrationMeta {
        IntegrationMeta {
            id: "slack".into(),
            name: "Slack".into(),
            description: "Send messages, read channels, manage workflows in Slack".into(),
            category: IntegrationCategory::Messaging,
            icon: "slack".into(),
            source: IntegrationSource::Builtin,
            docs_url: Some("https://api.slack.com".into()),
        }
    }

    fn auth_type(&self) -> AuthType {
        AuthType::OAuth2 {
            auth_url: "https://slack.com/oauth/v2/authorize".into(),
            token_url: "https://slack.com/api/oauth.v2.access".into(),
            scopes: vec![
                "chat:write".into(),
                "channels:read".into(),
                "channels:history".into(),
                "users:read".into(),
                "files:write".into(),
            ],
            builtin_client: true,
        }
    }

    fn actions(&self) -> Vec<ActionDef> {
        vec![
            ActionDef {
                id: "slack.send_message".into(),
                name: "Send Message".into(),
                description: "Send a message to a Slack channel or DM".into(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "required": ["channel", "text"],
                    "properties": {
                        "channel": { "type": "string", "description": "Channel name or ID" },
                        "text": { "type": "string", "description": "Message text (supports Markdown)" },
                        "thread_ts": { "type": "string", "description": "Reply to a thread" }
                    }
                }),
                output_schema: serde_json::json!({ "type": "object" }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
                rate_limit_group: Some("slack.post".into()),
            },
            ActionDef {
                id: "slack.list_channels".into(),
                name: "List Channels".into(),
                description: "List all channels the bot has access to".into(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "limit": { "type": "number", "default": 100 }
                    }
                }),
                output_schema: serde_json::json!({ "type": "array" }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
                rate_limit_group: Some("slack.read".into()),
            },
            ActionDef {
                id: "slack.read_history".into(),
                name: "Read Channel History".into(),
                description: "Read recent messages from a channel".into(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "required": ["channel"],
                    "properties": {
                        "channel": { "type": "string" },
                        "limit": { "type": "number", "default": 20 }
                    }
                }),
                output_schema: serde_json::json!({ "type": "array" }),
                is_mutation: false,
                risk_level: RiskLevel::Low,
                rate_limit_group: Some("slack.read".into()),
            },
            ActionDef {
                id: "slack.upload_file".into(),
                name: "Upload File".into(),
                description: "Upload a file to a channel".into(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "required": ["channel", "content", "filename"],
                    "properties": {
                        "channel": { "type": "string" },
                        "content": { "type": "string" },
                        "filename": { "type": "string" },
                        "title": { "type": "string" }
                    }
                }),
                output_schema: serde_json::json!({ "type": "object" }),
                is_mutation: true,
                risk_level: RiskLevel::Medium,
                rate_limit_group: Some("slack.post".into()),
            },
        ]
    }

    async fn execute(
        &self,
        action_id: &str,
        params: serde_json::Value,
        ctx: ActionContext,
    ) -> ActionResult {
        let token = ctx.access_token.as_deref()
            .or_else(|| ctx.credentials.get("bot_token").map(|s| s.as_str()))
            .unwrap_or("");

        match action_id {
            "slack.send_message" => {
                // POST https://slack.com/api/chat.postMessage
                todo!()
            }
            "slack.list_channels" => {
                // GET https://slack.com/api/conversations.list
                todo!()
            }
            "slack.read_history" => {
                // GET https://slack.com/api/conversations.history
                todo!()
            }
            "slack.upload_file" => {
                // POST https://slack.com/api/files.uploadV2
                todo!()
            }
            _ => ActionResult {
                success: false,
                data: None,
                error: Some(format!("Unknown action: {action_id}")),
                output_text: None,
                artifacts: vec![],
            },
        }
    }

    async fn test_connection(&self, ctx: ActionContext) -> ConnectionStatus {
        // GET https://slack.com/api/auth.test
        todo!()
    }
}
```

---

## Provider Registration

```rust
// src-tauri/src/integrations/providers/mod.rs

use super::{Integration, IntegrationRegistry};
use std::sync::Arc;

mod google;
mod microsoft;
pub mod slack;
// ... all other providers

/// Register all built-in integrations
pub async fn register_all(registry: &IntegrationRegistry) {
    // Google Suite
    registry.register(Arc::new(google::gmail::GmailIntegration)).await;
    registry.register(Arc::new(google::drive::GoogleDriveIntegration)).await;
    registry.register(Arc::new(google::sheets::GoogleSheetsIntegration)).await;
    registry.register(Arc::new(google::calendar::GoogleCalendarIntegration)).await;
    registry.register(Arc::new(google::docs::GoogleDocsIntegration)).await;

    // Microsoft Suite
    registry.register(Arc::new(microsoft::outlook::OutlookIntegration)).await;
    registry.register(Arc::new(microsoft::onedrive::OneDriveIntegration)).await;
    registry.register(Arc::new(microsoft::excel::ExcelIntegration)).await;
    registry.register(Arc::new(microsoft::calendar::OutlookCalendarIntegration)).await;
    registry.register(Arc::new(microsoft::teams::TeamsIntegration)).await;

    // Messaging
    registry.register(Arc::new(slack::SlackIntegration)).await;
    // registry.register(Arc::new(discord::DiscordIntegration)).await;
    // registry.register(Arc::new(telegram::TelegramIntegration)).await;

    // Productivity
    // registry.register(Arc::new(notion::NotionIntegration)).await;
    // registry.register(Arc::new(airtable::AirtableIntegration)).await;
    // registry.register(Arc::new(jira::JiraIntegration)).await;
    // registry.register(Arc::new(linear::LinearIntegration)).await;

    // Generic
    // registry.register(Arc::new(http_generic::HttpIntegration)).await;
    // registry.register(Arc::new(smtp::SmtpIntegration)).await;
    // registry.register(Arc::new(rss::RssIntegration)).await;

    // ... register more as they're built
}
```

---

## AppState Integration

```rust
// Changes to src-tauri/src/lib.rs

pub struct AppState {
    db: Arc<Database>,
    process_runner: ProcessRunner,
    opencode: OpenCodeManager,
    khadim: Arc<KhadimManager>,
    claude_code: Arc<ClaudeCodeManager>,
    github: github::GitHubClient,
    plugins: Arc<PluginManager>,
    skills: Arc<SkillManager>,
    terminals: Arc<TerminalManager>,
    file_index: Arc<FileIndexManager>,
    lsp: Arc<LspManager>,
    // ── NEW ──────────────────────
    integrations: Arc<IntegrationRegistry>,
    auth: Arc<AuthManager>,
}
```

---

## Frontend Types (TypeScript)

```typescript
// src/lib/integration-types.ts

export interface IntegrationMeta {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon: string;
  source: { type: 'builtin' } | { type: 'plugin'; plugin_id: string };
  docs_url?: string;
}

export type IntegrationCategory =
  | 'cloud_storage' | 'email' | 'messaging' | 'spreadsheet'
  | 'project_management' | 'calendar' | 'crm' | 'ecommerce'
  | 'database' | 'dev_ops' | 'documents' | 'finance'
  | 'ai' | 'notifications' | 'web_automation' | 'generic';

export interface ActionDef {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  is_mutation: boolean;
  risk_level: 'low' | 'medium' | 'high';
}

export interface IntegrationConnection {
  id: string;
  integration_id: string;
  label: string;
  account_identifier?: string;
  auth_type: string;
  is_active: boolean;
  last_verified_at?: string;
  created_at: string;
}

export interface ConnectionStatus {
  connected: boolean;
  account_name?: string;
  account_email?: string;
  account_avatar?: string;
  scopes: string[];
  expires_at?: string;
  error?: string;
}

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  output_text?: string;
  artifacts: Artifact[];
}

export interface Artifact {
  name: string;
  mime_type: string;
  content: { type: 'base64'; data: string }
    | { type: 'file_path'; path: string }
    | { type: 'url'; url: string };
}
```

---

## Implementation Order

### Phase 1 — Foundation (do this first)
1. Create `src-tauri/src/integrations/mod.rs` with the core trait + registry + types
2. Create `src-tauri/src/integrations/auth.rs` with OAuth2 PKCE engine
3. Create `src-tauri/src/integrations/secrets.rs` wrapping keyring
4. Add `integration_connections` + `integration_logs` DB tables
5. Add `IntegrationRegistry` + `AuthManager` to `AppState`
6. Add Tauri commands: `list_integrations`, `get_integration_actions`, `connect_integration`, `disconnect_integration`, `test_integration_connection`
7. Add `IntegrationToolBridge` so agents can call integration actions as tools
8. Add `src/lib/integration-types.ts` frontend types

### Phase 2 — First Providers (highest coverage)
9. **Google Suite** — Gmail, Drive, Sheets, Calendar, Docs (one OAuth2 covers all)
10. **Microsoft Suite** — Outlook, OneDrive, Excel, Calendar, Teams (one Graph OAuth2 covers all)
11. **Slack** — messaging
12. **HTTP Generic** — lets power users connect anything immediately
13. **SMTP/IMAP** — generic email for non-Google/Microsoft users

### Phase 3 — High-Value Providers
14. Notion, Airtable
15. Jira, Linear
16. Telegram, Discord
17. Stripe, Shopify
18. PostgreSQL, MySQL

### Phase 4 — Long Tail + Community
19. S3, Salesforce, HubSpot, Twilio, SendGrid
20. RSS, CalDAV, webhooks
21. WASM plugin bridge — let community build integrations
22. Integration marketplace UI

### Phase 5 — Polish
23. Rate limiting per service
24. Integration health monitoring dashboard
25. Usage analytics per integration
26. Batch action support
27. Integration templates ("Connect Gmail + Sheets for invoice processing")

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Trait-based | `#[async_trait] Integration` | Every provider implements the same surface. Easy to add new ones. |
| Registry-based discovery | `IntegrationRegistry` | Agent engine doesn't need to know about specific providers. |
| Auth as shared service | `AuthManager` | One OAuth2 engine for all providers. No per-provider auth code. |
| Actions as the unit | `ActionDef` with JSON Schema | Maps directly to LLM tool calls. Agent sees `slack.send_message` as a tool. |
| Risk levels on actions | `Low / Medium / High` | Integrates with existing ApprovalOverlay. High-risk actions require user approval. |
| Secrets in keyring | OS keyring + encrypted DB fallback | Secrets never in plaintext on disk. Existing `keyring` crate already in Cargo.toml. |
| Logs per action | `integration_logs` table | Full audit trail of what the agent did with each integration. |
| WASM bridge | `bridge.rs` | Community can ship integration plugins as `.wasm` files using existing plugin system. |
| Multi-account | `instance_id` on connections | User can have "Work Gmail" and "Personal Gmail" as separate connections. |

---

## How It Fits Together

```
User says: "Check my Gmail for invoices and add totals to my spreadsheet"

Agent receives tools:
  - google.gmail.search  (from connected "Work Gmail")
  - google.gmail.read
  - google.sheets.append_row  (from connected "Work Sheets")

Agent calls: google.gmail.search({ query: "subject:invoice after:2024/01/01" })
  → IntegrationToolBridge
    → IntegrationRegistry.execute("google.gmail.search", ...)
      → AuthManager.get_access_token("google.gmail", "work-account", ...)
        → (refreshes if needed)
      → GmailIntegration.execute("google.gmail.search", params, ctx)
        → GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=...
      → Log to integration_logs
  → Returns structured email list to agent

Agent calls: google.sheets.append_row({ spreadsheet_id: "...", values: [...] })
  → Same flow, same OAuth2 token (Google Suite shares tokens)
  → Risk: Medium → shown in activity feed
  → POST https://sheets.googleapis.com/v4/spreadsheets/.../values:append
```

This is the complete backend plan. Want me to start implementing Phase 1?
