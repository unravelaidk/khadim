---
title: Desktop app
description: Understand the local Tauri desktop app and its RPA direction.
---

The desktop app is Khadim's local automation workspace. It is built with Tauri
and React, backed by SQLite, and designed for tasks that need screen access,
local files, credentials, Docker runners, and native process control.

## Current state

The desktop app currently includes these foundations:

- SQLite persistence for workspaces, conversations, messages, and settings.
- AI engine adapters for OpenCode, Claude Code, and the native Khadim
  orchestrator.
- Normalized streaming events such as `text_delta`, `step_start`,
  `step_update`, `step_complete`, `question`, `done`, and `error`.
- Docker runner scaffolding with environment and secret injection.
- Git operations for repository validation, branch listing, status, and diff
  statistics.
- Process spawning, health checks, and cleanup.
- React UI surfaces for chat, approvals, questions, and folder picking.

## RPA direction

The desktop app is pivoting from a developer coding tool to a local-first RPA
platform.

Planned domain work includes:

- Screenshot capture with `xcap`.
- OCR with Tesseract.
- Mouse and keyboard simulation with `enigo`.
- Browser automation with `chromiumoxide`.
- Email, spreadsheet, HTTP, and file connectors.
- Environment, credential, memory, schedule, connector, automation, and session
  tables.

## Managed agents

Managed agents are persistent automation personas. Each agent can carry:

- Instructions and approval mode.
- Tool and connector access.
- Trigger and schedule configuration.
- Runner settings for local, Docker, or cloud execution.
- Memory stores shared across sessions.

## Run the desktop app

From the repository root, run:

```bash
bun run desktop:dev
```

Build the desktop app:

```bash
bun run desktop:build
```

## Related pages

Read [Architecture](../concepts/architecture/) for the shared engine and
[Tools and domains](../concepts/tools-and-domains/) for the planned RPA domain
model.
