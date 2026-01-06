# Chat/Agent Refactor Plan

- **Date:** 2024-05-21
- **Owner:** Codex (refactor focusing on chat/agent maintainability)
- **Goal:** Make the chat + agent flow easier to reason about by moving redundant utilities into `app/lib`, splitting long functions into focused modules, and exposing a clean agent API within `app/agent` that server routes and the frontend can depend on.

## Scope
- Server: `app/routes/api.agent.ts`, `api.agent.stop.ts`, `api.messages.ts`, `api.chats*.ts`.
- Agent runtime: `app/agent/*` (orchestrator, router, tools).
- Frontend: chat-facing pieces in `app/components/AgentBuilder.tsx`, hooks like `useAgentStream`.

## Plan
1) Audit current chat + agent flow: map request lifecycle (front-end -> routes -> agent orchestration) and list duplicated helpers and overlong functions (e.g., SSE helpers, sandbox lifecycle, job orchestration).
2) Define target module boundaries: 
   - `app/agent/api` (or similar) exposes start/stop/status functions wrapping orchestrator + job management.
   - `app/lib` holds shared utilities (SSE event formatter, sandbox cleanup scheduling, badge parsing, message history loading, etc.).
   - Split long functions (e.g., `runAgentInBackground`) into smaller units (setup, sandbox init, tool wiring, event handling, persistence).
   - Decide file moves/renames to minimize churn for consumers.
3) Extract shared utilities into `app/lib` and break apart long functions into focused helpers within new files (agent setup, event wiring, DB persistence, SSE streaming).
4) Refactor server routes to consume the new agent API/service and lib helpers (lean route handlers).
5) Update frontend chat components/hooks to use the clarified API surfaces (job subscription, agent start/stop), cleaning imports and removing redundant client-side helpers.
6) Regression pass: run targeted checks (typecheck/tests) and manual sanity for chat send, job subscription, agent stop, sandbox reuse.

## Risks / Considerations
- Keep SSE response shapes and job event payloads stable to avoid frontend breakage.
- Preserve sandbox reuse semantics and cleanup timing.
- Validate DB interactions when moving history/step persistence.
- Coordinate badge-driven mode selection so behavior stays consistent after extraction.

## Target Module Boundaries (detailed)
- `app/lib/sse.ts`: `formatSseEvent(type, data)` and maybe `sseStream(sendFn)` helper.
- `app/lib/badges.ts`: parse badge JSON → prompt decoration + mode hints (premade/category flags).
- `app/lib/chat-history.ts`: load chat messages → LangChain messages array.
- `app/agent/sandbox.ts`: sandbox init/reconnect + `scheduleSandboxCleanup`.
- `app/agent/job-runner.ts`: split `runAgentInBackground` into smaller helpers: setup sandbox, tool creation, orchestrator execution, event broadcasting, DB persistence.
- `app/agent/service.ts` (API surface): `startAgentJob`, `streamJob`, `stopJob` wrapping job-manager + job-runner; routes use this instead of inline logic.
- `app/lib/job-manager.ts`: keep Redis bits, maybe expose narrower interface consumed by service (no change yet).
