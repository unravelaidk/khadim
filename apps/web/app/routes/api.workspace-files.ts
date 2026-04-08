import type { ActionFunctionArgs } from "react-router";
import { upsertWorkspaceFile } from "../lib/workspace-sync";
import { db, workspaceFiles } from "../lib/db";
import { and, eq } from "drizzle-orm";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const workspaceId = formData.get("workspaceId")?.toString();
  const path = formData.get("path")?.toString();
  const content = formData.get("content")?.toString();
  const mimeType = formData.get("mimeType")?.toString() || null;
  const sizeValue = formData.get("size")?.toString();
  const size = sizeValue ? Number(sizeValue) : null;

  if (!workspaceId || !path || content === undefined) {
    return Response.json({ error: "workspaceId, path, and content are required" }, { status: 400 });
  }

  await upsertWorkspaceFile(workspaceId, path, content, { mimeType, size });
  const [file] = await db
    .select()
    .from(workspaceFiles)
    .where(and(eq(workspaceFiles.workspaceId, workspaceId), eq(workspaceFiles.path, path)))
    .limit(1);

  return Response.json({ file });
}
