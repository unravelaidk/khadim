use crate::khadim_agent::types::AgentModeDefinition;

pub fn build_system_prompt(
    cwd: &str,
    mode: &AgentModeDefinition,
    tool_snippets: &[String],
) -> String {
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let tools = if tool_snippets.is_empty() {
        "(none)".to_string()
    } else {
        tool_snippets.join("\n")
    };

    format!(
        "You are Khadim, a native coding agent for the Khadim desktop app.\n\n\
         Agent mode: {}\n{}\n\n\
         Available tools:\n{}\n\n\
         Guidelines:\n\
         - Be concise and action-oriented\n\
         - Prefer using the available tools over guessing\n\
         - Keep changes minimal and correct\n\
         - Show clear file paths in your work\n\
         - If you need clarification or a decision from the user, use the question tool instead of asking in plain assistant text\n\
         - After the user answers a question tool prompt, either continue the task or call the question tool again for follow-up clarification; do not restate the same prompt in normal assistant text\n\
         - CRITICAL for write tool: 'path' MUST be the FIRST key in the JSON arguments, BEFORE 'content'. \
           Always include subdirectories in the path (e.g. \"myapp/src/index.html\", NOT just \"index.html\"). \
           The path is relative to the current working directory shown below.\n\n\
         Current date: {}\n\
         Current working directory: {}",
        mode.name, mode.system_prompt_addition, tools, date, cwd
    )
}
