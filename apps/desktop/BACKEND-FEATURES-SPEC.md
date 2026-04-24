# Khadim Desktop Backend Spec

## Scope

This document designs the desktop backend for five planned platform features:

1. Real scheduler engine
2. First-class run artifacts
3. Budgets and safety guardrails
4. Queue-based intake
5. Unified audit and health view

The design is grounded in the current Tauri backend under `apps/desktop/src-tauri/src`.

## Current Backend Assessment

Khadim already has a useful base:

- `managed_agents`, `environments`, `credentials`, `memory_stores`, `agent_runs`, and `agent_run_turns` are persisted already.
- `commands/rpa.rs` provides direct CRUD and run entrypoints.
- `agent_runner/local.rs` and `agent_runner/docker.rs` execute runs and emit normalized live events.
- `integrations/mod.rs` already has a registry, connection model, action execution, and `integration_logs`.
- `khadim_agent/orchestrator.rs` already produces structured tool lifecycle events.

The main backend constraints today:

1. The database migration model is destructive reset. `db/context.rs` drops and recreates all tables when `SCHEMA_VERSION` changes.
2. `commands/rpa.rs` is a wide command surface with business logic mixed into command handlers.
3. Managed-agent execution has no shared lifecycle service. Policy checks, artifact collection, queue claiming, and scheduling hooks do not have a common home.
4. `agent_runs` is too small to become the system of record for orchestration state.
5. Stopping runs is incomplete. `stop_agent_run` marks a run failed but does not reliably cancel runner processes.
6. Scheduling exists only as stored trigger metadata plus UI hints; there is no scheduler service.

## Design Goals

1. Keep the current desktop backend incremental rather than rewrite-first.
2. Make `agent_runs` the center of execution state.
3. Add cross-cutting runtime hooks once so scheduler, artifacts, budgets, queues, and audit all plug into the same lifecycle.
4. Preserve the existing live event shape where possible.
5. Move business logic out of Tauri commands into service modules.

## Recommended Refactor Before Feature Work

Before implementing the five features, refactor the backend into a small set of services.

Add a new module tree:

```text
apps/desktop/src-tauri/src/
  automation/
    mod.rs
    service.rs          # managed agent CRUD + validation
    run_service.rs      # create/start/stop/retry runs
    scheduler.rs        # cron/event wakeups
    budgets.rs          # policy evaluation
    artifacts.rs        # artifact persistence + collection
    queue.rs            # queue definitions and item claiming
    audit.rs            # run event persistence
    health.rs           # derived health snapshots
    types.rs            # shared DTOs and policy enums
```

This should not replace `agent_runner/` immediately. Instead:

- `commands/rpa.rs` should call `automation::service` and `automation::run_service`
- `run_service` should call the existing `agent_runner::{local,docker}` modules
- `agent_runner` should stop writing directly to DB except through shared lifecycle helpers

## Core Architectural Change

Introduce a shared execution lifecycle around every run.

Proposed lifecycle:

1. Resolve trigger source
2. Claim queue item if applicable
3. Evaluate budgets and approval policy
4. Create run record
5. Start runner
6. Persist normalized events during execution
7. Collect artifacts
8. Finalize queue item outcome
9. Update health snapshot
10. Emit done/error events

The current code only handles steps 4, 5, and part of 10.

## Data Model Changes

### 1. Extend `managed_agents`

Add fields:

- `is_enabled` INTEGER NOT NULL DEFAULT 1
- `scheduler_state` TEXT NULL
- `default_queue_id` TEXT NULL
- `budget_policy_json` TEXT NOT NULL DEFAULT '{}'
- `artifact_policy_json` TEXT NOT NULL DEFAULT '{}'
- `health_status` TEXT NOT NULL DEFAULT 'unknown'
- `health_reason` TEXT NULL
- `last_heartbeat_at` TEXT NULL
- `failure_streak` INTEGER NOT NULL DEFAULT 0

Reason:

- keep agent-level policy close to the agent definition
- support dashboard health without recalculating everything client-side

### 2. Extend `agent_runs`

Add fields:

- `trigger_id` TEXT NULL
- `queue_item_id` TEXT NULL
- `parent_run_id` TEXT NULL
- `attempt_number` INTEGER NOT NULL DEFAULT 1
- `policy_status` TEXT NOT NULL DEFAULT 'allowed'
- `approval_status` TEXT NOT NULL DEFAULT 'not_required'
- `budget_snapshot_json` TEXT NOT NULL DEFAULT '{}'
- `runner_session_id` TEXT NULL
- `runner_pid` TEXT NULL
- `work_dir` TEXT NULL
- `started_by` TEXT NULL
- `ended_reason` TEXT NULL
- `metrics_json` TEXT NOT NULL DEFAULT '{}'

Reason:

