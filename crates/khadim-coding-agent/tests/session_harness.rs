use async_trait::async_trait;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use khadim_ai_core::types::{
    AssistantStreamEvent, ChatMessage, CompletionResponse, Context, ToolCall, ToolFunction, Usage,
};
use khadim_ai_core::ModelExecutor;
use khadim_coding_agent::{
    chat_mode, run_prompt_with_model_executor, AgentRuntime, AgentStreamEvent, KhadimSession,
    RunConfig,
};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

struct ScriptedResponse {
    events: Vec<AssistantStreamEvent>,
    outcome: Result<CompletionResponse, AppError>,
}

#[derive(Default)]
struct FakeModelState {
    responses: VecDeque<ScriptedResponse>,
    contexts: Vec<Context>,
}

#[derive(Clone, Default)]
struct QueuedFakeModel {
    state: Arc<Mutex<FakeModelState>>,
}

impl QueuedFakeModel {
    fn queue(&self, response: ScriptedResponse) {
        self.state
            .lock()
            .expect("fake model state")
            .responses
            .push_back(response);
    }

    fn call_count(&self) -> usize {
        self.state.lock().expect("fake model state").contexts.len()
    }

    fn pending_response_count(&self) -> usize {
        self.state.lock().expect("fake model state").responses.len()
    }

    fn contexts(&self) -> Vec<Context> {
        self.state
            .lock()
            .expect("fake model state")
            .contexts
            .clone()
    }

    fn take_response(&self, context: &Context) -> Result<ScriptedResponse, AppError> {
        let mut state = self.state.lock().expect("fake model state");
        state.contexts.push(context.clone());
        state
            .responses
            .pop_front()
            .ok_or_else(|| AppError::invalid_input("Fake model response queue is empty"))
    }
}

struct MarkerTool {
    path: PathBuf,
}

#[async_trait]
impl Tool for MarkerTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "marker".to_string(),
            description: "Write a marker value into the session workspace".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string" }
                },
                "required": ["text"]
            }),
            prompt_snippet: String::new(),
        }
    }

    async fn execute(&self, input: serde_json::Value) -> Result<ToolResult, AppError> {
        let text = input
            .get("text")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| AppError::invalid_input("marker requires text"))?;
        std::fs::write(&self.path, text)?;
        Ok(ToolResult::text(format!("marked:{text}")))
    }
}

#[async_trait]
impl ModelExecutor for QueuedFakeModel {
    async fn complete(
        &self,
        context: &Context,
        _temperature: f32,
    ) -> Result<CompletionResponse, AppError> {
        self.take_response(context)?.outcome
    }

    async fn stream(
        &self,
        context: &Context,
        _temperature: f32,
        on_event: Arc<dyn Fn(AssistantStreamEvent) + Send + Sync>,
    ) -> Result<CompletionResponse, AppError> {
        let response = self.take_response(context)?;
        for event in response.events {
            on_event(event);
        }
        response.outcome
    }
}

struct SessionHarness {
    _temp: TempDir,
    session: KhadimSession,
    model: Arc<QueuedFakeModel>,
    tools: Vec<Arc<dyn Tool>>,
    event_tx: UnboundedSender<AgentStreamEvent>,
    event_rx: UnboundedReceiver<AgentStreamEvent>,
}

impl SessionHarness {
    fn new(tools: Vec<Arc<dyn Tool>>) -> Self {
        let temp = tempfile::tempdir().expect("temporary session workspace");
        let session = KhadimSession::new(temp.path().to_path_buf());
        let (event_tx, event_rx) = unbounded_channel();
        Self {
            _temp: temp,
            session,
            model: Arc::new(QueuedFakeModel::default()),
            tools,
            event_tx,
            event_rx,
        }
    }

    async fn prompt(&mut self, prompt: &str, config: RunConfig) -> Result<String, AppError> {
        let runtime =
            AgentRuntime::with_tools(self.session.cwd.clone(), self.tools.clone(), String::new());
        run_prompt_with_model_executor(
            &mut self.session,
            prompt,
            self.model.clone(),
            chat_mode(),
            &self.event_tx,
            runtime,
            config,
        )
        .await
    }

    fn drain_events(&mut self) -> Vec<AgentStreamEvent> {
        std::iter::from_fn(|| self.event_rx.try_recv().ok()).collect()
    }
}

fn session_config() -> RunConfig {
    let mut config = RunConfig::default();
    config.nudge_interval = 0;
    config.extract_contracts = false;
    config.goal_tracking = false;
    config
}

