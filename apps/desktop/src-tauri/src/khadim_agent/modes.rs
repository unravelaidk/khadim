use crate::khadim_agent::types::{AgentId, AgentKind, AgentModeDefinition};

pub fn build_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Build,
        name: "build",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "You are in build mode. Make code changes directly, verify them, and keep the implementation minimal.",
        temperature: 0.4,
    }
}

pub fn chat_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Chat,
        name: "chat",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "You are in chat mode. You have full tool access to read, write, list, and run commands within the working directory shown below. The user has configured this directory as your sandbox — you can freely browse and modify files inside it. If the working directory is a temporary folder, let the user know they can set a permanent chat directory in Settings so you can access their real files.",
        temperature: 0.6,
    }
}
