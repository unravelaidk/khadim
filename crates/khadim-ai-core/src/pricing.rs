//! Per-model pricing resolution and cost calculation.
//!
//! Mirrors pi-mono's `calculateCost(model, usage)` and the per-model `cost`
//! field. Until every builtin model carries an explicit `cost`, this module
//! also exposes a pattern-based fallback — `default_cost_for(provider, id)`
//! — that encodes public per-million-token pricing for the major OpenAI,
//! Anthropic, Google, Mistral, and DeepSeek families. Providers that proxy
//! those model families (Codex, Azure, Copilot, OpenCode, Kimi, MiniMax,
//! Vertex) are normalized onto the upstream family before lookup so the
//! same prices apply everywhere.
//!
//! Rates are USD per 1,000,000 tokens.

use crate::types::{Cost, Model, Usage};

/// Collapse provider aliases that bill on an upstream family's rate card.
fn pricing_family(provider: &str) -> &str {
    match provider {
        "openai-codex" | "azure-openai-responses" => "openai",
        "github-copilot" | "opencode" | "opencode-go" | "kimi-coding" | "minimax"
        | "minimax-cn" => "anthropic",
        "google-vertex" => "google",
        other => other,
    }
}

/// Best-effort default pricing for `(provider, model_id)`. Returns a
/// zero-cost value when nothing matches — callers should treat that as
/// "unknown" rather than "free".
pub fn default_cost_for(provider: &str, model_id: &str) -> Cost {
    let provider = pricing_family(provider);
    let m = model_id;

    let (input, output, cache_read, cache_write): (f64, f64, f64, f64) = match (provider, m) {
        // ── Anthropic family ────────────────────────────────────────
        ("anthropic", m) if m.contains("claude-opus-4") || m.contains("claude-4-opus") => {
            (15.0, 75.0, 1.5, 18.75)
        }
        ("anthropic", m) if m.contains("claude-sonnet-4.6") => (6.0, 30.0, 0.6, 7.5),
        ("anthropic", m) if m.contains("claude-sonnet-4.5") => (4.0, 20.0, 0.4, 5.0),
        ("anthropic", m) if m.contains("claude-sonnet-4") => (3.0, 15.0, 0.3, 3.75),
        ("anthropic", m) if m.contains("claude-haiku-4.5") => (1.0, 5.0, 0.1, 1.25),
        ("anthropic", m) if m.contains("claude-3-5-sonnet") => (3.0, 15.0, 0.3, 3.75),
        ("anthropic", m) if m.contains("claude-3-7-sonnet") => (3.0, 15.0, 0.3, 3.75),
        ("anthropic", m) if m.contains("claude-3-5-haiku") => (0.8, 4.0, 0.08, 1.0),
        ("anthropic", m) if m.contains("claude-3-opus") => (15.0, 75.0, 1.5, 18.75),
        ("anthropic", m) if m.contains("claude-3-haiku") => (0.25, 1.25, 0.03, 0.3),

        // ── OpenAI Responses / Chat family ──────────────────────────
        ("openai", m) if m.contains("gpt-5.4-pro") => (30.0, 180.0, 0.0, 0.0),
        ("openai", m) if m.contains("gpt-5.4-nano") => (0.2, 1.25, 0.02, 0.0),
        ("openai", m) if m.contains("gpt-5.4-mini") => (0.75, 4.5, 0.075, 0.0),
        ("openai", m) if m.contains("gpt-5.4") => (2.5, 15.0, 0.25, 0.0),
        ("openai", m) if m.contains("gpt-5.3-codex-spark") => (1.75, 14.0, 0.175, 0.0),
        ("openai", m) if m.contains("gpt-5.3-codex") => (1.75, 14.0, 0.175, 0.0),
        ("openai", m) if m.contains("gpt-5.2-pro") => (21.0, 168.0, 0.0, 0.0),
        ("openai", m) if m.contains("gpt-5.2-codex") => (1.75, 14.0, 0.175, 0.0),
        ("openai", m) if m.contains("gpt-5.2") => (1.75, 14.0, 0.175, 0.0),
        ("openai", m) if m.contains("gpt-5.1-codex-mini") => (0.25, 2.0, 0.025, 0.0),
        ("openai", m) if m.contains("gpt-5.1-codex") => (1.25, 10.0, 0.125, 0.0),
        ("openai", m) if m.contains("gpt-5.1") => (1.25, 10.0, 0.125, 0.0),
        ("openai", m) if m.contains("gpt-5-chat-latest") => (1.25, 10.0, 0.125, 0.0),
        ("openai", "o3-pro") => (20.0, 80.0, 0.0, 0.0),
        ("openai", m) if m.contains("o3-deep-research") => (10.0, 40.0, 2.5, 0.0),
        ("openai", "o3") => (2.0, 8.0, 0.5, 0.0),
        ("openai", m) if m.contains("o3-mini") => (1.1, 4.4, 0.55, 0.0),
        ("openai", m) if m.contains("o4-mini-deep-research") => (2.0, 8.0, 0.5, 0.0),
        ("openai", m) if m.contains("o4-mini") => (1.1, 4.4, 0.28, 0.0),
        ("openai", m) if m.contains("gpt-4.1-nano") => (0.1, 0.4, 0.025, 0.0),
        ("openai", m) if m.contains("gpt-4.1-mini") => (0.4, 1.6, 0.1, 0.0),
        ("openai", m) if m.contains("gpt-4.1") => (2.0, 8.0, 0.5, 0.0),
        ("openai", m) if m.contains("gpt-4o-mini") => (0.15, 0.6, 0.075, 0.0),
        ("openai", m) if m.contains("gpt-4o") => (2.5, 10.0, 1.25, 0.0),
        ("openai", m) if m.contains("gpt-4-turbo") => (10.0, 30.0, 10.0, 0.0),
        ("openai", m) if m.contains("gpt-4-") => (30.0, 60.0, 30.0, 0.0),
        ("openai", "gpt-4") => (30.0, 60.0, 30.0, 0.0),
        ("openai", m) if m.contains("gpt-3.5") => (0.5, 1.5, 0.5, 0.0),
        ("openai", m) if m.contains("codex-mini") => (1.5, 6.0, 0.375, 0.0),

        // ── Google Gemini family ────────────────────────────────────
        ("google", m) if m.contains("gemini-2.5-pro") => (1.25, 10.0, 0.31, 2.5),
        ("google", m) if m.contains("gemini-2.5-flash-lite") => (0.075, 0.3, 0.019, 0.15),
        ("google", m) if m.contains("gemini-2.5-flash") => (0.15, 0.6, 0.0375, 0.3),
        ("google", m) if m.contains("gemini-2.0-flash") => (0.1, 0.4, 0.025, 0.2),
        ("google", m) if m.contains("gemini-3-flash") => (0.1, 0.4, 0.025, 0.2),
        ("google", m) if m.contains("gemini-3-pro") => (1.25, 10.0, 0.31, 2.5),

        // ── Mistral ─────────────────────────────────────────────────
        ("mistral", m) if m.contains("codestral") => (0.3, 0.9, 0.0, 0.0),
        ("mistral", m) if m.contains("mistral-large") => (2.0, 6.0, 0.0, 0.0),
        ("mistral", m) if m.contains("mistral-small") => (0.2, 0.6, 0.0, 0.0),

        // ── DeepSeek ────────────────────────────────────────────────
        ("deepseek", m) if m.contains("deepseek-r1") => (0.55, 2.19, 0.14, 0.55),
        ("deepseek", m) if m.contains("deepseek-chat") => (0.14, 0.28, 0.014, 0.28),

        // ── NVIDIA-hosted / other catalog families ────────────────��─
        (_, m) if m.contains("minimax-m2.7") => (1.2, 6.0, 0.12, 0.0),

        _ => (0.0, 0.0, 0.0, 0.0),
    };

    Cost {
        input,
        output,
        cache_read,
        cache_write,
    }
}

/// Compute total USD cost for `usage` against `model.cost`. Returns `0.0`
/// when the model's cost is zero/unknown.
pub fn calculate_cost(model: &Model, usage: &Usage) -> f64 {
    cost_for(&model.cost, usage)
}

/// Variant that takes a bare `Cost` — useful when callers have rates but
/// not a full `Model`.
pub fn cost_for(cost: &Cost, usage: &Usage) -> f64 {
    let input = (cost.input / 1_000_000.0) * usage.input as f64;
    let output = (cost.output / 1_000_000.0) * usage.output as f64;
    let cache_read = (cost.cache_read / 1_000_000.0) * usage.cache_read as f64;
    let cache_write = (cost.cache_write / 1_000_000.0) * usage.cache_write as f64;
    input + output + cache_read + cache_write
}

/// Standard formatter used across CLI and desktop budget surfaces.
pub fn format_cost(cost: f64) -> String {
    if cost < 0.01 {
        format!("${:.4}", cost)
    } else if cost < 1.0 {
        format!("${:.3}", cost)
    } else {
        format!("${:.2}", cost)
    }
}
