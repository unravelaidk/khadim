import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { asc, desc, eq } from "drizzle-orm";
import { db, chats, workspaceFiles, workspaces } from "../lib/db";
import { getJobsByChatId } from "../lib/job-manager";
import { getAgentProfile } from "../lib/agent-profiles";

export async function loader({ params }: LoaderFunctionArgs) {
  const workspaceId = params.id;
  if (!workspaceId) {
    return Response.json({ error: "Workspace ID required" }, { status: 400 });
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const workspaceChats = await db.select().from(chats).where(eq(chats.workspaceId, workspaceId)).orderBy(desc(chats.updatedAt));
  const files = await db.select().from(workspaceFiles).where(eq(workspaceFiles.workspaceId, workspaceId)).orderBy(asc(workspaceFiles.path));

  const chatsWithActivity = await Promise.all(
    workspaceChats.map(async (chat) => {
      const activeJobs = await getJobsByChatId(chat.id);
      return {
        ...chat,
        isActive: activeJobs.length > 0,
        activeAgentId: workspace.agentId,
      };
    })
  );

  const activeChats = chatsWithActivity.filter((chat) => chat.isActive);
  const activeAgents = activeChats.length > 0
    ? [getAgentProfile(workspace.agentId)].filter(Boolean).map((agent) => ({
        id: agent!.id,
        name: agent!.name,
        activeChatCount: activeChats.length,
      }))
    : [];

  return Response.json({ workspace, chats: chatsWithActivity, files, activeChats, activeAgents });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const workspaceId = params.id;
  if (!workspaceId) {
    return Response.json({ error: "Workspace ID required" }, { status: 400 });
  }

  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const name = formData.get("name")?.toString();
  const agentId = formData.get("agentId")?.toString();

  const [workspace] = await db
    .update(workspaces)
    .set({
      ...(name ? { name } : {}),
      ...(agentId ? { agentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId))
    .returning();

  return Response.json({ workspace });
}
