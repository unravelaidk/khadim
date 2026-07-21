use crate::domain::settings::StoredSettings;
use khadim_ai_core::error::AppError;
use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProvider {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub requires_api_key: bool,
    #[serde(skip)]
    pub env: Option<&'static str>,
}

pub const SEARCH_PROVIDERS: &[SearchProvider] = &[
    SearchProvider {
        id: "duckduckgo",
        name: "DuckDuckGo",
        description: "No-key public web search",
        requires_api_key: false,
        env: None,
    },
    SearchProvider {
        id: "parallel",
        name: "Parallel",
        description: "AI-native source-grounded search",
        requires_api_key: true,
        env: Some("PARALLEL_API_KEY"),
    },
    SearchProvider {
        id: "exa",
        name: "Exa",
        description: "Semantic research and code search",
        requires_api_key: true,
        env: Some("EXA_API_KEY"),
    },
    SearchProvider {
        id: "tavily",
        name: "Tavily",
        description: "Agent-focused extracted web search",
        requires_api_key: true,
        env: Some("TAVILY_API_KEY"),
    },
    SearchProvider {
        id: "perplexity",
        name: "Perplexity",
        description: "Ranked Perplexity web search",
        requires_api_key: true,
        env: Some("PERPLEXITY_API_KEY"),
    },
    SearchProvider {
        id: "brave",
        name: "Brave",
        description: "Independent web index",
        requires_api_key: true,
        env: Some("BRAVE_SEARCH_API_KEY"),
    },
];

pub fn provider(id: &str) -> Result<&'static SearchProvider, AppError> {
    SEARCH_PROVIDERS
        .iter()
        .find(|provider| provider.id == id)
        .ok_or_else(|| AppError::invalid_input(format!("Unknown search provider '{id}'")))
}

pub fn active_provider(settings: &StoredSettings) -> &'static SearchProvider {
    settings
        .search_provider
        .as_deref()
        .and_then(|id| SEARCH_PROVIDERS.iter().find(|provider| provider.id == id))
        .unwrap_or(&SEARCH_PROVIDERS[0])
}

pub fn has_credential(settings: &StoredSettings, provider: &SearchProvider) -> bool {
    if !provider.requires_api_key {
        return true;
    }
    settings
        .search_api_keys
        .get(provider.id)
        .is_some_and(|value| !value.trim().is_empty())
        || provider
            .env
            .and_then(|name| std::env::var(name).ok())
            .is_some_and(|value| !value.trim().is_empty())
}

pub fn configure_run_environment(
    explicit_provider: Option<&str>,
    settings: &StoredSettings,
) -> Result<(), AppError> {
    let selected = match explicit_provider {
        Some(id) => provider(id)?,
        None => active_provider(settings),
    };
    std::env::set_var("KHADIM_SEARCH_PROVIDER", selected.id);
    if let (Some(env_name), Some(value)) = (
        selected.env,
        settings
            .search_api_keys
            .get(selected.id)
            .filter(|value| !value.trim().is_empty()),
    ) {
        std::env::set_var(env_name, value);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_duckduckgo_and_recognizes_stored_credentials() {
        let mut settings = StoredSettings::default();
        assert_eq!(active_provider(&settings).id, "duckduckgo");
        let exa = provider("exa").expect("exa provider");
        settings.search_api_keys.insert("exa".into(), "key".into());
        assert!(has_credential(&settings, exa));
    }
}
