import { describe, expect, it } from "vitest";
import { jobMessageSchema, jobStartSchema } from "../../../app/lib/agent-rpc-schemas";

describe("Agent RPC Hono validation", () => {
  it("preserves idempotency and exact-turn fields for start", () => {
    const input = {
      prompt: "Run it",
      requestId: "request-one",
      currentTurnId: "turn-one",
      currentTurnPersisted: true,
    };
    expect(jobStartSchema.parse(input)).toEqual(input);
  });

  it("preserves idempotency and exact-turn fields for follow-up", () => {
    const input = {
      prompt: "Continue",
      requestId: "request-two",
      currentTurnId: "turn-two",
      currentTurnPersisted: true,
    };
    expect(jobMessageSchema.parse(input)).toEqual(input);
  });
});
