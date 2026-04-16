use crate::error::AppError;
use crate::khadim_ai::env_api_keys::get_env_api_key;
use crate::khadim_ai::oauth::{get_openai_codex_api_key, has_openai_codex_auth_sync};
use crate::khadim_ai::models::builtin_models;
use crate::khadim_ai::providers::request_headers::build_codex_request_headers;
use crate::db::Database;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Mutex, OnceLock};

const MODEL_CONFIGS_KEY: &str = "khadim:model_configs";
const API_KEYRING_SERVICE: &str = "khadim.desktop.api-keys";

static SECRET_CACHE: OnceLock<Mutex<BTreeMap<String, Option<String>>>> = OnceLock::new();

fn secret_cache() -> &'static Mutex<BTreeMap<String, Option<String>>> {
    SECRET_CACHE.get_or_init(|| Mutex::new(BTreeMap::new()))
}

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
    if let Some(cached) = secret_cache().lock().unwrap().get(name).cloned() {
        return Ok(cached);
    }

    let entry = keyring_entry(name)?;
    let value = match entry.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::io(format!("Failed to read keyring entry '{name}': {err}"))),
    }?;

    secret_cache()
        .lock()
        .unwrap()
        .insert(name.to_string(), value.clone());

    Ok(value)
}

fn set_secret(name: &str, value: &str) -> Result<(), AppError> {
    keyring_entry(name)?
        .set_password(value)
        .map_err(|err| AppError::io(format!("Failed to store keyring entry '{name}': {err}")))?;

    secret_cache()
        .lock()
        .unwrap()
        .insert(name.to_string(), Some(value.to_string()));

    Ok(())
}

fn delete_secret(name: &str) -> Result<(), AppError> {
    let entry = keyring_entry(name)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            secret_cache().lock().unwrap().insert(name.to_string(), None);
            Ok(())
        }
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
    normalize_base_url(config);
    config.api_key = resolve_config_api_key(config)?;
    config.has_api_key = config.api_key.is_some();
    Ok(())
}

fn normalize_base_url(config: &mut ModelConfig) {
    let provider = config.provider.as_str();
    if !matches!(provider, "opencode" | "opencode-go") {
        return;
    }

    let trimmed = config.base_url.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let builtin_base_url = builtin_models()
        .into_iter()
        .find(|model| model.provider == config.provider && model.id == config.model)
        .map(|model| model.base_url);

    let Some(builtin_base_url) = builtin_base_url else {
        return;
    };

    let legacy_provider_default = match provider {
        "opencode" => "https://opencode.ai/zen",
        "opencode-go" => "https://opencode.ai/zen/go/v1",
        _ => return,
    };

    if trimmed.is_none() || trimmed == Some(legacy_provider_default) {
        config.base_url = Some(builtin_base_url);
    }
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

fn opencode_discovery_base_url(base_url: Option<String>) -> String {
    let trimmed = base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    match trimmed {
        Some(url) if url.ends_with("/v1") => url.to_string(),
        Some(url) => format!("{}/v1", url.trim_end_matches('/')),
        None => "https://opencode.ai/zen/v1".to_string(),
    }
}

async fn discover_opencode_models(provider: &str, api_key: Option<String>, base_url: Option<String>) -> Result<Vec<DiscoveredProviderModel>, AppError> {
    let resolved_base_url = opencode_discovery_base_url(base_url);
    let api_key = api_key
        .filter(|value| !value.trim().is_empty())
        .or_else(|| get_saved_provider_api_key(provider).ok().flatten())
        .or_else(|| get_env_api_key(provider))
        .ok_or_else(|| AppError::invalid_input(format!("Missing API key for {provider}")))?;

    let mut headers = reqwest::header::HeaderMap::new();
    let bearer = format!("Bearer {api_key}");
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&bearer)
            .map_err(|err| AppError::invalid_input(format!("Invalid provider API key: {err}")))?,
    );

    let payload = fetch_json(&format!("{}/models", resolved_base_url.trim_end_matches('/')), headers).await?;
    let discovered = payload
        .get("data")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let discovered_pairs = discovered.into_iter().filter_map(|model| {
        let id = model.get("id").and_then(|value| value.as_str())?;
        let name = model
            .get("name")
            .or_else(|| model.get("display_name"))
            .and_then(|value| value.as_str())
            .unwrap_or(id);
        Some((id.to_string(), name.to_string()))
    });

    Ok(normalize_model_pairs(
        registry_models_for_provider(provider)
            .into_iter()
            .map(|model| (model.id, model.name))
            .chain(discovered_pairs),
    ))
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
            let visibility = item
                .get("visibility")
                .and_then(|value| value.as_str())
                .unwrap_or("list");
            if visibility != "list" {
                return None;
            }

            let id = item
                .get("slug")
                .or_else(|| item.get("id"))
                .or_else(|| item.get("model_slug"))
                .and_then(|value| value.as_str())?;
            let name = item
                .get("display_name")
                .or_else(|| item.get("title"))
                .or_else(|| item.get("name"))
                .or_else(|| item.get("slug"))
                .and_then(|value| value.as_str())
                .unwrap_or(id);
            Some((id.to_string(), name.to_string()))
        })
        .collect()
}

