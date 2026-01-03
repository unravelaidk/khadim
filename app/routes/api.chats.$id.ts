import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { db, chats, messages, artifacts } from "../lib/db";
import { eq, asc } from "drizzle-orm";

// GET /api/chats/:id - Get chat with messages
export async function loader({ params }: LoaderFunctionArgs) {
  const chatId = params.id;

  if (!chatId) {
    return Response.json({ error: "Chat ID required" }, { status: 400 });
  }

  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));

  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));

  const chatArtifacts = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.chatId, chatId));

  return Response.json({ chat: { ...chat, messages: chatMessages, artifacts: chatArtifacts } });
}

// PATCH /api/chats/:id - Update chat (title, sandboxId)
export async function action({ request, params }: ActionFunctionArgs) {
  const chatId = params.id;

  if (!chatId) {
    return Response.json({ error: "Chat ID required" }, { status: 400 });
  }

  if (request.method === "PATCH") {
    const formData = await request.formData();
    const title = formData.get("title")?.toString();
    const sandboxId = formData.get("sandboxId")?.toString();

    const data: { title?: string; sandboxId?: string; updatedAt?: Date } = { updatedAt: new Date() };
    if (title) data.title = title;
    if (sandboxId) data.sandboxId = sandboxId;

    const [chat] = await db.update(chats).set(data).where(eq(chats.id, chatId)).returning();
    return Response.json({ chat });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
