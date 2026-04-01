import { getRequestListener } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { handleAgentRpc } from "./agent-rpc";

const optionalString = z.string().min(1).optional();
const nullableString = z.string().min(1).nullable().optional();

const jobStartSchema = z.object({
  prompt: optionalString,
  sandboxId: optionalString,
  chatId: optionalString,
  sessionId: optionalString,
  badges: optionalString,
  agentMode: z.enum(["plan", "build"]).optional(),
});

const jobStopSchema = z.object({
  jobId: optionalString,
  chatId: nullableString,
  sessionId: optionalString,
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

export const agentRpcApp = new Hono()
  .post("/job/start", zValidator("json", jobStartSchema), async (c) => {
    const result = await handleAgentRpc({
      method: "job.start",
      params: c.req.valid("json"),
    });

    if (!result.ok) {
      return c.json(result, { status: result.status as 400 | 404 });
    }

    return c.json(result, 200);
  })
  .post("/job/stop", zValidator("json", jobStopSchema), async (c) => {
    const result = await handleAgentRpc({
      method: "job.stop",
      params: c.req.valid("json"),
    });

    if (!result.ok) {
      return c.json(result, { status: result.status as 400 | 404 });
    }

    return c.json(result, 200);
  })
  .get(
    "/job/:jobId",
    zValidator("param", jobGetParamSchema),
    zValidator("query", jobVisibilityQuerySchema),
    async (c) => {
      const result = await handleAgentRpc({
        method: "job.get",
        params: {
          ...c.req.valid("query"),
          jobId: c.req.valid("param").jobId,
        },
      });

      if (!result.ok) {
        return c.json(result, { status: result.status as 400 | 404 });
      }

      return c.json(result, 200);
    },
  )
  .get("/chat/active-jobs", zValidator("query", activeJobsQuerySchema), async (c) => {
    const result = await handleAgentRpc({
      method: "chat.getActiveJobs",
      params: c.req.valid("query"),
    });

    if (!result.ok) {
      return c.json(result, { status: result.status as 400 | 404 });
    }

    return c.json(result, 200);
  })
  .get("/session/snapshot", zValidator("query", sessionSnapshotQuerySchema), async (c) => {
    const result = await handleAgentRpc({
      method: "session.getSnapshot",
      params: c.req.valid("query"),
    });

    if (!result.ok) {
      return c.json(result, { status: result.status as 400 | 404 });
    }

    return c.json(result, 200);
  })
  .get("/session/replay-events", zValidator("query", sessionReplayQuerySchema), async (c) => {
    const result = await handleAgentRpc({
      method: "session.replayEvents",
      params: c.req.valid("query"),
    });

    if (!result.ok) {
      return c.json(result, { status: result.status as 400 | 404 });
    }

    return c.json(result, 200);
  });

export type AgentRpcAppType = typeof agentRpcApp;

export const agentRpcRequestListener = getRequestListener(agentRpcApp.fetch);
