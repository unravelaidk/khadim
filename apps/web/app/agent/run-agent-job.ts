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
import { syncWorkspaceFileForChat } from "../lib/workspace-sync";
import { createWriteSlidesTool } from "./tools";
import { createAskUserTool, parseAskUserResponse } from "./tools/ask-user";

const SLIDE_DATA_SCRIPT_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>/i;

export interface RunAgentJobOptions {
  jobId: string;
  chatId: string;
  sessionId: string;
  prompt: string;
  cwd?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
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

function toolResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")
        .filter(Boolean)
        .join("\n");
    }
  }
  return result == null ? "" : JSON.stringify(result, null, 2);
}

function toolResultMetadata(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object" ? details as Record<string, unknown> : null;
}

function eventMetadata(event: AgentStreamEvent): Record<string, unknown> {
  return event.metadata && typeof event.metadata === "object" ? event.metadata : {};
}

function eventStepId(event: AgentStreamEvent, fallbackId: string): string {
  const metadata = eventMetadata(event);
  return typeof metadata.id === "string" && metadata.id.length > 0 ? metadata.id : fallbackId;
}

function eventTitle(event: AgentStreamEvent, fallbackTitle: string): string {
  const metadata = eventMetadata(event);
  return typeof metadata.title === "string" && metadata.title.length > 0 ? metadata.title : fallbackTitle;
}

function eventTool(event: AgentStreamEvent): string | undefined {
  const metadata = eventMetadata(event);
  return typeof metadata.tool === "string" && metadata.tool.length > 0 ? metadata.tool : undefined;
}

async function persistSlideDeck(chatId: string, content: string): Promise<void> {
  const filename = "index.html";
  await persistWorkspaceBackedArtifact(chatId, filename, content);
}

async function persistWorkspaceBackedArtifact(chatId: string, filename: string, content: string): Promise<void> {
  await db.delete(artifacts).where(and(eq(artifacts.chatId, chatId), eq(artifacts.filename, filename)));
  await db.insert(artifacts).values({ chatId, filename, content });
  await syncWorkspaceFileForChat(chatId, filename, content);
}

async function listWorkspaceBackedArtifacts(chatId: string): Promise<string[]> {
  const rows = await db
    .select({ filename: artifacts.filename })
    .from(artifacts)
    .where(eq(artifacts.chatId, chatId));
  return rows.map((row) => row.filename).sort();
}

async function readWorkspaceBackedArtifact(chatId: string, filename: string): Promise<string | null> {
  const [row] = await db
    .select({ content: artifacts.content })
    .from(artifacts)
    .where(and(eq(artifacts.chatId, chatId), eq(artifacts.filename, filename)))
    .limit(1);
  return row?.content ?? null;
}

function workspaceToolMetadata(filename: string, content?: string): Record<string, unknown> {
  return {
    filename,
    fileContent: content,
    path: filename,
  };
}

