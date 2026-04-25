use crate::env_api_keys::{get_default_model, get_default_provider, get_env_base_url};
use crate::pricing::default_cost_for;
use crate::types::{InputKind, Model, ModelSelection, OpenAiCompat};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct CatalogModelOption {
    pub provider_id: String,
    pub provider_name: String,
    pub model_id: String,
    pub model_name: String,
    pub is_default: bool,
}

// ── NVIDIA model autodiscovery cache ─────────────────────────────────

use std::sync::Mutex;
use std::sync::OnceLock;

static NVIDIA_MODELS_CACHE: OnceLock<Mutex<Vec<Model>>> = OnceLock::new();

fn nvidia_cache() -> &'static Mutex<Vec<Model>> {
    NVIDIA_MODELS_CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

/// Return cached NVIDIA models (empty if never refreshed).
pub fn get_nvidia_models() -> Vec<Model> {
    nvidia_cache().lock().unwrap().clone()
}

/// Fetch available models from the NVIDIA `/models` endpoint and populate
/// the static cache.  The cache can be refreshed multiple times.
pub async fn refresh_nvidia_models(api_key: Option<&str>) -> Result<(), crate::error::AppError> {
    use crate::env_api_keys::{get_env_api_key, get_env_base_url};

    let base_url = get_env_base_url("nvidia")
        .unwrap_or_else(|| "https://integrate.api.nvidia.com/v1".to_string());
    let api_key = api_key
        .map(|s| s.to_string())
        .or_else(|| get_env_api_key("nvidia"))
        .ok_or_else(|| {
            crate::error::AppError::invalid_input(
                "NVIDIA API key required to fetch models. Set NVIDIA_API_KEY.",
            )
        })?;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/models", base_url.trim_end_matches('/')))
        .bearer_auth(&api_key)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::error::AppError::health(format!(
            "NVIDIA models fetch failed: HTTP {status} - {body}"
        )));
    }

    let json: serde_json::Value = response.json().await.map_err(|err| {
        crate::error::AppError::health(format!(
            "Failed to parse NVIDIA models response: {err}"
        ))
    })?;

    let mut models = Vec::new();
    if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
        for item in data {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                let name = item
                    .get("object")
                    .and_then(|v| v.as_str())
                    .or_else(|| item.get("owned_by").and_then(|v| v.as_str()))
                    .map(|s| format!("{} ({})", id, s))
                    .unwrap_or_else(|| id.to_string());
                models.push(base_model("nvidia", id, &name, "openai-completions", true));
            }
        }
    }

    let mut cache = nvidia_cache().lock().unwrap();
    *cache = models;
    Ok(())
}

// ── OpenRouter model autodiscovery cache ─────────────────────────────

static OPENROUTER_MODELS_CACHE: OnceLock<Mutex<Vec<Model>>> = OnceLock::new();

fn openrouter_cache() -> &'static Mutex<Vec<Model>> {
    OPENROUTER_MODELS_CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

/// Return cached OpenRouter models (empty if never refreshed).
pub fn get_openrouter_models() -> Vec<Model> {
    openrouter_cache().lock().unwrap().clone()
}

/// Fetch available models from the OpenRouter `/models` endpoint.
///
/// OpenRouter returns a standard OpenAI-compatible model list.  We parse
/// each entry and infer image support from the model ID / description.
pub async fn refresh_openrouter_models(api_key: Option<&str>) -> Result<(), crate::error::AppError> {
    use crate::env_api_keys::{get_env_api_key, get_env_base_url};

    let base_url = get_env_base_url("openrouter")
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
    let api_key = api_key
        .map(|s| s.to_string())
        .or_else(|| get_env_api_key("openrouter"));

    let client = reqwest::Client::new();
    let mut request = client
        .get(format!("{}/models", base_url.trim_end_matches('/')))
        .header("HTTP-Referer", "https://github.com/unravel-ai/khadim")
        .header("X-Title", "Khadim");
    if let Some(ref key) = api_key {
        request = request.bearer_auth(key);
    }
    let response = request.send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::error::AppError::health(format!(
            "OpenRouter models fetch failed: HTTP {status} - {body}"
        )));
    }

    let json: serde_json::Value = response.json().await.map_err(|err| {
        crate::error::AppError::health(format!(
            "Failed to parse OpenRouter models response: {err}"
        ))
    })?;

    let mut models = Vec::new();
    if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
        for item in data {
            let Some(id) = item.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(id);
            let description = item
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            // Heuristic: detect vision / image support from model metadata.
            let supports_image = item
                .get("architecture")
                .and_then(|v| v.get("modality"))
                .and_then(|v| v.as_str())
                .map(|m| m.contains("image"))
                .unwrap_or_else(|| {
                    // Fallback heuristic based on model id / description.
                    let check = format!("{} {}", id, description).to_lowercase();
                    check.contains("vision")
                        || check.contains("multimodal")
                        || check.contains("gpt-4o")
                        || check.contains("claude-3")
                        || check.contains("gemini")
                        || check.contains("llava")
                        || check.contains("qwen2-vl")
                        || check.contains("pixtral")
                });

            let mut model = base_model("openrouter", id, name, "openai-completions", true);
            if supports_image {
                model.input.push(InputKind::Image);
            }
            model.context_window = item
                .get("context_length")
                .and_then(|v| v.as_u64())
                .unwrap_or(200_000);
            model.max_tokens = item
                .get("top_provider")
                .and_then(|v| v.get("max_completion_tokens"))
                .and_then(|v| v.as_u64())
                .or_else(|| item.get("max_tokens").and_then(|v| v.as_u64()))
                .unwrap_or(8_192);

            models.push(model);
        }
    }

    let mut cache = openrouter_cache().lock().unwrap();
    *cache = models;
    Ok(())
}

