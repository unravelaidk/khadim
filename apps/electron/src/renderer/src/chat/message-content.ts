import type { ChatAttachment } from "../../../shared/types";
import type { RecommendationData, RecommendationOption, RecommendationTone } from "./RecommendationCard";

const recommendationTones = new Set<RecommendationTone>(["success", "warning", "neutral"]);

export function extractRecommendation(content: string): RecommendationData | null {
  const match = content.match(/<recommendation>\s*([\s\S]*?)\s*<\/recommendation>/i);
  if (!match?.[1] || match[1].length > 24_000) return null;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 || !Array.isArray(value.options) || value.options.length === 0 || value.options.length > 3) return null;
    const options = value.options.map((candidate, index): RecommendationOption | null => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const option = candidate as Record<string, unknown>;
      if (typeof option.body !== "string" || !option.body.trim() || option.body.length > 1_200) return null;
      const short = typeof option.short === "string" && option.short.trim() ? option.short : option.body;
      const label = typeof option.label === "string" && option.label.trim() ? option.label : "Recommendation";
      const action = typeof option.action === "string" && option.action.trim() ? option.action : "Accept";
      const signal = typeof option.signal === "number" && Number.isFinite(option.signal) ? Math.min(3, Math.max(0, Math.round(option.signal))) : 0;
      const tone = typeof option.tone === "string" && recommendationTones.has(option.tone as RecommendationTone) ? option.tone as RecommendationTone : "neutral";
      if (short.length > 240 || label.length > 80 || action.length > 40) return null;
      return { id: typeof option.id === "string" && option.id.trim() ? option.id : `option-${index + 1}`, body: option.body, short, signal, tone, label, action };
    });
    if (options.some((option) => option === null)) return null;
    return { title: value.title.trim(), options: options as RecommendationOption[] };
  } catch {
    return null;
  }
}

export function messageCopyWithoutRecommendation(content: string): string {
  return content
    .replace(/<recommendation>[\s\S]*?<\/recommendation>/gi, "")
    .replace(/<recommendation>[\s\S]*$/i, "")
    .trim();
}

export function extractHtml(content: string): string | null {
  const safeContent = messageCopyWithoutRecommendation(messageCopyWithoutStudioEdit(content));
  const fenced = safeContent.match(/```html\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const document = safeContent.match(/(<!doctype html>[\s\S]*<\/html>)/i);
  return document?.[1]?.trim() ?? null;
}

export function messageCopyWithoutArtifactSource(content: string): string {
  const withoutFence = content.replace(/```html\s*[\s\S]*?```/i, "").trim();
  if (withoutFence !== content.trim()) return withoutFence;
  return content.replace(/<!doctype html>[\s\S]*<\/html>/i, "").trim();
}

export function messageCopyWithoutStudioEdit(content: string): string {
  return content
    .replace(/<artifact(?:-|_)read\b[^>]*>[\s\S]*?<\/artifact(?:-|_)read>/gi, "")
    .replace(/<artifact(?:-|_)edit\b[^>]*>[\s\S]*?<\/artifact(?:-|_)edit>/gi, "")
    .replace(/<artifact(?:-|_)read\b[^>]*>[\s\S]*$/i, "")
    .replace(/<artifact(?:-|_)edit\b[^>]*>[\s\S]*$/i, "")
    .trim();
}

export function legacyFileAttachments(content: string): { content: string; attachments: ChatAttachment[] } {
  const attachments = Array.from(content.matchAll(/<file name="([^"]+)">[\s\S]*?<\/file>/g), (match) => ({ name: match[1], type: "" }));
  if (attachments.length === 0) return { content, attachments };
  return { content: content.replace(/<file name="[^"]+">[\s\S]*?<\/file>/g, "").trim(), attachments };
}
