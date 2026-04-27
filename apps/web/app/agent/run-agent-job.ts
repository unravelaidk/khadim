/**
 * Agent job runner — spawns @unravelai/khadim native binary.
 *
 * Replaces the pi-agent-core based job-runner.ts.
 * Reads JSON lines from the binary's stdout and broadcasts
 * them through the Redis-backed job-manager for real-time streaming.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolveBinaryPath } from "@unravelai/khadim";
import {
  addStep,
  updateStep,
  completeJob,
  failJob,
  cancelJob,
  broadcast,
} from "../lib/job-manager";
import { db, messages, chats, artifacts } from "../lib/db";
import { eq, and } from "drizzle-orm";
import type { AgentStreamEvent } from "@unravelai/khadim";

interface RunAgentJobOptions {
  jobId: string;
  chatId: string;
  sessionId: string;
  prompt: string;
  cwd?: string;
  provider?: string;
  model?: string;
  abortSignal?: AbortSignal;
}

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function parseToolCall(event: AgentStreamEvent): ParsedToolCall | null {
  if (event.event_type !== "tool_call") return null;
  if (!event.content) return null;
  try {
    return JSON.parse(event.content) as ParsedToolCall;
  } catch {
    return null;
  }
}

function toolDisplayTitle(name: string, args: Record<string, unknown>): string {
  if (name === "create_plan") return "\u{1F4CB} Creating execution plan";
  if (name === "run_code") return "Executing code";
  if (name === "write_file") return `Writing ${args.path || "file"}`;
  if (name === "read_file") return `Reading ${args.path || "file"}`;
  if (name === "list_files") return `Listing ${args.path || "files"}`;
  if (name === "write_slides") return "Building slides";
  return name;
}

function stepId(counter: number) {
  return `tool-${counter}`;
}

export async function runAgentJob(opts: RunAgentJobOptions): Promise<void> {
  const { jobId, chatId, sessionId, prompt, cwd, provider, model, abortSignal } = opts;

  const binaryPath = await resolveBinaryPath();
  const args = ["--json", "--prompt", prompt];
  if (cwd) args.unshift("--cwd", cwd);
  if (provider) args.unshift("--provider", provider);
  if (model) args.unshift("--model", model);

  const child = spawn(binaryPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const broadcastJobEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId, sessionId });
  };

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => child.kill(), { once: true });
  }

  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

  let finalContent = "";
  let stepCounter = 0;
  let currentStepId = "";
  let toolStarted = false;
  let previewUrl: string | null = null;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (abortSignal?.aborted) throw new Error("AbortError");

      let event: AgentStreamEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      switch (event.event_type) {
        case "text_delta":
          if (event.content) {
            finalContent += event.content;
            await broadcastJobEvent("text_delta", { content: event.content });
          }
          break;

        case "step_start":
          stepCounter++;
          currentStepId = stepId(stepCounter);
          const title = event.content || "Working";
          await addStep(jobId, { id: currentStepId, title, status: "running" });
          await broadcastJobEvent("step_start", { id: currentStepId, title });
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

        case "tool_start":
          toolStarted = true;
          const toolEvent = event;
          if (toolEvent.content) {
            const tool = parseToolCall(toolEvent);
            if (tool) {
              stepCounter++;
              currentStepId = stepId(stepCounter);
              const displayTitle = toolDisplayTitle(tool.name, tool.arguments);
              await addStep(jobId, { id: currentStepId, title: displayTitle, status: "running", tool: tool.name });
              await broadcastJobEvent("step_start", {
                id: currentStepId,
                title: displayTitle,
                tool: tool.name,
                args: tool.arguments,
              });
            }
          }
          break;

        case "tool_end":
          if (currentStepId) {
            const toolResult = (event.content || "Done").slice(0, 200);
            await updateStep(jobId, currentStepId, { status: "complete", result: toolResult });
            await broadcastJobEvent("step_complete", { id: currentStepId, result: toolResult });
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
          // Forward unknown events for extensibility
          if (event.content) {
            await broadcastJobEvent(event.event_type, { content: event.content, ...(event.metadata ?? {}) });
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
  } finally {
    if (!child.killed) child.kill();
  }
}
