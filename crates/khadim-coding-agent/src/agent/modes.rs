use crate::agent::types::{AgentId, AgentKind, AgentModeDefinition};

pub fn build_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Build,
        name: "build",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "Build mode. Fully autonomous. Make changes, verify, iterate until correct. Write complete code, test it, fix errors, retry. Do not stop until done.",
        temperature: 0.4,
    }
}

pub fn chat_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Chat,
        name: "chat",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "Chat mode. Answer questions and help with tasks. Full tool access.",
        temperature: 0.6,
    }
}

pub fn plan_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Plan,
        name: "plan",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "Plan mode. Analyze first, then plan. Explore the codebase, outline steps, identify risks. Only implement after presenting the plan.",
        temperature: 0.5,
    }
}

pub fn explore_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Explore,
        name: "explore",
        kind: AgentKind::Primary,
        system_prompt_addition:
            "Explore mode. Read-focused. Help the user understand the codebase. Search, read, explain. Only make changes if explicitly asked.",
        temperature: 0.6,
    }
}

// ── Subagent modes ────────────────────────────────────────────────────

pub fn sub_general_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::SubGeneral,
        name: "general",
        kind: AgentKind::Subagent,
        system_prompt_addition:
            "General subagent. Read-only. Investigate the task, return concise structured findings.",
        temperature: 0.4,
    }
}

pub fn sub_explore_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::SubExplore,
        name: "explore-sub",
        kind: AgentKind::Subagent,
        system_prompt_addition:
            "Exploration subagent. Read-only. Find relevant code and patterns quickly. Return concise summary.",
        temperature: 0.5,
    }
}

pub fn sub_review_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::SubReview,
        name: "review-sub",
        kind: AgentKind::Subagent,
        system_prompt_addition:
            "Review subagent. Read-only. Review code for bugs, security, performance, style. Return structured findings.",
        temperature: 0.3,
    }
}