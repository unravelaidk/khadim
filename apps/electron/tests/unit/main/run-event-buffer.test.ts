import { describe, expect, it } from "vitest";
import type { AgentRunIdentity, AgentStreamEvent } from "../../../src/shared/types";
import { RunEventBuffer } from "../../../src/main/run-event-buffer";

const identity: AgentRunIdentity = {
  runId: "run-1",
  projectId: "project-1",
  conversationId: "conversation-1",
  assistantMessageId: "assistant-1",
  engineSessionKey: "session-1",
};

function event(content: string): AgentStreamEvent {
  return { event_type: "text_delta", content };
}

describe("RunEventBuffer", () => {
  it("returns a live run's events in append order", () => {
    const buffer = new RunEventBuffer();
    buffer.register(identity);
    buffer.append(identity.runId, event("first"));
    buffer.append(identity.runId, event("second"));

    expect(buffer.listRecoverable()).toEqual([{
      ...identity,
      events: [
        { sequence: 1, event: event("first") },
        { sequence: 2, event: event("second") },
      ],
      terminal: false,
      droppedEventCount: 0,
      nextSequence: 3,
    }]);
  });

  it("bounds each run while preserving the order of the newest events", () => {
    const buffer = new RunEventBuffer({ maxEventsPerRun: 2 });
    buffer.register(identity);
    buffer.append(identity.runId, event("first"));
    buffer.append(identity.runId, event("second"));
    buffer.append(identity.runId, event("third"));

    expect(buffer.listRecoverable()[0]).toMatchObject({
      events: [
        { sequence: 2, event: event("second") },
        { sequence: 3, event: event("third") },
      ],
      droppedEventCount: 1,
      nextSequence: 4,
    });
  });

  it("bounds recovery data by bytes as well as event count", () => {
    const buffer = new RunEventBuffer({ maxEventsPerRun: 20, maxBytesPerRun: 600, maxBytesPerEvent: 300 });
    buffer.register(identity);
    buffer.append(identity.runId, event("a".repeat(220)));
    buffer.append(identity.runId, event("b".repeat(220)));
    buffer.append(identity.runId, event("c".repeat(220)));

    const recovered = buffer.listRecoverable()[0]!;
    expect(recovered.events.at(-1)?.event.content).toBe("c".repeat(220));
    expect(recovered.droppedEventCount).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(recovered.events), "utf8")).toBeLessThan(700);
  });

  it("keeps an oversized terminal event typed while truncating its recovery payload", () => {
    const buffer = new RunEventBuffer({ maxBytesPerRun: 512, maxBytesPerEvent: 256 });
    buffer.register(identity);
    buffer.append(identity.runId, {
      event_type: "error",
      content: "failure ".repeat(1_000),
      metadata: { reason: "aborted", result: "x".repeat(5_000) },
    });
    buffer.markTerminal(identity.runId);

    expect(buffer.listRecoverable()[0]).toMatchObject({
      terminal: true,
      events: [{
        event: {
          event_type: "error",
          metadata: { buffer_truncated: true, reason: "aborted" },
        },
      }],
    });
  });

  it("hard-bounds hostile fallback fields and exposes a non-cloning presence check", () => {
    const buffer = new RunEventBuffer({ maxBytesPerRun: 256, maxBytesPerEvent: 128 });
    buffer.register(identity);
    buffer.append(identity.runId, {
      event_type: "unknown".repeat(10_000),
      content: "🧪".repeat(10_000),
      metadata: { reason: "secret".repeat(10_000) },
    });

    const recovered = buffer.listRecoverable()[0]!;
    expect(Buffer.byteLength(JSON.stringify(recovered.events[0]?.event), "utf8")).toBeLessThanOrEqual(128);
    expect(recovered.events[0]?.event).toMatchObject({ event_type: "buffer_truncated", metadata: { buffer_truncated: true } });
    expect(recovered.terminal).toBe(false);
    expect(buffer.hasAny(new Set([identity.runId]))).toBe(true);
    expect(buffer.hasAny(new Set(["another-run"]))).toBe(false);
  });

  it("keeps active and terminal runs recoverable until a terminal run is acknowledged", () => {
    const buffer = new RunEventBuffer();
    buffer.register(identity);

    expect(buffer.acknowledge(identity.runId)).toBe(false);
    expect(buffer.listRecoverable()).toHaveLength(1);

    buffer.append(identity.runId, { event_type: "done", content: "Finished." });
    buffer.markTerminal(identity.runId);

    expect(buffer.listRecoverable()[0]?.terminal).toBe(true);
    expect(buffer.acknowledge(identity.runId)).toBe(true);
    expect(buffer.listRecoverable()).toEqual([]);
  });
});
