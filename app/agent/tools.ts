import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Sandbox } from "@deno/sandbox";
import { db, artifacts } from "../lib/db";
import { eq, and } from "drizzle-orm";

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

export const createWebAppTool = (sandbox: Sandbox) => tool(
    async ({ type, name, template }: { type: "vite" | "react-router"; name: string, template?: string }) => {
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

            return `Successfully generated ${type} app (template: ${template || "default"}) in '${name}'.\n\nNext steps for you:\n1. run 'cd ${name}'\n2. run 'npm install'\n3. run 'npm run build'\n4. expose_preview with root='${name}/dist' or '${name}/dist/client'`;
        } catch (error) {
            return `Error creating app: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "create_web_app",
        description: "Scaffold a new web application (Vite React or React Router).",
        schema: z.object({
            type: z.enum(["vite", "react-router"]).describe("The type of application to create"),
            name: z.string().describe("The name of the project directory"),
            template: z.string().optional().describe("React Router template (e.g., 'minimal', 'remix-run/react-router-templates/minimal', 'remix-run/react-router-templates/javascript', 'remix-run/react-router-templates/node-custom-server')"),
        }),
    }
);
