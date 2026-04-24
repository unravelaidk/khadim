#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AgentId {
    Build,
    Chat,
    Plan,
    Explore,
    // Subagents
    SubGeneral,
    SubExplore,
    SubReview,
}

#[derive(Debug, Clone, Copy)]
pub enum AgentKind {
    Primary,
    Subagent,
}

#[derive(Debug, Clone)]
pub struct AgentModeDefinition {
    pub id: AgentId,
    pub name: &'static str,
    pub kind: AgentKind,
    pub system_prompt_addition: &'static str,
    pub temperature: f32,
}

impl AgentModeDefinition {
    /// Whether this agent mode has write access to tools.
    /// Subagents are read-only — they can read, search, and list files
    /// but cannot write, edit, or execute arbitrary commands.
    pub fn is_read_only(&self) -> bool {
        matches!(self.kind, AgentKind::Subagent)
    }
}