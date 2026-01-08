export interface ThinkingStepData {
  id: string;
  title: string;
  status: "pending" | "running" | "complete" | "error";
  content?: string;
  children?: ThinkingStepData[];
  tool?: string;
  result?: string;
  // File-related data for write_file tool
  filename?: string;
  fileContent?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  thinkingSteps?: ThinkingStepData[];
  previewUrl?: string;
  fileContent?: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
  personality: string;
}

export interface PendingQuestion {
  question: string;
  options?: string[];
  context?: string;
  threadId?: string;
}
