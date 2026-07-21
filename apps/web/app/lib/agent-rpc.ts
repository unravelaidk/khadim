import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import { getActiveModel } from "../agent/model-manager";
import { selectAgent, type AgentMode } from "../agent/router";
import { resolveApiKeyForBridge } from "../agent/models";
import type { ProviderType } from "../agent/models";
import { loadSkills } from "../agent/skills";
import { startJob } from "../agent/stream-utils";
import { decoratePromptWithBadges } from "./badges";
import { formatChatHistoryForPrompt, loadChatHistory, withoutLatestPersistedUserTurn } from "./chat-history";
import { abortJob } from "./job-cancel";
import { buildUploadedDocumentsContext } from "./uploaded-documents";
import {
  cancelJob,
  claimJob,
  createJob,
  getJob,
  getJobsByChatId,
  getSessionEventsSince,
  getSessionSnapshot,
  markJobStarted,
} from "./job-manager";
import type { AgentJob } from "../types/agent";

type JsonObject = Record<string, unknown>;

export type AgentRpcMethod =
  | "job.start"
  | "job.followUp"
  | "job.steer"
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
        systemPrompt?: string;
        documentIds?: string[];
        agentMode?: AgentMode;
        requestId?: string;
        currentTurnId?: string;
        currentTurnPersisted?: boolean;
      };
      let prompt = asString(params.prompt);
      const sessionId = asString(params.sessionId) || "default";

      const badgeResult = decoratePromptWithBadges(prompt || "", asString(params.badges));
      prompt = badgeResult.prompt;
      const agentMode: AgentMode = params.agentMode || selectAgent(prompt || "");

      if (badgeResult.hasPremadeBadge || badgeResult.hasCategoryBadge) {
        // Mode selection is handled by the binary's built-in router
      }

      if (!prompt) {
        return failure(400, "Prompt is required");
      }

      const jobId = createId();
      const resolvedChatId = asString(params.chatId) || "default";
      const requestId = asString(params.requestId);
      if (requestId && requestId.length > 128) return failure(400, "requestId is too long");
      const requestFingerprint = fingerprint({
        method: "job.start",
        chatId: resolvedChatId,
        sessionId,
        prompt,
        agentMode,
        systemPrompt: asString(params.systemPrompt) ?? null,
        badges: asString(params.badges) ?? null,
        documentIds: Array.isArray(params.documentIds) ? params.documentIds : [],
        sandboxId: asString(params.sandboxId) ?? null,
        currentTurnId: asString(params.currentTurnId) ?? null,
        currentTurnPersisted: params.currentTurnPersisted === true,
      });
      if (requestId) {
        const existing = await getJob(requestId);
        if (existing) {
          if (!isJobVisibleToSession(existing, resolvedChatId, sessionId)) {
            return failure(409, "requestId is already used by another run");
          }
          if (existing.requestFingerprint !== requestFingerprint) {
            return failure(409, "requestId does not match the original run request");
          }
          if (existing.launchState === "claiming") {
            if (Date.parse(existing.claimExpiresAt ?? "") > Date.now()) {
              return failure(425, "The run is still being claimed; retry shortly");
            }
          } else {
            return success({ jobId: existing.id, chatId: existing.chatId, sessionId: existing.sessionId, agentMode, agentName: agentMode });
          }
        }
      }
      const activeModel = await getActiveModel();
      if (!activeModel) {
        return failure(400, "No active model configured. Add one in Settings first.");
      }

      const apiKey = await resolveApiKeyForBridge(
        activeModel.provider as ProviderType,
        activeModel.apiKey,
      );
      const uploadedDocumentsContext = Array.isArray(params.documentIds) && params.documentIds.length > 0
        ? await buildUploadedDocumentsContext(resolvedChatId, params.documentIds)
        : "";
      const resolvedJobId = requestId || jobId;
      const skillsContent = await loadSkills();
      const currentTurnId = asString(params.currentTurnId);
      const history = params.chatId ? await loadChatHistory(params.chatId, { excludeMessageId: currentTurnId }) : [];

      // Build context-aware prompt for the native binary
      const contextParts: string[] = [];
      if (skillsContent) contextParts.push(skillsContent);
      if (uploadedDocumentsContext) contextParts.push(uploadedDocumentsContext);
      const historyContext = formatChatHistoryForPrompt(currentTurnId
        ? history
        : withoutLatestPersistedUserTurn(history, params.currentTurnPersisted === true));
      if (historyContext) contextParts.push(historyContext);
      const fullPrompt = contextParts.length > 0
        ? `${contextParts.join("\n\n")}\n\n---\n\nUser request: ${prompt}`
        : prompt;

      if (requestId) {
        const claim = await claimJob(resolvedJobId, resolvedChatId, sessionId, requestFingerprint);
        if (!claim.created) {
          if (!isJobVisibleToSession(claim.job, resolvedChatId, sessionId)
            || claim.job.requestFingerprint !== requestFingerprint) {
            return failure(409, "requestId does not match the original run request");
          }
          if (claim.job.launchState === "claiming") {
            return failure(425, "The run is still being claimed; retry shortly");
          }
          return success({ jobId: claim.job.id, chatId: claim.job.chatId, sessionId: claim.job.sessionId, agentMode, agentName: agentMode });
        }
      } else {
        await createJob(resolvedJobId, resolvedChatId, sessionId);
      }

      startJob(resolvedJobId, {
        jobId: resolvedJobId,
        chatId: resolvedChatId,
        sessionId,
        prompt: fullPrompt,
        provider: activeModel.provider,
        model: activeModel.model,
        apiKey: apiKey || undefined,
        systemPrompt: asString(params.systemPrompt),
      });
      if (requestId) {
        const claimToken = (await getJob(resolvedJobId))?.claimToken;
        if (claimToken) await markJobStarted(resolvedJobId, requestFingerprint, claimToken).catch((error) => {
          console.error("Failed to promote launched job claim:", error);
        });
      }

      return success({
        jobId: resolvedJobId,
        chatId: resolvedChatId,
        sessionId,
        agentMode,
        agentName: agentMode,
      });
    }

    case "job.followUp": {
      const params = request.params as {
        jobId?: string; chatId?: string | null; sessionId?: string; prompt?: string; systemPrompt?: string;
        requestId?: string; currentTurnId?: string; currentTurnPersisted?: boolean;
      };
      const prompt = asString(params.prompt);
      if (!prompt) return failure(400, "prompt is required");

      const chatId = asString(params.chatId) || "default";
      const sessionId = asString(params.sessionId) || "default";

      const requestId = asString(params.requestId);
      if (requestId && requestId.length > 128) return failure(400, "requestId is too long");
      const requestFingerprint = fingerprint({
        method: "job.followUp",
        chatId,
        sessionId,
        prompt,
        systemPrompt: asString(params.systemPrompt) ?? null,
        currentTurnId: asString(params.currentTurnId) ?? null,
        currentTurnPersisted: params.currentTurnPersisted === true,
      });
      if (requestId) {
        const existing = await getJob(requestId);
        if (existing) {
          if (!isJobVisibleToSession(existing, chatId, sessionId)) {
            return failure(409, "requestId is already used by another run");
          }
          if (existing.requestFingerprint !== requestFingerprint) {
            return failure(409, "requestId does not match the original run request");
          }
          if (existing.launchState === "claiming") {
            if (Date.parse(existing.claimExpiresAt ?? "") > Date.now()) {
              return failure(425, "The run is still being claimed; retry shortly");
            }
          } else {
            return success({ jobId: existing.id, chatId: existing.chatId, sessionId: existing.sessionId });
          }
        }
      }
      const activeModel = await getActiveModel();
      if (!activeModel) return failure(400, "No active model configured");

      const apiKey = await resolveApiKeyForBridge(
        activeModel.provider as ProviderType,
        activeModel.apiKey,
      );
      const newJobId = requestId || createId();
      const currentTurnId = asString(params.currentTurnId);
      const history = await loadChatHistory(chatId, { excludeMessageId: currentTurnId });
      const historyContext = formatChatHistoryForPrompt(currentTurnId
        ? history
        : withoutLatestPersistedUserTurn(history, params.currentTurnPersisted === true));
      const contextualPrompt = historyContext
        ? `${historyContext}\n\n---\n\nCurrent user follow-up: ${prompt}`
        : `[Follow-up]\n${prompt}`;

      if (requestId) {
        const claim = await claimJob(newJobId, chatId, sessionId, requestFingerprint);
        if (!claim.created) {
          if (!isJobVisibleToSession(claim.job, chatId, sessionId)
            || claim.job.requestFingerprint !== requestFingerprint) {
            return failure(409, "requestId does not match the original run request");
          }
          if (claim.job.launchState === "claiming") {
            return failure(425, "The run is still being claimed; retry shortly");
          }
          return success({ jobId: claim.job.id, chatId: claim.job.chatId, sessionId: claim.job.sessionId });
        }
      } else {
        await createJob(newJobId, chatId, sessionId);
      }

      startJob(newJobId, {
        jobId: newJobId,
        chatId,
        sessionId,
        prompt: contextualPrompt,
        provider: activeModel.provider,
        model: activeModel.model,
        apiKey: apiKey || undefined,
        systemPrompt: asString(params.systemPrompt),
      });
      if (requestId) {
        const claimToken = (await getJob(newJobId))?.claimToken;
        if (claimToken) await markJobStarted(newJobId, requestFingerprint, claimToken).catch((error) => {
          console.error("Failed to promote launched job claim:", error);
        });
      }

      return success({ jobId: newJobId, chatId, sessionId });
    }

    case "job.steer": {
      const params = request.params as { jobId?: string; chatId?: string | null; sessionId?: string; prompt?: string; systemPrompt?: string };
      const prompt = asString(params.prompt);
      if (!prompt) return failure(400, "prompt is required");

      const chatId = asString(params.chatId) || "default";
      const sessionId = asString(params.sessionId) || "default";

      const activeModel = await getActiveModel();
      if (!activeModel) return failure(400, "No active model configured");

      const apiKey = await resolveApiKeyForBridge(
        activeModel.provider as ProviderType,
        activeModel.apiKey,
      );

      const newJobId = createId();
      await createJob(newJobId, chatId, sessionId);

      startJob(newJobId, {
        jobId: newJobId,
        chatId,
        sessionId,
        prompt: `[Steer]\n${prompt}`,
        provider: activeModel.provider,
        model: activeModel.model,
        apiKey: apiKey || undefined,
        systemPrompt: asString(params.systemPrompt),
      });

      return success({ jobId: newJobId, chatId, sessionId });
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

  return failure(400, `Unsupported method: ${request.method}`);
}

function fingerprint(command: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}
