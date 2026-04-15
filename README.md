<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg" />
    <img src="assets/logo-light.svg" alt="Khadim Logo" width="128" height="128" />
  </picture>
</p>

<h1 align="center">Khadim</h1>

<p align="center">
  <strong>Open-source, local-first agentic automation platform.</strong>
</p>

Khadim uses AI coding agents to write and execute automation scripts on the fly. Instead of pre-built RPA blocks, agents can see what's happening, understand what broke, rewrite the script, and retry — all locally on your machine.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is Khadim?

Khadim is a monorepo containing a **web app**, a **desktop app**, and shared packages that power an agentic automation platform.

- **Chat-driven automation** — describe tasks in plain English, let agents write and run the scripts
- **Local-first** — everything runs on your machine; Docker sandboxing for headless execution
- **Domain-agnostic agent engine** — the same orchestrator handles coding tools, RPA tools, browser automation, connectors, and custom WASM plugins
- **Desktop native** — Tauri-based app with a real terminal, file finder, structured git diffs, and approval overlays
- **Web control plane** — deploy managed agents, monitor runs, collaborate with your team

### Target Users

| Tier | Description |
|------|-------------|
| **Simple users** | Chat interface, plain English tasks |
| **Power users** | Multi-step automations, triggers, agent configuration |
| **Enterprise** | Managed agent fleet, audit trail, team dashboards |

## Repository Layout

```
apps/
  web/              # React Router + Express web application
  desktop/          # Tauri desktop application (Rust + React)
  firecracker-sandbox/  # Sandbox tooling for isolated execution
packages/           # Shared workspace packages
examples/           # Example plugins and integrations
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- [Rust](https://rustup.rs/) (for the desktop app)
- [Node.js](https://nodejs.org/) ≥ 20
- Docker (optional, for sandboxed execution)

### Setup

```bash
# Clone the repo
git clone https://github.com/unravel-ai/khadim.git
cd khadim

# Install dependencies
bun install

# Run the web app in development
bun run dev

