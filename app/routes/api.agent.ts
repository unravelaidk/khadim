import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { loadSkills } from "../agent/skills";
import { getAgentConfig } from "../agent/agents";
import { selectAgent, type AgentMode } from "../agent/router";
import { getActiveModel } from "../agent/model-manager";
import {
  createJob,
  getJob,
  getJobsByChatId,
} from "../lib/job-manager";
import type { AgentJob } from "../types/agent";
import { createId } from "@paralleldrive/cuid2";
import { decoratePromptWithBadges } from "../lib/badges";
import { loadChatHistory } from "../lib/chat-history";
import { startJob } from "../agent/stream-utils";

function isJobVisibleToSession(job: AgentJob, chatId?: string | null, sessionId?: string) {
  if (chatId && job.chatId !== chatId) return false;
  if (sessionId && job.sessionId !== sessionId) return false;
  return true;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const chatId = url.searchParams.get("chatId");
  const sessionId = url.searchParams.get("sessionId") || undefined;

  if (jobId) {
    const job = await getJob(jobId);
    if (!job || !isJobVisibleToSession(job, chatId, sessionId)) {
      return new Response(JSON.stringify({ error: "No active job found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return Response.json({ job });
  }

  if (!chatId) {
    return Response.json({ jobs: [] });
  }

  const jobs = await getJobsByChatId(chatId, sessionId);
  return Response.json({ jobs });
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
  const sessionId = formData.get("sessionId")?.toString() || "default";
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

  const activeModel = await getActiveModel();
  if (!activeModel) {
    return new Response(JSON.stringify({ error: "No active model configured. Add one in Settings first." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobId = createId();
  const resolvedChatId = chatId || "default";

  await createJob(jobId, resolvedChatId, sessionId);

  // Get agent configuration
  const agentConfig = getAgentConfig(agentMode);

  const skillsContent = await loadSkills();
  const history = chatId ? await loadChatHistory(chatId) : [];

  startJob(jobId, {
    jobId,
    chatId: resolvedChatId,
    sessionId,
    prompt,
    agentMode,
    agentConfig,
    skillsContent,
    history,
    existingSandboxId,
  });

  return Response.json({
    ok: true,
    jobId,
    chatId: resolvedChatId,
    sessionId,
    agentMode,
    agentName: agentConfig.name,
  });
}
