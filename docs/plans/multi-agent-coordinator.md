# Multi-Agent Coordinator — Implementation Plan

Status: approved design, ready for delegation
Target: `crates/khadim-coding-agent` (shared crate; CLI inherits via `run_prompt_with_runtime`)
Design summary: peer agents with a shared goal board, MAPF-inspired coordination over the
code AST graph (leases = vertex claims, CBS-lite conflict handling), a CPD-analog distance
index over the import graph for locality-based goal assignment, and configurable
propose-k search (System-2) triggered on goal-heuristic stall.

## Ground rules for all work packages

- **Do not break the existing single-agent path.** `run_prompt_with_runtime` signature and
  behavior with `RunConfig::default()` must remain stable. All new behavior is opt-in.
- Events use the existing string-typed `AgentStreamEvent`
  (`crates/khadim-coding-agent/src/events.rs`) — new event types are conventions
  (`event_type` string + `metadata` JSON), no enum changes needed.
- There is **no root workspace Cargo.toml** — crates are standalone with path deps.
  Build/test with `cargo test` inside each crate directory.
- Every WP ships with unit tests (`tempfile` is already a dev-dep for fixture dirs).
- Rust edition 2021, AGPL-3.0-only headers where the crate uses them.

## Dependency graph

```
WP1 (code-graph crate) ──► WP2 (GoalBoard + AST verification)
        │                        │
        ├──► WP4 (LeaseManager)  ├──► WP6 (propose-k search)
        └──► WP5 (import graph + CPD index + assignment)
WP3 (workers/streaming) ── independent of WP1
WP7 (coordinator entry + CLI) ◄── WP2 + WP3 (WP4/5/6 enhance it)
```

Parallelizable from the start: **WP1 and WP3**. Then WP2/WP4/WP5 in parallel. Then WP6, WP7.

---

## WP1 — New crate `crates/khadim-code-graph`

**Goal:** tree-sitter parsing layer: parse cache, node spans, checkable predicates.

**Create:**
- `crates/khadim-code-graph/Cargo.toml` — deps: `tree-sitter = "0.25"`, grammars
  `tree-sitter-rust = "0.24"`, `tree-sitter-typescript = "0.23"`,
  `tree-sitter-javascript = "0.23"`, `tree-sitter-python = "0.23"`,
  `tree-sitter-go = "0.23"` (match versions used in `apps/desktop/src-tauri/Cargo.toml:56-72`),
  plus `serde`, `serde_json`.
- `src/lib.rs` — public API surface.
- `src/parser.rs` — `LanguageRegistry` (extension → grammar), `ParseCache`
  (per-file `tree_sitter::Tree`, `reparse(path, new_source) -> Vec<ChangedRange>`, using
  tree-sitter incremental parsing; full reparse fallback is acceptable v1 as long as
  changed-range output is correct).
- `src/span.rs` — `NodePath` (stable path of `(kind, child_index)` from root),
  `NodeSpan { path: NodePath, byte_range: Range<usize> }`, resolution helpers
  (`span_at(byte_range) -> NodeSpan` returning the smallest enclosing named
  function/impl/class/module node).
- `src/predicates.rs` — `parse_valid(path) -> bool`,
  `symbols(path) -> Vec<Symbol { name, kind, signature, span }>` for functions, methods,
  impl blocks, classes, modules (per-language tree-sitter queries),
  `function_exists(path, name)`, `has_signature(path, name, sig_substring)`.

**Acceptance:**
- Fixture files in each of the 5 languages parse; symbol extraction returns correct
  names/ranges; editing a fixture and reparsing yields changed ranges covering the edit;
  `NodePath` resolution is stable across an unrelated edit elsewhere in the file.
- No dependency on `khadim-coding-agent` (dependency points the other way).

**Out of scope:** semantic analysis, name resolution, call graph (WP5), the other 11 grammars.

---

## WP2 — GoalBoard + AST goal verification

**Goal:** generalize `GoalTracker` into a shared, claimable goal board; replace substring
satisfaction matching with AST-verified satisfaction where applicable.

