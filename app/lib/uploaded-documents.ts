import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { LiteParse } from "@llamaindex/liteparse";
import { db, chats, uploadedDocuments } from "./db";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "upload";
}

function isPdfDocument(filename: string, mimeType: string | null): boolean {
  return mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

function isTextDocument(filename: string, mimeType: string | null): boolean {
  const lower = filename.toLowerCase();
  return (
    mimeType?.startsWith("text/") === true ||
    mimeType === "application/json" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".csv")
  );
}

async function parseDocumentContent(buffer: Buffer, filename: string, mimeType: string | null) {
  if (isPdfDocument(filename, mimeType)) {
    const parser = new LiteParse({ outputFormat: "text" });
    const result = await parser.parse(buffer, true);
    return {
      extractedText: result.text || "",
      pageCount: result.pages?.length ?? null,
    };
  }

  if (isTextDocument(filename, mimeType)) {
    return {
      extractedText: buffer.toString("utf8"),
      pageCount: null,
    };
  }

  return {
    extractedText: null,
    pageCount: null,
  };
}

export async function storeUploadedDocument({
  file,
  chatId,
  workspaceId,
}: {
  file: File;
  chatId?: string | null;
  workspaceId?: string | null;
}) {
  if (!chatId && !workspaceId) {
    throw new Error("chatId or workspaceId is required for uploaded documents.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded document exceeds the 20MB limit.");
  }

  const id = createId();
  const safeName = sanitizeFilename(file.name || "upload");
  const scopeDir = workspaceId ? `workspace-${workspaceId}` : `chat-${chatId}`;
  const relativePath = path.join(scopeDir, `${id}-${safeName}`);
  const absolutePath = path.join(UPLOAD_ROOT, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  let parseStatus = "ready";
  let extractedText: string | null = null;
  let pageCount: number | null = null;
  let error: string | null = null;

  try {
    const parsed = await parseDocumentContent(buffer, safeName, file.type || null);
    extractedText = parsed.extractedText;
    pageCount = parsed.pageCount;
  } catch (parseError) {
    parseStatus = "error";
    error = parseError instanceof Error ? parseError.message : String(parseError);
  }

  const [document] = await db
    .insert(uploadedDocuments)
    .values({
      id,
      chatId: chatId ?? null,
      workspaceId: workspaceId ?? null,
      filename: safeName,
      mimeType: file.type || null,
      size: buffer.byteLength,
      storagePath: relativePath,
      parseStatus,
      extractedText,
      pageCount,
      error,
      updatedAt: new Date(),
    })
    .returning();

  return document;
}

export async function getChatWorkspaceId(chatId: string): Promise<string | null> {
  const [chat] = await db.select({ workspaceId: chats.workspaceId }).from(chats).where(eq(chats.id, chatId)).limit(1);
  return chat?.workspaceId ?? null;
}

export async function getAccessibleUploadedDocument(chatId: string, documentId: string) {
  const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId)).limit(1);
  if (!document) return null;
  if (document.chatId === chatId) return document;

  const workspaceId = await getChatWorkspaceId(chatId);
  if (workspaceId && document.workspaceId === workspaceId) return document;
  return null;
}

export async function resolveUploadedDocumentPath(storagePath: string): Promise<string> {
  return path.join(UPLOAD_ROOT, storagePath);
}

export async function readUploadedDocumentForAgent({
  chatId,
  documentId,
  targetPages,
  maxChars = 12000,
}: {
  chatId: string;
  documentId: string;
  targetPages?: string;
  maxChars?: number;
}) {
  const document = await getAccessibleUploadedDocument(chatId, documentId);
  if (!document) {
    throw new Error("Uploaded document not found for this chat.");
  }

  let text = document.extractedText || "";
  let pageCount = document.pageCount ?? 0;

  if (targetPages) {
    const absolutePath = await resolveUploadedDocumentPath(document.storagePath);
    const buffer = await fs.readFile(absolutePath);
    const parser = new LiteParse({ outputFormat: "text", targetPages });
    const result = await parser.parse(buffer, true);
    text = result.text || "";
    pageCount = result.pages?.length ?? pageCount;
  }

  const truncated = text.length > maxChars;
  const renderedText = truncated ? text.slice(0, maxChars) : text;
  return {
    document,
    output: `📄 UPLOADED DOCUMENT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nID: ${document.id}\nFilename: ${document.filename}\nStatus: ${document.parseStatus}\nPages: ${pageCount}\nCharacters: ${text.length}${truncated ? ` (truncated to ${maxChars})` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${renderedText}`,
  };
}

export async function buildUploadedDocumentsContext(chatId: string, documentIds: string[]): Promise<string> {
  const lines: string[] = [];

  for (const documentId of documentIds) {
    const document = await getAccessibleUploadedDocument(chatId, documentId);
    if (!document) continue;
    lines.push(
      `- ${document.id}: ${document.filename} (${document.mimeType || "unknown"}${document.pageCount ? `, ${document.pageCount} pages` : ""}, status: ${document.parseStatus})`
    );
  }

  if (lines.length === 0) return "";

  return `ATTACHED DOCUMENTS FOR THIS REQUEST:\n${lines.join("\n")}\nUse read_uploaded_document with a document ID when you need the contents.`;
}