fn codex_models_endpoint() -> String {
    let base_url = crate::khadim_ai::env_api_keys::get_env_base_url("openai-codex")
        .unwrap_or_else(|| "https://chatgpt.com/backend-api/codex".to_string());
    let normalized = base_url.trim_end_matches('/');

    if normalized.ends_with("/models") {
        normalized.to_string()
    } else if normalized.ends_with("/codex") {
        format!("{normalized}/models")
    } else {
        format!("{normalized}/codex/models")
    }
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

    let payload = fetch_json(&codex_models_endpoint(), headers).await?;
    let model_pairs = payload
        .get("models")
        .into_iter()
        .flat_map(extract_codex_model_pairs);
    let models = normalize_model_pairs(model_pairs);
    if models.is_empty() {
        return Err(AppError::health(
            "Failed to parse OpenAI Codex model list from Codex backend",
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

    if provider == "opencode" {
        return discover_opencode_models(provider, api_key, base_url).await;
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

#[derive(Debug, Clone, Serialize)]
pub struct ProviderModelSyncResult {
    pub checked_providers: u32,
    pub synced_providers: u32,
    pub failed_providers: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderModelApplyResult {
    pub created: u32,
    pub removed: u32,
}

fn provider_has_credentials(provider: &str) -> bool {
    let has_saved_key = get_saved_provider_api_key(provider)
        .ok()
        .flatten()
        .is_some();
    let has_env_key = get_env_api_key(provider).is_some();
    let has_oauth_key = provider == "openai-codex"
        && has_openai_codex_auth_sync().unwrap_or(false);

    has_saved_key || has_env_key || has_oauth_key
}

pub fn provider_statuses(db: &Database) -> Result<Vec<ProviderStatus>, AppError> {
    let configs = load_configs(db)?;
    let providers = supported_providers();
    let mut statuses = Vec::with_capacity(providers.len());

    for provider in &providers {
        let model_count = configs.iter().filter(|c| c.provider == provider.r#type).count() as u32;

        let has_env_key = get_env_api_key(&provider.r#type).is_some();
        let has_key = provider_has_credentials(&provider.r#type);

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

pub async fn sync_saved_provider_models(db: &Database) -> Result<ProviderModelSyncResult, AppError> {
    let providers = supported_providers();
    let mut checked_providers = 0u32;
    let mut synced_providers = 0u32;
    let mut failed_providers = 0u32;

    for provider in providers {
        if !provider_has_credentials(&provider.r#type) {
            continue;
        }

        let should_reconcile = provider.r#type == "openai-codex";
        let has_existing_configs = load_configs(db)?
            .into_iter()
            .any(|config| config.provider == provider.r#type);
        if has_existing_configs && !should_reconcile {
            continue;
        }

        checked_providers += 1;

        match discover_models(&provider.r#type, None, None).await {
            Ok(discovered) if !discovered.is_empty() => {
                let models = discovered
                    .into_iter()
                    .map(|model| BulkModelEntry {
                        model_id: model.id,
                        model_name: model.name,
                    })
                    .collect::<Vec<_>>();

                let result = apply_provider_models(db, &provider.r#type, &models, should_reconcile)?;
                if result.created > 0 || result.removed > 0 {
                    synced_providers += 1;
                }
            }
            Ok(_) => {}
            Err(err) => {
                failed_providers += 1;
                eprintln!(
                    "failed to sync models for provider '{}' on startup: {}",
                    provider.r#type, err.message
                );
            }
        }
    }

    Ok(ProviderModelSyncResult {
        checked_providers,
        synced_providers,
        failed_providers,
    })
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
    Ok(apply_provider_models(db, provider, models, false)?.created)
}

pub fn sync_provider_models(
    db: &Database,
    provider: &str,
    models: &[BulkModelEntry],
) -> Result<ProviderModelApplyResult, AppError> {
    apply_provider_models(db, provider, models, true)
}

fn apply_provider_models(
    db: &Database,
    provider: &str,
    models: &[BulkModelEntry],
    remove_missing: bool,
) -> Result<ProviderModelApplyResult, AppError> {
    if models.is_empty() {
        return Ok(ProviderModelApplyResult {
            created: 0,
            removed: 0,
        });
    }

    let mut configs = load_configs(db)?;
    let has_provider_key = provider_has_credentials(provider);
    let mut created = 0u32;
    let mut removed = 0u32;
    let mut changed = false;
    let discovered_ids = models
        .iter()
        .filter_map(|entry| {
            let id = entry.model_id.trim();
            (!id.is_empty()).then(|| id.to_string())
        })
        .collect::<BTreeSet<_>>();

    if remove_missing {
        let before = configs.len();
        let removed_ids = configs
            .iter()
            .filter(|config| config.provider == provider && !discovered_ids.contains(&config.model))
            .map(|config| config.id.clone())
            .collect::<Vec<_>>();
        if !removed_ids.is_empty() {
            configs.retain(|config| !(config.provider == provider && !discovered_ids.contains(&config.model)));
            for id in &removed_ids {
                let _ = delete_secret(&model_key_name(id));
            }
            removed = (before - configs.len()) as u32;
            changed = true;
        }
    }

    for entry in models.iter() {
        let model_id = entry.model_id.trim();
        if model_id.is_empty() {
            continue;
        }

        if let Some(existing) = configs
            .iter_mut()
            .find(|config| config.provider == provider && config.model == model_id)
        {
            let next_name = entry.model_name.trim();
            if !next_name.is_empty() && existing.name != next_name {
                existing.name = next_name.to_string();
                changed = true;
            }
            if existing.has_api_key != has_provider_key {
                existing.has_api_key = has_provider_key;
                changed = true;
            }
            continue;
        }

        let config = ModelConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: entry.model_name.trim().to_string(),
            provider: provider.to_string(),
            model: model_id.to_string(),
            api_key: None,
            base_url: None,
            temperature: None,
            has_api_key: has_provider_key,
            is_default: !configs.iter().any(|config| config.is_default),
            is_active: !configs.iter().any(|config| config.is_active),
        };

        configs.push(config);
        created += 1;
        changed = true;
    }

    if !configs.is_empty() && !configs.iter().any(|config| config.is_default) {
        if let Some(first) = configs.first_mut() {
            first.is_default = true;
            changed = true;
        }
    }
    if !configs.is_empty() && !configs.iter().any(|config| config.is_active) {
        if let Some(first) = configs.first_mut() {
            first.is_active = true;
            changed = true;
        }
    }

    if changed {
        save_configs(db, &configs)?;
    }

    Ok(ProviderModelApplyResult { created, removed })
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
