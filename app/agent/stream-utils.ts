import { formatSseEvent } from "../lib/sse";
import { subscribe } from "../lib/job-manager";
import type { AgentJob } from "../types/agent";
import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { runAgentJob, type JobRunnerOptions } from "./job-runner";

export function createExistingJobStream(job: AgentJob, request: Request): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(type, data)));
        } catch (e) {
          // Client disconnected
        }
      };

      // Send existing steps
      for (const step of job.steps) {
        send("step_start", { id: step.id, title: step.title });
        if (step.content) {
          send("step_update", { id: step.id, content: step.content });
        }
        if (step.status === "complete") {
          send("step_complete", { id: step.id, result: step.result });
        }
      }

      // If job is already completed, send done
      if (job.status === "completed") {
        send("done", { content: job.finalContent, previewUrl: job.previewUrl });
        try { controller.close(); } catch (e) {}
        return;
      }

      if (job.status === "error") {
        send("error", { message: job.error });
        try { controller.close(); } catch (e) {}
        return;
      }

      // Subscribe to real-time updates
      const unsubscribe = subscribe(job.id, (event) => {
        send(event.type, event.data);
        if (event.type === "done" || event.type === "error") {
          try { controller.close(); } catch (e) {}
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch (e) {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
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
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(type, data)));
        } catch (e) {
        }
      };

      send("job_created", { jobId, chatId });
      send("agent_mode", { mode: agentMode, name: agentName });

      const unsubscribe = subscribe(jobId, (event) => {
        send(event.type, event.data || {});
        if (event.type === "done" || event.type === "error") {
          try { controller.close(); } catch (e) {}
        }
      });

      const jobAbortController = new AbortController();
      registerJobAbortController(jobId, jobAbortController);

      const abortListener = () => jobAbortController.abort();
      request.signal.addEventListener("abort", abortListener);

      const optionsWithSignal = { ...runnerOptions, abortSignal: jobAbortController.signal };

      runAgentJob(optionsWithSignal).catch((error) => {
        console.error("Background agent error:", error);
        send("error", { message: "Internal agent error" });
      }).finally(() => {
        unregisterJobAbortController(jobId);
        request.signal.removeEventListener("abort", abortListener);
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch (e) {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
