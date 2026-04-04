#[derive(Debug, Clone, Copy)]
pub enum AgentId {
    Build,
    Plan,
    Chat,
    General,
    Explore,
    Review,
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
