---
title: Programmatic API
description: Use @unravelai/khadim to embed the coding agent in your own Node.js application.
---

The `@unravelai/khadim` npm package exposes a programmatic API for embedding the coding agent into Node.js applications. You can run prompts headlessly, stream structured events, query provider/model catalogs, and bridge custom tools into the agent loop.

## Quick start

```ts
import { runAgent } from "@unravelai/khadim";

const { output, events } = await runAgent({
  prompt: "summarize this codebase",
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

console.log(output);
```

## runAgent()

Run a prompt and collect all events. Returns a promise with accumulated output and the full event list.

```ts
import { runAgent } from "@unravelai/khadim";

const result: AgentResult = await runAgent({
  prompt: "explain the architecture",
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: process.env.OPENAI_API_KEY,
  cwd: "/path/to/project",
});

// result.output  — concatenated text deltas (final assistant response)
// result.events  — all AgentStreamEvent objects in order
```

### AgentResult

| Field | Type | Description |
|-------|------|-------------|
| `output` | `string` | Concatenated `text_delta` content |
| `events` | `AgentStreamEvent[]` | All streaming events in order |

## runAgentStream()

Run a prompt as an async generator, yielding events as they arrive. Use this when you need real-time progress or want to handle events individually.

```ts
import { runAgentStream } from "@unravelai/khadim";

for await (const event of runAgentStream({
  prompt: "build a todo app",
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

## RunAgentOptions

Full options for both `runAgent()` and `runAgentStream()`:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `prompt` | `string` | Yes | The user prompt / task to execute |
| `provider` | `string` | No | AI provider ID (e.g. `"openai"`, `"anthropic"`) |
| `model` | `string` | No | Model ID (e.g. `"gpt-4.1-mini"`) |
| `apiKey` | `string` | No | API key injected into the child process env |
| `cwd` | `string` | No | Working directory for the agent |
| `session` | `string` | No | Load a saved session by name |
| `systemPrompt` | `string` | No | Override the system prompt for this run |
| `signal` | `AbortSignal` | No | AbortController signal to cancel the run |
| `nativeTools` | `NativeToolBridge[]` | No | Custom tools bridged from your application |

When `apiKey` and `provider` are both set, the package maps the provider to the correct environment variable (e.g. `openai` → `OPENAI_API_KEY`) and injects it into the spawned child process. Your parent process environment is not modified.

## AgentStreamEvent

Each event yielded by the stream:

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | `string` | Event type identifier |
| `content` | `string \| null` | Human-readable content |
| `metadata` | `Record<string, unknown> \| null` | Machine-readable metadata |
| `workspace_id` | `string \| null` | Workspace identifier |
| `session_id` | `string \| null` | Session identifier |

### Event types

| event_type | Meaning | Relevant fields |
|------------|---------|----------------|
| `text_delta` | Incremental assistant text | `content` |
| `step_start` | Tool execution starting | `content`, `metadata.tool`, `metadata.id` |
| `step_update` | Tool progress update | `content`, `metadata.id` |
| `step_complete` | Tool execution finished | `content` (result), `metadata.tool`, `metadata.is_error` |
| `mode_selected` | Agent mode chosen (auto) | `content` (reasoning), `metadata.mode` |
| `system_message` | System-level notification | `content` |
| `done` | Run completed successfully | — |
| `error` | Run failed | `content` (error message) |
| `usage` | Token usage snapshot/delta | `metadata` (input/output/cache_{read,write}/kind) |

## NativeToolBridge

Bridge custom tools from your application into the agent's tool loop. When `nativeTools` are provided, the package starts a local HTTP server that the binary calls for tool execution.

```ts
import { runAgentStream } from "@unravelai/khadim";

for await (const event of runAgentStream({
  prompt: "create a dashboard for my database",
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  nativeTools: [
    {
      name: "query_database",
      description: "Run a SQL query against the application database",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
        },
        required: ["sql"],
      },
      promptSnippet: "- query_database: Run SQL queries against the application database",
      execute: async (input) => {
        const sql = typeof input.sql === "string" ? input.sql : "";
        const rows = await myAppDb.query(sql);
        return {
          content: JSON.stringify(rows, null, 2),
          metadata: { rowCount: rows.length },
        };
      },
    },
  ],
})) {
  // Handle events as usual
}
```

### NativeToolBridge fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Tool name exposed to the agent |
| `description` | `string` | Tool description for the system prompt |
| `parameters` | `Record<string, unknown>` | JSON Schema for tool arguments |
| `promptSnippet` | `string` | One-line summary injected into the system prompt |
| `execute` | `(input: Record<string, unknown>) => Promise<{ content: string; metadata?: Record<string, unknown> }>` | Async tool implementation |

## Provider and model discovery

Query available providers and models without running an agent:

```ts
import { getProviders, getModels } from "@unravelai/khadim";

const providers = await getProviders();
// [{ id: "openai", name: "OpenAI" }, { id: "anthropic", name: "Anthropic" }, ...]

const models = await getModels("openai");
// [{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini" }, ...]
```

## Docker integration (coming soon)

Docker support is under active development. Once released, set `KHADIM_AGENT_RUNNER=docker` to run the agent in a container instead of the native binary — no platform-specific dependencies required.

```bash
# Build the image (from repo root)
docker build -f apps/khadim-cli/Dockerfile -t khadim-cli .

# Run a prompt in a container
echo "explain the architecture" | docker run --rm -i \
  -e OPENAI_API_KEY=sk-... \
  -v $(pwd):/workspace \
  khadim-cli exec --json
```

The container streams the same [AgentStreamEvent](/khadim/cli/programmatic-api/#agentstreamevent) JSON lines to stdout — no changes to your integration code.

## Cancellation

Pass an `AbortSignal` to cancel a running agent:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 30000);

try {
  await runAgent({
    prompt: "long running task",
    signal: controller.signal,
  });
} catch (err) {
  console.log("Timed out or cancelled");
}
```

The abort triggers `SIGTERM` on the child process, which the binary handles with a graceful shutdown (releasing the session lock and saving state).

## Error handling

- If the binary exits with a non-zero code, `runAgentStream()` throws an error with the exit code and stderr content.
- `error` events in the stream indicate agent-level failures (API errors, tool failures). These do not throw — they are emitted as events and the stream continues to `done`.
- Wrap calls in try/catch and inspect stream events for error details.
