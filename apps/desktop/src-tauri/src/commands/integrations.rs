use crate::error::AppError;
use crate::integrations::{
    ActionDef, ActionResult, AuthKind, ConnectionStatus, IntegrationConnection,
    IntegrationLog, IntegrationMeta,
    auth::{OAuthConfig, OAuthTokenSet, run_oauth_flow},
    Integration,
};
use crate::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

async fn require_integration(
    state: &AppState,
    integration_id: &str,
) -> Result<Arc<dyn Integration>, AppError> {
    state.integrations.get(integration_id).await.ok_or_else(|| {
        AppError::not_found(format!("Integration {integration_id} not found"))
    })
}

fn oauth_env_key(integration_id: &str, suffix: &str) -> String {
    format!(
        "KHADIM_{}_{}",
        integration_id.to_uppercase().replace('.', "_"),
        suffix
    )
}

fn get_oauth_client_id(integration_id: &str) -> String {
    std::env::var(oauth_env_key(integration_id, "CLIENT_ID")).unwrap_or_default()
}

fn get_oauth_client_secret(integration_id: &str) -> Option<String> {
    std::env::var(oauth_env_key(integration_id, "CLIENT_SECRET")).ok()
}

fn build_oauth_config(
    integration_id: &str,
    auth_type: &AuthKind,
) -> Result<OAuthConfig, AppError> {
    match auth_type {
        AuthKind::OAuth2 {
            auth_url,
            token_url,
            scopes,
        } => Ok(OAuthConfig {
            auth_url: auth_url.clone(),
            token_url: token_url.clone(),
            client_id: get_oauth_client_id(integration_id),
            client_secret: get_oauth_client_secret(integration_id),
            scopes: scopes.clone(),
        }),
        _ => Err(AppError::invalid_input(
            "This integration does not use OAuth. Use connect_integration instead.",
        )),
    }
}

fn oauth_token_credentials(token_set: &OAuthTokenSet) -> HashMap<String, String> {
    let mut creds = HashMap::new();
    creds.insert("api_key".to_string(), token_set.access_token.clone());
    creds.insert("access_token".to_string(), token_set.access_token.clone());
    if let Some(refresh) = &token_set.refresh_token {
        creds.insert("refresh_token".to_string(), refresh.clone());
    }
    if let Some(expires_at) = token_set.expires_at {
        creds.insert("expires_at".to_string(), expires_at.to_string());
    }
    creds
}

fn refresh_connection(
    state: &AppState,
    connection_id: &str,
    fallback: IntegrationConnection,
) -> Result<IntegrationConnection, AppError> {
    Ok(state
        .integrations
        .list_connections()?
        .into_iter()
        .find(|c| c.id == connection_id)
        .unwrap_or(fallback))
}

async fn finalize_connected_integration(
    state: &AppState,
    conn: IntegrationConnection,
    delete_on_failed_test: bool,
) -> Result<IntegrationConnection, AppError> {
    match state.integrations.test_connection(&conn.id).await {
        Ok(status) if status.connected => {
            let connection_id = conn.id.clone();
            if let Some(label) = &status.account_label {
                let _ = state
                    .db
                    .update_integration_connection_account_label(&conn.id, label);
            }
            refresh_connection(state, &connection_id, conn)
        }
        Ok(status) if delete_on_failed_test => {
            let _ = state.integrations.delete_connection(&conn.id);
            Err(AppError::invalid_input(
                status
                    .error
                    .unwrap_or_else(|| "Connection test failed".into()),
            ))
        }
        Ok(_) | Err(_) => Ok(conn),
    }
}

// ── Discovery ────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn list_integrations(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<IntegrationMeta>, AppError> {
    Ok(state.integrations.list_available().await)
}

#[tauri::command]
pub(crate) async fn get_integration_actions(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
) -> Result<Vec<ActionDef>, AppError> {
    let integration = require_integration(state.inner().as_ref(), &integration_id).await?;
    Ok(integration.actions())
}

#[tauri::command]
pub(crate) async fn get_integration_auth_type(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
) -> Result<AuthKind, AppError> {
    let integration = require_integration(state.inner().as_ref(), &integration_id).await?;
    Ok(integration.metadata().auth_type)
}

// ── Connections ──────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn list_integration_connections(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<IntegrationConnection>, AppError> {
    state.integrations.list_connections()
}

#[derive(Deserialize)]
pub(crate) struct ConnectIntegrationInput {
    integration_id: String,
    label: String,
    credentials: HashMap<String, String>,
}

#[tauri::command]
pub(crate) async fn connect_integration(
    state: State<'_, Arc<AppState>>,
    input: ConnectIntegrationInput,
) -> Result<IntegrationConnection, AppError> {
    let app_state = state.inner().as_ref();
    let _integration = require_integration(app_state, &input.integration_id).await?;

    let conn = app_state.integrations.create_connection(
        &input.integration_id,
        &input.label,
        input.credentials,
    )?;

    finalize_connected_integration(app_state, conn, true).await
}

/// OAuth connect: opens browser → user approves → tokens stored automatically.
#[tauri::command]
pub(crate) async fn connect_integration_oauth(
    state: State<'_, Arc<AppState>>,
    integration_id: String,
    label: String,
) -> Result<IntegrationConnection, AppError> {
    let app_state = state.inner().as_ref();
    let integration = require_integration(app_state, &integration_id).await?;

    let meta = integration.metadata();
    let oauth_config = build_oauth_config(&integration_id, &meta.auth_type)?;

    let token_set = run_oauth_flow(&oauth_config).await?;

    let creds = oauth_token_credentials(&token_set);

    let conn = app_state.integrations.create_connection(
        &integration_id,
        &label,
        creds,
    )?;

    finalize_connected_integration(app_state, conn, false).await
}

#[tauri::command]
pub(crate) fn disconnect_integration(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
) -> Result<(), AppError> {
    state.integrations.delete_connection(&connection_id)
}

#[tauri::command]
pub(crate) async fn test_integration_connection(
    state: State<'_, Arc<AppState>>,
    connection_id: String,
) -> Result<ConnectionStatus, AppError> {
    state.integrations.test_connection(&connection_id).await
}

// ── Execution ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub(crate) struct ExecuteActionInput {
    connection_id: String,
    action_id: String,
    params: serde_json::Value,
}

#[tauri::command]
pub(crate) async fn execute_integration_action(
    state: State<'_, Arc<AppState>>,
    input: ExecuteActionInput,
) -> Result<ActionResult, AppError> {
    state
        .integrations
        .execute_action(&input.connection_id, &input.action_id, input.params)
        .await
}

// ── Logs ─────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn list_integration_logs(
    state: State<'_, Arc<AppState>>,
    connection_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<IntegrationLog>, AppError> {
    state
        .integrations
        .list_logs(connection_id.as_deref(), limit.unwrap_or(50))
}
