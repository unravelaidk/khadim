use crate::khadim_ai::env_api_keys::{get_default_model, get_default_provider, get_env_base_url};
use crate::khadim_ai::types::{InputKind, Model, ModelSelection, OpenAiCompat};
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
        "azure-openai-responses" => "Azure OpenAI",
        "google" => "Google",
        "google-vertex" => "Google Vertex",
        "amazon-bedrock" => "Amazon Bedrock",
        other => other,
    }
    .to_string()
}

pub fn builtin_models() -> Vec<Model> {
    vec![
        base_model(
            "openai",
            "gpt-4.1-mini",
            "GPT-4.1 Mini",
            "openai-responses",
            true,
        ),
        base_model("openai", "gpt-4.1", "GPT-4.1", "openai-responses", true),
        base_model(
            "openai-codex",
            "gpt-5.1-codex-mini",
            "GPT-5.1 Codex Mini",
            "openai-codex-responses",
            true,
        ),
        base_model(
            "anthropic",
            "claude-3-7-sonnet-latest",
            "Claude 3.7 Sonnet",
            "anthropic-messages",
            true,
        ),
        base_model(
            "anthropic",
            "claude-3-5-sonnet-latest",
            "Claude 3.5 Sonnet",
            "anthropic-messages",
            true,
        ),
        base_model(
            "groq",
            "llama-3.3-70b-versatile",
            "Llama 3.3 70B",
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
            "openrouter",
            "openai/gpt-4.1-mini",
            "OpenRouter GPT-4.1 Mini",
            "openai-completions",
            true,
        ),
        base_model(
            "mistral",
            "codestral-latest",
            "Codestral (latest)",
            "mistral-conversations",
            false,
        ),
        base_model(
            "cerebras",
            "gpt-oss-120b",
            "GPT OSS 120B",
            "openai-completions",
            true,
        ),
        base_model(
            "huggingface",
            "Qwen/Qwen3-Coder-Next",
            "Qwen3 Coder Next",
            "openai-completions",
            false,
        ),
        base_model(
            "opencode-go",
            "kimi-k2.5",
            "Kimi K2.5",
            "openai-completions",
            true,
        ),
        base_model("zai", "glm-4.7", "GLM-4.7", "openai-completions", true),
        model_with_headers(
            "github-copilot",
            "claude-sonnet-4.5",
            "Claude Sonnet 4.5",
            "anthropic-messages",
            true,
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
            ]),
        ),
        base_model(
            "opencode",
            "claude-sonnet-4",
            "Claude Sonnet 4",
            "anthropic-messages",
            true,
        ),
        base_model(
            "kimi-coding",
            "k2p5",
            "Kimi K2.5",
            "anthropic-messages",
            true,
        ),
        base_model(
            "minimax",
            "MiniMax-M2.7",
            "MiniMax M2.7",
            "anthropic-messages",
            true,
        ),
        base_model(
            "minimax-cn",
            "MiniMax-M2.7",
            "MiniMax M2.7",
            "anthropic-messages",
            true,
        ),
        base_model(
            "azure-openai-responses",
            "gpt-4.1-mini",
            "Azure GPT-4.1 Mini",
            "azure-openai-responses",
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
            "google-vertex",
            "gemini-2.5-pro",
            "Gemini 2.5 Pro (Vertex)",
            "google-vertex",
            true,
        ),
        base_model(
            "amazon-bedrock",
            "anthropic.claude-3-7-sonnet-20250219-v1:0",
            "Bedrock Claude 3.7 Sonnet",
            "bedrock-converse-stream",
            true,
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

    builtin_models()
        .into_iter()
        .find(|model| model.provider == provider && model.id == model_id)
        .unwrap_or_else(|| {
            let api = match provider.as_str() {
                "anthropic" | "github-copilot" | "opencode" | "kimi-coding" | "minimax"
                | "minimax-cn" => "anthropic-messages",
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
    builtin_models()
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
