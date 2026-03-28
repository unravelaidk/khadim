import { and, eq } from "drizzle-orm";
import { db, artifacts, chats, workspaceFiles } from "./db";

export async function getWorkspaceIdForChat(chatId: string): Promise<string | null> {
  const [chat] = await db.select({ workspaceId: chats.workspaceId }).from(chats).where(eq(chats.id, chatId)).limit(1);
  return chat?.workspaceId ?? null;
}

export async function upsertWorkspaceFile(
  workspaceId: string,
  path: string,
  content: string,
  options?: { mimeType?: string | null; size?: number | null }
): Promise<void> {
  await db.delete(workspaceFiles).where(and(eq(workspaceFiles.workspaceId, workspaceId), eq(workspaceFiles.path, path)));
  await db.insert(workspaceFiles).values({
    workspaceId,
    path,
    content,
    size: options?.size ?? content.length,
    mimeType: options?.mimeType ?? null,
    updatedAt: new Date(),
  });
}

export async function syncWorkspaceFileForChat(chatId: string, path: string, content: string): Promise<void> {
  const workspaceId = await getWorkspaceIdForChat(chatId);
  if (!workspaceId) return;
  await upsertWorkspaceFile(workspaceId, path, content);
}

export async function syncExistingArtifactsToWorkspace(chatId: string, workspaceId: string): Promise<void> {
  const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));
  for (const artifact of chatArtifacts) {
    await upsertWorkspaceFile(workspaceId, artifact.filename, artifact.content);
  }
}
