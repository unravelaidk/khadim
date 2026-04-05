use crate::error::AppError;
use crate::khadim_ai::env_api_keys::get_env_api_key;
use crate::khadim_ai::oauth::{get_openai_codex_api_key, has_openai_codex_auth_sync};
use crate::khadim_ai::models::builtin_models;
use crate::khadim_ai::providers::request_headers::build_codex_request_headers;
use crate::db::Database;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MODEL_CONFIGS_KEY: &str = "khadim:model_configs";
const API_KEYRING_SERVICE: &str = "khadim.desktop.api-keys";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderOption {
    pub r#type: String,
    pub name: String,
    pub needs_base_url: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(default, skip_serializing)]
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<String>,
    #[serde(default)]
    pub has_api_key: bool,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfigInput {
    pub name: String,
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<String>,
    pub is_default: Option<bool>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredProviderModel {
    pub id: String,
    pub name: String,
}

fn provider_name(provider: &str) -> String {
    match provider {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "openai-codex" => "OpenAI Codex",
        "openrouter" => "OpenRouter",
        "ollama" => "Ollama",
        "xai" => "xAI",
        "groq" => "Groq",
        "cerebras" => "Cerebras",
        "mistral" => "Mistral",
        "minimax" => "MiniMax",
        "zai" => "Z.AI",
        "amazon-bedrock" => "Amazon Bedrock",
        "azure-openai-responses" => "Azure OpenAI",
        "github-copilot" => "GitHub Copilot",
        "huggingface" => "Hugging Face",
        "vercel-ai-gateway" => "Vercel AI Gateway",
        "opencode" => "OpenCode",
        "opencode-go" => "OpenCode Go",
        "kimi-coding" => "Kimi Coding",
        "google" => "Google",
        "google-vertex" => "Google Vertex",
        other => other,
    }
    .to_string()
}

fn provider_needs_base_url(provider: &str) -> bool {
    matches!(
        provider,
        "ollama" | "amazon-bedrock" | "azure-openai-responses" | "vercel-ai-gateway" | "google-vertex"
    )
}

fn keyring_entry(name: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(API_KEYRING_SERVICE, name)
        .map_err(|err| AppError::io(format!("Failed to open keyring entry '{name}': {err}")))
}

fn provider_key_name(provider: &str) -> String {
    format!("provider:{provider}")
}

fn model_key_name(config_id: &str) -> String {
    format!("model:{config_id}")
}

fn get_secret(name: &str) -> Result<Option<String>, AppError> {
    let entry = keyring_entry(name)?;
    match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::io(format!("Failed to read keyring entry '{name}': {err}"))),
    }
}

fn set_secret(name: &str, value: &str) -> Result<(), AppError> {
    keyring_entry(name)?
        .set_password(value)
        .map_err(|err| AppError::io(format!("Failed to store keyring entry '{name}': {err}")))
}

fn delete_secret(name: &str) -> Result<(), AppError> {
    let entry = keyring_entry(name)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::io(format!("Failed to delete keyring entry '{name}': {err}"))),
    }
}

fn get_saved_provider_api_key(provider: &str) -> Result<Option<String>, AppError> {
    get_secret(&provider_key_name(provider))
}

pub fn saved_provider_api_key(provider: &str) -> Result<Option<String>, AppError> {
    get_saved_provider_api_key(provider)
}

fn get_saved_model_api_key(config_id: &str) -> Result<Option<String>, AppError> {
    get_secret(&model_key_name(config_id))
}

fn save_api_key(config_id: &str, provider: &str, api_key: &str) -> Result<(), AppError> {
    set_secret(&model_key_name(config_id), api_key)?;
    set_secret(&provider_key_name(provider), api_key)
}

fn resolve_config_api_key(config: &ModelConfig) -> Result<Option<String>, AppError> {
    Ok(get_saved_model_api_key(&config.id)?
        .or_else(|| get_saved_provider_api_key(&config.provider).ok().flatten())
        .or_else(|| config.api_key.clone())
        .filter(|value| !value.trim().is_empty()))
}

