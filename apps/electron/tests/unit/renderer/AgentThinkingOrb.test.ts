import { describe, expect, it } from "vitest";
import { orbStateForActivities } from "../../../src/renderer/src/chat/AgentThinkingOrb";

describe("orbStateForActivities", () => {
  it("uses working before a tool starts", () => {
    expect(orbStateForActivities([])).toBe("working");
  });

  it("maps active tools to meaningful Orbs states", () => {
    expect(orbStateForActivities([{ id: "web", tool: "web_search", title: "Search", status: "running" }])).toBe("searching");
    expect(orbStateForActivities([{ id: "edit", tool: "artifact_edit", title: "Edit", status: "running" }])).toBe("shaping");
    expect(orbStateForActivities([{ id: "shell", tool: "shell", title: "Run", status: "running" }])).toBe("solving");
    expect(orbStateForActivities([{ id: "app", tool: "gmail", title: "Mail", status: "running" }])).toBe("connecting");
  });

  it("prefers the running activity over a later completed one", () => {
    expect(orbStateForActivities([
      { id: "web", tool: "web_search", title: "Search", status: "running" },
      { id: "edit", tool: "edit", title: "Edit", status: "complete" },
    ])).toBe("searching");
  });
});
