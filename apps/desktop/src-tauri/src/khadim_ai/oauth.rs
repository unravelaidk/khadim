use crate::error::AppError;
use base64::Engine;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPE: &str = "openid profile email offline_access";
const JWT_CLAIM_PATH: &str = "https://api.openai.com/auth";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCredentials {
    pub access: String,
    pub refresh: String,
    pub expires: i64,
    #[serde(rename = "accountId")]
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexSessionInfo {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "authUrl")]
    pub auth_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexLoginStatusResponse {
    pub status: String,
    pub error: Option<String>,
    #[serde(rename = "authUrl")]
    pub auth_url: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingCodexSession {
    id: String,
    state: String,
    verifier: String,
    auth_url: String,
    status: String,
    error: Option<String>,
    created_at: i64,
    updated_at: i64,
}

fn sessions() -> &'static Mutex<HashMap<String, PendingCodexSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, PendingCodexSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn auth_file() -> Result<PathBuf, AppError> {
    let dir = dirs::data_dir()
        .map(|dir| dir.join("khadim"))
        .ok_or_else(|| AppError::io("Cannot determine desktop data directory"))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("auth.json"))
}

fn read_auth_file() -> Result<HashMap<String, OAuthCredentials>, AppError> {
    let path = auth_file()?;
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|err| AppError::io(format!("Failed to parse desktop auth file: {err}"))),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(err) => Err(AppError::io(format!("Failed to read desktop auth file: {err}"))),
    }
}

fn write_auth_file(auth: &HashMap<String, OAuthCredentials>) -> Result<(), AppError> {
    let path = auth_file()?;
    let content = serde_json::to_string_pretty(auth)
        .map_err(|err| AppError::io(format!("Failed to encode desktop auth file: {err}")))?;
    std::fs::write(path, format!("{content}\n"))?;
    Ok(())
}

fn random_url_safe(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    rand::rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_pair() -> (String, String) {
    let verifier = random_url_safe(32);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn decode_account_id(access_token: &str) -> Result<String, AppError> {
    let parts = access_token.split('.').collect::<Vec<_>>();
    if parts.len() != 3 {
        return Err(AppError::invalid_input("Invalid access token payload"));
    }
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(parts[1]))
        .map_err(|err| AppError::invalid_input(format!("Failed to decode access token: {err}")))?;
    let json = serde_json::from_slice::<serde_json::Value>(&decoded)
        .map_err(|err| AppError::invalid_input(format!("Failed to parse access token payload: {err}")))?;
    json.get(JWT_CLAIM_PATH)
        .and_then(|value| value.get("chatgpt_account_id"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::invalid_input("Failed to extract account ID from access token"))
}

async fn exchange_code(code: &str, verifier: &str) -> Result<OAuthCredentials, AppError> {
    let response = reqwest::Client::new()
        .post(TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", REDIRECT_URI),
        ])
        .send()
        .await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::health(format!("Codex token exchange failed: HTTP {status} - {body}")));
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| AppError::health(format!("Failed to parse Codex token response: {err}")))?;
    let access = json.get("access_token").and_then(|value| value.as_str()).ok_or_else(|| AppError::health("Codex token response missing access_token"))?;
    let refresh = json.get("refresh_token").and_then(|value| value.as_str()).ok_or_else(|| AppError::health("Codex token response missing refresh_token"))?;
    let expires_in = json.get("expires_in").and_then(|value| value.as_i64()).ok_or_else(|| AppError::health("Codex token response missing expires_in"))?;
    Ok(OAuthCredentials {
        access: access.to_string(),
        refresh: refresh.to_string(),
        expires: chrono::Utc::now().timestamp_millis() + expires_in * 1000,
        account_id: decode_account_id(access)?,
    })
}