fn populate_runtime_secrets(config: &mut ModelConfig) -> Result<(), AppError> {
    config.api_key = resolve_config_api_key(config)?;
    config.has_api_key = config.api_key.is_some();
    Ok(())
}

pub fn supported_providers() -> Vec<ProviderOption> {
    vec![
        "openai",
        "anthropic",
        "openai-codex",
        "openrouter",
        "ollama",
        "xai",
        "groq",
        "cerebras",
        "mistral",
        "minimax",
        "zai",
        "amazon-bedrock",
        "azure-openai-responses",
        "github-copilot",
        "huggingface",
        "vercel-ai-gateway",
        "opencode",
        "opencode-go",
        "kimi-coding",
        "google",
        "google-vertex",
    ]
    .into_iter()
    .map(|provider| ProviderOption {
        r#type: provider.to_string(),
        name: provider_name(provider),
        needs_base_url: provider_needs_base_url(provider),
    })
    .collect()
}

fn load_configs(db: &Database) -> Result<Vec<ModelConfig>, AppError> {
    let raw = db.get_setting(MODEL_CONFIGS_KEY)?;
    match raw {
        Some(raw) => {
            let mut configs: Vec<ModelConfig> = serde_json::from_str(&raw)
                .map_err(|err| AppError::db(format!("Failed to parse stored Khadim model configs: {err}")))?;
            let mut migrated = false;
            for config in &mut configs {
                if let Some(api_key) = config.api_key.clone().filter(|value| !value.trim().is_empty()) {
                    save_api_key(&config.id, &config.provider, &api_key)?;
                    config.api_key = None;
                    migrated = true;
                }
                populate_runtime_secrets(config)?;
            }
            if migrated {
                save_configs(db, &configs)?;
            }
            Ok(configs)
        }
        None => Ok(Vec::new()),
    }
}

fn save_configs(db: &Database, configs: &[ModelConfig]) -> Result<(), AppError> {
    let raw = serde_json::to_string(configs)
        .map_err(|err| AppError::db(format!("Failed to encode Khadim model configs: {err}")))?;
    db.set_setting(MODEL_CONFIGS_KEY, &raw)
}

fn normalize_flags(configs: &mut [ModelConfig]) {
    let default_id = configs.iter().find(|config| config.is_default).map(|config| config.id.clone());
    let active_id = configs.iter().find(|config| config.is_active).map(|config| config.id.clone());

    if let Some(default_id) = default_id {
        for config in configs.iter_mut() {
            config.is_default = config.id == default_id;
        }
    }
    if let Some(active_id) = active_id {
        for config in configs.iter_mut() {
            config.is_active = config.id == active_id;
        }
    }
}

pub fn list_configs(db: &Database) -> Result<Vec<ModelConfig>, AppError> {
    let mut configs = load_configs(db)?;
    for config in &mut configs {
        populate_runtime_secrets(config)?;
    }
    normalize_flags(&mut configs);
    configs.sort_by(|left, right| right.is_active.cmp(&left.is_active).then_with(|| left.name.cmp(&right.name)));
    Ok(configs)
}

pub fn create_config(db: &Database, input: ModelConfigInput) -> Result<ModelConfig, AppError> {
    if input.name.trim().is_empty() || input.provider.trim().is_empty() || input.model.trim().is_empty() {
        return Err(AppError::invalid_input("Name, provider, and model are required"));
    }
    let mut configs = load_configs(db)?;
    let mut config = ModelConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        provider: input.provider.trim().to_string(),
        model: input.model.trim().to_string(),
        api_key: None,
        base_url: input.base_url.filter(|value| !value.trim().is_empty()),
        temperature: input.temperature.filter(|value| !value.trim().is_empty()),
        has_api_key: false,
        is_default: input.is_default.unwrap_or(false),
        is_active: input.is_active.unwrap_or(true),
    };
    if configs.is_empty() {
        config.is_default = true;
        config.is_active = true;
    }
    if config.is_default {
        for existing in &mut configs {
            existing.is_default = false;
        }
    }
    if config.is_active {
        for existing in &mut configs {
            existing.is_active = false;
        }
    }
    if let Some(api_key) = input.api_key.filter(|value| !value.trim().is_empty()) {
        save_api_key(&config.id, &config.provider, &api_key)?;
        config.api_key = Some(api_key);
        config.has_api_key = true;
    } else {
        config.has_api_key = get_saved_provider_api_key(&config.provider)?.is_some();
    }
    configs.push(config.clone());
    save_configs(db, &configs)?;
    Ok(config)
}

