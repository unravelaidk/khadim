import type { AgentId, AgentKind } from "../agent/agents";

export interface AgentProfile {
  id: AgentId;
  name: string;
  kind: AgentKind;
  description: string;
  tagline: string;
}

export const agentProfiles: AgentProfile[] = [
  {
    id: "build",
    name: "Build",
    kind: "primary",
    description: "Owns implementation threads and ships working changes.",
    tagline: "Turns requests into working output.",
  },
  {
    id: "plan",
    name: "Plan",
    kind: "primary",
    description: "Shapes rough ideas into actionable execution plans.",
    tagline: "Maps the path before work starts.",
  },
  {
    id: "chat",
    name: "Chat",
    kind: "primary",
    description: "Holds lighter conversations, drafting, and general guidance.",
    tagline: "A flexible conversational home base.",
  },
  {
    id: "general",
    name: "General",
    kind: "subagent",
    description: "Handles broad research and investigation inside deeper workflows.",
    tagline: "Useful when the thread needs extra context.",
  },
  {
    id: "explore",
    name: "Explore",
    kind: "subagent",
    description: "Scans codebases quickly and reports back targeted findings.",
    tagline: "Great for discovery-heavy threads.",
  },
  {
    id: "review",
    name: "Review",
    kind: "subagent",
    description: "Checks work for risks, gaps, and correctness before you move on.",
    tagline: "Best for second-pass scrutiny.",
  },
];

export function getAgentProfile(agentId?: string | null): AgentProfile | null {
  if (!agentId) return null;
  return agentProfiles.find((profile) => profile.id === agentId) ?? null;
}
