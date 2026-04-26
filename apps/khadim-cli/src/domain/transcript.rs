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
        /// True while the tool is still executing. The same entry shimmers
        /// in place and then transitions to its final state on completion,
        /// so the tool name appears exactly once in the transcript.
        #[serde(default)]
        running: bool,
        /// Orchestrator-assigned id for this tool call. Used to dedupe the
        /// two `step_start` events (Preparing/Running) the agent emits per
        /// call so they share a single transcript entry.
        #[serde(default)]
        step_id: String,
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
