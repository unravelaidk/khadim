---
title: Commands
description: Command-line flags, subcommands, slash commands, and keyboard shortcuts.
---

This reference lists the main CLI commands available from `khadim`. Use
`khadim --help` for the exact help text from your installed version.

## Usage

```bash
khadim [OPTIONS]
khadim exec [OPTIONS] [PROMPT]
khadim rpa [OPTIONS]
khadim rpa exec [OPTIONS] [PROMPT]
khadim assistant [OPTIONS]
khadim config [show|path|set|clear] [--json]
khadim search [status|providers|use|set-key|clear-key] [--json]
khadim plugin COMMAND [ARGS] [--json]
```

Without `--prompt` or `exec`, Khadim launches the interactive terminal UI.

## Options

| Option | Description |
| --- | --- |
| `--cwd PATH` | Set the working directory |
| `--prompt TEXT` | Run in batch mode; `-` reads stdin |
| `--provider NAME` | Set the AI provider |
| `--model ID` | Set the AI model |
| `--temperature N` | Override the sampling temperature from `0` to `2` |
| `--base-url URL` | Override the selected provider endpoint |
| `--search-provider NAME` | Override the web-search provider for one run |
| `--ignore-saved-api-key` | Ignore API keys stored in CLI settings |
| `--session NAME` | Load a saved session |
| `--delete-session KEY` | Delete an engine session and exit |
| `--system-prompt TEXT` | Override the system prompt for the run |
| `--harness NAME` | Select `coding`, `rpa`, `assistant`, or a custom harness |
| `--tool-groups LIST` | Restrict tools to `web`, `files`, `apps`, or `rpa` |
| `--skill-dir PATH` | Add an explicit read root for enabled skill files |
| `--multi-agent` | Use the multi-agent coordinator |
| `--json` | Print machine-readable output |
| `--verbose` | Enable verbose logging |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

## Persistent configuration commands

Use `khadim config` when you need to configure Khadim without opening the
interactive settings panel.

```bash
khadim config show
khadim config path
khadim config set provider anthropic
khadim config set model claude-sonnet-4
printf '%s' "$ANTHROPIC_API_KEY" | \
  khadim config set api-key anthropic --stdin
khadim config clear api-key anthropic
khadim config clear provider
```

Use `--json` with any command in this family for structured output. API key
values never appear in `config show` output.

## Web-search commands

Use `khadim search` to select a persistent search provider and manage its
credential from the terminal.

```bash
khadim search providers
printf '%s' "$EXA_API_KEY" | khadim search set-key exa --stdin
khadim search use exa
khadim search status --json
khadim search clear-key exa
```

DuckDuckGo does not need an API key. Parallel, Exa, Tavily, Perplexity, and
Brave require a provider-specific key.

## Plugin commands

Use `khadim plugin` to manage WASM tool plugins without a graphical app.
Installed and enabled plugin tools become available to interactive and batch
agent runs.

```bash
khadim plugin install ./my-plugin
khadim plugin list
khadim plugin inspect my-plugin
khadim plugin tools
khadim plugin run plugin_my_plugin_lookup '{"query":"release notes"}'
printf '%s' "$PLUGIN_TOKEN" | \
  khadim plugin config set my-plugin api_key --stdin
khadim plugin disable my-plugin
khadim plugin enable my-plugin
khadim plugin uninstall my-plugin
```

`plugin install` accepts a package directory that contains `plugin.toml` and
the manifest's `.wasm` file. The runtime enforces the package's filesystem,
HTTP, persistent-store, memory, and execution permissions.

## Slash commands

Type `/` in the terminal UI to browse commands with live preview.

| Command | Description |
| --- | --- |
| `/help` | Show commands and shortcuts |
| `/sessions` | List saved sessions |
| `/session NAME` | Switch to a saved session |
| `/new` | Start a new session |
| `/save NAME` | Save the current session |
| `/delete NAME` | Delete a saved session |
| `/rename OLD NEW` | Rename a saved session |
| `/theme` | Switch theme |
| `/provider` | Switch AI provider |
| `/model` | Switch model |
| `/harness` | Switch harness |
| `/login` | Start OAuth login for supported providers |
| `/settings` | Open the settings panel |
| `/providers` | List providers and auth status |
| `/reset` | Reset the session |
| `/copy` | Copy the last response to the clipboard |
| `/export [PATH]` | Export the conversation to Markdown |
| `/system PROMPT` | Set a custom system prompt |
| `/tokens` | Show token usage |
| `/history` | Show input history |
| `/clear-history` | Clear input history |
| `/config` | Show the config directory path |
| `/version` | Show version info |
| `/refresh-models` | Refresh dynamic model lists |

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Enter` | Send message |
| `Shift+Enter` | Insert newline |
| `Tab` | Accept command suggestion |
| `Escape` | Abort or close overlay |
| `Ctrl+C` | Quit |
| `Ctrl+L` | Clear session |
| `Ctrl+K` | Clear input |
| `Ctrl+O` | Toggle tool output |
| `Ctrl+Left` / `Ctrl+Right` | Move by word |
| `Ctrl+W` | Delete word before cursor |
| `Ctrl+A` / `Ctrl+E` | Jump to start or end of line |
| `Up` / `Down` | Navigate input history when input is focused |
| `F2` | Open the settings panel |
| `PageUp` / `PageDown` | Scroll by page |
| Mouse wheel | Scroll transcript |
