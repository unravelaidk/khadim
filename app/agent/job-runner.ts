import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { Sandbox } from "@deno/sandbox";
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
  createWriteSlidesTool
} from "./tools";
import { createAskUserTool, parseAskUserResponse } from "./tools/ask-user";
import { createDelegateToBuildTool, parseDelegateResponse } from "./tools/delegate-build";
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
import { getAgentConfig } from "./agents";
import type { AgentMode } from "./router";
import { db, messages, chats, artifacts } from "../lib/db";

type AgentConfig = ReturnType<typeof getAgentConfig>;

export interface RunAgentJobParams {
  jobId: string;
  chatId: string;
  prompt: string;
  agentMode: AgentMode;
  agentConfig: AgentConfig;
  skillsContent: string;
  history: (HumanMessage | AIMessage)[];
  existingSandboxId?: string;
  apiKey: string;
  abortSignal?: AbortSignal;
}

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

  let sandbox: Sandbox | null = null;
  let previewUrl: string | null = null;
  let sandboxId: string | null = null;
  let sandboxInitPromise: Promise<void> | null = null;

  const ensureSandboxInitialized = async (): Promise<Sandbox> => {
    if (sandbox) return sandbox;
    
    if (sandboxInitPromise) {
      await sandboxInitPromise;
      return sandbox!;
    }

    sandboxInitPromise = (async () => {
      const sandboxStepId = "sandbox";
      await addStep(jobId, { id: sandboxStepId, title: "Initializing sandbox...", status: "running" });
      await broadcast(jobId, { type: "step_start", data: { id: sandboxStepId, title: "Initializing sandbox..." } });

      const sandboxResult = await ensureSandbox(existingSandboxId);
      sandbox = sandboxResult.sandbox;
      sandboxId = sandboxResult.sandboxId;

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
      // Sandbox-free slide tool - no sandbox needed!
      createWriteSlidesTool(chatId, broadcastForTools),
    ];

    // Add sandbox-dependent tools that will lazily initialize sandbox when first called
    // We always add them, but they trigger sandbox creation on first use
    const lazySandboxGetter = async () => ensureSandboxInitialized();
    
    // Create tools with lazy sandbox - we need to create them with a sandbox proxy
    // For now, we'll create them upfront if there's an existing sandbox, otherwise create a placeholder
    // Actually, we need to refactor the tool creation to be lazy
    
    // Simpler approach: Always add the tools, but they'll use the lazy getter
    // The trick is that createXxxTool functions return tools that capture `sandbox` in closure
    // We need a different approach - create tools that lazily get sandbox
    
    // For now, let's use a simpler approach: create a proxy sandbox that triggers init
    const getSandboxTool = <T>(
      createFn: (sandbox: Sandbox, ...args: any[]) => T,
      ...args: any[]
    ): T => {
      // Create a lazy tool that initializes sandbox on first invoke
      const originalTool = createFn(null as any, ...args);
      if (!originalTool || typeof originalTool !== 'object' || !('invoke' in originalTool)) {
        return originalTool;
      }
      
      // Wrap the invoke method
      const tool = originalTool as any;
      const originalInvoke = tool.invoke.bind(tool);
      tool.invoke = async (...invokeArgs: any[]) => {
        await ensureSandboxInitialized();
        // Re-create the tool with the actual sandbox
        const realTool = createFn(sandbox!, ...args) as any;
        return realTool.invoke(...invokeArgs);
      };
      return tool;
    };

    // Add sandbox-dependent tools with lazy initialization
    allTools.push(
      getSandboxTool(createRunCodeTool),
      getSandboxTool(createReadFileTool),
      getSandboxTool(createListFilesTool),
      getSandboxTool(createWriteFileTool, chatId),
      getSandboxTool(createShellTool),
      getSandboxTool(createExposePreviewTool, (url: string) => { previewUrl = url; }),
      getSandboxTool(createWebAppTool, chatId),
      getSandboxTool(createSaveArtifactTool, chatId),
      getSandboxTool(createManageSandboxTool)
    );

    const orchestratorConfig = {
      model: new ChatOpenAI({
        model: "mistralai/devstral-2512:free",
        apiKey: apiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0.2,
      }),
      tools: allTools,
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
- create_plan: Create an execution plan when needed
- update_todo: Track progress on multi-step tasks
- read_todo: Check your current progress
- web_search: Search the web using DuckDuckGo for research
- search_images: Find high-quality images for slides and presentations
- create_web_app: Scaffold a new web app (vite, react-router, or astro)
- write_file: Write HTML/CSS/JS files
- read_file: Read file contents
- list_files: List directory contents
- run_code: Execute TypeScript/JavaScript code
- shell: Run shell commands
- expose_preview: Start a web server and get a public URL

WEB SEARCH:
Use the web_search tool to research topics before creating content.
For slide presentations, ALWAYS search first to gather accurate, current information.
Example: web_search({ query: "AI trends 2024 statistics" })

IMAGE SEARCH:
Use the search_images tool to find photos for slides and presentations.
Example: search_images({ query: "modern office workspace", orientation: "landscape" })
The tool returns image URLs - use them in 'image' type slides:
{"type": "image", "title": "Our Office", "imageUrl": "<URL from search>", "caption": "Photo credit"}

FRAMEWORK SELECTION:
- Games/Interactive apps: type="vite"
- Full web apps with routing: type="react-router"
- Static sites/landing pages: type="astro"

=== BUILD SEQUENCE ===
1. create_web_app → scaffold
2. shell → "cd <project> && npm install"
3. shell → "cd <project> && npm run build"
4. expose_preview → IMMEDIATELY after build

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
        new SystemMessage("You are an expert full-stack developer agent."),
        ...history,
        new HumanMessage(prompt),
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

    const eventStream = await app.streamEvents(inputs, {
      version: "v2",
      recursionLimit: 100,
      signal: abortSignal,
    });

    for await (const event of eventStream) {
      if (abortSignal?.aborted) {
        throw new Error("AbortError");
      }

      const { event: eventType, name, data } = event;

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

        if (toolName === "delegate_to_build" && typeof output === "string") {
          const delegation = parseDelegateResponse(output);
          if (delegation) {
            await broadcast(jobId, {
              type: "delegate_build",
              data: {
                plan: delegation.plan,
                context: delegation.context,
                threadId: chatId,
                sandboxId: sandboxId,
              },
            });
            await updateStep(jobId, stepId, { status: "complete", result: "🔄 Delegating to Build agent..." });
            await broadcast(jobId, { type: "step_complete", data: { id: stepId, result: "🔄 Delegating to Build agent..." } });
            // Don't return early - let the orchestrator continue with the build agent
            // The orchestrator's processTools() already routes to build agent via parseDelegateResponse
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
      else if (eventType === "on_chain_end" && name === "LangGraph") {
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
