use crate::error::AppError;
use crate::env_api_keys::is_authenticated_placeholder;
use crate::providers::google;
use crate::types::{AssistantStreamEvent, CompletionResponse, Context, Model};
use futures_util::future::BoxFuture;
use std::sync::Arc;

fn vertex_model(model: &Model) -> Model {
    let mut next = model.clone();
    let project = std::env::var("GOOGLE_CLOUD_PROJECT").or_else(|_| std::env::var("GCLOUD_PROJECT")).unwrap_or_default();
    let location = std::env::var("GOOGLE_CLOUD_LOCATION").unwrap_or_else(|_| "us-central1".to_string());
    if !project.is_empty() {
        next.base_url = format!("https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google");
    }
    next
}

pub fn complete(model: &Model, context: &Context, temperature: f32, api_key: &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    if api_key.is_empty() {
        return Box::pin(async { Err(AppError::invalid_input("Google Vertex requires GOOGLE_CLOUD_API_KEY, or ADC credentials plus GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION")) });
    }
    if is_authenticated_placeholder(api_key) {
        return Box::pin(async {
            Err(AppError::invalid_input(
                "Google Vertex ADC credentials were detected, but Khadim's native provider cannot execute that auth path in this build environment",
            ))
        });
    }
    google::complete(&vertex_model(model), context, temperature, api_key)
}

pub fn stream(model: &Model, context: &Context, temperature: f32, api_key: &str, on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>) -> BoxFuture<'static, Result<CompletionResponse, AppError>> {
    if api_key.is_empty() {
        return Box::pin(async { Err(AppError::invalid_input("Google Vertex requires GOOGLE_CLOUD_API_KEY, or ADC credentials plus GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION")) });
    }
    if is_authenticated_placeholder(api_key) {
        return Box::pin(async {
            Err(AppError::invalid_input(
                "Google Vertex ADC credentials were detected, but Khadim's native provider cannot execute that auth path in this build environment",
            ))
        });
    }
    google::stream(&vertex_model(model), context, temperature, api_key, on_event)
}
