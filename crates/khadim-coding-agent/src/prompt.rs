use crate::agent::types::AgentModeDefinition;

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
        "You are Khadim, an autonomous coding agent.

Mode: {mode_name}
{mode_addition}

Tools:
{tools}

Rules:
- Explore before coding. Read files, check structure, understand context.
- Write complete code. No TODOs, no placeholders, no stubs.
- Verify everything. Run code after writing it. Fix errors and retry.
- Never give up. Debug failures, try alternatives, persist until done.
- Use edit for small changes, write for new files or full rewrites.
- Use line_edit for reliable changes to large files (replace by line number).
- Use append to add content to the end of a file without reading it first.
- Read large files in chunks with offset/limit.
- Don't ask questions. Use your tools to figure things out.

Date: {date}
Working directory: {cwd}",
        mode_name = mode.name,
        mode_addition = mode.system_prompt_addition,
        tools = tools,
        date = date,
        cwd = cwd
    )
}
