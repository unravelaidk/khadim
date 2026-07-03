---
title: Web control plane
description: Understand the React Router and Express web app direction.
---

The web app is Khadim's team and control-plane surface. It is designed for
shared agent runs, managed agents, dashboards, monitoring, and cloud or Docker
execution.

## Current state

The web app uses React Router and Express. It currently includes:

- Redis-backed snapshot and replay behavior for reconnecting clients.
- Live agent updates.
- A hand-rolled RPC layer that is being migrated to Hono RPC.
- Support for the same normalized event payloads used by other Khadim
  surfaces.
- Provider support aligned with the CLI and shared AI core.

## RPC migration

The migration plan adds a Hono app under `/api/rpc` while keeping React Router
for the main app routes.

Planned typed routes include:

- `job.start`
- `job.stop`
- `job.get`
- `chat.getActiveJobs`
- `session.getSnapshot`
- `session.replayEvents`

The migration keeps business logic in the existing agent RPC module and
replaces frontend fetch calls with the Hono typed client.

## WebSocket migration

The web app is moving live updates from SSE to WebSocket while preserving event
payload shapes.

The planned connection flow is:

1. Connect to `/api/agent/ws`.
2. Send `session.connect` with `{ sessionId, lastEventId? }`.
3. Replay missed events when `lastEventId` is present.
4. Use app-level `ping` and `pong` messages for liveness.
5. Reconnect on close.

## Runtime direction

The web app is intended to run agents through configured runners:

- Native binary for local development.
- Docker containers for isolated server execution.
- Cloud runners for managed deployments in later phases.

Read [Docker Agent Runtime](../reference/docker-agent-runtime/) for the
container runtime plan.
