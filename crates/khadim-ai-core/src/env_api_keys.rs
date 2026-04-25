fn has_vertex_adc_credentials() -> bool {
    if let Ok(path) = std::env::var("GOOGLE_APPLICATION_CREDENTIALS") {
        return std::path::Path::new(&path).exists();
    }

    if let Some(home) = dirs::home_dir() {
        let adc = home
            .join(".config")
            .join("gcloud")
            .join("application_default_credentials.json");
        return adc.exists();
    }

    false
}

fn has_vertex_project_and_location() -> bool {
    let has_project =
        std::env::var("GOOGLE_CLOUD_PROJECT").is_ok() || std::env::var("GCLOUD_PROJECT").is_ok();
    let has_location = std::env::var("GOOGLE_CLOUD_LOCATION").is_ok();
    has_project && has_location
}

fn has_bedrock_credentials() -> bool {
    std::env::var("AWS_PROFILE").is_ok()
        || (std::env::var("AWS_ACCESS_KEY_ID").is_ok()
            && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok())
        || std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok()
        || std::env::var("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI").is_ok()
        || std::env::var("AWS_CONTAINER_CREDENTIALS_FULL_URI").is_ok()
        || std::env::var("AWS_WEB_IDENTITY_TOKEN_FILE").is_ok()
}

fn get_openai_codex_env_key() -> Option<String> {
    std::env::var("OPENAI_CODEX_TOKEN")
        .ok()
        .or_else(|| std::env::var("OPENAI_CODEX_API_KEY").ok())
        .or_else(|| std::env::var("CHATGPT_TOKEN").ok())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok())
}

pub fn get_env_api_key(provider: &str) -> Option<String> {
    match provider {
        "openai" => std::env::var("OPENAI_API_KEY")
            .ok()
            .or_else(|| std::env::var("KHADIM_API_KEY").ok()),
        "anthropic" => std::env::var("ANTHROPIC_OAUTH_TOKEN")
            .ok()
            .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
            .or_else(|| std::env::var("KHADIM_API_KEY").ok()),
        "openai-codex" => get_openai_codex_env_key(),
        "github-copilot" => std::env::var("COPILOT_GITHUB_TOKEN")
            .ok()
            .or_else(|| std::env::var("GH_TOKEN").ok())
            .or_else(|| std::env::var("GITHUB_TOKEN").ok()),
        "groq" => std::env::var("GROQ_API_KEY").ok(),
        "xai" => std::env::var("XAI_API_KEY").ok(),
        "openrouter" => std::env::var("OPENROUTER_API_KEY").ok(),
        "mistral" => std::env::var("MISTRAL_API_KEY").ok(),
        "azure-openai-responses" => std::env::var("AZURE_OPENAI_API_KEY").ok(),
        "google" => std::env::var("GEMINI_API_KEY").ok(),
        "google-vertex" => {
            if let Ok(api_key) = std::env::var("GOOGLE_CLOUD_API_KEY") {
                Some(api_key)
            } else if has_vertex_adc_credentials() && has_vertex_project_and_location() {
                Some("<authenticated>".to_string())
            } else {
                None
            }
        }
        "amazon-bedrock" => {
            if let Ok(token) = std::env::var("AWS_BEARER_TOKEN_BEDROCK") {
                Some(token)
            } else if has_bedrock_credentials() {
                Some("<authenticated>".to_string())
            } else {
                std::env::var("KHADIM_API_KEY").ok()
            }
        }
        "cerebras" => std::env::var("CEREBRAS_API_KEY").ok(),
        "huggingface" => std::env::var("HF_TOKEN").ok(),
        "opencode" => std::env::var("OPENCODE_API_KEY").ok(),
        "opencode-go" => std::env::var("OPENCODE_API_KEY").ok(),
        "kimi-coding" => std::env::var("KIMI_API_KEY").ok(),
        "minimax" => std::env::var("MINIMAX_API_KEY").ok(),
        "minimax-cn" => std::env::var("MINIMAX_CN_API_KEY").ok(),
        "zai" => std::env::var("ZAI_API_KEY").ok(),
        "nvidia" => std::env::var("NVIDIA_API_KEY").ok(),
        _ => None,
    }
}

