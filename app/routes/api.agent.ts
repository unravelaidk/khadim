import { type ActionFunctionArgs } from "react-router";
import { ChatOpenAI } from "@langchain/openai";
import { Sandbox } from "@deno/sandbox";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateGraph, MessagesAnnotation, END, START } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { db, messages, chats } from "../lib/db";
import { eq } from "drizzle-orm";
import { loadSkills } from "../agent/skills";
import {
  createRunCodeTool,
  createReadFileTool,
  createListFilesTool,
  createWriteFileTool,
  createShellTool,
  createExposePreviewTool,
  createWebAppTool
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
  const prompt = formData.get("prompt")?.toString();
  const existingSandboxId = formData.get("sandboxId")?.toString();
  const chatId = formData.get("chatId")?.toString();

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
        if (existingSandboxId) {
          send("step_start", { id: "sandbox", title: "Reconnecting to sandbox..." });
          try {
            sandbox = await Sandbox.connect({ id: existingSandboxId });
            sandboxId = existingSandboxId;
            send("step_complete", { id: "sandbox", result: "Reconnected to existing session" });
          } catch (reconnectErr) {

            send("step_update", { id: "sandbox", content: "Session expired, creating new sandbox..." });
            sandbox = await Sandbox.create({ lifetime: "5m" });
            sandboxId = sandbox.id;
            send("step_complete", { id: "sandbox", result: "Created new session" });
          }
        } else {
          // Create new sandbox
          send("step_start", { id: "sandbox", title: "Initializing sandbox environment" });
          sandbox = await Sandbox.create({ lifetime: "5m" });
          sandboxId = sandbox.id;
          send("step_complete", { id: "sandbox" });
        }

        send("sandbox_info", { sandboxId });

      } catch (err) {
        send("error", { message: "Failed to create sandbox environment" });
        controller.close();
        return;
      }

      try {
        // Initialize Tools with Sandbox
        const tools = [
          createRunCodeTool(sandbox),
          createReadFileTool(sandbox),
          createListFilesTool(sandbox),
          createWriteFileTool(sandbox, chatId),
          createShellTool(sandbox),
          createExposePreviewTool(sandbox, (url) => { previewUrl = url; }),
          createWebAppTool(sandbox)
        ];

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
            
AVAILABLE TOOLS:
- create_web_app: Scaffold a new React Router or Vite React app
- write_file: Write HTML/CSS/JS files directly (for simple pages)
- read_file: Read file contents
- list_files: List directory contents
- run_code: Execute TypeScript/JavaScript code
- shell: Run shell commands
- expose_preview: Create a public URL for viewing creations

WORKFLOW (Simple HTML/JS):
1. Use 'write_file' to create HTML/CSS/JS files.
2. Use 'expose_preview' with port 8000 to get a public URL.

WORKFLOW (Full App - Vite/React Router):
1. Use 'create_web_app' to scaffold the project. (Supports templates: minimal, javascript, node-custom-server)
2. Run 'shell' command: "cd <project_name> && npm install".
3. Run 'shell' command: "cd <project_name> && npm run build".
4. Use 'expose_preview' with port 8000, startServer=true, and root="<project_name>/dist".
   - CRITICAL: Vite puts the build in '<project_name>/dist'.
   - React Router puts the build in '<project_name>/dist/client' (usually).
   - Check where the 'index.html' is before calling expose_preview.

IMPORTANT: 
- Always run 'npm install' and 'npm run build' after scaffolding.
- SERVE THE BUILD OUTPUT via 'expose_preview' with the correct 'root' path.
- Do NOT try to run 'npm run dev' unless you can run it in background. Build & Serve is usually faster for simple previews.

IMPORTANT: Always use 'expose_preview' after creating HTML files so users can view their creation live.

Your final response should include:
- Brief summary of what was created
- The preview URL
- Key features/instructions

USER SKILLS:
You have access to the following user-defined skills (workflows). If a user request matches a skill, follow the instructions in that skill.
${skillsContent}
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
          recursionLimit: 50
        });

        let finalContent = "";

        for await (const event of eventStream) {
          const { event: eventType, name, data } = event;

          if (eventType === "on_chat_model_start") {
            thinkingStepCounter++;
            currentThinkingId = `thinking-${thinkingStepCounter}`;
            thinkingContent = "";
            send("step_start", { id: currentThinkingId, title: `Reasoning (step ${thinkingStepCounter})` });
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
            const stepId = `tool-${stepCounter}`;

            let title = toolName;
            if (toolName === "run_code") title = "Executing code";
            else if (toolName === "read_file") title = `Reading ${toolArgs.path || "file"}`;
            else if (toolName === "list_files") title = `Listing ${toolArgs.path || "files"}`;
            else if (toolName === "write_file") title = `Writing ${toolArgs.path || "file"}`;
            else if (toolName === "expose_preview") title = "Creating live preview";
            else if (toolName === "create_web_app") title = `Scaffolding ${toolArgs.type} app`;

            send("step_start", { id: stepId, title, tool: toolName, args: toolArgs });
          }
          else if (eventType === "on_tool_end") {
            const stepId = `tool-${stepCounter}`;
            const output = data?.output;
            send("step_complete", { id: stepId, result: typeof output === "string" ? output.slice(0, 200) : "Done" });
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
        try {
          if (sandbox) {
            await sandbox.close();
          }
        } catch (e) { console.error("Error closing sandbox", e); }
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
