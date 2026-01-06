import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { loadSkills } from "../agent/skills";
import { getAgentConfig } from "../agent/agents";
import { selectAgent, type AgentMode } from "../agent/router";
import {
  createJob,
  getJob,
  getJobByChatId,
  failJob,
  subscribe,
  type AgentJob,
} from "../lib/job-manager";
import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { createId } from "@paralleldrive/cuid2";
import { formatSseEvent } from "../lib/sse";
import { decoratePromptWithBadges } from "../lib/badges";
import { loadChatHistory } from "../lib/chat-history";
import { runAgentJob } from "../agent/job-runner";

// GET /api/agent?jobId=xxx - Subscribe to existing job updates
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const chatId = url.searchParams.get("chatId");

  // Find job by ID or chatId
  let job: AgentJob | null = null;
  if (jobId) {
    job = await getJob(jobId);
  } else if (chatId) {
    job = await getJobByChatId(chatId);
  }

  if (!job) {
    return new Response(JSON.stringify({ error: "No active job found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream existing steps and subscribe to updates
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
      for (const step of job!.steps) {
        send("step_start", { id: step.id, title: step.title });
        if (step.content) {
          send("step_update", { id: step.id, content: step.content });
        }
        if (step.status === "complete") {
          send("step_complete", { id: step.id, result: step.result });
        }
      }

      // If job is already completed, send done
      if (job!.status === "completed") {
        send("done", { content: job!.finalContent, previewUrl: job!.previewUrl });
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
        return;
      }

      if (job!.status === "error") {
        send("error", { message: job!.error });
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
        return;
      }

      // Subscribe to real-time updates
      const unsubscribe = subscribe(job!.id, (event) => {
        send(event.type, event.data);
        if (event.type === "done" || event.type === "error") {
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
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

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await request.formData();
  let prompt = formData.get("prompt")?.toString();
  const existingSandboxId = formData.get("sandboxId")?.toString();
  const chatId = formData.get("chatId")?.toString();
  const badgesJson = formData.get("badges")?.toString();

  // Handle Badges
  const badgeResult = decoratePromptWithBadges(prompt || "", badgesJson);
  prompt = badgeResult.prompt;
  const hasPremadeBadge = badgeResult.hasPremadeBadge;
  const hasCategoryBadge = badgeResult.hasCategoryBadge;

  // Agent mode: "plan", "build", or auto-select based on request
  const requestedMode = formData.get("agentMode")?.toString() as AgentMode | undefined;
  let agentMode: AgentMode = requestedMode || selectAgent(prompt || "");

  if (hasPremadeBadge) {
    agentMode = "build";
  } else if (hasCategoryBadge) {
    agentMode = "plan";
  }

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration: OPENROUTER_API_KEY missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create a job ID
  const jobId = createId();
  
  // Create job in Redis
  const job = await createJob(jobId, chatId || "default");

  // Get agent configuration
  const agentConfig = getAgentConfig(agentMode);

  // Load Skills and History
  const skillsContent = await loadSkills();
  const history = chatId ? await loadChatHistory(chatId) : [];

  // Return job ID immediately - client can subscribe to updates
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(type, data)));
        } catch (e) {
          // Client disconnected, but agent continues
        }
      };

      // Send job info immediately
      send("job_created", { jobId, chatId });
      send("agent_mode", { mode: agentMode, name: agentConfig.name });

      // Subscribe to job updates FIRST
      const unsubscribe = subscribe(jobId, (event) => {
        console.log("[SSE] Sending event:", event.type, event.data);
        send(event.type, event.data || {});
        if (event.type === "done" || event.type === "error") {
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        }
      });

      // NOW start the background job (after subscription is active)
      const jobAbortController = new AbortController();
      registerJobAbortController(jobId, jobAbortController);

      const abortListener = () => jobAbortController.abort();
      request.signal.addEventListener("abort", abortListener);

      runAgentJob({
        jobId,
        chatId: chatId || "default",
        prompt,
        agentMode,
        agentConfig,
        skillsContent,
        history,
        existingSandboxId,
        apiKey,
        abortSignal: jobAbortController.signal,
      }).catch((error) => {
        console.error("Background agent error:", error);
      }).finally(() => {
        unregisterJobAbortController(jobId);
        request.signal.removeEventListener("abort", abortListener);
      });

      // Handle client disconnect - agent continues running!
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
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
