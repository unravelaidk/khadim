use super::orchestrator::{extract_contract_summary, repair_session_messages};
use khadim_ai_core::types::{ChatMessage, ToolCall, ToolFunction, ToolMessage};

// ── repair_session_messages ────────────────────────────────────────────────

#[test]
fn repair_empty_messages_is_noop() {
    let mut messages = Vec::new();
    repair_session_messages(&mut messages);
    assert!(messages.is_empty());
}

#[test]
fn repair_normal_conversation_is_unchanged() {
    let mut messages = vec![
        ChatMessage::System {
            content: "You are helpful.".to_string(),
        },
        ChatMessage::User {
            content: "Hello".to_string(),
        },
        ChatMessage::Assistant {
            content: Some("Hi!".to_string()),
            tool_calls: vec![],
            reasoning_content: None,
        },
    ];
    let original_len = messages.len();
    repair_session_messages(&mut messages);
    assert_eq!(messages.len(), original_len);
}

#[test]
fn repair_adds_stub_for_missing_tool_result() {
    let mut messages = vec![
        ChatMessage::User {
            content: "do it".to_string(),
        },
        ChatMessage::Assistant {
            content: None,
            tool_calls: vec![ToolCall {
                id: "call-1".to_string(),
                call_type: "function".to_string(),
                function: ToolFunction {
                    name: "read".to_string(),
                    arguments: "{}".to_string(),
                },
            }],
            reasoning_content: None,
        },
        // No Tool message — result is missing
    ];
    repair_session_messages(&mut messages);
    let has_stub = messages
        .iter()
        .any(|m| matches!(m, ChatMessage::Tool(t) if t.tool_call_id == "call-1"));
    assert!(has_stub, "expected a stub tool result for call-1");
}

#[test]
fn repair_does_not_duplicate_present_tool_result() {
    let mut messages = vec![
        ChatMessage::User {
            content: "do it".to_string(),
        },
        ChatMessage::Assistant {
            content: None,
            tool_calls: vec![ToolCall {
                id: "call-2".to_string(),
                call_type: "function".to_string(),
                function: ToolFunction {
                    name: "read".to_string(),
                    arguments: "{}".to_string(),
                },
            }],
            reasoning_content: None,
        },
        ChatMessage::Tool(ToolMessage {
            content: "file content".to_string(),
            tool_call_id: "call-2".to_string(),
        }),
    ];
    repair_session_messages(&mut messages);
    let count = messages
        .iter()
        .filter(|m| matches!(m, ChatMessage::Tool(t) if t.tool_call_id == "call-2"))
        .count();
    assert_eq!(count, 1, "tool result should not be duplicated");
}

#[test]
fn repair_drops_empty_assistant_message() {
    let mut messages = vec![
        ChatMessage::User {
            content: "hi".to_string(),
        },
        ChatMessage::Assistant {
            content: None,
            tool_calls: vec![],
            reasoning_content: None,
        },
    ];
    repair_session_messages(&mut messages);
    let assistant_count = messages
        .iter()
        .filter(|m| matches!(m, ChatMessage::Assistant { .. }))
        .count();
    assert_eq!(
        assistant_count, 0,
        "empty assistant message should be dropped"
    );
}

// ── extract_contract_summary ───────────────────────────────────────────────

#[test]
fn contract_returns_none_for_plain_text() {
    assert!(extract_contract_summary("Just fix the bug and make it work.").is_none());
}

#[test]
fn contract_extracts_backtick_path() {
    let summary = extract_contract_summary("Write the output to `/tmp/out.json`.").unwrap();
    assert!(summary.contains("/tmp/out.json"), "got: {summary}");
}

#[test]
fn contract_extracts_store_in_path() {
    let summary =
        extract_contract_summary("Run the analysis and store it in /results/data.csv.").unwrap();
    assert!(summary.contains("/results/data.csv"), "got: {summary}");
}

#[test]
fn contract_captures_do_not_edit_constraint() {
    let summary =
        extract_contract_summary("Do not edit the existing test files. Only add new ones.")
            .unwrap();
    assert!(summary.contains("constraints:"), "got: {summary}");
}

#[test]
fn contract_captures_we_will_test_command() {
    let summary = extract_contract_summary("We will test this with: cargo test --lib").unwrap();
    assert!(summary.contains("checks:"), "got: {summary}");
}
