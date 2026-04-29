import type { Message } from "../../types/chat";

const SLIDE_DATA_SCRIPT_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>/i;

export type TimelineRow =
  | { id: string; kind: "message"; message: Message }
  | { id: string; kind: "work"; messages: Message[] };

function hasSlideContent(message: Message): boolean {
  return Boolean(message.fileContent && SLIDE_DATA_SCRIPT_RE.test(message.fileContent));
}

function hasPreviewArtifact(message: Message): boolean {
  return Boolean(message.previewUrl);
}

function hasRenderableMessageContent(message: Message): boolean {
  if (message.role === "user") {
    return true;
  }

  const hasSlides = hasSlideContent(message);
  const hasPreview = hasPreviewArtifact(message);
  const hasText = message.content.trim().length > 0;
  return hasText || (hasPreview && !hasSlides);
}

export function deriveTimelineRows(messages: Message[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let pendingWorkMessages: Message[] = [];

  const flushPendingWork = () => {
    if (pendingWorkMessages.length === 0) {
      return;
    }

    rows.push({
      id: pendingWorkMessages.map((message) => message.id).join(":"),
      kind: "work",
      messages: pendingWorkMessages,
    });
    pendingWorkMessages = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushPendingWork();
      rows.push({ id: `${message.id}:message`, kind: "message", message });
      continue;
    }

    if ((message.thinkingSteps || []).length > 0) {
      pendingWorkMessages.push(message);
    }

    if (hasRenderableMessageContent(message)) {
      flushPendingWork();
      rows.push({ id: `${message.id}:message`, kind: "message", message });
    }
  }

  flushPendingWork();

  return rows;
}
