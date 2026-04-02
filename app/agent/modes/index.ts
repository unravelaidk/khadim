import { buildMode } from "./build";
import { chatMode } from "./chat";
import { exploreMode } from "./explore";
import { generalMode } from "./general";
import { planMode } from "./plan";
import { reviewMode } from "./review";
import type { AgentId, AgentModeDefinition } from "./types";

export type { AgentId, AgentKind, AgentModeDefinition, AgentModeDefinition as AgentConfig } from "./types";

export const AGENT_MODES: Record<AgentId, AgentModeDefinition> = {
  build: buildMode,
  plan: planMode,
  chat: chatMode,
  general: generalMode,
  explore: exploreMode,
  review: reviewMode,
};

export const PRIMARY_AGENT_IDS: AgentId[] = ["build", "plan", "chat"];
export const SUBAGENT_IDS: AgentId[] = ["general", "explore", "review"];

export function getAgentMode(id: AgentId): AgentModeDefinition {
  return AGENT_MODES[id];
}

export function isSubagentMode(id: AgentId): boolean {
  return AGENT_MODES[id].kind === "subagent";
}

export function filterToolsForMode<T extends { name: string }>(tools: T[], id: AgentId): T[] {
  const config = AGENT_MODES[id];
  if (config.allowedTools === "*") {
    return tools;
  }
  return tools.filter((tool) => config.allowedTools.includes(tool.name));
}
