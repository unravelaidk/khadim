use crate::khadim_agent::types::AgentModeDefinition;
use crate::khadim_code::prompt::build_system_prompt;
use crate::khadim_code::tools::{
    default_tools, default_tools_with_skill_dirs, Tool, ToolContext, ToolDefinition,
};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AgentRuntime {
    context: ToolContext,
    tools: HashMap<String, Arc<dyn Tool>>,
    /// Extra text appended to the system prompt (e.g. skill listings).
    prompt_suffix: String,
}

impl AgentRuntime {
    pub fn new(context: ToolContext) -> Self {
        let tools = default_tools(context.clone())
            .into_iter()
            .map(|tool| (tool.definition().name.clone(), tool))
            .collect::<HashMap<_, _>>();
        Self {
            context,
            tools,
            prompt_suffix: String::new(),
        }
    }

    /// Create a runtime with plugin tools, skill dirs for the read tool,
    /// and a prompt suffix listing available skills.
    pub fn with_extras(
        context: ToolContext,
        plugin_tools: Vec<Arc<dyn Tool>>,
        skill_dirs: Vec<PathBuf>,
        skills_prompt: String,
    ) -> Self {
        let mut tools: HashMap<String, Arc<dyn Tool>> =
            default_tools_with_skill_dirs(context.clone(), skill_dirs)
                .into_iter()
                .map(|tool| (tool.definition().name.clone(), tool))
                .collect();

        for tool in plugin_tools {
            let name = tool.definition().name.clone();
            tools.insert(name, tool);
        }

        Self {
            context,
            tools,
            prompt_suffix: skills_prompt,
        }
    }

    pub fn root(&self) -> &std::path::Path {
        &self.context.root
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
        let mut prompt = build_system_prompt(
            self.context.root.to_string_lossy().as_ref(),
            self.context.source_root.to_string_lossy().as_ref(),
            self.context.execution_target,
            mode,
            &snippets,
        );
        if !self.prompt_suffix.is_empty() {
            prompt.push_str(&self.prompt_suffix);
        }
        prompt
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }
}