/// Return all builtin models merged with any cached autodiscovered models.
/// Hard-coded NVIDIA and OpenRouter models are replaced by the cached set when available.
pub fn all_models() -> Vec<Model> {
    let mut models: Vec<Model> = builtin_models()
        .into_iter()
        .filter(|m| m.provider != "nvidia" && m.provider != "openrouter")
        .collect();

    let nvidia_cached = get_nvidia_models();
    if nvidia_cached.is_empty() {
        models.extend(builtin_models().into_iter().filter(|m| m.provider == "nvidia"));
    } else {
        models.extend(nvidia_cached);
    }

    let openrouter_cached = get_openrouter_models();
    if openrouter_cached.is_empty() {
        models.extend(builtin_models().into_iter().filter(|m| m.provider == "openrouter"));
    } else {
        models.extend(openrouter_cached);
    }

    models
}

fn base_model(provider: &str, id: &str, name: &str, api: &str, is_reasoning: bool) -> Model {
    Model {
        id: id.to_string(),
        name: name.to_string(),
        api: api.to_string(),
        provider: provider.to_string(),
        base_url: get_env_base_url(provider).unwrap_or_default(),
        reasoning: is_reasoning,
        input: vec![InputKind::Text],
        context_window: 200_000,
        max_tokens: 8_192,
        headers: HashMap::new(),
        openai_compat: if api == "openai-completions" {
            Some(OpenAiCompat {
                supports_reasoning_effort: true,
                supports_store: false,
                supports_usage_in_streaming: true,
                max_tokens_field: "max_completion_tokens",
            })
        } else {
            None
        },
        cost: default_cost_for(provider, id),
    }
}

fn model_with_headers(
    provider: &str,
    id: &str,
    name: &str,
    api: &str,
    is_reasoning: bool,
    headers: HashMap<String, String>,
) -> Model {
    let mut model = base_model(provider, id, name, api, is_reasoning);
    model.headers = headers;
    model
}

fn model_with_base_url(
    provider: &str,
    id: &str,
    name: &str,
    api: &str,
    is_reasoning: bool,
    base_url: &str,
) -> Model {
    let mut model = base_model(provider, id, name, api, is_reasoning);
    model.base_url = base_url.to_string();
    model
}

fn provider_label(provider: &str) -> String {
    match provider {
        "openai" => "OpenAI",
        "openai-codex" => "OpenAI Codex",
        "anthropic" => "Anthropic",
        "github-copilot" => "GitHub Copilot",
        "groq" => "Groq",
        "xai" => "xAI",
        "openrouter" => "OpenRouter",
        "mistral" => "Mistral",
        "cerebras" => "Cerebras",
        "huggingface" => "Hugging Face",
        "opencode" => "OpenCode",
        "opencode-go" => "OpenCode Go",
        "kimi-coding" => "Kimi Coding",
        "minimax" => "MiniMax",
        "minimax-cn" => "MiniMax CN",
        "zai" => "Z.AI",
        "nvidia" => "NVIDIA",
        "azure-openai-responses" => "Azure OpenAI",
        "google" => "Google",
        "google-vertex" => "Google Vertex",
        "amazon-bedrock" => "Amazon Bedrock",
        other => other,
    }
    .to_string()
}

fn copilot_headers() -> HashMap<String, String> {
    HashMap::from([
        (
            "User-Agent".to_string(),
            "GitHubCopilotChat/0.35.0".to_string(),
        ),
        ("Editor-Version".to_string(), "vscode/1.107.0".to_string()),
        (
            "Editor-Plugin-Version".to_string(),
            "copilot-chat/0.35.0".to_string(),
        ),
        (
            "Copilot-Integration-Id".to_string(),
            "vscode-chat".to_string(),
        ),
    ])
}

