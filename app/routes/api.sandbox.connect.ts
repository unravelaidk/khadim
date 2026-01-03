import type { ActionFunctionArgs } from "react-router";
import { Sandbox } from "@deno/sandbox";
import { db, artifacts } from "../lib/db";
import { eq } from "drizzle-orm";

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
      // Try to reconnect to existing sandbox
      try {
        sandbox = await Sandbox.connect({ id: sandboxId });
        newSandboxId = sandboxId;
      } catch {
        // Sandbox expired, create a new one
        sandbox = await Sandbox.create({ lifetime: "5m" });
        newSandboxId = sandbox.id;
        isNewSession = true;
      }
    } else {
      // No sandbox ID, create new
      sandbox = await Sandbox.create({ lifetime: "5m" });
      newSandboxId = sandbox.id;
      isNewSession = true;
    }

    // Connect successful. Now ensure preview is ready if we have artifacts
    let previewUrl: string | null = null;
    
    if (chatId) {
      const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));
      
      if (chatArtifacts.length > 0) {
        let hasIndexHtml = false;
        
        // Restore artifacts if new session
        if (isNewSession) {
          console.log(`Restoring ${chatArtifacts.length} artifacts for chat ${chatId} to sandbox ${newSandboxId}`);
          for (const artifact of chatArtifacts) {
            await sandbox.writeTextFile(artifact.filename, artifact.content);
            if (artifact.filename === "index.html") hasIndexHtml = true;
          }
          
          // Start server if index.html exists
          if (hasIndexHtml) {
             try {
                const port = 8000;
                const serverCode = `
                  import { serveDir } from "jsr:@std/http/file-server";
                  Deno.serve({ port: ${port} }, (req) => serveDir(req, { fsRoot: "." }));
                `;
                await sandbox.writeTextFile("_server.ts", serverCode);
                sandbox.spawn("deno", {
                  args: ["run", "-A", "_server.ts"],
                  stdout: "null",
                  stderr: "null",
                });
             } catch (e) {
                console.error("Failed to start server", e);
             }
          }
        } else {
          // Existing session - check if index.html exists (in DB or sandbox?)
          // We trust DB.
          hasIndexHtml = chatArtifacts.some(a => a.filename === "index.html");
        }

        // Auto-expose preview if index.html exists (idempotent-ish, or gives new URL)
        if (hasIndexHtml) {
          try {
            await new Promise(r => setTimeout(r, 1000));
            // Always expose to get valid URL
            previewUrl = await sandbox.exposeHttp({ port: 8000 });
            
            // Poll until the server is ready (max 5 seconds)
            let retries = 20;
            while (retries > 0) {
              try {
                // Use a short timeout for the fetch itself
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                const res = await fetch(previewUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                  console.log(`Preview ready: ${previewUrl}`);
                  break;
                }
              } catch {
                // Ignore connection errors/timeouts
              }
              await new Promise(r => setTimeout(r, 250));
              retries--;
            }

            console.log(`Restored/Verified preview for chat ${chatId}: ${previewUrl}`);
          } catch (e) {
            console.error("Failed to expose preview", e);
          }
        }
      }
    }

    // Don't close the sandbox - keep it alive
    return Response.json({ 
      success: true, 
      sandboxId: newSandboxId,
      reconnected: !isNewSession,
      restoredArtifacts: isNewSession && chatId,
      previewUrl
    });
  } catch (error) {
    return Response.json({ 
      error: error instanceof Error ? error.message : "Failed to connect sandbox" 
    }, { status: 500 });
  }
}
