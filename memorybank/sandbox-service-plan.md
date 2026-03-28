# Sandboxing Service Plan

## Goal
Build a production-grade, multi-tenant sandboxing platform as a core product, with strong isolation, fast startup, and clear API contracts for agent frameworks.

## Product Scope (v1 -> v3)

### v1 (MVP)
- Create/destroy sandbox sessions
- Run shell commands in sandbox
- Read/write/list files
- Stream stdout/stderr logs
- Basic quotas (CPU, memory, max runtime)
- API key auth

### v2 (Beta)
- Snapshot/restore
- Warm pool for faster startup
- Network egress policies (allowlist)
- Per-tenant limits and usage accounting
- WebSocket event stream and audit trail

### v3 (GA)
- Multi-region scheduling
- Policy engine (org/team level)
- Billing + metering pipeline
- SLOs, alerting, and abuse detection

## Recommended Stack

### Core Runtime + Control Plane
- Rust (Axum + Tokio)
- Firecracker microVMs (via firecracker-containerd first)
- containerd integration for OCI image workflow

### Product API + Dashboard + SDK site
- Bun + TypeScript
- React frontend for admin/customer dashboard
- OpenAPI-generated TypeScript SDK

### Data + Queue
- Postgres (tenants, sandboxes, jobs, usage, audits)
- Redis (queues, distributed locks, short-lived state)
- Object storage (snapshots/artifacts)

## High-Level Architecture

### Services
- `sandbox-api` (Bun/TS): public API gateway, auth, org/project routing
- `sandbox-control` (Rust): lifecycle manager, scheduler, policy checks
- `sandbox-worker` (Rust): host-level executor for VM create/exec/destroy
- `sandbox-stream` (Rust or TS): log/event streaming bridge
- `sandbox-metering` (TS/Rust): usage aggregation + billing export

### Key Domain Objects
- Tenant, Project, APIKey
- Sandbox (state machine: creating/running/stopping/stopped/failed)
- CommandRun
- FileOperation
- Snapshot
- UsageEvent
- AuditEvent

## API Design (Core Endpoints)

### Sandboxes
- `POST /v1/sandboxes` create
- `GET /v1/sandboxes/:id` status/details
- `DELETE /v1/sandboxes/:id` terminate

### Commands
- `POST /v1/sandboxes/:id/commands` run command
- `GET /v1/commands/:id` status/result
- `GET /v1/commands/:id/stream` live logs

### Files
- `GET /v1/sandboxes/:id/files?path=...` list/read
- `PUT /v1/sandboxes/:id/files?path=...` write
- `DELETE /v1/sandboxes/:id/files?path=...` delete

### Snapshots
- `POST /v1/sandboxes/:id/snapshots`
- `POST /v1/snapshots/:id/restore`

## Security Model

### Isolation
- One microVM per sandbox
- Dedicated jailer profile, seccomp, cgroups
- Read-only base image + writable overlay

### Network
- Default deny egress
- Policy-based allowlist per project
- Optional no-network mode

### Identity and Access
- API key scopes (`sandbox:create`, `sandbox:exec`, `sandbox:files`)
- Tenant/project isolation at every query boundary
- Full audit log for security-sensitive actions

## Reliability Model

### State Management
- Explicit sandbox state transitions with idempotent handlers
- Reconciliation loop to recover from worker/process crashes

### Timeouts and Limits
- Command timeout (hard kill)
- Sandbox TTL with auto-cleanup
- Max disk, max memory, max process count

### Observability
- Structured logs with request/sandbox correlation IDs
- Metrics: startup latency, exec latency, failure rate, host saturation
- Tracing across API -> control -> worker

## Execution Roadmap (12 Weeks)

### Phase 1 (Weeks 1-3): Foundations
- Define API contracts + OpenAPI
- Build auth + tenant/project model in Postgres
- Implement Rust control service skeleton

### Phase 2 (Weeks 4-6): Runtime MVP
- Firecracker/containerd integration
- Sandbox create/destroy + command execution
- File operations and streaming logs

### Phase 3 (Weeks 7-9): Hardening
- Quotas, TTL cleanup, retries
- Audit events + basic dashboard
- End-to-end tests for isolation and failure recovery

### Phase 4 (Weeks 10-12): Beta Readiness
- Warm pool for startup speed
- Snapshot/restore
- Metering pipeline + tenant usage views

## Integration Strategy for Khadim
- Keep current app repo focused on product features.
- Add a small sandbox client package in this repo that talks to new service API.
- Replace direct local sandbox calls with adapter interface:
  - `LocalSandboxAdapter` (existing)
  - `RemoteSandboxAdapter` (new service)

## Service Delivery Model

### Launch Modes
- Hosted SaaS (first): customers call managed API using API keys.
- Dedicated Cloud (second): isolated deployment per enterprise customer in dedicated VPC/account.
- Self-Hosted/Hybrid (later): customer runs control plane and workers in own environment.

### Rollout Path
- Start with private beta for hosted SaaS.
- Add usage metering, quotas, and billing plans.
- Introduce enterprise controls (SSO/SAML, policy bundles, dedicated clusters).
- Offer self-hosted only after platform reliability and operator tooling are mature.

## Open Source Strategy

### Product Model
- Open-core: open source the core runtime, local deploy path, and base APIs.
- Keep hosted operations and selected enterprise modules as managed offerings.

### License Plan
- Default for core: Apache-2.0 (adoption-friendly and ecosystem compatible).
- Optional enterprise-only modules can use different commercial licensing if needed.

### OSS Repository Layout
- `sandbox-core` (Rust control plane + worker + runtime contracts)
- `sandbox-api` (public API gateway and OpenAPI definitions)
- `sdk-js` and `sdk-python`
- `dashboard` (admin/customer UI)
- `deploy` (docker-compose + k8s manifests/helm)
- `examples` (agent framework integrations)

### OSS Day-1 Artifacts
- `README.md` with 5-minute quickstart.
- `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- Architecture and threat model docs.
- Issue/PR templates and public roadmap.
- Benchmark script with reproducible baseline results.

### Community and Adoption
- Prioritize local-first developer onboarding.
- Publish stable SDKs and integration examples for common agent stacks.
- Maintain a weekly changelog and transparent roadmap updates.

## Risks and Mitigations
- Firecracker operational complexity -> start with firecracker-containerd and narrow supported features.
- Multi-tenant escape risk -> least-privilege defaults, third-party security review before GA.
- Cold start latency -> warm pools + minimal base images.
- Noisy neighbor effects -> per-host scheduler constraints and strict cgroup budgets.

## Success Metrics
- p95 sandbox startup < 2.5s (warm) / < 8s (cold)
- p95 command start latency < 500ms after sandbox ready
- Sandbox escape incidents: 0
- Weekly active tenants and command success rate > 99%