**Create:**
- `crates/khadim-coding-agent/src/agent/goal_board.rs` —
  `GoalStatus { Pending, Claimed { worker_id }, Satisfied, Blocked { reason } }`,
  `BoardGoal { goal: Goal, status, deps: Vec<GoalId> }`,
  `GoalBoard { goals, claim(), release(), satisfy(), ready_goals() (deps met + pending),
  heuristic() (count not Satisfied) }`. Shared as `Arc<RwLock<GoalBoard>>`.
  Constructor `GoalBoard::from_tracker(GoalTracker)`.

**Modify:**
- `crates/khadim-coding-agent/Cargo.toml` — add
  `khadim-code-graph = { version = "0.1.0", path = "../khadim-code-graph" }`.
- `crates/khadim-coding-agent/src/agent.rs` — declare `pub mod goal_board;`.
- `crates/khadim-coding-agent/src/agent/goal_tracker.rs` — keep `from_prompt()` extraction
  untouched. Extend satisfaction checking: for `GoalKind::CreateFile`/`ModifyFile` goals
  whose description names a symbol (backticked identifier), verify via
  `khadim_code_graph::predicates` (file parses + symbol exists) instead of/in addition to
  the current tool-output substring checks in `update_from_tool_json()`
  (goal_tracker.rs:239). Non-code goals keep existing behavior.
- `crates/khadim-coding-agent/src/agent/orchestrator.rs:405` — after
  `update_from_tool_json`, emit `goal_satisfied` event
  (`metadata: { goal_index, kind, description }`) when a goal transitions to satisfied.
- `crates/khadim-coding-agent/src/lib.rs` — export `GoalBoard`.

**Acceptance:**
- Existing goal_tracker tests still pass unchanged.
- New test: goal "create `foo.rs` with function `bar`" is NOT satisfied by a write that
  creates the file without the function, and IS satisfied once the function exists (AST check).
- GoalBoard claim/release/deps/ready_goals unit tests; concurrent claim from two tasks —
  exactly one wins.

---

## WP3 — Worker infrastructure (streaming, concurrent, permission-scoped)

**Goal:** replace the silent inline subagent loop with reusable, event-streaming worker
sessions; allow concurrent delegation.

**Create:**
- `crates/khadim-coding-agent/src/coordinator/mod.rs` — module skeleton
  (`pub mod worker;` for now).
- `crates/khadim-coding-agent/src/coordinator/worker.rs` —
  `WorkerSpec { worker_id, mode: AgentModeDefinition, task: String, write_scope: WriteScope }`
  where `WriteScope { ReadOnly, Paths(Vec<PathBuf>), All }`;
  `spawn_worker(spec, root, selection, tx) -> WorkerHandle { worker_id, join: JoinHandle<Result<String>> }`.
  Internally: build an `AgentRuntime` per scope (`new_read_only` for ReadOnly; for
  `Paths`, wrap `WriteTool`/`EditTool` with a path-guard decorator that rejects writes
  outside scope), own `KhadimSession`, run the loop via existing
  `run_prompt_with_runtime_and_explicit_mode`, forwarding every `AgentStreamEvent` to the
  parent `tx` with `metadata` augmented by `{ "worker_id": ..., "parent_session_id": ... }`
  and `event_type` prefixed convention `worker_event` wrapping the inner type, plus
  top-level `worker_spawned` / `worker_done` / `worker_failed` events.

**Modify:**
- `crates/khadim-coding-agent/src/tools.rs` — `DelegateTool` (tools.rs:1421-1549): delete
  the inline loop (1490-1545) and delegate to `coordinator::worker`. Add an
  `event_tx: Option<UnboundedSender<AgentStreamEvent>>` field; when present, subagent
  events stream instead of being discarded (the `Arc::new(|_event| {})` at tools.rs:1505
  goes away). Tool result stays the final findings text (LLM-facing contract unchanged).
- `crates/khadim-coding-agent/src/runtime.rs` — `AgentRuntime` gains
  `with_event_sink(tx)` builder so `default_tools`/`with_extras` can construct
  `DelegateTool` with the sink. Keep `AgentRuntime::new(root)` working (sink = None).
- `crates/khadim-coding-agent/src/agent/orchestrator.rs` — `RunConfig` gains
  `max_workers: usize` (default 3). In `run_prompt_with_runtime` (orchestrator.rs:454),
  pass the run's `tx` into the runtime sink if none set.
