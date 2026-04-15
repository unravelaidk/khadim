# Khadim — Agent Context

## Product Direction

Khadim is an **open-source, local-first agentic automation platform**. Instead of pre-built RPA blocks, Khadim uses AI agents to write and execute automation scripts on the fly. When a UI changes or an edge case appears, the agent can see the screen, understand what broke, rewrite the script, and retry.

See `apps/desktop/DESIGN.md` for the full product design document.

## Architecture Overview

```
Desktop App (Tauri)          Web App (React Router + Express)
       │                              │
       ▼                              ▼
   Agent Engine (shared core: LLM → plan → call tools → loop)
       │
   Tool Domains (pluggable)
       ├── domains/coding     — file read/write, shell, grep, git
       ├── domains/rpa        — screenshot, OCR, mouse/keyboard, browser
       ├── domains/connectors — email, spreadsheet, HTTP, file ops
       └── plugins/           — WASM user-extensible tools
       │
   Runner (local / Docker / cloud)
```

## Target Users

| Tier | Who | Entry Point |
|------|-----|-------------|
| **Simple** | Office workers, small business owners | Chat interface — plain English tasks |
| **Power** | IT analysts, automation engineers | Multi-step automations, triggers, agent config |
| **Enterprise** | IT leads, platform engineers | Managed agent fleet, audit trail, team dashboards |

## Deployment Model

- **Desktop app** — build, test, run automations locally. Docker for headless execution.
- **Web app** — cloud control plane. Deploy managed agents, monitor runs, team dashboards.
- **Shared core** — same agent engine, same tool system, same data model.

---

## Desktop App

### Current State

The desktop app (`apps/desktop`) has a working Tauri backend with:

- **SQLite persistence** — workspaces, conversations, messages, settings
- **AI engine integration** — OpenCode sidecar (async streaming + question handling) and Claude Code bridge (approval prompts + session recovery)
- **Streaming** — normalized live events: `text_delta`, `step_start`, `step_update`, `step_complete`, `question`, `done`, `error`
- **Docker runner** — constrained containers with env/secret injection, default image `debian:bookworm-slim`
- **Git support** — repo validation, branch listing, status, diff stat
- **Process management** — managed spawning, health checks, cleanup
- **Desktop UI** — glass design system, chat input/output, approval and question overlays, native folder picker

### Rust Backend Modules

```
apps/desktop/src-tauri/src/
├── commands/          # Tauri command handlers (split from lib.rs)
├── khadim_ai/         # LLM client, model management, OAuth
├── khadim_agent/      # Orchestrator, session management, tool loop
├── db.rs              # SQLite persistence
├── error.rs           # Error types
├── git.rs             # Git operations
├── health.rs          # Health checking with retry
├── opencode.rs        # OpenCode sidecar management
├── claude_code.rs     # Claude Code bridge
├── process.rs         # Process spawning and cleanup
└── plugins/           # WASM plugin system
```

### What Needs to Be Built

The desktop app is pivoting from a developer coding tool to an RPA platform. The remaining work:

#### RPA Foundation
- Extract `Tool` trait from `khadim_code/tools.rs` to a shared location
- Create `domains/` module structure (coding, rpa, connectors)
- Add RPA mode to agent modes alongside existing build/chat modes
- Add screenshot tool using `xcap`
- Add new SQLite tables: automations, sessions, session_turns, environments, credentials, memory stores, schedules, connectors

#### RPA Tools
- Screen capture + OCR (`xcap`, tesseract)
- Input simulation — mouse/keyboard (`enigo`)
- Browser automation (`chromiumoxide`)
- Email connector (`lettre` — SMTP/IMAP)
- Spreadsheet connector (`calamine`, `csv`)
- HTTP connector

#### Managed Agents
- Agent CRUD and configuration UI
- Scheduling system (`tokio-cron-scheduler`)
- Docker runner via `bollard`
- Agent lifecycle — start, stop, pause, retry
- Memory stores — persistent knowledge across sessions

#### Desktop UI Redesign
- Sidebar: keep Chat/Work mode switcher. Work mode gets: Agents, Sessions, Environments, Credentials, Memory, Analytics
- Dashboard — active agents, recent sessions, quick stats
- Session list + detail view with transcript (User/Agent/Tool turns)
- Automation list + detail + "Save as Automation" from chat
- Agent editor — instructions, tools, triggers, approval mode, runner
- Environment + credential management
- Analytics dashboard

