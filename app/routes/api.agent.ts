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
  let hasSkillBadge = false;
  if (badgesJson && prompt) {
    try {
        const badges = JSON.parse(badgesJson);
        if (Array.isArray(badges) && badges.length > 0) {
            const badgeLabels = badges.map((b: any) => b.label).join(", ");
            prompt = `[User Context/Selected Features: ${badgeLabels}]\n${prompt}`;
            
            //Check for skill badges to force build mode
            const skillKeywords = ["slides", "game", "app", "website", "spreadsheet", "visualization"];
            hasSkillBadge = badges.some((b: any) => 
                skillKeywords.some(kw => b.label.toLowerCase().includes(kw))
            );
        }
    } catch (e) {
        console.error("Failed to parse badges", e);
    }
  }

  // Agent mode: "plan", "build", or auto-select based on request
  const requestedMode = formData.get("agentMode")?.toString() as AgentMode | undefined;
  let agentMode: AgentMode = requestedMode || selectAgent(prompt || "");

  // Force build/plan mode if a skill badge is selected (override 'chat' default)
  if (agentMode === "chat" && hasSkillBadge) {
     agentMode = selectAgent(prompt || ""); // Re-run select agent with the new prompt enriched with badges
     if (agentMode === "chat") {
         agentMode = "build"; // Fallback to build if it still thinks it's chat but we have a skill badge
     }
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
        const needsSandbox = agentMode !== "chat" || !!existingSandboxId;

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
- expose_preview: Create a public URL for viewing creations

FRAMEWORK SELECTION GUIDE:
- **Games/Interactive apps**: Use type="vite" (outputs to dist/)
- **Full web apps with routing**: Use type="react-router" (outputs to build/client/)
- **Simple static sites/landing pages**: Use type="astro" (outputs to dist/)

DEFAULT WORKFLOW (Simple HTML/JS) - Use only if no skill matches:
1. Use 'write_file' to create HTML/CSS/JS files.
2. Use 'expose_preview' with port 8000 to get a public URL.

DEFAULT WORKFLOW (Full App - Vite/React Router/Astro) - Use only if no skill matches:
1. Use 'create_web_app' to scaffold the project with the correct type.
2. Run 'shell' command: "cd <project_name> && npm install".
3. Run 'shell' command: "cd <project_name> && npm run build".
4. Use 'expose_preview' with port 8000, startServer=true, and root="<project_name>/dist".
   - CRITICAL: Vite and Astro put the build in '<project_name>/dist'.
   - React Router puts the build in '<project_name>/build/client' (for SPA mode).
   - Check where the 'index.html' is before calling expose_preview.

IMPORTANT: 
- Use npm for installing and building (npm install, npm run build).
- SERVE THE BUILD OUTPUT via 'expose_preview' with the correct 'root' path.
- Do NOT try to run 'npm run dev' unless you can run it in background. Build & Serve is usually faster for simple previews.
- **STYLING**: Prefer using **Tailwind CSS** for styling to create modern, responsive designs.
- Always use 'expose_preview' after creating HTML files so users can view their creation live.

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
