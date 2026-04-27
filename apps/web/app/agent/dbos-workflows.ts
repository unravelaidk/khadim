/**
 * DBOS Durable Workflow — agent session execution.
 *
 * Wraps `runAgent()` from @unravelai/khadim as a DBOS workflow.
 *
 * Uses DBOS.writeStream / DBOS.readStream for real-time event streaming
 * instead of an in-memory EventEmitter (which wouldn't survive restarts).
 *
 * Architecture:
 *   @workflow runAgentSession
 *     └─ @step loadSessionState()
 *     └─ @step runAgent()           ← calls @unravelai/khadim --json
 *     └─ @step saveSessionResult()
 */

import { DBOS } from "@dbos-inc/dbos-sdk";
import { runAgent, type RunResult } from "./khadim-adapter";
import { loadSkills } from "./skills";
import { loadChatHistory } from "../lib/chat-history";
import { buildUploadedDocumentsContext } from "../lib/uploaded-documents";
import { db, sessions, type NewSession } from "../lib/db";
import { eq } from "drizzle-orm";
import { type AgentMode } from "./router";
import type { AgentStreamEvent } from "@unravelai/khadim";

export const STREAM_KEY = "events";

export interface SessionParams {
  sessionId: string;
  jobId: string;
  chatId: string;
  prompt: string;
  agentMode: AgentMode;
  documentIds?: string[];
}

async function runAgentSessionImpl(params: SessionParams): Promise<RunResult & { sessionId: string }> {
  const { sessionId, jobId, chatId, prompt, agentMode, documentIds } = params;

  // Report status as a durable event
  await DBOS.setEvent("status", { status: "running", step: "context_loading" });

  const context = await DBOS.runStep(
    () => loadSessionState(sessionId, chatId, documentIds),
    { name: "load_session_state" },
  );

  await DBOS.setEvent("status", { status: "running", step: "agent_running" });

  const result = await DBOS.runStep(
    () =>
      runAgent({
        prompt,
        agentMode,
        skillsContent: context.skillsContent,
        history: context.history,
        uploadedDocumentsContext: context.uploadedDocumentsContext,
      }),
    { name: "run_agent" },
  );

  // Write collected events to a stream for WebSocket clients
  for (const event of result.events) {
    await DBOS.writeStream(STREAM_KEY, event);
  }
  await DBOS.closeStream(STREAM_KEY);

  await DBOS.runStep(
    () =>
      db
        .update(sessions)
        .set({
          status: "completed",
          result: result.output,
          completedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId)),
    { name: "save_session_result" },
  );

  await DBOS.setEvent("status", { status: "completed" });
  return { ...result, sessionId };
}

async function loadSessionState(
  sessionId: string,
  chatId: string,
  documentIds?: string[],
) {
  const [skillsContent, history, uploadedDocumentsContext] = await Promise.all([
    loadSkills().catch(() => ""),
    loadChatHistory(chatId).catch(() => []),
    documentIds?.length
      ? buildUploadedDocumentsContext(chatId, documentIds).catch(() => "")
      : Promise.resolve(""),
  ]);

  await db
    .update(sessions)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return { skillsContent, history, uploadedDocumentsContext };
}

export async function createSessionRecord(params: {
  sessionId: string;
  agentId?: string;
  chatId: string;
  prompt: string;
  agentMode: AgentMode;
  dbosWorkflowId?: string;
}): Promise<void> {
  await db.insert(sessions).values({
    id: params.sessionId,
    agentId: params.agentId ?? null,
    chatId: params.chatId,
    prompt: params.prompt,
    mode: params.agentMode,
    dbosWorkflowId: params.dbosWorkflowId ?? null,
    status: "pending",
  } as NewSession);
}

export const runAgentSessionWorkflow = DBOS.registerWorkflow(runAgentSessionImpl);
