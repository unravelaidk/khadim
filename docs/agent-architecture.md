# Agent Architecture (OpenCode-inspired)

This project uses a multi-agent runtime modeled after OpenCode's primary/subagent split.

## Core concepts

- Primary agents handle the main conversation and decision-making.
- Subagents perform focused read-only work (search, review, investigation) and return findings.
- Tool access is scoped per agent; primary agents get the broadest access.
- Delegation flows return control to the primary agent after a subagent response.

## Agent types

Primary agents:
- build: full access, executes plans and writes code.
- plan: read-only planning, asks for approval, delegates to build.
- chat: non-coding conversation, no tools.

Subagents:
- general: read-only, multi-step investigation.
- explore: read-only, fast discovery and search.
- review: read-only, correctness and risk checks.

## Where to look in code

- Agent registry and prompts: `app/agent/agents.ts`
- Orchestrator and delegation flow: `app/agent/orchestrator.ts`
- Job runner and system prompt composition: `app/agent/job-runner.ts`
- Tool definitions: `app/agent/tools.ts`

## Delegation flow

1. A primary agent calls `delegate_to_agent` with a focused task.
2. The orchestrator switches to the subagent and injects the delegated task.
3. When the subagent responds (no tool calls), control returns to the primary agent.
4. The primary agent continues execution or responds to the user.

## Design notes

- Prompts and tool access are intentionally strict for subagents to avoid side effects.
- The plan agent is read-only and must delegate to build after approval.
- The build agent can invoke subagents for exploration or review as needed.
