import type { Message, Model } from "@mariozechner/pi-ai";
import { and, eq } from "drizzle-orm";
import { createOrchestrator } from "./orchestrator";
import {
  createPlanTool,
  createUpdateTodoTool,
  createReadTodoTool,
  createRunCodeTool,
  createReadFileTool,
  createListFilesTool,
  createWriteFileTool,
  createShellTool,
  createExposePreviewTool,
  createWebAppTool,
  createSaveArtifactTool,
  createManageSandboxTool,
  createWebSearchTool,
  createSearchImagesTool,
  createWriteSlidesTool,
  createParseDocumentTool
} from "./tools";
import { createAskUserTool, parseAskUserResponse } from "./tools/ask-user";
import { createDelegateToBuildTool } from "./tools/delegate-build";
import { createDelegateToAgentTool } from "./tools/delegate-agent";
import {
  addStep,
  updateStep,
  completeJob,
  failJob,
  cancelJob,
  broadcast,
  type AgentJobStep,
} from "../lib/job-manager";
import { ensureSandbox, scheduleSandboxCleanup } from "./sandbox";
import { filterToolsForAgent, getAgentConfig } from "./agents";
import type { AgentMode } from "./router";
import { db, messages, chats, artifacts, workspaceFiles } from "../lib/db";
import { getActiveModel, createModelInstance } from "./model-manager";
import { syncWorkspaceFileForChat } from "../lib/workspace-sync";

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
type SandboxType = Awaited<ReturnType<typeof ensureSandbox>>['sandbox'];

function formatAvailableTools(tools: Array<{ name: string; description?: string }>): string {
  if (tools.length === 0) {
    return "- No tools are available in this mode.";
  }

  return tools
    .map((tool) => `- ${tool.name}: ${tool.description || "No description available."}`)
    .join("\n");
}

