use khadim_ai_core::error::AppError;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Harness {
    id: String,
}

impl Harness {
    pub fn coding() -> Self {
        Self {
            id: "coding".to_string(),
        }
    }

    pub fn parse(value: &str) -> Result<Self, AppError> {
        let id = value.trim().to_ascii_lowercase();
        if id.is_empty() {
            return Err(AppError::invalid_input("harness requires a value"));
        }
        if !id
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-' || ch == '_')
        {
            return Err(AppError::invalid_input(format!(
                "Invalid harness '{value}'. Use letters, numbers, '-' or '_'."
            )));
        }
        Ok(Self { id })
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn label(&self) -> &'static str {
        match self.id.as_str() {
            "coding" => "Coding",
            "rpa" => "RPA",
            "assistant" => "Assistant",
            _ => "Custom",
        }
    }

    pub fn description(&self) -> &'static str {
        match self.id.as_str() {
            "coding" => "file, shell, git, search, and code-editing automation",
            "rpa" => "screen, input, browser, connector, and workflow automation",
            "assistant" => "computer-use assistant for screen, audio, app, and workflow control",
            _ => "custom automation harness",
        }
    }

    pub fn uses_rpa_tools(&self) -> bool {
        matches!(self.id.as_str(), "rpa" | "assistant")
    }

    pub fn prompt_suffix(&self) -> String {
        match self.id.as_str() {
            "coding" => String::new(),
            "rpa" => r#"Harness: RPA
You are running as Khadim RPA, a local-first automation agent for operating desktop apps, browsers, files, and external services.
- Treat the user's request as an automation workflow, not only a coding task.
- Prefer durable scripts and structured runs when possible.
- Use screen, browser, input, OCR, connector, and credential tools when they are available in this runtime.
- If a needed RPA capability is not available, state the missing capability precisely and use the available tools to prepare the workflow, script, or next integration step."#
                .to_string(),
            "assistant" => r#"Harness: Assistant
You are running as Khadim Assistant, a computer-use assistant harness.
- Help the user by observing state, reasoning about the current task, and controlling available tools.
- Use screen, browser, keyboard, mouse, audio, file, and connector tools when this runtime provides them.
- For audio tasks, listen/transcribe/analyze with available audio tools; if none are loaded, explain the missing tool and prepare the workflow around it.
- Be careful with irreversible actions, private data, payments, messages, and credential use; ask before taking high-impact actions."#
                .to_string(),
            _ => format!(
                "Harness: {}\nYou are running in a custom Khadim harness named '{}'. Adapt to the user's automation domain and use only the tools available in this runtime.",
                self.id, self.id
            ),
        }
    }

    pub fn catalog() -> Vec<Self> {
        ["coding", "rpa", "assistant"]
            .into_iter()
            .map(|id| Self { id: id.to_string() })
            .collect()
    }
}

impl Default for Harness {
    fn default() -> Self {
        Self::coding()
    }
}

impl fmt::Display for Harness {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.id)
    }
}
