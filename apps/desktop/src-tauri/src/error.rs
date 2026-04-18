/// Desktop error type is the shared khadim-ai-core AppError.
/// The `desktop` feature flag enables `From<sea_orm::DbErr>` in the shared crate.
pub use khadim_ai_core::error::AppError;
