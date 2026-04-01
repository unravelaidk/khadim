import { createSseEventFormatter, formatSseComment, getSseHeaders } from "../lib/sse";
import { getActiveJobsBySession, subscribe, subscribeToSession } from "../lib/job-manager";
import type { AgentJob, JobEvent } from "../types/agent";
import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { runAgentJob, type JobRunnerOptions } from "./job-runner";

const HEARTBEAT_INTERVAL_MS = 30000;
const CLIENT_TIMEOUT_MS = 60000;

interface StreamController {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  heartbeatTimer: NodeJS.Timeout | null;
  lastActivity: number;
  formatEvent: ReturnType<typeof createSseEventFormatter>["formatEvent"];
}

function createStreamController(controller: ReadableStreamDefaultController): StreamController {
  const formatter = createSseEventFormatter();

  return {
    controller,
    encoder: new TextEncoder(),
    heartbeatTimer: null,
    lastActivity: Date.now(),
    formatEvent: formatter.formatEvent,
  };
}

function sendEvent(stream: StreamController, type: string, data: Record<string, unknown>): void {
  try {
    const encoded = stream.encoder.encode(stream.formatEvent(type, data, { eventType: "message" }));
    stream.controller.enqueue(encoded);
    stream.lastActivity = Date.now();
  } catch (e) {
    console.warn("[Stream] Client disconnected");
    throw e;
  }
}

function sendJobEvent(stream: StreamController, event: JobEvent): void {
  sendEvent(stream, event.type, {
    jobId: event.jobId,
    chatId: event.chatId,
    sessionId: event.sessionId,
    ...event.data,
  });
}

function startHeartbeat(stream: StreamController): void {
  stream.heartbeatTimer = setInterval(() => {
    const now = Date.now();
    if (now - stream.lastActivity > CLIENT_TIMEOUT_MS) {
      console.warn("[Stream] Client timeout, closing connection");
      cleanupStream(stream);
      try {
        stream.controller.close();
      } catch {}
      return;
    }

    try {
      stream.controller.enqueue(stream.encoder.encode(formatSseComment(`heartbeat ${new Date().toISOString()}`)));
    } catch {
      cleanupStream(stream);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function cleanupStream(stream: StreamController): void {
  if (stream.heartbeatTimer) {
    clearInterval(stream.heartbeatTimer);
    stream.heartbeatTimer = null;
  }
}

function streamJobSnapshot(send: (type: string, data: Record<string, unknown>) => void, job: AgentJob) {
  send("job_snapshot", {
    jobId: job.id,
    chatId: job.chatId,
    sessionId: job.sessionId,
    status: job.status,
    steps: job.steps,
    finalContent: job.finalContent,
    previewUrl: job.previewUrl,
    sandboxId: job.sandboxId,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

export function createExistingJobStream(job: AgentJob, request: Request): Response {
  const stream = new ReadableStream({
    start(controller) {
      const streamCtrl = createStreamController(controller);
      const send = (type: string, data: Record<string, unknown>) => sendEvent(streamCtrl, type, data);

      const cleanup = () => {
        cleanupStream(streamCtrl);
        try {
          controller.close();
        } catch {}
      };

      try {
        startHeartbeat(streamCtrl);
        send("connected", { jobId: job.id, chatId: job.chatId, sessionId: job.sessionId });
        streamJobSnapshot(send, job);

        const unsubscribe = subscribe(job.id, (event) => {
          try {
            sendJobEvent(streamCtrl, event);
            if (event.type === "done" || event.type === "error") {
              cleanup();
            }
          } catch {
            cleanup();
          }
        });

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          cleanup();
        });
      } catch (e) {
        console.error("[Stream] Error in existing job stream:", e);
        cleanup();
      }
    },
  });

  return new Response(stream, { headers: getSseHeaders() });
}

export function createSessionStream(sessionId: string, request: Request): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const streamCtrl = createStreamController(controller);
      const send = (type: string, data: Record<string, unknown>) => sendEvent(streamCtrl, type, data);

      const cleanup = () => {
        cleanupStream(streamCtrl);
        try {
          controller.close();
        } catch {}
      };

      try {
        startHeartbeat(streamCtrl);
        send("session_connected", { sessionId });

        const activeJobs = await getActiveJobsBySession(sessionId);
        for (const job of activeJobs) {
          streamJobSnapshot(send, job);
        }

        const unsubscribe = subscribeToSession(sessionId, (event) => {
          try {
            sendJobEvent(streamCtrl, event);
          } catch {
            cleanup();
          }
        });

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          cleanup();
        });
      } catch (e) {
        console.error("[Stream] Error in session stream:", e);
        cleanup();
      }
    },
  });

  return new Response(stream, { headers: getSseHeaders() });
}

export function startJob(jobId: string, runnerOptions: JobRunnerOptions): void {
  const jobAbortController = new AbortController();
  registerJobAbortController(jobId, jobAbortController);

  const optionsWithSignal = { ...runnerOptions, abortSignal: jobAbortController.signal };

  runAgentJob(optionsWithSignal)
    .catch((error) => {
      console.error("[Stream] Background agent error:", error);
    })
    .finally(() => {
      unregisterJobAbortController(jobId);
    });
}