async fn refresh_token(credentials: &OAuthCredentials) -> Result<OAuthCredentials, AppError> {
    let response = reqwest::Client::new()
        .post(TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", credentials.refresh.as_str()),
        ])
        .send()
        .await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::health(format!("Codex token refresh failed: HTTP {status} - {body}")));
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| AppError::health(format!("Failed to parse Codex refresh response: {err}")))?;
    let access = json.get("access_token").and_then(|value| value.as_str()).ok_or_else(|| AppError::health("Codex refresh response missing access_token"))?;
    let refresh = json.get("refresh_token").and_then(|value| value.as_str()).unwrap_or(credentials.refresh.as_str());
    let expires_in = json.get("expires_in").and_then(|value| value.as_i64()).ok_or_else(|| AppError::health("Codex refresh response missing expires_in"))?;
    Ok(OAuthCredentials {
        access: access.to_string(),
        refresh: refresh.to_string(),
        expires: chrono::Utc::now().timestamp_millis() + expires_in * 1000,
        account_id: decode_account_id(access)?,
    })
}

fn cleanup_sessions() {
    let cutoff = chrono::Utc::now().timestamp_millis() - 15 * 60 * 1000;
    sessions().lock().unwrap().retain(|_, session| session.updated_at >= cutoff);
}

fn parse_authorization_input(input: &str) -> (Option<String>, Option<String>) {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return (None, None);
    }

    if let Ok(url) = reqwest::Url::parse(trimmed) {
        let code = url.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.to_string());
        let state = url.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.to_string());
        return (code, state);
    }

    if let Some((code, state)) = trimmed.split_once('#') {
        return (Some(code.to_string()), Some(state.to_string()));
    }

    if trimmed.contains("code=") {
        if let Ok(url) = reqwest::Url::parse(&format!("http://localhost/auth/callback?{trimmed}")) {
            let code = url.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.to_string());
            let state = url.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.to_string());
            return (code, state);
        }
    }

    (Some(trimmed.to_string()), None)
}

fn build_auth_url(state: &str, challenge: &str) -> String {
    let mut url = reqwest::Url::parse(AUTHORIZE_URL).expect("valid codex authorize url");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("originator", "khadim");
    url.to_string()
}

fn spawn_callback_server(session_id: String, state: String, verifier: String) {
    std::thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:1455") {
            Ok(listener) => listener,
            Err(err) => {
                if let Some(session) = sessions().lock().unwrap().get_mut(&session_id) {
                    session.error = Some(format!("Failed to bind local callback server: {err}"));
                    session.updated_at = chrono::Utc::now().timestamp_millis();
                }
                return;
            }
        };
        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(stream) => stream,
                Err(_) => continue,
            };
            let mut request = String::new();
            let _ = stream.read_to_string(&mut request);
            let first_line = request.lines().next().unwrap_or_default();
            let path = first_line.split_whitespace().nth(1).unwrap_or("/");
            let url = reqwest::Url::parse(&format!("http://127.0.0.1{path}"));
            let response = match url {
                Ok(url) if url.path() == "/auth/callback" => {
                    let returned_state = url.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.to_string());
                    let code = url.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.to_string());
                    if returned_state.as_deref() != Some(state.as_str()) {
                        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\n\r\nState mismatch.".to_string()
                    } else if let Some(code) = code {
                        let runtime = tokio::runtime::Runtime::new();
                        match runtime {
                            Ok(runtime) => match runtime.block_on(exchange_code(&code, &verifier)) {
                                Ok(credentials) => {
                                    if let Ok(mut auth) = read_auth_file() {
                                        auth.insert("openai-codex".to_string(), credentials);
                                        let _ = write_auth_file(&auth);
                                    }
                                    if let Some(session) = sessions().lock().unwrap().get_mut(&session_id) {
                                        session.status = "connected".to_string();
                                        session.error = None;
                                        session.updated_at = chrono::Utc::now().timestamp_millis();
                                    }
                                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\nOpenAI Codex authentication completed. You can close this window.".to_string()
                                }
                                Err(err) => {
                                    if let Some(session) = sessions().lock().unwrap().get_mut(&session_id) {
                                        session.status = "failed".to_string();
                                        session.error = Some(err.message.clone());
                                        session.updated_at = chrono::Utc::now().timestamp_millis();
                                    }
                                    format!("HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{}", err.message)
                                }
                            },
                            Err(err) => format!("HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/html; charset=utf-8\r\n\r\nFailed to create async runtime: {err}"),
                        }
                    } else {
                        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\n\r\nMissing authorization code.".to_string()
                    }
                }
                _ => "HTTP/1.1 404 Not Found\r\nContent-Type: text/html; charset=utf-8\r\n\r\nCallback route not found.".to_string(),
            };
            let _ = stream.write_all(response.as_bytes());
            let should_stop = sessions()
                .lock()
                .unwrap()
                .get(&session_id)
                .map(|session| session.status != "pending")
                .unwrap_or(true);
            if should_stop {
                break;
            }
        }
    });
}

