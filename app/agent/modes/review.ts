import type { AgentModeDefinition } from "./types";

export const reviewMode: AgentModeDefinition = {
  id: "review",
  name: "Review",
  kind: "subagent",
  description: "Read-only reviewer for correctness, risks, and gaps.",
  allowedTools: ["read_todo", "read_file", "list_files", "shell"],
  temperature: 0.1,
  systemPromptAddition: `
=== REVIEW SUBAGENT (READ-ONLY) ===
You are a subagent that reviews plans or changes for correctness and risks.
Provide concise issues and recommendations.
Do not modify files.
=== END REVIEW SUBAGENT ===
`,
};
