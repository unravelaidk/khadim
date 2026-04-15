# Agent Transport Context

## Current State

- The app uses React Router with an Express server in `server.ts`.
- Agent commands and queries are being migrated to Hono RPC under `/api/rpc/*`.
- Reconnection is already based on a Redis-backed snapshot + replay model.
- Live agent updates are moving from SSE to a dedicated WebSocket endpoint.
- The frontend should use Hono RPC for commands/queries and WebSocket for session-scoped live events.

## Why Change RPC

- The current RPC layer works, but it is hand-rolled.
- We want a stronger typed contract between server and client.
- We do not want to adopt a large new application architecture just to replace the RPC transport.

## Chosen Direction

Use Hono RPC for the agent command/query surface.

This should stay a narrow integration:

- Keep React Router for the main app routes.
- Add a small Hono app only for RPC endpoints under `/api/rpc/*`.
- Use Hono's typed client (`hc`) on the frontend for command/query calls.
- Use a dedicated server-level WebSocket endpoint for long-lived live event delivery.

## Why Hono RPC Fits

- It works well as a focused typed transport layer.
- It can be mounted into the existing Express server.
- It avoids converting the whole app away from React Router.
- It is lighter-weight than introducing a broader framework migration.

## Planned Migration

1. Create a dedicated Hono app for agent RPC routes.
2. Define typed routes for:
   - `job.start`
   - `job.stop`
   - `job.get`
   - `chat.getActiveJobs`
   - `session.getSnapshot`
   - `session.replayEvents`
3. Mount the Hono RPC app inside the Express server under `/api/rpc`.
4. Replace `app/lib/agent-rpc-client.ts` fetch calls with a typed Hono client.
5. Keep existing shared business logic in `app/lib/agent-rpc.ts` or move it behind Hono handlers with minimal duplication.
6. Extract the session stream logic into transport-neutral server helpers that preserve:
   - `session_connected`
   - replay from Redis stream IDs
   - snapshot fallback when replay is empty or stale
   - live subscription ordering after replay completes
7. Add a dedicated WebSocket endpoint at `/api/agent/ws` at the Node/Express layer instead of React Router.
8. Implement an explicit resume handshake from the client:
   - `session.connect` with `{ sessionId, lastEventId? }`
   - `ping`
   - `pong`
9. Switch the frontend from `EventSource` to `WebSocket` while keeping the existing event payload shapes unchanged.
10. Remove the legacy transport routes once the new paths are fully in use:
   - `/api/agent/stream`
   - `/api/agent`
   - `/api/agent/stop`
11. Remove SSE-only helpers after the WebSocket cutover is verified.

## Constraints

- Minimize surface area of the migration.
- Do not rewrite the entire server to Hono.
- Preserve the current snapshot + replay reconnect behavior.
- Preserve the current event payload shapes consumed by `useAgentBuilder`.
- Keep tests passing while switching the RPC and live transport layers.
- Add app-level ping/pong plus reconnect-on-close for WebSocket liveness.

## Notes

- `effect-smol` was considered, but it would introduce a broader architectural commitment than needed for this repo.
- Hono RPC is the preferred compromise for typed request/response transport without replacing the existing app structure.
- WebSocket should be treated as a sibling transport for long-lived session events, not as a replacement for Hono RPC.

## Desktop Progress

### Scope

- Work in progress is in `apps/desktop`.
- This is separate from the web app Hono RPC migration above.
- **The desktop app is pivoting from a developer-focused coding tool to an agentic RPA (Robotic Process Automation) platform.**
- See `apps/desktop/DESIGN.md` for the full product design document.
- Goal: an open-source, local-first agentic automation platform that uses AI coding agents to write and execute automation scripts on the fly.

### Implemented So Far

