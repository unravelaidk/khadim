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
- Goal is to replace the current desktop mock shell with a real native runtime for workspace management and OpenCode integration.

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
- Improved worktree behavior in a t3code-like direction:
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
- Desktop `khadim` now supports workspace-level execution targets:
  - `local`
  - `sandbox`
- Sandbox mode for desktop `khadim` currently provides:
  - persistent per-workspace sandbox roots
  - first-run seeding from the selected cwd
  - `.git/` exclusion
  - sandbox-rooted file access
  - restricted command execution
  - explicit export back to the original workspace
- The main remaining desktop gap is no longer basic backend wiring; it is moving from an agent/worktree-centric workspace UX toward first-class environments, native tools, and stronger operational views.
- The highest-value next desktop priority is:
  - introduce first-class environments and runtime sessions
  - redesign workspace mode around native tools and environment context
  - add a monitor view for active agents
  - add a native terminal in workspace mode
  - add a native-speed file finder
  - replace the current lightweight git snapshot with a richer diff workspace

### Recent Desktop Update

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
- Added desktop `khadim` execution target support at the workspace level:
  - `local`
  - `sandbox`
- Added persistent sandbox metadata for desktop workspaces:
  - `sandbox_id`
  - `sandbox_root_path`
- Added a Khadim-specific local sandbox backend in:
  - `apps/desktop/src-tauri/src/sandbox.rs`
- Added sandbox lifecycle behavior for desktop `khadim`:
  - first-run sandbox root creation
  - seed sandbox from the selected source cwd
  - exclude `.git/` from seed copy
  - persistent sandbox reuse across reopened sessions
- Updated desktop `khadim` session creation to carry:
  - execution target
  - source cwd
  - sandbox id
  - effective cwd
- Refactored desktop `khadim` tool/runtime execution to be mode-aware:
  - direct mode uses the real workspace/worktree cwd
  - sandbox mode uses the persistent sandbox root
- Added sandbox file handoff support for desktop `khadim`:
  - `export_to_workspace`
- Added desktop UI support for workspace execution mode:
  - create workspace modal can choose `Direct` or `Sandbox`
  - workspace overview can switch execution mode
  - workspace overview displays sandbox root when present
- Verified the current desktop sandbox changes with:
  - `cargo check`
  - `bun run build`
- Added first-class desktop backend persistence for environments and runtime sessions:
  - `environments`
  - `runtime_sessions`
- Extended desktop conversation persistence so agents can attach to the new runtime model via:
  - `environment_id`
  - `runtime_session_id`
