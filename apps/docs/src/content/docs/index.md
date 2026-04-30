---
title: Intro
description: Khadim — an open-source, local-first agentic automation platform.
---

Khadim is an open-source, local-first agentic automation platform. Instead of pre-built RPA blocks, Khadim uses AI agents to write and execute automation scripts on the fly.

## Quick start

Install the CLI coding agent:

```bash
npm install -g @unravelai/khadim
```

Run a prompt in batch mode:

```bash
khadim --prompt "explain this codebase"
```

Or launch the interactive TUI:

```bash
khadim
```

## What Khadim can do

- Autonomous coding agent with 19+ LLM providers
- Interactive terminal UI with streaming tool execution
- Programmatic API for embedding into your own apps
- Plugin SDK for building sandboxed WebAssembly extensions
- Desktop app with glass UI design system
- Web app for team collaboration and cloud deployment

## Architecture

```
Desktop App (Tauri)          Web App (React Router + Express)
       │                              │
       ▼                              ▼
   Agent Engine (shared core: LLM → plan → call tools → loop)
       │
   Tool Domains (pluggable)
       ├── domains/coding     — file read/write, shell, grep, git
       ├── domains/rpa        — screenshot, OCR, mouse/keyboard, browser
       └── plugins/           — WASM user-extensible tools
```

## Docs map

- [CLI Overview](/khadim/cli/overview/) — install, configure, and use the CLI.
- [Programmatic API](/khadim/cli/programmatic-api/) — embed the agent in your own app.
- [Plugin SDK](/khadim/plugins/overview/) — build sandboxed WebAssembly plugins.
- [Docker Agent Runtime](/khadim/reference/docker-agent-runtime/) — run the agent in containers.
