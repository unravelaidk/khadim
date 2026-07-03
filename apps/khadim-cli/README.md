# khadim-cli

`khadim-cli` is the terminal entry point for Khadim, an open-source,
local-first agentic automation platform. It runs an AI coding agent in your
terminal, supports headless automation, and exposes the same event stream used
by the SDK, desktop app, and web app.

## Installation

Install globally:

```bash
npm install -g @unravelai/khadim
```

The package exposes both commands:

```bash
khadim
khadim-cli
```

Use it as an SDK dependency:

```bash
npm install @unravelai/khadim
```

## Documentation

Read the full documentation at
[unravelaidk.github.io/khadim](https://unravelaidk.github.io/khadim/).

Useful pages:

- [Installation](https://unravelaidk.github.io/khadim/getting-started/installation/)
- [First steps](https://unravelaidk.github.io/khadim/getting-started/first-steps/)
- [CLI overview](https://unravelaidk.github.io/khadim/cli/overview/)
- [Khadim SDK](https://unravelaidk.github.io/khadim/cli/sdk/)
- [Commands](https://unravelaidk.github.io/khadim/reference/commands/)

## Usage

Start the interactive terminal UI:

```bash
khadim
```

Run one prompt without the UI:

```bash
khadim --prompt "summarize this repo"
```

Use `exec` for script-friendly runs:

```bash
khadim exec "summarize failures" < build.log
khadim exec --json "explain this repository"
```

Select a different working directory:

```bash
khadim --cwd /path/to/project
```

Type `/` in the terminal UI to browse commands such as `/help`, `/provider`,
`/model`, `/sessions`, `/settings`, `/harness`, and `/tokens`.

## Providers

Khadim reads provider credentials from environment variables or from the
interactive settings panel.

```bash
export ANTHROPIC_API_KEY=...
export KHADIM_PROVIDER=anthropic
khadim
```

List providers and models:

```bash
khadim --providers
khadim --models anthropic
```

## RPA preview

The CLI includes preview harnesses for desktop and assistant automation:

```bash
khadim rpa exec "inspect the current screen"
khadim assistant
```

The coding harness is the stable path. RPA tooling is under active development.

## Development

From the repository root:

```bash
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "hello"
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
```

From this package directory:

```bash
npm run dev -- --prompt "hello"
npm run build:release
npm run dist:bin
```
