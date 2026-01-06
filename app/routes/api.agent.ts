import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ChatOpenAI } from "@langchain/openai";
import { Sandbox } from "@deno/sandbox";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { db, messages, chats } from "../lib/db";
import { eq } from "drizzle-orm";
import { loadSkills } from "../agent/skills";
import { getAgentConfig, MANAGER_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from "../agent/agents";
import { selectAgent, type AgentMode } from "../agent/router";
import { createOrchestrator } from "../agent/orchestrator";
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
  createManageSandboxTool
} from "../agent/tools";
import { createAskUserTool, parseAskUserResponse } from "../agent/tools/ask-user";
import { createDelegateToBuildTool, parseDelegateResponse } from "../agent/tools/delegate-build";
import { createDelegateToAgentTool } from "../agent/tools/delegate-agent";
import {
  createJob,
  getJob,
  getJobByChatId,
  addStep,
  updateStep,
  completeJob,
  failJob,
  cancelJob,
  subscribe,
  broadcast,
  type AgentJob,
  type AgentJobStep,
} from "../lib/job-manager";
import { registerJobAbortController, unregisterJobAbortController } from "../lib/job-cancel";
import { createId } from "@paralleldrive/cuid2";

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

const SANDBOX_GRACE_MS = 5 * 60 * 1000;

function scheduleSandboxCleanup(chatId: string, sandboxId: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const activeJob = await getJobByChatId(chatId);
        if (activeJob && activeJob.status === "running") {
          return;
        }
        const sandbox = await Sandbox.connect({ id: sandboxId });
        await sandbox.kill();
        console.log(`[Sandbox] Killed sandbox ${sandboxId} after grace period.`);
      } catch (error) {
        console.error(`[Sandbox] Failed to cleanup sandbox ${sandboxId}:`, error);
      }
    })();
  }, SANDBOX_GRACE_MS);
}