# Run the desktop app in development
bun run desktop:dev
```

### Common Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install all workspace dependencies |
| `bun run dev` | Start the web app dev server |
| `bun run build` | Build all packages |
| `bun run test` | Run tests across the monorepo |
| `bun run typecheck` | Type-check the web app |
| `bun run desktop:dev` | Start the Tauri desktop app in dev mode |
| `bun run desktop:build` | Build the desktop app for production |
| `bun run plugins:build` | Build all WASM plugins |
| `bun run db:generate` | Generate database migrations |
| `bun run db:migrate` | Run database migrations |

## Supported Providers

Khadim supports **19 LLM providers** out of the box. Bring your own API key, or run models locally with Ollama.

### Cloud Providers

| Provider | API Key Env Var | Notes |
|----------|----------------|-------|
| [OpenAI](https://platform.openai.com/) | `OPENAI_API_KEY` | GPT-4o, GPT-4o Mini, o1, and more |
| [Anthropic](https://www.anthropic.com/) | `ANTHROPIC_API_KEY` | Claude Sonnet 4, Claude 3.5 Haiku |
| [OpenAI Codex](https://openai.com/codex) | `OPENAI_CODEX_API_KEY` | GPT-5.3 Codex, GPT-5.2 Codex (requires ChatGPT Plus/Pro) |
| [xAI (Grok)](https://x.ai/) | `XAI_API_KEY` | Grok 4, Grok 3 |
| [Groq](https://groq.com/) | `GROQ_API_KEY` | Llama 3.3 70B — ultra-fast inference |
| [Mistral](https://mistral.ai/) | `MISTRAL_API_KEY` | Mistral Large, Codestral |
| [Cerebras](https://cerebras.ai/) | `CEREBRAS_API_KEY` | Fast inference on custom silicon |
| [MiniMax](https://www.minimax.io/) | `MINIMAX_API_KEY` | MiniMax models |
| [Z.ai](https://z.ai/) | `ZAI_API_KEY` | Z.ai models |
| [Kimi Coding](https://www.moonshot.cn/) | `KIMI_API_KEY` | Moonshot / Kimi coding models |
| [HuggingFace](https://huggingface.co/) | `HUGGINGFACE_API_KEY` | Inference API — thousands of open models |
| [OpenCode Zen](https://opencode.ai/) | `OPENCODE_API_KEY` | OpenCode Zen models |
| [OpenCode Go](https://opencode.ai/) | `OPENCODE_API_KEY` | OpenCode Go models |

### Aggregators & Gateways

| Provider | API Key Env Var | Notes |
|----------|----------------|-------|
| [OpenRouter](https://openrouter.ai/) | `OPENROUTER_API_KEY` | Access 200+ models including free tiers (DevStral Free, Qwen 3 32B Free, DeepSeek Chat Free) |
| [Vercel AI Gateway](https://vercel.com/) | — | Requires custom base URL |

### Enterprise / Cloud Platform

| Provider | API Key Env Var | Notes |
|----------|----------------|-------|
| [Amazon Bedrock](https://aws.amazon.com/bedrock/) | — | AWS credentials, requires custom base URL |
| [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) | `AZURE_OPENAI_API_KEY` | Requires custom base URL |
| [GitHub Copilot](https://github.com/features/copilot) | — | Uses Copilot authentication |

### Local / Self-Hosted

| Provider | API Key Env Var | Notes |
|----------|----------------|-------|
| [Ollama](https://ollama.ai/) | — | Run models locally — Llama 3.1, CodeGemma, DeepSeek Coder, and any GGUF model |

### Recommended Models

| Model | Provider | Tier |
|-------|----------|------|
| DevStral Free | OpenRouter | 🆓 Free |
| Qwen 3 32B Free | OpenRouter | 🆓 Free |
| DeepSeek Chat Free | OpenRouter | 🆓 Free |
| Claude Sonnet 4 | Anthropic | 💎 Premium |
| GPT-5.3 Codex | OpenAI Codex | 💎 Premium |
| Grok 4 | xAI | 💎 Premium |
| GPT-4o | OpenAI | ⭐ Standard |
| Llama 3.3 70B | Groq | ⚡ Fast |
| Codestral | Mistral | ⭐ Standard |
| Llama 3.1 | Ollama | 🏠 Local |

> **Any OpenAI-compatible API** works as a provider. Set a custom base URL in settings to connect to any compatible endpoint.

## Architecture

### Agent Engine

The core agent loop lives in the shared orchestrator (`khadim_agent`):

```
LLM → plan → call tools → observe → loop
```

The engine is domain-agnostic. Tools are organized into pluggable domains:

- **`domains/coding`** — file read/write, shell, grep, LSP, git
- **`domains/rpa`** — screenshot, OCR, mouse/keyboard, browser automation
- **`domains/connectors`** — email, spreadsheet, HTTP, file operations
- **`plugins/`** — user-extensible WASM tools

### Desktop App

Built with Tauri (Rust backend + React frontend):

- Native PTY terminal
- Fuzzy file finder
- Structured git diff workspace
- Agent approval / question overlays
- Worktree-aware context switching
- OpenCode and Claude Code backend support

### Web App

Built with React Router + Express:

- Hono RPC typed API layer
- WebSocket live event streaming
- Redis-backed snapshot + replay reconnection
- Session management and agent orchestration

## Contributing

We welcome contributions of all kinds! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick start for contributors:**

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `bun run test` and `bun run typecheck`
4. Submit a pull request

### Good First Issues

Look for issues tagged [`good first issue`](https://github.com/unravel-ai/khadim/labels/good%20first%20issue) — these are curated entry points for new contributors.

### Areas Where Help Is Appreciated

- 🖥️ **Desktop app** — Tauri/Rust, native workspace tools, terminal, file finder
- 🌐 **Web app** — React Router, Hono RPC, WebSocket transport
- 🤖 **Agent engine** — tool domains, orchestration, prompt engineering
- 🔌 **Plugins** — WASM plugin system, new connectors, new tool domains
- 🐳 **Docker runtime** — sandbox images, isolation, container lifecycle
- 📖 **Documentation** — guides, tutorials, API docs
- 🧪 **Testing** — unit tests, integration tests, E2E tests
- 🎨 **Design** — UI/UX improvements, accessibility, responsive layouts

## Design Documents

- [Desktop Design Document](apps/desktop/DESIGN.md) — full product design, data model, and component plan
- [Agent Transport Context](AGENTS.md) — RPC migration, WebSocket transport, and architecture decisions

## Community

- **Issues** — [Report bugs or request features](https://github.com/unravel-ai/khadim/issues)
- **Discussions** — [Ask questions and share ideas](https://github.com/unravel-ai/khadim/discussions)
- **Pull Requests** — [Contribute code](https://github.com/unravel-ai/khadim/pulls)

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

You are free to use, modify, and distribute Khadim. If you run a modified version as a network service, you must make the source code available to users of that service.

Copyright © 2024–2026 Unravel AI and contributors.
