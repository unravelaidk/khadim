import type { Message, Model } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
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

export async function runAgentJob(params: RunAgentJobParams): Promise<void> {
  const {
    jobId,
    chatId,
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
      await broadcast(jobId, { type: "step_start", data: { id: sandboxStepId, title: "Initializing sandbox..." } });

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
        await broadcast(jobId, { type: "step_complete", data: { id: sandboxStepId, result } });
        await broadcast(jobId, { type: "sandbox_info", data: { sandboxId } });
      } catch (error) {
        const message = formatSandboxInitError(error);
        sandbox = null;
        sandboxId = null;
        await updateStep(jobId, sandboxStepId, { status: "error", result: message });
        await broadcast(jobId, { type: "step_complete", data: { id: sandboxStepId, result: message } });
        sandboxInitPromise = null;
        throw new Error(message);
      }
    })();

    await sandboxInitPromise;
    return sandbox!;
  };

  try {
    // Create broadcast helper for tools that need it
    const broadcastForTools = async (event: { type: string; data: any }) => {
      await broadcast(jobId, event);
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
    const activeToolNames = new Set(activeTools.map((tool) => tool.name));
    const availableToolsText = formatAvailableTools(activeTools);
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
      tools: allTools,
      apiKey: resolvedModel.apiKey,
      temperature: resolvedModel.temperature,
      systemPrompt: `You are an expert full-stack developer agent with access to a persistent Deno Sandbox.
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

=== GAME DEVELOPMENT (CRITICAL!) ===
When building games, you MUST actually implement the game logic, not just scaffold!

GAME BUILD SEQUENCE:
1. create_web_app({ type: "vite", name: "game-name" }) → scaffold
2. shell → "cd game-name && npm install"
3. write_file → Write the COMPLETE game code to src/App.tsx or src/main.tsx
   - Include ALL game logic: player controls, physics, collision detection, scoring
   - Use React hooks (useState, useEffect, useRef) for game state
   - Use Canvas API or CSS for rendering
   - Handle keyboard/touch input
   - Implement game loop with requestAnimationFrame
4. shell → "cd game-name && npm run build"
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
2. shell → "cd <project> && npm install"
3. Write application code with write_file
4. shell → "cd <project> && npm run build"
5. expose_preview → IMMEDIATELY after build

CRITICAL: The 'create_web_app' tool REQUIRES the 'type' parameter.

=== SLIDE PRESENTATIONS (NO SANDBOX NEEDED!) ===
For slides/presentations, use the 'write_slides' tool - this does NOT require a sandbox!

The HTML MUST contain a <script id="slide-data" type="application/json"> tag:

<script id="slide-data" type="application/json">
[
  {"id": 1, "type": "title", "title": "Slide Title", "subtitle": "Optional subtitle"},
  {"id": 2, "type": "content", "title": "Content Slide", "bullets": ["Point 1", "Point 2"]}
]
</script>

Slide types: "title", "content", "accent", "image", "quote", "twoColumn".

When user asks for slides/presentation/ppt:
1. Use 'write_slides' tool with the HTML content (NOT write_file!)
2. DO NOT call expose_preview - slides render natively
3. Generate ONE slide at a time, adding to the presentation incrementally

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
    let finalContent = "";
    let lastPlanOutput = "";

    const collectedSteps: AgentJobStep[] = [];
    
    // Track file writes for real-time display
    const pendingFileWrites = new Map<string, { path: string; content: string }>();

    const eventStream = app.streamEvents(inputs, { signal: abortSignal });

    for await (const event of eventStream) {
      if (abortSignal?.aborted) {
        throw new Error("AbortError");
      }

      const { event: eventType, name, data } = event as { event: string; name?: string; data?: any };

      if (eventType === "on_chat_model_start") {
        thinkingStepCounter++;
        currentThinkingId = `thinking-${thinkingStepCounter}`;
        thinkingContent = "";
        const stepTitle = `Reasoning (step ${thinkingStepCounter})`;
        
        const step: AgentJobStep = { id: currentThinkingId, title: stepTitle, status: "running" };
        collectedSteps.push(step);
        await addStep(jobId, step);
        await broadcast(jobId, { type: "step_start", data: { id: currentThinkingId, title: stepTitle } });
      }
      else if (eventType === "on_chat_model_stream") {
        const chunk = data?.chunk;
        if (chunk?.content) {
          const text = typeof chunk.content === "string" ? chunk.content : "";
          if (text) {
            thinkingContent += text;
            const displayContent = thinkingContent.length > 300
              ? thinkingContent.slice(0, 300) + "..."
              : thinkingContent;
            await broadcast(jobId, { type: "step_update", data: { id: currentThinkingId, content: displayContent } });
          }
        }
      }
      else if (eventType === "text_delta") {
        const text = typeof data?.content === "string" ? data.content : "";
        if (text) {
          finalContent += text;
          await broadcast(jobId, { type: "text_delta", data: { content: text } });
        }
      }
      else if (eventType === "on_chat_model_end") {
        if (currentThinkingId) {
          const resultPreview = thinkingContent.slice(0, 100) + (thinkingContent.length > 100 ? "..." : "");
          await updateStep(jobId, currentThinkingId, { status: "complete", content: thinkingContent, result: resultPreview });
          await broadcast(jobId, { type: "step_complete", data: { id: currentThinkingId, result: resultPreview } });
          
          const step = collectedSteps.find(s => s.id === currentThinkingId);
          if (step) {
            step.status = "complete";
            step.content = thinkingContent;
            step.result = resultPreview;
          }
        }
      }
      else if (eventType === "on_tool_start") {
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

        // Include file content in broadcast for write_file
        const step: AgentJobStep = { id: stepId, title, status: "running", tool: toolName };
        collectedSteps.push(step);
        await addStep(jobId, step);
        await broadcast(jobId, { 
          type: "step_start", 
          data: { 
            id: stepId, 
            title, 
            tool: toolName, 
            args: toolArgs,
            // Include file info for write_file tool
            filename: filePath,
            fileContent: fileContent,
          } 
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
            await broadcast(jobId, {
              type: "ask_user",
              data: {
                question: parsed.question,
                options: parsed.options,
                context: enrichedContext,
                threadId: chatId,
              },
            });
            await updateStep(jobId, stepId, { status: "complete", result: `❓ Asking: ${parsed.question}` });
            await broadcast(jobId, { type: "step_complete", data: { id: stepId, result: `❓ Asking: ${parsed.question}` } });
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
        await broadcast(jobId, { 
          type: "step_complete", 
          data: { 
            id: stepId, 
            result: stepResult,
            tool: toolName,
            filename: fileInfo?.path,
            fileContent: fileInfo?.content,
          } 
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
      await broadcast(jobId, { 
        type: "slide_content", 
        data: { fileContent: slideFileContent } 
      });
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
