import { createId } from "@paralleldrive/cuid2";
import { getLiveSessionHostByJobId, getLiveSessionHostBySessionId } from "./core/live-session-hosts";
import { broadcast, cancelJob, completeJob, createJob } from "../lib/job-manager";

/** Tracks the currently active job per session so steer can cancel the previous one. */
const activeJobBySession = new Map<string, string>();

export function resolveLiveHost(params: { jobId?: string; sessionId?: string; chatId?: string | null }) {
  const jobId = typeof params.jobId === "string" && params.jobId.length > 0 ? params.jobId : undefined;
  if (jobId) {
    const record = getLiveSessionHostByJobId(jobId);
    if (!record) return null;
    if (params.chatId && record.chatId !== params.chatId) return null;
    if (params.sessionId && record.sessionId !== params.sessionId) return null;
    return record;
  }

  const sessionId = typeof params.sessionId === "string" && params.sessionId.length > 0 ? params.sessionId : undefined;
  if (!sessionId) {
    return null;
  }

  const record = getLiveSessionHostBySessionId(sessionId);
  if (!record) return null;
  if (params.chatId && record.chatId !== params.chatId) return null;
  return record;
}

export async function runLiveHostInput(params: {
  method: "job.followUp" | "job.steer";
  prompt: string;
  record: NonNullable<ReturnType<typeof resolveLiveHost>>;
}) {
  const { method, prompt, record } = params;
  const jobId = createId();
  await createJob(jobId, record.chatId, record.sessionId);

  const broadcastEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId: record.chatId, sessionId: record.sessionId });
  };

  // If this is a steer, cancel the previous active job for this session
  if (method === "job.steer") {
    const previousJobId = activeJobBySession.get(record.sessionId);
    if (previousJobId && previousJobId !== jobId) {
      await cancelJob(previousJobId);
    }
  }

  activeJobBySession.set(record.sessionId, jobId);

  const invoke = method === "job.steer"
    ? record.host.steer.bind(record.host)
    : record.host.followUp.bind(record.host);

  void invoke(prompt, {
    onEvent: async (event) => {
      if (event.event === "on_chat_model_start") {
        await broadcastEvent("step_start", { id: `followup-${jobId}`, title: "Thinking..." });
      }

      if (event.event === "text_delta") {
        const content = typeof event.data?.content === "string" ? event.data.content : "";
        if (content) {
          await broadcastEvent("text_delta", { content });
        }
      }

      if (event.event === "on_tool_start") {
        const toolName = typeof event.name === "string" ? event.name : "tool";
        await broadcastEvent("step_start", {
          id: `tool-${jobId}-${toolName}`,
          title: `Using ${toolName}...`,
        });
      }

      if (event.event === "on_tool_end") {
        const toolName = typeof event.name === "string" ? event.name : "tool";
        const output = typeof event.data?.output === "string" ? event.data.output : "";
        await broadcastEvent("step_complete", {
          id: `tool-${jobId}-${toolName}`,
          result: output,
        });
      }

      if (event.event === "on_tool_update") {
        const partialResult = event.data?.partialResult;
        if (partialResult != null) {
          await broadcastEvent("step_update", {
            id: `tool-${jobId}-${typeof event.name === "string" ? event.name : "tool"}`,
            content: typeof partialResult === "string" ? partialResult : JSON.stringify(partialResult),
          });
        }
      }

      if (event.event === "on_tool_start" && event.name === "write_slides") {
        await broadcastEvent("slide_building", {});
      }

      if (event.event === "on_chain_end") {
        const output = event.data?.output as { messages?: Array<{ role?: string; content?: unknown }> } | undefined;
        const messages = output?.messages || [];
        const lastMessage = messages[messages.length - 1];
        const finalContent = typeof lastMessage?.content === "string"
          ? lastMessage.content
          : Array.isArray(lastMessage?.content)
            ? lastMessage.content.map((item: any) => item?.text || "").join("\n")
            : "";
        await broadcastEvent("step_complete", { id: `followup-${jobId}`, result: finalContent });
        await completeJob(jobId, finalContent, record.host.getPreviewUrl());
      }
    },
  }).then(async () => {
    // Only clean up if this job is still the active one (wasn't replaced by a steer)
    if (activeJobBySession.get(record.sessionId) === jobId) {
      activeJobBySession.delete(record.sessionId);
    }
  }).catch(async (error) => {
    if (activeJobBySession.get(record.sessionId) === jobId) {
      activeJobBySession.delete(record.sessionId);
    }
    await cancelJob(jobId);
    console.error(`[Live Session] ${method} failed:`, error);
  });

  return { ok: true as const, jobId, sessionId: record.sessionId, chatId: record.chatId };
}
