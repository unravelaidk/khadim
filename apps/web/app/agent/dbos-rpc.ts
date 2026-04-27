/**
 * DBOS-backed RPC handlers for agent session execution.
 *
 * Replaces the Redis-backed ephemeral job system with DBOS durable workflows.
 * Keeps the same RPC method signatures (job.start, job.stop, job.get, etc.)
 * so the frontend and WebSocket layer require no changes.
 *
 * To switch between legacy (Redis) and DBOS execution, set:
 *   KHADIM_USE_DBOS=true
 */

import { createId } from "@paralleldrive/cuid2";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { runAgentSessionWorkflow, createSessionRecord } from "./dbos-workflows";
import { sessionEventBus, type SessionEvent } from "./dbos-stream";
import { db, sessions } from "../lib/db";
import { eq } from "drizzle-orm";
import { type AgentMode } from "./router";

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

export interface DbosRpcRequest {
  method: "job.start" | "job.stop" | "job.get" | "chat.getActiveJobs" | "session.getSnapshot" | "session.replayEvents";
  params: JsonObject;
}

export async function handleDbosRpc(request: DbosRpcRequest) {
  switch (request.method) {
    case "job.start": {
      const params = request.params as {
        prompt?: string;
        chatId?: string;
        sessionId?: string;
        agentMode?: AgentMode;
        documentIds?: string[];
      };
      const prompt = asString(params.prompt);
      if (!prompt) return failure(400, "Prompt is required");

      const jobId = createId();
      const chatId = asString(params.chatId) || "default";
      const sessionId = asString(params.sessionId) || `session_${jobId}`;
      const agentMode = (asString(params.agentMode) as AgentMode) || "build";

      // Create the session record in Postgres
      await createSessionRecord({
        sessionId,
        chatId,
        prompt,
        agentMode,
      });

      // Enqueue the DBOS workflow (runs on any available worker)
      const workflowHandle = await DBOS.startWorkflow(runAgentSessionWorkflow, {
        sessionId,
        jobId,
        chatId,
        prompt,
        agentMode,
        documentIds: params.documentIds,
      });

      // Store the workflow ID for later status queries
      await db
        .update(sessions)
        .set({ dbosWorkflowId: workflowHandle.workflowID })
        .where(eq(sessions.id, sessionId));

      return success({
        jobId,
        chatId,
        sessionId,
        agentMode,
        workflowId: workflowHandle.workflowID,
        agentName: agentMode,
      });
    }

    case "job.get": {
      const params = request.params as { jobId?: string; sessionId?: string };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!row) return failure(404, "Session not found");

      return success({
        job: {
          id: asString(params.jobId) || sessionId,
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
        },
      });
    }

    case "chat.getActiveJobs": {
      const params = request.params as { chatId?: string };
      const chatId = asString(params.chatId);
      if (!chatId) return success({ jobs: [] });

      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.chatId, chatId));

      const jobs = rows
        .filter((r) => r.status === "running" || r.status === "pending")
        .map((r) => ({
          id: r.id,
          chatId: r.chatId,
          sessionId: r.id,
          status: r.status,
          steps: [],
          finalContent: r.result ?? "",
          previewUrl: null,
          sandboxId: null,
          error: r.error ?? null,
          createdAt: r.createdAt?.toISOString() ?? "",
          updatedAt: r.updatedAt?.toISOString() ?? "",
        }));

      return success({ jobs });
    }

    case "session.getSnapshot": {
      const params = request.params as { sessionId?: string };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      const jobs = rows
        .filter((r) => r.status === "running" || r.status === "pending")
        .map((r) => ({
          id: r.id,
          chatId: r.chatId,
          sessionId: r.id,
          status: r.status,
          steps: [],
          finalContent: r.result ?? "",
          previewUrl: null,
          sandboxId: null,
          error: r.error ?? null,
          createdAt: r.createdAt?.toISOString() ?? "",
          updatedAt: r.updatedAt?.toISOString() ?? "",
        }));

      return success({
        snapshot: {
          sessionId,
          jobs,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    case "session.replayEvents": {
      // DBOS workflows are durable — all events are persisted as workflow events.
      // For real-time streaming, the sessionEventBus handles live delivery.
      // Reconnection replay can use DBOS.getWorkflowEvents() for the full history.
      const params = request.params as { sessionId?: string };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      // For now, return empty — live events are on the WebSocket.
      // TODO: replay from DBOS workflow events when Conductor is connected.
      return success({ events: [] });
    }

    case "job.stop": {
      const params = request.params as { sessionId?: string; jobId?: string };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      await db
        .update(sessions)
        .set({ status: "cancelled" })
        .where(eq(sessions.id, sessionId));

      return success({ ok: true });
    }
  }

  return failure(400, `Unsupported method: ${request.method}`);
}

export function isDbosEnabled(): boolean {
  return process.env.KHADIM_USE_DBOS === "true";
}
