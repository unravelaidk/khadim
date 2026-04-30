use crate::error::AppError;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;

/// Result of a health check.
#[derive(Debug, Clone, Serialize)]
pub struct HealthStatus {
    pub url: String,
    pub healthy: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Polls a health endpoint with basic auth.
pub async fn check_health(
    base_url: &str,
    path: &str,
    username: &str,
    password: &str,
    timeout_ms: u64,
) -> HealthStatus {
    let url = format!("{}{}", base_url, path);
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .unwrap();

    let start = std::time::Instant::now();

    let auth = BASE64.encode(format!("{username}:{password}"));

    let result = client
        .get(&url)
        .header("Authorization", format!("Basic {auth}"))
        .send()
        .await;

    let latency = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) if resp.status().is_success() => HealthStatus {
            url,
            healthy: true,
            latency_ms: Some(latency),
            error: None,
        },
        Ok(resp) => HealthStatus {
            url,
            healthy: false,
            latency_ms: Some(latency),
            error: Some(format!("HTTP {}", resp.status())),
        },
        Err(e) => HealthStatus {
            url,
            healthy: false,
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}

/// Poll health with retries until healthy or max retries reached.
pub async fn wait_for_health(
    base_url: &str,
    path: &str,
    username: &str,
    password: &str,
    max_retries: u32,
    interval_ms: u64,
) -> Result<HealthStatus, AppError> {
    let mut last_status: Option<HealthStatus> = None;

    for attempt in 0..max_retries {
        let status = check_health(base_url, path, username, password, 3000).await;
        if status.healthy {
            return Ok(status);
        }
        last_status = Some(status.clone());
        log::debug!(
            "Health check attempt {}/{}: {:?}",
            attempt + 1,
            max_retries,
            status.error
        );
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }

    let details = last_status
        .and_then(|status| status.error)
        .unwrap_or_else(|| "unknown error".to_string());

    Err(AppError::health(format!(
        "Health check failed after {max_retries} attempts at {base_url}{path}: {details}"
    )))
}

/// Poll multiple health paths until one responds successfully.
pub async fn wait_for_health_paths(
    base_url: &str,
    paths: &[&str],
    username: &str,
    password: &str,
    max_retries: u32,
    interval_ms: u64,
) -> Result<HealthStatus, AppError> {
    let mut last_error: Option<AppError> = None;

    for path in paths {
        match wait_for_health(base_url, path, username, password, max_retries, interval_ms).await {
            Ok(status) => return Ok(status),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::health("Health check failed")))
}
