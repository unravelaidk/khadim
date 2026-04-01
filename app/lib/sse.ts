let eventId = 0;

export interface SseEventFormatter {
  formatEvent: typeof formatSseEvent;
  resetEventId: () => void;
  getNextEventId: () => number;
}

export function resetEventId(): void {
  eventId = 0;
}

export function getNextEventId(): number {
  return ++eventId;
}

export function createSseEventFormatter(): SseEventFormatter {
  let localEventId = 0;

  const getNextLocalEventId = () => ++localEventId;

  return {
    formatEvent(type, data, options = {}) {
      const id = options.withId !== false ? getNextLocalEventId() : undefined;
      const eventType = options.eventType || type;

      let message = "";

      if (eventType) {
        message += `event: ${eventType}\n`;
      }

      if (id !== undefined) {
        message += `id: ${id}\n`;
      }

      message += `data: ${JSON.stringify({ type, ...data })}\n\n`;

      return message;
    },
    resetEventId() {
      localEventId = 0;
    },
    getNextEventId: getNextLocalEventId,
  };
}

export function formatSseEvent(
  type: string,
  data: Record<string, unknown>,
  options: { withId?: boolean; eventType?: string } = {}
): string {
  const id = options.withId !== false ? getNextEventId() : undefined;
  const eventType = options.eventType || type;

  let message = "";

  if (eventType) {
    message += `event: ${eventType}\n`;
  }

  if (id !== undefined) {
    message += `id: ${id}\n`;
  }

  message += `data: ${JSON.stringify({ type, ...data })}\n\n`;

  return message;
}

export function formatSseComment(comment: string): string {
  return `: ${comment.replace(/\n/g, " ")}\n\n`;
}

export function getSseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export interface SSEDisconnectInfo {
  url: string;
  lastEventId: number;
  timestamp: number;
}
