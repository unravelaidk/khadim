export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
  personality: string;
}
