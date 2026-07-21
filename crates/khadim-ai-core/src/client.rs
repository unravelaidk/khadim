use crate::api_registry::get_api_provider;
use crate::env_api_keys::get_env_api_key;
use crate::error::AppError;
use crate::models::resolve_model;
use crate::types::{AssistantStreamEvent, CompletionResponse, Context, Model, ModelSelection};
use async_trait::async_trait;
use std::sync::Arc;

/// Model execution boundary used by agent loops.
///
/// Production callers normally use [`ModelClient`]. Tests and alternative
/// runtimes can implement this trait to drive a real agent session without
/// registering a global provider or making a network request.
#[async_trait]
pub trait ModelExecutor: Send + Sync {
    async fn complete(
        &self,
        context: &Context,
        temperature: f32,
    ) -> Result<CompletionResponse, AppError>;

    async fn stream(
        &self,
        context: &Context,
        temperature: f32,
        on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
    ) -> Result<CompletionResponse, AppError>;
}

#[derive(Clone)]
pub struct ModelClient {
    model: Model,
    api_key: String,
}

impl ModelClient {
    pub async fn from_selection(selection: Option<ModelSelection>) -> Result<Self, AppError> {
        let mut model = resolve_model(selection.as_ref());
        let provider = model.provider.clone();

        if let Some(base_url) = selection.as_ref().and_then(|value| value.base_url.clone()) {
            if !base_url.trim().is_empty() {
                model.base_url = base_url;
            }
        }
        if let Some(display_name) = selection
            .as_ref()
            .and_then(|value| value.display_name.clone())
        {
            if !display_name.trim().is_empty() {
                model.name = display_name;
            }
        }

        let api_key = selection
            .as_ref()
            .and_then(|value| value.api_key.clone())
            .filter(|value| !value.trim().is_empty())
            .or_else(|| get_env_api_key(&provider))
            .filter(|value| !value.trim().is_empty())
            .or(match provider.as_str() {
                "openai-codex" => Some(crate::oauth::get_openai_codex_api_key().await?),
                "github-copilot" => Some(crate::oauth::get_copilot_api_key().await?),
                _ => None,
            })
            .or_else(|| {
                if provider == "ollama" && !is_ollama_cloud_endpoint(&model.base_url) {
                    Some(String::new())
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                AppError::invalid_input(format!(
                    "Missing API key for Khadim provider '{}'",
                    provider
                ))
            })?;

        Ok(Self { model, api_key })
    }

    pub fn model(&self) -> &Model {
        &self.model
    }

    pub async fn complete(
        &self,
        context: &Context,
        temperature: f32,
    ) -> Result<CompletionResponse, AppError> {
        let provider = get_api_provider(&self.model.api).ok_or_else(|| {
            AppError::invalid_input(format!(
                "No Khadim API provider registered for {}",
                self.model.api
            ))
        })?;

        (provider.complete)(&self.model, context, temperature, &self.api_key).await
    }

    pub async fn stream(
        &self,
        context: &Context,
        temperature: f32,
        on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
    ) -> Result<CompletionResponse, AppError> {
        let provider = get_api_provider(&self.model.api).ok_or_else(|| {
            AppError::invalid_input(format!(
                "No Khadim API provider registered for {}",
                self.model.api
            ))
        })?;

        (provider.stream)(&self.model, context, temperature, &self.api_key, on_event).await
    }
}

fn is_ollama_cloud_endpoint(base_url: &str) -> bool {
    url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .is_some_and(|host| host.eq_ignore_ascii_case("ollama.com"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn local_ollama_does_not_require_an_api_key() {
        let client = ModelClient::from_selection(Some(ModelSelection {
            provider: "ollama".to_string(),
            model_id: "llama3.2".to_string(),
            display_name: None,
            api_key: None,
            base_url: Some("http://localhost:11434/v1".to_string()),
        }))
        .await
        .expect("local Ollama should initialize without an API key");

        assert_eq!(client.model().base_url, "http://localhost:11434/v1");
    }

    #[tokio::test]
    async fn ollama_defaults_to_the_keyless_local_daemon() {
        let client = ModelClient::from_selection(Some(ModelSelection {
            provider: "ollama".to_string(),
            model_id: "glm-5.2:cloud".to_string(),
            display_name: None,
            api_key: None,
            base_url: None,
        }))
        .await
        .expect("Ollama cloud models should run through the signed-in local daemon");

        assert_eq!(client.model().base_url, "http://localhost:11434/v1");
    }

    #[test]
    fn only_the_ollama_cloud_host_is_treated_as_cloud() {
        assert!(is_ollama_cloud_endpoint("https://ollama.com/v1"));
        assert!(!is_ollama_cloud_endpoint("http://localhost:11434/v1"));
        assert!(!is_ollama_cloud_endpoint("https://ollama.example.com/v1"));
    }
}

#[async_trait]
impl ModelExecutor for ModelClient {
    async fn complete(
        &self,
        context: &Context,
        temperature: f32,
    ) -> Result<CompletionResponse, AppError> {
        ModelClient::complete(self, context, temperature).await
    }

    async fn stream(
        &self,
        context: &Context,
        temperature: f32,
        on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
    ) -> Result<CompletionResponse, AppError> {
        ModelClient::stream(self, context, temperature, on_event).await
    }
}
