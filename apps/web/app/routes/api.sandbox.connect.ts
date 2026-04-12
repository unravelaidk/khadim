import type { ActionFunctionArgs } from "react-router";
import { getSandboxProvider, withSandboxProviderFallback } from "../agent/sandbox";
import { db, artifacts, chats, projects, workspaceFiles } from "../lib/db";
import { eq } from "drizzle-orm";

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getServerBootWaitMs(defaultMs: number): number {
  return parseOptionalNumber(process.env.SANDBOX_SERVER_BOOT_WAIT_MS) ?? defaultMs;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProjectDevPort(project: { projectType?: string | null; devPort?: number | null }): number {
  if (typeof project.devPort === "number" && Number.isFinite(project.devPort) && project.devPort > 0) {
    return project.devPort;
  }

  return project.projectType === "astro" ? 4321 : 5173;
}

async function exposePreviewIfAvailable(
  sandbox: { exposeHttp?: (options: { port: number }) => Promise<string> },
  port: number
): Promise<string | null> {
  if (!sandbox.exposeHttp) {
    return null;
  }

  return sandbox.exposeHttp({ port });
}

// Helper: Start static Bun file server
async function startStaticServer(sandbox: { writeFile: (path: string, content: string) => Promise<void>; spawn: (cmd: string[], opts?: { cwd?: string }) => Promise<{ pid: number }> }, root: string, port: number): Promise<void> {
  const serverCode = `
    Bun.serve({
      port: ${port},
      fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        return new Response(Bun.file("${root}" + path));
      },
    });
    console.log("Static server running on port ${port}");
  `;
  await sandbox.writeFile("_server.ts", serverCode);
  await sandbox.spawn(["bun", "run", "_server.ts"]);
}

function requireSpawn(
  sandbox: { spawn?: (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ pid: number }> }
): (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ pid: number }> {
  if (!sandbox.spawn) {
    throw new Error("The selected sandbox backend does not support background processes");
  }
  return sandbox.spawn.bind(sandbox);
}

// Helper: Start npm dev server for React/Vite/Astro projects
async function startDevServer(
  sandbox: { exec: (script: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>; spawn: (cmd: string[], opts?: { cwd?: string }) => Promise<{ pid: number }> },
  projectName: string, 
  devCommand: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Run npm install first
    console.log(`Running npm install in ${projectName}...`);
    const installResult = await sandbox.exec(`cd ${projectName} && npm install`);
    
    if (installResult.exitCode !== 0) {
      console.error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
      return { success: false, error: `npm install failed: ${(installResult.stderr || installResult.stdout).slice(0, 500)}` };
    }
    console.log(`npm install completed successfully`);
    
    // Start the dev server in background
    console.log(`Starting dev server: cd ${projectName} && ${devCommand}`);
    await sandbox.spawn(["sh", "-c", `cd ${projectName} && ${devCommand}`]);
    
    return { success: true };
  } catch (error) {
    console.error(`Failed to start dev server:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Helper: Wait for server to be ready
async function waitForServer(url: string, maxRetries: number = 30, delayMs: number = 500): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok || res.status === 304) {
        console.log(`Server ready at ${url} after ${i + 1} attempts`);
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

// POST /api/sandbox/connect - Connect to existing sandbox or create new
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const sandboxId = formData.get("sandboxId")?.toString();
  const chatId = formData.get("chatId")?.toString();

  try {
    const sandboxProvider = getSandboxProvider();
    let sandbox: Awaited<ReturnType<typeof sandboxProvider.create>>;
    let newSandboxId: string;
    let isNewSession = false;

    if (sandboxId) {
      try {
        sandbox = await withSandboxProviderFallback((provider) => provider.connect({ id: sandboxId }));
        newSandboxId = sandboxId;
      } catch {
        sandbox = await withSandboxProviderFallback((provider) => provider.create({ lifetime: "15m" }));
        newSandboxId = sandbox.id;
        isNewSession = true;
      }
    } else {
      sandbox = await withSandboxProviderFallback((provider) => provider.create({ lifetime: "15m" }));
      newSandboxId = sandbox.id;
      isNewSession = true;
    }

    let previewUrl: string | null = null;
    let restorationStatus: "none" | "static" | "dev_server" | "failed" = "none";
    let restorationError: string | undefined;

    if (chatId && isNewSession) {
      const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
      const sharedWorkspaceFiles = chat?.workspaceId
        ? await db.select().from(workspaceFiles).where(eq(workspaceFiles.workspaceId, chat.workspaceId))
        : [];

      for (const file of sharedWorkspaceFiles) {
        try {
          const dir = file.path.split("/").slice(0, -1).join("/");
          if (dir) {
            await sandbox.exec(`mkdir -p ${dir}`);
          }
          await sandbox.writeFile(file.path, file.content);
        } catch (e) {
          console.warn(`Failed to restore workspace file ${file.path}:`, e);
        }
      }

      // 1. Restore all chat artifacts last so per-chat files override workspace files
      const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));
      
      if (chatArtifacts.length > 0) {
        console.log(`Restoring ${chatArtifacts.length} artifacts for chat ${chatId}`);
        
        for (const artifact of chatArtifacts) {
          try {
            // Create parent directories if needed
            const dir = artifact.filename.split("/").slice(0, -1).join("/");
            if (dir) {
              await sandbox.exec(`mkdir -p ${dir}`);
            }
            await sandbox.writeFile(artifact.filename, artifact.content);
          } catch (e) {
            console.warn(`Failed to restore artifact ${artifact.filename}:`, e);
          }
        }
        
        // 2. Check if we have project metadata
        const projectResult = await db.select().from(projects).where(eq(projects.chatId, chatId)).limit(1);
        const project = projectResult[0];

        if (project && project.projectType && project.projectName) {
          // We have a framework project (vite, react-router, astro)
          console.log(`Detected ${project.projectType} project: ${project.projectName}`);
          const spawn = requireSpawn(sandbox);
          
          const devResult = await startDevServer(
            { exec: sandbox.exec, spawn }, 
            project.projectName, 
            project.devCommand || "npm run dev"
          );
          
          if (devResult.success) {
            await sleep(getServerBootWaitMs(3000));
            const devPort = resolveProjectDevPort(project);

            try {
              previewUrl = await exposePreviewIfAvailable(sandbox, devPort);
            } catch (error) {
              restorationError = error instanceof Error ? error.message : String(error);
              console.warn(`Failed to expose preview for ${project.projectName}:`, error);
            }
            
            restorationStatus = "dev_server";
            console.log(`Dev server started for ${project.projectName}`);
          } else {
            restorationStatus = "failed";
            restorationError = devResult.error;
          }
        } else {
          // Check for static HTML project
          const indexHtmlArtifact = chatArtifacts.find(a => a.filename === "index.html");
          
          if (indexHtmlArtifact) {
            // Check if this is a slide deck - if so, we don't need a server
            if (indexHtmlArtifact.content.includes('<script id="slide-data"')) {
              console.log("Detected slide project - skipping server start (native preview)");
              restorationStatus = "none";
            } else {
              console.log(`Detected static HTML project`);
              const spawn = requireSpawn(sandbox);
              await startStaticServer({ writeFile: sandbox.writeFile, spawn }, ".", 8000);
              await sleep(getServerBootWaitMs(500));

              try {
                previewUrl = await exposePreviewIfAvailable(sandbox, 8000);
              } catch (error) {
                restorationError = error instanceof Error ? error.message : String(error);
                console.warn("Failed to expose static preview:", error);
              }

              restorationStatus = "static";
            }
          }
        }
      }
    }

    return Response.json({
      success: true,
      sandboxId: newSandboxId,
      reconnected: !isNewSession,
      restoredArtifacts: isNewSession && chatId,
      restorationStatus,
      restorationError,
      previewUrl
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Failed to connect sandbox"
    }, { status: 500 });
  }
}