// GET /api/agent?jobId=xxx - Subscribe to existing job updates
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const chatId = url.searchParams.get("chatId");

  // Find job by ID or chatId
  let job: AgentJob | null = null;
  if (jobId) {
    job = await getJob(jobId);
  } else if (chatId) {
    job = await getJobByChatId(chatId);
  }

  if (!job) {
    return new Response(JSON.stringify({ error: "No active job found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream existing steps and subscribe to updates
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch (e) {
          // Client disconnected
        }
      };

      // Send existing steps
      for (const step of job!.steps) {
        send("step_start", { id: step.id, title: step.title });
        if (step.content) {
          send("step_update", { id: step.id, content: step.content });
        }
        if (step.status === "complete") {
          send("step_complete", { id: step.id, result: step.result });
        }
      }

      // If job is already completed, send done
      if (job!.status === "completed") {
        send("done", { content: job!.finalContent, previewUrl: job!.previewUrl });
        controller.close();
        return;
      }

      if (job!.status === "error") {
        send("error", { message: job!.error });
        controller.close();
        return;
      }

      // Subscribe to real-time updates
      const unsubscribe = subscribe(job!.id, (event) => {
        send(event.type, event.data);
        if (event.type === "done" || event.type === "error") {
          controller.close();
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await request.formData();
  let prompt = formData.get("prompt")?.toString();
  const existingSandboxId = formData.get("sandboxId")?.toString();
  const chatId = formData.get("chatId")?.toString();
  const badgesJson = formData.get("badges")?.toString();

  // Handle Badges
  let hasPremadeBadge = false;
  let hasCategoryBadge = false;
  if (badgesJson && prompt) {
    try {
      const badges = JSON.parse(badgesJson);
      if (Array.isArray(badges) && badges.length > 0) {
        const badgeLabels = badges.map((b: any) => b.label).join(", ");
        prompt = `[User Context/Selected Features: ${badgeLabels}]\n${prompt}`;

        hasPremadeBadge = badges.some((b: any) => b.isPremade === true);
        hasCategoryBadge = badges.some((b: any) => b.isPremade === false);
      }
    } catch (e) {
      console.error("Failed to parse badges", e);
    }
  }

  // Agent mode: "plan", "build", or auto-select based on request
  const requestedMode = formData.get("agentMode")?.toString() as AgentMode | undefined;
  let agentMode: AgentMode = requestedMode || selectAgent(prompt || "");

  if (hasPremadeBadge) {
    agentMode = "build";
  } else if (hasCategoryBadge) {
    agentMode = "plan";
  }

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration: OPENROUTER_API_KEY missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create a job ID
  const jobId = createId();
  
  // Create job in Redis
  const job = await createJob(jobId, chatId || "default");

  // Get agent configuration
  const agentConfig = getAgentConfig(agentMode);

  // Load Skills and History
  const skillsContent = await loadSkills();
  let history: (HumanMessage | AIMessage)[] = [];
  if (chatId) {
    const dbMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    history = dbMessages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );
  }

  // Return job ID immediately - client can subscribe to updates
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch (e) {
          // Client disconnected, but agent continues
        }
      };

      // Send job info immediately
      send("job_created", { jobId, chatId });
      send("agent_mode", { mode: agentMode, name: agentConfig.name });

      // Subscribe to job updates FIRST
      const unsubscribe = subscribe(jobId, (event) => {
        console.log("[SSE] Sending event:", event.type, event.data);
        send(event.type, event.data || {});
        if (event.type === "done" || event.type === "error") {
          controller.close();
        }
      });

      // NOW start the background job (after subscription is active)
      const jobAbortController = new AbortController();
      registerJobAbortController(jobId, jobAbortController);

      const abortListener = () => jobAbortController.abort();
      request.signal.addEventListener("abort", abortListener);

      runAgentInBackground(
        jobId,
        chatId || "default",
        prompt,
        agentMode,
        agentConfig,
        skillsContent,
        history,
        existingSandboxId,
        apiKey,
        jobAbortController.signal
      ).catch((error) => {
        console.error("Background agent error:", error);
        failJob(jobId, error instanceof Error ? error.message : String(error));
      }).finally(() => {
        unregisterJobAbortController(jobId);
        request.signal.removeEventListener("abort", abortListener);
      });

      // Handle client disconnect - agent continues running!
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Run the agent in background, broadcasting updates via Redis
 */
async function runAgentInBackground(
  jobId: string,
  chatId: string,
  prompt: string,
  agentMode: AgentMode,
  agentConfig: ReturnType<typeof getAgentConfig>,
  skillsContent: string,
  history: (HumanMessage | AIMessage)[],
  existingSandboxId: string | undefined,
  apiKey: string,
  abortSignal?: AbortSignal
): Promise<void> {
  let sandbox: Sandbox | null = null;
  let previewUrl: string | null = null;
  let sandboxId: string | null = null;

  try {
    // Initialize sandbox if needed
    const needsSandbox = agentMode !== "chat" || !!existingSandboxId;

    if (needsSandbox) {
      const sandboxStepId = "sandbox";
      await addStep(jobId, { id: sandboxStepId, title: "Initializing sandbox...", status: "running" });
      await broadcast(jobId, { type: "step_start", data: { id: sandboxStepId, title: "Initializing sandbox..." } });

      if (existingSandboxId) {
        try {
          sandbox = await Sandbox.connect({ id: existingSandboxId });
          sandboxId = existingSandboxId;
          // @ts-ignore
          await sandbox.extendLifetime("5m");
          await updateStep(jobId, sandboxStepId, { status: "complete", result: "Reconnected" });
          await broadcast(jobId, { type: "step_complete", data: { id: sandboxStepId, result: "Reconnected to existing session" } });
        } catch (reconnectErr) {
          sandbox = await Sandbox.create({ lifetime: "15m" });
          sandboxId = sandbox.id;
          await updateStep(jobId, sandboxStepId, { status: "complete", result: "Created new session" });
          await broadcast(jobId, { type: "step_complete", data: { id: sandboxStepId, result: "Created new session" } });
        }
      } else {
        sandbox = await Sandbox.create({ lifetime: "15m" });
        sandboxId = sandbox.id;
        await updateStep(jobId, sandboxStepId, { status: "complete", result: "Ready" });
        await broadcast(jobId, { type: "step_complete", data: { id: sandboxStepId, result: "Ready" } });
      }

      await broadcast(jobId, { type: "sandbox_info", data: { sandboxId } });
    }

    const allTools: any[] = [
      createPlanTool(),
      createUpdateTodoTool(chatId),
      createReadTodoTool(chatId),
      createAskUserTool(),
      createDelegateToAgentTool(),
      createDelegateToBuildTool(),
    ];

    if (sandbox) {
      allTools.push(
        createRunCodeTool(sandbox),
        createReadFileTool(sandbox),
        createListFilesTool(sandbox),
        createWriteFileTool(sandbox, chatId),
        createShellTool(sandbox),
        createExposePreviewTool(sandbox, (url) => { previewUrl = url; }),
        createWebAppTool(sandbox, chatId),
        createSaveArtifactTool(sandbox, chatId),
        createManageSandboxTool(sandbox)
      );
    }

    const tools = allTools;

    // Setup Orchestrator
    const orchestratorConfig = {
      model: new ChatOpenAI({
        model: "kwaipilot/kat-coder-pro:free",
        apiKey: apiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0.2,
      }),
      tools: tools,
      systemPrompt: `You are an expert full-stack developer agent with access to a persistent Deno Sandbox.
${agentConfig.systemPromptAddition}

=== USER-DEFINED SKILLS (HIGHEST PRIORITY) ===
${skillsContent}
=== END USER-DEFINED SKILLS ===

=== MANDATORY FIRST STEP ===
You MUST call 'create_plan' as your VERY FIRST tool call for every request.
=== END MANDATORY FIRST STEP ===

AVAILABLE TOOLS:
- create_plan: REQUIRED FIRST - Create an execution plan
- update_todo: Track progress on multi-step tasks
- read_todo: Check your current progress
- create_web_app: Scaffold a new web app (vite, react-router, or astro)
- write_file: Write HTML/CSS/JS files
- read_file: Read file contents
- list_files: List directory contents
- run_code: Execute TypeScript/JavaScript code
- shell: Run shell commands
- expose_preview: Start a web server and get a public URL

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

=== SANDBOX LIFECYCLE ===
The sandbox will timeout automatically.
- For long-running tasks, periodically call 'manage_sandbox({ action: "keep_alive" })'
- If the user asks to STOP or when you are fully done, call 'manage_sandbox({ action: "stop" })'

Be FAST and EFFICIENT. Target: Complete most tasks in under 10 tool calls.`,
      managerSystemPrompt: MANAGER_SYSTEM_PROMPT,
      researchSystemPrompt: RESEARCH_SYSTEM_PROMPT,
      planSystemPrompt: getAgentConfig("plan").systemPromptAddition,
      buildSystemPrompt: getAgentConfig("build").systemPromptAddition,
      reviewSystemPrompt: REVIEW_SYSTEM_PROMPT,
    };

    const app = createOrchestrator(orchestratorConfig);

    const inputs = {
      messages: [
        new SystemMessage("You are an expert full-stack developer agent."),
        ...history,
        new HumanMessage(prompt),
      ],
      currentAgent: agentMode === "chat" ? "chat" : "manager",
      requestedMode: agentMode,
    };

    let stepCounter = 0;
    let thinkingStepCounter = 0;
    let currentThinkingId = "";
    let thinkingContent = "";
    let finalContent = "";

    // Collect steps for database
    const collectedSteps: AgentJobStep[] = [];

    const eventStream = await app.streamEvents(inputs, {
      version: "v2",
      recursionLimit: 100,
      signal: abortSignal,
    });

    for await (const event of eventStream) {
      // Manual check as backup, though signal should trigger throw
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
        const toolArgs = data?.input || {};
        const stepId = `tool-${stepCounter}`;

        let title = toolName;
        if (toolName === "create_plan") title = "📋 Creating execution plan";
        else if (toolName === "run_code") title = "Executing code";
        else if (toolName === "read_file") title = `Reading ${toolArgs.path || "file"}`;
        else if (toolName === "list_files") title = `Listing ${toolArgs.path || "files"}`;
        else if (toolName === "write_file") title = `Writing ${toolArgs.path || "file"}`;
        else if (toolName === "expose_preview") title = "Creating live preview";
        else if (toolName === "create_web_app") title = `Scaffolding ${toolArgs.type} app`;
        else if (toolName === "delegate_to_agent") title = `Delegating to ${toolArgs.agent || "agent"}`;

        const step: AgentJobStep = { id: stepId, title, status: "running", tool: toolName };
        collectedSteps.push(step);
        await addStep(jobId, step);
        await broadcast(jobId, { type: "step_start", data: { id: stepId, title, tool: toolName, args: toolArgs } });
      }
      else if (eventType === "on_tool_end") {
        const stepId = `tool-${stepCounter}`;
        const output = data?.output;
        const toolName = name || "";

        if (toolName === "ask_user" && typeof output === "string") {
          const parsed = parseAskUserResponse(output);
          if (parsed) {
            await broadcast(jobId, {
              type: "ask_user",
              data: {
                question: parsed.question,
                options: parsed.options,
                context: parsed.context,
                threadId: chatId,
              },
            });
            await updateStep(jobId, stepId, { status: "complete", result: `❓ Asking: ${parsed.question}` });
            await broadcast(jobId, { type: "step_complete", data: { id: stepId, result: `❓ Asking: ${parsed.question}` } });
            continue;
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
                sandboxId: sandbox?.id,
              },
            });
            await updateStep(jobId, stepId, { status: "complete", result: "🔄 Delegating to Build agent..." });
            await broadcast(jobId, { type: "step_complete", data: { id: stepId, result: "🔄 Delegating to Build agent..." } });
            return;
          }
        }

        let stepResult: string;
        if (toolName === "create_plan") {
          stepResult = typeof output === "string" ? output : "Plan created";
        } else {
          stepResult = typeof output === "string" ? output.slice(0, 200) : "Done";
        }
        
        await updateStep(jobId, stepId, { status: "complete", result: stepResult });
        await broadcast(jobId, { type: "step_complete", data: { id: stepId, result: stepResult } });

        const toolStep = collectedSteps.find(s => s.id === stepId);
        if (toolStep) {
          toolStep.status = "complete";
          toolStep.result = stepResult;
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

    // Complete job
    await completeJob(jobId, finalContent, previewUrl);

    // Save to database
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
