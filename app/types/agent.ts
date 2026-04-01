export interface AgentJobStep {
  id: string;
  title: string;
  status: "pending" | "running" | "complete" | "error";
  content?: string;
  result?: string;
  tool?: string;
  filename?: string;
  fileContent?: string;
}

export interface AgentJob {
  id: string;
  chatId: string;
  sessionId: string;
  status: "running" | "completed" | "error" | "cancelled";
  steps: AgentJobStep[];
  finalContent: string;
  previewUrl: string | null;
  fileContent?: string;
  sandboxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  type: string;
  data: Record<string, unknown>;
  jobId: string;
  chatId: string;
  sessionId: string;
  eventId?: string;
  sequence?: number;
}

export interface SessionStreamSnapshot {
  sessionId: string;
  snapshotEventId?: string;
  snapshotSequence?: number;
  jobs: AgentJob[];
  updatedAt: string;
}
