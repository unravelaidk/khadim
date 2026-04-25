<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg" />
    <img src="assets/logo-light.svg" alt="Khadim Logo" width="128" height="128" />
  </picture>
</p>

<h1 align="center">Khadim</h1>

<p align="center">
  <strong>Open-source, local-first agentic automation platform — starting with a CLI coding agent.</strong>
</p>

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Khadim CLI is an AI coding agent that runs in your terminal. It reads your codebase, writes and executes code, understands what broke, rewrites, and retries — all locally on your machine.

> **Vision:** Khadim is evolving into a full agentic automation platform with a desktop app (Tauri), web control plane, and domain-agnostic agent engine. The CLI is the first working piece — proving the core agent loop, tool system, and multi-provider AI integration.

---

## Quick Start

```bash
# Install globally via npm
npm install -g @unravelai/khadim

# Or use the install script
curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash

# Start a session
khadim --prompt "summarize this repo"
```

**Binary downloads** are available on the [releases page](https://github.com/unravelaidk/khadim/releases) for `cli-v*` tags.

---

## Supported Providers

Bring your own API key for any of these providers. Khadim auto-detects keys from environment variables.

| Provider | API Key Env Var | Free Tier |
|----------|----------------|-----------|
| [OpenAI](https://platform.openai.com/) | `OPENAI_API_KEY` | — |
| [Anthropic](https://www.anthropic.com/) | `ANTHROPIC_API_KEY` | — |
| [OpenAI Codex](https://openai.com/codex) | `OPENAI_CODEX_TOKEN` | — |
| [GitHub Copilot](https://github.com/features/copilot) | `GITHUB_TOKEN` | — |
| [xAI Grok](https://x.ai/) | `XAI_API_KEY` | — |
| [Groq](https://groq.com/) | `GROQ_API_KEY` | ✅ |
| [Mistral](https://mistral.ai/) | `MISTRAL_API_KEY` | — |
| [Cerebras](https://cerebras.ai/) | `CEREBRAS_API_KEY` | — |
| [HuggingFace](https://huggingface.co/) | `HF_TOKEN` | ✅ |
| [OpenRouter](https://openrouter.ai/) | `OPENROUTER_API_KEY` | ✅ |
| [Google Gemini](https://aistudio.google.com/) | `GEMINI_API_KEY` | ✅ |
| [Google Vertex AI](https://cloud.google.com/vertex-ai) | `GOOGLE_CLOUD_API_KEY` | — |
| [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) | `AZURE_OPENAI_API_KEY` | — |
| [Amazon Bedrock](https://aws.amazon.com/bedrock/) | AWS credentials | — |
| [OpenCode Zen](https://opencode.ai/) | `OPENCODE_API_KEY` | — |
| [Kimi Coding](https://www.moonshot.cn/) | `KIMI_API_KEY` | — |
| [MiniMax](https://www.minimax.io/) | `MINIMAX_API_KEY` | — |
| [Z.ai](https://z.ai/) | `ZAI_API_KEY` | — |
| [NVIDIA NIM](https://build.nvidia.com/) | `NVIDIA_API_KEY` | ✅ |

> **Any OpenAI-compatible API** works — set `OPENAI_BASE_URL` to point to your endpoint. Override the default provider and model with `KHADIM_PROVIDER` and `KHADIM_MODEL`.

### Recommended Models

| Model | Provider | Tier |
|-------|----------|------|
| Claude Opus 4.7 | Anthropic | 💎 Premium |
| GPT-5.5 | OpenAI | 💎 Premium |
| Claude Sonnet 4.6 | Anthropic | 💎 Premium |
| Gemini 2.5 Pro | Google | ⭐ Standard |
| Grok 4 | xAI | ⭐ Standard |
| Codestral | Mistral | ⭐ Standard |
| DeepSeek V4 Pro | OpenCode Go | 🆓 Open Source |
| Kimi K2.6 | OpenCode Go | 🆓 Open Source |
| GLM-4.7 | Z.ai | 🆓 Open Source |
| Llama 3.3 70B | Groq | ⚡ Fast |
| DevStral Free | OpenRouter | 🆓 Free |
| DeepSeek Chat Free | OpenRouter | 🆓 Free |

---

## Usage

```bash
# Prompt mode
khadim --prompt "fix the lint errors in src/"

# Headless exec mode
khadim exec "summarize failures" < build.log

# Pipe stdin as context
echo "error: timeout on line 42" | khadim --prompt "fix this"

# Run in a specific directory
khadim --cwd /path/to/project --prompt "add unit tests"
```

The agent discovers `AGENTS.md` files in the workspace and injects scoped instructions into the system prompt.

---

## Repository Layout

```
apps/
  khadim-cli/       # ✅ CLI coding agent (Rust) — working today
  web/              # 🚧 Web application (React Router + Express)
  desktop/          # 🚧 Desktop app (Tauri + React)
crates/
  khadim-ai-core/   # AI provider integrations and model registry
  khadim-coding-agent/  # Agent loop, tools, and orchestration
packages/           # Shared workspace packages
```

---

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) ≥ 18

### Build the CLI

```bash
git clone https://github.com/unravelaidk/khadim.git
cd khadim

# Build and run
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "hello"

# Release build
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
```

### Common Commands

| Command | Description |
|---------|-------------|
| `cargo run -p khadim-cli` | Run the CLI agent |
| `cargo build -p khadim-cli` | Build the CLI |
| `cargo test` | Run all Rust tests |
| `npm run dist:bin` | Build distributable binaries (from `apps/khadim-cli/`) |

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `cargo test` to verify
4. Submit a pull request

---

## License

[AGPL-3.0-only](LICENSE)
