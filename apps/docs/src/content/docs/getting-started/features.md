---
title: Features
description: Current and planned Khadim capabilities across CLI, desktop, web, SDK, and plugins.
---

Khadim is moving from a CLI coding agent into a local-first automation
platform. This page separates what works today from the platform surfaces under
active development.

## Working today

The current CLI agent supports interactive and headless coding workflows.

- Interactive terminal UI with streaming output and live tool execution.
- Batch mode through `khadim --prompt`.
- Script-friendly execution through `khadim exec`.
- JSON-line event output for embedding and automation.
- Session save, load, switch, rename, and delete commands.
- Provider and model switching from the UI or command line.
- OAuth login for supported providers such as Copilot and Codex.
- Workspace instruction discovery through `AGENTS.md`.
- Coding tools for file reads, writes, edits, shell commands, grep, git, web
  search, delegation, and memory.

## Active development

These capabilities exist as previews, scaffolds, or implementation plans.

- Desktop app built with Tauri and React.
- RPA harness for screenshots, screen inspection, and input automation.
- Qwen VLA local experiment for guarded visual UI actions.
- Web app control plane for shared agent runs.
- Docker runtime for isolated local and server execution.
- Memory stores with search, capacity management, and self-improvement nudges.
- WASM plugin system for custom tools and optional desktop UI tabs.

## Platform roadmap

The product direction centers on managed, reusable automations:

- **Automations** are saved runnable tasks promoted from chat or built in an
  editor.
- **Agents** are persistent automation personas with instructions, tools,
  triggers, approval policy, and runner settings.
- **Sessions** are single executions of an automation or task.
- **Connectors** bind Khadim to external systems such as email, spreadsheets,
  browsers, HTTP APIs, and files.
- **Environments** hold runtime variables and credential bindings.
- **Memory** lets agents keep durable knowledge across sessions.

Read [Architecture](../concepts/architecture/) to see how these parts fit
together.