fn text_response(text: &str, usage: Usage) -> ScriptedResponse {
    let midpoint = text
        .char_indices()
        .nth(text.chars().count() / 2)
        .map_or(text.len(), |(index, _)| index);
    let (first, second) = text.split_at(midpoint);
    ScriptedResponse {
        events: vec![
            AssistantStreamEvent::Start,
            AssistantStreamEvent::TextStart,
            AssistantStreamEvent::TextDelta(first.to_string()),
            AssistantStreamEvent::TextDelta(second.to_string()),
            AssistantStreamEvent::Usage(usage.clone()),
            AssistantStreamEvent::TextEnd(text.to_string()),
            AssistantStreamEvent::Done,
        ],
        outcome: Ok(CompletionResponse {
            content: text.to_string(),
            tool_calls: Vec::new(),
            usage,
            reasoning_content: None,
        }),
    }
}

fn tool_response(tool_call: ToolCall) -> ScriptedResponse {
    ScriptedResponse {
        events: vec![
            AssistantStreamEvent::Start,
            AssistantStreamEvent::ToolCallStart {
                id: tool_call.id.clone(),
                name: tool_call.function.name.clone(),
            },
            AssistantStreamEvent::ToolCallDelta {
                id: tool_call.id.clone(),
                name: tool_call.function.name.clone(),
                arguments: tool_call.function.arguments.clone(),
            },
            AssistantStreamEvent::ToolCallEnd(tool_call.clone()),
            AssistantStreamEvent::Done,
        ],
        outcome: Ok(CompletionResponse {
            content: String::new(),
            tool_calls: vec![tool_call],
            usage: Usage::default(),
            reasoning_content: None,
        }),
    }
}

fn error_response(message: &str) -> ScriptedResponse {
    ScriptedResponse {
        events: vec![AssistantStreamEvent::Error(message.to_string())],
        outcome: Err(AppError::health(message)),
    }
}

#[tokio::test]
async fn streamed_text_turn_updates_the_public_session_and_event_stream() {
    let mut harness = SessionHarness::new(Vec::new());
    harness.model.queue(text_response(
        "héllo 🌍",
        Usage {
            input: 7,
            output: 2,
            cache_read: 1,
            cache_write: 0,
        },
    ));

    let output = harness
        .prompt("say hello", session_config())
        .await
        .expect("session turn succeeds");

    assert_eq!(output, "héllo 🌍");
    assert_eq!(harness.model.call_count(), 1);
    assert_eq!(harness.model.pending_response_count(), 0);
    assert!(matches!(
        harness.session.messages[0],
        ChatMessage::System { .. }
    ));
    assert!(matches!(
        &harness.session.messages[1],
        ChatMessage::User { content } if content == "say hello"
    ));
    assert!(matches!(
        &harness.session.messages[2],
        ChatMessage::Assistant { content: Some(content), tool_calls, .. }
            if content == "héllo 🌍" && tool_calls.is_empty()
    ));

    let events = harness.drain_events();
    let event_types = events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "llm_call_start",
            "text_delta",
            "text_delta",
            "usage",
            "llm_call_end",
            "done",
        ]
    );
    assert_eq!(
        events[3].metadata.as_ref().expect("usage metadata"),
        &serde_json::json!({
            "input": 7,
            "output": 2,
            "cache_read": 1,
            "cache_write": 0,
        })
    );
}

#[tokio::test]
async fn tool_round_trip_executes_side_effect_and_returns_result_to_the_model() {
    let mut harness = SessionHarness::new(Vec::new());
    let marker_path = harness.session.cwd.join("marker.txt");
    harness.tools.push(Arc::new(MarkerTool {
        path: marker_path.clone(),
    }));
    let tool_call = ToolCall {
        id: "call-marker-1".to_string(),
        call_type: "function".to_string(),
        function: ToolFunction {
            name: "marker".to_string(),
            arguments: serde_json::json!({ "text": "from agent" }).to_string(),
        },
    };
    harness.model.queue(tool_response(tool_call));
    harness
        .model
        .queue(text_response("tool complete", Usage::default()));

    let output = harness
        .prompt("write the marker", session_config())
        .await
        .expect("tool session succeeds");

    assert_eq!(output, "tool complete");
    assert_eq!(std::fs::read_to_string(marker_path).unwrap(), "from agent");
    assert_eq!(harness.model.call_count(), 2);
    assert_eq!(harness.model.pending_response_count(), 0);

    let contexts = harness.model.contexts();
    assert_eq!(contexts.len(), 2);
    assert_eq!(contexts[0].tools.len(), 1);
    assert_eq!(contexts[0].tools[0].name, "marker");
    assert!(matches!(
        &contexts[1].messages[3],
        ChatMessage::Tool(tool)
            if tool.tool_call_id == "call-marker-1" && tool.content == "marked:from agent"
    ));
    assert!(matches!(
        &harness.session.messages[2],
        ChatMessage::Assistant { tool_calls, .. }
            if tool_calls.len() == 1 && tool_calls[0].id == "call-marker-1"
    ));
    assert!(matches!(
        &harness.session.messages[3],
        ChatMessage::Tool(tool) if tool.content == "marked:from agent"
    ));
    assert!(matches!(
        &harness.session.messages[4],
        ChatMessage::Assistant { content: Some(content), .. } if content == "tool complete"
    ));

    let events = harness.drain_events();
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "step_complete")
            .count(),
        1
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "done")
            .count(),
        1
    );
}

