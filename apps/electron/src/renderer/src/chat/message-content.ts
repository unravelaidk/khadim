import type { ChatAttachment } from "../../../shared/types";

export function extractHtml(content: string): string | null {
  const fenced = content.match(/```html\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const document = content.match(/(<!doctype html>[\s\S]*<\/html>)/i);
  return document?.[1]?.trim() ?? null;
}

export function messageCopyWithoutArtifactSource(content: string): string {
  const withoutFence = content.replace(/```html\s*[\s\S]*?```/i, "").trim();
  if (withoutFence !== content.trim()) return withoutFence;
  return content.replace(/<!doctype html>[\s\S]*<\/html>/i, "").trim();
}

export function messageCopyWithoutStudioEdit(content: string): string {
  return content
    .replace(/<artifact-edit>[\s\S]*?<\/artifact-edit>/gi, "")
    .replace(/<artifact-edit>[\s\S]*$/i, "")
    .trim();
}

export function legacyFileAttachments(content: string): { content: string; attachments: ChatAttachment[] } {
  const attachments = Array.from(content.matchAll(/<file name="([^"]+)">[\s\S]*?<\/file>/g), (match) => ({ name: match[1], type: "" }));
  if (attachments.length === 0) return { content, attachments };
  return { content: content.replace(/<file name="[^"]+">[\s\S]*?<\/file>/g, "").trim(), attachments };
}