pub fn builtin_models() -> Vec<Model> {
    let copilot = copilot_headers();

    vec![
        // ── OpenAI ──────────────────────────────────────────────────
        base_model(
            "openai",
            "codex-mini-latest",
            "Codex Mini",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-4", "GPT-4", "openai-responses", false),
        base_model(
            "openai",
            "gpt-4-turbo",
            "GPT-4 Turbo",
            "openai-responses",
            false,
        ),
        base_model("openai", "gpt-4.1", "GPT-4.1", "openai-responses", false),
        base_model(
            "openai",
            "gpt-4.1-mini",
            "GPT-4.1 mini",
            "openai-responses",
            false,
        ),
        base_model(
            "openai",
            "gpt-4.1-nano",
            "GPT-4.1 nano",
            "openai-responses",
            false,
        ),
        base_model("openai", "gpt-4o", "GPT-4o", "openai-responses", false),
        base_model(
            "openai",
            "gpt-4o-mini",
            "GPT-4o mini",
            "openai-responses",
            false,
        ),
        base_model("openai", "gpt-5", "GPT-5", "openai-responses", true),
        base_model(
            "openai",
            "gpt-5-chat-latest",
            "GPT-5 Chat Latest",
            "openai-responses",
            false,
        ),
        base_model(
            "openai",
            "gpt-5-codex",
            "GPT-5-Codex",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5-mini",
            "GPT-5 Mini",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5-nano",
            "GPT-5 Nano",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-5-pro", "GPT-5 Pro", "openai-responses", true),
        base_model("openai", "gpt-5.1", "GPT-5.1", "openai-responses", true),
        base_model(
            "openai",
            "gpt-5.1-chat-latest",
            "GPT-5.1 Chat",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.1-codex",
            "GPT-5.1 Codex",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.1-codex-max",
            "GPT-5.1 Codex Max",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.1-codex-mini",
            "GPT-5.1 Codex mini",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-5.2", "GPT-5.2", "openai-responses", true),
        base_model(
            "openai",
            "gpt-5.2-chat-latest",
            "GPT-5.2 Chat",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.2-codex",
            "GPT-5.2 Codex",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.2-pro",
            "GPT-5.2 Pro",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.3-codex",
            "GPT-5.3 Codex",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.3-codex-spark",
            "GPT-5.3 Codex Spark",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-5.4", "GPT-5.4", "openai-responses", true),
        base_model(
            "openai",
            "gpt-5.4-mini",
            "GPT-5.4 mini",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.4-nano",
            "GPT-5.4 nano",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.4-pro",
            "GPT-5.4 Pro",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-5.5", "GPT-5.5", "openai-responses", true),
        base_model(
            "openai",
            "gpt-5.5-mini",
            "GPT-5.5 mini",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.5-nano",
            "GPT-5.5 nano",
            "openai-responses",
            true,
        ),
        base_model(
            "openai",
            "gpt-5.5-pro",
            "GPT-5.5 Pro",
            "openai-responses",
            true,
        ),
        base_model("openai", "o1", "o1", "openai-responses", true),
        base_model("openai", "o1-pro", "o1-pro", "openai-responses", true),
        base_model("openai", "o3", "o3", "openai-responses", true),
        base_model(
            "openai",
            "o3-deep-research",
            "o3-deep-research",
            "openai-responses",
            true,
        ),
        base_model("openai", "o3-mini", "o3-mini", "openai-responses", true),
        base_model("openai", "o3-pro", "o3-pro", "openai-responses", true),
        base_model("openai", "o4-mini", "o4-mini", "openai-responses", true),
        base_model(
            "openai",
            "o4-mini-deep-research",
            "o4-mini-deep-research",
            "openai-responses",
            true,
        ),
        // ── Anthropic ───────────────────────────────────────────────
        base_model(
            "anthropic",
            "claude-3-5-haiku-20241022",
            "Claude Haiku 3.5",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-5-haiku-latest",
            "Claude Haiku 3.5 (latest)",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-5-sonnet-20240620",
            "Claude Sonnet 3.5",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-5-sonnet-20241022",
            "Claude Sonnet 3.5 v2",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-7-sonnet-20250219",
            "Claude Sonnet 3.7",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-3-7-sonnet-latest",
            "Claude Sonnet 3.7 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-3-haiku-20240307",
            "Claude Haiku 3",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-opus-20240229",
            "Claude Opus 3",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-3-sonnet-20240229",
            "Claude Sonnet 3",
            "anthropic-messages",
            false,
        ),
        base_model(
            "anthropic",
            "claude-haiku-4-5",
            "Claude Haiku 4.5 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-haiku-4-5-20251001",
            "Claude Haiku 4.5",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-0",
            "Claude Opus 4 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-1",
            "Claude Opus 4.1 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-1-20250805",
            "Claude Opus 4.1",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-20250514",
            "Claude Opus 4",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-5",
            "Claude Opus 4.5 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-5-20251101",
            "Claude Opus 4.5",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-6",
            "Claude Opus 4.6",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-opus-4-7",
            "Claude Opus 4.7 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-sonnet-4-0",
            "Claude Sonnet 4 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-sonnet-4-20250514",
            "Claude Sonnet 4",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-sonnet-4-5",
            "Claude Sonnet 4.5 (latest)",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-sonnet-4-5-20250929",
            "Claude Sonnet 4.5",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-sonnet-4-6",
            "Claude Sonnet 4.6",
            "anthropic-messages",
            true,
        ),
        // ── Groq ────────────────────────────────────────────────────
        base_model(
            "groq",
            "deepseek-r1-distill-llama-70b",
            "DeepSeek R1 Distill Llama 70B",
            "openai-completions",
            true,
        ),
        base_model(
            "groq",
            "gemma2-9b-it",
            "Gemma 2 9B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "llama-3.1-8b-instant",
            "Llama 3.1 8B Instant",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "llama-3.3-70b-versatile",
            "Llama 3.3 70B Versatile",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "llama3-70b-8192",
            "Llama 3 70B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "llama3-8b-8192",
            "Llama 3 8B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "meta-llama/llama-4-maverick-17b-128e-instruct",
            "Llama 4 Maverick 17B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "Llama 4 Scout 17B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "mistral-saba-24b",
            "Mistral Saba 24B",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "moonshotai/kimi-k2-instruct",
            "Kimi K2 Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "moonshotai/kimi-k2-instruct-0905",
            "Kimi K2 Instruct 0905",
            "openai-completions",
            false,
        ),
        base_model(
            "groq",
            "openai/gpt-oss-120b",
            "GPT OSS 120B",
            "openai-completions",
            true,
        ),
        base_model(
            "groq",
            "openai/gpt-oss-20b",
            "GPT OSS 20B",
            "openai-completions",
            true,
        ),
        base_model(
            "groq",
            "qwen-qwq-32b",
            "Qwen QwQ 32B",
            "openai-completions",
            true,
        ),
        base_model(
            "groq",
            "qwen/qwen3-32b",
            "Qwen3 32B",
            "openai-completions",
            true,
        ),
        // ── xAI ─────────────────────────────────────────────────────
        base_model("xai", "grok-2", "Grok 2", "openai-completions", false),
        base_model(
            "xai",
            "grok-2-1212",
            "Grok 2 (1212)",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-2-latest",
            "Grok 2 Latest",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-2-vision",
            "Grok 2 Vision",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-2-vision-1212",
            "Grok 2 Vision (1212)",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-2-vision-latest",
            "Grok 2 Vision Latest",
            "openai-completions",
            false,
        ),
        base_model("xai", "grok-3", "Grok 3", "openai-completions", false),
        base_model(
            "xai",
            "grok-3-fast",
            "Grok 3 Fast",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-3-fast-latest",
            "Grok 3 Fast Latest",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-3-latest",
            "Grok 3 Latest",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-3-mini",
            "Grok 3 Mini",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-3-mini-fast",
            "Grok 3 Mini Fast",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-3-mini-fast-latest",
            "Grok 3 Mini Fast Latest",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-3-mini-latest",
            "Grok 3 Mini Latest",
            "openai-completions",
            true,
        ),
        base_model("xai", "grok-4", "Grok 4", "openai-completions", true),
        base_model(
            "xai",
            "grok-4-1-fast",
            "Grok 4.1 Fast",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-4-1-fast-non-reasoning",
            "Grok 4.1 Fast (Non-Reasoning)",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-4-fast",
            "Grok 4 Fast",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-4-fast-non-reasoning",
            "Grok 4 Fast (Non-Reasoning)",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-4.20-0309-non-reasoning",
            "Grok 4.20 (Non-Reasoning)",
            "openai-completions",
            false,
        ),
        base_model(
            "xai",
            "grok-4.20-0309-reasoning",
            "Grok 4.20 (Reasoning)",
            "openai-completions",
            true,
        ),
        base_model("xai", "grok-beta", "Grok Beta", "openai-completions", false),
        base_model(
            "xai",
            "grok-code-fast-1",
            "Grok Code Fast 1",
            "openai-completions",
            true,
        ),
        base_model(
            "xai",
            "grok-vision-beta",
            "Grok Vision Beta",
            "openai-completions",
            false,
        ),
        // ── Mistral ─────────────────────────────────────────────────
        base_model(
            "mistral",
            "codestral-latest",
            "Codestral (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "devstral-2512",
            "Devstral 2",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "devstral-medium-2507",
            "Devstral Medium",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "devstral-medium-latest",
            "Devstral 2 (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "devstral-small-2505",
            "Devstral Small 2505",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "devstral-small-2507",
            "Devstral Small",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "labs-devstral-small-2512",
            "Devstral Small 2",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "magistral-medium-latest",
            "Magistral Medium (latest)",
            "mistral-conversations",
            true,
        ),
        base_model(
            "mistral",
            "magistral-small",
            "Magistral Small",
            "mistral-conversations",
            true,
        ),
        base_model(
            "mistral",
            "ministral-3b-latest",
            "Ministral 3B (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "ministral-8b-latest",
            "Ministral 8B (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-large-2411",
            "Mistral Large 2.1",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-large-2512",
            "Mistral Large 3",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-large-latest",
            "Mistral Large (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-medium-2505",
            "Mistral Medium 3",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-medium-2508",
            "Mistral Medium 3.1",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-medium-latest",
            "Mistral Medium (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-nemo",
            "Mistral Nemo",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-small-2506",
            "Mistral Small 3.2",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "mistral-small-latest",
            "Mistral Small (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "open-mistral-7b",
            "Mistral 7B",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "open-mixtral-8x22b",
            "Mixtral 8x22B",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "open-mixtral-8x7b",
            "Mixtral 8x7B",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "pixtral-12b",
            "Pixtral 12B",
            "mistral-conversations",
            false,
        ),
        base_model(
            "mistral",
            "pixtral-large-latest",
            "Pixtral Large (latest)",
            "mistral-conversations",
            false,
        ),
        // ── Cerebras ────────────────────────────────────────────────
        base_model(
            "cerebras",
            "gpt-oss-120b",
            "GPT OSS 120B",
            "openai-completions",
            true,
        ),
        base_model(
            "cerebras",
            "llama3.1-8b",
            "Llama 3.1 8B",
            "openai-completions",
            false,
        ),
        base_model(
            "cerebras",
            "qwen-3-235b-a22b-instruct-2507",
            "Qwen 3 235B Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "cerebras",
            "zai-glm-4.7",
            "Z.AI GLM-4.7",
            "openai-completions",
            false,
        ),
        // ── Hugging Face ────────────────────────────────────────────
        base_model(
            "huggingface",
            "MiniMaxAI/MiniMax-M2.1",
            "MiniMax-M2.1",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "MiniMaxAI/MiniMax-M2.5",
            "MiniMax-M2.5",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-235B-A22B-Thinking-2507",
            "Qwen3-235B-A22B-Thinking-2507",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-Coder-480B-A35B-Instruct",
            "Qwen3-Coder-480B-A35B-Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-Coder-Next",
            "Qwen3-Coder-Next",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-Next-80B-A3B-Instruct",
            "Qwen3-Next-80B-A3B-Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-Next-80B-A3B-Thinking",
            "Qwen3-Next-80B-A3B-Thinking",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3.5-397B-A17B",
            "Qwen3.5-397B-A17B",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "XiaomiMiMo/MiMo-V2-Flash",
            "MiMo-V2-Flash",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "deepseek-ai/DeepSeek-R1-0528",
            "DeepSeek-R1-0528",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "deepseek-ai/DeepSeek-V3.2",
            "DeepSeek-V3.2",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "moonshotai/Kimi-K2-Instruct",
            "Kimi-K2-Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "moonshotai/Kimi-K2-Instruct-0905",
            "Kimi-K2-Instruct-0905",
            "openai-completions",
            false,
        ),
        base_model(
            "huggingface",
            "moonshotai/Kimi-K2-Thinking",
            "Kimi-K2-Thinking",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "moonshotai/Kimi-K2.5",
            "Kimi-K2.5",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "zai-org/GLM-4.7",
            "GLM-4.7",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "zai-org/GLM-4.7-Flash",
            "GLM-4.7-Flash",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "zai-org/GLM-5",
            "GLM-5",
            "openai-completions",
            true,
        ),
        // ── OpenAI Codex ────────────────────────────────────────────
        base_model(
            "openai-codex",
            "codex-mini-latest",
            "Codex Mini",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-4.1",
            "GPT-4.1",
            "openai-codex-responses",
            false,
        ),
        base_model(
            "openai-codex",
            "gpt-4.1-mini",
            "GPT-4.1 mini",
            "openai-codex-responses",
            false,
        ),
        base_model(
            "openai-codex",
            "gpt-4o",
            "GPT-4o",
            "openai-codex-responses",
            false,
        ),
        base_model(
            "openai-codex",
            "gpt-5",
            "GPT-5",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.1",
            "GPT-5.1",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.1-codex",
            "GPT-5.1 Codex",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.2",
            "GPT-5.2",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.2-codex",
            "GPT-5.2 Codex",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.3-codex",
            "GPT-5.3 Codex",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.4",
            "GPT-5.4",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "5.5",
            "5.5",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "gpt-5.5",
            "GPT-5.5",
            "openai-codex-responses",
            true,
        ),
        base_model("openai-codex", "o3", "o3", "openai-codex-responses", true),
        base_model(
            "openai-codex",
            "o3-pro",
            "o3-pro",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "openai-codex",
            "o4-mini",
            "o4-mini",
            "openai-codex-responses",
            true,
        ),
        // ── GitHub Copilot ──────────────────────────────────────────
        model_with_headers(
            "github-copilot",
            "claude-haiku-4.5",
            "Claude Haiku 4.5",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "claude-opus-4.5",
            "Claude Opus 4.5",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "claude-opus-4.6",
            "Claude Opus 4.6",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "claude-sonnet-4",
            "Claude Sonnet 4",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "claude-sonnet-4.5",
            "Claude Sonnet 4.5",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "claude-sonnet-4.6",
            "Claude Sonnet 4.6",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gemini-2.5-pro",
            "Gemini 2.5 Pro",
            "openai-completions",
            false,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gemini-3-flash-preview",
            "Gemini 3 Flash",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gemini-3-pro-preview",
            "Gemini 3 Pro Preview",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gemini-3.1-pro-preview",
            "Gemini 3.1 Pro Preview",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-4.1",
            "GPT-4.1",
            "openai-completions",
            false,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-4o",
            "GPT-4o",
            "openai-completions",
            false,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5",
            "GPT-5",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5-mini",
            "GPT-5-mini",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.1",
            "GPT-5.1",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.1-codex",
            "GPT-5.1-Codex",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.1-codex-max",
            "GPT-5.1-Codex-max",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.1-codex-mini",
            "GPT-5.1-Codex-mini",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.2",
            "GPT-5.2",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.2-codex",
            "GPT-5.2-Codex",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.3-codex",
            "GPT-5.3-Codex",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.4",
            "GPT-5.4",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "gpt-5.4-mini",
            "GPT-5.4 mini",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        model_with_headers(
            "github-copilot",
            "grok-code-fast-1",
            "Grok Code Fast 1",
            "openai-completions",
            true,
            copilot.clone(),
        ),
        // ── OpenCode ────────────────────────────────────────────────
        model_with_base_url(
            "opencode",
            "big-pickle",
            "Big Pickle",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-3-5-haiku",
            "Claude Haiku 3.5",
            "anthropic-messages",
            false,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-haiku-4-5",
            "Claude Haiku 4.5",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-opus-4-1",
            "Claude Opus 4.1",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-opus-4-5",
            "Claude Opus 4.5",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-opus-4-6",
            "Claude Opus 4.6",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-sonnet-4",
            "Claude Sonnet 4",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-sonnet-4-5",
            "Claude Sonnet 4.5",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "claude-sonnet-4-6",
            "Claude Sonnet 4.6",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gemini-3-flash",
            "Gemini 3 Flash",
            "google-generative-ai",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gemini-3.1-pro",
            "Gemini 3.1 Pro Preview",
            "google-generative-ai",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "glm-5",
            "GLM-5",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5",
            "GPT-5",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5-codex",
            "GPT-5 Codex",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5-nano",
            "GPT-5 Nano",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.1",
            "GPT-5.1",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.1-codex",
            "GPT-5.1 Codex",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.1-codex-max",
            "GPT-5.1 Codex Max",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.1-codex-mini",
            "GPT-5.1 Codex Mini",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.2",
            "GPT-5.2",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.2-codex",
            "GPT-5.2 Codex",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.3-codex",
            "GPT-5.3 Codex",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.4",
            "GPT-5.4",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.4-mini",
            "GPT-5.4 Mini",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.4-nano",
            "GPT-5.4 Nano",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "gpt-5.4-pro",
            "GPT-5.4 Pro",
            "openai-responses",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "kimi-k2.5",
            "Kimi K2.5",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "mimo-v2-omni-free",
            "MiMo V2 Omni Free",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "mimo-v2-pro-free",
            "MiMo V2 Pro Free",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "minimax-m2.5",
            "MiniMax M2.5",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "minimax-m2.5-free",
            "MiniMax M2.5 Free",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        model_with_base_url(
            "opencode",
            "nemotron-3-super-free",
            "Nemotron 3 Super Free",
            "openai-completions",
            true,
            "https://opencode.ai/zen/v1",
        ),
        // ── OpenCode Go ─────────────────────────────────────────────
        model_with_base_url(
            "opencode-go",
            "glm-5",
            "GLM-5",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "glm-5.1",
            "GLM-5.1",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "kimi-k2.5",
            "Kimi K2.5",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "kimi-k2.6",
            "Kimi K2.6",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "mimo-v2-pro",
            "MiMo-V2-Pro",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "mimo-v2-omni",
            "MiMo-V2-Omni",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "minimax-m2.5",
            "MiniMax M2.5",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "minimax-m2.7",
            "MiniMax M2.7",
            "anthropic-messages",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "deepseek-v4",
            "DeepSeek V4",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        model_with_base_url(
            "opencode-go",
            "deepseek-v4-pro",
            "DeepSeek V4 Pro",
            "openai-completions",
            true,
            "https://opencode.ai/zen/go/v1",
        ),
        // ── Kimi Coding ─────────────────────────────────────────────
        base_model(
            "kimi-coding",
            "k2p5",
            "Kimi K2.5",
            "anthropic-messages",
            true,
        ),
        base_model(
            "kimi-coding",
            "kimi-k2-thinking",
            "Kimi K2 Thinking",
            "anthropic-messages",
            true,
        ),
        // ── MiniMax ─────────────────────────────────────────────────
        base_model(
            "minimax",
            "MiniMax-M2.7",
            "MiniMax-M2.7",
            "anthropic-messages",
            true,
        ),
        base_model(
            "minimax",
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2.7-highspeed",
            "anthropic-messages",
            true,
        ),
        // ── MiniMax CN ──────────────────────────────────────────────
        base_model(
            "minimax-cn",
            "MiniMax-M2.7",
            "MiniMax-M2.7",
            "anthropic-messages",
            true,
        ),
        base_model(
            "minimax-cn",
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2.7-highspeed",
            "anthropic-messages",
            true,
        ),
        // ── Z.AI ────────────────────────────────────────────────────
        base_model("zai", "glm-4.5", "GLM-4.5", "openai-completions", true),
        base_model(
            "zai",
            "glm-4.5-air",
            "GLM-4.5-Air",
            "openai-completions",
            true,
        ),
        base_model(
            "zai",
            "glm-4.5-flash",
            "GLM-4.5-Flash",
            "openai-completions",
            true,
        ),
        base_model("zai", "glm-4.5v", "GLM-4.5V", "openai-completions", true),
        base_model("zai", "glm-4.6", "GLM-4.6", "openai-completions", true),
        base_model("zai", "glm-4.6v", "GLM-4.6V", "openai-completions", true),
        base_model("zai", "glm-4.7", "GLM-4.7", "openai-completions", true),
        base_model(
            "zai",
            "glm-4.7-flash",
            "GLM-4.7-Flash",
            "openai-completions",
            true,
        ),
        base_model(
            "zai",
            "glm-4.7-flashx",
            "GLM-4.7-FlashX",
            "openai-completions",
            true,
        ),
        base_model("zai", "glm-5", "GLM-5", "openai-completions", true),
        base_model(
            "zai",
            "glm-5-turbo",
            "GLM-5-Turbo",
            "openai-completions",
            true,
        ),
        // ── NVIDIA ──────────────────────────────────────────────────
        base_model(
            "nvidia",
            "z-ai/glm-5.1",
            "GLM-5.1",
            "openai-completions",
            true,
        ),
        base_model("nvidia", "z-ai/glm-5", "GLM-5", "openai-completions", true),
        base_model(
            "nvidia",
            "meta/llama-3.3-70b-instruct",
            "Llama 3.3 70B Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "nvidia",
            "deepseek-ai/deepseek-r1",
            "DeepSeek-R1",
            "openai-completions",
            true,
        ),
        base_model(
            "nvidia",
            "deepseek-ai/deepseek-v4-pro",
            "DeepSeek-V4-Pro",
            "openai-completions",
            true,
        ),
        base_model(
            "nvidia",
            "nvidia/llama-3.1-nemotron-70b-instruct",
            "Llama 3.1 Nemotron 70B",
            "openai-completions",
            false,
        ),
        base_model(
            "nvidia",
            "mistralai/mistral-large-2-instruct",
            "Mistral Large 2",
            "openai-completions",
            false,
        ),
        base_model(
            "nvidia",
            "qwen/qwen2.5-72b-instruct",
            "Qwen2.5 72B Instruct",
            "openai-completions",
            false,
        ),
        base_model(
            "nvidia",
            "minimaxai/minimax-m2.7",
            "MiniMax 2.7",
            "openai-completions",
            true,
        ),
        // ── Azure OpenAI ────────────────────────────────────────────
        base_model(
            "azure-openai-responses",
            "codex-mini-latest",
            "Codex Mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4",
            "GPT-4",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4-turbo",
            "GPT-4 Turbo",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4.1",
            "GPT-4.1",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4.1-mini",
            "GPT-4.1 mini",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4.1-nano",
            "GPT-4.1 nano",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4o",
            "GPT-4o",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4o-mini",
            "GPT-4o mini",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5",
            "GPT-5",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5-chat-latest",
            "GPT-5 Chat Latest",
            "azure-openai-responses",
            false,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5-codex",
            "GPT-5-Codex",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5-mini",
            "GPT-5 Mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5-nano",
            "GPT-5 Nano",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5-pro",
            "GPT-5 Pro",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.1",
            "GPT-5.1",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.1-chat-latest",
            "GPT-5.1 Chat",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.1-codex",
            "GPT-5.1 Codex",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.1-codex-max",
            "GPT-5.1 Codex Max",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.1-codex-mini",
            "GPT-5.1 Codex mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.2",
            "GPT-5.2",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.2-chat-latest",
            "GPT-5.2 Chat",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.2-codex",
            "GPT-5.2 Codex",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.2-pro",
            "GPT-5.2 Pro",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.3-codex",
            "GPT-5.3 Codex",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.3-codex-spark",
            "GPT-5.3 Codex Spark",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.4",
            "GPT-5.4",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.4-mini",
            "GPT-5.4 mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.4-nano",
            "GPT-5.4 nano",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-5.4-pro",
            "GPT-5.4 Pro",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o1",
            "o1",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o1-pro",
            "o1-pro",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o3",
            "o3",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o3-deep-research",
            "o3-deep-research",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o3-mini",
            "o3-mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o3-pro",
            "o3-pro",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o4-mini",
            "o4-mini",
            "azure-openai-responses",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "o4-mini-deep-research",
            "o4-mini-deep-research",
            "azure-openai-responses",
            true,
        ),
        // ── Google ──────────────────────────────────────────────────
        base_model(
            "google",
            "gemini-1.5-flash",
            "Gemini 1.5 Flash",
            "google-generative-ai",
            false,
        ),
        base_model(
            "google",
            "gemini-1.5-flash-8b",
            "Gemini 1.5 Flash-8B",
            "google-generative-ai",
            false,
        ),
        base_model(
            "google",
            "gemini-1.5-pro",
            "Gemini 1.5 Pro",
            "google-generative-ai",
            false,
        ),
        base_model(
            "google",
            "gemini-2.0-flash",
            "Gemini 2.0 Flash",
            "google-generative-ai",
            false,
        ),
        base_model(
            "google",
            "gemini-2.0-flash-lite",
            "Gemini 2.0 Flash Lite",
            "google-generative-ai",
            false,
        ),
        base_model(
            "google",
            "gemini-2.5-flash",
            "Gemini 2.5 Flash",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-2.5-flash-lite",
            "Gemini 2.5 Flash Lite",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-2.5-pro",
            "Gemini 2.5 Pro",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-3-flash-preview",
            "Gemini 3 Flash Preview",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-3-pro-preview",
            "Gemini 3 Pro Preview",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-3.1-flash-lite-preview",
            "Gemini 3.1 Flash Lite Preview",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-3.1-pro-preview",
            "Gemini 3.1 Pro Preview",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-flash-latest",
            "Gemini Flash Latest",
            "google-generative-ai",
            true,
        ),
        base_model(
            "google",
            "gemini-flash-lite-latest",
            "Gemini Flash-Lite Latest",
            "google-generative-ai",
            true,
        ),
        // ── Google Vertex ───────────────────────────────────────────
        base_model(
            "google-vertex",
            "gemini-1.5-flash",
            "Gemini 1.5 Flash (Vertex)",
            "google-vertex",
            false,
        ),
        base_model(
            "google-vertex",
            "gemini-1.5-flash-8b",
            "Gemini 1.5 Flash-8B (Vertex)",
            "google-vertex",
            false,
        ),
        base_model(
            "google-vertex",
            "gemini-1.5-pro",
            "Gemini 1.5 Pro (Vertex)",
            "google-vertex",
            false,
        ),
        base_model(
            "google-vertex",
            "gemini-2.0-flash",
            "Gemini 2.0 Flash (Vertex)",
            "google-vertex",
            false,
        ),
        base_model(
            "google-vertex",
            "gemini-2.0-flash-lite",
            "Gemini 2.0 Flash Lite (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-2.5-flash",
            "Gemini 2.5 Flash (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-2.5-flash-lite",
            "Gemini 2.5 Flash Lite (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-2.5-pro",
            "Gemini 2.5 Pro (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-3-flash-preview",
            "Gemini 3 Flash Preview (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-3-pro-preview",
            "Gemini 3 Pro Preview (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "google-vertex",
            "gemini-3.1-pro-preview",
            "Gemini 3.1 Pro Preview (Vertex)",
            "google-vertex",
            true,
        ),
        // ── Amazon Bedrock ──────────────────────────────────────────
        base_model(
            "amazon-bedrock",
            "amazon.nova-2-lite-v1:0",
            "Nova 2 Lite",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "amazon.nova-lite-v1:0",
            "Nova Lite",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "amazon.nova-micro-v1:0",
            "Nova Micro",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "amazon.nova-premier-v1:0",
            "Nova Premier",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "amazon.nova-pro-v1:0",
            "Nova Pro",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-3-5-haiku-20241022-v1:0",
            "Claude Haiku 3.5",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-3-5-sonnet-20241022-v2:0",
            "Claude Sonnet 3.5 v2",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-3-7-sonnet-20250219-v1:0",
            "Claude Sonnet 3.7",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-haiku-4-5-20251001-v1:0",
            "Claude Haiku 4.5",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-opus-4-1-20250805-v1:0",
            "Claude Opus 4.1",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-opus-4-20250514-v1:0",
            "Claude Opus 4",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-opus-4-5-20251101-v1:0",
            "Claude Opus 4.5",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-opus-4-6-v1",
            "Claude Opus 4.6",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-sonnet-4-20250514-v1:0",
            "Claude Sonnet 4",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-sonnet-4-5-20250929-v1:0",
            "Claude Sonnet 4.5",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-sonnet-4-6",
            "Claude Sonnet 4.6",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "deepseek.r1-v1:0",
            "DeepSeek-R1",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "deepseek.v3-v1:0",
            "DeepSeek-V3.1",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "deepseek.v3.2",
            "DeepSeek-V3.2",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "meta.llama3-1-70b-instruct-v1:0",
            "Llama 3.1 70B Instruct",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "meta.llama3-1-8b-instruct-v1:0",
            "Llama 3.1 8B Instruct",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "meta.llama3-3-70b-instruct-v1:0",
            "Llama 3.3 70B Instruct",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "meta.llama4-maverick-17b-instruct-v1:0",
            "Llama 4 Maverick 17B Instruct",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "meta.llama4-scout-17b-instruct-v1:0",
            "Llama 4 Scout 17B Instruct",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "mistral.mistral-large-3-675b-instruct",
            "Mistral Large 3",
            "bedrock-converse-stream",
            false,
        ),
        base_model(
            "amazon-bedrock",
            "moonshotai.kimi-k2.5",
            "Kimi K2.5",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "qwen.qwen3-32b-v1:0",
            "Qwen3 32B",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "zai.glm-4.7",
            "GLM-4.7",
            "bedrock-converse-stream",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "zai.glm-5",
            "GLM-5",
            "bedrock-converse-stream",
            true,
        ),
        // ── OpenRouter ──────────────────────────────────────────────
        // OpenRouter models are fetched dynamically, but we include a
        // representative default so the provider is usable when the cache
        // has not yet been populated.
        base_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            "OpenRouter GPT-4.1 Mini",
            "openai-completions",
            false,
        ),
    ]
}

pub fn resolve_model(selection: Option<&ModelSelection>) -> Model {
    let provider = selection
        .map(|value| value.provider.clone())
        .unwrap_or_else(get_default_provider);
    let model_id = selection
        .map(|value| value.model_id.clone())
        .unwrap_or_else(|| get_default_model(&provider));

    all_models()
        .into_iter()
        .find(|model| model.provider == provider && model.id == model_id)
        .unwrap_or_else(|| {
            let api = match provider.as_str() {
                "anthropic" | "opencode" | "kimi-coding" | "minimax" | "minimax-cn" => {
                    "anthropic-messages"
                }
                "github-copilot" => "github-copilot",
                "openai" => "openai-responses",
                "openai-codex" => "openai-codex-responses",
                "mistral" => "mistral-conversations",
                "azure-openai-responses" => "azure-openai-responses",
                "google" => "google-generative-ai",
                "google-vertex" => "google-vertex",
                "amazon-bedrock" => "bedrock-converse-stream",
                _ => "openai-completions",
            };
            base_model(&provider, &model_id, &model_id, api, true)
        })
}

pub fn list_model_options() -> Vec<CatalogModelOption> {
    let default_provider = get_default_provider();
    let default_model = get_default_model(&default_provider);
    all_models()
        .into_iter()
        .map(|model| CatalogModelOption {
            provider_id: model.provider.clone(),
            provider_name: provider_label(&model.provider),
            model_id: model.id.clone(),
            model_name: model.name.clone(),
            is_default: model.provider == default_provider && model.id == default_model,
        })
        .collect()
}

/// Look up a builtin model by `(provider, model_id)`. Falls back to a
/// synthetic model populated via [`default_cost_for`] so callers that only
/// care about pricing still get sensible numbers for catalog-synced or
/// user-discovered models.
pub fn find_model(provider: &str, model_id: &str) -> Option<Model> {
    all_models()
        .into_iter()
        .find(|model| model.provider == provider && model.id == model_id)
}

/// Like [`find_model`] but always returns a `Model`, synthesizing one with
/// default pricing and a best-effort API when the id is unknown. Intended
/// for CLI/desktop cost and metadata surfaces that must not fail on
/// unrecognised ids.
pub fn find_or_synth_model(provider: &str, model_id: &str) -> Model {
    if let Some(model) = find_model(provider, model_id) {
        return model;
    }
    let api = match provider {
        "anthropic" | "opencode" | "kimi-coding" | "minimax" | "minimax-cn" => "anthropic-messages",
        "nvidia" | "github-copilot" => "github-copilot",
        "openai" => "openai-responses",
        "openai-codex" => "openai-codex-responses",
        "mistral" => "mistral-conversations",
        "azure-openai-responses" => "azure-openai-responses",
        "google" => "google-generative-ai",
        "google-vertex" => "google-vertex",
        "amazon-bedrock" => "bedrock-converse-stream",
        _ => "openai-completions",
    };
    base_model(provider, model_id, model_id, api, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_refresh_openrouter_models_without_api_key() {
        let result = refresh_openrouter_models(None).await;
        assert!(result.is_ok(), "refresh_openrouter_models failed: {:?}", result.err());
        let models = get_openrouter_models();
        println!("Fetched {} OpenRouter models (no API key)", models.len());
        assert!(
            models.len() > 100,
            "Expected >100 OpenRouter models, got {}",
            models.len()
        );
    }
}
