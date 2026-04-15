//! OAuth2 PKCE auth flow for integrations.
//!
//! When a user clicks "Connect" on an OAuth integration:
//! 1. We generate PKCE code_verifier + code_challenge
//! 2. Start a local HTTP server on a random port for the redirect
//! 3. Open the browser to the auth URL
//! 4. Capture the authorization code from the callback
//! 5. Exchange code for tokens
//! 6. Store tokens and close the server

use crate::error::AppError;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub scopes: Vec<String>,
    pub token_type: String,
}

#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub auth_url: String,
    pub token_url: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub scopes: Vec<String>,
}

/// Generate a random PKCE code verifier (43-128 chars, unreserved URL chars).
fn generate_code_verifier() -> String {
    let mut rng = rand::rng();
    let chars: Vec<u8> = (0..64)
        .map(|_| {
            let idx = rng.random_range(0..66);
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[idx]
        })
        .collect();
    String::from_utf8(chars).unwrap()
}

/// Generate the S256 code challenge from a verifier.
fn generate_code_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        hash,
    )
}

/// Generate a random state parameter.
fn generate_state() -> String {
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.random()).collect();
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        &bytes,
    )
}

/// Find a free port on localhost.
fn find_free_port() -> Result<u16, AppError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::io(format!("Failed to find free port: {e}")))?;
    let port = listener.local_addr()
        .map_err(|e| AppError::io(format!("Failed to get port: {e}")))?
        .port();
    Ok(port)
}

fn build_auth_url(config: &OAuthConfig, redirect_uri: &str, state: &str, code_challenge: &str) -> String {
    let scopes = config.scopes.join(" ");
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        config.auth_url,
        urlencoding::encode(&config.client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(&scopes),
        urlencoding::encode(state),
        urlencoding::encode(code_challenge),
    )
}

fn parse_callback_params(request: &str) -> Option<HashMap<String, String>> {
    let query_start = request.find("/callback?")?;
    let query_end = request[query_start..]
        .find(" HTTP")
        .unwrap_or(request.len() - query_start);
    let query = &request[query_start + 10..query_start + query_end];

    Some(
        query
            .split('&')
            .filter_map(|pair| {
                let mut parts = pair.splitn(2, '=');
                Some((
                    parts.next()?.to_string(),
                    urlencoding::decode(parts.next().unwrap_or(""))
                        .unwrap_or_default()
                        .to_string(),
                ))
            })
            .collect(),
    )
}

fn oauth_html(title: &str, color: &str, body: &str, auto_close: bool) -> String {
    let auto_close_script = if auto_close {
        "<script>setTimeout(()=>window.close(),2000)</script>"
    } else {
        ""
    };

    format!(
        "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>\
         <h2 style='color:{color}'>{title}</h2>\
         {body}\
         {auto_close_script}</body></html>"
    )
}

fn handle_callback(params: &HashMap<String, String>, expected_state: &str) -> (String, Result<String, String>) {
    if let Some(error) = params.get("error") {
        return (
            oauth_html(
                "❌ Authorization failed",
                "#e74c3c",
                &format!(
                    "<p>{}</p><p style='color:#888'>You can close this window.</p>",
                    error
                ),
                false,
            ),
            Err(error.clone()),
        );
    }

    if let (Some(code), Some(recv_state)) = (params.get("code"), params.get("state")) {
        if recv_state != expected_state {
            return (
                oauth_html(
                    "❌ State mismatch",
                    "#e74c3c",
                    "<p style='color:#888'>You can close this window.</p>",
                    false,
                ),
                Err("State mismatch — possible CSRF".into()),
            );
        }

        return (
            oauth_html(
                "✓ Connected!",
                "#27ae60",
                "<p>You can close this window and return to Khadim.</p>",
                true,
            ),
            Ok(code.clone()),
        );
    }

    (
        oauth_html(
            "❌ Missing code",
            "#e74c3c",
            "<p style='color:#888'>You can close this window.</p>",
            false,
        ),
        Err("No authorization code in callback".into()),
    )
}

