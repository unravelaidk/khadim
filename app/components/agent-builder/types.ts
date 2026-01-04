export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  thinkingSteps?: Array<{
    id: string;
    title: string;
    status: "pending" | "running" | "complete" | "error";
    content?: string;
    result?: string;
    // File editor support
    tool?: string;
    filename?: string;
    fileContent?: string;
  }>;
  previewUrl?: string;
  fileContent?: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
  personality: string;
}