- Added desktop backend CRUD/helpers for environments and runtime sessions in:
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/commands/environment.rs`
- Added initial environment/session Tauri commands for desktop:
  - `list_environments`
  - `get_environment`
  - `create_environment`
  - `ensure_default_environment`
  - `delete_environment`
  - `list_runtime_sessions`
  - `get_runtime_session`
  - `create_runtime_session`
  - `delete_runtime_session`
  - `set_conversation_environment`
- Added environment-aware runtime wiring for desktop `khadim`:
  - sandboxed environments create and reuse their own persistent sandbox roots
  - `khadim` runtime sessions can create a real backend session immediately
  - workspace context resolution now prefers runtime session and environment cwd before conversation/worktree fallback
- Verified the initial environment/session backend foundation with:
  - `cargo check`
  - `bun run build`

### Remaining Desktop Work

1. Introduce first-class desktop `Environment` records above conversations/agents.
2. Introduce first-class runtime session records so agents can either:
   - create a fresh session
   - attach to an existing environment session
3. Add a new `Environments` tab in workspace mode.
4. Add a `Monitor` view for active agents that is more log/status-oriented than chat-oriented.
5. Rework agent creation so users can choose:
   - fresh environment
   - existing environment
   - fresh session
   - shared session
6. Move worktree and sandbox ownership toward environment scope instead of agent/workspace scope.
7. Finish the remaining workspace-mode frontend migration in:
   - `apps/desktop/src/components/WorkspaceView.tsx`
   - `apps/desktop/src/App.tsx`
8. Integrate `WelcomeScreen` into the empty chat state and remove the remaining inline desktop-only styling.
9. Remove stale `apps/desktop/src/lib/mock-data.ts` once all remaining references are gone.
10. Add a native PTY-backed terminal for workspace mode.
11. Add a native file finder / workspace search surface.
12. Replace the current lightweight git snapshot with a structured diff workspace.
13. Make terminal, finder, and diff resolve context from the active environment first.
14. Continue desktop sandbox hardening:
   - formal sandbox policy
   - audit logging
   - env allowlisting
   - network policy
   - export controls
15. Re-run `cargo check` and `bun run build` after each major desktop milestone.

### Native Workspace Build Plan

This plan is informed by how `pingdotgg/t3code` treats worktree-aware terminal state, indexed workspace search, and branch/worktree context — but is adapted to take stronger advantage of Rust in Tauri.

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

All three native tools should move toward resolving their context from the active environment first, then active session, then active agent, then workspace fallback.

Current resolver direction is still effectively:

- `agent.worktreePath ?? workspace.worktree_path ?? workspace.repo_path`

Target resolver direction should become closer to:

- `environment.effectiveCwd ?? session.backendSessionCwd ?? agent.worktreePath ?? workspace.worktree_path ?? workspace.repo_path`

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
- add orphaned worktree cleanup checks similar in spirit to t3code's thread cleanup flow

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

### Environments Direction

- Khadim desktop should move from the current flat `workspace -> conversation/agent -> backend session` model toward a first-class environment model.
- Recommended conceptual model:
  - `Workspace` = repo/home container
  - `Environment` = durable execution context
  - `Runtime session` = backend memory/tool session inside an environment
  - `Agent` = user-facing worker/thread attached to a session
- This is needed so users can:
  - create a fresh agent with a fresh environment/session
  - create a fresh agent inside an existing environment
  - attach multiple agents to the same environment
  - optionally allow multiple agents to share the same runtime session
- Environment should become the owner of:
  - cwd
  - worktree
  - sandbox
  - execution target
  - backend
- Session should become the owner of:
  - backend session identity
  - runtime memory/context
  - shared vs dedicated session semantics
- Agent should remain the user-facing object:
  - label
  - task
  - issue linkage
  - live status
  - chat surface

#### UI Direction

- Add a workspace `Environments` tab for managing execution contexts.
- Add a workspace `Monitor` view for supervising active agents in a live log/status-oriented surface.
- Keep agent chat as a focused drill-in surface rather than the main supervision view.
- New agent creation flow should support:
  - `Fresh environment`
  - `Existing environment`
  - `New session`
  - `Shared session`

#### Runtime / Substrate Direction

- Environments should not be defined by Wasm alone.
- Wasm is useful for plugins and narrowly scoped helper execution.
- Khadim environments should support multiple substrates over time:
  - `direct local`
  - `sandboxed local`
  - later `container`
- If users expect package installation and server-like setup, container-backed environments will likely be needed in a later phase.

#### Monitor View Direction

- Khadim should separate two distinct workspace experiences:
  - an operational monitor view for many active agents
  - a focused chat view for steering one selected agent
- The monitor view should be log/status-oriented and optimized for supervision rather than full transcript reading.
- For each active agent, monitor should show:
  - agent name
  - environment name
  - session/shared-session badge
  - branch/worktree/sandbox badges
  - current activity
  - recent steps or log tail
  - last event time
  - status (`queued`, `running`, `waiting`, `done`, `error`)
- Primary monitor actions should include:
  - `Open chat`
  - `Focus environment`
  - `Stop`
  - `Open diff`
  - `Open terminal`

### Notes

- The Tauri dialog plugin is now wired and available for native folder picking.
- `apps/desktop/src/lib/mock-data.ts` remains stale and should be removed during the remaining frontend cleanup.
- The current Rust warnings reported by `cargo check` are unrelated pre-existing warnings in plugin code and not part of the desktop transport/worktree changes.

---

## Obsidian Wiki Integration

When working with an Obsidian vault as workspace, the agent can leverage the [[obsidian-wiki-llm-knowledge-base]] pattern for knowledge compounding.

### Wiki Workflow for Agents

1. **Ingest** — New sources go to `raw/`, never modified after import
2. **Compile** — Agent synthesizes sources into `Wiki/sources/`, `Wiki/entities/`, `Wiki/concepts/`
3. **Link** — Cross-reference pages with `[[wikilinks]]` to create meaningful connections
4. **Index** — Keep `Wiki/index.md` updated for quick navigation
5. **Log** — Record operations in `Wiki/log.md` for auditability

### Relevant Tools

When the obsidian-wiki plugin is enabled:
- `plugin_obsidian_wiki_bootstrap_llm_wiki` — Initialize vault structure
- `plugin_obsidian_wiki_upsert_note` — Write wiki pages
- `plugin_obsidian_wiki_append_log_entry` — Record operations
- `plugin_obsidian_wiki_ensure_index_entry` — Update navigation
- `plugin_obsidian_wiki_wiki_health_check` — Verify wiki integrity

See `docs/obsidian-wiki-llm-knowledge-base.md` for full documentation.
