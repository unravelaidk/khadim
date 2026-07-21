export interface AgentDefinition {
  id: string;
  name: string;
  type: "agent";
  description: string;
  prompt: string;
  connectors: string[];
  color: "coral" | "blue" | "orange" | "pink";
  builtIn?: boolean;
}
