use crate::domain::transcript::TranscriptEntry;
use khadim_ai_core::types::ChatMessage;
use serde::{Deserialize, Serialize};

/// Persisted session data.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedSession {
    pub name: String,
    pub created_at_unix: u64,
    pub updated_at_unix: u64,
    pub cwd: String,
    pub messages: Vec<ChatMessage>,
    pub entries: Vec<TranscriptEntry>,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub tokens_cache_read: u64,
    pub tokens_cache_write: u64,
    pub current_mode: String,
}

/// Lightweight metadata for a saved session.
#[derive(Clone, Debug)]
pub struct SessionMeta {
    pub name: String,
    pub updated_at_unix: u64,
    pub entry_count: usize,
}
