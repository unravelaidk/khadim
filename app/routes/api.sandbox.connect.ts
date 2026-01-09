import type { ActionFunctionArgs } from "react-router";
import { Sandbox } from "@deno/sandbox";
import { db, artifacts, projects } from "../lib/db";
import { eq } from "drizzle-orm";

// Helper: Start static Deno file server
async function startStaticServer(sandbox: Sandbox, root: string, port: number): Promise<void> {
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
}

// Helper: Start npm dev server for React/Vite/Astro projects
async function startDevServer(
  sandbox: Sandbox, 
  projectName: string, 
  devCommand: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Run npm install first
    console.log(`Running npm install in ${projectName}...`);
    const installChild = await sandbox.spawn("sh", {
      args: ["-c", `cd ${projectName} && npm install`],
      stdout: "piped",
      stderr: "piped",
    });
    
    let installOutput = "";
    if (installChild.stdout) {
      const reader = installChild.stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        installOutput += new TextDecoder().decode(value);
      }
    }
    if (installChild.stderr) {
      const reader = installChild.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        installOutput += new TextDecoder().decode(value);
      }
    }
    
    const installStatus = await installChild.status;
    if (installStatus.code !== 0) {
      console.error(`npm install failed: ${installOutput}`);
      return { success: false, error: `npm install failed: ${installOutput.slice(0, 500)}` };
    }
    console.log(`npm install completed successfully`);
    
    // Start the dev server in background
    console.log(`Starting dev server: cd ${projectName} && ${devCommand}`);
    sandbox.spawn("sh", {
      args: ["-c", `cd ${projectName} && ${devCommand}`],
      stdout: "null",
      stderr: "null",
    });
    
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
    let sandbox: Sandbox;
    let newSandboxId: string;
    let isNewSession = false;

    if (sandboxId) {
      try {
        sandbox = await Sandbox.connect({ id: sandboxId });
        newSandboxId = sandboxId;
      } catch {
        sandbox = await Sandbox.create({ lifetime: "15m" }); // Longer lifetime for npm install
        newSandboxId = sandbox.id;
        isNewSession = true;
      }
    } else {
      sandbox = await Sandbox.create({ lifetime: "15m" });
      newSandboxId = sandbox.id;
      isNewSession = true;
    }

    let previewUrl: string | null = null;
    let restorationStatus: "none" | "static" | "dev_server" | "failed" = "none";
    let restorationError: string | undefined;

    if (chatId && isNewSession) {
      // 1. Restore all artifacts first
      const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));
      
      if (chatArtifacts.length > 0) {
        console.log(`Restoring ${chatArtifacts.length} artifacts for chat ${chatId}`);
        
        for (const artifact of chatArtifacts) {
          try {
            // Create parent directories if needed
            const dir = artifact.filename.split("/").slice(0, -1).join("/");
            if (dir) {
              await sandbox.spawn("mkdir", { args: ["-p", dir] });
            }
            await sandbox.writeTextFile(artifact.filename, artifact.content);
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
          
          const devResult = await startDevServer(
            sandbox, 
            project.projectName, 
            project.devCommand || "npm run dev"
          );
          
          if (devResult.success) {
            // Wait a bit for dev server to start
            await new Promise(r => setTimeout(r, 3000));
            
            const port = project.devPort || 5173;
            try {
              previewUrl = await sandbox.exposeHttp({ port });
              
              // Wait for server to be responsive
              const isReady = await waitForServer(previewUrl, 20, 500);
              if (isReady) {
                restorationStatus = "dev_server";
                console.log(`Dev server ready at ${previewUrl}`);
              } else {
                console.warn(`Dev server exposed but not responding yet at ${previewUrl}`);
                restorationStatus = "dev_server"; // Still return the URL
              }
            } catch (e) {
              console.error(`Failed to expose dev server:`, e);
              restorationStatus = "failed";
              restorationError = "Failed to expose dev server port";
            }
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
              await startStaticServer(sandbox, ".", 8000);
              await new Promise(r => setTimeout(r, 500));
              
              try {
                previewUrl = await sandbox.exposeHttp({ port: 8000 });
                const isReady = await waitForServer(previewUrl, 10, 200);
                restorationStatus = isReady ? "static" : "failed";
              } catch (e) {
                console.error(`Failed to start static server:`, e);
                restorationStatus = "failed";
                restorationError = "Failed to start static server";
              }
            }
          }
        }
      }
    } else if (chatId && !isNewSession) {
      // Existing session - just check if we have project info for the preview URL
      const projectResult = await db.select().from(projects).where(eq(projects.chatId, chatId)).limit(1);
      const project = projectResult[0];
      
      if (project && project.devPort) {
        try {
          previewUrl = await sandbox.exposeHttp({ port: project.devPort });
        } catch {
          // Server might not be running
        }
      } else {
        // Check for static server
        try {
          previewUrl = await sandbox.exposeHttp({ port: 8000 });
        } catch {
          // No server running
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