pub async fn has_openai_codex_auth() -> Result<bool, AppError> {
    Ok(read_auth_file()?.contains_key("openai-codex"))
}

pub fn has_openai_codex_auth_sync() -> Result<bool, AppError> {
    Ok(read_auth_file()?.contains_key("openai-codex"))
}

pub async fn get_openai_codex_api_key() -> Result<String, AppError> {
    if let Ok(api_key) = std::env::var("OPENAI_CODEX_TOKEN") {
        if !api_key.trim().is_empty() {
            return Ok(api_key);
        }
    }
    let mut auth = read_auth_file()?;
    let credentials = auth
        .get("openai-codex")
        .cloned()
        .ok_or_else(|| AppError::invalid_input("OpenAI Codex is not connected"))?;
    let credentials = if chrono::Utc::now().timestamp_millis() >= credentials.expires {
        let refreshed = refresh_token(&credentials).await?;
        auth.insert("openai-codex".to_string(), refreshed.clone());
        write_auth_file(&auth)?;
        refreshed
    } else {
        credentials
    };
    Ok(credentials.access)
}

pub async fn start_openai_codex_login() -> Result<CodexSessionInfo, AppError> {
    cleanup_sessions();
    let session_id = uuid::Uuid::new_v4().to_string();
    let (verifier, challenge) = pkce_pair();
    let state = random_url_safe(16);
    let auth_url = build_auth_url(&state, &challenge);
    sessions().lock().unwrap().insert(
        session_id.clone(),
        PendingCodexSession {
            id: session_id.clone(),
            state: state.clone(),
            verifier: verifier.clone(),
            auth_url: auth_url.clone(),
            status: "pending".to_string(),
            error: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            updated_at: chrono::Utc::now().timestamp_millis(),
        },
    );
    spawn_callback_server(session_id.clone(), state, verifier);
    Ok(CodexSessionInfo { session_id, auth_url })
}

pub async fn submit_openai_codex_manual_code(session_id: &str, input: &str) -> Result<(), AppError> {
    let session = sessions()
        .lock()
        .unwrap()
        .get(session_id)
        .cloned()
        .ok_or_else(|| AppError::not_found("Codex login session not found or expired"))?;
    if session.status != "pending" {
        return Err(AppError::invalid_input("Codex login session is no longer waiting for a code"));
    }
    let (code, state) = parse_authorization_input(input);
    if let Some(state) = state {
        if state != session.state {
            return Err(AppError::invalid_input("State mismatch"));
        }
    }
    let code = code.ok_or_else(|| AppError::invalid_input("Missing authorization code"))?;
    let credentials = exchange_code(&code, &session.verifier).await?;
    let mut auth = read_auth_file()?;
    auth.insert("openai-codex".to_string(), credentials);
    write_auth_file(&auth)?;
    if let Some(existing) = sessions().lock().unwrap().get_mut(session_id) {
        existing.status = "connected".to_string();
        existing.error = None;
        existing.updated_at = chrono::Utc::now().timestamp_millis();
    }
    Ok(())
}

pub async fn get_openai_codex_login_status(session_id: &str) -> Result<CodexLoginStatusResponse, AppError> {
    cleanup_sessions();
    let session = sessions()
        .lock()
        .unwrap()
        .get(session_id)
        .cloned()
        .ok_or_else(|| AppError::not_found("Codex login session not found or expired"))?;
    let _ = (&session.id, session.created_at);
    Ok(CodexLoginStatusResponse {
        status: session.status,
        error: session.error,
        auth_url: Some(session.auth_url),
    })
}
