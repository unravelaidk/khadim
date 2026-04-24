pub mod amazon_bedrock;
pub mod anthropic;
pub mod azure_openai_responses;
pub mod google;
pub mod google_vertex;
pub mod mistral;
pub mod openai_completions;
pub mod openai_codex_responses;
pub mod openai_responses;
pub mod request_headers;
pub mod transform_messages;
pub mod usage;

use crate::api_registry::ApiProvider;

pub fn builtin_api_providers() -> Vec<ApiProvider> {
    vec![
        ApiProvider {
            api: "openai-completions",
            complete: openai_completions::complete,
            stream: openai_completions::stream,
        },
        ApiProvider {
            api: "openai-responses",
            complete: openai_responses::complete,
            stream: openai_responses::stream,
        },
        ApiProvider {
            api: "openai-codex-responses",
            complete: openai_codex_responses::complete,
            stream: openai_codex_responses::stream,
        },
        ApiProvider {
            api: "mistral-conversations",
            complete: mistral::complete,
            stream: mistral::stream,
        },
        ApiProvider {
            api: "azure-openai-responses",
            complete: azure_openai_responses::complete,
            stream: azure_openai_responses::stream,
        },
        ApiProvider {
            api: "google-generative-ai",
            complete: google::complete,
            stream: google::stream,
        },
        ApiProvider {
            api: "google-vertex",
            complete: google_vertex::complete,
            stream: google_vertex::stream,
        },
        ApiProvider {
            api: "bedrock-converse-stream",
            complete: amazon_bedrock::complete,
            stream: amazon_bedrock::stream,
        },
        ApiProvider {
            api: "anthropic-messages",
            complete: anthropic::complete,
            stream: anthropic::stream,
        },
    ]
}
