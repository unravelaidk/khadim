---
title: Khadim
description: Local-first agentic automation across CLI, desktop, web, SDK, and plugins.
---

Khadim is an open-source, local-first agentic automation platform. It gives an
AI agent the tools to inspect a workspace or screen, write the automation it
needs, execute it, recover from failures, and report what happened.

The CLI coding agent is the working entry point today. The desktop app, web
control plane, RPA tools, Docker runtime, memory system, and plugins are being
built around the same engine.

## Highlights

- Run an interactive coding agent in your terminal.
- Execute one-shot prompts with `khadim exec` or `khadim --prompt`.
- Stream normalized events for apps and services.
- Use 19+ AI providers through one provider/model interface.
- Add sandboxed WebAssembly tools through the Plugin SDK.
- Build toward RPA workflows with screenshots, OCR, browser automation,
  connectors, schedules, environments, credentials, and memory.
- Run the same automation model across CLI, desktop, web, Docker, and cloud
  runners.

## Install

Install the CLI from npm:

```bash
npm install -g @unravelai/khadim
```

Start the terminal UI:

```bash
khadim
```

Run one task without opening the UI:

```bash
khadim --prompt "explain this codebase"
```

## Learn the basics

Start with these pages if you are new to Khadim:

- [Installation](getting-started/installation/) explains the supported install
  paths.
- [First steps](getting-started/first-steps/) walks through your first
  interactive and headless runs.
- [Features](getting-started/features/) maps the current and planned platform
  capabilities.
- [CLI overview](cli/overview/) documents the terminal UI and batch modes.

## Understand the platform

Khadim is built around one shared agent loop:

```text
LLM -> plan -> call tools -> observe results -> continue or finish
```

The same loop powers multiple surfaces:

- **CLI** for terminal-first coding and scripted runs.
- **Desktop** for local RPA and screen-aware automation.
- **Web** for managed agents, team dashboards, and run monitoring.
- **SDK** for embedding the agent into applications.
- **Plugins** for user-extensible tool domains.

Read [Architecture](concepts/architecture/) for the full model.

## Build with Khadim

Use these paths when you want to extend or embed Khadim:

- [Khadim SDK](cli/sdk/) explains the TypeScript API and event stream.
- [Plugin SDK](plugins/overview/) explains sandboxed WASM tools.
- [Tools and domains](concepts/tools-and-domains/) explains how coding, RPA,
  connectors, and plugins fit together.
- [Docker Agent Runtime](reference/docker-agent-runtime/) explains the
  container runtime plan.
