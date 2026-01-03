import { type ActionFunctionArgs } from "react-router";
import { ChatOpenAI } from "@langchain/openai";
import { Sandbox } from "@deno/sandbox";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, MessagesAnnotation, END, START } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { db, messages, chats, artifacts } from "../lib/db";
import { eq, and } from "drizzle-orm";

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
          // Try to reconnect to existing sandbox
          send("step_start", { id: "sandbox", title: "Reconnecting to sandbox..." });
          try {
            sandbox = await Sandbox.connect({ id: existingSandboxId });
            sandboxId = existingSandboxId;
            send("step_complete", { id: "sandbox", result: "Reconnected to existing session" });
          } catch (reconnectErr) {
            // If reconnect fails, create a new one
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
        
        // Send sandbox ID to frontend for future reconnection
        send("sandbox_info", { sandboxId });
        
      } catch (err) {
        send("error", { message: "Failed to create sandbox environment" });
        controller.close();
        return;
      }

      const s = sandbox as any;

      try {
        // TOOL: Run Code (Deno) - Using correct @deno/sandbox API
        const runCodeTool = tool(
          async ({ code }: { code: string }) => {
            try {
              const scriptPath = "script.ts";
              
              // Use sandbox.writeTextFile() - correct API
              await sandbox.writeTextFile(scriptPath, code);
              
              // Use sandbox.spawn() - correct API
              const child = await sandbox.spawn("deno", {
                args: ["run", "-A", scriptPath],
                stdout: "piped",
                stderr: "piped",
              });
              
              // Read stdout and stderr using getReader()
              let stdout = "";
              let stderr = "";
              
              if (child.stdout) {
                const reader = child.stdout.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  stdout += new TextDecoder().decode(value);
                }
              }
              if (child.stderr) {
                const reader = child.stderr.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  stderr += new TextDecoder().decode(value);
                }
              }
              
              const status = await child.status;
              
              return `Exit Code: ${status.code}\nStdout:\n${stdout}\nStderr:\n${stderr}`;
            } catch (error) {
              return `Execution Error: ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "run_code",
            description: "Run TypeScript/JavaScript code in the sandbox. You can write files (like HTML/CSS) using Deno.writeTextFile inside your script.",
            schema: z.object({
              code: z.string().describe("The TypeScript code to execute."),
            }),
          }
        );

        const readFileTool = tool(
          async ({ path }: { path: string }) => {
            try {
              const result = await sandbox.sh`cat ${path}`.text();
              return result;
            } catch (error) {
              return `Error reading file '${path}': ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "read_file",
            description: "Read the content of a file from the sandbox. Use this to retrieve built artifacts (like index.html) to show to the user.",
            schema: z.object({
              path: z.string().describe("Path to the file (e.g., index.html)"),
            }),
          }
        );

        // TOOL: List Files - Using correct @deno/sandbox API
        const listFilesTool = tool(
          async ({ path }: { path: string }) => {
            try {
              // Use sandbox.sh template literal for ls
              const result = await sandbox.sh`ls -la ${path}`.text();
              return result;
            } catch (error) {
              return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "list_files",
            description: "List files in a directory.",
            schema: z.object({ path: z.string().default(".").describe("Directory path to list") })
          }
        );

        // TOOL: Write File - Direct file writing
        const writeFileTool = tool(
          async ({ path, content }: { path: string; content: string }) => {
            try {
              // 1. Write to sandbox
              await sandbox.writeTextFile(path, content);

              // 2. Save to database if we have a chatId
              if (chatId) {
                // Delete existing artifact with same path for this chat (simple overwrite)
                await db.delete(artifacts)
                  .where(and(
                    eq(artifacts.chatId, chatId), 
                    eq(artifacts.filename, path)
                  ));
                
                // Insert new version
                await db.insert(artifacts).values({
                  chatId,
                  filename: path,
                  content,
                });
              }

              return `Successfully wrote ${content.length} bytes to ${path}`;
            } catch (error) {
              return `Error writing file '${path}': ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "write_file",
            description: "Write content directly to a file in the sandbox. Use this for HTML, CSS, JS files.",
            schema: z.object({
              path: z.string().describe("Path to the file (e.g., index.html)"),
              content: z.string().describe("Content to write to the file"),
            }),
          }
        );

        // TOOL: Shell Command - Run any shell command
        const shellTool = tool(
          async ({ command }: { command: string }) => {
            try {
              const child = await sandbox.spawn("sh", {
                args: ["-c", command],
                stdout: "piped",
                stderr: "piped",
              });
              
              let stdout = "";
              let stderr = "";
              
              if (child.stdout) {
                const reader = child.stdout.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  stdout += new TextDecoder().decode(value);
                }
              }
              if (child.stderr) {
                const reader = child.stderr.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  stderr += new TextDecoder().decode(value);
                }
              }
              
              const status = await child.status;
              return `Exit: ${status.code}\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`;
            } catch (error) {
              return `Shell Error: ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "shell",
            description: "Run a shell command in the sandbox.",
            schema: z.object({
              command: z.string().describe("The shell command to run"),
            }),
          }
        );

        // TOOL: Expose Preview - Create public URL for files
        const exposePreviewTool = tool(
          async ({ port, startServer }: { port: number; startServer: boolean }) => {
            try {
              if (startServer) {
                // Start a simple static file server
                const serverCode = `
                  import { serveDir } from "jsr:@std/http/file-server";
                  Deno.serve({ port: ${port} }, (req) => serveDir(req, { fsRoot: "." }));
                `;
                await sandbox.writeTextFile("_server.ts", serverCode);
                
                // Start the server in background
                sandbox.spawn("deno", {
                  args: ["run", "-A", "_server.ts"],
                  stdout: "null",
                  stderr: "null",
                });
                
                // Wait briefly for server to start
                await new Promise(r => setTimeout(r, 1000));
              }
              
              // Expose the port publicly
              const url = await sandbox.exposeHttp({ port });
              previewUrl = url;
              
              return `Preview URL: ${url}`;
            } catch (error) {
              return `Expose Error: ${error instanceof Error ? error.message : String(error)}`;
            }
          },
          {
            name: "expose_preview",
            description: "Start a web server and expose files publicly. Returns a URL where users can view the creation. Call this after writing HTML/CSS/JS files.",
            schema: z.object({
              port: z.number().default(8000).describe("Port to serve files on (default 8000)"),
              startServer: z.boolean().default(true).describe("Whether to start a static file server. Set to false if you are running your own server (e.g. 'npm run dev')."),
            }),
          }
        );

        const tools = [runCodeTool, readFileTool, listFilesTool, writeFileTool, shellTool, exposePreviewTool];
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
- write_file: Write HTML/CSS/JS files directly
- read_file: Read file contents
- list_files: List directory contents
- run_code: Execute TypeScript/JavaScript code
- shell: Run shell commands
- expose_preview: Create a public URL for viewing creations

WORKFLOW:
1. Use 'write_file' to create HTML/CSS/JS files (e.g., index.html)
2. Use 'expose_preview' with port 8000 to get a public URL
3. Include the preview URL in your final response

IMPORTANT: Always use 'expose_preview' after creating HTML files so users can view their creation live.

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
        } catch(e) { console.error("Error closing sandbox", e); }
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
