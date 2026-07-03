<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg" />
    <img src="assets/logo-light.svg" alt="Khadim Logo" width="128" height="128" />
  </picture>
</p>

<h1 align="center">Khadim</h1>

<p align="center">
  <strong>Open-source, local-first agentic automation.</strong>
</p>

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Khadim is an open-source automation platform where agents write and run the
automation scripts they need. Instead of assembling fixed RPA blocks, you give
Khadim a task; the agent inspects the workspace or screen, calls tools, fixes
failures, and retries.

The CLI coding agent is the working entry point today. The desktop app, web
control plane, RPA tools, Docker runtime, and plugin system are being built
around the same agent engine and event stream.

## Highlights

- A local-first CLI agent for codebase tasks, scripts, and batch automation.
- Interactive terminal UI with streaming text, tool progress, slash commands,
  saved sessions, and provider/model switching.
- Headless `exec` and `--prompt` modes for scripts, CI, and service
  integration.
- RPA harness preview with screen-aware tools and a local Qwen VLA experiment.
- 19+ AI providers, including OpenAI, Anthropic, Gemini, Groq, xAI,
  OpenRouter, Mistral, Cerebras, Copilot, Codex, and local-compatible options.
- A typed SDK and JSON-line event stream for embedding Khadim in Node.js apps.
- A WASM plugin system for sandboxed, user-extensible tools.
- A Tauri desktop app and React Router web app that share the same platform
  direction.

## Installation

Install the CLI with npm:

```bash
npm install -g @unravelai/khadim
```

Or use the installer script:

```bash
curl -fsSL https://raw.githubusercontent.com/unravelaidk/khadim/main/apps/khadim-cli/scripts/install.sh | bash
```

Prebuilt binaries are available from the
[GitHub releases page](https://github.com/unravelaidk/khadim/releases) for
`cli-v*` tags.

## Documentation

The documentation site is available at
[unravelaidk.github.io/khadim](https://unravelaidk.github.io/khadim/).

Useful starting points:

- [Installation](https://unravelaidk.github.io/khadim/getting-started/installation/)
- [First steps](https://unravelaidk.github.io/khadim/getting-started/first-steps/)
- [CLI overview](https://unravelaidk.github.io/khadim/cli/overview/)
- [Plugin SDK](https://unravelaidk.github.io/khadim/plugins/overview/)
- [Configuration reference](https://unravelaidk.github.io/khadim/reference/configuration/)

You can run the docs locally:

```bash
bun run docs:dev
```

## Features

### Interactive CLI

Start the terminal UI in the current project:

```bash
khadim
```

Then ask for work in natural language:

```text
summarize this repo
fix the failing tests
add unit tests for the auth service
```

Type `/` to browse commands such as `/help`, `/provider`, `/model`,
`/sessions`, `/harness`, `/settings`, and `/tokens`.

### Headless runs

Run one task without opening the terminal UI:

```bash
khadim --prompt "explain this codebase"
khadim exec "summarize failures" < build.log
khadim --cwd /path/to/project --prompt "add missing tests"
```

Use `--json` with `exec` to stream structured events:

```bash
khadim exec --json "summarize this repo"
```

### Agent modes and harnesses

Khadim can run different harnesses from the same CLI:

```bash
khadim --harness coding
khadim rpa exec "inspect the current screen"
khadim assistant
```

The coding harness is the stable path. The RPA and assistant harnesses are
active development surfaces for desktop automation and general agent runs.

### Providers

Khadim reads provider credentials from environment variables and from the
interactive settings panel.

```bash
export ANTHROPIC_API_KEY=...
export KHADIM_PROVIDER=anthropic
export KHADIM_MODEL=claude-sonnet-4

khadim
```

List provider and model metadata from the CLI:

```bash
khadim --providers
khadim --models anthropic
```

### SDK and event stream

Install the npm package in a Node.js project:

```bash
npm install @unravelai/khadim
```

Run the agent from TypeScript:

```ts
import { runAgentStream } from "@unravelai/khadim";

for await (const event of runAgentStream({
  prompt: "Summarize this repository.",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
})) {
  if (event.event_type === "text_delta") {
    process.stdout.write(event.content ?? "");
  }
}
```

The SDK consumes the same normalized event stream used by the CLI, desktop app,
and web app: `text_delta`, `step_start`, `step_update`, `step_complete`,
`question`, `done`, and `error`.

### Plugins

Khadim plugins are sandboxed WebAssembly modules that expose tools to the
agent. A plugin can request filesystem, HTTP, persistent store, and desktop UI
capabilities through its manifest.

```toml
[plugin]
name = "my-plugin"
version = "0.1.0"
description = "Adds one custom tool"
wasm = "plugin.wasm"

[permissions]
fs = false
http = true
store = false
```

See the [Plugin SDK documentation](https://unravelaidk.github.io/khadim/plugins/overview/)
for the full workflow.

## Platform direction

Khadim is organized around one shared agent engine:

```text
Desktop app (Tauri)          Web app (React Router + Express)       CLI / SDK
        |                              |                                |
        +------------------------------+--------------------------------+
                                       |
                                Agent engine
                         LLM -> plan -> tools -> loop
                                       |
                                Tool domains
                  coding, RPA, connectors, plugins, runners
```

Current repository areas:

| Path | Status | Purpose |
| ---- | ------ | ------- |
| `apps/khadim-cli` | Working | CLI coding agent and npm package |
| `crates/khadim-ai-core` | Working | Provider integrations and model registry |
| `crates/khadim-coding-agent` | Working | Agent loop, tool orchestration, sessions |
| `apps/desktop` | In progress | Tauri app for local automation |
| `apps/web` | In progress | Web control plane and team workflows |
| `apps/docs` | Working | Astro Starlight documentation site |
| `docs` | Planning | Architecture notes and implementation plans |

## Development

Prerequisites:

- [Rust](https://rustup.rs/) latest stable
- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/) 18 or newer, for npm package consumers

Clone and run the CLI:

```bash
git clone https://github.com/unravelaidk/khadim.git
cd khadim

cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "hello"
```

Common commands:

| Command | Description |
| ------- | ----------- |
| `cargo test` | Run Rust tests |
| `bun run test` | Run workspace tests that expose a test script |
| `bun run docs:dev` | Start the docs site |
| `bun run docs:build` | Build the docs site |
| `bun run desktop:dev` | Start the desktop app |
| `bun --filter @khadim/web dev` | Start the web app |

## FAQ

### Is Khadim only a coding agent?

No. The CLI coding agent is the first stable surface. The platform direction is
local-first RPA and agentic automation across CLI, desktop, web, Docker, and
plugins.

### Does Khadim run locally?

Yes. Khadim runs locally and calls the provider you configure. Your workspace
tools execute on your machine unless you opt into a remote or containerized
runner.

### What license does Khadim use?

Khadim is licensed under [AGPL-3.0-only](LICENSE).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
project workflow, coding expectations, and pull request process.