#[tokio::test]
async fn retry_recovers_without_sleep_or_premature_terminal_error() {
    let mut harness = SessionHarness::new(Vec::new());
    harness
        .model
        .queue(error_response("temporary model outage"));
    harness
        .model
        .queue(text_response("recovered", Usage::default()));
    let mut config = session_config();
    config.max_llm_attempts = 2;
    config.llm_retry_base_delay = std::time::Duration::ZERO;

    let output = harness
        .prompt("please recover", config)
        .await
        .expect("second model attempt succeeds");

    assert_eq!(output, "recovered");
    assert_eq!(harness.model.call_count(), 2);
    assert_eq!(harness.model.pending_response_count(), 0);
    let contexts = harness.model.contexts();
    assert_eq!(contexts.len(), 2);
    assert_eq!(contexts[0].messages.len(), contexts[1].messages.len());

    let events = harness.drain_events();
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "llm_call_start")
            .count(),
        2
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "llm_call_end")
            .count(),
        2
    );
    let retry_events = events
        .iter()
        .filter(|event| {
            event.event_type == "step_update"
                && event
                    .metadata
                    .as_ref()
                    .and_then(|metadata| metadata.get("kind"))
                    == Some(&serde_json::json!("retry"))
        })
        .collect::<Vec<_>>();
    assert_eq!(retry_events.len(), 1);
    assert_eq!(retry_events[0].metadata.as_ref().unwrap()["attempt"], 1);
    assert_eq!(
        retry_events[0].metadata.as_ref().unwrap()["max_attempts"],
        2
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| {
                event.event_type == "step_update"
                    && event
                        .metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("kind"))
                        == Some(&serde_json::json!("stream_error"))
            })
            .count(),
        1
    );
    assert!(events.iter().all(|event| event.event_type != "error"));
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "done")
            .count(),
        1
    );
    assert_eq!(
        events.last().map(|event| event.event_type.as_str()),
        Some("done")
    );
}

#[tokio::test]
async fn max_turn_limit_returns_error_and_emits_one_terminal_error_only() {
    let mut harness = SessionHarness::new(Vec::new());
    let marker_path = harness.session.cwd.join("max-turn-marker.txt");
    harness.tools.push(Arc::new(MarkerTool {
        path: marker_path.clone(),
    }));
    harness.model.queue(tool_response(ToolCall {
        id: "call-before-limit".to_string(),
        call_type: "function".to_string(),
        function: ToolFunction {
            name: "marker".to_string(),
            arguments: serde_json::json!({ "text": "one turn" }).to_string(),
        },
    }));
    let mut config = session_config();
    config.max_turns = 1;
    config.max_llm_attempts = 1;
    config.llm_retry_base_delay = std::time::Duration::ZERO;

    let error = harness
        .prompt("keep calling tools", config)
        .await
        .expect_err("turn limit is terminal failure");

    assert_eq!(error.message, "Reached maximum turn limit (1). Stopping.");
    assert_eq!(std::fs::read_to_string(marker_path).unwrap(), "one turn");
    assert_eq!(harness.model.call_count(), 1);
    assert_eq!(harness.model.pending_response_count(), 0);

    let events = harness.drain_events();
    let terminal_errors = events
        .iter()
        .filter(|event| event.event_type == "error")
        .collect::<Vec<_>>();
    assert_eq!(terminal_errors.len(), 1);
    assert_eq!(
        terminal_errors[0].content.as_deref(),
        Some("Reached maximum turn limit (1). Stopping.")
    );
    assert!(events.iter().all(|event| event.event_type != "done"));
    assert_eq!(
        events.last().map(|event| event.event_type.as_str()),
        Some("error")
    );
}