pub fn is_authenticated_placeholder(value: &str) -> bool {
    value == "<authenticated>"
}

pub fn get_env_base_url(provider: &str) -> Option<String> {
    match provider {
        "openai" => std::env::var("OPENAI_BASE_URL")
            .ok()
            .or_else(|| std::env::var("KHADIM_BASE_URL").ok())
            .or_else(|| Some("https://api.openai.com/v1".to_string())),
        "anthropic" => std::env::var("ANTHROPIC_BASE_URL")
            .ok()
            .or_else(|| Some("https://api.anthropic.com/v1".to_string())),
        "openai-codex" => Some("https://chatgpt.com/backend-api/codex".to_string()),
        "github-copilot" => Some("https://api.individual.githubcopilot.com".to_string()),
        "groq" => Some("https://api.groq.com/openai/v1".to_string()),
        "xai" => Some("https://api.x.ai/v1".to_string()),
        "openrouter" => Some("https://openrouter.ai/api/v1".to_string()),
        "mistral" => Some("https://api.mistral.ai/v1".to_string()),
        "azure-openai-responses" => std::env::var("AZURE_OPENAI_BASE_URL").ok(),
        "google" => Some("https://generativelanguage.googleapis.com/v1beta".to_string()),
        "google-vertex" => std::env::var("GOOGLE_VERTEX_BASE_URL").ok(),
        "amazon-bedrock" => Some("https://bedrock-runtime.us-east-1.amazonaws.com".to_string()),
        "cerebras" => Some("https://api.cerebras.ai/v1".to_string()),
        "huggingface" => Some("https://router.huggingface.co/v1".to_string()),
        "opencode" => Some("https://opencode.ai/zen/v1".to_string()),
        "opencode-go" => Some("https://opencode.ai/zen/go/v1".to_string()),
        "kimi-coding" => Some("https://api.kimi.com/coding".to_string()),
        "minimax" => Some("https://api.minimax.io/anthropic".to_string()),
        "minimax-cn" => Some("https://api.minimaxi.com/anthropic".to_string()),
        "zai" => Some("https://api.z.ai/api/coding/paas/v4".to_string()),
        "nvidia" => Some("https://integrate.api.nvidia.com/v1".to_string()),
        _ => None,
    }
}

pub fn get_default_provider() -> String {
    std::env::var("KHADIM_PROVIDER").unwrap_or_else(|_| "openai".to_string())
}

pub fn get_default_model(provider: &str) -> String {
    std::env::var("KHADIM_MODEL").unwrap_or_else(|_| match provider {
        "anthropic" => "claude-3-7-sonnet-latest".to_string(),
        "openai-codex" => "gpt-5.5".to_string(),
        "github-copilot" => "claude-sonnet-4.5".to_string(),
        "groq" => "llama-3.3-70b-versatile".to_string(),
        "xai" => "grok-3-mini".to_string(),
        "openrouter" => "openai/gpt-4.1-mini".to_string(),
        "mistral" => "codestral-latest".to_string(),
        "azure-openai-responses" => "gpt-4.1-mini".to_string(),
        "google" => "gemini-2.5-pro".to_string(),
        "google-vertex" => "gemini-2.5-pro".to_string(),
        "amazon-bedrock" => "anthropic.claude-3-7-sonnet-20250219-v1:0".to_string(),
        "cerebras" => "gpt-oss-120b".to_string(),
        "huggingface" => "Qwen/Qwen3-Coder-Next".to_string(),
        "opencode" => "claude-sonnet-4".to_string(),
        "opencode-go" => "kimi-k2.5".to_string(),
        "kimi-coding" => "k2p5".to_string(),
        "minimax" => "MiniMax-M2.7".to_string(),
        "minimax-cn" => "MiniMax-M2.7".to_string(),
        "zai" => "glm-4.7".to_string(),
        "nvidia" => "z-ai/glm-5.1".to_string(),
        _ => "gpt-4.1-mini".to_string(),
    })
}
