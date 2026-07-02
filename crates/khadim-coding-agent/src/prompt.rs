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
        "You are Khadim, a local-first agentic automation platform. In the coding harness you work as an autonomous coding agent; in other harnesses you adapt to the active automation domain.

Mode: {mode_name}
{mode_addition}

Tools:
{tools}

Rules:
- Explore before acting. Read available context, inspect state, and understand the user's success criteria.
- When coding, write complete code. No TODOs, no placeholders, no stubs.
- Verify everything. Run checks or inspect results after acting. Fix errors and retry.
- Never give up. Debug failures, try alternatives, persist until done.
- Use edit for small changes, write for new files or full rewrites.
- Use append to add content to the end of a file without reading it first.
- Read large files in chunks with offset/limit.
- Use the question tool only when you genuinely need clarification on preferences, ambiguous requirements, or implementation choices. Otherwise, figure things out with your other tools.

Date: {date}
Working directory: {cwd}",
        mode_name = mode.name,
        mode_addition = mode.system_prompt_addition,
        tools = tools,
        date = date,
        cwd = cwd
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::modes::{build_mode, chat_mode};

    #[test]
    fn prompt_contains_mode_name() {
        let mode = build_mode();
        let prompt = build_system_prompt("/home/user/project", &mode, &[]);
        assert!(prompt.contains("Mode:"));
        assert!(prompt.contains(mode.name));
    }

    #[test]
    fn prompt_contains_working_directory() {
        let mode = chat_mode();
        let prompt = build_system_prompt("/my/project/path", &mode, &[]);
        assert!(prompt.contains("/my/project/path"));
    }

    #[test]
    fn empty_tool_list_shows_none_placeholder() {
        let mode = build_mode();
        let prompt = build_system_prompt("/cwd", &mode, &[]);
        assert!(prompt.contains("(none)"));
    }

    #[test]
    fn tool_snippets_are_joined_into_prompt() {
        let mode = build_mode();
        let snippets = vec!["read: read a file".to_string(), "write: write a file".to_string()];
        let prompt = build_system_prompt("/cwd", &mode, &snippets);
        assert!(prompt.contains("read: read a file"));
        assert!(prompt.contains("write: write a file"));
    }

    #[test]
    fn prompt_does_not_mention_unimplemented_line_edit_tool() {
        let mode = build_mode();
        let prompt = build_system_prompt("/cwd", &mode, &[]);
        assert!(!prompt.contains("line_edit"), "prompt must not reference the non-existent line_edit tool");
    }

    #[test]
    fn prompt_contains_khadim_identity() {
        let mode = build_mode();
        let prompt = build_system_prompt("/cwd", &mode, &[]);
        assert!(prompt.contains("Khadim"));
    }
}
