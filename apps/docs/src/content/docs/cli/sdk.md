---
title: Khadim SDK (TypeScript)
description: The official Node.js / TypeScript SDK for embedding the Khadim coding agent into your own applications, services, and tools.
---

The Khadim TypeScript SDK ships in the same `@unravelai/khadim` npm package as the CLI. It is a thin, fully-typed layer over the agent binary, designed for embedding Khadim into Node.js services, IDE extensions, CI pipelines, and custom agent products.

> **Public beta.** The SDK surface is stable enough to build on but may evolve before 1.0. Pin a minor version in production.

## Overview

| Runtime               | What it does                                                                                          | When to use                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Local (native)**    | Spawns the platform-native `khadim` binary as a child process. Streams structured JSON events over stdout. | Default. Works anywhere Node.js runs and binaries are allowed. |
| **Local (Docker)**    | Spawns the agent inside a `khadim-cli` container. Same event stream, isolated FS and network.         | Preview. Locked-down hosts, multi-tenant CI, serverless.     |
| **Cloud / managed**   | Not available yet.                                                                                    | Planned for a later release.                                 |

Every surface in the SDK emits the same `AgentStreamEvent` JSON line format that `khadim exec --json` writes — nothing is hidden, nothing is proprietary to the SDK.

## Authentication

The SDK never stores keys. It passes them straight into the child process environment for the lifetime of a single run.

```ts
import { runAgent } from "@unravelai/khadim";

await runAgent({
  prompt: "Summarize this repo",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

When `provider` is set, `apiKey` is mapped to the canonical env variable that provider expects:

| Provider                      | Env variable injected             |
| ----------------------------- | --------------------------------- |
| `openai`                      | `OPENAI_API_KEY`                  |
| `anthropic`                   | `ANTHROPIC_API_KEY`               |
| `google`, `google-vertex`     | `GEMINI_API_KEY`                  |
| `groq`                        | `GROQ_API_KEY`                    |
| `xai`                         | `XAI_API_KEY`                     |
| `openrouter`                  | `OPENROUTER_API_KEY`              |
| `mistral`                     | `MISTRAL_API_KEY`                 |
| `github-copilot`              | `GITHUB_TOKEN`                    |
| `openai-codex`                | `OPENAI_CODEX_API_KEY`            |
| `cerebras`                    | `CEREBRAS_API_KEY`                |
| `huggingface`                 | `HF_TOKEN`                        |
| `kimi-coding`                 | `KIMI_API_KEY`                    |
| `minimax`, `minimax-cn`       | `MINIMAX_API_KEY` / `MINIMAX_CN_API_KEY` |
| `zai`                         | `ZAI_API_KEY`                     |
| `nvidia`                      | `NVIDIA_API_KEY`                  |
| `amazon-bedrock`              | `AWS_BEARER_TOKEN_BEDROCK`        |
| `azure-openai-responses`      | `AZURE_OPENAI_API_KEY`            |
| `opencode`, `opencode-go`     | `OPENCODE_API_KEY`                |
| `ollama`                      | _(none required)_                 |

If you omit `apiKey`, the child inherits the parent env and reads whichever standard variable applies — including the universal `KHADIM_API_KEY` fallback. Your parent process env is never mutated.

## Core concepts

- **Run.** A single invocation of the agent against a prompt. A run owns a child process, a working directory, and (optionally) a session.
- **Event.** Every observable step inside a run — incremental text, tool calls, usage snapshots, errors — surfaces as an `AgentStreamEvent`.
- **Session.** A named, persisted conversation on disk. Pass `session` to resume one across runs.
- **Native tool.** A function in your process that the agent can call. Bridged into the agent via a localhost RPC the SDK manages for you.

## Installation

```bash
npm install @unravelai/khadim
# or
bun add @unravelai/khadim
# or
pnpm add @unravelai/khadim
```

The post-install step downloads the correct native binary for your platform (Linux x64/arm64, macOS x64/arm64). There is no separate runtime to manage.

## Quick start

```ts
import { runAgent } from "@unravelai/khadim";

