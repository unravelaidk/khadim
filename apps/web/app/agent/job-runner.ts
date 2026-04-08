import type { Message } from "@mariozechner/pi-ai";
import { and, eq } from "drizzle-orm";
import { parseAskUserResponse } from "./tools/ask-user";
import {
  addStep,
  updateStep,
  completeJob,
  failJob,
  cancelJob,
  broadcast,
  type AgentJobStep,
} from "../lib/job-manager";
import { scheduleSandboxCleanup } from "./sandbox";
import { getAgentConfig } from "./agents";
import type { AgentMode } from "./router";
import { db, messages, artifacts, chats } from "../lib/db";
import { syncWorkspaceFileForChat } from "../lib/workspace-sync";
import { createSessionHost } from "./core/session-host";
import { registerLiveSessionHost, unregisterLiveSessionJob } from "./core/live-session-hosts";

interface PartialToolCall {
  name: string | null;
  arguments: Record<string, unknown> | null;
}

function extractPartialToolCall(partial: any): PartialToolCall {
  const content = Array.isArray(partial?.content) ? partial.content : [];
  const toolCall = [...content].reverse().find((item: any) => item?.type === "toolCall");
  return {
    name: typeof toolCall?.name === "string" ? toolCall.name : null,
    arguments: toolCall?.arguments && typeof toolCall.arguments === "object" ? toolCall.arguments : null,
  };
}

function summarizeToolCallPreview(partial: any, fallback: string): string {
  const { name: toolName, arguments: args } = extractPartialToolCall(partial);

  if (!toolName) {
    return fallback;
  }

  let argsPreview = "";
  if (args && typeof args === "object") {
    const serialized = JSON.stringify(args, null, 2);
    argsPreview = serialized.length > 320 ? `${serialized.slice(0, 220)}\n...\n${serialized.slice(-80)}` : serialized;
  }

  return argsPreview ? `Preparing ${toolName} call...\n${argsPreview}` : `Preparing ${toolName} call...`;
}

type AgentConfig = ReturnType<typeof getAgentConfig>;

export interface RunAgentJobParams {
  jobId: string;
  chatId: string;
  sessionId: string;
  prompt: string;
  agentMode: AgentMode;
  agentConfig: AgentConfig;
  skillsContent: string;
  history: Message[];
  uploadedDocumentsContext?: string;
  existingSandboxId?: string;
  apiKey?: string;
  abortSignal?: AbortSignal;
}

export type JobRunnerOptions = RunAgentJobParams;

const STREAM_HEARTBEAT_MS = 5000;

function isSlideRequest(prompt: string): boolean {
  return /\b(slides?|presentation|deck|ppt|pitch deck)\b/i.test(prompt);
}

async function persistSlideDeck(chatId: string, content: string): Promise<void> {
  const filename = "index.html";
  await db.delete(artifacts).where(and(eq(artifacts.chatId, chatId), eq(artifacts.filename, filename)));
  await db.insert(artifacts).values({ chatId, filename, content });
  await syncWorkspaceFileForChat(chatId, filename, content);
}

