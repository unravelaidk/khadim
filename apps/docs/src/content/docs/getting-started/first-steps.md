---
title: First steps
description: Run your first Khadim session, configure a provider, and execute a headless prompt.
---

This guide walks through the fastest path from an installed CLI to a working
agent run. You will configure a provider, start the terminal UI, and run a
headless command.

## Configure a provider

Set an API key for one provider. For example, with Anthropic:

```bash
export ANTHROPIC_API_KEY=...
export KHADIM_PROVIDER=anthropic
```

Or use OpenAI:

```bash
export OPENAI_API_KEY=...
export KHADIM_PROVIDER=openai
```

You can also configure providers from the interactive settings panel after
starting the terminal UI.

## Start the terminal UI

Open a project directory and run Khadim:

```bash
cd /path/to/project
khadim
```

Ask a direct question first:

```text
summarize this repository
```

Then ask Khadim to inspect or change code:

```text
find the test command and run the smallest useful test
```

Type `/` to open command suggestions. Common commands include `/help`,
`/provider`, `/model`, `/sessions`, `/settings`, `/tokens`, and `/export`.

## Run one headless task

Use `--prompt` when you want one answer and no terminal UI:

```bash
khadim --prompt "explain the architecture of this repository"
```

Use `exec` when you want a script-friendly command:

```bash
khadim exec "summarize failures" < build.log
```

Append `--json` to stream structured events:

```bash
khadim exec --json "summarize this repository"
```

## Add project instructions

Create an `AGENTS.md` file at the root of a repository to give Khadim local
instructions:

```md
# Agent instructions

- Use `cargo test` for Rust changes.
- Prefer small, focused commits.
- Do not edit generated files.
```

Khadim discovers `AGENTS.md` files in the workspace and injects the relevant
instructions into the agent prompt. Nested files apply to their own directory
scope.

## Next steps

Read [Features](features/) for the larger platform map, or jump to the
[CLI overview](../cli/overview/) for full command details.
