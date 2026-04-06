use khadim_plugin_sdk::prelude::*;

#[derive(Default)]
struct HelloWorldPlugin {
    greeting_prefix: String,
}

impl KhadimPlugin for HelloWorldPlugin {
    fn info(&self) -> PluginInfo {
        PluginInfo {
            name: "hello-world".into(),
            version: "0.1.0".into(),
            description: "A simple example plugin that demonstrates the Khadim plugin system".into(),
            author: "Khadim".into(),
            license: Some("MIT".into()),
            homepage: Some("https://github.com/khadim/khadim".into()),
            ..Default::default()
        }
    }

    fn config_schema(&self) -> Vec<ConfigField> {
        vec![ConfigField::string(
            "greeting_prefix",
            "Custom prefix for greetings (default: 'Hello')",
            false,
        )]
    }

    fn initialize(&mut self, config: Value) -> Result<(), String> {
        self.greeting_prefix = config
            .get("greeting_prefix")
            .and_then(|v| v.as_str())
            .unwrap_or("Hello")
            .to_string();
        Ok(())
    }

    fn tools(&self) -> Vec<ToolDef> {
        vec![
            ToolDef {
                name: "greet".into(),
                description: "Greet someone by name".into(),
                params: vec![
                    ToolParam::required("name", "string", "The name to greet"),
                    ToolParam::optional("style", "string", "Greeting style: formal, casual, pirate"),
                ],
                prompt_snippet: "- greet: Greet someone by name with an optional style".into(),
            },
            ToolDef {
                name: "count_words".into(),
                description: "Count the number of words in a text".into(),
                params: vec![
                    ToolParam::required("text", "string", "The text to count words in"),
                ],
                prompt_snippet: "- count_words: Count words in a text string".into(),
            },
            ToolDef {
                name: "reverse".into(),
                description: "Reverse a string".into(),
                params: vec![
                    ToolParam::required("text", "string", "The text to reverse"),
                ],
                prompt_snippet: "- reverse: Reverse a string".into(),
            },
        ]
    }

    fn execute(&mut self, tool_name: &str, args: Value) -> ToolResult {
        match tool_name {
            "greet" => {
                let name = args["name"].as_str().unwrap_or("World");
                let style = args["style"].as_str().unwrap_or("casual");

                let greeting = match style {
                    "formal" => format!("Good day, {}. It is a pleasure to make your acquaintance.", name),
                    "pirate" => format!("Ahoy, {}! Welcome aboard, ye scallywag!", name),
                    _ => format!("{}, {}!", self.greeting_prefix, name),
                };

                ToolResult::ok(greeting)
            }
            "count_words" => {
                let text = args["text"].as_str().unwrap_or("");
                let count = text.split_whitespace().count();
                ToolResult::ok_with_metadata(
                    format!("The text contains {count} word(s)."),
                    json!({ "word_count": count }),
                )
            }
            "reverse" => {
                let text = args["text"].as_str().unwrap_or("");
                let reversed: String = text.chars().rev().collect();
                ToolResult::ok(reversed)
            }
            _ => ToolResult::error(format!("Unknown tool: {tool_name}")),
        }
    }
}

export_plugin!(HelloWorldPlugin);