- make each run self-describing
- support retries, queue linkage, and future nested/delegated runs

### 3. Extend `agent_run_turns`

Add fields:

- `event_type` TEXT NULL
- `step_id` TEXT NULL
- `metadata_json` TEXT NULL

Reason:

- keep transcript rows useful for the audit timeline, not just assistant/tool text

### 4. New `run_events` table

Purpose: append-only audit/event stream persisted per run.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `run_id` TEXT NOT NULL
- `sequence_number` INTEGER NOT NULL
- `event_type` TEXT NOT NULL
- `source` TEXT NOT NULL
- `title` TEXT NULL
- `content` TEXT NULL
- `status` TEXT NULL
- `tool_name` TEXT NULL
- `risk_level` TEXT NULL
- `approval_id` TEXT NULL
- `artifact_id` TEXT NULL
- `queue_item_id` TEXT NULL
- `metadata_json` TEXT NOT NULL DEFAULT '{}'
- `created_at` TEXT NOT NULL

Reason:

- `agent_run_turns` should remain readable transcript data
- `run_events` becomes the authoritative audit log for UI timelines and debugging

### 5. New `artifacts` table

Purpose: first-class outputs produced by runs.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `run_id` TEXT NOT NULL
- `agent_id` TEXT NULL
- `kind` TEXT NOT NULL
- `label` TEXT NOT NULL
- `path` TEXT NULL
- `mime_type` TEXT NULL
- `size_bytes` INTEGER NULL
- `sha256` TEXT NULL
- `storage_type` TEXT NOT NULL
- `content_text` TEXT NULL
- `metadata_json` TEXT NOT NULL DEFAULT '{}'
- `created_at` TEXT NOT NULL

Artifact kinds should include:

- `file`
- `screenshot`
- `report`
- `table`
- `email_draft`
- `email_sent`
- `download`
- `log`
- `json_output`

Storage types:

- `filesystem`
- `inline_text`
- `inline_json`

### 6. New `schedules` table

Purpose: normalize scheduling away from `managed_agents.trigger_config`.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `agent_id` TEXT NOT NULL
- `kind` TEXT NOT NULL
- `cron_expr` TEXT NULL
- `timezone` TEXT NULL
- `event_key` TEXT NULL
- `is_paused` INTEGER NOT NULL DEFAULT 0
- `next_run_at` TEXT NULL
- `last_run_at` TEXT NULL
- `last_outcome` TEXT NULL
- `failure_streak` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Kinds:

- `cron`
- `event`
- `manual`

### 7. New `budget_ledger` table

Purpose: support hard budget enforcement and later analytics.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `agent_id` TEXT NULL
- `run_id` TEXT NULL
- `scope` TEXT NOT NULL
- `metric` TEXT NOT NULL
- `delta` REAL NOT NULL
- `window_key` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `metadata_json` TEXT NOT NULL DEFAULT '{}'

Metrics:

- `tokens_in`
- `tokens_out`
- `estimated_cost_usd`
- `runtime_seconds`
- `tool_calls`
- `mutating_actions`

### 8. New `approval_requests` table

Purpose: make approvals queryable and auditable, rather than only live UI state.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `run_id` TEXT NOT NULL
- `event_id` TEXT NULL
- `scope` TEXT NOT NULL
- `tool_name` TEXT NULL
- `action_title` TEXT NOT NULL
- `risk_level` TEXT NOT NULL
- `status` TEXT NOT NULL
- `requested_at` TEXT NOT NULL
- `resolved_at` TEXT NULL
- `resolution_note` TEXT NULL
- `metadata_json` TEXT NOT NULL DEFAULT '{}'

### 9. New queue tables

#### `queues`

- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `kind` TEXT NOT NULL
- `source_config_json` TEXT NOT NULL DEFAULT '{}'
- `claim_policy_json` TEXT NOT NULL DEFAULT '{}'
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

#### `queue_items`

- `id` TEXT PRIMARY KEY
- `queue_id` TEXT NOT NULL
- `status` TEXT NOT NULL
- `dedupe_key` TEXT NULL
- `payload_json` TEXT NOT NULL
- `priority` INTEGER NOT NULL DEFAULT 0
- `visible_at` TEXT NOT NULL
- `claimed_by_run_id` TEXT NULL
- `claimed_at` TEXT NULL
- `attempt_count` INTEGER NOT NULL DEFAULT 0
- `last_error` TEXT NULL
- `completed_at` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Statuses:

- `ready`
- `claimed`
- `completed`
- `failed`
- `dead_letter`

### 10. New `agent_health_snapshots` table

Purpose: retain health transitions and support analytics/history.

Suggested schema:

