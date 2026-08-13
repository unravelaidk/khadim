import { describe, expect, it } from "vitest";
import { createArtifact } from "../../../src/renderer/src/artifact-model";
import { applyStudioArtifactEdit, enforceCanvasSelectionBinding, parseStudioArtifactEdit, studioAgentPrompt } from "../../../src/renderer/src/studio/studio-agent-edit";
import type { CanvasArtifactContent } from "../../../src/shared/types";

describe("studio agent edits", () => {
  it("applies file and visual changes without allowing artifact identity changes", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit(`<artifact-edit>{
      "id": "artifact-hostile",
      "projectId": "project-hostile",
      "title": "A clearer landing page",
      "files": { "/src/styles.css": ".page-shell { padding: 3rem; }" },
      "visual": { "root": { "props": {} }, "content": [{ "type": "Heading", "props": { "id": "heading", "text": "A better heading" } }] }
    }</artifact-edit>`);

    expect(edit).not.toBeNull();
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");
    expect(updated.id).toBe("artifact-a");
    expect(updated.projectId).toBe("project-a");
    expect(updated.title).toBe("A clearer landing page");
    expect(updated.content.format).toBe("web-project");
    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.files["/src/styles.css"]).toContain("padding: 3rem");
    expect(updated.content.files["/src/StudioPage.jsx"]).toContain("A better heading");
    expect(updated.lifecycle).toBe("draft");
  });

  it("rejects malformed, unsafe, and oversized edit payloads", () => {
    expect(parseStudioArtifactEdit("Here is some JSON: {}" )).toBeNull();
    expect(parseStudioArtifactEdit('<artifact-edit>{"files":{"relative.jsx":"no"}}</artifact-edit>')).toBeNull();
    expect(parseStudioArtifactEdit(`<artifact-edit>{"files":{"/big.txt":"${"a".repeat(600_000)}"}}</artifact-edit>`)).toBeNull();
  });

  it("builds a bounded prompt that binds edits to the selected artifact tools", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const prompt = studioAgentPrompt(artifact, "Make the hero work better on mobile");
    expect(prompt).toContain("Make the hero work better on mobile");
    expect(prompt).toContain("artifact-a");
    expect(prompt).toContain("artifact_read");
    expect(prompt).toContain("artifact_edit");
    expect(prompt).toContain("Do not create a new artifact");
    expect(prompt).not.toContain("/absolute/artifact/path");
    expect(prompt).toContain("Do not call project file read, write, or edit tools");
    expect(prompt.length).toBeLessThan(10_000);
  });

  it("patches one selected Puck component without replacing the other blocks", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit('<artifact-edit>{"componentPatches":[{"id":"starter-heading","props":{"text":"A shorter headline"}}]}</artifact-edit>');
    expect(edit).not.toBeNull();
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");
    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.visual?.data.content).toHaveLength(2);
    expect(updated.content.previewHtml).toContain("A shorter headline");
    expect(updated.content.previewHtml).toContain("Created in Khadim Studio");
    expect(updated.content.previewHtml).toContain("site-navigation");
  });

  it("patches a component nested inside visual layout slots", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit('<artifact-edit>{"componentPatches":[{"id":"starter-heading","props":{"text":"Nested headline"}}]}</artifact-edit>');
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");

    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.files["/src/StudioPage.jsx"]).toContain("Nested headline");
    expect(updated.content.previewHtml).toContain("Nested headline");
    expect(updated.content.previewHtml).toContain("site-navigation");
  });

  it("includes and applies complete HTML document revisions", () => {
    const artifact = createArtifact("document", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const prompt = studioAgentPrompt(artifact, "Turn this into a concise field report");
    expect(prompt).toContain("artifact_read");
    expect(prompt).toContain("artifact-a");

    const edit = parseStudioArtifactEdit('<artifact-edit>{"title":"Field report","html":"<!doctype html><html><body><h1>Field report</h1></body></html>"}</artifact-edit>');
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");

    expect(updated.title).toBe("Field report");
    expect(updated.content).toMatchObject({
      format: "document-html",
      html: expect.stringContaining("<h1>Field report</h1>"),
      baselineHtml: expect.stringContaining("same HTML drives"),
    });
  });

  describe("canvasCommands", () => {
    function canvasArtifact(): ReturnType<typeof createArtifact> {
      const artifact = createArtifact("canvas", "project-a", "canvas-a", "2026-01-01T00:00:00.000Z");
      if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas");
      artifact.content = {
        ...artifact.content,
        activePageId: "page-1",
        pages: [
          { id: "page-1", name: "Page 1", frame: { width: 800, height: 600 }, elements: [
            { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
            { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
          ], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
        ],
        elements: [
          { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
          { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
        ],
      } as CanvasArtifactContent;
      return artifact;
    }

    it("parses and applies a bounded canvasCommands group to a khadim-canvas artifact", () => {
      const artifact = canvasArtifact();
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a","b"],"commands":[{"type":"patch-elements","elementIds":["a","b"],"patch":{"x":40}}]}}</artifact-edit>`);
      expect(edit).not.toBeNull();
      expect(edit?.canvasCommands).toBeDefined();
      const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");
      if (updated.content.format !== "khadim-canvas") throw new Error("Expected canvas");
      expect(updated.content.elements.find((e) => e.id === "a")?.x).toBe(40);
      expect(updated.content.elements.find((e) => e.id === "b")?.x).toBe(40);
    });

    it("rejects canvasCommands for a non-canvas artifact", () => {
      const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`);
      expect(edit).not.toBeNull();
      expect(() => applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z")).toThrowError();
    });

    it("rejects malformed canvasCommands payloads", () => {
      expect(parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"","selectionIds":["a"],"commands":[]}}</artifact-edit>`)).toBeNull();
      // Empty selectionIds is now accepted by the parser for additive runs, but
      // a non-additive command (patch-elements) under an empty selection is a
      // policy violation, not a parser error. The policy layer rejects it.
      const parsed = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":[],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`);
      expect(parsed).not.toBeNull();
      expect(enforceCanvasSelectionBinding(parsed!, undefined)).toBeNull();
      expect(parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a","a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)).toBeNull();
      expect(parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"bogus","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)).toBeNull();
      expect(parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"id":"hijack"}}]}}</artifact-edit>`)).toBeNull();
    });

    it("counts canvasCommands in the change count", async () => {
      const { studioArtifactEditChangeCount } = await import("../../../src/shared/studio-artifact-edit");
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a","b"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}},{"type":"patch-elements","elementIds":["b"],"patch":{"x":2}}]}}</artifact-edit>`);
      expect(edit).not.toBeNull();
      expect(studioArtifactEditChangeCount(edit!)).toBe(2);
    });
  });

  describe("enforceCanvasSelectionBinding (legacy <artifact-edit> fallback)", () => {
    function canvasArtifact(): ReturnType<typeof createArtifact> {
      const artifact = createArtifact("canvas", "project-a", "canvas-a", "2026-01-01T00:00:00.000Z");
      if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas");
      artifact.content = {
        ...artifact.content,
        activePageId: "page-1",
        pages: [
          { id: "page-1", name: "Page 1", frame: { width: 800, height: 600 }, elements: [
            { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
            { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
          ], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
        ],
        elements: [
          { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
          { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
        ],
      } as CanvasArtifactContent;
      return artifact;
    }

    it("rejects a title-only text fallback edit when a trusted selection is bound", () => {
      const edit = parseStudioArtifactEdit('<artifact-edit>{"title":"Hostile rename"}</artifact-edit>')!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, { pageId: "page-1", elementIds: ["a"] })).toBeNull();
    });

    it("rejects canvasCommands alongside a title when a trusted selection is bound", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"title":"Hostile rename","canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, { pageId: "page-1", elementIds: ["a"] })).toBeNull();
    });

    it("rejects canvasCommands whose selection mismatches the trusted selection", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["b","a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      // Trusted selection is ordered ["a","b"]; a reordered selectionIds is rejected.
      expect(enforceCanvasSelectionBinding(edit, { pageId: "page-1", elementIds: ["a", "b"] })).toBeNull();
    });

    it("accepts canvasCommands that exactly match the trusted selection", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a","b"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      const guarded = enforceCanvasSelectionBinding(edit, { pageId: "page-1", elementIds: ["a", "b"] });
      expect(guarded).not.toBeNull();
      const artifact = canvasArtifact();
      const updated = applyStudioArtifactEdit(artifact, guarded!, "2026-01-02T00:00:00.000Z");
      if (updated.content.format !== "khadim-canvas") throw new Error("Expected canvas");
      expect(updated.content.elements.find((e) => e.id === "a")?.x).toBe(1);
    });

    it("rejects canvasCommands when no trusted selection was bound", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"patch-elements","elementIds":["a"],"patch":{"x":1}}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, undefined)).toBeNull();
    });

    it("accepts additive canvasCommands with no trusted selection (add-elements, selectionIds [])", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":[],"commands":[{"type":"add-elements","elements":[{"id":"r1","type":"rectangle","x":0,"y":0,"width":10,"height":10,"color":"#000"}]}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      const guarded = enforceCanvasSelectionBinding(edit, undefined);
      expect(guarded).not.toBeNull();
      const artifact = canvasArtifact();
      const updated = applyStudioArtifactEdit(artifact, guarded!, "2026-01-02T00:00:00.000Z");
      if (updated.content.format !== "khadim-canvas") throw new Error("Expected canvas");
      expect(updated.content.elements.map((e) => e.id)).toEqual(["a", "b", "r1"]);
    });

    it("rejects additive canvasCommands with a nonempty selection when no trusted selection is bound", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"add-elements","elements":[{"id":"r1","type":"rectangle","x":0,"y":0,"width":10,"height":10,"color":"#000"}]}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, undefined)).toBeNull();
    });

    it("rejects add-elements on a selection-bound run", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"canvasCommands":{"pageId":"page-1","selectionIds":["a"],"commands":[{"type":"add-elements","elements":[{"id":"r1","type":"rectangle","x":0,"y":0,"width":10,"height":10,"color":"#000"}]}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, { pageId: "page-1", elementIds: ["a"] })).toBeNull();
    });

    it("rejects mixed add-elements + title when no trusted selection is bound", () => {
      const edit = parseStudioArtifactEdit(`<artifact-edit>{"title":"Hostile rename","canvasCommands":{"pageId":"page-1","selectionIds":[],"commands":[{"type":"add-elements","elements":[{"id":"r1","type":"rectangle","x":0,"y":0,"width":10,"height":10,"color":"#000"}]}]}}</artifact-edit>`)!;
      expect(edit).not.toBeNull();
      expect(enforceCanvasSelectionBinding(edit, undefined)).toBeNull();
    });
  });
});
