import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as pathMod from "node:path";
import { Sandbox } from "@deno/sandbox";
import { db, artifacts, projects } from "../lib/db";
import { eq, and } from "drizzle-orm";
import { createVersionSnapshot } from "../lib/versions";

// In-memory todo storage per chat session
const todoStorage = new Map<string, Array<{ task: string; status: "pending" | "in_progress" | "done" }>>();

// Helper function to read a stream to string (eliminates code duplication)
async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!stream) return "";
    let result = "";
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
    }
    return result;
}

// Helper function to get status icon for todo items
function getStatusIcon(status: "pending" | "in_progress" | "done"): string {
    if (status === "done") return "✅";
    if (status === "in_progress") return "🔄";
    return "⬜";
}

// Track last snapshot time per chat to debounce snapshots (avoid creating too many)
const lastSnapshotTime = new Map<string, number>();
const SNAPSHOT_DEBOUNCE_MS = 30000; // 30 seconds between auto-snapshots

// Planning tool - no sandbox needed, just returns the plan for visibility
export const createPlanTool = () => tool(
    async ({ goal, steps, estimatedToolCalls }: { goal: string; steps: string[]; estimatedToolCalls: number }) => {
        const planOutput = `
📋 EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Goal: ${goal}

📝 Steps:
${steps.map((step, i) => `   ${i + 1}. ${step}`).join('\n')}

⏱️ Estimated tool calls: ${estimatedToolCalls}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        return planOutput;
    },
    {
        name: "create_plan",
        description: "Create an execution plan before doing complex work. Use when the task benefits from explicit steps and approval.",
        schema: z.object({
            goal: z.string().describe("Brief description of what you're building"),
            steps: z.array(z.string()).describe("List of steps you'll take to complete the task"),
            estimatedToolCalls: z.number().describe("Estimated number of tool calls to complete the task (target: under 10)"),
        }),
    }
);

// Todo tracking tools - help agent track progress on multi-step tasks
export const createUpdateTodoTool = (chatId: string) => tool(
    async ({ tasks }: { tasks: Array<{ task: string; status: "pending" | "in_progress" | "done" }> }) => {
        todoStorage.set(chatId, tasks);

        const pending = tasks.filter(t => t.status === "pending").length;
        const inProgress = tasks.filter(t => t.status === "in_progress").length;
        const done = tasks.filter(t => t.status === "done").length;

        let output = `📋 TODO LIST UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        tasks.forEach((t, i) => {
            output += `${getStatusIcon(t.status)} ${i + 1}. ${t.task}\n`;
        });
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: ${done}/${tasks.length} done | ${inProgress} in progress | ${pending} pending`;

        return output;
    },
    {
        name: "update_todo",
        description: "Update the todo list to track your progress. Use this after completing steps to stay on track.",
        schema: z.object({
            tasks: z.array(z.object({
                task: z.string().describe("Brief description of the task"),
                status: z.enum(["pending", "in_progress", "done"]).describe("Current status"),
            })).describe("Full list of tasks with their current status"),
        }),
    }
);

export const createReadTodoTool = (chatId: string) => tool(
    async () => {
        const tasks = todoStorage.get(chatId) || [];

        if (tasks.length === 0) {
            return "📋 No todo list exists yet. Use update_todo to create one.";
        }

        let output = `📋 CURRENT TODO LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        tasks.forEach((t, i) => {
            output += `${getStatusIcon(t.status)} ${i + 1}. ${t.task}\n`;
        });

        const pending = tasks.filter(t => t.status === "pending").length;
        const inProgress = tasks.filter(t => t.status === "in_progress").length;
        const done = tasks.filter(t => t.status === "done").length;

        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: ${done}/${tasks.length} done | ${inProgress} in progress | ${pending} pending`;

        return output;
    },
    {
        name: "read_todo",
        description: "Read the current todo list to see your progress and what steps remain.",
        schema: z.object({}),
    }
);

export const createRunCodeTool = (sandbox: Sandbox) => tool(
    async ({ code }: { code: string }) => {
        try {
            const scriptPath = "script.ts";
            await sandbox.writeTextFile(scriptPath, code);

            const child = await sandbox.spawn("deno", {
                args: ["run", "-A", scriptPath],
                stdout: "piped",
                stderr: "piped",
            });

            const [stdout, stderr] = await Promise.all([
                readStream(child.stdout),
                readStream(child.stderr)
            ]);

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

export const createReadFileTool = (sandbox: Sandbox) => tool(
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

export const createListFilesTool = (sandbox: Sandbox) => tool(
    async ({ path }: { path: string }) => {
        try {
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

export const createWriteFileTool = (sandbox: Sandbox, chatId?: string) => tool(
    async ({ path, content }: { path: string; content: string }) => {
        try {

            const dir = pathMod.dirname(path);
            if (dir !== "." && dir !== "/") {
                await sandbox.spawn("mkdir", { args: ["-p", dir] });
            }
            await sandbox.writeTextFile(path, content);

            if (chatId) {
                await db.delete(artifacts)
                    .where(and(
                        eq(artifacts.chatId, chatId),
                        eq(artifacts.filename, path)
                    ));

                await db.insert(artifacts).values({
                    chatId,
                    filename: path,
                    content,
                });

                // Auto-snapshot with debouncing
                const now = Date.now();
                const lastSnapshot = lastSnapshotTime.get(chatId) || 0;
                if (now - lastSnapshot > SNAPSHOT_DEBOUNCE_MS) {
                    lastSnapshotTime.set(chatId, now);
                    // Fire and forget - don't block on snapshot creation
                    createVersionSnapshot(chatId, `Auto-save: ${path}`).catch(err => {
                        console.warn("Failed to create auto-snapshot:", err);
                    });
                }
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

export const createShellTool = (sandbox: Sandbox) => tool(
    async ({ command }: { command: string }) => {
        // Block server commands that would hang forever
        const serverPatterns = [
            /python3?\s+-m\s+http\.server/i,
            /npm\s+run\s+(dev|start|preview|serve)/i,
            /npx\s+(serve|vite|http-server)/i,
            /deno\s+.*serve/i,
            /node\s+.*server/i,
        ];

        const isServerCommand = serverPatterns.some(pattern => pattern.test(command));
        if (isServerCommand) {
            return `⛔ BLOCKED: The shell tool cannot run servers (they hang forever).

You tried: ${command}

✅ SOLUTION: Call the 'expose_preview' TOOL instead (not a shell command!):

Tool call: expose_preview
Arguments: { "port": 8000, "startServer": true, "root": "<your-project>/dist" }

This tool starts a Deno file server in the background and returns a public URL.`;
        }

        try {
            const child = await sandbox.spawn("sh", {
                args: ["-c", command],
                stdout: "piped",
                stderr: "piped",
            });

            const [stdout, stderr] = await Promise.all([
                readStream(child.stdout),
                readStream(child.stderr)
            ]);

            const status = await child.status;

            // Return full output with clear formatting for error analysis
            if (status.code !== 0) {
                // Command failed - return detailed error info
                return `❌ COMMAND FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Command: ${command}
Exit Code: ${status.code}

STDOUT:
${stdout || "(empty)"}

STDERR:
${stderr || "(empty)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ANALYZE THE ERROR ABOVE and fix the specific issue. Do NOT retry with the same command.`;
            }

            // Command succeeded
            return `✅ Exit: ${status.code}\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`;
        } catch (error) {
            return `❌ Shell Error: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "shell",
        description: "Run a shell command. DO NOT use for long-running processes (like servers) as it will block. Use expose_preview for servers. If a command fails, read the FULL error output.",
        schema: z.object({
            command: z.string().describe("The shell command to run"),
        }),
    }
);

export const createExposePreviewTool = (sandbox: Sandbox, setPreviewUrl: (url: string) => void) => tool(
    async ({ port, startServer, root }: { port: number; startServer: boolean; root: string }) => {
        try {
            if (startServer) {
                const serverCode = `
          import { serveDir } from "jsr:@std/http/file-server";
          Deno.serve({ port: ${port} }, (req) => serveDir(req, { fsRoot: "${root}" }));
        `;
                await sandbox.writeTextFile("_server.ts", serverCode);

                sandbox.spawn("deno", {
                    args: ["run", "-A", "_server.ts"],
                    stdout: "null",
                    stderr: "null",
                });

                await new Promise(r => setTimeout(r, 1000));
            }

            const url = await sandbox.exposeHttp({ port });
            setPreviewUrl(url);

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
            startServer: z.boolean().default(true).describe("Whether to start a static file server."),
            root: z.string().default(".").describe("The directory to serve files from (e.g., '.' or 'dist')"),
        }),
    }
);

export const createWebAppTool = (sandbox: Sandbox, chatId?: string) => tool(
    async ({ type, name, template }: { type: "vite" | "react-router" | "astro"; name: string, template?: string }) => {
        // Validate type parameter - this is REQUIRED
        if (!type || !["vite", "react-router", "astro"].includes(type)) {
            return `❌ ERROR: 'type' parameter is REQUIRED and must be one of: "vite", "react-router", or "astro".

You called: create_web_app({ type: ${JSON.stringify(type)}, name: "${name}" })

Correct usage:
✅ create_web_app({ type: "astro", name: "${name}" })
✅ create_web_app({ type: "vite", name: "${name}" })
✅ create_web_app({ type: "react-router", name: "${name}" })`;
        }

        try {
            let cmd = "npm";
            let args: string[] = [];

            if (type === "vite") {
                args = ["create", "vite@latest", name, "--", "--template", "react-ts"];
            } else if (type === "react-router") {
                args = ["create", "react-router@latest", name, "--"];

                if (template) {
                    args.push("--template", template);
                }
                args.push("-y");
            } else if (type === "astro") {
                // Astro: npm create astro@latest <name> -- --template <template> --yes
                args = ["create", "astro@latest", name, "--"];
                args.push("--template", template || "basics"); // 'basics' is more feature-complete than 'minimal'
                args.push("--yes"); // Skip interactive prompts
            }

            const child = await sandbox.spawn(cmd, {
                args,
                stdout: "piped",
                stderr: "piped",
            });

            const [stdout, stderr] = await Promise.all([
                readStream(child.stdout),
                readStream(child.stderr)
            ]);
            const output = stdout + stderr;

            const status = await child.status;

            if (status.code !== 0) {
                return `Failed to create app.\nExit Code: ${status.code}\nOutput:\n${output}`;
            }

            // Sync artifacts if chatId provided
            if (chatId) {
                try {
                    // Find all files in the new directory, excluding node_modules and .git
                    const findCmd = await sandbox.spawn("find", {
                        args: [name, "-type", "f", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"],
                        stdout: "piped"
                    });

                    const fileListOutput = await readStream(findCmd.stdout);
                    await findCmd.status;

                    const files = fileListOutput.split("\n").filter(f => f.trim());

                    for (const file of files) {
                        try {
                            const content = await sandbox.sh`cat ${file}`.text();

                            // Delete existing artifact for this file to avoid duplicates/stale data
                            await db.delete(artifacts)
                                .where(and(
                                    eq(artifacts.chatId, chatId),
                                    eq(artifacts.filename, file)
                                ));

                            await db.insert(artifacts).values({
                                chatId,
                                filename: file,
                                content,
                            });
                        } catch (err) {
                            console.warn(`Failed to sync file ${file} to artifacts:`, err);
                        }
                    }
                } catch (syncErr) {
                    console.error("Failed to sync artifacts after app creation:", syncErr);
                }

                try {
                    const devPort = type === "astro" ? 4321 : 5173;
                    const buildDir = type === "react-router" ? `${name}/build/client` : `${name}/dist`;

                    await db.insert(projects).values({
                        chatId,
                        projectType: type,
                        projectName: name,
                        devCommand: "npm run dev",
                        devPort,
                        buildDir,
                    }).onConflictDoUpdate({
                        target: projects.chatId,
                        set: {
                            projectType: type,
                            projectName: name,
                            devCommand: "npm run dev",
                            devPort,
                            buildDir,
                            updatedAt: new Date(),
                        }
                    });
                    console.log(`Saved project metadata for chat ${chatId}: ${type} app "${name}"`);
                } catch (metaErr) {
                    console.error("Failed to save project metadata:", metaErr);
                }
            }

            // Provide correct output path based on type
            let outputPath = `${name}/dist`;
            if (type === "react-router") {
                outputPath = `${name}/build/client`;
            }

            return `Successfully generated ${type} app (template: ${template || "default"}) in '${name}'.\n\nNext steps for you:\n1. run 'cd ${name}'\n2. run 'npm install'\n3. run 'npm run build'\n4. expose_preview with root='${outputPath}'`;
        } catch (error) {
            return `Error creating app: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "create_web_app",
        description: "Scaffold a new web application. Use 'vite' for React games/interactive apps, 'react-router' for full web apps, or 'astro' for simple static sites.",
        schema: z.object({
            type: z.enum(["vite", "react-router", "astro"]).describe("The type of application: 'vite' for games/interactive, 'react-router' for web apps, 'astro' for simple static sites"),
            name: z.string().describe("The name of the project directory"),
            template: z.string().optional().describe("Template to use. For astro: 'basics', 'blog', 'starlight' (docs), 'starlog', 'portfolio', 'minimal'. For react-router: 'minimal', 'javascript', etc."),
        }),
    }
);