pub fn update_config(db: &Database, id: &str, input: ModelConfigInput) -> Result<ModelConfig, AppError> {
    let mut configs = load_configs(db)?;
    let index = configs
        .iter()
        .position(|config| config.id == id)
        .ok_or_else(|| AppError::not_found(format!("Model config not found: {id}")))?;
    let set_default = input.is_default.unwrap_or(false);
    let set_active = input.is_active.unwrap_or(false);
    let api_key = input.api_key;
    let base_url = input.base_url;
    let temperature = input.temperature;

    {
        let config = &mut configs[index];
        config.name = input.name.trim().to_string();
        config.provider = input.provider.trim().to_string();
        config.model = input.model.trim().to_string();
        if let Some(api_key) = api_key {
            if !api_key.trim().is_empty() {
                save_api_key(&config.id, &config.provider, &api_key)?;
                config.api_key = Some(api_key);
            }
        }
        config.base_url = base_url.filter(|value| !value.trim().is_empty());
        config.temperature = temperature.filter(|value| !value.trim().is_empty());
        config.has_api_key = resolve_config_api_key(config)?.is_some();
    }
    if set_default {
        for existing in &mut configs {
            existing.is_default = existing.id == id;
        }
    }
    if set_active {
        for existing in &mut configs {
            existing.is_active = existing.id == id;
        }
    }
    let updated = configs[index].clone();
    save_configs(db, &configs)?;
    Ok(updated)
}

pub fn delete_config(db: &Database, id: &str) -> Result<(), AppError> {
    let mut configs = load_configs(db)?;
    let removed = configs.iter().position(|config| config.id == id);
    let removed = removed.ok_or_else(|| AppError::not_found(format!("Model config not found: {id}")))?;
    let removed_config = configs.remove(removed);
    delete_secret(&model_key_name(&removed_config.id))?;
    if removed_config.is_default {
        if let Some(first) = configs.first_mut() {
            first.is_default = true;
        }
    }
    if removed_config.is_active {
        if let Some(first) = configs.first_mut() {
            first.is_active = true;
        }
    }
    save_configs(db, &configs)
}

pub fn set_active_config(db: &Database, id: &str) -> Result<(), AppError> {
    let mut configs = load_configs(db)?;
    let mut found = false;
    for config in &mut configs {
        let is_target = config.id == id;
        found |= is_target;
        config.is_active = is_target;
    }
    if !found {
        return Err(AppError::not_found(format!("Model config not found: {id}")));
    }
    save_configs(db, &configs)
}

pub fn set_default_config(db: &Database, id: &str) -> Result<(), AppError> {
    let mut configs = load_configs(db)?;
    let mut found = false;
    for config in &mut configs {
        let is_target = config.id == id;
        found |= is_target;
        config.is_default = is_target;
    }
    if !found {
        return Err(AppError::not_found(format!("Model config not found: {id}")));
    }
    save_configs(db, &configs)
}

pub fn active_config(db: &Database) -> Result<Option<ModelConfig>, AppError> {
    let mut config = load_configs(db)?.into_iter().find(|config| config.is_active);
    if let Some(config) = config.as_mut() {
        populate_runtime_secrets(config)?;
    }
    Ok(config)
}

fn registry_models_for_provider(provider: &str) -> Vec<DiscoveredProviderModel> {
    builtin_models()
        .into_iter()
        .filter(|model| model.provider == provider)
        .map(|model| DiscoveredProviderModel {
            id: model.id,
            name: model.name,
        })
        .collect()
}

fn normalize_model_pairs(items: impl IntoIterator<Item = (String, String)>) -> Vec<DiscoveredProviderModel> {
    let mut unique = BTreeMap::new();
    for (id, name) in items {
        if !id.trim().is_empty() {
            unique.insert(id.clone(), DiscoveredProviderModel { id, name });
        }
    }
    unique.into_values().collect()
}