#### Frontend Cleanup
- Remove stale `apps/desktop/src/lib/mock-data.ts`
- Integrate WelcomeScreen into empty chat state
- Remove remaining inline desktop-only styling

### Docker Runtime Plan

Current state: lightweight script runner with env/secret injection.

**Target:** full Khadim-native Docker runtime.

1. Stabilize current script runner with clearer run metadata
2. Add dedicated Khadim runtime Dockerfile (debian:bookworm-slim + Khadim binary + runtime essentials)
3. Replace shell-script entrypoint with Khadim invocation, stream structured events
4. Formalize container inputs (prompt, model, env, secrets, mounts) and add resource/network controls
5. Support both isolated scratch containers (RPA/connector runs) and mounted workspace containers (coding runs)
6. Surface Docker health, image readiness, and runner selection in UI

### Streaming Model

All live events use the same normalized shape across OpenCode, Claude Code, and future Khadim-native backends:

- `text_delta` — incremental text output
- `step_start` / `step_update` / `step_complete` — tool execution progress
- `question` — agent needs user input
- `done` — session complete
- `error` — session failed

OpenCode uses `POST /session/:id/prompt_async` + `GET /event`. Claude Code uses its native bridge process.

---

## Web App

### Current State

The web app (`apps/web`) uses React Router + Express with:

- Redis-backed snapshot + replay reconnection
- SSE-based live agent updates (migrating to WebSocket)
- Hand-rolled RPC layer (migrating to Hono RPC)
- 19 LLM providers supported

### Hono RPC Migration

Mount a Hono app under `/api/rpc` for typed agent command/query routes:

**Routes:**
- `job.start`, `job.stop`, `job.get`
- `chat.getActiveJobs`
- `session.getSnapshot`, `session.replayEvents`

**Approach:**
- Keep React Router for main app routes
- Use Hono's typed client (`hc`) on frontend
- Replace `app/lib/agent-rpc-client.ts` fetch calls
- Keep business logic in `app/lib/agent-rpc.ts`

### WebSocket Migration

Replace SSE (`/api/agent/stream`) with WebSocket (`/api/agent/ws`):

- Resume handshake: `session.connect` with `{ sessionId, lastEventId? }`
- App-level `ping`/`pong` for liveness
- Reconnect-on-close
- Keep existing event payload shapes unchanged
- Remove legacy SSE routes after cutover

### Constraints

- Do not rewrite the entire server to Hono
- Preserve snapshot + replay reconnect behavior
- Preserve event payload shapes consumed by `useAgentBuilder`
- Keep tests passing during migration

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Automation** | Saved, runnable task — promoted from chat or built in editor |
| **Agent** | Managed, persistent automation persona with instructions, tools, and triggers |
| **Session** | Single execution of an automation or agent task |
| **Connector** | Configured external service (email, browser, spreadsheet, API) |
| **Domain** | Pluggable tool set (coding, RPA, connectors). Engine is domain-agnostic |
| **Environment** | Isolated runtime config with variables and credential bindings |
| **Credential** | Securely stored secret (API key, OAuth token, login) |
| **Memory** | Persistent knowledge agents accumulate across sessions |
| **Runner** | Execution target — local, Docker, or cloud |

## Vocabulary

| Old Term | New Term |
|----------|----------|
| Workspace | Project |
| Conversation | Chat / Draft |
| Backend | Runner / Environment |
| OpenCode / Claude Code | AI Engine (abstracted) |
| Settings (API keys) | Credentials vault |

---

## Implementation Phases

### Phase 1 — Foundation
- Extract Tool trait, create domain structure
- Add RPA mode + screenshot tool
- Add new DB tables
- Sidebar redesign

### Phase 2 — Core RPA
- Screen capture, browser automation, email/spreadsheet connectors
- Dashboard, AutomationList, SessionDetail
- "Save as Automation" from chat

### Phase 3 — Managed Agents
- Agent CRUD + AgentEditor
- Scheduling (tokio-cron), Docker runner (bollard)
- Environment + credential management
- Memory stores

### Phase 4 — Polish + Enterprise
- Audit trail + screenshot gallery
- Analytics dashboard
- Connector verification
- Agent templates + export/import
- Web ↔ desktop shared data model
