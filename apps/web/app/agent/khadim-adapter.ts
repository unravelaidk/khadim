/**
 * Khadim headless agent adapter.
 *
 * Calls the native `@unravelai/khadim` binary via `runAgent()`.
 */

import { runAgent as nativeRunAgent } from "@unravelai/khadim";
import type { AgentStreamEvent } from "@unravelai/khadim";
import { loadSkills } from "./skills";
import { loadChatHistory } from "../lib/chat-history";
import { buildUploadedDocumentsContext } from "../lib/uploaded-documents";
import type { AgentMode } from "./router";

export type { AgentStreamEvent };

export interface RunConfig {
  prompt: string;
  agentMode: AgentMode;
  skillsContent?: string;
  history?: any[];
  uploadedDocumentsContext?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface RunResult {
  output: string;
  events: AgentStreamEvent[];
}

export async function runAgent(config: RunConfig): Promise<RunResult> {
  const skills = config.skillsContent ?? await loadSkills().catch(() => "");
  const docs = config.uploadedDocumentsContext ?? "";

  const contextParts: string[] = [];
  if (skills) contextParts.push(skills);
  if (docs) contextParts.push(docs);

  const fullPrompt = contextParts.length > 0
    ? `${contextParts.join("\n\n")}\n\n---\n\nUser request: ${config.prompt}`
    : config.prompt;

  return nativeRunAgent({
    prompt: fullPrompt,
    cwd: config.cwd,
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    systemPrompt: config.systemPrompt,
    signal: config.signal,
  });
}
