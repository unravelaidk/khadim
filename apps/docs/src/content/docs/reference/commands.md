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
```

Without `--prompt` or `exec`, Khadim launches the interactive terminal UI.

## Options

| Option | Description |
| --- | --- |
| `--cwd PATH` | Set the working directory |
| `--prompt TEXT` | Run in batch mode; `-` reads stdin |
| `--provider NAME` | Set the AI provider |
| `--model ID` | Set the AI model |
| `--session NAME` | Load a saved session |
| `--system-prompt TEXT` | Override the system prompt for the run |
| `--harness NAME` | Select `coding`, `rpa`, `assistant`, or a custom harness |
| `--verbose` | Enable verbose logging |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

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