export async function runAgentJob(params: RunAgentJobParams): Promise<void> {
  const {
    jobId,
    chatId,
    sessionId,
    prompt,
    agentMode,
    agentConfig,
    skillsContent,
    history,
    uploadedDocumentsContext,
    existingSandboxId,
    apiKey,
    abortSignal,
  } = params;

  let previewUrl: string | null = null;
  let sandboxId: string | null = null;

  const broadcastJobEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId, sessionId });
  };

  const slideRequest = isSlideRequest(prompt);
  let slideContentThrottleTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    const sessionHost = await createSessionHost({
      chatId,
      prompt,
      history,
      agentMode,
      agentConfig,
      skillsContent,
      uploadedDocumentsContext,
      existingSandboxId,
      apiKey,
      slideRequest,
      callbacks: {
        addSandboxStep: async () => {
          await addStep(jobId, { id: "sandbox", title: "Initializing sandbox...", status: "running" });
          await broadcastJobEvent("step_start", { id: "sandbox", title: "Initializing sandbox..." });
        },
        completeSandboxStep: async (result, nextSandboxId) => {
          sandboxId = nextSandboxId;
          await broadcastJobEvent("sandbox_info", { sandboxId: nextSandboxId });
          await updateStep(jobId, "sandbox", { status: "complete", result });
          await broadcastJobEvent("step_complete", { id: "sandbox", result });
        },
        failSandboxStep: async (message) => {
          sandboxId = null;
          await updateStep(jobId, "sandbox", { status: "error", result: message });
          await broadcastJobEvent("step_complete", { id: "sandbox", result: message });
        },
        broadcastToolEvent: async (event) => {
          await broadcastJobEvent(event.type, event.data ?? {});
        },
      },
    });
    registerLiveSessionHost({ jobId, sessionId, chatId, host: sessionHost });

  let stepCounter = 0;
  let thinkingStepCounter = 0;
  let currentThinkingId = "";
  let thinkingContent = "";
  let lastThinkingPreview = "";
  let finalContent = "";
  let lastPlanOutput = "";
  let toolStarted = false;
  let lastToolCallPreview = "";
  let lastStreamedSlideContent = "";
  const SLIDE_STREAM_THROTTLE_MS = 300;

  const collectedSteps: AgentJobStep[] = [];
    
    // Track file writes for real-time display
    const pendingFileWrites = new Map<string, { path: string; content: string }>();

    const runnerAbortController = new AbortController();
    const abortRunner = () => runnerAbortController.abort();
    abortSignal?.addEventListener("abort", abortRunner, { once: true });

    const eventStream = sessionHost.streamEvents(runnerAbortController.signal);
    const eventIterator = eventStream[Symbol.asyncIterator]();

    // NOTE: slide_building is now sent when the write_slides tool actually starts,
    // not eagerly — so the agent can ask clarifying questions first.

    while (true) {
      const nextEvent = await Promise.race([
        eventIterator.next(),
        new Promise<IteratorResult<any>>((resolve) => {
          if (!slideRequest || !currentThinkingId) {
            return;
          }

          const timeoutId = setTimeout(() => {
            resolve({ value: { event: "__heartbeat__" }, done: false });
          }, STREAM_HEARTBEAT_MS);

          runnerAbortController.signal.addEventListener("abort", () => clearTimeout(timeoutId), { once: true });
        }),
      ]);

      if (nextEvent.done) {
        break;
      }

      const event = nextEvent.value;
      if (abortSignal?.aborted) {
        throw new Error("AbortError");
      }

      const { event: eventType, name, data } = event as { event: string; name?: string; data?: any };

      if (eventType === "__heartbeat__") {
        const displayContent = thinkingContent.length > 0
          ? (thinkingContent.length > 300
              ? `${thinkingContent.slice(0, 220)}\n...\n${thinkingContent.slice(-80)}`
              : thinkingContent)
          : lastToolCallPreview || "Working on the slide deck...";
        await broadcastJobEvent("step_update", { id: currentThinkingId, content: displayContent });
        continue;
      }

      if (eventType === "on_chat_model_start") {
        thinkingStepCounter++;
        currentThinkingId = `thinking-${thinkingStepCounter}`;
        thinkingContent = "";
        lastThinkingPreview = "";
        const stepTitle = `Reasoning (step ${thinkingStepCounter})`;
        
        const step: AgentJobStep = { id: currentThinkingId, title: stepTitle, status: "running" };
        collectedSteps.push(step);
        await addStep(jobId, step);
        await broadcastJobEvent("step_start", { id: currentThinkingId, title: stepTitle });
      }
      else if (eventType === "on_chat_model_stream") {
        const chunk = data?.chunk;
        if (chunk?.content) {
          const text = typeof chunk.content === "string" ? chunk.content : "";
          if (text) {
            thinkingContent += text;
              const displayContent = thinkingContent.length > 300
                ? `${thinkingContent.slice(0, 220)}\n...\n${thinkingContent.slice(-80)}`
                : thinkingContent;
              if (displayContent === lastThinkingPreview) {
                continue;
              }
              lastThinkingPreview = displayContent;
              await broadcastJobEvent("step_update", { id: currentThinkingId, content: displayContent });
          }
        }
      }
      else if (eventType === "on_toolcall_start") {
        if (currentThinkingId) {
          lastToolCallPreview = summarizeToolCallPreview(data?.partial, "Preparing tool call...");
          await broadcastJobEvent("step_update", { id: currentThinkingId, content: lastToolCallPreview });
        }
        // Stream partial slide content as soon as it starts arriving
        if (slideRequest) {
          const tc = extractPartialToolCall(data?.partial);
          if (tc.name === "write_slides" && typeof tc.arguments?.content === "string") {
            const partialHtml = tc.arguments.content as string;
            if (partialHtml.length > lastStreamedSlideContent.length) {
              lastStreamedSlideContent = partialHtml;
              await broadcastJobEvent("slide_content", { fileContent: partialHtml, partial: true });
            }
          }
        }
      }
      else if (eventType === "on_toolcall_delta") {
        if (currentThinkingId) {
          const nextPreview = summarizeToolCallPreview(data?.partial, lastToolCallPreview || "Preparing tool call...");
          if (nextPreview !== lastToolCallPreview) {
            lastToolCallPreview = nextPreview;
            await broadcastJobEvent("step_update", { id: currentThinkingId, content: nextPreview });
          }
        }
        // Progressively stream slide content during tool arg streaming
        if (slideRequest) {
          const tc = extractPartialToolCall(data?.partial);
          if (tc.name === "write_slides" && typeof tc.arguments?.content === "string") {
            const partialHtml = tc.arguments.content as string;
            if (partialHtml.length > lastStreamedSlideContent.length + 200) {
              lastStreamedSlideContent = partialHtml;
              // Throttle broadcasts to avoid flooding the WebSocket
              if (!slideContentThrottleTimer) {
                slideContentThrottleTimer = setTimeout(async () => {
                  slideContentThrottleTimer = null;
                  await broadcastJobEvent("slide_content", { fileContent: lastStreamedSlideContent, partial: true });
                }, SLIDE_STREAM_THROTTLE_MS);
              }
            }
          }
        }
      }
      else if (eventType === "on_toolcall_end") {
        // Flush any pending throttled slide content
        if (slideContentThrottleTimer) {
          clearTimeout(slideContentThrottleTimer);
          slideContentThrottleTimer = null;
        }
        if (currentThinkingId) {
          const toolName = typeof data?.toolCall?.name === "string" ? data.toolCall.name : "tool";
          lastToolCallPreview = summarizeToolCallPreview(data?.partial, `Prepared ${toolName} call.`);
          await broadcastJobEvent("step_update", { id: currentThinkingId, content: lastToolCallPreview });
        }
        // Send final partial content before the tool actually executes
        if (slideRequest && lastStreamedSlideContent.length > 0) {
          await broadcastJobEvent("slide_content", { fileContent: lastStreamedSlideContent, partial: true });
        }
      }
      else if (eventType === "text_delta") {
        // Only suppress text_delta once the agent has started using tools
        // (so clarifying questions still reach the user)
        if (slideRequest && toolStarted) {
          continue;
        }
        const text = typeof data?.content === "string" ? data.content : "";
        if (text) {
          finalContent += text;
          await broadcastJobEvent("text_delta", { content: text });
        }
      }
      else if (eventType === "on_tool_update") {
        const activeToolStepId = `tool-${stepCounter}`;
        const partialText = typeof data?.partialResult?.content?.[0]?.text === "string"
          ? data.partialResult.content[0].text
          : null;
        if (partialText) {
          await broadcastJobEvent("step_update", { id: activeToolStepId, content: partialText });
        }
      }
      else if (eventType === "on_chat_model_end") {
        if (currentThinkingId) {
          const resultPreview = thinkingContent.slice(0, 100) + (thinkingContent.length > 100 ? "..." : "");
          await updateStep(jobId, currentThinkingId, { status: "complete", content: thinkingContent, result: resultPreview });
          await broadcastJobEvent("step_complete", { id: currentThinkingId, result: resultPreview });
          
          const step = collectedSteps.find(s => s.id === currentThinkingId);
          if (step) {
            step.status = "complete";
            step.content = thinkingContent;
            step.result = resultPreview;
          }
        }
      }
      else if (eventType === "on_tool_start") {
        toolStarted = true;
        stepCounter++;
        const toolName = name || "Tool";
        const toolArgs = (data?.input || {}) as Record<string, unknown>;
        const stepId = `tool-${stepCounter}`;

        let title = toolName;
        let filePath: string | undefined;
        let fileContent: string | undefined;
        
        if (toolName === "create_plan") title = "📋 Creating execution plan";
        else if (toolName === "run_code") title = "Executing code";
        else if (toolName === "read_file") title = `Reading ${toolArgs.path || "file"}`;
        else if (toolName === "list_files") title = `Listing ${toolArgs.path || "files"}`;
        else if (toolName === "write_file") {
          filePath = typeof toolArgs.path === 'string' ? toolArgs.path : undefined;
          fileContent = typeof toolArgs.content === 'string' ? toolArgs.content : undefined;
          title = `Writing ${filePath || "file"}`;
          // Store file content for step_complete event
          if (filePath && fileContent) {
            pendingFileWrites.set(stepId, { path: filePath, content: fileContent });
          }
        }
        else if (toolName === "expose_preview") title = "Creating live preview";
        else if (toolName === "create_web_app") title = `Scaffolding ${toolArgs.type} app`;
        else if (toolName === "delegate_to_agent") title = `Delegating to ${toolArgs.agent || "agent"}`;

        if (toolName === "write_slides") {
          // Signal frontend now that we're actually building slides
          await broadcastJobEvent("slide_building", {});
          const slideContent = typeof toolArgs.content === "string" ? toolArgs.content : undefined;
          const slideTheme = typeof toolArgs.theme === "string" ? toolArgs.theme : undefined;
          if (slideContent?.includes('<script id="slide-data"')) {
            await broadcastJobEvent("slide_content", {
              fileContent: slideContent,
              theme: slideTheme,
            });
          }
        }

        // Include file content in broadcast for write_file
        const step: AgentJobStep = { id: stepId, title, status: "running", tool: toolName };
        collectedSteps.push(step);
        await addStep(jobId, step);
        await broadcastJobEvent("step_start", {
          id: stepId,
          title,
          tool: toolName,
          args: toolArgs,
          filename: filePath,
          fileContent,
        });
      }
      else if (eventType === "on_tool_end") {
        const stepId = `tool-${stepCounter}`;
        const output = data?.output;
        const toolName = name || "";

        if (toolName === "ask_user" && typeof output === "string") {
          const parsed = parseAskUserResponse(output);
          if (parsed) {
            const enrichedContext = parsed.context?.trim()
              ? parsed.context
              : lastPlanOutput
                ? `Plan:\n${lastPlanOutput}`
                : "";
            await broadcastJobEvent("ask_user", {
              question: parsed.question,
              options: parsed.options,
              context: enrichedContext,
              threadId: chatId,
            });
            await updateStep(jobId, stepId, { status: "complete", result: `❓ Asking: ${parsed.question}` });
            await broadcastJobEvent("step_complete", { id: stepId, result: `❓ Asking: ${parsed.question}` });
          }
        }

        let stepResult: string;
        if (toolName === "create_plan") {
          stepResult = typeof output === "string" ? output : "Plan created";
          if (typeof output === "string") {
            lastPlanOutput = output;
          }
        } else {
          stepResult = typeof output === "string" ? output.slice(0, 200) : "Done";
        }
        
        await updateStep(jobId, stepId, { status: "complete", result: stepResult });
        
        // Include file info in step_complete for write_file tool
        const fileInfo = pendingFileWrites.get(stepId);
        await broadcastJobEvent("step_complete", {
          id: stepId,
          result: stepResult,
          tool: toolName,
          filename: fileInfo?.path,
          fileContent: fileInfo?.content,
        });
        
        // Clean up tracked file write
        if (fileInfo) {
          pendingFileWrites.delete(stepId);
        }

        const toolStep = collectedSteps.find(s => s.id === stepId);
        if (toolStep) {
          toolStep.status = "complete";
          toolStep.result = stepResult;
          // Store file info in the step for persistence
          if (fileInfo) {
            (toolStep as any).filename = fileInfo.path;
            (toolStep as any).fileContent = fileInfo.content;
          }
        }
      }
      else if (eventType === "on_chain_end") {
        const msgs = data?.output?.messages;
        if (msgs && msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (typeof lastMsg.content === "string") {
            finalContent = lastMsg.content;
          } else if (Array.isArray(lastMsg.content)) {
            finalContent = lastMsg.content.map((c: any) => "text" in c ? c.text : "").join("\n");
          }
        }
      }
    }

    previewUrl = sessionHost.getPreviewUrl();
    sandboxId = sessionHost.getSandboxId();

    abortSignal?.removeEventListener("abort", abortRunner);

    let slideFileContent: string | undefined;
    try {
      const indexHtmlArtifact = await db.query.artifacts.findFirst({
        where: (a, { eq, and }) => and(eq(a.chatId, chatId), eq(a.filename, "index.html")),
      });
      if (indexHtmlArtifact?.content?.includes('<script id="slide-data"')) {
        slideFileContent = indexHtmlArtifact.content;
      }
    } catch (err) {
      console.warn("Failed to fetch slide content:", err);
    }

    if (slideFileContent) {
      await broadcastJobEvent("slide_content", { fileContent: slideFileContent });
    }

    if (slideRequest && !toolStarted && !slideFileContent && !finalContent.trim()) {
      throw new Error("Slide generation finished without producing a presentation.");
    }

    await completeJob(jobId, finalContent, previewUrl);

    if (chatId) {
      try {
        await db.insert(messages).values({
          chatId,
          role: "assistant",
          content: finalContent,
          previewUrl: previewUrl || undefined,
          thinkingSteps: collectedSteps,
        });

        if (sandboxId) {
          await db.update(chats).set({ sandboxId }).where(eq(chats.id, chatId));
        }
      } catch (dbError) {
        console.error("Error saving to database:", dbError);
      }
    }

    if (sandboxId) {
      scheduleSandboxCleanup(chatId, sandboxId);
    }

  } catch (error) {
    if (slideContentThrottleTimer) {
      clearTimeout(slideContentThrottleTimer);
      slideContentThrottleTimer = null;
    }
    if (error instanceof Error && (error.message === "AbortError" || error.name === "AbortError")) {
      console.log("Agent job aborted by client");
      await cancelJob(jobId);
    } else {
      console.error("Agent error:", error);
      await failJob(jobId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  } finally {
    unregisterLiveSessionJob(jobId);
  }
}