- Parallel-batch table (orchestrator.rs:225-363): keep `delegate_to_agent` serialized in
  this WP (concurrency arrives via the coordinator in WP7, not via parallel tool batching).

**Acceptance:**
- With a mock/stub client (follow patterns in `agent/orchestrator_tests.rs`), a delegated
  task emits `worker_spawned`, forwarded inner events with `worker_id` metadata, and
  `worker_done`.
- A `Paths`-scoped worker attempting to write outside scope gets a tool error, run continues.
- Two `spawn_worker` calls run concurrently (assert overlapping timestamps with a slow stub).

---

## WP4 — LeaseManager + AST-node-level conflict detection

**Goal:** MAPF vertex claims over AST subtrees; detect and surface edit conflicts.
Depends on WP1 (spans, reparse) and WP3 (worker identity).

**Create:**
- `crates/khadim-coding-agent/src/coordinator/lease.rs` —
  `Lease { worker_id, file: PathBuf, span: Option<NodeSpan> }` (span=None ⇒ whole file,
  used for new files), `LeaseManager` (`Arc<Mutex<...>>`):
  `claim(worker_id, file, span) -> Result<LeaseId, Conflict>` (overlap = same file AND
  byte-range/NodePath intersection), `release`, `release_worker`,
  `check_edit(worker_id, file, changed_ranges) -> Vec<Conflict>`.

**Modify:**
- `crates/khadim-coding-agent/src/tools.rs` — `WriteTool` (tools.rs:148) and `EditTool`
  (tools.rs:580) gain an optional `lease_guard: Option<Arc<LeaseGuard>>`
  (`LeaseGuard { manager, worker_id, parse_cache }`). Post-edit hook: incremental reparse
  via WP1 `ParseCache`, compute changed ranges, call `check_edit`. On conflict with
  another worker's lease: revert is NOT attempted — return tool error naming the
  conflicting lease and emit `lease_conflict` event
  (`metadata: { worker_id, other_worker_id, file, range }`). Unparseable/unknown-language
  files degrade to whole-file leases.
- `crates/khadim-coding-agent/src/coordinator/worker.rs` — `WorkerSpec` gains
  `leases: Vec<(PathBuf, Option<NodeSpan>)>`; `spawn_worker` claims them before start
  (claim failure ⇒ `worker_blocked` event + goal back to Pending) and releases on exit.
- `crates/khadim-coding-agent/src/coordinator/mod.rs` — `pub mod lease;`.

**Acceptance:**
- Two workers editing different functions in the same file: no conflict.
- Overlapping spans: second claim rejected; edit into another's span: tool error +
  `lease_conflict` event.
- Leases released on worker panic/abort (test via aborting the JoinHandle).

---

## WP5 — Import graph + CPD distance index + locality assignment

**Goal:** the CPD analog: precomputed distances over the module/import graph, used to
assign co-located goals to the same worker (conflict avoidance beats conflict resolution).
Depends on WP1; assignment API consumed by WP7.

**Create (in `khadim-code-graph`):**
- `src/graph.rs` — `CodeGraph`: nodes = files/modules, edges = imports (per-language
  queries: `use`/`import`/`from`/`require`) + heuristic name-matching call edges
  (callee identifier → defining file; document clearly that these are approximate).
  `build(root, ignore rules)` — reuse `ignore` crate conventions (already used by the
  agent crate) to skip node_modules/target/.git.
- `src/distance.rs` — `DistanceIndex`: all-pairs BFS hop distance over the undirected
  import graph (graphs are ~10^3 files; recompute is fine). `distance(a, b) -> Option<u32>`,
  `invalidate(changed_file)` + lazy rebuild.

**Create (in `khadim-coding-agent`):**
- `src/coordinator/assign.rs` — `assign(goals: &GoalBoard, graph: &DistanceIndex, max_workers) ->
  Vec<WorkerAssignment { goals: Vec<GoalId>, suggested_mode }>`:
  map each goal to target file(s) (from goal description paths), cluster goals by graph
  distance (simple agglomerative: merge clusters while inter-cluster distance ≤ D or
  worker budget exceeded), suggested mode via `mode_planner::determine_mode` on the
  goal descriptions. Goals with no file target go to a `general` worker.

