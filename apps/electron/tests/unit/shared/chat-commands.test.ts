import { describe, expect, it } from "vitest";
import { chatCommands, parseChatCommand } from "../../../src/shared/chat-commands";

describe("chat commands", () => {
  it("keeps parity with the CLI slash command registry", () => {
    expect(chatCommands).toHaveLength(26);
    expect(chatCommands.map((command) => command.name)).toContain("model");
    expect(chatCommands.map((command) => command.name)).toContain("new");
  });

  it("parses command arguments without treating ordinary prompts as commands", () => {
    expect(parseChatCommand("/model Claude Sonnet")).toEqual({ name: "model", argument: "Claude Sonnet" });
    expect(parseChatCommand("hello /model")).toBeNull();
    expect(parseChatCommand("/unknown")).toBeNull();
  });
});
