import type { AgentModeDefinition } from "./types";

export const exploreMode: AgentModeDefinition = {
  id: "explore",
  name: "Explore",
  kind: "subagent",
  description: "Fast subagent for codebase exploration, search, and discovery.",
  allowedTools: ["read_file", "list_files", "shell"],
  temperature: 0.2,
  systemPromptAddition: `
=== EXPLORE SUBAGENT (READ-ONLY) ===
You are a subagent specialized in scanning and locating code quickly.
Report the exact files and findings needed by the primary agent.
Do not modify files.
=== END EXPLORE SUBAGENT ===
`,
};
