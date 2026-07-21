import type { ActionFunctionArgs } from "react-router";
import { db, messages, chats } from "../lib/db";
import { and, eq } from "drizzle-orm";

// POST /api/messages - Create message
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const chatId = formData.get("chatId")?.toString();
  const role = formData.get("role")?.toString() as "user" | "assistant";
  const content = formData.get("content")?.toString() || "";
  const previewUrl = formData.get("previewUrl")?.toString();
  const thinkingStepsJson = formData.get("thinkingSteps")?.toString();
  const requestedId = formData.get("id")?.toString();

  if (!chatId || !role) {
    return Response.json({ error: "chatId and role are required" }, { status: 400 });
  }

  let thinkingSteps = null;
  if (thinkingStepsJson) {
    try {
      thinkingSteps = JSON.parse(thinkingStepsJson);
    } catch {
      // Invalid JSON, ignore
    }
  }

  if (requestedId && requestedId.length > 128) {
    return Response.json({ error: "id is too long" }, { status: 400 });
  }

  const [inserted] = await db.insert(messages).values({
    ...(requestedId ? { id: requestedId } : {}),
    chatId,
    role,
    content,
    previewUrl,
    thinkingSteps,
  }).onConflictDoNothing({ target: messages.id }).returning();

  const message = inserted ?? (requestedId
    ? await db.query.messages.findFirst({ where: and(eq(messages.id, requestedId), eq(messages.chatId, chatId)) })
    : undefined);
  if (!message || message.role !== role || message.content !== content) {
    return Response.json({ error: "Message id is already used by another turn" }, { status: 409 });
  }

  // Update chat's updatedAt
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

  return Response.json({ message });
}
