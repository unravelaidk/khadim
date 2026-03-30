import { formatSseEvent, getSseHeaders, resetEventId, formatSseComment } from "../lib/sse";
import { subscribe } from "../lib/job-manager";
import type { AgentJob } from "../types/agent";
import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { runAgentJob, type JobRunnerOptions } from "./job-runner";

const HEARTBEAT_INTERVAL_MS = 30000;
const CLIENT_TIMEOUT_MS = 60000;

interface StreamController {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  heartbeatTimer: NodeJS.Timeout | null;
  lastActivity: number;
}

function createStreamController(controller: ReadableStreamDefaultController): StreamController {
  return {
    controller,
    encoder: new TextEncoder(),
    heartbeatTimer: null,
    lastActivity: Date.now(),
  };
}

function sendEvent(stream: StreamController, type: string, data: Record<string, unknown>): void {
  try {
    const encoded = stream.encoder.encode(formatSseEvent(type, data));
    stream.controller.enqueue(encoded);
    stream.lastActivity = Date.now();
  } catch (e) {
    console.warn("[Stream] Client disconnected");
    throw e;
  }
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

export function createExistingJobStream(job: AgentJob, request: Request): Response {
  resetEventId();

  const stream = new ReadableStream({
    start(controller) {
      const streamCtrl = createStreamController(controller);
      const encoder = streamCtrl.encoder;
      const send = (type: string, data: Record<string, unknown>) => sendEvent(streamCtrl, type, data);

      const cleanup = () => {
        cleanupStream(streamCtrl);
        try { controller.close(); } catch {}
      };

      const handleDisconnect = () => {
        console.log("[Stream] Client disconnected from existing job stream");
        cleanup();
      };

      try {
        startHeartbeat(streamCtrl);

        send("connected", { jobId: job.id });

        for (const step of job.steps) {
          send("step_start", { id: step.id, title: step.title });
          if (step.content) {
            send("step_update", { id: step.id, content: step.content });
          }
          if (step.status === "complete") {
            send("step_complete", { id: step.id, result: step.result });
          }
        }

        if (job.status === "completed") {
          send("done", { content: job.finalContent, previewUrl: job.previewUrl });
          cleanup();
          return;
        }

        if (job.status === "error") {
          send("error", { message: job.error });
          cleanup();
          return;
        }

        const unsubscribe = subscribe(job.id, (event) => {
          try {
            send(event.type, event.data as Record<string, unknown>);
            if (event.type === "done" || event.type === "error") {
              cleanup();
            }
          } catch {
            cleanup();
          }
        });

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          handleDisconnect();
        });
      } catch (e) {
        console.error("[Stream] Error in existing job stream:", e);
        cleanup();
      }
    },
    cancel() {
      console.log("[Stream] Stream cancelled");
    },
  });

  return new Response(stream, {
    headers: getSseHeaders(),
  });
}

export function createNewJobStream(
  jobId: string,
  chatId: string,
  agentMode: string,
  agentName: string,
  runnerOptions: JobRunnerOptions,
  request: Request
): Response {
  resetEventId();

  const stream = new ReadableStream({
    start(controller) {
      const streamCtrl = createStreamController(controller);
      const send = (type: string, data: Record<string, unknown>) => sendEvent(streamCtrl, type, data);

      const cleanup = () => {
        cleanupStream(streamCtrl);
        try { controller.close(); } catch {}
      };

      const handleDisconnect = () => {
        console.log("[Stream] Client disconnected from new job stream");
        cleanup();
      };

      try {
        startHeartbeat(streamCtrl);

        send("connected", { jobId, chatId });
        send("job_created", { jobId, chatId });
        send("agent_mode", { mode: agentMode, name: agentName });

        const unsubscribe = subscribe(jobId, (event) => {
          try {
            send(event.type, event.data || {});
            if (event.type === "done" || event.type === "error") {
              cleanup();
            }
          } catch {
            cleanup();
          }
        });

        const jobAbortController = new AbortController();
        registerJobAbortController(jobId, jobAbortController);

        const optionsWithSignal = { ...runnerOptions, abortSignal: jobAbortController.signal };

        runAgentJob(optionsWithSignal).catch((error) => {
          console.error("[Stream] Background agent error:", error);
          try {
            send("error", { message: "Internal agent error" });
          } catch {}
          cleanup();
        }).finally(() => {
          unregisterJobAbortController(jobId);
        });

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          handleDisconnect();
        });
      } catch (e) {
        console.error("[Stream] Error in new job stream:", e);
        cleanup();
      }
    },
    cancel() {
      console.log("[Stream] Stream cancelled");
    },
  });

  return new Response(stream, {
    headers: getSseHeaders(),
  });
}
