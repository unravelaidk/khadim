import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db, workspaceFiles } from "../lib/db";

function getMimeType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "txt";
  const mimeTypes: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    jsx: "application/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    json: "application/json",
    md: "text/markdown",
    py: "text/x-python",
    txt: "text/plain",
    svg: "image/svg+xml",
  };
  return mimeTypes[ext] || "text/plain";
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const fileId = params.id;
  if (!fileId) return Response.json({ error: "File ID required" }, { status: 400 });

  const [file] = await db.select().from(workspaceFiles).where(eq(workspaceFiles.id, fileId)).limit(1);
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });

  const url = new URL(request.url);
  if (url.searchParams.get("download") === "1") {
    const isBase64 = file.content.startsWith("base64:");
    const body = isBase64 ? Buffer.from(file.content.slice(7), "base64") : file.content;
    return new Response(body, {
      headers: {
        "Content-Type": file.mimeType || getMimeType(file.path),
        "Content-Disposition": `attachment; filename="${file.path.split("/").pop() || file.path}"`,
      },
    });
  }

  return Response.json({ file });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const fileId = params.id;
  if (!fileId) return Response.json({ error: "File ID required" }, { status: 400 });
  if (request.method !== "PATCH") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const formData = await request.formData();
  const content = formData.get("content")?.toString();
  if (content === undefined) return Response.json({ error: "Content required" }, { status: 400 });

  const [file] = await db
    .update(workspaceFiles)
    .set({ content, size: content.length, updatedAt: new Date() })
    .where(eq(workspaceFiles.id, fileId))
    .returning();

  return Response.json({ file });
}
