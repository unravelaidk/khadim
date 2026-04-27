/**
 * Khadim headless agent adapter.
 *
 * Calls the native `@unravelai/khadim` binary via `runAgent()`.
 * Use DBOS for durable execution, or call directly for ephemeral runs.
 *
 *   import { runAgent } from "@unravelai/khadim";
 */

import { runAgent as nativeRunAgent } from "@unravelai/khadim";
import type { AgentStreamEvent as NativeAgentEvent } from "@unravelai/khadim";
import { loadSkills } from "./skills";
import { loadChatHistory } from "../lib/chat-history";
import { buildUploadedDocumentsContext } from "../lib/uploaded-documents";
import type { AgentMode } from "./router";
import type { Message } from "@mariozechner/pi-ai";

export interface RunConfig {
  prompt: string;
  agentMode: AgentMode;
  skillsContent?: string;
  history?: Message[];
  uploadedDocumentsContext?: string;
  cwd?: string;
  signal?: AbortSignal;
}

export interface RunResult {
  output: string;
  events: NativeAgentEvent[];
}

export async function runAgent(config: RunConfig): Promise<RunResult> {
  // Load context (skills, history, documents) into the prompt
  const skills = config.skillsContent ?? await loadSkills().catch(() => "");
  const history = config.history ?? [];
  const docs = config.uploadedDocumentsContext ?? "";

  // Build context-aware prompt
  const contextParts: string[] = [];
  if (skills) contextParts.push(skills);
  if (docs) contextParts.push(docs);

  const fullPrompt = contextParts.length > 0
    ? `${contextParts.join("\n\n")}\n\n---\n\nUser request: ${config.prompt}`
    : config.prompt;

  return nativeRunAgent({
    prompt: fullPrompt,
    cwd: config.cwd,
    signal: config.signal,
  });
}

/**
 * Re-export useful types for DBOS workflows and stream consumers.
 */
export type AgentStreamEvent = NativeAgentEvent;
