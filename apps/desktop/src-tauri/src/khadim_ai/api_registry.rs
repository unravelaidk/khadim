use crate::error::AppError;
use crate::khadim_ai::types::{AssistantStreamEvent, CompletionResponse, Context, Model};
use futures_util::future::BoxFuture;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;

pub type CompleteFn =
    fn(&Model, &Context, f32, &str) -> BoxFuture<'static, Result<CompletionResponse, AppError>>;
pub type StreamFn = fn(
    &Model,
    &Context,
    f32,
    &str,
    Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
) -> BoxFuture<'static, Result<CompletionResponse, AppError>>;

#[derive(Clone, Copy)]
pub struct ApiProvider {
    pub api: &'static str,
    pub complete: CompleteFn,
    pub stream: StreamFn,
}

static API_PROVIDER_REGISTRY: OnceLock<HashMap<&'static str, ApiProvider>> = OnceLock::new();

fn registry() -> &'static HashMap<&'static str, ApiProvider> {
    API_PROVIDER_REGISTRY.get_or_init(|| {
        crate::khadim_ai::providers::builtin_api_providers()
            .into_iter()
            .map(|provider| (provider.api, provider))
            .collect()
    })
}

pub fn get_api_provider(api: &str) -> Option<ApiProvider> {
    registry().get(api).copied()
}
