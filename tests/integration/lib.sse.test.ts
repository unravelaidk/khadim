import { describe, it, expect } from "vitest";
import { formatSseEvent } from "../../app/lib/sse";

describe("formatSseEvent", () => {
  it("serializes SSE payloads", () => {
    const payload = formatSseEvent("done", { content: "ok", count: 2 });
    expect(payload).toBe('data: {"type":"done","content":"ok","count":2}\n\n');
  });
});
