import { getAgentConfig } from "../agents";
import type { AgentMode } from "../router";
import { loadSkills } from "../skills";

export async function loadAgentResources(agentMode: AgentMode) {
  const [skillsContent] = await Promise.all([loadSkills()]);

  return {
    agentConfig: getAgentConfig(agentMode),
    skillsContent,
  };
}
