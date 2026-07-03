---
title: Architecture
description: The shared Khadim architecture across surfaces, engines, tools, and runners.
---

Khadim separates the user surface from the agent engine. The CLI, desktop app,
web app, SDK, and plugins all connect to the same core pattern: a model plans,
calls tools, observes results, and continues until the task is complete.

## System shape

```text
Desktop app (Tauri)          Web app (React Router + Express)       CLI / SDK
        |                              |                                |
        +------------------------------+--------------------------------+
                                       |
                                Agent engine
                         LLM -> plan -> tools -> loop
                                       |
                                Tool domains
             coding, RPA, connectors, plugins, memory, runners
```

## Surfaces

Khadim has multiple entry points:

| Surface | Purpose |
| --- | --- |
| CLI | Interactive terminal agent and headless automation |
| Desktop | Local RPA, screen automation, credentials, and runners |
| Web | Team control plane, monitoring, and managed agents |
| SDK | Embedded agent runs inside Node.js applications |
| Plugins | User-extensible tools and optional desktop UI tabs |

## Agent engine

The engine owns the run loop:

1. Compose context from the user prompt, mode, tools, memory, and workspace
   instructions.
2. Send the prompt to the configured provider and model.
3. Stream text and tool requests.
4. Execute tools through the active domain registry.
5. Return observations to the model.
6. Persist messages, events, sessions, and run metadata.

## Streaming events

Every live backend is expected to produce the same normalized event shapes:

| Event | Meaning |
| --- | --- |
| `text_delta` | Incremental assistant text |
| `step_start` | Tool or step execution started |
| `step_update` | Tool or step progress changed |
| `step_complete` | Tool or step execution completed |
| `question` | The agent needs user input |
| `done` | The run completed |
| `error` | The run failed |

This lets the CLI, desktop app, web app, and SDK share UI and replay behavior.

## Runners

Runners define where the automation executes:

- **Local** runs directly on the host.
- **Docker** runs in a constrained container with explicit env, secrets, mounts,
  and resource controls.
- **Cloud** is planned for managed deployments.

The runner changes execution boundaries, not the event protocol.

## Data model

The platform model centers on reusable automation:

| Concept | Description |
| --- | --- |
| Automation | A saved, runnable task |
| Agent | A persistent automation persona |
| Session | One execution of a task or agent |
| Connector | A configured external service |
| Domain | A pluggable tool set |
| Environment | Runtime variables and credential bindings |
| Credential | A stored secret or OAuth token |
| Memory | Durable knowledge across sessions |
| Skill | Reusable procedural knowledge |
| Runner | Local, Docker, or cloud execution target |
