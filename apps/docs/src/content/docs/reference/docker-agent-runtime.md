---
title: Docker Agent Runtime
description: Run the Khadim CLI agent in Docker containers for server deployments and web app integration.
---

# Docker Agent Runtime — Implementation Plan

## Overview

Replace the current `spawn(binaryPath)` call in `@unravelai/khadim`'s `run-agent.ts` with `docker run khadim-cli`, so the web app spins up containers instead of running the native binary directly on the host.

## Current vs Target Flow

```
CURRENT:
  agent-rpc.ts (job.start)
    → startJob() → runAgentJob() (run-agent-job.ts)
      → runAgentStream() (@unravelai/khadim run-agent.ts)
        → spawn(binaryPath, args) — native binary on host
          → stdout: JSON lines of AgentStreamEvent

TARGET:
  agent-rpc.ts (job.start)
    → startJob() → runAgentJob()
      → runAgentStream() with useDocker=true
        → docker run --rm khadim-cli exec --json "prompt"
          → stdout: JSON lines of AgentStreamEvent (same contract)
```

## Files to Create

### 1. `apps/khadim-cli/Dockerfile`

Multi-stage build:

```dockerfile
# Stage 1: Build
FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl build-essential pkg-config libssl-dev libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /src
COPY . .
RUN cargo build --release --manifest-path apps/khadim-cli/Cargo.toml

# Stage 2: Minimal runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/apps/khadim-cli/target/release/khadim-cli /usr/local/bin/khadim-cli
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/khadim-cli"]
CMD ["exec"]
```

Build: `docker build -f apps/khadim-cli/Dockerfile -t khadim-cli .` (from repo root)

### 2. Add npm scripts to `apps/khadim-cli/package.json`

```json
"docker:build": "docker build -f Dockerfile -t khadim-cli ../..",
"docker:build:local": "docker build -f Dockerfile -t khadim-cli:latest ../.."
```

## Files to Modify

### 3. `apps/khadim-cli/src/run-agent.ts` — Add Docker support

- Add `useDocker?: boolean` and `dockerImage?: string` to `RunAgentOptions`
- When `useDocker` is true, replace `spawn(binaryPath, buildArgs(opts))` with:
  ```
  spawn("docker", [
    "run", "--rm", "-i",
    ...Object.entries(buildEnv(opts)).map(([k,v]) => `-e`).flat(),
    opts.dockerImage || "khadim-cli",
    "exec", "--json", opts.prompt
  ])
  ```
- Same stdout pipe, same `readline` JSON parsing — zero changes to the event stream contract
- Native tools (`KHADIM_NATIVE_TOOL_RPC_URL`) won't work in Docker mode unless the host is reachable from the container — gate this or use `host.docker.internal`

The `buildEnv()` function already maps `provider → env var` (e.g. `openai → OPENAI_API_KEY`). In Docker mode, these env vars are passed as `-e` flags. No new env var logic needed.

### 4. `apps/web/app/agent/run-agent-job.ts` — Pass Docker flag

- Accept `useDocker?: boolean` in `RunAgentJobOptions`
- Pass through to `runAgentStream({ prompt, useDocker: true, ... })`

### 5. `apps/web/app/lib/agent-rpc.ts` — Gate behind env var

- Check `process.env.KHADIM_AGENT_RUNNER === "docker"` to gate behavior
- Pass `useDocker: true` through the chain: `agent-rpc.ts → startJob() → runAgentJob() → runAgentStream()`

## Environment Variables for Docker Mode

| Env Var | Purpose |
|---------|---------|
| `KHADIM_AGENT_RUNNER` | Set to `"docker"` to use Docker instead of native binary |
| `OPENAI_API_KEY` | OpenAI auth (passed to container via `-e`) |
| `ANTHROPIC_API_KEY` | Anthropic auth (passed to container via `-e`) |
| `KHADIM_API_KEY` | Universal fallback (passed to container via `-e`) |
| etc. | All provider env vars forwarded from host via `buildEnv()` |

## CLI Binary Contract (unchanged)

The binary in batch mode writes one JSON event per line to stdout:

```
{"event_type":"text_delta","content":"Hello"}
{"event_type":"step_start","content":"Running tool","metadata":{"tool":"read_file"}}
{"event_type":"step_complete","content":"file contents","metadata":{"tool":"read_file"}}
{"event_type":"done"}
```

This format is identical whether the binary runs on the host or inside Docker. The `run-agent.ts` event parser and `run-agent-job.ts` broadcaster need no changes.
