import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { desc, eq } from "drizzle-orm";
import { db, chats, workspaces } from "../lib/db";
import { syncExistingArtifactsToWorkspace } from "../lib/workspace-sync";

export async function loader({}: LoaderFunctionArgs) {
  const allWorkspaces = await db.select().from(workspaces).orderBy(desc(workspaces.updatedAt));
  return Response.json({ workspaces: allWorkspaces });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const name = formData.get("name")?.toString() || "New Workspace";
  const agentId = formData.get("agentId")?.toString() || "build";
  const chatId = formData.get("chatId")?.toString() || null;

  const [workspace] = await db.insert(workspaces).values({
    name,
    agentId,
    sourceChatId: chatId,
  }).returning();

  if (chatId) {
    await db.update(chats).set({ workspaceId: workspace.id, updatedAt: new Date() }).where(eq(chats.id, chatId));
    await syncExistingArtifactsToWorkspace(chatId, workspace.id);
  }

  return Response.json({ workspace });
}
