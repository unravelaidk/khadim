/**
 * DBOS-backed RPC handlers for agent session execution.
 *
 * IMPORTANT: This module is dynamically imported by agent-rpc-hono.ts
 * to avoid double-registration of DBOS workflows through Vite's SSR pipeline.
 */

import { createId } from "@paralleldrive/cuid2";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { runAgentSessionWorkflow, createSessionRecord, STREAM_KEY } from "./dbos-workflows";
import { db, sessions } from "../lib/db";
import { eq } from "drizzle-orm";
import { type AgentMode } from "./router";
import type { AgentStreamEvent } from "@unravelai/khadim";

type JsonObject = Record<string, unknown>;

export function success<T extends JsonObject>(result: T) {
  return { ok: true as const, result };
}

export function failure(status: number, error: string) {
  return { ok: false as const, status, error };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function handleDbosRpc(method: string, params: JsonObject) {
  switch (method) {
    case "job.start": {
      const prompt = asString((params as any).prompt);
      if (!prompt) return failure(400, "Prompt is required");

      const jobId = createId();
      const chatId = asString((params as any).chatId) || "default";
      const sessionId = `session_${jobId}`;
      const agentMode = (asString((params as any).agentMode) as AgentMode) || "build";

      await createSessionRecord({
        sessionId,
        chatId,
        prompt,
        agentMode,
      });

      // Start workflow with a custom workflow ID (sessionId)
      const handle = await DBOS.startWorkflow(runAgentSessionWorkflow, {
        workflowID: sessionId,
      })({
        sessionId,
        jobId,
        chatId,
        prompt,
        agentMode,
        documentIds: (params as any).documentIds,
      });

      await db
        .update(sessions)
        .set({ dbosWorkflowId: handle.workflowID })
        .where(eq(sessions.id, sessionId));

      return success({
        jobId,
        chatId,
        sessionId,
        agentMode,
        workflowId: handle.workflowID,
        agentName: agentMode,
      });
    }

    case "job.get":
    case "chat.getActiveJobs":
    case "session.getSnapshot": {
      const sessionId = asString((params as any).sessionId);
      if (!sessionId) return success({ jobs: [] });

      const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!row) return success({ jobs: [] });

      const job = {
        id: sessionId,
        chatId: row.chatId,
        sessionId: row.id,
        status: row.status,
        steps: [],
        finalContent: row.result ?? "",
        previewUrl: null,
        sandboxId: null,
        error: row.error ?? null,
        createdAt: row.createdAt?.toISOString() ?? "",
        updatedAt: row.updatedAt?.toISOString() ?? "",
      };

      if (method === "session.getSnapshot") {
        return success({ snapshot: { sessionId, jobs: [job], updatedAt: new Date().toISOString() } });
      }
      if (method === "chat.getActiveJobs") {
        return success({ jobs: [job] });
      }
      return success({ job });
    }

    case "session.replayEvents": {
      const sessionId = asString((params as any).sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      // DBOS.readStream replays durable events since the last eventId
      const events: AgentStreamEvent[] = [];
      const lastEventId = asString((params as any).lastEventId);

      try {
        for await (const event of DBOS.readStream(sessionId, STREAM_KEY)) {
          if (lastEventId) {
            // DBOS streams don't support offset — replay all events
            // and the client deduplicates by eventId
          }
          events.push(event as AgentStreamEvent);
        }
      } catch {
        // Stream may not exist yet (workflow hasn't started)
      }

      return success({ events });
    }

    case "job.stop": {
      const sessionId = asString((params as any).sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      await db
        .update(sessions)
        .set({ status: "cancelled" })
        .where(eq(sessions.id, sessionId));

      try {
        await DBOS.cancelWorkflow(sessionId);
      } catch {
        // Workflow may not exist or already be done
      }

      return success({ ok: true });
    }
  }

  return failure(400, `Unsupported method: ${method}`);
}

export function isDbosEnabled(): boolean {
  return process.env.KHADIM_USE_DBOS === "true";
}

/**
 * Subscribe to real-time events from a DBOS workflow stream.
 * Yields events as they're written by the running agent session.
 */
export async function* streamSessionEvents(sessionId: string): AsyncGenerator<AgentStreamEvent> {
  for await (const event of DBOS.readStream(sessionId, STREAM_KEY)) {
    yield event as AgentStreamEvent;
  }
}
