---
title: Docker Agent Runtime
description: Run Khadim agents in Docker containers for isolation, server deployments, and web app integration.
---

The Docker Agent Runtime is the planned container execution path for Khadim.
It keeps the event stream unchanged while moving tool execution into an
isolated container.

<!-- prettier-ignore -->
> [!NOTE]
> This runtime is under active development. The current documentation describes
> the target contract and integration plan.

## Runtime model

The native path starts the Khadim binary directly on the host. The Docker path
starts the same agent inside a container:

```text
Web app or SDK
  -> runAgentStream()
  -> docker run khadim-cli exec --json "prompt"
  -> JSON-line AgentStreamEvent output
```

The caller still receives the same normalized event stream:

```json
{"event_type":"text_delta","content":"Hello"}
{"event_type":"step_start","content":"Running tool","metadata":{"tool":"read_file"}}
{"event_type":"step_complete","content":"file contents","metadata":{"tool":"read_file"}}
{"event_type":"done"}
```

## Why use Docker

Use the Docker runtime when a run needs stronger execution boundaries:

- Server deployments that cannot install a native binary globally.
- CI jobs that need reproducible runtime dependencies.
- Multi-tenant web app runs.
- RPA or connector runs that need explicit filesystem, network, and resource
  controls.
- Coding runs that need a mounted workspace but isolated process execution.

## Target Dockerfile

The planned image builds the CLI in one stage and copies the binary into a
small runtime image:

```dockerfile
FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl build-essential pkg-config libssl-dev libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /src
COPY . .
RUN cargo build --release --manifest-path apps/khadim-cli/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/apps/khadim-cli/target/release/khadim-cli \
    /usr/local/bin/khadim-cli
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/khadim-cli"]
CMD ["exec"]
```

Build the image from the repository root:

```bash
docker build -f apps/khadim-cli/Dockerfile -t khadim-cli .
```

## Environment variables

The runner passes only the variables needed by the selected provider and run.

| Variable | Purpose |
| --- | --- |
| `KHADIM_AGENT_RUNNER` | Set to `docker` to select Docker mode |
| `OPENAI_API_KEY` | OpenAI credential |
| `ANTHROPIC_API_KEY` | Anthropic credential |
| `GEMINI_API_KEY` | Gemini credential |
| `KHADIM_API_KEY` | Universal fallback credential |

Provider-specific variables follow the same names documented in
[Configuration](./configuration/).

## Workspace and network controls

The final runtime will formalize these inputs:

- Prompt and model settings.
- Environment variables and secret bindings.
- Workspace mounts for coding runs.
- Scratch mounts for RPA and connector runs.
- CPU, memory, and timeout limits.
- Network policy.
- Runner metadata for audit and replay.

## Native tools in Docker

Native tool bridges run in the host process. A containerized agent cannot call
them unless the host bridge is reachable from the container and the bridge URL
is intentionally passed into the container environment.

Use host-reachable bridge URLs only for trusted local runs.
