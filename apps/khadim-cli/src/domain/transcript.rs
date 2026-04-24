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
        #[serde(skip_serializing_if = "Option::is_none", default)]
        diff_meta: Option<DiffMeta>,
    },
    Error {
        text: String,
    },
    Separator,
}

/// Metadata for rendering a diff preview of an edit tool result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffMeta {
    pub path: String,
    pub before: String,
    pub after: String,
}
