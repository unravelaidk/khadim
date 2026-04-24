use serde::{Deserialize, Serialize};

// ── Transcript entries ───────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TranscriptEntry {
    System {
        text: String,
    },
    User {
        text: String,
    },
    AssistantText {
        text: String,
    },
    #[allow(dead_code)]
    Thinking {
        text: String,
    },
    #[allow(dead_code)]
    ToolStart {
        tool: String,
        title: String,
    },
    ToolComplete {
        tool: String,
        content: String,
        is_error: bool,
        collapsed: bool,
    },
    Error {
        text: String,
    },
    Separator,
}
