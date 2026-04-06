use crate::khadim_agent::types::AgentModeDefinition;

pub fn build_system_prompt(
    cwd: &str,
    mode: &AgentModeDefinition,
    tool_snippets: &[String],
    skills_section: &str,
) -> String {
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let tools = if tool_snippets.is_empty() {
        "(none)".to_string()
    } else {
        tool_snippets.join("\n")
    };

    let mut prompt = format!(
        "You are Khadim, a native coding agent for the Khadim desktop app.\n\nAgent mode: {}\n{}\n\nAvailable tools:\n{}\n\nGuidelines:\n- Be concise and action-oriented\n- Prefer using the available tools over guessing\n- Keep changes minimal and correct\n- Show clear file paths in your work\n\nCurrent date: {}\nCurrent working directory: {}",
        mode.name, mode.system_prompt_addition, tools, date, cwd
    );

    if !skills_section.is_empty() {
        prompt.push_str(skills_section);
    }

    prompt
}
