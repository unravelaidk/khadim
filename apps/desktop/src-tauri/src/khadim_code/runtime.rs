use crate::khadim_agent::types::AgentModeDefinition;
use crate::khadim_code::prompt::build_system_prompt;
use crate::khadim_code::tools::{default_tools, default_tools_with_skill_dirs, Tool, ToolDefinition};
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
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let tools = default_tools(&root)
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self { root, tools, prompt_suffix: String::new() }
    }

    /// Create a runtime with plugin tools, skill dirs for the read tool,
    /// and a prompt suffix listing available skills.
    pub fn with_extras(
        root: impl AsRef<Path>,
        plugin_tools: Vec<Arc<dyn Tool>>,
        skill_dirs: Vec<PathBuf>,
        skills_prompt: String,
    ) -> Self {
        let root = root.as_ref().to_path_buf();
        let mut tools: HashMap<String, Arc<dyn Tool>> =
            default_tools_with_skill_dirs(&root, skill_dirs)
                .into_iter()
                .map(|tool| (tool.definition().name.clone(), tool))
                .collect();

        for tool in plugin_tools {
            let name = tool.definition().name.clone();
            tools.insert(name, tool);
        }

        Self { root, tools, prompt_suffix: skills_prompt }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|tool| tool.definition()).collect()
    }

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

    pub fn build_prompt(&self, mode: &AgentModeDefinition) -> String {
        let snippets = self
            .definitions()
            .into_iter()
            .map(|tool| tool.prompt_snippet)
            .collect::<Vec<_>>();
        let mut prompt = build_system_prompt(self.root.to_string_lossy().as_ref(), mode, &snippets);
        if !self.prompt_suffix.is_empty() {
            prompt.push_str(&self.prompt_suffix);
        }
        prompt
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }
}
