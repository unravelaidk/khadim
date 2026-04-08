import { describe, expect, it } from "vitest";
import { deriveTimelineRows } from "../../app/components/agent-builder/timeline";
import type { Message } from "../../app/types/chat";

function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-04-02T00:00:00.000Z"),
    thinkingSteps: [],
    ...overrides,
  };
}

describe("agent timeline", () => {
  it("separates assistant work from final text without rendering inline slide rows", () => {
    const rows = deriveTimelineRows([
      createAssistantMessage({
        content: "Created a presentation draft.",
        thinkingSteps: [{ id: "step-1", title: "write_slides", status: "complete", tool: "write_slides" }],
        fileContent: '<script id="slide-data">[{"id":1,"type":"title","title":"Cars"}]</script>',
      }),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["work", "message"]);
  });

  it("groups consecutive work-only assistant updates into one row", () => {
    const rows = deriveTimelineRows([
      createAssistantMessage({
        id: "assistant-1",
        thinkingSteps: [{ id: "step-1", title: "search_images", status: "complete", tool: "search_images" }],
      }),
      createAssistantMessage({
        id: "assistant-2",
        thinkingSteps: [{ id: "step-2", title: "write_slides", status: "running", tool: "write_slides" }],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("work");
    if (rows[0]?.kind === "work") {
      expect(rows[0].messages.map((message) => message.id)).toEqual(["assistant-1", "assistant-2"]);
    }
  });

  it("keeps user messages as plain message rows", () => {
    const rows = deriveTimelineRows([
      {
        id: "user-1",
        role: "user",
        content: "Make me slides about cars",
        timestamp: new Date("2026-04-02T00:00:00.000Z"),
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "message" });
  });

  it("does not create any inline row for slide-only output", () => {
    const rows = deriveTimelineRows([
      createAssistantMessage({
        fileContent: '<script id="slide-data">[{"id":1,"type":"title","title":"Cars"}]</script>',
      }),
    ]);

    expect(rows).toEqual([]);
  });
});