export async function runAgentJob(opts: RunAgentJobOptions): Promise<void> {
  const { jobId, chatId, sessionId, prompt, cwd, provider, model, apiKey, systemPrompt, abortSignal } = opts;

  const broadcastJobEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId, sessionId });
  };

  const writeSlidesTool = createWriteSlidesTool(chatId, async (event) => {
    await broadcastJobEvent(event.type, event.data ?? {});
  });
  const askUserTool = createAskUserTool();
  const nativeWorkspaceTools = [
    {
      name: "workspace_list_files",
      description: "List files saved in the current web workspace database for this chat. Use before reading or editing workspace files.",
      parameters: {
        type: "object",
        properties: {},
      },
      promptSnippet: "- workspace_list_files: List files in the current web database workspace",
      execute: async () => {
        const files = await listWorkspaceBackedArtifacts(chatId);
        return {
          content: files.length > 0 ? files.join("\n") : "No workspace files saved yet.",
          metadata: { files },
        };
      },
    },
    {
      name: "workspace_read_file",
      description: "Read a file from the current web workspace database for this chat.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read, e.g. index.html or src/App.tsx" },
        },
        required: ["path"],
      },
      promptSnippet: "- workspace_read_file: Read a file from the current web database workspace",
      execute: async (input: Record<string, unknown>) => {
        const path = typeof input.path === "string" ? input.path : "";
        if (!path) return { content: "Error: workspace_read_file requires path" };
        const content = await readWorkspaceBackedArtifact(chatId, path);
        if (content == null) return { content: `File not found in workspace: ${path}` };
        return { content, metadata: workspaceToolMetadata(path, content) };
      },
    },
    {
      name: "workspace_write_file",
      description: "Write or replace a file in the current web workspace database. This persists to chat artifacts and syncs to the linked workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write, e.g. index.html or src/App.tsx" },
          content: { type: "string", description: "Complete file content" },
        },
        required: ["path", "content"],
      },
      promptSnippet: "- workspace_write_file: Write or replace a file in the current web database workspace",
      execute: async (input: Record<string, unknown>) => {
        const path = typeof input.path === "string" ? input.path : "";
        const content = typeof input.content === "string" ? input.content : "";
        if (!path) return { content: "Error: workspace_write_file requires path" };
        await persistWorkspaceBackedArtifact(chatId, path, content);
        await broadcastJobEvent("file_written", { filename: path, content, isWorkspaceFile: true });
        return {
          content: `Saved ${content.length} bytes to workspace file ${path}.`,
          metadata: workspaceToolMetadata(path, content),
        };
      },
    },
    {
      name: "workspace_edit_file",
      description: "Edit a file in the current web workspace database by replacing an exact text fragment. Use workspace_read_file first when unsure.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          oldText: { type: "string", description: "Exact text to replace" },
          newText: { type: "string", description: "Replacement text" },
        },
        required: ["path", "oldText", "newText"],
      },
      promptSnippet: "- workspace_edit_file: Replace exact text inside a file in the current web database workspace",
      execute: async (input: Record<string, unknown>) => {
        const path = typeof input.path === "string" ? input.path : "";
        const oldText = typeof input.oldText === "string" ? input.oldText : "";
        const newText = typeof input.newText === "string" ? input.newText : "";
        if (!path) return { content: "Error: workspace_edit_file requires path" };
        if (!oldText) return { content: "Error: workspace_edit_file requires oldText" };
        const current = await readWorkspaceBackedArtifact(chatId, path);
        if (current == null) return { content: `File not found in workspace: ${path}` };
        const occurrences = current.split(oldText).length - 1;
        if (occurrences === 0) return { content: `Text not found in ${path}. Read the file and try again with an exact fragment.` };
        if (occurrences > 1) return { content: `Text occurs ${occurrences} times in ${path}. Use a more specific oldText fragment.` };
        const next = current.replace(oldText, newText);
        await persistWorkspaceBackedArtifact(chatId, path, next);
        await broadcastJobEvent("file_written", { filename: path, content: next, isWorkspaceFile: true });
        return {
          content: `Edited workspace file ${path}.`,
          metadata: workspaceToolMetadata(path, next),
        };
      },
    },
  ];

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
      apiKey,
      systemPrompt,
      nativeTools: [
        {
          name: askUserTool.name,
          description: askUserTool.description,
          parameters: askUserTool.parameters as Record<string, unknown>,
          promptSnippet: `- ${askUserTool.name}: ${askUserTool.description}`,
          execute: async (input) => {
            const result = await askUserTool.execute(`native-${Date.now()}`, input as never);
            return {
              content: toolResultText(result),
              metadata: toolResultMetadata(result),
            };
          },
        },
        ...nativeWorkspaceTools,
        {
          name: writeSlidesTool.name,
          description: writeSlidesTool.description,
          parameters: writeSlidesTool.parameters as Record<string, unknown>,
          promptSnippet: `- ${writeSlidesTool.name}: ${writeSlidesTool.description}`,
          execute: async (input) => {
            const result = await writeSlidesTool.execute(`native-${Date.now()}`, input as never);
            const content = typeof input.content === "string" ? input.content : undefined;
            const isSlide = Boolean(content && SLIDE_DATA_SCRIPT_RE.test(content));
            if (isSlide && content) {
              await persistSlideDeck(chatId, content);
              await broadcastJobEvent("slide_content", {
                fileContent: content,
                theme: typeof input.theme === "string" ? input.theme : undefined,
              });
              await broadcastJobEvent("file_written", { filename: "index.html", content, isSlide: true });
            }
            return {
              content: toolResultText(result),
              metadata: isSlide && content
                ? {
                    ...(toolResultMetadata(result) ?? {}),
                    filename: "index.html",
                    fileContent: content,
                    isSlide: true,
                    theme: typeof input.theme === "string" ? input.theme : undefined,
                    title: typeof input.title === "string" ? input.title : undefined,
                  }
                : toolResultMetadata(result),
            };
          },
        },
      ],
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
          currentStepId = eventStepId(event, `tool-${stepCounter}`);
          if (eventTool(event) === "write_slides") {
            await broadcastJobEvent("slide_building", {});
          }
          await addStep(jobId, {
            id: currentStepId,
            title: eventTitle(event, event.content || "Working"),
            status: "running",
            tool: eventTool(event),
          });
          await broadcastJobEvent("step_start", {
            id: currentStepId,
            title: eventTitle(event, event.content || "Working"),
            tool: eventTool(event),
          });
          break;

        case "step_update":
          if (event.content) {
            const stepId = eventStepId(event, currentStepId);
            if (stepId) {
              await broadcastJobEvent("step_update", { id: stepId, content: event.content });
            }
          }
          break;

        case "step_complete":
          {
            const stepId = eventStepId(event, currentStepId);
            if (!stepId) break;
            const metadata = eventMetadata(event);
            const tool = eventTool(event);
            const filename = typeof metadata.filename === "string" ? metadata.filename : undefined;
            const fileContent = typeof metadata.fileContent === "string" ? metadata.fileContent : undefined;
            const isSlide = metadata.isSlide === true || (tool === "write_slides" && Boolean(fileContent && SLIDE_DATA_SCRIPT_RE.test(fileContent)));
            const result = (event.content || "Done").slice(0, 200);
            if (tool === "ask_user") {
              const parsed = parseAskUserResponse(event.content || "");
              if (parsed) {
                await broadcastJobEvent("ask_user", {
                  question: parsed.question,
                  options: parsed.options,
                  context: parsed.context,
                  threadId: chatId,
                });
              }
            }
            await updateStep(jobId, stepId, { status: "complete", result });
            if (isSlide && fileContent) {
              await persistSlideDeck(chatId, fileContent);
              await broadcastJobEvent("slide_content", {
                fileContent,
                theme: typeof metadata.theme === "string" ? metadata.theme : undefined,
              });
              await broadcastJobEvent("file_written", { filename: filename || "index.html", content: fileContent, isSlide: true });
            }
            await broadcastJobEvent("step_complete", { id: stepId, result, tool, filename, fileContent });
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
          throw new Error(event.content || "Agent failed");

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
      if (slideArtifact?.content && SLIDE_DATA_SCRIPT_RE.test(slideArtifact.content)) {
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
