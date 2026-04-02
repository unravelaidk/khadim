import { createId } from "@paralleldrive/cuid2";
import { parseAskUserResponse } from "./tools/ask-user";
import { getLiveSessionHostByJobId, getLiveSessionHostBySessionId } from "./core/live-session-hosts";
import { broadcast, cancelJob, completeJob, createJob } from "../lib/job-manager";

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

  const invoke = method === "job.steer"
    ? record.host.steer.bind(record.host)
    : record.host.followUp.bind(record.host);

  void invoke(prompt, {
    onEvent: async (event: { event: string; name?: string; data?: any }) => {
      const eventName = event.event as string;

      if (eventName === "on_chat_model_start") {
        await broadcastEvent("step_start", { id: `followup-${jobId}`, title: "Thinking..." });
        return;
      }

      if (eventName === "text_delta") {
        const content = typeof event.data?.content === "string" ? event.data.content : "";
        if (content) {
          await broadcastEvent("text_delta", { content });
        }
        return;
      }

      if (eventName === "on_tool_start") {
        const toolName = typeof event.name === "string" ? event.name : "tool";
        const toolArgs = event.data?.input;
        if (toolName === "write_slides") {
          const slideContent = typeof toolArgs?.content === "string" ? toolArgs.content : undefined;
          const slideTheme = typeof toolArgs?.theme === "string" ? toolArgs.theme : undefined;
          await broadcastEvent("slide_building", {});
          if (slideContent?.includes('<script id="slide-data"')) {
            await broadcastEvent("slide_content", { fileContent: slideContent, theme: slideTheme });
          }
        }

        await broadcastEvent("step_start", {
          id: `tool-${jobId}-${toolName}`,
          title: `Using ${toolName}...`,
          tool: toolName,
          args: toolArgs,
        });
        return;
      }

      if (eventName === "on_tool_update") {
        const toolName = typeof event.name === "string" ? event.name : "tool";
        const partialResult = event.data?.partialResult;
        if (partialResult != null) {
          await broadcastEvent("step_update", {
            id: `tool-${jobId}-${toolName}`,
            content: typeof partialResult === "string" ? partialResult : JSON.stringify(partialResult),
          });
        }
        return;
      }

      if (eventName === "on_tool_end") {
        const toolName = typeof event.name === "string" ? event.name : "tool";
        const output = typeof event.data?.output === "string" ? event.data.output : "";

        if (toolName === "ask_user") {
          const parsed = parseAskUserResponse(output);
          if (parsed) {
            await broadcastEvent("ask_user", {
              question: parsed.question,
              options: parsed.options,
              context: parsed.context,
              threadId: record.chatId,
            });
          }
        }

        await broadcastEvent("step_complete", {
          id: `tool-${jobId}-${toolName}`,
          result: output.slice(0, 200) || "Done",
        });
        return;
      }

      if (eventName === "on_chain_end") {
        const output = event.data?.output as { messages?: Array<{ content?: unknown }> } | undefined;
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
  }).catch(async (error: unknown) => {
    await cancelJob(jobId);
    console.error(`[Live Session] ${method} failed:`, error);
  });

  return { ok: true as const, jobId, sessionId: record.sessionId, chatId: record.chatId };
}
