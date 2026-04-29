---
title: CLI Overview
description: The Khadim CLI coding agent — an interactive terminal AI assistant and batch automation tool.
---

The Khadim CLI (`khadim-cli`) is a terminal-based coding agent. It connects to 19+ LLM providers, runs autonomously with tool access (file I/O, shell, web search, git), and supports both interactive TUI and headless batch modes.

## Installation

Install globally via npm:

```bash
npm install -g @unravelai/khadim
```

Or with bun:

```bash
bun install -g @unravelai/khadim
```

The package auto-detects your platform (Linux x64/arm64, macOS x64/arm64) and downloads the correct native binary. Re-run the install command to upgrade.

## Interactive mode (default)

Launch the TUI by running `khadim` with no arguments:

```bash
khadim
```

The interactive mode provides:

- Multi-line chat input with history navigation
- Live streaming of agent responses and tool execution
- Slash commands for session management, settings, and more (type `/` to preview)
- Settings panel (F2) for provider, model, theme, and API key configuration
- OAuth login flow for Copilot and Codex
- Session persistence — save, load, rename, and switch between sessions

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Enter | Send message |
| Shift+Enter / Ctrl+J | Insert newline |
| Tab | Accept command suggestion / cycle agent mode |
| Escape | Abort agent / close overlay |
| Ctrl+C | Quit (confirm if agent is running) |
| Ctrl+L | Clear session |
| Ctrl+K | Clear input |
| Ctrl+O | Toggle tool output collapse |
| F2 | Settings panel |
| PageUp / PageDown | Scroll transcript |

## Batch mode

Run a single prompt non-interactively by passing `--prompt`:

```bash
khadim --prompt "explain this codebase"
```

Or use the `exec` subcommand (supports piped stdin):

```bash
echo "summarize the README" | khadim exec
khadim exec "write a function that checks if a number is prime" --json
```

### Programmatic output

The `--json` flag switches to machine-readable JSON-line output. Each line is a structured event:

```json
{"event_type":"text_delta","content":"Here's the function..."}
{"event_type":"step_start","content":"Running read_file","metadata":{"tool":"read_file"}}
{"event_type":"step_complete","content":"file contents","metadata":{"tool":"read_file"}}
{"event_type":"done"}
```

This is the format consumed by the [programmatic API](/khadim/cli/programmatic-api/).

## Configuration

### CLI flags

| Flag | Description |
|------|-------------|
| `--cwd PATH` | Set working directory |
| `--prompt TEXT` | Run in batch mode (`-` reads stdin) |
| `--provider NAME` | Set AI provider |
| `--model ID` | Set AI model |
| `--session NAME` | Load a saved session |
| `--system-prompt TEXT` | Override the system prompt |
| `--json` | Output machine-readable JSON events |
| `--providers [format]` | List available providers (JSON or plain) |
| `--models PROVIDER` | List models for a provider |
| `--verbose` | Enable verbose logging |

### Environment variables

API keys are read from standard environment variables:

| Provider | Env Var |
|----------|---------|
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

The universal fallback `KHADIM_API_KEY` works across all providers.

Set the default provider and model:

```bash
export KHADIM_PROVIDER=anthropic
export KHADIM_MODEL=claude-sonnet-4
```

### Persistent settings

The TUI settings panel (F2) saves provider, model, API keys, and theme preferences to `~/.config/khadim/settings.json`.

## Provider support

The CLI supports 19+ providers across major AI vendors. Use `khadim --providers` to list all available providers, and `khadim --models <provider>` to see models.

### OAuth providers

GitHub Copilot and OpenAI Codex use OAuth device-code flow instead of API keys. Run `khadim` interactively and use `/login` to authenticate, or press F2 to open settings and select one of these providers.

## Docker (coming soon)

Docker support is under active development. A pre-built `khadim-cli` image will let you run the agent in containers without installing any native binary — ideal for server deployments, CI/CD pipelines, and embedding into web applications. See the [programmatic API](/khadim/cli/programmatic-api/#docker-integration) for the planned integration pattern.
