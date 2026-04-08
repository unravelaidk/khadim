import type { LoaderFunctionArgs } from "react-router";
import { db, artifacts } from "../lib/db";
import { eq } from "drizzle-orm";

export async function loader({ params }: LoaderFunctionArgs) {
  const artifactId = params.id;

  if (!artifactId) {
    return new Response("Artifact ID required", { status: 400 });
  }

  const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artifactId));

  if (!artifact) {
    return new Response("Artifact not found", { status: 404 });
  }

  const filename = artifact.filename;
  const content = artifact.content;

  // Determine Content-Type based on extension
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt';
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip': 'application/zip',
    'txt': 'text/plain',
    'md': 'text/markdown',
  };
  const startAsBinary = content.startsWith("base64:");
  const contentType = mimeTypes[ext] || (startAsBinary ? 'application/octet-stream' : 'text/plain');

  let body: BodyInit;
  if (startAsBinary) {
    const base64Data = content.slice(7); // remove "base64:"
    const buffer = Buffer.from(base64Data, 'base64');
    body = buffer;
  } else {
    body = content;
  }

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
