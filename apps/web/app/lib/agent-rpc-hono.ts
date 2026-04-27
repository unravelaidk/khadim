import { getRequestListener } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { handleAgentRpc } from "./agent-rpc";
import { handleDbosRpc, isDbosEnabled } from "../agent/dbos-rpc";

const optionalString = z.string().min(1).optional();
const nullableString = z.string().min(1).nullable().optional();

const jobStartSchema = z.object({
  prompt: optionalString,
  sandboxId: optionalString,
  chatId: optionalString,
  sessionId: optionalString,
  badges: optionalString,
  documentIds: z.array(z.string().min(1)).optional(),
  agentMode: z.enum(["plan", "build", "chat"]).optional(),
});

const jobStopSchema = z.object({
  jobId: optionalString,
  chatId: nullableString,
  sessionId: optionalString,
});

const jobMessageSchema = z.object({
  jobId: optionalString,
  chatId: nullableString,
  sessionId: optionalString,
  prompt: optionalString,
});

const jobGetParamSchema = z.object({
  jobId: z.string().min(1),
});

const jobVisibilityQuerySchema = z.object({
  chatId: nullableString,
  sessionId: optionalString,
});

const activeJobsQuerySchema = z.object({
  chatId: optionalString,
  sessionId: optionalString,
});

const sessionSnapshotQuerySchema = z.object({
  sessionId: optionalString,
});

const sessionReplayQuerySchema = z.object({
  sessionId: optionalString,
  lastEventId: nullableString,
});

async function dispatch(method: string, params: Record<string, unknown>) {
  // Route to DBOS-backed handlers when KHADIM_USE_DBOS=true
  if (isDbosEnabled()) {
    const result = await handleDbosRpc({ method: method as any, params });
    if (!result.ok) return { body: result, status: result.status as 400 | 404 };
    return { body: result, status: 200 };
  }

  // Legacy Redis-backed handlers
  const result = await handleAgentRpc({ method: method as any, params });
  if (!result.ok) return { body: result, status: result.status as 400 | 404 };
  return { body: result, status: 200 };
}

export const agentRpcApp = new Hono()
  .post("/job/start", zValidator("json", jobStartSchema), async (c) => {
    const { body, status } = await dispatch("job.start", c.req.valid("json") as Record<string, unknown>);
    return c.json(body, status);
  })
  .post("/job/stop", zValidator("json", jobStopSchema), async (c) => {
    const { body, status } = await dispatch("job.stop", c.req.valid("json") as Record<string, unknown>);
    return c.json(body, status);
  })
  .post("/job/follow-up", zValidator("json", jobMessageSchema), async (c) => {
    const { body, status } = await dispatch("job.followUp", c.req.valid("json") as Record<string, unknown>);
    return c.json(body, status);
  })
  .post("/job/steer", zValidator("json", jobMessageSchema), async (c) => {
    const { body, status } = await dispatch("job.steer", c.req.valid("json") as Record<string, unknown>);
    return c.json(body, status);
  })
  .get(
    "/job/:jobId",
    zValidator("param", jobGetParamSchema),
    zValidator("query", jobVisibilityQuerySchema),
    async (c) => {
      const params = { ...c.req.valid("query"), jobId: c.req.valid("param").jobId };
      const { body, status } = await dispatch("job.get", params as Record<string, unknown>);
      return c.json(body, status);
    },
  )
  .get("/chat/active-jobs", zValidator("query", activeJobsQuerySchema), async (c) => {
    const { body, status } = await dispatch("chat.getActiveJobs", c.req.valid("query") as Record<string, unknown>);
    return c.json(body, status);
  })
  .get("/session/snapshot", zValidator("query", sessionSnapshotQuerySchema), async (c) => {
    const { body, status } = await dispatch("session.getSnapshot", c.req.valid("query") as Record<string, unknown>);
    return c.json(body, status);
  })
  .get("/session/replay-events", zValidator("query", sessionReplayQuerySchema), async (c) => {
    const { body, status } = await dispatch("session.replayEvents", c.req.valid("query") as Record<string, unknown>);
    return c.json(body, status);
  });

export type AgentRpcAppType = typeof agentRpcApp;

export const agentRpcRequestListener = getRequestListener(agentRpcApp.fetch);
