import type { ActionFunctionArgs } from "react-router";
import { db, chats } from "../lib/db";
import { eq } from "drizzle-orm";
import { storeUploadedDocument } from "../lib/uploaded-documents";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const fileValue = formData.get("file");
  const chatId = formData.get("chatId")?.toString() || null;
  let workspaceId = formData.get("workspaceId")?.toString() || null;

  if (!(fileValue instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  if (!chatId && !workspaceId) {
    return Response.json({ error: "chatId or workspaceId is required" }, { status: 400 });
  }

  if (chatId && !workspaceId) {
    const [chat] = await db.select({ workspaceId: chats.workspaceId }).from(chats).where(eq(chats.id, chatId)).limit(1);
    workspaceId = chat?.workspaceId ?? null;
  }

  try {
    const document = await storeUploadedDocument({
      file: fileValue,
      chatId,
      workspaceId,
    });

    return Response.json({
      document: {
        id: document.id,
        filename: document.filename,
        mimeType: document.mimeType,
        size: document.size,
        pageCount: document.pageCount,
        parseStatus: document.parseStatus,
        workspaceId: document.workspaceId,
        chatId: document.chatId,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to upload document" },
      { status: 400 },
    );
  }
}
