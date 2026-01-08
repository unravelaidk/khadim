export interface AgentJobStep {
  id: string;
  title: string;
  status: "pending" | "running" | "complete" | "error";
  content?: string;
  result?: string;
  tool?: string;
}

export interface AgentJob {
  id: string;
  chatId: string;
  status: "running" | "completed" | "error" | "cancelled";
  steps: AgentJobStep[];
  finalContent: string;
  previewUrl: string | null;
  sandboxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  type: string;
  data: Record<string, unknown>;
}
