//! Web Search Plugin for Khadim
//!
//! Provides a `web_search` tool that the agent can use to search the web.
//! Requires an API key configured via the plugin config system.
//! Uses the host HTTP import to make requests to the search API.

use khadim_plugin_sdk::prelude::*;

#[derive(Default)]
struct WebSearchPlugin {
    api_key: String,
    search_engine: String,
    max_results: usize,
}

impl KhadimPlugin for WebSearchPlugin {
    fn info(&self) -> PluginInfo {
        PluginInfo {
            name: "web-search".into(),
            version: "0.1.0".into(),
            description: "Web search tool for the Khadim agent. Search the internet from your coding session.".into(),
            author: "Khadim".into(),
            license: Some("MIT".into()),
            ..Default::default()
        }
    }

    fn config_schema(&self) -> Vec<ConfigField> {
        vec![
            ConfigField::secret("api_key", "API key for the search provider"),
            ConfigField::string(
                "search_engine",
                "Search engine to use: brave, serper, tavily (default: brave)",
                false,
            ),
            ConfigField {
                key: "max_results".into(),
                description: "Maximum number of results to return (default: 5)".into(),
                field_type: "number".into(),
                required: false,
                default_value: Some("5".into()),
            },
        ]
    }

    fn initialize(&mut self, config: Value) -> Result<(), String> {
        self.api_key = config
            .get("api_key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        self.search_engine = config
            .get("search_engine")
            .and_then(|v| v.as_str())
            .unwrap_or("brave")
            .to_string();

        self.max_results = config
            .get("max_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;

        if self.api_key.is_empty() {
            // Still load — tools will return a helpful error at call time
            log::warn!("Web search plugin: no API key configured. Tools will not return real results.");
        }

        Ok(())
    }

    fn tools(&self) -> Vec<ToolDef> {
        vec![
            ToolDef {
                name: "web_search".into(),
                description: "Search the web for information. Returns a list of results with titles, snippets, and URLs.".into(),
                params: vec![
                    ToolParam::required("query", "string", "The search query"),
                    ToolParam::optional("max_results", "integer", "Maximum number of results (overrides default)"),
                ],
                prompt_snippet: "- web_search: Search the web for current information. Use when you need up-to-date facts, documentation, or answers that may not be in your training data.".into(),
            },
            ToolDef {
                name: "fetch_url".into(),
                description: "Fetch the text content of a URL.".into(),
                params: vec![
                    ToolParam::required("url", "string", "The URL to fetch"),
                ],
                prompt_snippet: "- fetch_url: Fetch and read the content of a web page.".into(),
            },
        ]
    }

    fn execute(&mut self, tool_name: &str, args: Value) -> ToolResult {
        match tool_name {
            "web_search" => {
                let query = match args["query"].as_str() {
                    Some(q) => q,
                    None => return ToolResult::error("Missing required parameter: query"),
                };

                // In a real plugin, this would use `host::http_request` to call the search API.
                // For now, return a placeholder showing the intended behavior.
                let _max = args["max_results"]
                    .as_u64()
                    .unwrap_or(self.max_results as u64);

                // Placeholder — real implementation uses host HTTP import
                ToolResult::ok_with_metadata(
                    format!(
                        "Search results for '{}' via {} (this is a placeholder — \
                         the real implementation makes HTTP requests through the host):\n\n\
                         [Results would appear here]",
                        query, self.search_engine
                    ),
                    json!({
                        "query": query,
                        "engine": self.search_engine,
                        "result_count": 0,
                    }),
                )
            }
            "fetch_url" => {
                let url = match args["url"].as_str() {
                    Some(u) => u,
                    None => return ToolResult::error("Missing required parameter: url"),
                };

                // Placeholder — real implementation uses host HTTP import
                ToolResult::ok(format!(
                    "Fetching content from: {url}\n\n\
                     [Content would appear here — requires host HTTP permission]"
                ))
            }
            _ => ToolResult::error(format!("Unknown tool: {tool_name}")),
        }
    }
}

export_plugin!(WebSearchPlugin);