fn decode_codex_account_id(token: &str) -> Option<String> {
    let parts = token.split('.').collect::<Vec<_>>();
    if parts.len() != 3 {
        return None;
    }

    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .ok()
        .or_else(|| base64::engine::general_purpose::URL_SAFE.decode(parts[1]).ok())?;
    let json = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    json.get("https://api.openai.com/auth")?
        .get("chatgpt_account_id")?
        .as_str()
        .map(ToOwned::to_owned)
}

fn extract_codex_model_pairs(value: &serde_json::Value) -> Vec<(String, String)> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let id = item
                .get("slug")
                .or_else(|| item.get("id"))
                .or_else(|| item.get("model_slug"))
                .and_then(|value| value.as_str())?;
            let name = item
                .get("title")
                .or_else(|| item.get("name"))
                .or_else(|| item.get("display_name"))
                .and_then(|value| value.as_str())
                .unwrap_or(id);
            Some((id.to_string(), name.to_string()))
        })
        .collect()
}

async fn discover_codex_models() -> Result<Vec<DiscoveredProviderModel>, AppError> {
    let token = get_openai_codex_api_key().await?;
    let mut headers = reqwest::header::HeaderMap::new();
    let bearer = format!("Bearer {token}");
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&bearer)
            .map_err(|err| AppError::invalid_input(format!("Invalid Codex token: {err}")))?,
    );
    headers.insert(
        "originator",
        reqwest::header::HeaderValue::from_static("khadim"),
    );
    for (key, value) in build_codex_request_headers(None) {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_str(&value),
        ) {
            headers.insert(name, val);
        }
    }
    if let Some(account_id) = decode_codex_account_id(&token) {
        if let Ok(value) = reqwest::header::HeaderValue::from_str(&account_id) {
            headers.insert("chatgpt-account-id", value);
        }
    }

    let payload = fetch_json("https://chatgpt.com/backend-api/models", headers).await?;
    let model_pairs = extract_codex_model_pairs(&payload)
        .into_iter()
        .chain(
            payload
                .get("data")
                .into_iter()
                .flat_map(extract_codex_model_pairs),
        )
        .chain(
            payload
                .get("models")
                .into_iter()
                .flat_map(extract_codex_model_pairs),
        );
    let models = normalize_model_pairs(model_pairs);
    if models.is_empty() {
        return Err(AppError::health(
            "Failed to parse OpenAI Codex model list from ChatGPT backend",
        ));
    }
    Ok(models)
}

async fn fetch_json(url: &str, headers: reqwest::header::HeaderMap) -> Result<serde_json::Value, AppError> {
    let response = reqwest::Client::new().get(url).headers(headers).send().await?;
    if !response.status().is_success() {
        return Err(AppError::health(format!("Failed to fetch provider models: HTTP {}", response.status())));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| AppError::health(format!("Failed to parse provider models response: {err}")))
}

