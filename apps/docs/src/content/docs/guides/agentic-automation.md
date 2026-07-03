---
title: Agentic automation
description: Use Khadim for tasks where an agent can inspect, act, recover, and retry.
---

Agentic automation is useful when a task cannot be described as a fixed list of
RPA blocks. Khadim gives the agent tools, context, and guardrails so it can
decide which actions to take at runtime.

## How a run works

A Khadim run follows the same loop across CLI, desktop, web, and SDK surfaces:

1. You provide a task, prompt, automation, or trigger.
2. Khadim builds the system prompt from the active mode, tools, project
   instructions, memory, and runtime settings.
3. The model replies with text, tool calls, or a question for the user.
4. Khadim executes tool calls, streams events, and returns observations to the
   model.
5. The loop continues until the agent emits `done` or an unrecoverable `error`.

## Good first tasks

Start with tasks that have clear evidence of completion:

- Summarize a repository.
- Find and fix one failing test.
- Convert a recurring shell workflow into a script.
- Extract data from a local file and produce a report.
- Inspect a screen and explain what action is needed.

## Use project instructions

Add `AGENTS.md` files to teach Khadim stable project conventions:

```md
# Agent instructions

- Use `bun test` for TypeScript changes.
- Keep migrations separate from application changes.
- Ask before running long integration tests.
```

Prefer durable facts and conventions. Avoid one-off instructions that only
apply to the current task.

## Choose the right surface

Use the surface that matches the task:

| Surface | Use when |
| --- | --- |
| CLI | You are working in a repository or scripting a one-off run |
| Desktop | The task needs local UI, screen, browser, or credential context |
| Web | A team needs monitoring, managed agents, or shared run history |
| SDK | Your application needs to embed Khadim as a capability |
| Docker | The run needs isolation, reproducibility, or server deployment |

## Keep automation observable

Prefer prompts that tell Khadim what evidence to collect:

```text
Fix the failing auth tests. Run the smallest relevant test command before and
after the change, then summarize the files changed and the test result.
```

This gives the agent a concrete completion target and gives you a useful audit
trail.
