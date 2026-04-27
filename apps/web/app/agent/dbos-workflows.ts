/**
 * DBOS Durable Workflow — agent session execution.
 *
 * Wraps `runAgent()` from khadim-adapter as a DBOS workflow so every
 * agent session automatically survives crashes and resumes from
 * the last completed step.
 *
 * Architecture:
 *   DBOS Workflow (this file)
 *       └─► DBOS Step: loadSessionContext()
 *       └─► DBOS Step: runAgent()          ← calls khadim-adapter
 *       └─► DBOS Step: saveSessionResult()
 *
 * When the khadim npm package gets a JS API, swap the import:
 *   from: "./khadim-adapter"
 *   to:   "@unravelai/khadim"  (or "@khadim/core")
 */

import { DBOS } from "@dbos-inc/dbos-sdk";
import { runAgent, type RunResult } from "./khadim-adapter";
import { sessionEventBus } from "./dbos-stream";
import { loadSkills } from "./skills";
import { loadChatHistory } from "../lib/chat-history";
import { buildUploadedDocumentsContext } from "../lib/uploaded-documents";
import { db, sessions, type NewSession } from "../lib/db";
import { eq } from "drizzle-orm";
import { type AgentMode } from "./router";
import type { StreamEvent } from "./core/agent-session";

interface SessionParams {
  sessionId: string;
  jobId: string;
  chatId: string;
  prompt: string;
  agentMode: AgentMode;
  documentIds?: string[];
  maxIterations?: number;
}

async function runAgentSessionImpl(params: SessionParams): Promise<RunResult & { sessionId: string }> {
  const { sessionId, jobId, chatId, prompt, agentMode, documentIds, maxIterations } = params;

  // Step 1: Load context
  const context = await DBOS.runStep(
    () => loadSessionState(sessionId, chatId, agentMode, documentIds),
    { name: "load_session_state" },
  );
  DBOS.setEvent(sessionId, "status", { status: "running", step: "context_loaded" });

  // Step 2: Run the agent (the heavy step — LLM calls + tool execution + sandbox)
  const result = await DBOS.runStep(
    () =>
      runAgent({
        prompt,
        agentMode,
        skillsContent: context.skillsContent,
        history: context.history,
        uploadedDocumentsContext: context.uploadedDocumentsContext,
        onEvent: (event: StreamEvent) => {
          sessionEventBus.emit(jobId, sessionId, {
            type: event.event,
            data: event.data ?? {},
            jobId,
            chatId,
            sessionId,
          });
        },
      }),
    { name: "run_agent", retries: 0 },
  );

  // Step 3: Persist the result
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

  DBOS.setEvent(sessionId, "status", { status: "completed" });
  return { ...result, sessionId };
}

async function loadSessionState(
  sessionId: string,
  chatId: string,
  _agentMode: AgentMode,
  documentIds?: string[],
) {
  const [skillsContent, history, uploadedDocumentsContext] = await Promise.all([
    loadSkills(),
    loadChatHistory(chatId),
    documentIds?.length ? buildUploadedDocumentsContext(chatId, documentIds) : Promise.resolve(""),
  ]);

  await db
    .update(sessions)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return { skillsContent, history, uploadedDocumentsContext };
}

/** Create a session record in the database (called by RPC before enqueueing). */
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

// Register with DBOS — discovered at DBOS.launch()
export const runAgentSessionWorkflow = DBOS.registerWorkflow(runAgentSessionImpl);