**Acceptance:**
- Fixture mini-project (a few importing modules): distances correct; two goals touching
  the same module cluster together; unrelated goals split across workers; everything into
  one worker when `max_workers = 1`.

---

## WP6 — Propose-k search + `SearchMode`

**Goal:** System-2 layer: when progress stalls (or always, if configured), sample k
candidate next actions from the LLM and pick the best by symbolic score.
Depends on WP2 (heuristic history, predicates).

**Create:**
- `crates/khadim-coding-agent/src/coordinator/search.rs` —
  `propose_and_select(client, context, k, scorer) -> SelectedAction`:
  k parallel `client.stream` calls at elevated temperature requesting a structured JSON
  candidate (`{ action: tool_call | plan_note, rationale }`), scored by
  `Scorer { goal_delta (would this action plausibly satisfy a ready goal — match against
  GoalBoard targets), precondition_validity (khadim-code-graph predicates: target file
  parses, symbol exists for modify-goals), lease_compatibility (WP4, optional) }`.
  Ties → first candidate. All candidates + scores emitted as `search_candidates` event.

**Modify:**
- `crates/khadim-coding-agent/src/agent/orchestrator.rs` — `RunConfig` (orchestrator.rs:419)
  gains `search: SearchMode` with
  `enum SearchMode { Off, Stalled { turns: usize }, Always }` (default `Stalled { turns: 4 }`
  keeps current behavior effectively unchanged until a stall actually happens; document
  that `Off` is the true no-op). Track heuristic history per turn (value already computed
  for `goal_heuristic` events); on trigger, emit `search_engaged` and route the next turn
  through `propose_and_select` instead of a single stream call.
- `crates/khadim-coding-agent/src/lib.rs` — export `SearchMode`.

**Acceptance:**
- Stub-client test: heuristic flat for N turns ⇒ `search_engaged` emitted, k requests
  issued, highest-scoring candidate executed.
- `SearchMode::Off` ⇒ byte-identical behavior to today (regression test).
- `Always` ⇒ every turn goes through propose-k.

---

## WP7 — Coordinator entry point + LLM decomposition + CLI wiring

**Goal:** the top-level multi-agent run: decompose → assign → spawn → monitor → aggregate.
Depends on WP2 + WP3; uses WP4/WP5/WP6 when available.

**Create:**
- `crates/khadim-coding-agent/src/coordinator/mod.rs` — `run_multi_agent(session, prompt,
  selection, tx, runtime, MultiAgentConfig { max_workers, search, lease_granularity }) -> Result<String>`:
  1. Decompose: one LLM call requesting structured JSON goals
     (`[{ kind, description, target_files, deps }]`); on parse failure fall back to
     `GoalTracker::from_prompt` (never fail the run on decomposition).
  2. Populate `GoalBoard`; emit `goal_heuristic` with the board.
  3. Assign via WP5 (fallback: round-robin by goal order if graph unavailable).
  4. Spawn workers (WP3) with leases (WP4) derived from `target_files`/spans.
  5. Monitor: on `worker_done` verify claimed goals (WP2 AST verification); unsatisfied
     goals return to Pending and are reassigned (max 2 reassignments per goal, then
     `Blocked` + surfaced in the final report). On `lease_conflict`, CBS-lite: block the
     lower-priority worker's goal, constrain (drop the contested lease from its next
     attempt), reassign.
  6. Aggregate worker summaries + board state into the final assistant message; emit `done`.
- Tests: `src/coordinator/coordinator_tests.rs` with stub client (mirror
  `orchestrator_tests.rs` patterns).

**Modify:**
- `crates/khadim-coding-agent/src/lib.rs` — export `run_multi_agent`, `MultiAgentConfig`.
- `apps/khadim-cli/src/services/agent_service.rs` (currently calls
  `run_prompt_with_runtime` at :3-33) — add a multi-agent path behind a flag/setting
  (e.g. `--multi-agent` / settings key), defaulting to the existing single-agent path.
- `apps/khadim-cli/src/domain/events.rs` + `apps/khadim-cli/src/app.rs` — render the new
  event types (`worker_spawned/done/failed`, `worker_event`, `goal_satisfied`,
  `lease_conflict`, `search_engaged`, `search_candidates`); minimum viable: indented
  worker-prefixed lines in the transcript, no TUI redesign.

