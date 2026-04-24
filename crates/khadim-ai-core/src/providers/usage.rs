use crate::types::Usage;

pub fn openai_responses_usage(raw_usage: &serde_json::Value) -> Usage {
    let total_input = raw_usage
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_read = raw_usage
        .get("input_tokens_details")
        .and_then(|v| v.get("cached_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Usage {
        input: total_input.saturating_sub(cache_read),
        output: raw_usage
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_read,
        cache_write: 0,
    }
}

pub fn openai_completions_usage(raw_usage: &serde_json::Value) -> Usage {
    let total_input = raw_usage
        .get("prompt_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_read = raw_usage
        .get("prompt_tokens_details")
        .and_then(|v| v.get("cached_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Usage {
        input: total_input.saturating_sub(cache_read),
        output: raw_usage
            .get("completion_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_read,
        cache_write: 0,
    }
}

pub fn anthropic_usage(raw_usage: &serde_json::Value) -> Usage {
    Usage {
        input: raw_usage
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        output: raw_usage
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_read: raw_usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_write: raw_usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
    }
}

pub fn simple_usage(input: u64, output: u64) -> Usage {
    Usage {
        input,
        output,
        cache_read: 0,
        cache_write: 0,
    }
}

pub fn google_usage(raw_usage: &serde_json::Value) -> Usage {
    let total_input = raw_usage
        .get("promptTokenCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_read = raw_usage
        .get("cachedContentTokenCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Usage {
        input: total_input.saturating_sub(cache_read),
        output: raw_usage
            .get("candidatesTokenCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_read,
        cache_write: 0,
    }
}

pub fn bedrock_usage(raw_usage: &serde_json::Value) -> Usage {
    Usage {
        input: raw_usage
            .get("inputTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        output: raw_usage
            .get("outputTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_read: raw_usage
            .get("cacheReadInputTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cache_write: raw_usage
            .get("cacheWriteInputTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
    }
}
