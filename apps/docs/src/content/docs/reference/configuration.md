---
title: Configuration
description: Environment variables, provider credentials, settings, and workspace instructions.
---

Khadim reads configuration from command-line options, environment variables,
the interactive settings file, and workspace instruction files. Command-line
options apply to one run. Settings and environment variables persist outside a
single run.

## Provider defaults

Set the default provider and model from the CLI settings file:

```bash
khadim config set provider anthropic
khadim config set model claude-sonnet-4
```

You can also set environment defaults:

```bash
export KHADIM_PROVIDER=anthropic
export KHADIM_MODEL=claude-sonnet-4
```

Override either value for one run:

```bash
khadim --provider openai --model gpt-4.1-mini
```

## Provider credentials

Store a provider credential without opening the TUI:

```bash
printf '%s' "$ANTHROPIC_API_KEY" | \
  khadim config set api-key anthropic --stdin
```

Using `--stdin` keeps the key out of shell history and process arguments.
Khadim also reads provider API keys from standard environment variables.

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

## CLI and interactive settings

Inspect the settings available to non-interactive CLI runs:

```bash
khadim config show
khadim config path
```

Open the same core provider settings inside the terminal UI:

```text
/settings
```

You can also press `F2`. The settings panel can store provider, model, API key,
theme, and related preferences. The terminal settings file is named
`cli-settings.json` under the Khadim config directory. Khadim protects the
directory and file with user-only permissions on supported platforms.

Use `/config` to print the config directory path from the interactive TUI.

## Web-search configuration

Select and configure the web-search tool entirely from the CLI:

```bash
khadim search providers
printf '%s' "$PARALLEL_API_KEY" | \
  khadim search set-key parallel --stdin
khadim search use parallel
```

`--search-provider NAME` remains a one-run override. Without the flag, runs use
the provider saved by `khadim search use`.

## Plugin configuration

Khadim stores installed plugins under its platform data directory and keeps
enabled state and configuration in a private CLI plugin settings file.

```bash
khadim plugin dir
khadim plugin install ./automation-plugin
khadim plugin config set automation-plugin endpoint https://api.example.com
khadim plugin tools
```

For secret fields, pipe the value to `--stdin`. `plugin list`, `plugin inspect`,
and JSON output report only whether each field is configured.

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
