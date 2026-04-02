import { createId } from "@paralleldrive/cuid2";
import { getAgentConfig } from "../agent/agents";
import { getActiveModel } from "../agent/model-manager";
import { selectAgent, type AgentMode } from "../agent/router";
import { loadSkills } from "../agent/skills";
import { startJob } from "../agent/stream-utils";
import { decoratePromptWithBadges } from "./badges";
import { loadChatHistory } from "./chat-history";
import { abortJob } from "./job-cancel";
import { buildUploadedDocumentsContext } from "./uploaded-documents";
import {
  cancelJob,
  createJob,
  getJob,
  getJobsByChatId,
  getSessionEventsSince,
  getSessionSnapshot,
} from "./job-manager";
import type { AgentJob } from "../types/agent";

type JsonObject = Record<string, unknown>;

export type AgentRpcMethod =
  | "job.start"
  | "job.stop"
  | "job.get"
  | "chat.getActiveJobs"
  | "session.getSnapshot"
  | "session.replayEvents";

export interface AgentRpcRequest<TParams = JsonObject> {
  method: AgentRpcMethod;
  params: TParams;
}

export interface AgentRpcSuccess<TResult = JsonObject> {
  ok: true;
  result: TResult;
}

export interface AgentRpcFailure {
  ok: false;
  error: string;
  status: number;
}

export type AgentRpcResponse<TResult = JsonObject> = AgentRpcSuccess<TResult> | AgentRpcFailure;

function isJobVisibleToSession(job: AgentJob, chatId?: string | null, sessionId?: string) {
  if (chatId && job.chatId !== chatId) return false;
  if (sessionId && job.sessionId !== sessionId) return false;
  return true;
}

function success<TResult extends JsonObject>(result: TResult): AgentRpcSuccess<TResult> {
  return { ok: true, result };
}

function failure(status: number, error: string): AgentRpcFailure {
  return { ok: false, status, error };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function handleAgentRpc(request: AgentRpcRequest): Promise<AgentRpcResponse> {
  switch (request.method) {
    case "job.get": {
      const params = request.params as { jobId?: string; chatId?: string | null; sessionId?: string };
      const jobId = asString(params.jobId);
      if (!jobId) return failure(400, "jobId is required");

      const job = await getJob(jobId);
      if (!job || !isJobVisibleToSession(job, params.chatId, params.sessionId)) {
        return failure(404, "No active job found");
      }

      return success({ job });
    }

    case "chat.getActiveJobs": {
      const params = request.params as { chatId?: string; sessionId?: string };
      const chatId = asString(params.chatId);
      if (!chatId) return success({ jobs: [] });

      const jobs = await getJobsByChatId(chatId, asString(params.sessionId));
      return success({ jobs });
    }

    case "session.getSnapshot": {
      const params = request.params as { sessionId?: string };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      const snapshot = await getSessionSnapshot(sessionId);
      return success({ snapshot });
    }

    case "session.replayEvents": {
      const params = request.params as { sessionId?: string; lastEventId?: string | null };
      const sessionId = asString(params.sessionId);
      if (!sessionId) return failure(400, "sessionId is required");

      const events = await getSessionEventsSince(sessionId, params.lastEventId ?? undefined);
      return success({ events });
    }

    case "job.start": {
      const params = request.params as {
        prompt?: string;
        sandboxId?: string;
        chatId?: string;
        sessionId?: string;
        badges?: string;
        documentIds?: string[];
        agentMode?: AgentMode;
      };
      let prompt = asString(params.prompt);
      const sessionId = asString(params.sessionId) || "default";

      const badgeResult = decoratePromptWithBadges(prompt || "", asString(params.badges));
      prompt = badgeResult.prompt;
      let agentMode: AgentMode = params.agentMode || selectAgent(prompt || "");

      if (badgeResult.hasPremadeBadge) {
        agentMode = "build";
      } else if (badgeResult.hasCategoryBadge) {
        agentMode = "plan";
      }

      if (!prompt) {
        return failure(400, "Prompt is required");
      }

      const activeModel = await getActiveModel();
      if (!activeModel) {
        return failure(400, "No active model configured. Add one in Settings first.");
      }

      const jobId = createId();
      const resolvedChatId = asString(params.chatId) || "default";
      const uploadedDocumentsContext = Array.isArray(params.documentIds) && params.documentIds.length > 0
        ? await buildUploadedDocumentsContext(resolvedChatId, params.documentIds)
        : "";
      await createJob(jobId, resolvedChatId, sessionId);

      const agentConfig = getAgentConfig(agentMode);
      const skillsContent = await loadSkills();
      const history = params.chatId ? await loadChatHistory(params.chatId) : [];

      startJob(jobId, {
        jobId,
        chatId: resolvedChatId,
        sessionId,
        prompt,
        agentMode,
        agentConfig,
        skillsContent,
        history,
        uploadedDocumentsContext,
        existingSandboxId: asString(params.sandboxId),
      });

      return success({
        jobId,
        chatId: resolvedChatId,
        sessionId,
        agentMode,
        agentName: agentConfig.name,
      });
    }

    case "job.stop": {
      const params = request.params as { jobId?: string; chatId?: string | null; sessionId?: string };
      const jobId = asString(params.jobId);
      if (!jobId) return failure(400, "jobId is required");

      let job = await getJob(jobId);
      if (job && !isJobVisibleToSession(job, params.chatId, params.sessionId)) {
        job = null;
      }

      if (!job) {
        return failure(404, "No active job found");
      }

      abortJob(job.id);
      await cancelJob(job.id);
      return success({ ok: true });
    }
  }
}