- Replaced the placeholder Tauri backend with a real Rust module structure, including:
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/error.rs`
  - `apps/desktop/src-tauri/src/git.rs`
  - `apps/desktop/src-tauri/src/health.rs`
  - `apps/desktop/src-tauri/src/opencode.rs`
  - `apps/desktop/src-tauri/src/process.rs`
  - `apps/desktop/src-tauri/src/claude_code.rs`
- Added SQLite persistence using `rusqlite`.
- Added database tables and persisted metadata for:
  - `workspaces`
  - `conversations`
  - `messages`
  - `settings`
- Expanded conversation persistence to store desktop-specific runtime context needed for recovery:
  - `backend_session_id`
  - `backend_session_cwd`
  - `branch`
  - `worktree_path`
- Added native git support for:
  - repo validation
  - repo info
  - branch listing
  - worktree listing
  - worktree create/remove
  - branch → worktree association
  - git status summary
  - diff stat
  - changed file listing
- Improved worktree behavior:
  - stable default worktree paths under `.khadim-worktrees/<repo>/<branch>`
  - reuse of existing non-main worktrees for an existing branch
  - shared-worktree-safe deletion logic when removing an agent
- Added managed process spawning and cleanup for long-lived backend processes.
- Added health checking with retry logic for local backend services.
- Added OpenCode sidecar management:
  - find `opencode` binary
  - allocate free localhost port
  - generate random password
  - spawn `opencode serve`
  - health check `GET /global/health`
  - store connection info per workspace
- Added OpenCode API calls for:
  - create session
  - list sessions
  - send message
  - send async message
  - abort session
  - list session messages
  - get diff
  - get session statuses
  - reply to question requests
  - reject question requests
- Added OpenCode streaming integration using:
  - `POST /session/:id/prompt_async`
  - `GET /event`
- Normalized OpenCode live events into the desktop app streaming model, including:
  - `text_delta`
  - `step_start`
  - `step_update`
  - `step_complete`
  - `question`
  - `done`
  - `error`
- Fixed OpenCode question handling to use the dedicated question reply/reject API instead of sending question answers back as plain follow-up prompts.
- Added Claude Code desktop integration via a native bridge process.
- Added Claude Code approval handling:
  - SDK `canUseTool` permission interception
  - desktop approval overlay
  - approve / deny / remember decision flow
  - live response back into the running Claude Code bridge
- Added best-effort Claude Code session recovery on restart by rebuilding in-memory session state from persisted conversation metadata.
- Added process output event emission to the frontend via Tauri events:
  - `process-output`
  - `opencode-ready`
  - `agent-stream`
- Updated the desktop frontend to support:
  - question overlays rendered above the app shell via portals
  - approval overlays rendered above the app shell via portals
  - typed bindings for the expanded Tauri command/event surface
- Wired the Tauri dialog plugin so desktop workspace creation can use a native folder picker.
- Rust side currently passes `cargo check` cleanly, with only unrelated pre-existing warnings in plugin code.

### Current State

- Desktop backend foundation is now solid and increasingly transport-aware.
- OpenCode async streaming and question reply handling are implemented.
- Claude Code native bridge, approval prompts, and best-effort session restore are implemented.
- Worktree management is no longer purely ad hoc; it now has stable paths, reuse behavior, and shared-deletion safeguards.
- The main remaining desktop gap is no longer basic backend wiring; it is turning workspace mode into a stronger native coding surface.
- The highest-value next desktop priority is:
  - redesign workspace mode around native tools
  - add a native terminal in workspace mode
  - add a native-speed file finder
  - replace the current lightweight git snapshot with a richer diff workspace

### Recent Desktop Update

- The desktop backend command surface was split out of `apps/desktop/src-tauri/src/lib.rs` into focused modules under `apps/desktop/src-tauri/src/commands/` so the Tauri entrypoint is now mainly composition/bootstrap code instead of a command dump.
- The managed-agent Docker path is now wired more cleanly for the RPA pivot:
  - environment `docker_image` values are persisted from the desktop UI instead of being dropped on save
  - Docker runs now inject resolved credential secrets into container env vars
  - the default sandbox image was reduced from `ubuntu:22.04` to `debian:bookworm-slim`
  - this keeps the sandbox smaller while staying `bash`-friendly and glibc-friendly for a future native Khadim runtime inside Docker
- The desktop styling baseline in `apps/desktop/src/styles.css` was updated to match the web app token system more closely:
  - CSS variable driven glass tokens
  - shared glass utility classes
  - web-aligned shadows, borders, and backgrounds
  - streaming cursor and shimmer utilities for live chat rendering
- The following desktop components were redesigned to use the shared glass utilities instead of local inline styling:
  - `apps/desktop/src/components/Sidebar.tsx`
  - `apps/desktop/src/components/WorkspaceList.tsx`
  - `apps/desktop/src/components/ChatMessage.tsx`
  - `apps/desktop/src/components/ChatInput.tsx`
  - `apps/desktop/src/components/WelcomeScreen.tsx`
- Added new desktop overlays/components for interactive runtime control:
  - `apps/desktop/src/components/QuestionOverlay.tsx`
  - `apps/desktop/src/components/ApprovalOverlay.tsx`
- Updated `apps/desktop/src/components/NewAgentModal.tsx` and git backend behavior to support stable and reusable worktrees.
- Updated `apps/desktop/src/hooks/useAgentStreamHandler.ts` and `apps/desktop/src/hooks/useAgentChatActions.ts` to support OpenCode question replies and Claude Code approval requests.

### Remaining Desktop Work

1. Finish the remaining workspace-mode frontend migration in:
   - `apps/desktop/src/components/WorkspaceView.tsx`
   - `apps/desktop/src/App.tsx`
2. Integrate `WelcomeScreen` into the empty chat state and remove the remaining inline desktop-only styling.
3. Remove stale `apps/desktop/src/lib/mock-data.ts` once all remaining references are gone.
4. Add a native PTY-backed terminal for workspace mode.
5. Add a native file finder / workspace search surface.
6. Replace the current lightweight git snapshot with a structured diff workspace.
7. Add richer worktree-aware context switching so terminal, finder, and diff follow the active agent/worktree.
8. Re-run `cargo check` and `bun run build` after each major desktop milestone.

### Docker Sandbox Direction

- The current Docker runner is intentionally lightweight:
  - it creates a constrained container
  - injects variables and credential-derived env vars
  - writes the rendered instructions into the container
  - executes shell-script-style instructions
  - streams logs back into the existing run/session UI
- The current default image is `debian:bookworm-slim`.
- `debian:bookworm-slim` is the preferred baseline for now because:
  - it is materially smaller than the old Ubuntu default
  - it already fits the current `bash`-based entrypoint assumptions
  - it is glibc-based, which makes a future native Khadim binary in-container much easier than an Alpine/musl path
- We are explicitly not treating Alpine as the default sandbox yet because it would likely force either:
  - a separate musl build/distribution strategy for Khadim
  - or a more fragile bootstrap/install story inside the container

### Full Docker Runtime Plan

The next step should be a **full Khadim-native Docker runner**, since Khadim is already the in-repo orchestrator and is the easiest path to full in-container orchestration.

#### Phase 1 — Stabilize the current script runner

1. Keep `debian:bookworm-slim` as the default sandbox image.
2. Make the current Docker runner more explicit about what it supports:
   - shell-script execution
   - env/secret injection
   - run logs + exit code persistence
3. Add clearer run metadata so the UI can distinguish:
   - script-mode Docker run
   - full agent-runtime Docker run

#### Phase 2 — Define a Khadim runtime image

1. Add a dedicated Dockerfile for the managed-agent runner image.
2. Base it on a small glibc image, likely `debian:bookworm-slim`.
3. Install only the runtime essentials needed for agent execution:
   - Khadim binary
   - shell/runtime helpers
   - CA certificates
   - git if tool access requires it
4. Keep the image focused on execution, not development.

#### Phase 3 — Run Khadim inside the container

1. Replace the current shell-script entrypoint with a real Khadim invocation.
2. Pass the rendered agent prompt, environment, and model selection into the container runtime.
3. Stream structured Khadim events out of the container instead of only raw stdout.
4. Preserve the existing desktop event model:
   - `text_delta`
   - `step_start`
   - `step_update`
   - `step_complete`
   - `done`
   - `error`

#### Phase 4 — Isolate runtime inputs cleanly

1. Formalize what enters the container:
   - prompt
   - model/provider selection
   - env vars
   - credential-derived secrets
   - optional mounted workspace/data directories
2. Separate runner configuration from agent definition so Docker policy is not hidden inside prompt text.
3. Add resource and network policy controls for the container:
   - memory
   - CPU
   - network on/off or scoped modes
   - optional readonly rootfs/tmpfs/mounts

#### Phase 5 — Support workspace-aware execution

1. Decide which runs need mounted project state vs isolated scratch containers.
2. For coding-domain agent runs, mount a controlled workspace path.
3. For pure RPA/connector runs, prefer isolated task-specific runtime state.
4. Make the execution context visible in the UI so users understand what the container can access.

#### Phase 6 — Make Docker a first-class runner type

1. Add richer status/diagnostics for image pull, create, start, stop, and cleanup.
2. Surface Docker runner health and image readiness in the desktop UI.
3. Allow selecting between:
   - lightweight script sandbox
   - full Khadim runtime image
4. Add tests around:
   - env injection
   - secret injection
   - image selection
   - run lifecycle transitions
   - failure cleanup

### Native Workspace Build Plan

#### Product Direction

Turn workspace mode into a native coding cockpit with four coordinated surfaces:

1. **Header / context rail**
   - workspace name
   - backend
   - active branch
   - active worktree badge
   - active agent selector
2. **Center panel**
   - agent chat
   - thinking steps
   - activity / execution status
3. **Bottom dock**
   - native terminal
4. **Right dock**
   - changed files
   - structured git diff
5. **Fast overlay / left utility surface**
   - file finder
   - recent files
   - changed-file jump list

All three native tools should resolve their context from the active agent first:

- `agent.worktreePath ?? workspace.worktree_path ?? workspace.repo_path`

#### Phase 1 — Workspace Context Layer

Create a shared desktop context model that all native tools use.

Planned Rust module:
- `apps/desktop/src-tauri/src/workspace_context.rs`

Responsibilities:
- resolve effective cwd for the active workspace / conversation / agent
- normalize repo path vs worktree path
- expose worktree-aware metadata to terminal, file finder, and diff APIs

Frontend bindings should expose a lightweight context type with:
- `workspaceId`
- `conversationId`
- `agentId`
- `repoPath`
- `branch`
- `cwd`
- `worktreePath`

#### Phase 2 — Native Terminal Dock

Goal:
- replace the current process output panel with a real terminal surface in workspace mode

Planned Rust module:
- `apps/desktop/src-tauri/src/terminal.rs`

Suggested implementation details:
- use a PTY-backed shell process per terminal session
- strongly consider `portable-pty`
- manage lifecycle with `tokio`
- store scrollback and terminal session metadata in Rust
- support one default terminal per active agent/worktree, plus optional shared workspace terminal tabs

Planned Tauri commands:
- `terminal_create`
- `terminal_write`
- `terminal_resize`
- `terminal_close`
- `terminal_list`
- `terminal_focus_context`

Planned Tauri events:
- `terminal-output`
- `terminal-exit`
- `terminal-title`
- `terminal-status`

Frontend milestones:
- add a bottom dock component in `WorkspaceView.tsx`
- support collapsed / expanded / resized states
- support terminal tabs keyed by workspace / agent / worktree
- scope default terminal cwd to active worktree context

#### Phase 3 — Native File Finder

Goal:
- provide a native-speed fuzzy file finder for the active workspace/worktree

Planned Rust module:
- `apps/desktop/src-tauri/src/file_index.rs`

Suggested implementation details:
- use `ignore` + `walkdir` for indexing
- use `notify` for incremental invalidation
- use a fuzzy matcher such as `nucleo-matcher` or similar
- maintain separate indexes per root so worktrees can diverge cleanly
- bias ranking toward:
  - basename matches
  - changed files
  - recently opened files
  - active worktree files

Planned Tauri commands:
- `file_index_build`
- `file_search`
- `file_read_preview`
- `file_open_meta`

Planned Tauri events:
- `file-index-status`
- `file-index-updated`

Frontend milestones:
- open finder with `Cmd/Ctrl+P`
- render file name + relative path + git status + worktree-aware location
- allow keyboard-only open / preview / jump into diff

#### Phase 4 — Structured Git Diff Workspace

Goal:
- replace the current `git diff --stat` snapshot with a richer native diff inspector

Planned Rust module:
- `apps/desktop/src-tauri/src/diff.rs`

Suggested implementation details:
- start by parsing git CLI output into structured models
- expose:
  - diff summary
  - changed files
  - per-file hunks
- later consider moving more logic to `gix` / `git2` if needed
- diff queries should be worktree-aware and scoped to the active agent context

Planned Tauri commands:
- `git_diff_summary`
- `git_diff_files`
- `git_diff_file`
- `git_diff_refresh`

Planned Tauri events:
- `git-status-updated`
- `diff-updated`

Frontend milestones:
- right dock with:
  - summary header
  - changed file list
  - hunk viewer
- allow clicking a changed file from finder or agent card
- later add hunk/file revert actions if useful

#### Phase 5 — WorkspaceView Redesign

Rework `apps/desktop/src/components/WorkspaceView.tsx` from the current tabbed overview into a tool-oriented coding workspace.

Target layout:
- top context header
- center chat / activity panel
- bottom terminal dock
- right diff dock
- fast file finder overlay

This is preferred over adding more tabs because it makes the desktop app feel like a native coding environment rather than a settings dashboard.

#### Phase 6 — Worktree Lifecycle UX

Build on the new stable/reused worktree model with better UI affordances.

Planned improvements:
- explicitly show when an agent is reusing a shared worktree
- show shared-worktree warnings in deletion UI
- add branch/worktree badges in workspace lists and agent cards
- allow focusing the workspace tools on a selected agent/worktree explicitly
- add orphaned worktree cleanup checks

### Streaming Direction

- The desktop app should not use a blocking synchronous path as the primary OpenCode UX.
- OpenCode request flow should remain based on:
  - `POST /session/:id/prompt_async`
  - `GET /event`
- The desktop frontend should continue consuming normalized live events in a shape consistent with the web app streaming model:
  - `text_delta`
  - `step_start`
  - `step_update`
  - `step_complete`
  - `question`
  - `done`
  - `error`
- Claude Code should continue using its bridge process, but the surrounding desktop UI should treat approvals, terminal context, file search, and diff as first-class native workspace tools.

### Notes

- The Tauri dialog plugin is now wired and available for native folder picking.
- `apps/desktop/src/lib/mock-data.ts` remains stale and should be removed during the remaining frontend cleanup.
- The current Rust warnings reported by `cargo check` are unrelated pre-existing warnings in plugin code and not part of the desktop transport/worktree changes.

## RPA Pivot Direction

### Product Vision

Khadim is pivoting from a developer-focused coding tool to an **open-source, local-first agentic automation platform**.

The core insight: instead of building pre-made RPA blocks (like UiPath/n8n), Khadim uses AI coding agents to **write and execute automation scripts on the fly**. When a UI changes or an edge case appears, the agent can see the screen, understand what broke, rewrite the script, and retry.

### Target Users

1. **Simple users** — use the chat interface to describe tasks in plain English
2. **Power users** — build multi-step automations, configure triggers, manage agents
3. **Enterprise** — deploy managed agents, monitor fleet, audit trail, team management

### Deployment Model

- **Desktop app** — build, test, run automations locally. Docker for headless local execution.
- **Web app** — cloud control plane. Deploy managed agents, monitor runs, team dashboards.
- **Shared core** — same agent engine, same tool system, same data model.
- **Enterprise focus, open-source distribution.**

### Key Concepts

- **Automation** — a saved, runnable task (promoted from a chat conversation or built in the editor)
- **Agent** — a managed, persistent automation persona with instructions, tools, and triggers (inspired by Claude managed agents)
- **Run** — a single execution of an automation or agent task
- **Connector** — a configured external service (email, browser, spreadsheet, API)
- **Domain** — a pluggable set of tools (coding, RPA, connectors). The agent engine is domain-agnostic.

### Architecture Principle

The existing agent orchestrator (`khadim_agent`) already does: LLM → plan → call tools → loop. It doesn't care if the tools are `read_file`, `screenshot`, or `send_email`. The coding tools become one "domain" among many:

- `domains/coding` — existing file read/write, shell, grep, LSP, git
- `domains/rpa` — screenshot, OCR, mouse/keyboard, browser automation
- `domains/connectors` — email, spreadsheet, HTTP, file ops
- `plugins/` — WASM user-extensible tools (already built)

### What to Keep

- `khadim_ai/` — LLM client, model management, streaming
- `khadim_agent/` — orchestrator, session management, tool loop
- `khadim_code/tools.rs` — Tool trait (extract to shared location)
- `plugins/` — WASM plugin system
- `db.rs` — SQLite (extend with new tables)
- `process.rs` — process management
- Chat UI, ApprovalOverlay, QuestionOverlay, streaming infrastructure
- All existing Tauri event/streaming architecture

### What Changes

- Sidebar: keep Chat/Work mode switcher. Chat stays simple (conversation list). Work mode gets: Agents → Sessions → Environments → Credentials → Memory → Analytics
- Coding tools move to `domains/coding` (kept but not the default)
- New RPA tools: screenshot (xcap), input simulation (enigo), browser (chromiumoxide), OCR
- New data model: automations, runs, run_steps, schedules, connectors tables
- New screens: Dashboard, AutomationList, AgentEditor, RunDetail
- Vocabulary: workspace → project, conversation → chat/draft, backend → runner

### Implementation Phases

1. **Foundation** — extract Tool trait, create domain structure, add RPA mode, screenshot tool, new DB tables, sidebar redesign
2. **Core RPA** — screen capture, browser automation, email/spreadsheet connectors, Dashboard, AutomationList, RunDetail, "Save as Automation" from chat
3. **Managed Agents** — agent CRUD, AgentEditor, scheduling (tokio-cron), Docker runner (bollard), agent lifecycle
4. **Polish + Enterprise** — audit trail, screenshot gallery, connector verification, agent templates, export/import, web app shared data model

### Full Design Document

See `apps/desktop/DESIGN.md` for complete screen layouts, data model, component mapping, and Rust module plan.
