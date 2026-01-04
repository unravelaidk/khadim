import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as pathMod from "node:path";
import { Sandbox } from "@deno/sandbox";
import { db, artifacts } from "../lib/db";
import { eq, and } from "drizzle-orm";

// In-memory todo storage per chat session
const todoStorage = new Map<string, Array<{ task: string; status: "pending" | "in_progress" | "done" }>>();

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
        description: "REQUIRED FIRST STEP: Create an execution plan before doing any work. This shows the user what you're about to do.",
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
            const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "🔄" : "⬜";
            output += `${icon} ${i + 1}. ${t.task}\n`;
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
            const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "🔄" : "⬜";
            output += `${icon} ${i + 1}. ${t.task}\n`;
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

            let output = "";
            if (child.stdout) {
                const reader = child.stdout.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    output += new TextDecoder().decode(value);
                }
            }
            if (child.stderr) {
                const reader = child.stderr.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    output += new TextDecoder().decode(value);
                }
            }

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

                    let fileListOutput = "";
                    if (findCmd.stdout) {
                        const reader = findCmd.stdout.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            fileListOutput += new TextDecoder().decode(value);
                        }
                    }
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
                    // Don't fail the tool call if sync fails, but log it
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

                let data = "";
                if (child.stdout) {
                    const reader = child.stdout.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        data += new TextDecoder().decode(value);
                    }
                }
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


