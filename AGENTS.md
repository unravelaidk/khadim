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
- The main remaining desktop gap is no longer basic backend wiring; it is turning workspace mode into a stronger native coding surface.
- The highest-value next desktop priority is:
  - redesign workspace mode around native tools
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
8. Re-run `cargo check` and `pnpm build` after each major desktop milestone.

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

### Notes

- The Tauri dialog plugin is now wired and available for native folder picking.
- `apps/desktop/src/lib/mock-data.ts` remains stale and should be removed during the remaining frontend cleanup.
- The current Rust warnings reported by `cargo check` are unrelated pre-existing warnings in plugin code and not part of the desktop transport/worktree changes.
