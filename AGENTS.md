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
