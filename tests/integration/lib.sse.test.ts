import { describe, it, expect, beforeEach } from "vitest";
import { formatSseEvent, resetEventId, getNextEventId } from "../../app/lib/sse";

describe("formatSseEvent", () => {
  beforeEach(() => {
    resetEventId();
  });

  it("serializes SSE payloads with event and id fields", () => {
    const payload = formatSseEvent("done", { content: "ok", count: 2 });
    expect(payload).toBe('event: done\nid: 1\ndata: {"type":"done","content":"ok","count":2}\n\n');
  });

  it("increments event id", () => {
    expect(getNextEventId()).toBe(1);
    expect(getNextEventId()).toBe(2);
    resetEventId();
    expect(getNextEventId()).toBe(1);
  });

  it("supports custom event type", () => {
    const payload = formatSseEvent("done", { content: "ok" }, { eventType: "custom" });
    expect(payload).toBe('event: custom\nid: 1\ndata: {"type":"done","content":"ok"}\n\n');
  });

  it("can skip id field", () => {
    const payload = formatSseEvent("done", { content: "ok" }, { withId: false });
    expect(payload).toBe('event: done\ndata: {"type":"done","content":"ok"}\n\n');
  });
});