async fn exchange_token(
    config: &OAuthConfig,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<serde_json::Value, AppError> {
    let client = reqwest::Client::new();
    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", &config.client_id),
        ("code_verifier", code_verifier),
    ];

    let secret_ref;
    if let Some(ref secret) = config.client_secret {
        secret_ref = secret.clone();
        form.push(("client_secret", &secret_ref));
    }

    let token_response = client
        .post(&config.token_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::io(format!("Token exchange failed: {e}")))?;

    if !token_response.status().is_success() {
        let body = token_response.text().await.unwrap_or_default();
        return Err(AppError::io(format!("Token exchange returned error: {body}")));
    }

    token_response
        .json()
        .await
        .map_err(|e| AppError::io(format!("Failed to parse token response: {e}")))
}

fn parse_token_set(token_json: serde_json::Value, scopes: Vec<String>) -> Result<OAuthTokenSet, AppError> {
    let access_token = token_json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::io("No access_token in response"))?
        .to_string();

    let refresh_token = token_json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from);

    let expires_at = token_json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .map(|secs| chrono::Utc::now().timestamp() + secs);

    let token_type = token_json
        .get("token_type")
        .and_then(|v| v.as_str())
        .unwrap_or("Bearer")
        .to_string();

    Ok(OAuthTokenSet {
        access_token,
        refresh_token,
        expires_at,
        scopes,
        token_type,
    })
}

/// Run the full OAuth2 PKCE flow.
///
/// 1. Starts a local server on a random port
/// 2. Opens the browser to the authorization URL
/// 3. Waits for the callback with the authorization code
/// 4. Exchanges the code for tokens
/// 5. Returns the token set
pub async fn run_oauth_flow(config: &OAuthConfig) -> Result<OAuthTokenSet, AppError> {
    let port = find_free_port()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();
    let auth_url = build_auth_url(config, &redirect_uri, &state, &code_challenge);

    // Channel to receive the authorization code
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let expected_state = state.clone();

    // Start the local HTTP server
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
        .await
        .map_err(|e| AppError::io(format!("Failed to start OAuth callback server: {e}")))?;

    let server_handle = tokio::spawn(async move {
        let mut tx = Some(tx);
        // Accept one connection
        if let Ok((mut stream, _)) = listener.accept().await {
            let mut buf = vec![0u8; 4096];
            let _ = tokio::io::AsyncReadExt::read(&mut stream, &mut buf).await;
            let request = String::from_utf8_lossy(&buf);

            if let Some(params) = parse_callback_params(&request) {
                let (response_body, callback_result) = handle_callback(&params, &expected_state);
                if let Some(tx) = tx.take() {
                    let _ = tx.send(callback_result);
                }

                // Send HTTP response
                let http_response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response_body.len(),
                    response_body
                );
                let _ = tokio::io::AsyncWriteExt::write_all(&mut stream, http_response.as_bytes()).await;
            }
        }
    });

    // Open the browser
    let _ = opener::open(&auth_url);

    log::info!("OAuth flow started — waiting for callback on port {port}");

    // Wait for the callback (with 5 minute timeout)
    let code = tokio::time::timeout(std::time::Duration::from_secs(300), rx)
        .await
        .map_err(|_| AppError::io("OAuth flow timed out after 5 minutes"))?
        .map_err(|_| AppError::io("OAuth callback channel closed"))?
        .map_err(|e| AppError::io(format!("OAuth error: {e}")))?;

    server_handle.abort();
    let token_json = exchange_token(config, &code, &redirect_uri, &code_verifier).await?;
    let token_set = parse_token_set(token_json, config.scopes.clone())?;

    log::info!(
        "OAuth flow completed — got access token (refresh: {})",
        token_set.refresh_token.is_some()
    );

    Ok(token_set)
}

/// Refresh an expired access token.
pub async fn refresh_access_token(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Result<OAuthTokenSet, AppError> {
    let client = reqwest::Client::new();
    let mut form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(token_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::io(format!("Token refresh failed: {e}")))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::io(format!("Token refresh error: {body}")));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::io(format!("Failed to parse refresh response: {e}")))?;

    Ok(OAuthTokenSet {
        access_token: json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        refresh_token: json.get("refresh_token").and_then(|v| v.as_str()).map(String::from),
        expires_at: json.get("expires_in").and_then(|v| v.as_i64()).map(|s| chrono::Utc::now().timestamp() + s),
        scopes: vec![],
        token_type: json.get("token_type").and_then(|v| v.as_str()).unwrap_or("Bearer").to_string(),
    })
}
