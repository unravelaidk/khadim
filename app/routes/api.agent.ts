import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { loadSkills } from "../agent/skills";
import { getAgentConfig } from "../agent/agents";
import { selectAgent, type AgentMode } from "../agent/router";
import {
  createJob,
  getJob,
  getJobByChatId,
} from "../lib/job-manager";
import type { AgentJob } from "../types/agent";
import { createId } from "@paralleldrive/cuid2";
import { decoratePromptWithBadges } from "../lib/badges";
import { loadChatHistory } from "../lib/chat-history";
import { createExistingJobStream, createNewJobStream } from "../agent/stream-utils";

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

  // Use utility to create stream
  return createExistingJobStream(job, request);
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
  await createJob(jobId, chatId || "default");

  // Get agent configuration
  const agentConfig = getAgentConfig(agentMode);

  // Load Skills and History
  const skillsContent = await loadSkills();
  const history = chatId ? await loadChatHistory(chatId) : [];

  // Use utility to create steam and start backend job
  return createNewJobStream(
    jobId,
    chatId || "default",
    agentMode,
    agentConfig.name,
    {
      jobId,
      chatId: chatId || "default",
      prompt,
      agentMode,
      agentConfig,
      skillsContent,
      history,
      existingSandboxId,
      apiKey,
      // abortSignal is attached inside createNewJobStream
    },
    request
  );
}
