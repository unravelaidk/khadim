# khadim-cli

An AI coding agent that runs in your terminal.

`khadim-cli` reads your repository, edits files, runs shell commands, inspects
test failures, uses project instructions, and streams every step back to you.
It is the stable coding-focused entry point for Khadim.

## Highlights

- Interactive terminal UI for coding tasks in the current repository.
- Headless `exec` and `--prompt` modes for scripts, CI, and batch jobs.
- File read, write, edit, grep, shell, git, web search, and delegation tools.
- Live tool progress with `text_delta`, `step_start`, `step_update`,
  `step_complete`, `question`, `done`, and `error` events.
- Session save, load, switch, rename, and delete commands.
- `AGENTS.md` discovery for repository-specific instructions.
- Provider and model switching across OpenAI, Anthropic, Gemini, Groq, xAI,
  OpenRouter, Mistral, Copilot, Codex, Cerebras, and more.
- OAuth login for supported coding providers such as Copilot and Codex.
- TypeScript SDK entry points for embedding the same coding agent in apps.

## Installation

Install the CLI globally:

```bash
npm install -g @unravelai/khadim
```

The npm package exposes both commands:

```bash
khadim
khadim-cli
```

Install it as an SDK dependency:

```bash
npm install @unravelai/khadim
```

Prebuilt binaries are also available from the
[Khadim releases page](https://github.com/unravelaidk/khadim/releases) for
`cli-v*` tags.

## Documentation

The full documentation is available at
[unravelaidk.github.io/khadim](https://unravelaidk.github.io/khadim/).

Useful pages for coding-agent workflows:

- [First steps](https://unravelaidk.github.io/khadim/getting-started/first-steps/)
- [CLI overview](https://unravelaidk.github.io/khadim/cli/overview/)
- [Commands](https://unravelaidk.github.io/khadim/reference/commands/)
- [Configuration](https://unravelaidk.github.io/khadim/reference/configuration/)
- [Khadim SDK](https://unravelaidk.github.io/khadim/cli/sdk/)

The command reference for your installed version is available locally:

```bash
khadim --help
```

## Coding workflows

Run `khadim` from a repository and ask for coding work in natural language.
The agent can inspect files, run commands, edit code, and verify the result.

```bash
cd /path/to/project
khadim
```

Example prompts:

```text
summarize this repository
find the failing tests and fix the smallest issue
add unit tests for the auth service
refactor this module without changing behavior
explain the git diff before I commit it
```

Type `/` in the terminal UI to browse commands such as `/help`, `/provider`,
`/model`, `/sessions`, `/settings`, `/harness`, and `/tokens`.

## Headless coding runs

Use `--prompt` when you want one non-interactive coding task:

```bash
khadim --prompt "find the test command and run the smallest useful test"
```

Use `exec` when Khadim is part of a script or pipeline:

```bash
khadim exec "summarize failures and suggest a fix" < build.log
```

Stream machine-readable events with `--json`:

```bash
khadim exec --json "review this repository for obvious test gaps"
```

Run against a different repository:

```bash
khadim --cwd /path/to/project --prompt "summarize the public API"
```

## Project instructions

Add an `AGENTS.md` file to teach Khadim how to work in your repository.
Khadim loads the relevant instructions before it starts a coding task.

```md
# Agent instructions

- Use `cargo test` for Rust changes.
- Keep generated files out of manual edits.
- Run the smallest useful test before broad test suites.
```

Nested `AGENTS.md` files apply to files under their directory scope.

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

Use OAuth-backed coding providers from the terminal UI:

```text
/login
```

## SDK

Use the package from TypeScript when you want the same coding agent inside an
application, service, or CI job.

```ts
import { runAgentStream } from "@unravelai/khadim";

for await (const event of runAgentStream({
  prompt: "Explain the failing tests in this repository.",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
})) {
  if (event.event_type === "text_delta") {
    process.stdout.write(event.content ?? "");
  }
}
```

## RPA preview

The CLI also includes preview harnesses for desktop and assistant automation.
The coding harness is the stable path.

```bash
khadim rpa exec "inspect the current screen"
khadim assistant
```

## Development

Build and run the CLI from the repository root:

```bash
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "hello"
cargo build --release --manifest-path apps/khadim-cli/Cargo.toml
```

Run package scripts from this directory:

```bash
npm run dev -- --prompt "hello"
npm run build:release
npm run dist:bin
```
