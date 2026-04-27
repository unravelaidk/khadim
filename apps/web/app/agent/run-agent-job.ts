/**
 * Agent job runner — calls @unravelai/khadim runAgentStream().
 *
 * Reads AgentStreamEvent from the native binary and broadcasts
 * them through the Redis-backed job-manager for real-time streaming.
 */

import { runAgentStream, type AgentStreamEvent } from "@unravelai/khadim";
import {
  addStep,
  updateStep,
  completeJob,
  failJob,
  cancelJob,
  broadcast,
} from "../lib/job-manager";
import { db, messages, artifacts } from "../lib/db";
import { eq, and } from "drizzle-orm";

export interface RunAgentJobOptions {
  jobId: string;
  chatId: string;
  sessionId: string;
  prompt: string;
  cwd?: string;
  provider?: string;
  model?: string;
  abortSignal?: AbortSignal;
}

function toolDisplayTitle(name: string, args: Record<string, unknown>): string {
  if (name === "create_plan") return "\u{1F4CB} Creating execution plan";
  if (name === "write_file") return `Writing ${args.path || "file"}`;
  if (name === "read_file") return `Reading ${args.path || "file"}`;
  if (name === "list_files") return `Listing ${args.path || "files"}`;
  if (name === "write_slides") return "Building slides";
  return name;
}

export async function runAgentJob(opts: RunAgentJobOptions): Promise<void> {
  const { jobId, chatId, sessionId, prompt, cwd, provider, model, abortSignal } = opts;

  const broadcastJobEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId, sessionId });
  };

  let finalContent = "";
  let stepCounter = 0;
  let currentStepId = "";
  let previewUrl: string | null = null;

  try {
    for await (const event of runAgentStream({
      prompt,
      cwd,
      provider,
      model,
      signal: abortSignal,
    })) {
      if (abortSignal?.aborted) throw new Error("AbortError");

      switch (event.event_type) {
        case "text_delta":
          if (event.content) {
            finalContent += event.content;
            await broadcastJobEvent("text_delta", { content: event.content });
          }
          break;

        case "step_start":
          stepCounter++;
          currentStepId = `tool-${stepCounter}`;
          await addStep(jobId, { id: currentStepId, title: event.content || "Working", status: "running" });
          await broadcastJobEvent("step_start", { id: currentStepId, title: event.content });
          break;

        case "step_update":
          if (currentStepId && event.content) {
            await broadcastJobEvent("step_update", { id: currentStepId, content: event.content });
          }
          break;

        case "step_complete":
          if (currentStepId) {
            const result = (event.content || "Done").slice(0, 200);
            await updateStep(jobId, currentStepId, { status: "complete", result });
            await broadcastJobEvent("step_complete", { id: currentStepId, result });
          }
          break;

        case "tool_start": {
          const meta = event.metadata as { name?: string; args?: Record<string, unknown> } | undefined;
          const toolName = meta?.name || "tool";
          const toolArgs = meta?.args || {};
          stepCounter++;
          currentStepId = `tool-${stepCounter}`;
          const title = toolDisplayTitle(toolName, toolArgs);
          await addStep(jobId, { id: currentStepId, title, status: "running", tool: toolName });
          await broadcastJobEvent("step_start", {
            id: currentStepId,
            title,
            tool: toolName,
            args: toolArgs,
          });
          break;
        }

        case "tool_end":
          if (currentStepId) {
            const result = (event.content || "Done").slice(0, 200);
            await updateStep(jobId, currentStepId, { status: "complete", result });
            await broadcastJobEvent("step_complete", { id: currentStepId, result });
          }
          break;

        case "tool_update":
          if (currentStepId && event.content) {
            await broadcastJobEvent("step_update", { id: currentStepId, content: event.content });
          }
          break;

        case "mode_selected":
          if (event.content) {
            await broadcastJobEvent("system_message", { content: event.content });
          }
          break;

        case "error":
          if (event.content) {
            await broadcastJobEvent("error", { message: event.content });
          }
          break;

        case "done":
          break;

        default:
          if (event.content) {
            await broadcastJobEvent(event.event_type, {
              content: event.content,
              ...(event.metadata ?? {}),
            });
          }
      }
    }

    // Check for slide artifacts
    try {
      const [slideArtifact] = await db
        .select({ content: artifacts.content })
        .from(artifacts)
        .where(and(eq(artifacts.chatId, chatId), eq(artifacts.filename, "index.html")))
        .limit(1);
      if (slideArtifact?.content?.includes('<script id="slide-data"')) {
        await broadcastJobEvent("slide_content", { fileContent: slideArtifact.content });
      }
    } catch {
      // Not a slide
    }

    await completeJob(jobId, finalContent, previewUrl);

    if (chatId) {
      await db.insert(messages).values({
        chatId,
        role: "assistant",
        content: finalContent,
        previewUrl: previewUrl || undefined,
        thinkingSteps: [],
      }).catch((err) => console.error("Error saving message:", err));
    }
  } catch (error) {
    if (error instanceof Error && (error.message === "AbortError" || error.name === "AbortError")) {
      await cancelJob(jobId);
    } else {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Agent error:", errMsg);
      await failJob(jobId, errMsg);
      throw error;
    }
  }
}
