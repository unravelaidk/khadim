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

- Replaced the placeholder Tauri backend with a real Rust module structure:
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/error.rs`
  - `apps/desktop/src-tauri/src/git.rs`
  - `apps/desktop/src-tauri/src/health.rs`
  - `apps/desktop/src-tauri/src/opencode.rs`
  - `apps/desktop/src-tauri/src/process.rs`
- Added SQLite persistence using `rusqlite`.
- Added database tables for:
  - `workspaces`
  - `conversations`
  - `messages`
  - `settings`
- Added native git support for:
  - repo validation
  - repo info
  - branch listing
  - worktree listing
  - worktree create/remove
  - git status summary
  - diff stat
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
- Added process output event emission to the frontend via Tauri events:
  - `process-output`
  - `opencode-ready`
- Expanded Tauri commands in `apps/desktop/src-tauri/src/lib.rs` for:
  - runtime summary
  - workspace CRUD
  - git queries
  - conversation CRUD
  - message listing
  - OpenCode lifecycle and session operations
  - settings get/set
  - process listing
- Updated `apps/desktop/src/lib/bindings.ts` to include typed frontend bindings for the new Tauri commands and events.
- Rust side currently passes `cargo check` cleanly with no warnings.

### Current State

- Desktop backend foundation is in place and remains stable.
- Frontend runtime wiring has progressed beyond the original mock shell, but the UI migration is not complete.
- The desktop app is being aligned to the web app's glassmorphic design system instead of maintaining a separate visual language.
- The current desktop priority is:
  - finish the remaining UI migration to web-aligned styles
  - add a native folder picker for workspace creation
  - replace blocking message sends with async streaming updates from OpenCode

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
- `ChatMessage.tsx` was also made streaming-ready with support for an `isStreaming` presentation state.

### Remaining Desktop Work

1. Finish the remaining frontend migration in:
   - `apps/desktop/src/components/WorkspaceView.tsx`
   - `apps/desktop/src/App.tsx`
2. Integrate `WelcomeScreen` into the empty chat state and remove the remaining inline desktop-only styling.
3. Install and wire the Tauri dialog plugin so workspace creation can use a native folder picker.
4. After folder selection, call `git_list_branches` and populate the branch dropdown from the selected repository.
5. Replace the blocking OpenCode message flow with async send plus event streaming from OpenCode.
6. Consume OpenCode's `/event` stream on the Rust side and forward normalized live events to the frontend via Tauri events.
7. Update frontend bindings and chat state so text deltas, steps, tool activity, completion, and errors render live.
8. Delete stale `apps/desktop/src/lib/mock-data.ts` once the remaining references are fully gone.
9. Re-run `cargo check` and `pnpm build` after the remaining desktop changes land.

### Streaming Direction

- The desktop app should not keep the current blocking synchronous send path as the primary UX.
- OpenCode request flow should be based on:
  - `POST /session/:id/prompt_async`
  - `GET /event`
- The desktop frontend should receive normalized live events through Tauri in a shape consistent with the web app streaming model:
  - `text_delta`
  - `step_start`
  - `step_update`
  - `step_complete`
  - `done`
  - `error`

### Notes

- Tauri dialog plugin support still needs to be added in:
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/lib/mock-data.ts` is stale and should be removed as part of the frontend cleanup.