const { output } = await runAgent({
  prompt: "Summarize this codebase in three bullet points.",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

console.log(output);
```

That's the entire loop: prompt, provider, key. Khadim picks a default model, runs the agent in a child process, executes any tool calls it decides to make, and resolves once the run completes.

## Running agents

The SDK exposes two entry points covering the two common shapes:

| Function           | Returns                                       | Use when                                                       |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------- |
| `runAgent()`       | `Promise<AgentResult>` — buffered output      | You only need the final answer (scripts, batch jobs, scrapers).|
| `runAgentStream()` | `AsyncIterable<AgentStreamEvent>` — live feed | You need progress, UI updates, telemetry, or per-step hooks.   |

Both accept the same [`RunAgentOptions`](#runagentoptions).

### `runAgent()` — buffered

```ts
import { runAgent, type AgentResult } from "@unravelai/khadim";

const result: AgentResult = await runAgent({
  prompt: "Explain the architecture of this repo.",
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: process.env.OPENAI_API_KEY,
  cwd: "/path/to/project",
});

result.output; // final assistant text (all text_delta events concatenated)
result.events; // every event in order, for replay or audit
```

### `runAgentStream()` — streaming

```ts
import { runAgentStream } from "@unravelai/khadim";

for await (const event of runAgentStream({
  prompt: "Build a todo app in Bun.",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
})) {
  switch (event.event_type) {
    case "text_delta":
      process.stdout.write(event.content ?? "");
      break;
    case "step_start":
      console.log(`\n▶ ${event.content}`);
      break;
    case "step_complete":
      console.log(`\n✓ ${event.metadata?.tool}`);
      break;
    case "error":
      console.error(`\n✗ ${event.content}`);
      break;
    case "done":
      console.log("\nFinished.");
      break;
  }
}
```

The generator completes when the agent emits `done`, the run errors, or the caller aborts the signal — see [Cancelling a run](#cancelling-a-run).

### Working directory

Every run operates in a `cwd`. If you don't set one, the agent uses `process.cwd()`. For multi-repo orchestration, pass distinct `cwd` values per run.

```ts
await Promise.all([
  runAgent({ prompt: "audit deps", cwd: "/repos/api" }),
  runAgent({ prompt: "audit deps", cwd: "/repos/web" }),
]);
```

### Resuming a session

Pass the `session` option to attach a run to a named session on disk. The agent loads the existing transcript and continues from where it left off — same memory, same tool state.

```ts
await runAgent({
  prompt: "now write tests for the function we just added",
  session: "feature-checkout-flow",
});
```

Sessions are managed by the binary; the same names work from the CLI (`khadim --session feature-checkout-flow`).

### Overriding the system prompt

```ts
await runAgent({
  prompt: "/spec write a one-paragraph summary",
  systemPrompt: "You are an engineering manager writing standup notes. Be terse.",
});
```

`systemPrompt` overrides the default for this run only — no global state.

### Cancelling a run

Both entry points accept an `AbortSignal`. Aborting sends `SIGTERM` to the agent child, which performs a graceful shutdown (releases the session lock, persists state) before exiting.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000); // 30s budget

try {
  await runAgent({
    prompt: "long running task",
    signal: controller.signal,
  });
} catch (err) {
  console.log("Run cancelled or timed out:", err);
}
```

Aborting before the run starts is also safe — `runAgent()` rejects immediately.

### Per-run provider / model override

There is no global SDK config. Every call carries its own provider and model — pick at the call site, no shared state to reset.

```ts
const fast = { provider: "groq", model: "llama-3.3-70b", apiKey: process.env.GROQ_API_KEY };
const deep = { provider: "anthropic", model: "claude-opus-4", apiKey: process.env.ANTHROPIC_API_KEY };

await runAgent({ prompt: "classify these tickets", ...fast });
await runAgent({ prompt: "write the migration plan", ...deep });
```

## Stream events

Every event yielded by the stream shares the same shape:

```ts
interface AgentStreamEvent {
  event_type: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  workspace_id?: string | null;
  session_id?: string | null;
}
```

### Event types

| `event_type`      | Meaning                          | Relevant fields                                                |
| ----------------- | -------------------------------- | -------------------------------------------------------------- |
| `text_delta`      | Incremental assistant text       | `content`                                                      |
| `step_start`      | Tool execution is starting       | `content`, `metadata.tool`, `metadata.id`                      |
| `step_update`     | Tool progress update             | `content`, `metadata.id`                                       |
| `step_complete`   | Tool execution finished          | `content` (result), `metadata.tool`, `metadata.is_error`       |
| `mode_selected`   | Auto mode chose an agent mode    | `content` (reasoning), `metadata.mode`                         |
| `system_message`  | System-level notification        | `content`                                                      |
| `usage`           | Token usage snapshot / delta     | `metadata` (`input` / `output` / `cache_read` / `cache_write`) |
| `done`            | Run completed successfully       | —                                                              |
| `error`           | Run failed (agent-level)         | `content` (error message)                                      |

> The same JSON line schema is what `khadim exec --json` writes to stdout. Anything you build against the SDK can be wired to the CLI binary too, and vice versa.

## Custom tools

The SDK can expose **your own tools** to the agent. When `nativeTools` is non-empty, the SDK boots a local HTTP server with a bearer-token-authenticated endpoint that the binary calls whenever the model decides to invoke one of your tools.

```ts
import { runAgentStream, type NativeToolBridge } from "@unravelai/khadim";

const queryDatabase: NativeToolBridge = {
  name: "query_database",
  description: "Run a read-only SQL query against the application database.",
  parameters: {
    type: "object",
    properties: {
      sql: { type: "string", description: "SQL query to execute" },
    },
    required: ["sql"],
  },
  promptSnippet:
    "- query_database: Run read-only SQL queries against the application database.",
  execute: async (input) => {
    const sql = typeof input.sql === "string" ? input.sql : "";
    const rows = await myAppDb.query(sql);
    return {
      content: JSON.stringify(rows, null, 2),
      metadata: { rowCount: rows.length },
    };
  },
};

for await (const event of runAgentStream({
  prompt: "Show me a dashboard for active users today.",
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  nativeTools: [queryDatabase],
})) {
  // …
}
```

Custom tools run **in your process**, so they have full access to your application state, secrets, and connection pools — without the agent's child process ever seeing them. Throw from `execute` to signal a tool failure; the agent receives the error message and can react.

## Discovery: providers and models

Don't hard-code provider lists in your UI. Ask the SDK what's installed:

```ts
import { getProviders, getModels } from "@unravelai/khadim";

const providers = await getProviders();
// [{ id: "openai", name: "OpenAI" }, { id: "anthropic", name: "Anthropic" }, …]

const models = await getModels("openai");
// [{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini" }, …]
```

Use these to render provider/model pickers or to validate user input before kicking off a run.

### Locating the native binary

If you need to invoke the agent directly (e.g., from a non-Node process), `resolveBinaryPath()` returns the path the SDK itself uses:

```ts
import { resolveBinaryPath } from "@unravelai/khadim";

const bin = await resolveBinaryPath();
// /…/node_modules/@unravelai/khadim/bin/khadim-linux-x64
```

## Configuration reference

### `RunAgentOptions`

| Option         | Type                  | Required | Description                                                                 |
| -------------- | --------------------- | -------- | --------------------------------------------------------------------------- |
| `prompt`       | `string`              | Yes      | The user task. The only required field.                                     |
| `provider`     | `string`              | No       | Provider ID (e.g. `"openai"`, `"anthropic"`, `"groq"`).                     |
| `model`        | `string`              | No       | Model ID (e.g. `"gpt-4.1-mini"`).                                           |
| `apiKey`       | `string`              | No       | API key for the chosen provider. Injected into the child process only.      |
| `cwd`          | `string`              | No       | Working directory the agent operates in. Defaults to `process.cwd()`.       |
| `session`      | `string`              | No       | Name of a saved session to resume.                                          |
| `systemPrompt` | `string`              | No       | Override the system prompt for this single run.                             |
| `signal`       | `AbortSignal`         | No       | Cancellation signal — triggers a graceful shutdown of the child.            |
| `nativeTools`  | `NativeToolBridge[]`  | No       | Custom tools to expose to the agent. See [Custom tools](#custom-tools).     |

### `AgentResult`

| Field    | Type                  | Description                                            |
| -------- | --------------------- | ------------------------------------------------------ |
| `output` | `string`              | All `text_delta` content joined into the final answer. |
| `events` | `AgentStreamEvent[]`  | Full ordered event log — useful for replays and audit. |

### `AgentStreamEvent`

| Field          | Type                                  | Description                            |
| -------------- | ------------------------------------- | -------------------------------------- |
| `event_type`   | `string`                              | The event kind. See [Event types](#event-types). |
| `content`      | `string \| null`                      | Human-readable content for this event. |
| `metadata`     | `Record<string, unknown> \| null`     | Machine-readable details.              |
| `workspace_id` | `string \| null`                      | Workspace identifier.                  |
| `session_id`   | `string \| null`                      | Session identifier.                    |

### `NativeToolBridge`

| Field           | Type                                                                                                     | Description                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `name`          | `string`                                                                                                 | Tool name exposed to the agent.                          |
| `description`   | `string`                                                                                                 | Description appended to the agent's system prompt.       |
| `parameters`    | `Record<string, unknown>`                                                                                | JSON Schema describing the tool's arguments.             |
| `promptSnippet` | `string`                                                                                                 | Optional one-liner injected into the system prompt summary. |
| `execute`       | `(input: Record<string, unknown>) => Promise<{ content: string; metadata?: Record<string, unknown> }>`   | Async implementation. Throw to signal a tool failure.    |

### `ProviderInfo` / `ModelInfo`

```ts
interface ProviderInfo {
  id: string;
  name: string;
}

interface ModelInfo {
  id: string;
  name: string;
}
```

## Errors

The SDK separates **fatal** errors from **agent-level** errors:

- **Fatal** — the binary fails to start, crashes, or exits with a non-zero code. `runAgent()` rejects; `runAgentStream()` throws inside the iterator. The error message includes the exit code and any stderr content.
- **Agent-level** — the model hit an API error, a tool failed, or a provider rate-limited you. These surface as `error` events. The stream continues and ultimately resolves with `done`. Inspect them; don't `try/catch` them.

```ts
try {
  for await (const event of runAgentStream({ prompt })) {
    if (event.event_type === "error") {
      console.warn("Agent reported:", event.content);
    }
  }
} catch (fatal) {
  console.error("Khadim binary failed:", fatal);
}
```

## Docker runtime (preview)

Container support is in active development. When released, you will be able to spawn the agent inside a `khadim-cli` container instead of the native binary — useful when you can't ship platform binaries (serverless, locked-down hosts, multi-tenant CI).

```bash
# Build the image (from repo root)
docker build -f apps/khadim-cli/Dockerfile -t khadim-cli .

# Run a prompt in a container
echo "explain the architecture" | docker run --rm -i \
  -e OPENAI_API_KEY=sk-... \
  -v $(pwd):/workspace \
  khadim-cli exec --json
```

The container streams the same [`AgentStreamEvent`](#agentstreamevent) JSON lines to stdout — your SDK integration does not change.

## Known limitations

- **No cloud runtime yet.** Every run executes locally — either against the native binary or a Docker container you operate.
- **No `Agent.list()` / persistence API.** Run inspection and replay rely on the `events[]` you collect from `runAgent()` or the JSON lines streamed by `runAgentStream()`.
- **No subagents or hooks API.** Agent behaviour is controlled per-run via `systemPrompt`; cross-run policy boundaries are not yet exposed.
- **Native tools are per-run.** Tools live for the lifetime of the spawned child; there is no persistent tool registry.
- **Single concurrent run per session.** Two runs sharing the same `session` will contend for the on-disk lock — orchestrate explicitly.

## What's next

- **[CLI Overview](/khadim/cli/overview/)** — the same engine, driven from the terminal.
- **[Plugin SDK](/khadim/plugins/overview/)** — build sandboxed WebAssembly tools the agent can load at runtime.
- **[Docker Agent Runtime](/khadim/reference/docker-agent-runtime/)** — long-form notes on running Khadim in containers.
