---
title: Configuration
description: Environment variables, provider credentials, settings, and workspace instructions.
---

Khadim reads configuration from command-line options, environment variables,
the interactive settings file, and workspace instruction files. Command-line
options apply to one run. Settings and environment variables persist outside a
single run.

## Provider defaults

Set the default provider and model:

```bash
export KHADIM_PROVIDER=anthropic
export KHADIM_MODEL=claude-sonnet-4
```

Override either value for one run:

```bash
khadim --provider openai --model gpt-4.1-mini
```

## Provider credentials

Khadim reads provider API keys from standard environment variables.

| Provider | Environment variable |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Copilot | `GITHUB_TOKEN` or `GH_TOKEN` |
| Codex | `OPENAI_CODEX_API_KEY` or `OPENAI_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| HuggingFace | `HF_TOKEN` |
| NVIDIA | `NVIDIA_API_KEY` |
| Kimi | `KIMI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Z.AI | `ZAI_API_KEY` |
| OpenCode | `OPENCODE_API_KEY` |

`KHADIM_API_KEY` is a universal fallback for providers that can use a single
generic key.

## OpenAI-compatible endpoints

Point OpenAI-compatible providers at a custom base URL:

```bash
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=local
khadim --provider openai
```

## Interactive settings

Open settings inside the terminal UI:

```text
/settings
```

You can also press `F2`. The settings panel can store provider, model, API key,
theme, and related preferences.

Use `/config` to print the config directory path. The terminal settings file is
stored under the Khadim config directory.

## OAuth providers

Some providers use OAuth instead of API keys. Start login from the terminal UI:

```text
/login
```

Copilot and Codex are the primary OAuth-backed providers.

## Workspace instructions

Khadim discovers `AGENTS.md` files in the workspace. Use them for durable local
instructions:

```md
# Agent instructions

- Run `cargo test` after Rust changes.
- Keep generated files out of manual edits.
- Ask before changing database migrations.
```

Nested `AGENTS.md` files apply to files under their directory scope.

## Update checks

Disable the npm update prompt:

```bash
export KHADIM_NO_UPDATE_CHECK=1
```