export interface RunAgentJobParams {
  jobId: string;
  chatId: string;
  sessionId: string;
  prompt: string;
  agentMode: AgentMode;
  agentConfig: AgentConfig;
  skillsContent: string;
  history: Message[];
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
    existingSandboxId,
    apiKey,
    abortSignal,
  } = params;

  let sandbox: SandboxType | null = null;
  let previewUrl: string | null = null;
  let sandboxId: string | null = null;
  let sandboxInitPromise: Promise<void> | null = null;

  const broadcastJobEvent = async (type: string, data: Record<string, unknown>) => {
    await broadcast(jobId, { type, data, jobId, chatId, sessionId });
  };

  const formatSandboxInitError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("port is already allocated") || message.includes("Bind for 0.0.0.0:10000 failed")) {
      return "Sandbox failed to start: port 10000 is already in use. Stop the existing sandbox container or configure the sandbox server to use a different port.";
    }
    return message;
  };

  const ensureSandboxInitialized = async (): Promise<SandboxType> => {
    if (sandbox) return sandbox;
    
    if (sandboxInitPromise) {
      await sandboxInitPromise;
      return sandbox!;
    }

    sandboxInitPromise = (async () => {
      const sandboxStepId = "sandbox";
      await addStep(jobId, { id: sandboxStepId, title: "Initializing sandbox...", status: "running" });
      await broadcastJobEvent("step_start", { id: sandboxStepId, title: "Initializing sandbox..." });

      try {
        const sandboxResult = await ensureSandbox(existingSandboxId);
        sandbox = sandboxResult.sandbox;
        sandboxId = sandboxResult.sandboxId;

        if (!sandboxResult.reconnected) {
          const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
          const sharedFiles = chat?.workspaceId
            ? await db.select().from(workspaceFiles).where(eq(workspaceFiles.workspaceId, chat.workspaceId))
            : [];
          const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));

          const filesToRestore = new Map<string, string>();
          for (const file of sharedFiles) {
            filesToRestore.set(file.path, file.content);
          }
          for (const artifact of chatArtifacts) {
            filesToRestore.set(artifact.filename, artifact.content);
          }

          for (const [path, content] of filesToRestore) {
            const dir = path.split("/").slice(0, -1).join("/");
            if (dir) {
              await sandbox.exec(`mkdir -p ${dir}`);
            }
            await sandbox.writeFile(path, content);
          }
        }

        let result: string;
        if (sandboxResult.reconnected) {
          result = "Reconnected to existing session";
        } else if (existingSandboxId) {
          result = "Created new session";
        } else {
          result = "Ready";
        }

        await updateStep(jobId, sandboxStepId, { status: "complete", result });
        await broadcastJobEvent("step_complete", { id: sandboxStepId, result });
        await broadcastJobEvent("sandbox_info", { sandboxId });
      } catch (error) {
        const message = formatSandboxInitError(error);
        sandbox = null;
        sandboxId = null;
        await updateStep(jobId, sandboxStepId, { status: "error", result: message });
        await broadcastJobEvent("step_complete", { id: sandboxStepId, result: message });
        sandboxInitPromise = null;
        throw new Error(message);
      }
    })();

    await sandboxInitPromise;
    return sandbox!;
  };

  const slideRequest = isSlideRequest(prompt);
  let slideContentThrottleTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    // Create broadcast helper for tools that need it
    const broadcastForTools = async (event: { type: string; data: any }) => {
      await broadcastJobEvent(event.type, event.data ?? {});
    };

    const allTools: any[] = [
      createPlanTool(),
      createUpdateTodoTool(chatId),
      createReadTodoTool(chatId),
      createAskUserTool(),
      createDelegateToAgentTool(),
      createDelegateToBuildTool(),
      createWebSearchTool(),
      createSearchImagesTool(),
      createParseDocumentTool(),
      // Sandbox-free slide tool - no sandbox needed!
      createWriteSlidesTool(chatId, broadcastForTools),
    ];

    const getSandboxTool = <T extends { execute: (...args: any[]) => Promise<any> }>(
      createFn: (sandbox: SandboxType, ...args: any[]) => T,
      ...args: any[]
    ): T => {
      const originalTool = createFn(null as any, ...args);
      const tool = originalTool as any;
      tool.execute = async (...invokeArgs: any[]) => {
        await ensureSandboxInitialized();
        const realTool = createFn(sandbox!, ...args) as any;
        return realTool.execute(...invokeArgs);
      };
      return tool;
    };

    // Add sandbox-dependent tools with lazy initialization
    allTools.push(
      createWriteFileTool(() => sandbox, chatId),
      getSandboxTool(createRunCodeTool),
      getSandboxTool(createReadFileTool),
      getSandboxTool(createListFilesTool),
      getSandboxTool(createShellTool),
      getSandboxTool(createExposePreviewTool, (url: string) => { previewUrl = url; }),
      getSandboxTool(createWebAppTool, chatId),
      getSandboxTool(createSaveArtifactTool, chatId),
      getSandboxTool(createManageSandboxTool)
    );

    // Get active model configuration from database
    const modelConfig = await getActiveModel();
    
    let resolvedModel: { model: Model<any>; apiKey: string; temperature: number };
    if (modelConfig) {
      resolvedModel = await createModelInstance(modelConfig, apiKey);
    } else {
      throw new Error("No active model configured. Add or activate a model in Settings.");
    }

    const activeTools = filterToolsForAgent(allTools, agentMode);
    const slidePreferredToolNames = new Set(["write_slides"]);
    const requestTools = slideRequest
      ? activeTools.filter((tool) => slidePreferredToolNames.has(tool.name))
      : activeTools;
    const activeToolNames = new Set(requestTools.map((tool) => tool.name));
    const availableToolsText = formatAvailableTools(requestTools);
    const askUserGuidance = activeToolNames.has("ask_user")
      ? `IMPORTANT: When you need to ask the user a question, you MUST use the ask_user tool. Do NOT ask questions in your text response - the user cannot reply to text questions. The ask_user tool shows an interactive prompt the user can respond to.`
      : `IMPORTANT: No interactive question tool is available in this mode. If you are missing required information, explain the blocker plainly instead of inventing a tool call.`;
    const webSearchGuidance = activeToolNames.has("web_search")
      ? `WEB SEARCH:\nUse the web_search tool to research topics before creating content.\nFor slide presentations, ALWAYS search first to gather accurate, current information.\nExample: web_search({ query: "AI trends 2024 statistics" })`
      : `WEB SEARCH:\nThe web_search tool is not available in this mode. Do not claim to have searched the web or emit fake tool calls.`;
    const imageSearchGuidance = activeToolNames.has("search_images")
      ? `IMAGE SEARCH:\nUse the search_images tool to find photos for slides and presentations.\nExample: search_images({ query: "modern office workspace", orientation: "landscape" })\nThe tool returns image URLs - use them in 'image' type slides:\n{"type": "image", "title": "Our Office", "imageUrl": "<URL from search>", "caption": "Photo credit"}`
      : `IMAGE SEARCH:\nThe search_images tool is not available in this mode.`;
    const parseDocumentGuidance = activeToolNames.has("parse_document")
      ? `DOCUMENT PARSING:\nUse the parse_document tool to extract text from PDFs and documents when the user provides a URL or when you need to analyze document contents.\nExample: parse_document({ url: "https://example.com/report.pdf" })\nFor large documents, use targetPages to parse specific pages: parse_document({ url: "...", targetPages: "1-5" })\nEnable ocrEnabled for scanned documents with images instead of text.`
      : `DOCUMENT PARSING:\nThe parse_document tool is not available in this mode.`;

    const orchestratorConfig = {
      model: resolvedModel.model,
      tools: requestTools,
      apiKey: resolvedModel.apiKey,
      temperature: resolvedModel.temperature,
      systemPrompt: `You are an expert full-stack developer agent with access to a persistent sandbox environment.
${agentConfig.systemPromptAddition}

=== USER-DEFINED SKILLS (HIGHEST PRIORITY) ===
${skillsContent}
=== END USER-DEFINED SKILLS ===

=== PRIMARY / SUBAGENT MODEL ===
- Primary agents (build/plan/chat) handle the main conversation.
- Subagents (general/explore/review) are delegated for focused tasks via delegate_to_agent.
- When acting as a subagent, return concise findings for the primary agent.
=== END MODEL ===

AVAILABLE TOOLS:
${availableToolsText}

${askUserGuidance}

${webSearchGuidance}

${imageSearchGuidance}

${parseDocumentGuidance}

FRAMEWORK SELECTION:
- Games/Interactive apps: type="vite"
- Full web apps with routing: type="react-router"
- Static sites/landing pages: type="astro"

=== SANDBOX PACKAGE MANAGER ===
- The sandbox has Bun available for package management and script execution.
- Do not tell the user to use npm in the sandbox.
- Use bun install, bun run <script>, bun add, and bunx when needed.

=== GAME DEVELOPMENT (CRITICAL!) ===
When building games, you MUST actually implement the game logic, not just scaffold!

GAME BUILD SEQUENCE:
1. create_web_app({ type: "vite", name: "game-name" }) → scaffold
2. shell → "cd game-name && bun install"
3. write_file → Write the COMPLETE game code to src/App.tsx or src/main.tsx
   - Include ALL game logic: player controls, physics, collision detection, scoring
   - Use React hooks (useState, useEffect, useRef) for game state
   - Use Canvas API or CSS for rendering
   - Handle keyboard/touch input
   - Implement game loop with requestAnimationFrame
4. shell → "cd game-name && bun run build"
5. expose_preview → Get playable URL

GAME IMPLEMENTATION REQUIREMENTS:
- Write COMPLETE, WORKING game code - not just a template or placeholder
- Include: Game state (playing/paused/gameover), Score tracking, Restart functionality
- Handle player input (keyboard arrows, WASD, space, touch)
- Implement proper game physics (gravity, velocity, collision)
- Add visual feedback and game UI (score display, game over screen)

Example game structure in App.tsx:
- useRef for canvas element
- useState for game state (score, gameOver, entities)
- useEffect for game loop and input handlers
- Draw function to render game
- Update function for physics/logic

DO NOT just create a scaffold and stop. The user expects a PLAYABLE GAME!

=== BUILD SEQUENCE (General) ===
1. create_web_app → scaffold
2. shell → "cd <project> && bun install"
3. Write application code with write_file
4. shell → "cd <project> && bun run build"
5. expose_preview → IMMEDIATELY after build

CRITICAL: The 'create_web_app' tool REQUIRES the 'type' parameter.

=== SLIDE PRESENTATIONS (NO SANDBOX NEEDED!) ===
For slides/presentations, use the 'write_slides' tool - this does NOT require a sandbox!

CRITICAL SLIDE RULES:
- For any request to create slides, a deck, a presentation, or a PPT, your FIRST meaningful action must be a tool call.
- Do NOT write a conversational preamble like "I'll create the slides" before calling tools.
- Research before drafting slides whenever you have a research tool available.
- For slide requests, the first tool call should usually be 'web_search', 'parse_document', or 'search_images' when those tools are relevant and available.
- If research tools are unavailable, draft directly from the user's provided material and say you relied on the supplied context.
- After gathering enough context, use 'write_slides' to produce the deck draft.
- Prefer creating the full first draft of the deck in a single 'write_slides' call, then refine with additional 'write_slides' calls only if needed.
- Only ask follow-up questions if essential information is truly missing.
- Never use 'write_file' for slide decks. Always use 'write_slides'.

The HTML MUST contain a <script id="slide-data" type="application/json"> tag:

<script id="slide-data" type="application/json">
[
  {"id": 1, "type": "title", "title": "Slide Title", "subtitle": "Optional subtitle"},
  {"id": 2, "type": "content", "title": "Content Slide", "bullets": ["Point 1", "Point 2"]}
]
</script>

Slide types: "title", "content", "accent", "image", "quote", "twoColumn".

When user asks for slides/presentation/ppt:
1. Gather context first with available research tools when the topic would benefit from factual grounding, current data, or source material
2. Use 'write_slides' tool with the HTML content (NOT write_file!)
3. DO NOT call expose_preview - slides render natively
4. Produce the first complete deck draft once you have enough research or user-provided material
5. If you refine, overwrite the deck with another 'write_slides' call

=== SANDBOX LIFECYCLE ===
The sandbox will timeout automatically.
- For long-running tasks, periodically call 'manage_sandbox({ action: "keep_alive" })'
- If the user asks to STOP or when you are fully done, call 'manage_sandbox({ action: "stop" })'

Be FAST and EFFICIENT. Target: Complete most tasks in under 10 tool calls.`,
    };

    const app = createOrchestrator(orchestratorConfig);

    const inputs = {
      messages: [
        ...history,
        { role: "user" as const, content: prompt, timestamp: Date.now() },
      ],
      currentAgent: agentMode,
      requestedMode: agentMode,
    };

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

    const eventStream = app.streamEvents(inputs, { signal: runnerAbortController.signal });
    const eventIterator = eventStream[Symbol.asyncIterator]();

    // Signal the frontend early so it can show the building skeleton
    if (slideRequest) {
      await broadcastJobEvent("slide_building", {});
    }

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
        if (slideRequest && !toolStarted) {
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

    if (slideRequest && !toolStarted && !slideFileContent) {
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
  }
}
