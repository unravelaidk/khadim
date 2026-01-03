import type { ActionFunctionArgs } from "react-router";
import { db, messages, chats } from "../lib/db";
import { eq } from "drizzle-orm";

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

  const [message] = await db.insert(messages).values({
    chatId,
    role,
    content,
    previewUrl,
    thinkingSteps,
  }).returning();

  // Update chat's updatedAt
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

  return Response.json({ message });
}
