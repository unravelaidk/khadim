export type AgentId = "build" | "plan" | "chat" | "general" | "explore" | "review";
export type AgentKind = "primary" | "subagent";

export interface AgentModeDefinition {
  id: AgentId;
  name: string;
  kind: AgentKind;
  description: string;
  allowedTools: string[] | "*";
  systemPromptAddition: string;
  temperature: number;
}
