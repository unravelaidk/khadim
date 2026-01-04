import { type ActionFunctionArgs } from "react-router";
import { ChatOpenAI } from "@langchain/openai";
import { Sandbox } from "@deno/sandbox";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateGraph, MessagesAnnotation, END, START } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { db, messages, chats } from "../lib/db";
import { eq } from "drizzle-orm";
import { loadSkills } from "../agent/skills";
import { getAgentConfig, filterToolsForAgent } from "../agent/agents";
import { selectAgent, type AgentMode } from "../agent/router";
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
  createSaveArtifactTool
} from "../agent/tools";
import { createAskUserTool, parseAskUserResponse } from "../agent/tools/ask-user";

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
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

        // Check for premade badges (specific examples like "Pong") vs category badges
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

  // Badge-based mode override (takes precedence over router detection):
  // - Premade badge (specific example like "Pong") → build mode directly
  // - Category badge only (like "Create slides") → FORCE plan mode, user needs to provide details
  if (hasPremadeBadge) {
    agentMode = "build";  // Specific request with full prompt, go straight to build
  } else if (hasCategoryBadge) {
    agentMode = "plan";   // Category selected but no specific prompt, FORCE plan mode to ask questions
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

  // Get agent configuration
  const agentConfig = getAgentConfig(agentMode);

  // Load Skills (Optional)
  const skillsContent = await loadSkills();

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(type, data)));
      };

      let sandbox: Sandbox | null = null;
      let previewUrl: string | null = null;
      let sandboxId: string | null = null;

      try {
        // Only initialize sandbox for BUILD mode, not for plan or chat
        // Plan mode only needs to read, analyze, and ask questions - no sandbox needed
        // Sandbox will be created when transitioning from plan to build
        const needsSandbox = agentMode === "build" || !!existingSandboxId;

        if (needsSandbox) {
          if (existingSandboxId) {
            send("step_start", { id: "sandbox", title: "Reconnecting to sandbox..." });
            try {
              sandbox = await Sandbox.connect({ id: existingSandboxId });
              sandboxId = existingSandboxId;

              // @ts-ignore - method exists at runtime
              await sandbox.extendLifetime("5m");

              send("step_complete", { id: "sandbox", result: "Reconnected to existing session" });
            } catch (reconnectErr) {

              send("step_update", { id: "sandbox", content: "Session expired, creating new sandbox..." });
              sandbox = await Sandbox.create({ lifetime: "15m" });
              sandboxId = sandbox.id;
              send("step_complete", { id: "sandbox", result: "Created new session" });
            }
          } else {
            send("step_start", { id: "sandbox", title: "Initializing sandbox environment" });
            sandbox = await Sandbox.create({ lifetime: "15m" });
            sandboxId = sandbox.id;
            send("step_complete", { id: "sandbox" });
          }

          send("sandbox_info", { sandboxId });
        }
      } catch (err) {
        send("error", { message: "Failed to create sandbox environment" });
        controller.close();
        return;
      }

      try {
        // Send agent mode info to client
        send("agent_mode", { mode: agentMode, name: agentConfig.name });

        // Create tools
        // Always allowed tools
        const allTools: any[] = [
          createPlanTool(),
          createUpdateTodoTool(chatId || "default"),
          createReadTodoTool(chatId || "default"),
          createAskUserTool(),
        ];

        // Sandbox-dependent tools
        if (sandbox) {
          allTools.push(
            createRunCodeTool(sandbox),
            createReadFileTool(sandbox),
            createListFilesTool(sandbox),
            createWriteFileTool(sandbox, chatId),
            createShellTool(sandbox),
            createExposePreviewTool(sandbox, (url) => { previewUrl = url; }),
            createWebAppTool(sandbox, chatId),
            createSaveArtifactTool(sandbox, chatId || "default")
          );
        }

        // Filter tools based on agent mode
        const tools = filterToolsForAgent(allTools, agentMode);

        const toolNode = new ToolNode(tools);

        const model = new ChatOpenAI({
          model: "kwaipilot/kat-coder-pro:free",
          apiKey: apiKey,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1",
          },
          temperature: 0.2,
        }).bindTools(tools);

        function shouldContinue(state: typeof MessagesAnnotation.State) {
          const { messages } = state;
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
          }
          return END;
        }

        async function callModel(state: typeof MessagesAnnotation.State) {
          const response = await model.invoke(state.messages);
          return { messages: [response] };
        }

        const workflow = new StateGraph(MessagesAnnotation)
          .addNode("agent", callModel)
          .addNode("tools", toolNode)
          .addEdge(START, "agent")
          .addConditionalEdges("agent", shouldContinue, ["tools", END])
          .addEdge("tools", "agent");

        const app = workflow.compile();

        const inputs = {
          messages: [
            new SystemMessage(`You are an expert full-stack developer agent with access to a persistent Deno Sandbox.

${agentConfig.systemPromptAddition}

=== USER-DEFINED SKILLS (HIGHEST PRIORITY) ===
CRITICAL: If a user request matches ANY skill below, you MUST follow that skill's instructions EXACTLY. 
Skills override ALL default workflows below. Check skills FIRST before using default workflows.
${skillsContent}
=== END USER-DEFINED SKILLS ===

=== MANDATORY FIRST STEP ===
You MUST call 'create_plan' as your VERY FIRST tool call for every request.
This shows the user your execution plan before you start working.
Never skip the planning step.
=== END MANDATORY FIRST STEP ===
            
AVAILABLE TOOLS:
- create_plan: REQUIRED FIRST - Create an execution plan showing what you'll build
- update_todo: Track progress on multi-step tasks (mark items as pending/in_progress/done)
- read_todo: Check your current progress and remaining tasks
- create_web_app: Scaffold a new web app (vite, react-router, or astro)
- write_file: Write HTML/CSS/JS files directly (for simple pages)
- read_file: Read file contents
- list_files: List directory contents
- run_code: Execute TypeScript/JavaScript code
- shell: Run shell commands
- expose_preview: Start a non-blocking web server and get a public URL (REQUIRED for viewing apps)

FRAMEWORK SELECTION GUIDE:
- **Games/Interactive apps**: Use type="vite" (outputs to dist/)
- **Full web apps with routing**: Use type="react-router" (outputs to build/client/)
- **Simple static sites/landing pages**: Use type="astro" (outputs to dist/)

=== 🚨 MANDATORY BUILD SEQUENCE - FOLLOW EXACTLY 🚨 ===
After running "npm run build", your VERY NEXT tool call MUST be 'expose_preview'. No exceptions!

STEP 1: create_web_app → scaffold project
STEP 2: shell → "cd <project> && npm install"  
STEP 3: shell → "cd <project> && npm run build"
STEP 4: expose_preview → IMMEDIATELY after build succeeds!

Example for Step 4 (call this tool right after build):
  Tool: expose_preview
  Arguments: { "port": 8000, "startServer": true, "root": "<project>/dist" }

⚠️ DO NOT:
- Use shell to start a server (python3 -m http.server, npm run dev, etc.) - THIS WILL HANG!
- Read files, list directories, or do anything else between build and expose_preview
- Give up if something fails - fix it and continue

The expose_preview tool starts a Deno file server in the background and returns a public URL.
=== END MANDATORY SEQUENCE ===

STYLING: Prefer using **Tailwind CSS** for styling to create modern, responsive designs.

=== CRITICAL TOOL USAGE RULES ===
The 'create_web_app' tool REQUIRES the 'type' parameter. NEVER omit it:

CORRECT EXAMPLES:
✅ create_web_app({ type: "astro", name: "my-portfolio" })
✅ create_web_app({ type: "vite", name: "flappy-bird" })
✅ create_web_app({ type: "react-router", name: "my-app" })

WRONG (will fail):
❌ create_web_app({ name: "my-portfolio" })  // MISSING TYPE!
❌ create_web_app({ type: undefined, name: "my-site" })

=== ERROR RECOVERY (CRITICAL) ===
When a command FAILS, you MUST:
1. READ the full error output carefully
2. IDENTIFY the specific error (syntax error, missing file, wrong config, etc.)
3. FIX only that specific issue
4. Do NOT start over or try a completely different approach
5. Do NOT give up and fall back to simpler solutions

Common errors and fixes:
- "Module not found" → Check import paths, run npm install
- "Syntax error" → Fix the syntax in the specific file mentioned
- "Cannot find package" → Run npm install <package>
- CSS errors → Check for missing semicolons, brackets in CSS file

=== EFFICIENCY GUIDELINES (CRITICAL) ===
Be FAST and EFFICIENT. Minimize tool calls:
1. **Plan first**: Know exactly what you'll build before calling any tools.
2. **Batch operations**: Write multiple files in sequence without reading them back.
3. **No redundant reads**: Don't read files you just wrote or files you don't need.
4. **No exploration**: Don't list directories unless absolutely necessary.
5. **Use create_web_app correctly**: ALWAYS specify type ("vite", "react-router", or "astro").
6. **One build attempt**: If build fails, fix the specific error - don't restart from scratch.
7. **Direct path**: Scaffold → Install → Build → Preview. No detours.

Target: Complete most tasks in under 10 tool calls.
=== END GUIDELINES ===

Your final response should include:
- Brief summary of what was created
- The preview URL
- Key features/instructions
            `),
            new HumanMessage(prompt),
          ],
        };

        let stepCounter = 0;
        let thinkingStepCounter = 0;
        let currentThinkingId = "";
        let thinkingContent = "";

        const eventStream = await app.streamEvents(inputs, {
          version: "v2",
          recursionLimit: 100
        });

        let finalContent = "";

        for await (const event of eventStream) {
          const { event: eventType, name, data } = event;

          if (eventType === "on_chat_model_start") {
            thinkingStepCounter++;
            currentThinkingId = `thinking - ${thinkingStepCounter}`;
            thinkingContent = "";
            send("step_start", { id: currentThinkingId, title: `Reasoning(step ${thinkingStepCounter})` });
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
                send("step_update", { id: currentThinkingId, content: displayContent });
              }
            }
          }
          else if (eventType === "on_chat_model_end") {
            if (currentThinkingId) {
              send("step_complete", { id: currentThinkingId, result: thinkingContent.slice(0, 100) + (thinkingContent.length > 100 ? "..." : "") });
            }
          }
          else if (eventType === "on_tool_start") {
            stepCounter++;
            const toolName = name || "Tool";
            const toolArgs = data?.input || {};
            const stepId = `tool - ${stepCounter}`;

            let title = toolName;
            if (toolName === "create_plan") title = "📋 Creating execution plan";
            else if (toolName === "run_code") title = "Executing code";
            else if (toolName === "read_file") title = `Reading ${toolArgs.path || "file"}`;
            else if (toolName === "list_files") title = `Listing ${toolArgs.path || "files"}`;
            else if (toolName === "write_file") title = `Writing ${toolArgs.path || "file"}`;
            else if (toolName === "expose_preview") title = "Creating live preview";
            else if (toolName === "create_web_app") title = `Scaffolding ${toolArgs.type} app`;

            send("step_start", { id: stepId, title, tool: toolName, args: toolArgs });
          }
          else if (eventType === "on_tool_end") {
            const stepId = `tool - ${stepCounter}`;
            const output = data?.output;
            const toolName = name || "";

            if (toolName === "ask_user" && typeof output === "string") {
              const parsed = parseAskUserResponse(output);
              if (parsed) {
                send("ask_user", {
                  question: parsed.question,
                  options: parsed.options,
                  context: parsed.context,
                  threadId: chatId,
                });
                send("step_complete", { id: stepId, result: `❓ Asking: ${parsed.question}` });
                continue;
              }
            }

            // Show full plan output for create_plan tool
            if (toolName === "create_plan") {
              send("step_complete", { id: stepId, result: typeof output === "string" ? output : "Plan created" });
            } else {
              send("step_complete", { id: stepId, result: typeof output === "string" ? output.slice(0, 200) : "Done" });
            }
          }
          else if (eventType === "on_chain_end" && name === "LangGraph") {
            const messages = data?.output?.messages;
            if (messages && messages.length > 0) {
              const lastMsg = messages[messages.length - 1];
              if (typeof lastMsg.content === "string") {
                finalContent = lastMsg.content;
              } else if (Array.isArray(lastMsg.content)) {
                finalContent = lastMsg.content.map((c: any) => "text" in c ? c.text : "").join("\n");
              }
            }
          }
        }

        send("done", { content: finalContent, previewUrl });

        // Save messages to database if chatId provided
        if (chatId) {
          try {
            // Save assistant message
            await db.insert(messages).values({
              chatId,
              role: "assistant",
              content: finalContent,
              previewUrl: previewUrl || undefined,
            });

            // Update chat's sandboxId if we have one
            if (sandboxId) {
              await db.update(chats).set({ sandboxId }).where(eq(chats.id, chatId));
            }
          } catch (dbError) {
            console.error("Error saving to database:", dbError);
          }
        }

      } catch (error) {
        console.error("LangGraph Agent Error:", error);
        send("error", { message: error instanceof Error ? error.message : String(error) });
      } finally {
        // NOTE: Do NOT close the sandbox here - it should persist between requests
        // The sandbox will auto-expire based on its lifetime setting (15m)
        // Users can reconnect to it via the sandboxId passed back to the client
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