pub async fn discover_models(provider: &str, api_key: Option<String>, base_url: Option<String>) -> Result<Vec<DiscoveredProviderModel>, AppError> {
    let registry_only = BTreeSet::from([
        "opencode",
        "opencode-go",
        "github-copilot",
        "amazon-bedrock",
        "azure-openai-responses",
        "vercel-ai-gateway",
        "kimi-coding",
        "google-vertex",
    ]);

    if provider == "openai-codex" {
        return discover_codex_models().await;
    }

    if registry_only.contains(provider) {
        return Ok(registry_models_for_provider(provider));
    }

    if provider == "ollama" {
        let url = format!("{}/api/tags", base_url.unwrap_or_else(|| "http://localhost:11434".to_string()).trim_end_matches('/'));
        let payload = fetch_json(&url, reqwest::header::HeaderMap::new()).await?;
        let models = payload
            .get("models")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        return Ok(normalize_model_pairs(models.into_iter().filter_map(|model| {
            let id = model.get("model").or_else(|| model.get("name")).and_then(|value| value.as_str())?;
            let name = model.get("name").or_else(|| model.get("model")).and_then(|value| value.as_str()).unwrap_or(id);
            Some((id.to_string(), name.to_string()))
        })));
    }

    if provider == "anthropic" {
        let key = api_key
            .filter(|value| !value.trim().is_empty())
            .or_else(|| get_saved_provider_api_key(provider).ok().flatten())
            .or_else(|| get_env_api_key(provider))
            .ok_or_else(|| AppError::invalid_input("Missing API key for Anthropic"))?;
        let url = format!("{}/models", base_url.unwrap_or_else(|| "https://api.anthropic.com/v1".to_string()).trim_end_matches('/'));
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("x-api-key", reqwest::header::HeaderValue::from_str(&key).map_err(|err| AppError::invalid_input(format!("Invalid Anthropic API key: {err}")))?);
        headers.insert("anthropic-version", reqwest::header::HeaderValue::from_static("2023-06-01"));
        let payload = fetch_json(&url, headers).await?;
        let models = payload.get("data").and_then(|value| value.as_array()).cloned().unwrap_or_default();
        return Ok(normalize_model_pairs(models.into_iter().filter_map(|model| {
            let id = model.get("id").and_then(|value| value.as_str())?;
            let name = model.get("display_name").and_then(|value| value.as_str()).unwrap_or(id);
            Some((id.to_string(), name.to_string()))
        })));
    }

    let resolved_base_url = match base_url {
        Some(base_url) if !base_url.trim().is_empty() => base_url,
        _ => builtin_models()
            .into_iter()
            .find(|model| model.provider == provider)
            .map(|model| model.base_url)
            .filter(|url| !url.is_empty())
            .ok_or_else(|| AppError::invalid_input(format!("Base URL is required for {provider}")))?,
    };

    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(api_key) = api_key
        .filter(|value| !value.trim().is_empty())
        .or_else(|| get_saved_provider_api_key(provider).ok().flatten())
        .or_else(|| get_env_api_key(provider))
    {
        let bearer = format!("Bearer {api_key}");
        headers.insert(reqwest::header::AUTHORIZATION, reqwest::header::HeaderValue::from_str(&bearer).map_err(|err| AppError::invalid_input(format!("Invalid provider API key: {err}")))?);
    }
    let payload = fetch_json(&format!("{}/models", resolved_base_url.trim_end_matches('/')), headers).await?;
    let models = payload.get("data").and_then(|value| value.as_array()).cloned().unwrap_or_default();
    Ok(normalize_model_pairs(models.into_iter().filter_map(|model| {
        let id = model.get("id").and_then(|value| value.as_str())?;
        let name = model.get("name").and_then(|value| value.as_str()).unwrap_or(id);
        Some((id.to_string(), name.to_string()))
    })))
}

pub fn configured_model_options(db: &Database) -> Result<Vec<crate::khadim_ai::models::CatalogModelOption>, AppError> {
    Ok(list_configs(db)?
        .into_iter()
        .map(|config| crate::khadim_ai::models::CatalogModelOption {
            provider_id: config.provider.clone(),
            provider_name: provider_name(&config.provider),
            model_id: config.model.clone(),
            model_name: config.name.clone(),
            is_default: config.is_default,
        })
        .collect())
}

pub fn configured_model_override(db: &Database, provider: &str, model_id: &str) -> Result<Option<ModelConfig>, AppError> {
    let mut config = load_configs(db)?
        .into_iter()
        .find(|config| config.provider == provider && config.model == model_id);
    if let Some(config) = config.as_mut() {
        populate_runtime_secrets(config)?;
    }
    Ok(config)
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub status: String,
    pub has_api_key: bool,
    pub has_env_key: bool,
    pub configured_models: u32,
}