export const createSaveArtifactTool = (sandbox: Sandbox, chatId: string) => tool(
    async ({ path }: { path: string }) => {
        try {
            // Check extension
            const ext = pathMod.extname(path).toLowerCase();
            const binaryExts = ['.pptx', '.png', '.jpg', '.jpeg', '.zip', '.pdf', '.xlsx', '.docx'];
            const isBinary = binaryExts.includes(ext);

            let content = "";
            if (isBinary) {
                // Read as base64
                // We use sh -c to pipe cat to base64
                const child = await sandbox.spawn("sh", {
                    args: ["-c", `cat "${path}" | base64`],
                    stdout: "piped"
                });

                const data = await readStream(child.stdout);
                const status = await child.status;
                if (status.code !== 0) {
                    return `Error reading file: exit code ${status.code}`;
                }

                // Remove newlines/spaces from base64 output
                content = `base64:${data.replace(/\s/g, '')}`;
            } else {
                content = await sandbox.sh`cat ${path}`.text();
            }

            // Save to DB
            await db.delete(artifacts)
                .where(and(
                    eq(artifacts.chatId, chatId),
                    eq(artifacts.filename, path)
                ));

            const [artifact] = await db.insert(artifacts).values({
                chatId,
                filename: path,
                content,
            }).returning();

            return `Saved artifact '${path}' (ID: ${artifact.id}). View/Download at: /api/artifacts/${artifact.id}`;

        } catch (error) {
            return `Error saving artifact: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "save_artifact",
        description: "Save a file from the sandbox to the persistent database. REQUIRED for persistent storage and for non-text files (PPTX, images, PDFs, etc.) to be downloadable.",
        schema: z.object({
            path: z.string().describe("Path to the file in the sandbox")
        })
    }
);

export const createManageSandboxTool = (sandbox: Sandbox) => tool(
    async ({ action }: { action: "keep_alive" | "stop" }) => {
        try {
            if (action === "keep_alive") {
                // @ts-ignore - 'extendLifetime' exists in newer versions or passed through
                if (typeof sandbox.extendLifetime === 'function') {
                    // @ts-ignore
                    await sandbox.extendLifetime("30m");
                    return "✅ Sandbox lifetime extended by 30 minutes.";
                } else {
                    return "⚠️ Warning: This sandbox environment does not support extending lifetime directly.";
                }
            } else if (action === "stop") {
                 // @ts-ignore
                if (typeof sandbox.shutdown === 'function') {
                    // @ts-ignore
                    await sandbox.shutdown();
                    return "🛑 Sandbox shutdown initiated.";
                } else {
                     // Fallback: set short lifetime if specific shutdown isn't available
                     // @ts-ignore
                     if (typeof sandbox.setLifetime === 'function') {
                        // @ts-ignore
                        await sandbox.setLifetime(1000); // 1 second
                        return "🛑 Sandbox lifetime set to expire immediately.";
                     }
                     return "⚠️ Warning: Could not explicitly stop sandbox (shutdown/setLifetime not found).";
                }
            }
            return "❌ Invalid action.";
        } catch (error) {
            return `Error managing sandbox: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "manage_sandbox",
        description: "Control the sandbox lifecycle. Use 'keep_alive' for long tasks to prevent timeout. Use 'stop' when the user cancellation is requested or the task is permanently done.",
        schema: z.object({
            action: z.enum(["keep_alive", "stop"]).describe("Action to perform: 'keep_alive' (extends 30m) or 'stop' (shuts down)."),
        }),
    }
);

export const createWebSearchTool = () => tool(
    async ({ query, numResults = 5 }: { query: string; numResults?: number }) => {
        try {
            // Use DuckDuckGo HTML search (more reliable than instant answer API)
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            
            const response = await fetch(searchUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
            });
            
            if (!response.ok) {
                return `Search failed with status: ${response.status}`;
            }
            
            const html = await response.text();
            
            // Parse results from HTML
            const results: Array<{ title: string; snippet: string; url: string }> = [];
            
            // Match result blocks - DuckDuckGo HTML format
            const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
            let match;
            
            while ((match = resultRegex.exec(html)) !== null && results.length < numResults) {
                const url = match[1];
                const title = match[2].trim();
                const snippet = match[3]
                    .replace(/<[^>]+>/g, '') // Remove HTML tags
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#x27;/g, "'")
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (title && snippet) {
                    results.push({ title, snippet, url });
                }
            }
            
            // Fallback: try alternative parsing pattern
            if (results.length === 0) {
                const altRegex = /<div class="result[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
                while ((match = altRegex.exec(html)) !== null && results.length < numResults) {
                    const url = match[1];
                    const snippet = match[2]
                        .replace(/<[^>]+>/g, '')
                        .replace(/&[^;]+;/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    
                    if (snippet.length > 20) {
                        results.push({ 
                            title: snippet.slice(0, 60) + (snippet.length > 60 ? '...' : ''),
                            snippet, 
                            url 
                        });
                    }
                }
            }
            
            if (results.length === 0) {
                return `🔍 No results found for: "${query}"\n\nTry rephrasing your search or using different keywords.`;
            }
            
            let output = `🔍 WEB SEARCH RESULTS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nQuery: "${query}"\n\n`;
            
            results.forEach((r, i) => {
                output += `${i + 1}. ${r.title}\n`;
                output += `   ${r.snippet}\n`;
                output += `   🔗 ${r.url}\n\n`;
            });
            
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `Found ${results.length} results. Use this information to inform your response.`;
            
            return output;
        } catch (error) {
            return `Search error: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "web_search",
        description: "Search the web using DuckDuckGo to find current information. Use this to research topics, find facts for slide content, get up-to-date data, or verify information. Returns titles, snippets, and URLs.",
        schema: z.object({
            query: z.string().describe("The search query - be specific for better results"),
            numResults: z.number().optional().default(5).describe("Number of results to return (default: 5, max: 10)"),
        }),
    }
);

export const createSearchImagesTool = () => tool(
    async ({ query, numResults = 5, orientation }: { query: string; numResults?: number; orientation?: "landscape" | "portrait" | "squarish" }) => {
        try {
            // Use Unsplash API for high-quality free images
            // Note: For production, use an API key. This uses the public demo endpoint.
            const unsplashUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${numResults}${orientation ? `&orientation=${orientation}` : ''}`;
            
            const response = await fetch(unsplashUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            });
            
            if (!response.ok) {
                // Fallback: Try DuckDuckGo image search
                return await searchDuckDuckGoImages(query, numResults);
            }
            
            const data = await response.json();
            const results = data.results || [];
            
            if (results.length === 0) {
                return await searchDuckDuckGoImages(query, numResults);
            }
            
            let output = `🖼️ IMAGE SEARCH RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: "${query}"

`;
            
            results.slice(0, numResults).forEach((img: any, i: number) => {
                const url = img.urls?.regular || img.urls?.small || img.urls?.raw;
                const thumb = img.urls?.thumb || img.urls?.small;
                const description = img.alt_description || img.description || 'Untitled';
                const photographer = img.user?.name || 'Unknown';
                
                output += `${i + 1}. ${description}
   📷 By: ${photographer}
   🔗 URL: ${url}
   📌 Thumbnail: ${thumb}

`;
            });
            
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found ${results.length} images. Use these URLs in your slides with the 'image' slide type.

Example slide JSON:
{
  "type": "image",
  "title": "Your Title",
  "imageUrl": "<paste URL here>",
  "caption": "Photo credit"
}`;
            
            return output;
        } catch (error) {
            // Fallback to DuckDuckGo
            try {
                return await searchDuckDuckGoImages(query, numResults);
            } catch {
                return `Image search error: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
    },
    {
        name: "search_images",
        description: "Search for high-quality images to use in slides or presentations. Returns image URLs that can be used in 'image' type slides. Use descriptive queries like 'mountain landscape sunset' or 'business meeting office'.",
        schema: z.object({
            query: z.string().describe("Search query for images - be descriptive (e.g., 'modern office workspace')"),
            numResults: z.number().optional().default(5).describe("Number of images to return (default: 5)"),
            orientation: z.enum(["landscape", "portrait", "squarish"]).optional().describe("Image orientation filter"),
        }),
    }
);

// Fallback image search using DuckDuckGo
async function searchDuckDuckGoImages(query: string, numResults: number = 5): Promise<string> {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    
    // DuckDuckGo images requires a token, so we'll parse from their vqd endpoint
    const tokenResponse = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const html = await tokenResponse.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
    
    if (!vqdMatch) {
        return `🖼️ IMAGE SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: "${query}"

⚠️ Could not fetch images automatically.

Alternative: Use these free image sources manually:
• https://unsplash.com/s/photos/${encodeURIComponent(query.replace(/\s+/g, '-'))}
• https://www.pexels.com/search/${encodeURIComponent(query.replace(/\s+/g, '%20'))}

Then use the URLs in your slide JSON:
{
  "type": "image",
  "title": "Your Title",
  "imageUrl": "<paste URL here>"
}`;
    }
    
    const vqd = vqdMatch[1];
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`;
    
    const imgResponse = await fetch(imgUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const imgData = await imgResponse.json();
    const results = imgData.results || [];
    
    let output = `🖼️ IMAGE SEARCH RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: "${query}"

`;
    
    results.slice(0, numResults).forEach((img: any, i: number) => {
        output += `${i + 1}. ${img.title || 'Untitled'}
   🔗 URL: ${img.image}
   📌 Thumbnail: ${img.thumbnail}
   📐 Size: ${img.width}x${img.height}

`;
    });
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use these URLs in 'image' type slides.`;
    
    return output;
}

export const createWriteSlidesTool = (
    chatId: string, 
    broadcastFn: (event: { type: string; data: any }) => Promise<void>
) => tool(
    async ({ content, title, theme }: { content: string; title?: string; theme?: string }) => {
        try {
            // Validate that content contains slide-data script tag
            if (!content.includes('<script id="slide-data"') && !content.includes("<script id='slide-data'")) {
                return `❌ ERROR: Slide content must include a <script id="slide-data" type="application/json"> tag with slide data.

Example:
<script id="slide-data" type="application/json">
[
  {"id": 1, "type": "title", "title": "My Presentation", "subtitle": "A great topic"},
  {"id": 2, "type": "content", "title": "Overview", "bullets": ["Point 1", "Point 2"]}
]
</script>`;
            }

            const filename = "index.html";
            
            // Delete existing slide artifact for this chat
            await db.delete(artifacts)
                .where(and(
                    eq(artifacts.chatId, chatId),
                    eq(artifacts.filename, filename)
                ));

            // Insert new slide artifact
            await db.insert(artifacts).values({
                chatId,
                filename,
                content,
            });

            // Broadcast slide content for live preview
            await broadcastFn({
                type: "slide_content",
                data: { fileContent: content, theme: theme || "brass" }
            });

            // Also broadcast as a file write for consistency
            await broadcastFn({
                type: "file_written",
                data: { 
                    filename,
                    content,
                    isSlide: true
                }
            });

            const themeInfo = theme ? ` with "${theme}" theme` : "";
            return `✅ Successfully saved ${title ? `"${title}"` : "presentation"}${themeInfo} (${content.length} bytes).
The slides are now visible in the preview panel.`;
        } catch (error) {
            return `Error saving slides: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "write_slides",
        description: `Write slide presentation HTML (NO SANDBOX NEEDED). THEMES: minimalist, paper, noir, brass, cobalt, emerald, midnight. Ask user their preferred theme first.`,
        schema: z.object({
            content: z.string().describe("The complete HTML content with embedded slide-data JSON"),
            title: z.string().optional().describe("Optional title for the presentation"),
            theme: z.string().optional().describe("Theme: minimalist, paper, noir, brass, cobalt, emerald, midnight"),
        }),
    }
);