- `id` TEXT PRIMARY KEY
- `agent_id` TEXT NOT NULL
- `status` TEXT NOT NULL
- `reason` TEXT NULL
- `metrics_json` TEXT NOT NULL DEFAULT '{}'
- `created_at` TEXT NOT NULL

## Backend Services

### RunService

`automation/run_service.rs`

Responsibilities:

- validate that an agent can run
- resolve environment and policy state
- create run records
- dispatch to local/docker runner
- stop/retry runs
- update queue items and health on completion

Suggested API:

```rust
pub struct RunService { ... }

impl RunService {
    pub async fn start_agent_run(&self, req: StartRunRequest) -> Result<AgentRun, AppError>;
    pub async fn retry_run(&self, run_id: &str, from_turn: Option<i64>) -> Result<AgentRun, AppError>;
    pub async fn stop_run(&self, run_id: &str, reason: StopReason) -> Result<(), AppError>;
    pub fn handle_event(&self, event: PersistedRunEvent) -> Result<(), AppError>;
    pub fn finalize_run(&self, outcome: RunOutcome) -> Result<(), AppError>;
}
```

### SchedulerService

`automation/scheduler.rs`

Responsibilities:

- load enabled schedules on app startup
- wake due schedules
- create runs through `RunService`
- update `next_run_at`, `last_run_at`, `last_outcome`

Implementation note:

- use `tokio-cron-scheduler` for cron schedules
- do not make schedules call runners directly; always go through `RunService`

### ArtifactService

`automation/artifacts.rs`

Responsibilities:

- attach artifacts to runs during and after execution
- store artifact files under a deterministic local root, for example:

```text
~/.local/share/khadim/artifacts/<run-id>/...
```

- infer MIME type, hash, size, and metadata
- provide listing and read APIs later for UI

Artifact capture sources:

1. explicit tool output hooks
2. runner work directory scan at end of run
3. integration actions that create outputs
4. future screenshot/browser tools

### BudgetService

`automation/budgets.rs`

Responsibilities:

- evaluate whether a run may start
- track usage during execution
- stop runs when hard limits are exceeded
- write budget ledger entries

Initial supported policy fields:

- `max_tokens_per_run`
- `max_cost_usd_per_run`
- `max_runtime_seconds_per_run`
- `max_tool_calls_per_run`
- `max_mutations_per_run`
- `daily_cost_cap_usd`
- `daily_run_cap`
- `failure_backoff_threshold`

### QueueService

`automation/queue.rs`

Responsibilities:

- create queue definitions
- ingest queue items from triggers
- atomically claim items for runs
- complete/fail/requeue items
- support dead-letter handling

Initial queue kinds:

- `manual`
- `webhook`
- `integration_event`
- `file_drop`

The first implementation should avoid provider-specific ingestion daemons. Start with manual enqueue and webhook enqueue.

### AuditService

`automation/audit.rs`

Responsibilities:

- persist append-only `run_events`
- persist approval requests
- persist normalized lifecycle events from runners and integrations

Event categories:

- `run_created`
- `run_started`
- `step_started`
- `step_completed`
- `tool_called`
- `tool_failed`
- `approval_requested`
- `approval_resolved`
- `budget_blocked`
- `budget_exceeded`
- `artifact_created`
- `queue_claimed`
- `queue_completed`
- `queue_failed`
- `integration_action`
- `run_failed`
- `run_completed`

### HealthService

`automation/health.rs`

Responsibilities:

- derive agent health from recent runs, schedule misses, queue backlog, and credential/integration state
- update `managed_agents.health_status`
- record snapshots into `agent_health_snapshots`

Initial health statuses:

- `healthy`
- `degraded`
- `paused`
- `failing`
- `blocked`
- `unknown`

## Runner Integration Changes

The current `agent_runner/local.rs` and `agent_runner/docker.rs` should stay, but they need a shared lifecycle callback surface.

Add a trait:

```rust
pub trait RunLifecycleSink: Send + Sync {
    fn on_event(&self, event: PersistedRunEvent);
    fn on_usage(&self, run_id: &str, usage: UsageDelta);
    fn on_artifact(&self, artifact: PendingArtifact);
    fn should_stop(&self, run_id: &str) -> bool;
}
```

Then update runners to report through the sink instead of writing directly to transcript tables in ad hoc ways.

This enables:

- budget enforcement during a run
- artifact collection during a run
- audit/event persistence for every runner consistently
- a single stop mechanism

## Stop/Abort Refactor

Current issue:

- `stop_agent_run` changes DB state but does not reliably terminate the actual runner

Required change:

1. Track a cancellable handle per run, not just per Khadim session.
2. Store `runner_session_id` on `agent_runs`.
3. Introduce `RunController` state in memory:

```rust
pub struct RunController {
    pub run_id: String,
    pub runner_type: String,
    pub session_id: Option<String>,
    pub abort: AbortHandle,
}
```

