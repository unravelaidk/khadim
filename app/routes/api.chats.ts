import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { db, chats } from "../lib/db";
import { desc, eq } from "drizzle-orm";

// GET /api/chats - List all chats
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const allChats = workspaceId
    ? await db.select().from(chats).where(eq(chats.workspaceId, workspaceId)).orderBy(desc(chats.updatedAt))
    : await db.select().from(chats).orderBy(desc(chats.updatedAt));

  return Response.json({ chats: allChats });
}

// POST /api/chats - Create new chat
// DELETE /api/chats - Delete chat (with id in body)
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    const formData = await request.formData();
    const title = formData.get("title")?.toString() || "New Chat";
    const workspaceId = formData.get("workspaceId")?.toString() || null;

    const [chat] = await db.insert(chats).values({ title, workspaceId }).returning();
    return Response.json({ chat });
  }

  if (request.method === "DELETE") {
    const formData = await request.formData();
    const chatId = formData.get("chatId")?.toString();

    if (!chatId) {
      return Response.json({ error: "chatId is required" }, { status: 400 });
    }

    await db.delete(chats).where(eq(chats.id, chatId));
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
