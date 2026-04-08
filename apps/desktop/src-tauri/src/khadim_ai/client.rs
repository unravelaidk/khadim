use crate::error::AppError;
use crate::khadim_ai::api_registry::get_api_provider;
use crate::khadim_ai::env_api_keys::get_env_api_key;
use crate::khadim_ai::models::resolve_model;
use crate::khadim_ai::types::{
    AssistantStreamEvent, CompletionResponse, Context, Model, ModelSelection,
};
use std::sync::Arc;

pub struct ModelClient {
    model: Model,
    api_key: String,
}

impl ModelClient {
    pub async fn from_selection(selection: Option<ModelSelection>) -> Result<Self, AppError> {
        let mut model = resolve_model(selection.as_ref());
        let provider = model.provider.clone();

        let api_key = selection
            .as_ref()
            .and_then(|value| value.api_key.clone())
            .filter(|value| !value.trim().is_empty())
            .or_else(|| get_env_api_key(&provider))
            .filter(|value| !value.trim().is_empty())
            .or(if provider == "openai-codex" {
                Some(crate::khadim_ai::oauth::get_openai_codex_api_key().await?)
            } else {
                None
            })
            .ok_or_else(|| {
            AppError::invalid_input(format!(
                "Missing API key for Khadim provider '{}'",
                provider
            ))
        })?;

        if let Some(base_url) = selection.as_ref().and_then(|value| value.base_url.clone()) {
            if !base_url.trim().is_empty() {
                model.base_url = base_url;
            }
        }
        if let Some(display_name) = selection.as_ref().and_then(|value| value.display_name.clone()) {
            if !display_name.trim().is_empty() {
                model.name = display_name;
            }
        }

        Ok(Self {
            model,
            api_key,
        })
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
            AppError::invalid_input(format!("No Khadim API provider registered for {}", self.model.api))
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
            AppError::invalid_input(format!("No Khadim API provider registered for {}", self.model.api))
        })?;

        (provider.stream)(&self.model, context, temperature, &self.api_key, on_event).await
    }
}
