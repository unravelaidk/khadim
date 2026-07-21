---
title: CLI overview
description: Interactive terminal assistance and headless batch automation with Khadim CLI.
---

The Khadim CLI is the stable entry point for the Khadim platform. It connects
to 19+ LLM providers, gives the agent tool access, and supports both an
interactive terminal UI and headless batch runs.

## Installation

Install globally via npm:

```bash
npm install -g @unravelai/khadim
```

Or with bun:

```bash
bun install -g @unravelai/khadim
```

The package auto-detects your platform (Linux x64/arm64 or macOS x64/arm64)
and downloads the correct native binary. Re-run the install command to
upgrade.

See [Installation](../getting-started/installation/) for release downloads,
installer script usage, and source builds.

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
| --- | --- |
| `Enter` | Send message |
| `Shift+Enter` | Insert newline |
| `Tab` | Accept command suggestion |
| `Escape` | Abort agent or close overlay |
| `Ctrl+C` | Quit |
| `Ctrl+L` | Clear session |
| `Ctrl+K` | Clear input |
| `Ctrl+O` | Toggle tool output |
| `F2` | Open settings |
| `PageUp` / `PageDown` | Scroll transcript |

See [Commands](../reference/commands/) for the full slash command and shortcut
reference.

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

This is the same event stream the [Khadim SDK](./sdk/) consumes. Anything you
can read from `--json` you can wire into your own app.

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
| `--harness NAME` | Select `coding`, `rpa`, `assistant`, or a custom harness |
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

The universal fallback `KHADIM_API_KEY` works across providers that can use a
single generic key.

Set the default provider and model:

```bash
export KHADIM_PROVIDER=anthropic
export KHADIM_MODEL=claude-sonnet-4
```

### Persistent settings

The TUI settings panel (`F2`) and `khadim config` save provider, model, API
keys, and related preferences to `cli-settings.json` in the Khadim config
directory.

Configure search and plugins without opening the TUI:

```bash
khadim search providers
khadim plugin list
```

See [Configuration](../reference/configuration/) for persistent provider,
credential, search, and plugin commands.

## Provider support

The CLI supports 19+ providers across major AI vendors. Use
`khadim --providers` to list all available providers and
`khadim --models <provider>` to see models.

### OAuth providers

GitHub Copilot and OpenAI Codex use OAuth device-code flow instead of API keys.
Run `khadim` interactively and use `/login` to authenticate, or press `F2` to
open settings and select one of these providers.

## Harnesses

Khadim can run multiple harnesses from the same CLI:

```bash
khadim --harness coding
khadim rpa exec "inspect the current screen"
khadim assistant
```

The coding harness is the mature path. The RPA and assistant harnesses are
active development surfaces for desktop automation and general agent runs.

## Docker runtime preview

Docker support is under active development. A `khadim-cli` image will let you
run the agent in containers without installing a native binary on the host. See
[Docker Agent Runtime](../reference/docker-agent-runtime/) for the planned
integration pattern.
