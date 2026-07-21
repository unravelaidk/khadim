use crate::agent::types::AgentModeDefinition;
use crate::events::AgentStreamEvent;
use crate::prompt::build_system_prompt;
use crate::tools::{default_tools, read_only_tools, DelegateTool};
use khadim_ai_core::tools::{Tool, ToolDefinition};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

const MAX_AGENT_INSTRUCTIONS_BYTES: usize = 24 * 1024;
const SKIP_AGENT_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
];

fn discover_agent_instructions(root: &Path) -> String {
    let mut queue = VecDeque::from([root.to_path_buf()]);
    let mut files = Vec::new();

    while let Some(dir) = queue.pop_front() {
        let agents = dir.join("AGENTS.md");
        if agents.is_file() {
            files.push(agents);
        }

        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if SKIP_AGENT_DIRS.contains(&name.as_str()) {
                continue;
            }
            queue.push_back(path);
        }
    }

    files.sort();
    let mut section = String::new();
    for file in files {
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        let relative = file.strip_prefix(root).unwrap_or(&file).display();
        let scope_path = file
            .parent()
            .unwrap_or(root)
            .strip_prefix(root)
            .unwrap_or(root);
        let scope = if scope_path.as_os_str().is_empty() {
            ".".to_string()
        } else {
            scope_path.display().to_string()
        };
        let block = format!("\n\n--- {relative} (scope: {scope}/) ---\n{content}");
        if section.len() + block.len() > MAX_AGENT_INSTRUCTIONS_BYTES {
            section.push_str("\n\n[Additional AGENTS.md content omitted due to prompt budget. Use read to inspect nested files before editing in their scope.]");
            break;
        }
        section.push_str(&block);
    }

    if section.is_empty() {
        return section;
    }

    format!(
        "Repository instructions from AGENTS.md files:\n\
         - Instructions apply to files under their listed scope.\n\
         - More deeply nested AGENTS.md files take precedence.\n\
         - Before editing a file, obey every AGENTS.md whose scope includes it.\n{section}"
    )
}

pub struct AgentRuntime {
    root: PathBuf,
    tools: HashMap<String, Arc<dyn Tool>>,
    /// Extra text appended to the system prompt (e.g. skill listings).
    prompt_suffix: String,
    /// Whether the `delegate_to_agent` tool already carries an event sink.
    /// Set by `with_event_sink` so the orchestrator knows not to overwrite it.
    event_sink_set: bool,
}

impl AgentRuntime {
    /// Create a runtime with full tool access (for primary agents).
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let tools = default_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self {
            root,
            tools,
            prompt_suffix: String::new(),
            event_sink_set: false,
        }
    }

    /// Create a runtime with read-only tool access (for subagents).
    pub fn new_read_only(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let tools = read_only_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self {
            root,
            tools,
            prompt_suffix: String::new(),
            event_sink_set: false,
        }
    }

    /// Create a runtime from an explicit tool allowlist.
    ///
    /// Unlike [`Self::with_extras`], this constructor does not add the default
    /// coding tools. Callers can therefore disable whole tool groups by simply
    /// omitting them from `tools`.
    pub fn with_tools(
        root: impl AsRef<Path>,
        tools: Vec<Arc<dyn Tool>>,
        prompt_suffix: String,
    ) -> Self {
        let tools = tools
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();

        Self {
            root: root.as_ref().to_path_buf(),
            tools,
            prompt_suffix,
            event_sink_set: false,
        }
    }

    /// Create a runtime with extra plugin tools and a prompt suffix.
    /// Used by the desktop app to inject plugins, skills, memory tools, etc.
    pub fn with_extras(
        root: impl AsRef<Path>,
        extra_tools: Vec<Arc<dyn Tool>>,
        prompt_suffix: String,
    ) -> Self {
        let root = root.as_ref().to_path_buf();
        let mut tools: HashMap<String, Arc<dyn Tool>> = default_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect();

        for tool in extra_tools {
            let name = tool.definition().name.clone();
            tools.insert(name, tool);
        }

        Self {
            root,
            tools,
            prompt_suffix,
            event_sink_set: false,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        let mut definitions = self
            .tools
            .values()
            .map(|tool| tool.definition())
            .collect::<Vec<_>>();
        // HashMap iteration order is intentionally randomized. Stable tool
        // schemas make prompts, provider requests, recordings, and tests
        // reproducible across processes and operating systems.
        definitions.sort_by(|left, right| left.name.cmp(&right.name));
        definitions
    }

    pub fn build_prompt(&self, mode: &AgentModeDefinition) -> String {
        let snippets = self
            .definitions()
            .into_iter()
            .map(|tool| tool.prompt_snippet)
            .collect::<Vec<_>>();
        let mut prompt = build_system_prompt(self.root.to_string_lossy().as_ref(), mode, &snippets);
        let agent_instructions = discover_agent_instructions(&self.root);
        if !agent_instructions.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&agent_instructions);
        }
        if !self.prompt_suffix.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&self.prompt_suffix);
        }
        prompt
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    /// Set an event sink so that `delegate_to_agent` (and any future streaming
    /// subagent tool) forwards subagent events to the parent run. Returns a new
    /// runtime with the sink-wired `DelegateTool`. The existing tools are
    /// preserved; only `delegate_to_agent` is replaced.
    ///
    /// `AgentRuntime::new` and `new_read_only` keep `sink = None` by default,
    /// so the single-agent path is unchanged unless the caller opts in.
    pub fn with_event_sink(mut self, tx: UnboundedSender<AgentStreamEvent>) -> Self {
        if self.tools.contains_key("delegate_to_agent") {
            let sinked = DelegateTool::with_event_sink(self.root.clone(), tx);
            self.tools
                .insert("delegate_to_agent".to_string(), Arc::new(sinked));
            self.event_sink_set = true;
        }
        self
    }

    /// Whether `with_event_sink` has been called (i.e. `delegate_to_agent`
    /// already streams its subagent events somewhere). The orchestrator uses
    /// this to decide whether to attach the run's `tx` as a default sink.
    pub fn has_event_sink(&self) -> bool {
        self.event_sink_set
    }

    /// Convert tool definitions to OpenAI function-calling format.
    pub fn openai_tools(&self) -> Vec<serde_json::Value> {
        self.definitions()
            .into_iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    }
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::modes::chat_mode;
    use crate::tools::ReadTool;

    #[test]
    fn explicit_tools_expose_only_the_provided_definitions() {
        let root = tempfile::tempdir().expect("create temporary workspace");
        let tools: Vec<Arc<dyn Tool>> = vec![Arc::new(ReadTool::new(root.path().to_path_buf()))];

        let runtime = AgentRuntime::with_tools(root.path(), tools, String::new());
        let definitions = runtime.definitions();

        assert_eq!(definitions.len(), 1);
        assert_eq!(definitions[0].name, "read");
    }

    #[test]
    fn explicit_tools_runtime_appends_the_prompt_suffix() {
        let root = tempfile::tempdir().expect("create temporary workspace");
        let suffix = "Enabled skills:\n- spreadsheet automation";

        let runtime = AgentRuntime::with_tools(root.path(), Vec::new(), suffix.to_string());
        let prompt = runtime.build_prompt(&chat_mode());

        assert!(prompt.ends_with(suffix));
    }

    #[test]
    fn tool_definitions_are_stably_sorted_by_name() {
        let root = tempfile::tempdir().expect("create temporary workspace");
        let runtime = AgentRuntime::new(root.path());

        let names = runtime
            .definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        let mut sorted = names.clone();
        sorted.sort();

        assert_eq!(names, sorted);
    }
}
