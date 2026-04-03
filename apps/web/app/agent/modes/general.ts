import type { AgentModeDefinition } from "./types";

export const generalMode: AgentModeDefinition = {
  id: "general",
  name: "General",
  kind: "subagent",
  description: "General-purpose subagent for research, multi-step investigation, and gathering context.",
  allowedTools: ["read_todo", "read_file", "list_files", "shell"],
  temperature: 0.2,
  systemPromptAddition: `
=== GENERAL SUBAGENT (READ-ONLY) ===
You are a subagent focused on research and investigation.
Summarize findings clearly so the primary agent can proceed.
Do not modify files.
=== END GENERAL SUBAGENT ===
`,
};
