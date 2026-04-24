// ── Slash command definitions ───────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SlashCommand {
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
}

pub fn all_slash_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand {
            name: "/help",
            description: "Show all commands & shortcuts",
            icon: "❓",
        },
        SlashCommand {
            name: "/sessions",
            description: "List saved sessions",
            icon: "📁",
        },
        SlashCommand {
            name: "/session",
            description: "Switch to a session",
            icon: "🗂",
        },
        SlashCommand {
            name: "/new",
            description: "Start a new session",
            icon: "📄",
        },
        SlashCommand {
            name: "/save",
            description: "Save current session",
            icon: "💾",
        },
        SlashCommand {
            name: "/delete",
            description: "Delete a saved session",
            icon: "🗑",
        },
        SlashCommand {
            name: "/rename",
            description: "Rename a saved session",
            icon: "✏",
        },
        SlashCommand {
            name: "/theme",
            description: "Switch theme",
            icon: "🎨",
        },
        SlashCommand {
            name: "/provider",
            description: "Switch AI provider",
            icon: "🔌",
        },
        SlashCommand {
            name: "/model",
            description: "Switch model",
            icon: "🧠",
        },
        SlashCommand {
            name: "/login",
            description: "OAuth login (Copilot, Codex)",
            icon: "🔑",
        },
        SlashCommand {
            name: "/settings",
            description: "Open settings panel (F2)",
            icon: "⚙",
        },
        SlashCommand {
            name: "/providers",
            description: "List providers & auth status",
            icon: "📋",
        },
        SlashCommand {
            name: "/reset",
            description: "Reset session",
            icon: "↻",
        },
        SlashCommand {
            name: "/clear",
            description: "Clear screen",
            icon: "🧹",
        },
        SlashCommand {
            name: "/copy",
            description: "Copy last assistant response to clipboard",
            icon: "📋",
        },
        SlashCommand {
            name: "/export",
            description: "Export conversation to markdown",
            icon: "📤",
        },
        SlashCommand {
            name: "/file",
            description: "Read a file into the input",
            icon: "📄",
        },
        SlashCommand {
            name: "/system",
            description: "Set a custom system prompt",
            icon: "📝",
        },
        SlashCommand {
            name: "/history",
            description: "Show input history",
            icon: "📜",
        },
        SlashCommand {
            name: "/clear-history",
            description: "Clear input history",
            icon: "🧹",
        },
        SlashCommand {
            name: "/tokens",
            description: "Show token usage breakdown",
            icon: "📊",
        },
        SlashCommand {
            name: "/config",
            description: "Show config directory path",
            icon: "📁",
        },
        SlashCommand {
            name: "/version",
            description: "Show version info",
            icon: "ℹ",
        },
        SlashCommand {
            name: "/exit",
            description: "Quit khadim",
            icon: "🚪",
        },
    ]
}

pub fn filter_slash_commands(input: &str) -> Vec<SlashCommand> {
    if !input.starts_with('/') {
        return vec![];
    }
    let query = input.to_lowercase();
    all_slash_commands()
        .into_iter()
        .filter(|cmd| cmd.name.starts_with(&query))
        .collect()
}

// ── Command picker state ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandPickerKind {
    Provider,
    Model,
    Theme,
    Session,
}

#[derive(Debug, Clone)]
pub struct CommandPickerState {
    pub kind: CommandPickerKind,
    pub items: Vec<(String, String, String)>, // (id, name, status)
    pub selected_index: usize,
    pub current_index: usize, // currently active item
}