pub fn provider_statuses(db: &Database) -> Result<Vec<ProviderStatus>, AppError> {
    let configs = load_configs(db)?;
    let providers = supported_providers();
    let mut statuses = Vec::with_capacity(providers.len());

    for provider in &providers {
        let model_count = configs.iter().filter(|c| c.provider == provider.r#type).count() as u32;

        let has_saved_key = get_saved_provider_api_key(&provider.r#type)
            .ok()
            .flatten()
            .is_some();
        let has_env_key = get_env_api_key(&provider.r#type).is_some();
        let has_oauth_key = provider.r#type == "openai-codex"
            && has_openai_codex_auth_sync().unwrap_or(false);
        let has_key = has_saved_key || has_env_key || has_oauth_key;

        let status = if model_count > 0 && has_key {
            "active"
        } else if has_key {
            "configured"
        } else if model_count > 0 {
            "no_key"
        } else {
            "inactive"
        };

        statuses.push(ProviderStatus {
            id: provider.r#type.clone(),
            name: provider.name.clone(),
            status: status.to_string(),
            has_api_key: has_key,
            has_env_key,
            configured_models: model_count,
        });
    }

    Ok(statuses)
}

pub fn save_provider_api_key(provider: &str, api_key: &str) -> Result<(), AppError> {
    if api_key.trim().is_empty() {
        return Err(AppError::invalid_input("API key cannot be empty"));
    }
    set_secret(&provider_key_name(provider), api_key)
}

pub fn delete_provider_api_key(provider: &str) -> Result<(), AppError> {
    delete_secret(&provider_key_name(provider))
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkModelEntry {
    pub model_id: String,
    pub model_name: String,
}

/// Create ModelConfig entries for a list of models belonging to a single provider.
/// Skips models that already have a config for the same (provider, model) pair.
/// The first model created becomes active+default if no configs exist yet.
/// Returns the number of configs actually created.
pub fn bulk_create_provider_models(
    db: &Database,
    provider: &str,
    models: &[BulkModelEntry],
) -> Result<u32, AppError> {
    if models.is_empty() {
        return Ok(0);
    }
    let mut configs = load_configs(db)?;
    let has_provider_key = get_saved_provider_api_key(provider)?.is_some()
        || get_env_api_key(provider).is_some();
    let was_empty = configs.is_empty();
    let mut created = 0u32;

    for entry in models.iter() {
        if entry.model_id.trim().is_empty() {
            continue;
        }
        // Skip duplicates.
        let already_exists = configs
            .iter()
            .any(|c| c.provider == provider && c.model == entry.model_id);
        if already_exists {
            continue;
        }

        let is_first = was_empty && created == 0;
        let config = ModelConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: entry.model_name.trim().to_string(),
            provider: provider.to_string(),
            model: entry.model_id.trim().to_string(),
            api_key: None,
            base_url: None,
            temperature: None,
            has_api_key: has_provider_key,
            is_default: is_first,
            is_active: is_first,
        };

        if is_first {
            for existing in &mut configs {
                existing.is_default = false;
                existing.is_active = false;
            }
        }

        configs.push(config);
        created += 1;
    }

    if created > 0 {
        save_configs(db, &configs)?;
    }
    Ok(created)
}

/// Remove all ModelConfig entries for a given provider.
/// Returns the number of configs removed.
pub fn remove_provider_models(db: &Database, provider: &str) -> Result<u32, AppError> {
    let mut configs = load_configs(db)?;
    let before = configs.len();
    let removed_ids: Vec<String> = configs
        .iter()
        .filter(|c| c.provider == provider)
        .map(|c| c.id.clone())
        .collect();
    configs.retain(|c| c.provider != provider);
    let removed = (before - configs.len()) as u32;

    // Clean up keyring entries for removed configs.
    for id in &removed_ids {
        let _ = delete_secret(&model_key_name(id));
    }

    // Reassign flags if needed.
    if removed > 0 {
        let has_default = configs.iter().any(|c| c.is_default);
        let has_active = configs.iter().any(|c| c.is_active);
        if !has_default {
            if let Some(first) = configs.first_mut() {
                first.is_default = true;
            }
        }
        if !has_active {
            if let Some(first) = configs.first_mut() {
                first.is_active = true;
            }
        }
        save_configs(db, &configs)?;
    }
    Ok(removed)
}

pub fn active_model_option(db: &Database) -> Result<Option<crate::khadim_ai::models::CatalogModelOption>, AppError> {
    Ok(active_config(db)?.map(|config| crate::khadim_ai::models::CatalogModelOption {
        provider_id: config.provider.clone(),
        provider_name: provider_name(&config.provider),
        model_id: config.model.clone(),
        model_name: config.name.clone(),
        is_default: config.is_default,
    }))
}
