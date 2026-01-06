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

      try {
        sandbox = await Sandbox.connect({ id: sandboxId });
        newSandboxId = sandboxId;
      } catch {

        sandbox = await Sandbox.create({ lifetime: "10m" });
        newSandboxId = sandbox.id;
        isNewSession = true;
      }
    } else {

      sandbox = await Sandbox.create({ lifetime: "5m" });
      newSandboxId = sandbox.id;
      isNewSession = true;
    }

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
        } else {
             // For existing sessions, check if we expect an index.html
             hasIndexHtml = chatArtifacts.some(a => a.filename === "index.html");
        }

        // ALWAYS attempt to ensure server is running if we have index.html
        if (hasIndexHtml) {
            try {
              const port = 8000;
              const serverCode = `
                  import { serveDir } from "jsr:@std/http/file-server";
                  Deno.serve({ port: ${port} }, (req) => serveDir(req, { fsRoot: "." }));
                `;
              
              // Only write server file if new session to avoid overwriting running server (though benign)
              if (isNewSession) {
                  await sandbox.writeTextFile("_server.ts", serverCode);
              }

              // Try to start server. If already running, this spawns a process that will fail fast.
              // Note: sandbox.spawn doesn't throw on non-zero exit, we check status.
              // We just fire and forget here essentially, but we can verify via exposeHttp.
              sandbox.spawn("deno", {
                args: ["run", "-A", "_server.ts"],
                stdout: "null",
                stderr: "null",
              });
            } catch (e) {
              console.error("Failed to start server (might be already running)", e);
            }

            try {
                // Give it a tiny bit to start if it was just spawned
                if (isNewSession) await new Promise(r => setTimeout(r, 500));

                previewUrl = await sandbox.exposeHttp({ port: 8000 });

                // Check responsiveness
                let retries = isNewSession ? 20 : 5; // Fewer retries for existing session
                while (retries > 0) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
                    const res = await fetch(previewUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                    console.log(`Preview ready: ${previewUrl}`);
                    break;
                    }
                } catch {
                    // Ignore error
                }
                
                // If it's an existing session and it fails immediately, it might just be loading. 
                // But we don't want to block too long.
                await new Promise(r => setTimeout(r, 200));
                retries--;
                }
            } catch (e) {
                console.error("Failed to expose preview", e);
            }
        }
      }
    }

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
