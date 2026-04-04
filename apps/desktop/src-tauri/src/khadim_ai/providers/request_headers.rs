use crate::khadim_ai::types::ChatMessage;

pub fn infer_copilot_initiator(messages: &[ChatMessage]) -> &'static str {
    match messages.last() {
        Some(ChatMessage::User { .. }) => "user",
        Some(_) => "agent",
        None => "user",
    }
}

pub fn has_copilot_vision_input(_messages: &[ChatMessage]) -> bool {
    false
}

pub fn build_copilot_dynamic_headers(messages: &[ChatMessage]) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("X-Initiator", infer_copilot_initiator(messages).to_string()),
        ("Openai-Intent", "conversation-edits".to_string()),
    ];

    if has_copilot_vision_input(messages) {
        headers.push(("Copilot-Vision-Request", "true".to_string()));
    }

    headers
}

pub fn build_codex_request_headers(session_id: Option<&str>) -> Vec<(&'static str, String)> {
    let request_id = session_id
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    vec![
        (
            "User-Agent",
            format!(
                "khadim ({}/{})",
                std::env::consts::OS,
                std::env::consts::ARCH
            ),
        ),
        ("x-client-request-id", request_id.clone()),
        ("session_id", request_id),
    ]
}
