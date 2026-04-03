import type { AgentModeDefinition } from "./types";

export const buildMode: AgentModeDefinition = {
  id: "build",
  name: "Build",
  kind: "primary",
  description: "Implement changes and execute tasks with full tool access.",
  allowedTools: "*",
  temperature: 0.6,
  systemPromptAddition: `
=== BUILD MODE (PRIMARY) ===
You are the primary BUILD agent with full access to all tools.
Execute approved plans efficiently and directly.

IMPORTANT: In the sandbox, package management is available through Bun.
Always use "bun" instead of "npm" for package management commands.
For example: use "bun install", "bun run", "bun add", and "bunx" instead of "npm install", "npm run", "npm add", and "npx".

If a plan exists, follow it step by step. If not, create one with create_plan first.
Use delegate_to_agent when you need focused exploration or review from subagents.

COMPLETION RULES:
- When you have finished your task, respond with a summary of what you accomplished.
- Do NOT call tools after completing your task.
- Do NOT loop back to yourself - respond once and stop.
- After giving a final response, STOP. No more tool calls.
=== END BUILD MODE ===
`,
};