4. `RunService::stop_run` must:
   - mark stop requested
   - abort runner task
   - finalize run with `ended_reason = 'aborted'`
   - release queue claims if needed

## Scheduling Design

### Scheduling rules

- only enabled agents with an active schedule are loaded into the scheduler
- missed runs are recorded as audit events
- scheduler never bypasses budgets or approvals
- scheduled runs should set `trigger = scheduled`

### Supported first version

1. cron schedules
2. manual runs
3. event-triggered runs through queue enqueue APIs

### Not in first version

- distributed scheduling
- exactly-once multi-node coordination
- cloud control plane scheduling

## Artifact Design

### Artifact capture policy

Each agent may define:

- whether to persist all outputs or only selected outputs
- whether to scan the run working directory at completion
- max artifact size
- whether sensitive content must be metadata-only

### First implementation sources

1. Runner completion scan:
   - files created or modified inside `work_dir`
2. Integration action hooks:
   - email drafts/sends
   - exported rows/reports
3. Explicit future tools:
   - screenshots
   - browser downloads

### Why this matters

The UI should not derive “results” by parsing transcript text. Results need their own model.

## Budget Design

### Enforcement points

1. pre-run admission check
2. mid-run periodic check on usage updates
3. post-run ledger write

### Policy outcomes

- `allowed`
- `warn`
- `blocked`
- `stopped`

### First implementation cost model

Use the current token cost estimation already present in the codebase. Persist estimated cost rather than waiting for provider-perfect billing.

## Queue Design

Queues should be generic ingestion channels, not workflow builders.

### Initial flow

1. queue item inserted
2. scheduler or event wakeup attempts claim
3. `RunService` atomically links claimed item to run
4. run succeeds or fails
5. queue item completed, retried, or dead-lettered

### Claiming rules

- only one active run may claim one queue item
- claim and run creation should happen in one DB transaction once migrations support safe transactional updates

## Audit and Health Design

The unified audit view should be built from `run_events`, `approval_requests`, `integration_logs`, and `artifacts`.

The health view should not be handwritten in the UI. It should come from backend-derived snapshots.

Health signals should include:

- last successful run age
- consecutive failures
- missed schedules
- queue backlog age
- missing or expired credentials
- integration test failures
- budget blocks

## Migration Strategy

Current destructive migrations are not acceptable for these features.

Before implementing any of the new tables, replace the reset migration flow with ordered, additive migrations.

Minimum requirement:

1. create a migration list with monotonic versions
2. each migration uses `ALTER TABLE` / `CREATE TABLE` / backfill where needed
3. preserve existing local data

This is the most important backend refactor because all five features rely on growing the schema safely.

## Recommended Implementation Order

### Phase 0: Backend refactor foundation

1. Replace destructive schema reset with additive migrations
2. Add `automation/` service layer
3. Move run startup/stop logic from `commands/rpa.rs` into `RunService`
4. Add per-run controller tracking for reliable cancellation

### Phase 1: Audit foundation

1. Add `run_events`
2. Add `approval_requests`
3. Route local/docker runner events through `AuditService`

This phase unlocks the unified audit and gives the later features a shared event pipeline.

### Phase 2: Scheduler

1. Add `schedules`
2. Add `SchedulerService`
3. Normalize current trigger config into schedules
4. Add cron startup and due-run execution

### Phase 3: Artifacts

1. Add `artifacts`
2. Add filesystem artifact storage root
3. Add run work-dir scanning and artifact registration
4. Add event emission for artifact creation

### Phase 4: Budgets

1. Add budget policy fields on agents
2. Add `budget_ledger`
3. Enforce pre-run and mid-run token/runtime limits

### Phase 5: Queues and health

1. Add `queues` and `queue_items`
2. Implement manual and webhook enqueue
3. Add health snapshots and derived status updater

## Concrete Refactors To Make First

These are the refactors I recommend before any feature-specific code:

1. `db/context.rs`
   Replace full schema drop/recreate migration logic.

2. `commands/rpa.rs`
   Keep command signatures, but delegate to services.

3. `agent_runner/local.rs` and `agent_runner/docker.rs`
   Stop letting them own lifecycle persistence directly. Route through a shared sink.

4. `KhadimManager`
   Extend it or add a sibling `RunRegistry` so managed runs can be cancelled reliably across all runner types.

5. `db.rs`
   Split the current broad `Database` API into smaller repository/service-facing groups as the new tables land.

## Suggested First Build Slice

The best first slice is not the scheduler itself. It is the backend foundation needed to support all five features.

Build first:

1. additive DB migrations
2. `automation/run_service.rs`
3. `run_events` persistence
4. reliable run cancellation

If this slice is done cleanly, scheduler, artifacts, budgets, queues, and health can all plug into the same execution path instead of each re-implementing run state.
