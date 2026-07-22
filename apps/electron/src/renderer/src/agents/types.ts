import type { GoogleWorkspaceServiceId } from "../../../shared/google-workspace";
import type { HarnessMode } from "../../../shared/types";

export interface AgentDefinition {
  id: string;
  name: string;
  type: "agent";
  description: string;
  prompt: string;
  connectors: string[];
  appAccess?: GoogleWorkspaceServiceId[];
  modelId?: string;
  harness?: HarnessMode;
  color: "coral" | "blue" | "orange" | "pink";
  builtIn?: boolean;
}
