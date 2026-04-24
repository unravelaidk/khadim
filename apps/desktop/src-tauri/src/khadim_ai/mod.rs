//! Desktop AI module — thin re-export of the shared `khadim-ai-core` crate
//! plus desktop-specific model_settings.

// Re-export only the sub-modules that are actually used via `crate::khadim_ai::*`
pub use khadim_ai_core::env_api_keys;
pub use khadim_ai_core::models;
pub use khadim_ai_core::oauth;
pub use khadim_ai_core::providers;
pub use khadim_ai_core::types;

pub use khadim_ai_core::ModelClient;

/// Desktop-specific model configuration management (DB-backed).
pub mod model_settings;
