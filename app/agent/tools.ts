import type { AgentTool } from "@mariozechner/pi-agent-core";
import { StringEnum, Type, type Static } from "@mariozechner/pi-ai";
import * as fs from "node:fs/promises";
import * as pathMod from "node:path";
import { LiteParse } from "@llamaindex/liteparse";
import { db, artifacts, projects } from "../lib/db";
import { eq, and } from "drizzle-orm";
import { createVersionSnapshot } from "../lib/versions";
import { syncWorkspaceFileForChat } from "../lib/workspace-sync";
import { readUploadedDocumentForAgent } from "../lib/uploaded-documents";
import { textToolResult } from "./tool-utils";

// Type for our sandbox instance (compatible with RemoteSandbox from @khadim/codeexecution-client)
export type SandboxInstance = {
  id: string;
  containerId?: string;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  exec: (script: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  spawn?: (command: string[], options?: { cwd?: string; env?: Record<string, string> }) => Promise<{ pid: number }>;
  exposeHttp?: (options: { port: number }) => Promise<string>;
  kill?: () => Promise<void>;
};

// In-memory todo storage per chat session
const todoStorage = new Map<string, Array<{ task: string; status: "pending" | "in_progress" | "done" }>>();

// Helper function to get status icon for todo items
function getStatusIcon(status: "pending" | "in_progress" | "done"): string {
    if (status === "done") return "✅";
    if (status === "in_progress") return "🔄";
    return "⬜";
}

// Track last snapshot time per chat to debounce snapshots (avoid creating too many)
const lastSnapshotTime = new Map<string, number>();
const SNAPSHOT_DEBOUNCE_MS = 30000; // 30 seconds between auto-snapshots

const todoStatusSchema = StringEnum(["pending", "in_progress", "done"] as const, {
    description: "Current status",
});

const appTypeSchema = StringEnum(["vite", "react-router", "astro"] as const, {
    description: "The type of application: 'vite' for games/interactive, 'react-router' for web apps, 'astro' for simple static sites",
});

const sandboxActionSchema = StringEnum(["keep_alive", "stop"] as const, {
    description: "Action to perform: 'keep_alive' (confirms active) or 'stop' (shuts down).",
});

const imageOrientationSchema = StringEnum(["landscape", "portrait", "squarish"] as const, {
    description: "Image orientation filter - use 'landscape' for slide backgrounds",
});

// Planning tool - no sandbox needed, just returns the plan for visibility
const createPlanParameters = Type.Object({
    goal: Type.String({ description: "Brief description of what you're building" }),
    steps: Type.Array(Type.String(), { description: "JSON array of step strings, e.g. [\"Step 1\", \"Step 2\"]" }),
    estimatedToolCalls: Type.Number({ description: "Estimated number of tool calls to complete the task (target: under 10)" }),
});

export const createPlanTool = (): AgentTool<typeof createPlanParameters> => ({
    name: "create_plan",
    label: "create_plan",
    description: "Create an execution plan before doing complex work. Use when the task benefits from explicit steps and approval.",
    parameters: createPlanParameters,
    execute: async (_toolCallId, { goal, steps, estimatedToolCalls }: Static<typeof createPlanParameters>) => {
        const planOutput = `
📋 EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Goal: ${goal}

📝 Steps:
${steps.map((step: string, i: number) => `   ${i + 1}. ${step}`).join('\n')}

⏱️ Estimated tool calls: ${estimatedToolCalls}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        return textToolResult(planOutput);
    },
});

// Todo tracking tools - help agent track progress on multi-step tasks
const updateTodoParameters = Type.Object({
    tasks: Type.Array(Type.Object({
        task: Type.String({ description: "Brief description of the task" }),
        status: todoStatusSchema,
    }), { description: "Full list of tasks with their current status" }),
});

export const createUpdateTodoTool = (chatId: string): AgentTool<typeof updateTodoParameters> => ({
    name: "update_todo",
    label: "update_todo",
    description: "Update the todo list to track your progress. Use this after completing steps to stay on track.",
    parameters: updateTodoParameters,
    execute: async (_toolCallId, { tasks }: Static<typeof updateTodoParameters>) => {
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

        return textToolResult(output);
    },
});

const readTodoParameters = Type.Object({});

export const createReadTodoTool = (chatId: string): AgentTool<typeof readTodoParameters> => ({
    name: "read_todo",
    label: "read_todo",
    description: "Read the current todo list to see your progress and what steps remain.",
    parameters: readTodoParameters,
    execute: async () => {
        const tasks = todoStorage.get(chatId) || [];

        if (tasks.length === 0) {
            return textToolResult("📋 No todo list exists yet. Use update_todo to create one.");
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

        return textToolResult(output);
    },
});

const runCodeParameters = Type.Object({
    code: Type.String({ description: "The TypeScript code to execute." }),
});

export const createRunCodeTool = (sandbox: SandboxInstance): AgentTool<typeof runCodeParameters> => ({
    name: "run_code",
    label: "run_code",
    description: "Run TypeScript/JavaScript code in the sandbox. You can write files (like HTML/CSS) using Bun.write inside your script.",
    parameters: runCodeParameters,
    execute: async (_toolCallId, { code }: Static<typeof runCodeParameters>) => {
        try {
            // Write the script file
            const scriptPath = "script.ts";
            await sandbox.writeFile(scriptPath, code);

            // Execute using bun (the sandbox runs Bun)
            const result = await sandbox.exec(`bun run ${scriptPath}`);

            return textToolResult(`Exit Code: ${result.exitCode}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`);
        } catch (error) {
            return textToolResult(`Execution Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const readFileParameters = Type.Object({
    path: Type.String({ description: "Path to the file (e.g., index.html)" }),
});

export const createReadFileTool = (sandbox: SandboxInstance): AgentTool<typeof readFileParameters> => ({
    name: "read_file",
    label: "read_file",
    description: "Read the content of a file from the sandbox. Use this to retrieve built artifacts (like index.html) to show to the user.",
    parameters: readFileParameters,
    execute: async (_toolCallId, { path }: Static<typeof readFileParameters>) => {
        try {
            const content = await sandbox.readFile(path);
            return textToolResult(content);
        } catch (error) {
            return textToolResult(`Error reading file '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const listFilesParameters = Type.Object({
    path: Type.String({ default: ".", description: "Directory path to list" }),
});

export const createListFilesTool = (sandbox: SandboxInstance): AgentTool<typeof listFilesParameters> => ({
    name: "list_files",
    label: "list_files",
    description: "List files in a directory.",
    parameters: listFilesParameters,
    execute: async (_toolCallId, { path }: Static<typeof listFilesParameters>) => {
        try {
            const result = await sandbox.exec(`ls -la ${path}`);
            if (result.exitCode !== 0) {
                return textToolResult(`Error listing files: ${result.stderr}`);
            }
            return textToolResult(result.stdout);
        } catch (error) {
            return textToolResult(`Error listing files: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const writeFileParameters = Type.Object({
    path: Type.String({ description: "Path to the file (e.g., index.html)" }),
    content: Type.String({ description: "Content to write to the file" }),
});

export const createWriteFileTool = (
    sandboxOrGetter: SandboxInstance | null | (() => SandboxInstance | null),
    chatId?: string
) : AgentTool<typeof writeFileParameters> => ({
    name: "write_file",
    label: "write_file",
    description: "Write content to a file in the sandbox when available, or persist it to chat storage so it can later sync into a workspace.",
    parameters: writeFileParameters,
    execute: async (_toolCallId, { path, content }: Static<typeof writeFileParameters>) => {
        try {
            const sandbox = typeof sandboxOrGetter === "function" ? sandboxOrGetter() : sandboxOrGetter;

            if (sandbox) {
                const dir = pathMod.dirname(path);
                if (dir !== "." && dir !== "/") {
                    await sandbox.exec(`mkdir -p ${dir}`);
                }
                await sandbox.writeFile(path, content);
            } else if (!chatId) {
                return textToolResult(`Error writing file '${path}': no active sandbox is available.`);
            }

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
                await syncWorkspaceFileForChat(chatId, path, content);

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

            if (sandbox) {
                return textToolResult(`Successfully wrote ${content.length} bytes to ${path}`);
            }

            return textToolResult(`Successfully saved ${content.length} bytes to ${path} in chat storage${chatId ? "; it will also sync to any workspace linked later" : ""}`);
        } catch (error) {
            return textToolResult(`Error writing file '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const shellParameters = Type.Object({
    command: Type.String({ description: "The shell command to run" }),
});

export const createShellTool = (sandbox: SandboxInstance): AgentTool<typeof shellParameters> => ({
    name: "shell",
    label: "shell",
    description: "Run a shell command. DO NOT use for long-running processes (like servers) as it will block. If a command fails, read the FULL error output.",
    parameters: shellParameters,
    execute: async (_toolCallId, { command }: Static<typeof shellParameters>) => {
        // Block server commands that would hang forever
        const serverPatterns = [
            /python3?\s+-m\s+http\.server/i,
            /npm\s+run\s+(dev|start|preview|serve)/i,
            /npx\s+(serve|vite|http-server)/i,
            /deno\s+.*serve/i,
            /bun\s+.*serve/i,
            /node\s+.*server/i,
        ];

        const isServerCommand = serverPatterns.some(pattern => pattern.test(command));
        if (isServerCommand) {
            return textToolResult(`⛔ BLOCKED: The shell tool cannot run servers (they hang forever).

You tried: ${command}

✅ SOLUTION: Build your project with 'bun run build', then call 'expose_preview' to start a server and get a public URL.
Example: expose_preview({ root: "dist" }) or expose_preview({ root: "." })`);
        }

        try {
            const result = await sandbox.exec(command);

            // Return full output with clear formatting for error analysis
            if (result.exitCode !== 0) {
                // Command failed - return detailed error info
                return textToolResult(`❌ COMMAND FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Command: ${command}
Exit Code: ${result.exitCode}

STDOUT:
${result.stdout || "(empty)"}

STDERR:
${result.stderr || "(empty)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ANALYZE THE ERROR ABOVE and fix the specific issue. Do NOT retry with the same command.`);
            }

            // Command succeeded
            return textToolResult(`✅ Exit: ${result.exitCode}\n${result.stdout}${result.stderr ? `\nStderr: ${result.stderr}` : ""}`);
        } catch (error) {
            return textToolResult(`❌ Shell Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const exposePreviewParameters = Type.Object({
    root: Type.String({ default: ".", description: "The directory containing built files (e.g., '.' or 'dist')" }),
    port: Type.Optional(Type.Number({ description: "Port to expose (use when a dev server is already running)." })),
});

export const createExposePreviewTool = (sandbox: SandboxInstance, setPreviewUrl: (url: string) => void): AgentTool<typeof exposePreviewParameters> => ({
    name: "expose_preview",
    label: "expose_preview",
    description: "Expose a sandbox port for live preview. If port is omitted, a static server is started from the root on port 8000.",
    parameters: exposePreviewParameters,
    execute: async (_toolCallId, { root, port }: Static<typeof exposePreviewParameters>) => {
        try {
            const result = await sandbox.exec(`ls -la ${root}`);
            if (result.exitCode !== 0) {
                return textToolResult(`Error checking build directory: ${result.stderr}`);
            }

            if (!sandbox.exposeHttp) {
                return textToolResult(`Live preview is not supported by the current sandbox server. Please save artifacts (like index.html) instead.`);
            }

            const previewPort = port ?? 8000;
            // Always start a static server for the root directory
            // The 'port' parameter just specifies which port to use
            {
                if (!sandbox.spawn) {
                    return textToolResult("Sandbox does not support background servers (spawn missing).");
                }

                const serverPath = `_preview_server_${previewPort}.ts`;
                const serverCode = `
const root = ${JSON.stringify(root)};
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

Bun.serve({
  port: ${previewPort},
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = root + pathname;

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      // Try index.html for SPA routing
      const indexFile = Bun.file(root + "/index.html");
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { "Content-Type": "text/html" }
        });
      }
      return new Response("Not Found: " + pathname, { status: 404 });
    }

    const ext = pathname.substring(pathname.lastIndexOf('.'));
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  },
});
console.log("Static server running on port ${previewPort} serving " + root);
`;
                await sandbox.writeFile(serverPath, serverCode);
                const spawnResult = await sandbox.spawn(["bun", "run", serverPath]);

                if (!spawnResult || !spawnResult.pid) {
                    return textToolResult(`Error: Failed to start preview server - spawn returned no PID`);
                }

                // Wait for server to start and verify it's running
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Verify the server is actually listening by checking if the process is running
                const checkResult = await sandbox.exec(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${previewPort}/ 2>/dev/null || echo "failed"`);
                if (checkResult.stdout.trim() !== "200" && checkResult.stdout.trim() !== "404") {
                    // Server might not be ready yet, wait a bit more
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const previewUrl = await sandbox.exposeHttp({ port: previewPort });
            setPreviewUrl(previewUrl);

            return textToolResult(`✅ Live preview ready: ${previewUrl}`);
        } catch (error) {
            return textToolResult(`Expose Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const createWebAppParameters = Type.Object({
    type: appTypeSchema,
    name: Type.String({ description: "The name of the project directory" }),
    template: Type.Optional(Type.String({ description: "Template to use. For astro: 'basics', 'blog', 'starlight' (docs), 'starlog', 'portfolio', 'minimal'. For react-router: 'minimal', 'javascript', etc." })),
});

export const createWebAppTool = (sandbox: SandboxInstance, chatId?: string): AgentTool<typeof createWebAppParameters> => ({
    name: "create_web_app",
    label: "create_web_app",
    description: "Scaffold a new web application. Use 'vite' for React games/interactive apps, 'react-router' for full web apps, or 'astro' for simple static sites.",
    parameters: createWebAppParameters,
    execute: async (_toolCallId, { type, name, template }: Static<typeof createWebAppParameters>) => {
        // Validate type parameter - this is REQUIRED
        if (!type || !["vite", "react-router", "astro"].includes(type)) {
            return textToolResult(`❌ ERROR: 'type' parameter is REQUIRED and must be one of: "vite", "react-router", or "astro".

You called: create_web_app({ type: ${JSON.stringify(type)}, name: "${name}" })

Correct usage:
✅ create_web_app({ type: "astro", name: "${name}" })
✅ create_web_app({ type: "vite", name: "${name}" })
✅ create_web_app({ type: "react-router", name: "${name}" })`);
        }

        try {
            let command = "";

            if (type === "vite") {
                command = `npm create vite@latest ${name} -- --template react-ts`;
            } else if (type === "react-router") {
                const templateArg = template ? `--template ${template}` : "";
                command = `npm create react-router@latest ${name} -- ${templateArg} -y`;
            } else if (type === "astro") {
                const astroTemplate = template || "basics";
                command = `npm create astro@latest ${name} -- --template ${astroTemplate} --yes`;
            }

            const result = await sandbox.exec(command);

            if (result.exitCode !== 0) {
                return textToolResult(`Failed to create app.\nExit Code: ${result.exitCode}\nOutput:\n${result.stdout}\n${result.stderr}`);
            }

            // Sync artifacts if chatId provided
            if (chatId) {
                try {
                    // Find all files in the new directory, excluding node_modules and .git
                    const findResult = await sandbox.exec(`find ${name} -type f -not -path "*/node_modules/*" -not -path "*/.git/*"`);

                    if (findResult.exitCode === 0) {
                        const files = findResult.stdout.split("\n").filter(f => f.trim());

                        for (const file of files) {
                            try {
                                const content = await sandbox.readFile(file);

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
                                await syncWorkspaceFileForChat(chatId, file, content);
                            } catch (err) {
                                console.warn(`Failed to sync file ${file} to artifacts:`, err);
                            }
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

            return textToolResult(`Successfully generated ${type} app (template: ${template || "default"}) in '${name}'.\n\nNext steps:\n1. shell: cd ${name} && bun install\n2. Write your application code with write_file\n3. shell: cd ${name} && bun run build\n4. expose_preview({ root: "${outputPath}" }) to get a live preview URL`);
        } catch (error) {
            return textToolResult(`Error creating app: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const saveArtifactParameters = Type.Object({
    path: Type.String({ description: "Path to the file in the sandbox" }),
});

export const createSaveArtifactTool = (sandbox: SandboxInstance, chatId: string): AgentTool<typeof saveArtifactParameters> => ({
    name: "save_artifact",
    label: "save_artifact",
    description: "Save a file from the sandbox to the persistent database. REQUIRED for persistent storage and for non-text files (PPTX, images, PDFs, etc.) to be downloadable.",
    parameters: saveArtifactParameters,
    execute: async (_toolCallId, { path }: Static<typeof saveArtifactParameters>) => {
        try {
            // Check extension
            const ext = pathMod.extname(path).toLowerCase();
            const binaryExts = ['.pptx', '.png', '.jpg', '.jpeg', '.zip', '.pdf', '.xlsx', '.docx'];
            const isBinary = binaryExts.includes(ext);

            let content = "";
            if (isBinary) {
                // Read as base64 using exec
                const result = await sandbox.exec(`cat "${path}" | base64`);
                if (result.exitCode !== 0) {
                    return textToolResult(`Error reading file: ${result.stderr}`);
                }
                // Remove newlines/spaces from base64 output
                content = `base64:${result.stdout.replace(/\s/g, '')}`;
            } else {
                content = await sandbox.readFile(path);
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
            await syncWorkspaceFileForChat(chatId, path, content);

            return textToolResult(`Saved artifact '${path}' (ID: ${artifact.id}). View/Download at: /api/artifacts/${artifact.id}`);

        } catch (error) {
            return textToolResult(`Error saving artifact: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const manageSandboxParameters = Type.Object({
    action: sandboxActionSchema,
});

export const createManageSandboxTool = (sandbox: SandboxInstance): AgentTool<typeof manageSandboxParameters> => ({
    name: "manage_sandbox",
    label: "manage_sandbox",
    description: "Control the sandbox lifecycle. Use 'keep_alive' to confirm session is active. Use 'stop' when the task is permanently done.",
    parameters: manageSandboxParameters,
    execute: async (_toolCallId, { action }: Static<typeof manageSandboxParameters>) => {
        try {
            if (action === "keep_alive") {
                // Remote sandbox doesn't support extendLifetime directly
                // Return a message indicating the limitation
                return textToolResult("⚠️ Note: The remote sandbox manages its own lifetime. Your session will remain active while you're working.");
            } else if (action === "stop") {
                // Use kill() if available
                if (sandbox.kill) {
                    await sandbox.kill();
                    return textToolResult("🛑 Sandbox shutdown initiated.");
                }
                return textToolResult("⚠️ Warning: Could not explicitly stop sandbox (kill not available).");
            }
            return textToolResult("❌ Invalid action.");
        } catch (error) {
            return textToolResult(`Error managing sandbox: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Helper function for DuckDuckGo search
async function searchDuckDuckGo(query: string, numResults: number): Promise<Array<{ title: string; snippet: string; url: string }> | null> {
    try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const response = await fetch(searchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) return null;

        const html = await response.text();
        const results: Array<{ title: string; snippet: string; url: string }> = [];

        // Match result blocks - DuckDuckGo HTML format
        const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = resultRegex.exec(html)) !== null && results.length < numResults) {
            const url = match[1];
            const title = match[2].trim();
            const snippet = match[3]
                .replace(/<[^>]+>/g, '')
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

        return results.length > 0 ? results : null;
    } catch {
        return null;
    }
}

// Helper function for Brave Search
async function searchBrave(query: string, numResults: number): Promise<Array<{ title: string; snippet: string; url: string }> | null> {
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!braveApiKey) return null;

    try {
        const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(numResults, 10)}`;

        const response = await fetch(searchUrl, {
            headers: {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": braveApiKey
            }
        });

        if (!response.ok) return null;

        const data = await response.json();
        const webResults = data.web?.results || [];

        if (webResults.length === 0) return null;

        return webResults.slice(0, numResults).map((r: any) => ({
            title: r.title || '',
            snippet: r.description || '',
            url: r.url || ''
        }));
    } catch {
        return null;
    }
}

const webSearchParameters = Type.Object({
    query: Type.String({ description: "The search query - be specific for better results" }),
    numResults: Type.Number({ default: 5, description: "Number of results to return (default: 5, max: 10)" }),
});

export const createWebSearchTool = (): AgentTool<typeof webSearchParameters> => ({
    name: "web_search",
    label: "web_search",
    description: "Search the web to find current information. Uses DuckDuckGo with Brave Search as fallback. Use this to research topics, find facts for slide content, get up-to-date data, or verify information. Returns titles, snippets, and URLs.",
    parameters: webSearchParameters,
    execute: async (_toolCallId, { query, numResults = 5 }: Static<typeof webSearchParameters>) => {
        try {
            // Try DuckDuckGo first
            let results = await searchDuckDuckGo(query, numResults);
            let source = "DuckDuckGo";

            // Fall back to Brave Search if DuckDuckGo fails
            if (!results || results.length === 0) {
                results = await searchBrave(query, numResults);
                source = "Brave";
            }

            // If both fail, provide helpful message
            if (!results || results.length === 0) {
                const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;
                if (!hasBraveKey) {
                    return textToolResult(`🔍 No results found for: "${query}"\n\nDuckDuckGo search failed. For better reliability, add BRAVE_SEARCH_API_KEY to your environment.\nGet a free API key at: https://brave.com/search/api/`);
                }
                return textToolResult(`🔍 No results found for: "${query}"\n\nTry rephrasing your search or using different keywords.`);
            }

            let output = `🔍 WEB SEARCH RESULTS (${source})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nQuery: "${query}"\n\n`;

            results.forEach((r, i) => {
                output += `${i + 1}. ${r.title}\n`;
                output += `   ${r.snippet}\n`;
                output += `   🔗 ${r.url}\n\n`;
            });

            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `Found ${results.length} results. Use this information to inform your response.`;

            return textToolResult(output);
        } catch (error) {
            return textToolResult(`Search error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Enhance image search queries for better results
function enhanceImageQuery(query: string): string {
    const q = query.toLowerCase().trim();

    // Map common concepts to better search terms
    const conceptMappings: Record<string, string> = {
        'gpu': 'graphics card computer hardware technology',
        'cpu': 'processor computer chip technology',
        'ai': 'artificial intelligence technology futuristic',
        'machine learning': 'artificial intelligence neural network technology',
        'cloud': 'cloud computing technology server',
        'data': 'data visualization analytics technology',
        'code': 'programming software development computer',
        'coding': 'programming software developer laptop',
        'server': 'server room data center technology',
        'network': 'network infrastructure technology connected',
        'security': 'cybersecurity digital lock protection',
        'blockchain': 'blockchain cryptocurrency technology digital',
        'iot': 'internet of things connected devices smart',
        'robot': 'robotics automation technology futuristic',
        'vr': 'virtual reality headset technology immersive',
        'ar': 'augmented reality technology digital overlay',
    };

    // Check if query matches a concept
    for (const [concept, enhanced] of Object.entries(conceptMappings)) {
        if (q.includes(concept)) {
            return `${query} ${enhanced}`.trim();
        }
    }

    // Add quality modifiers for abstract/technical terms
    const technicalTerms = ['evolution', 'history', 'development', 'growth', 'progress', 'timeline', 'future'];
    if (technicalTerms.some(term => q.includes(term))) {
        return `${query} concept illustration professional`;
    }

    return query;
}

// Search Pexels for images
async function searchPexels(query: string, numResults: number, orientation?: string): Promise<Array<{ url: string; thumb: string; description: string; photographer: string }> | null> {
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (!pexelsKey) return null;

    try {
        const orientParam = orientation ? `&orientation=${orientation}` : '';
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${numResults}${orientParam}`;

        const response = await fetch(url, {
            headers: { "Authorization": pexelsKey }
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.photos || data.photos.length === 0) return null;

        return data.photos.map((p: any) => ({
            url: p.src?.large || p.src?.original,
            thumb: p.src?.medium || p.src?.small,
            description: p.alt || 'Untitled',
            photographer: p.photographer || 'Unknown'
        }));
    } catch {
        return null;
    }
}

// Search Unsplash for images
async function searchUnsplash(query: string, numResults: number, orientation?: string): Promise<Array<{ url: string; thumb: string; description: string; photographer: string }> | null> {
    try {
        const orientParam = orientation ? `&orientation=${orientation}` : '';
        const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${numResults}${orientParam}`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.results || data.results.length === 0) return null;

        return data.results.map((img: any) => ({
            url: img.urls?.regular || img.urls?.small,
            thumb: img.urls?.thumb || img.urls?.small,
            description: img.alt_description || img.description || 'Untitled',
            photographer: img.user?.name || 'Unknown'
        }));
    } catch {
        return null;
    }
}

const searchImagesParameters = Type.Object({
    query: Type.String({ description: "Search query for images - be specific (e.g., 'GPU graphics card', 'team collaboration office', 'data visualization chart')" }),
    numResults: Type.Number({ default: 5, description: "Number of images to return (default: 5)" }),
    orientation: Type.Optional(imageOrientationSchema),
});

export const createSearchImagesTool = (): AgentTool<typeof searchImagesParameters> => ({
    name: "search_images",
    label: "search_images",
    description: "Search for high-quality images to use in slides or presentations. Returns image URLs that can be used in 'image' type slides. Use specific, descriptive queries - the tool will enhance them for better results.",
    parameters: searchImagesParameters,
    execute: async (_toolCallId, { query, numResults = 5, orientation }: Static<typeof searchImagesParameters>) => {
        try {
            // Enhance the query for better results
            const enhancedQuery = enhanceImageQuery(query);

            let results: Array<{ url: string; thumb: string; description: string; photographer: string }> | null = null;
            let source = "";

            // Try Pexels first (if API key available)
            results = await searchPexels(enhancedQuery, numResults, orientation);
            if (results && results.length > 0) {
                source = "Pexels";
            }

            // Fall back to Unsplash
            if (!results || results.length === 0) {
                results = await searchUnsplash(enhancedQuery, numResults, orientation);
                if (results && results.length > 0) {
                    source = "Unsplash";
                }
            }

            // Try original query if enhanced didn't work
            if (!results || results.length === 0) {
                results = await searchPexels(query, numResults, orientation);
                if (results && results.length > 0) {
                    source = "Pexels";
                }
            }

            if (!results || results.length === 0) {
                results = await searchUnsplash(query, numResults, orientation);
                if (results && results.length > 0) {
                    source = "Unsplash";
                }
            }

            // Fall back to DuckDuckGo
            if (!results || results.length === 0) {
                return textToolResult(await searchDuckDuckGoImages(query, numResults));
            }

            let output = `🖼️ IMAGE SEARCH RESULTS (${source})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: "${query}"${enhancedQuery !== query ? `\nEnhanced: "${enhancedQuery}"` : ''}

`;

            results.forEach((img, i) => {
                output += `${i + 1}. ${img.description}
   📷 By: ${img.photographer}
   🔗 URL: ${img.url}
   📌 Thumbnail: ${img.thumb}

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

            return textToolResult(output);
        } catch (error) {
            // Fallback to DuckDuckGo
            try {
                return textToolResult(await searchDuckDuckGoImages(query, numResults));
            } catch {
                return textToolResult(`Image search error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    },
});

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

const writeSlidesParameters = Type.Object({
    content: Type.String({ description: "The complete HTML content with embedded slide-data JSON" }),
    title: Type.Optional(Type.String({ description: "Optional title for the presentation" })),
    theme: Type.Optional(Type.String({ description: "Theme: minimalist, paper, noir, brass, cobalt, emerald, midnight" })),
});

export const createWriteSlidesTool = (
    chatId: string, 
    broadcastFn: (event: { type: string; data: any }) => Promise<void>
) : AgentTool<typeof writeSlidesParameters> => ({
    name: "write_slides",
    label: "write_slides",
    description: `Write slide presentation HTML (NO SANDBOX NEEDED). THEMES: minimalist, paper, noir, brass, cobalt, emerald, midnight. Before calling this, research the topic with available tools unless the user already provided the needed source material.`,
    parameters: writeSlidesParameters,
    execute: async (_toolCallId, { content, title, theme }: Static<typeof writeSlidesParameters>) => {
        try {
            // Validate that content contains slide-data script tag
            if (!content.includes('<script id="slide-data"') && !content.includes("<script id='slide-data'")) {
                return textToolResult(`❌ ERROR: Slide content must include a <script id="slide-data" type="application/json"> tag with slide data.

Example:
<script id="slide-data" type="application/json">
[
  {"id": 1, "type": "title", "title": "My Presentation", "subtitle": "A great topic"},
  {"id": 2, "type": "content", "title": "Overview", "bullets": ["Point 1", "Point 2"]}
]
</script>`);
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
            await syncWorkspaceFileForChat(chatId, filename, content);

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
            return textToolResult(`✅ Successfully saved ${title ? `"${title}"` : "presentation"}${themeInfo} (${content.length} bytes).
The slides are now visible in the preview panel.`);
        } catch (error) {
            return textToolResult(`Error saving slides: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const parseDocumentParameters = Type.Object({
    url: Type.Optional(Type.String({ description: "Direct URL to the PDF or document file" })),
    path: Type.Optional(Type.String({ description: "Local path to a PDF or document file on disk" })),
    targetPages: Type.Optional(Type.String({ description: "Page range to parse, e.g. '1-5' or '1,3,7'. Omit to parse all pages." })),
    ocrEnabled: Type.Boolean({ default: false, description: "Enable OCR for scanned/image-based documents (slower)" }),
});

export const createParseDocumentTool = (): AgentTool<typeof parseDocumentParameters> => ({
    name: "parse_document",
    label: "parse_document",
    description: "Parse a PDF with LiteParse and extract text from either a direct URL or a local file path. Supports page targeting and optional OCR for scanned PDFs.",
    parameters: parseDocumentParameters,
    execute: async (_toolCallId, { url, path, targetPages, ocrEnabled = false }: Static<typeof parseDocumentParameters>) => {
        try {
            if (!url && !path) {
                return textToolResult("Error: Provide either a document URL or a local file path.");
            }

            if (url && path) {
                return textToolResult("Error: Provide only one document source at a time: either url or path.");
            }

            let source = "";
            let contentType = "application/octet-stream";
            let buffer: Buffer;

            if (url) {
                const response = await fetch(url);
                if (!response.ok) {
                    return textToolResult(`Error: Failed to fetch document from URL (${response.status} ${response.statusText})`);
                }

                source = url;
                contentType = response.headers.get("content-type") || contentType;
                buffer = Buffer.from(await response.arrayBuffer());
            } else {
                const resolvedPath = pathMod.resolve(path!);
                source = resolvedPath;
                buffer = await fs.readFile(resolvedPath);

                const extension = pathMod.extname(resolvedPath).toLowerCase();
                if (extension === ".pdf") {
                    contentType = "application/pdf";
                }
            }

            const config: Record<string, unknown> = { outputFormat: "text" };
            if (targetPages) config.targetPages = targetPages;
            if (ocrEnabled) config.ocrEnabled = true;

            const freshParser = new LiteParse(config as any);
            const result = await freshParser.parse(buffer, true);

            const pageCount = result.pages?.length ?? 0;
            const textLength = result.text?.length ?? 0;
            const truncated = textLength > 30000;
            const text = truncated ? result.text.slice(0, 30000) : result.text;

            let output = `📄 DOCUMENT PARSED SUCCESSFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Source: ${source}
Content-Type: ${contentType}
Pages: ${pageCount}
Characters: ${textLength}${truncated ? " (truncated to 30,000)" : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${text}`;

            return textToolResult(output);
        } catch (error) {
            return textToolResult(`Error parsing document: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

const readUploadedDocumentParameters = Type.Object({
    documentId: Type.String({ description: "Document ID from the attached documents list" }),
    targetPages: Type.Optional(Type.String({ description: "Optional page range for PDFs, e.g. '1-5'" })),
    maxChars: Type.Number({ default: 12000, description: "Maximum number of characters to return" }),
});

export const createReadUploadedDocumentTool = (chatId: string): AgentTool<typeof readUploadedDocumentParameters> => ({
    name: "read_uploaded_document",
    label: "read_uploaded_document",
    description: "Read the extracted content of a document the user uploaded to this chat or workspace. Use the document ID from the attached document list.",
    parameters: readUploadedDocumentParameters,
    execute: async (_toolCallId, { documentId, targetPages, maxChars = 12000 }: Static<typeof readUploadedDocumentParameters>) => {
        try {
            const result = await readUploadedDocumentForAgent({ chatId, documentId, targetPages, maxChars });
            return textToolResult(result.output);
        } catch (error) {
            return textToolResult(`Error reading uploaded document: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});
