use crate::agent::types::AgentModeDefinition;
use crate::prompt::build_system_prompt;
use crate::tools::{default_tools, read_only_tools};
use khadim_ai_core::tools::{Tool, ToolDefinition};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct AgentRuntime {
    root: PathBuf,
    tools: HashMap<String, Arc<dyn Tool>>,
    /// Extra text appended to the system prompt (e.g. skill listings).
    prompt_suffix: String,
}

impl AgentRuntime {
    /// Create a runtime with full tool access (for primary agents).
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let tools = default_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self { root, tools, prompt_suffix: String::new() }
    }

    /// Create a runtime with read-only tool access (for subagents).
    pub fn new_read_only(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let tools = read_only_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self { root, tools, prompt_suffix: String::new() }
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

        Self { root, tools, prompt_suffix }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|tool| tool.definition()).collect()
    }

    pub fn build_prompt(&self, mode: &AgentModeDefinition) -> String {
        let snippets = self
            .definitions()
            .into_iter()
            .map(|tool| tool.prompt_snippet)
            .collect::<Vec<_>>();
        let mut prompt = build_system_prompt(self.root.to_string_lossy().as_ref(), mode, &snippets);
        if !self.prompt_suffix.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&self.prompt_suffix);
        }
        prompt
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
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
