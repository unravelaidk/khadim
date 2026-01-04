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


        if (isNewSession) {
          console.log(`Restoring ${chatArtifacts.length} artifacts for chat ${chatId} to sandbox ${newSandboxId}`);
          for (const artifact of chatArtifacts) {
            await sandbox.writeTextFile(artifact.filename, artifact.content);
            if (artifact.filename === "index.html") hasIndexHtml = true;
          }


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

          //TODO 
          // We trust DB.
          hasIndexHtml = chatArtifacts.some(a => a.filename === "index.html");
        }

        if (hasIndexHtml) {
          try {
            await new Promise(r => setTimeout(r, 1000));
            previewUrl = await sandbox.exposeHttp({ port: 8000 });

            let retries = 20;
            while (retries > 0) {
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                const res = await fetch(previewUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                  console.log(`Preview ready: ${previewUrl}`);
                  break;
                }
              } catch {

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
