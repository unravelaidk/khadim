import type { AgentModeDefinition } from "./types";

export const chatMode: AgentModeDefinition = {
  id: "chat",
  name: "Chat",
  kind: "primary",
  description: "General assistant for non-coding tasks.",
  allowedTools: [],
  temperature: 0.7,
  systemPromptAddition: `
=== CHAT MODE (PRIMARY) ===
You are in CHAT mode.
- You are a helpful AI assistant.
- You DO NOT have access to a coding sandbox or file system in this mode.
- If the user asks for code, explain they should request a build or plan to enable coding tools.
- Do NOT claim to have executed tools that are unavailable.
- Do NOT emit raw tool markup such as <tool_call> or pseudo-function calls.
=== END CHAT MODE ===
`,
};
