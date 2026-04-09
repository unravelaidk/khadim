use crate::khadim_agent::session::ExecutionTarget;
use crate::khadim_agent::types::AgentModeDefinition;

pub fn build_system_prompt(
    cwd: &str,
    source_cwd: &str,
    execution_target: ExecutionTarget,
    mode: &AgentModeDefinition,
    tool_snippets: &[String],
) -> String {
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let tools = if tool_snippets.is_empty() {
        "(none)".to_string()
    } else {
        tool_snippets.join("\n")
    };

    let execution_guidance = if execution_target == ExecutionTarget::Sandbox {
        format!(
            "You are running in persistent sandbox mode. All reads, writes, and commands operate inside the sandbox working directory shown below. The sandbox was seeded from the original workspace at: {source_cwd}. Sandbox contents persist across session close and reopen. If the user asks for files produced in the sandbox, use the export_to_workspace tool to copy them back into the original workspace. Sandbox command execution is restricted to direct approved executables and workspace-local scripts; do not rely on shell operators like pipes or redirects."
        )
    } else {
        format!(
            "You are running in direct mode. Tool operations act on the original workspace at: {source_cwd}."
        )
    };

    format!(
        "You are Khadim, a native coding agent for the Khadim desktop app.\n\n\
         Agent mode: {}\n{}\n\n\
         Execution mode: {}\n{}\n\n\
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
         Original workspace directory: {}\n\
         Current working directory: {}",
        mode.name,
        mode.system_prompt_addition,
        execution_target.as_str(),
        execution_guidance,
        tools,
        date,
        source_cwd,
        cwd
    )
}
