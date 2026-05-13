---
title: Khadim
description: An open-source, local-first agentic automation platform — terminal, desktop, web, and SDK.
---

**Khadim** is an open-source, local-first agentic automation platform. Instead of stitching together pre-built RPA blocks, Khadim hands the job to an AI agent that writes and runs automation scripts on the fly — in your terminal, on your desktop, or embedded inside your own product.

> One agent. One tool loop. Every surface — CLI, desktop, web, SDK — talks to the same engine.

## Install in 30 seconds

```bash
npm install -g @unravelai/khadim
```

Run a one-shot prompt in batch mode:

```bash
khadim --prompt "explain this codebase"
```

…or drop into the interactive terminal UI:

```bash
khadim
```

## What you get

- **Coding agent, 19+ providers.** OpenAI, Anthropic, Gemini, Groq, xAI, Copilot, Codex, Cerebras, OpenRouter, Mistral and more — swap providers without rewriting prompts.
- **Streaming terminal UI.** Multi-line input, live tool execution, slash commands, session save/load, and an F2 settings panel.
- **[Khadim SDK](/khadim/cli/sdk/).** Embed the same agent into your Node.js app with a typed, streaming API — including custom tool bridges that run in *your* process.
- **[Plugin SDK](/khadim/plugins/overview/).** Ship sandboxed WebAssembly tools the agent loads at runtime.
- **Desktop app.** A glass-UI Tauri build for users who don't live in a terminal.
- **Web app.** Team collaboration and cloud deployment for shared agent runs.

## Architecture at a glance

```
Desktop (Tauri)          Web (React Router + Express)        CLI / SDK
       │                              │                          │
       └──────────────────────────────┴──────────────────────────┘
                                  │
                          Agent Engine
                  (LLM → plan → call tools → loop)
                                  │
                          Tool Domains
              ├── domains/coding   — file I/O, shell, grep, git
              ├── domains/rpa      — screenshot, OCR, mouse / keyboard, browser
              └── plugins/         — WASM, user-extensible
```

The CLI, desktop, web, and SDK are four windows onto the same engine. Switch surfaces — keep the same prompts, the same tools, the same events.

## Where to go next

- **[CLI Overview](/khadim/cli/overview/)** — install, configure, and live in the terminal.
- **[Khadim SDK](/khadim/cli/sdk/)** — embed the agent in your own Node.js application.
- **[Plugin SDK](/khadim/plugins/overview/)** — build sandboxed WebAssembly tools.
- **[Docker Agent Runtime](/khadim/reference/docker-agent-runtime/)** — run the agent in containers.