**Acceptance:**
- End-to-end stub test: 2-goal prompt ⇒ 2 workers, both goals verified, aggregated summary.
- Failure path: worker output that doesn't satisfy its goal triggers one reassignment,
  then Blocked and reported.
- CLI without the flag: behavior unchanged.

---

## Explicitly deferred (v2)

- **PathDb** (CPD learning layer): persist `(goal signature → plan fragment, cost,
  success rate)` from completed sessions; use as opening-move lookup + search prior.
- **Full CBS branching** (explore both conflict branches; v1 does single-branch
  block-and-reassign).
- Desktop app migration onto the shared crate (prerequisite for desktop multi-agent).
- Hunk-level lease refinement, worker-spawned sub-workers (depth > 1), remaining
  11 tree-sitter grammars.

---

## Status (landed on `feat/multi-agent-coordinator`)

WP1–WP7 implemented in-tree:

| WP | Component | Location |
|---|---|---|
| WP1 | `khadim-code-graph` (parse, spans, predicates) | `crates/khadim-code-graph/` |
| WP2 | GoalBoard + AST goal verification | `goal_board.rs`, `goal_tracker.rs` |
| WP3 | Streaming concurrent workers | `coordinator/worker.rs` |
| WP4 | LeaseManager + edit conflict hooks | `coordinator/lease.rs`, tools |
| WP5 | Import graph + CPD distances + assign | `graph.rs`, `distance.rs`, `assign.rs` |
| WP6 | Propose-k search + `SearchMode` | `coordinator/search.rs`, `RunConfig` |
| WP7 | Coordinator + CLI TUI (`/multi-agent`, shift-tab `multi`) | `coordinator/mod.rs`, CLI |

**Known issue (not fixed in this commit):** multi-agent mode always runs the
decompose → assign → spawn path. Simple prompts (e.g. “what’s in this dir”) can
be over-decomposed by the LLM into N similar goals and spawn redundant workers
that return near-identical answers. An auto-collapse experiment was tried and
**reverted** because it over-routed *all* multi-mode requests to single-agent.

---

## Planned: fan-out / decomposition evals (next)

Build a dedicated eval suite (unit + integration, no live LLM for CI) before
re-introducing smart single-vs-multi routing. Suggested cases:

### A. Decomposition quality (stub LLM JSON fixtures)
1. **Simple Q&A** — “what’s in this dir”, “list files”, “explain README” → expect
   ≤1 goal (or 1 general worker), no invented list/summarize/report split.
2. **Over-decomposition fixture** — model returns 3 near-duplicate general goals
   for a dir listing → policy must collapse or refuse multi-worker spawn.
3. **True parallel** — “create `a.rs` and `b.rs` with independent helpers” →
   ≥2 goals with distinct `target_files`, ≥2 workers.
4. **Sequential** — “add foo then run tests” → deps chain; either 1 worker or
   ordered waves, not 2 concurrent writers on the same file.
5. **Duplicate descriptions** — same goal text twice (case/whitespace) → dedupe.
6. **Empty / unparseable decomp** — fall back to `GoalTracker::from_prompt` /
   empty board without panicking.

### B. Fan-out policy (once reintroduced carefully)
7. **`FanoutDecision::Single` vs `Multi`** table-driven evals on goal sets.
8. **`effective_max_workers`** never exceeds independent root goals or config.
9. **Opt-in collapse** — default multi path unchanged; collapse only behind an
   explicit config flag so multi mode stays multi unless policy is confident.

### C. Integration (injectable decomposer + WorkerRunner)
10. Dir question with oversplit stub → at most 1 agent run (call-count ≤ 1).
11. Two-file create → ≥2 `worker_spawned`, both goals satisfied.
12. Unsatisfied goal → reassignment then `goal_blocked` (already covered).
13. Lease conflict between two workers on same span → `lease_conflict` event.

### D. Live / golden (optional, non-CI)
14. Small prompt suite against a real model; score: worker count, goal uniqueness
    (Jaccard of descriptions), user-visible duplicate answers.

**Acceptance for re-landing smart routing:** all A–C evals green; multi mode with
collapse disabled is bit-identical to current behavior; collapse enabled only
changes cases proven by evals.
