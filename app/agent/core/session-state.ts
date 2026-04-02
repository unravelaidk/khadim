import type { Message } from "@mariozechner/pi-ai";
import type { AgentId } from "../modes";

export interface SessionState {
  messages: Message[];
  currentAgent: AgentId;
  requestedMode: AgentId;
}
