---
title: Tools and domains
description: How Khadim organizes built-in tools, RPA tools, connectors, memory, and plugins.
---

Tools are the actions an agent can call. Domains group related tools so the
engine can stay domain-agnostic while each surface chooses the capabilities a
run needs.

## Domain model

Khadim is moving toward this domain structure:

```text
domains/
  coding       file read/write, shell, grep, git, search
  rpa          screenshot, OCR, mouse, keyboard, browser
  connectors   email, spreadsheet, HTTP, files, external APIs
  memory       memory search, save, delete, get, session search
  plugins      sandboxed WASM tools
```

The shared `Tool` trait is the boundary between the agent engine and domain
implementations.

## Coding tools

The coding domain is the mature tool set. It supports repository work such as:

- Reading and writing files.
- Editing existing files.
- Running shell commands.
- Searching with grep-style tools.
- Inspecting git state.
- Delegating read-only investigation to subagents.
- Asking the user questions during a run.

## RPA tools

The RPA domain is under active development. It is planned to support:

- Screen capture through `xcap`.
- OCR through Tesseract.
- Input simulation through `enigo`.
- Browser automation through `chromiumoxide`.
- Visual action experiments through local VLA helpers.

RPA tools need stricter approvals and better observability because they act on
the local desktop.

## Connector tools

Connector tools bind Khadim to external systems. Planned connector domains
include:

- Email with SMTP and IMAP.
- Spreadsheets with CSV and workbook readers.
- HTTP APIs.
- Local and mounted files.
- Browser sessions.

Connectors are configured through environments and credentials rather than
hard-coded into prompts.

## Memory tools

Khadim's memory system has two layers:

- **Memory entries** store durable facts and conventions.
- **Session search** uses full-text search across previous conversations.

Memory tools include `memory_search`, `memory_save`, `memory_delete`,
`memory_get`, and `session_search`.

## Plugin tools

Plugins are sandboxed WebAssembly modules. A plugin declares its metadata,
tools, permissions, config fields, and optional UI contribution in a manifest.

Plugin tools are namespaced to avoid collisions with built-in tools:

```text
plugin.{plugin-id}.{tool-name}
```

Read [Plugin SDK](../plugins/overview/) to build one.
