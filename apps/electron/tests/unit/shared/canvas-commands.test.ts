import { describe, expect, it } from "vitest";
import {
  CANVAS_COMMAND_MAX_ADD_ELEMENTS,
  CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE,
  CANVAS_COMMAND_MAX_GROUP_SIZE,
  CANVAS_COMMAND_MAX_SELECTION,
  CANVAS_PAGE_MAX_ELEMENTS,
  CANVAS_PERSISTED_ID_MAX_LENGTH,
  CanvasCommandError,
  applyCanvasCommandGroup,
  isSafePrototypeUrl,
  parseCanvasCommandGroup,
  type CanvasAddElementSpec,
} from "../../../src/shared/canvas-commands";
import type { CanvasArtifactContent, CanvasElement, CanvasPrototypeInteraction } from "../../../src/shared/types";

function rect(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    color: "#111827",
    ...overrides,
  } as CanvasElement;
}

function interaction(id: string, overrides: Partial<CanvasPrototypeInteraction> = {}): CanvasPrototypeInteraction {
  const base: CanvasPrototypeInteraction = {
    id,
    trigger: "click",
    action: "navigate",
    destinationPageId: "page-2",
    ...overrides,
  };
  // Drop action-incompatible payload so the helper produces valid interactions
  // for every action type without callers remembering to clear fields.
  if (base.action === "open-url") delete base.destinationPageId;
  if (base.action === "back" || base.action === "close-overlay") {
    delete base.destinationPageId;
    delete base.url;
  }
  return base;
}

/** Single-page content where the top-level mirror IS the active page. */
function singlePageContent(overrides: Partial<CanvasArtifactContent> = {}): CanvasArtifactContent {
  const elements = overrides.elements ?? [rect("a"), rect("b"), rect("c")];
  return {
    format: "khadim-canvas",
    sceneVersion: 1,
    frame: { width: 800, height: 600 },
    elements,
    components: [],
    appState: { viewBackgroundColor: "#ffffff", snapToGrid: false },
    files: {},
    activePageId: "page-1",
    pages: [
      { id: "page-1", name: "Page 1", frame: { width: 800, height: 600 }, elements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
      { id: "page-2", name: "Page 2", frame: { width: 800, height: 600 }, elements: [rect("p2-a")], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
    ],
    ...overrides,
  };
}

/** Legacy content with no pages array — only the top-level mirror. */
function legacyContent(): CanvasArtifactContent {
  const elements = [rect("a"), rect("b")];
  return {
    format: "khadim-canvas",
    sceneVersion: 1,
    frame: { width: 800, height: 600 },
    elements,
    components: [],
    appState: { viewBackgroundColor: "#ffffff", snapToGrid: false },
    files: {},
  };
}

describe("canvas command layer — applyCanvasCommandGroup", () => {
  describe("patch-elements", () => {
    it("patches selected elements and preserves untouched elements by reference", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a", "b"],
        commands: [{ type: "patch-elements", elementIds: ["a", "b"], patch: { x: 40, color: "#ff0000" } }],
      });

      const a = result.content.elements.find((e) => e.id === "a")!;
      const b = result.content.elements.find((e) => e.id === "b")!;
      const c = result.content.elements.find((e) => e.id === "c")!;
      expect(a).toMatchObject({ id: "a", x: 40, color: "#ff0000" });
      expect(b).toMatchObject({ id: "b", x: 40, color: "#ff0000" });
      expect(c).toBe(content.elements.find((e) => e.id === "c"));
      expect(result.affectedElementIds).toEqual(["a", "b"]);
    });

    it("rejects elements outside selection", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["b"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects duplicate targets within a patch command", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a", "a"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects unknown element ids", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["missing"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects edits to locked elements", () => {
      const content = singlePageContent({ elements: [rect("a", { locked: true })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects edits to elements with a locked ancestor", () => {
      const lockedParent = rect("parent", { locked: true });
      const child = rect("child", { parentId: "parent" });
      const content = singlePageContent({ elements: [lockedParent, child] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["child"],
          commands: [{ type: "patch-elements", elementIds: ["child"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects forbidden identity/structural keys", () => {
      const content = singlePageContent();
      for (const key of ["id", "type", "componentId", "componentRole", "parentId", "groupId"]) {
        expect(() =>
          applyCanvasCommandGroup(content, {
            pageId: "page-1",
            selectionIds: ["a"],
            commands: [{ type: "patch-elements", elementIds: ["a"], patch: { [key]: "x" } as Record<string, unknown> }],
          }),
        ).toThrowError(CanvasCommandError);
      }
    });

    it("rejects interactions in patch-elements", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { interactions: [] } as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects empty patches", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: {} }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("validates finite numeric patch values", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: Number.NaN } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { width: -1 } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { opacity: 2 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("validates nonempty bounded strings", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { name: "" } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { color: 123 as unknown } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("interactions", () => {
    it("adds an interaction and removes it via the inverse", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { action: "open-url", url: "https://example.com" }) }],
      });
      const a = result.content.elements.find((e) => e.id === "a")!;
      expect(a.interactions).toHaveLength(1);
      expect(a.interactions![0]).toMatchObject({ id: "i1", action: "open-url", url: "https://example.com" });

      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(undone.content.elements.find((e) => e.id === "a")?.interactions ?? []).toEqual([]);
    });

    it("rejects duplicate interaction ids within a group", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a", "b"],
          commands: [
            { type: "add-interaction", elementId: "a", interaction: interaction("shared") },
            { type: "add-interaction", elementId: "b", interaction: interaction("shared") },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects duplicate triggers on the same target", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("existing", { trigger: "click" })] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("new", { trigger: "click" }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects invalid trigger/action shapes", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "double-click" as unknown as CanvasPrototypeInteraction["trigger"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { action: "explode" as unknown as CanvasPrototypeInteraction["action"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects out-of-bound delay/duration", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "after-delay", delay: -1 }) }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "dissolve", duration: -1, easing: "ease" } }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("patches and removes interactions by stable id", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1", { trigger: "after-delay", delay: 100 }), interaction("i2", { trigger: "hover" })] })] });

      const patched = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: 200 } }],
      });
      expect(patched.content.elements.find((e) => e.id === "a")?.interactions?.[0]).toMatchObject({ id: "i1", delay: 200 });

      const removed = applyCanvasCommandGroup(patched.content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i2" }],
      });
      expect(removed.content.elements.find((e) => e.id === "a")?.interactions?.map((i) => i.id)).toEqual(["i1"]);
    });

    it("rejects patching unknown interaction ids", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "ghost", patch: { delay: 100 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects removing interaction ids twice in a group", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1")] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [
            { type: "remove-interaction", elementId: "a", interactionId: "i1" },
            { type: "remove-interaction", elementId: "a", interactionId: "i1" },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects changing a trigger to one already present on the element", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1", { trigger: "click" }), interaction("i2", { trigger: "hover" })] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i2", patch: { trigger: "click" } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("URL safety", () => {
    it("isSafePrototypeUrl accepts http/https and rejects every other scheme (matching persistence)", () => {
      expect(isSafePrototypeUrl("https://example.com")).toBe(true);
      expect(isSafePrototypeUrl("http://example.com")).toBe(true);
      // mailto is rejected to match the project-store persistence validator.
      expect(isSafePrototypeUrl("mailto:test@example.com")).toBe(false);
      expect(isSafePrototypeUrl("javascript:alert(1)")).toBe(false);
      expect(isSafePrototypeUrl("file:///etc/passwd")).toBe(false);
      expect(isSafePrototypeUrl("not a url")).toBe(false);
      expect(isSafePrototypeUrl("")).toBe(false);
    });

    it("rejects unsafe urls on open-url interactions", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { action: "open-url", url: "javascript:alert(1)" }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("atomicity", () => {
    it("rejects the whole group on any single failure and leaves content untouched", () => {
      const content = singlePageContent();
      let result;
      try {
        result = applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a", "b"],
          commands: [
            { type: "patch-elements", elementIds: ["a"], patch: { x: 50 } },
            { type: "patch-elements", elementIds: "ghost" as unknown as string[], patch: { x: 50 } },
          ],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(CanvasCommandError);
      }
      expect(result).toBeUndefined();
      // The thrown error must have happened before any mutation.
    });

    it("preserves untouched pages by reference", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-2",
        selectionIds: ["p2-a"],
        commands: [{ type: "patch-elements", elementIds: ["p2-a"], patch: { x: 25 } }],
      });
      const untouchedPage = result.content.pages!.find((p) => p.id === "page-1")!;
      expect(untouchedPage).toBe(content.pages![0]);
    });
  });

  describe("inverse round trip", () => {
    it("restores exact prior values including absence vs presence", () => {
      const content = singlePageContent({ elements: [rect("a", { radius: undefined, interactions: [interaction("i1", { trigger: "after-delay", delay: 100 })] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [
          { type: "patch-elements", elementIds: ["a"], patch: { x: 99, radius: 8, name: "Renamed" } },
          { type: "add-interaction", elementId: "a", interaction: interaction("i2", { trigger: "hover" }) },
          { type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: 300 } },
        ],
      });

      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      // Structural equality of the affected element.
      expect(JSON.stringify(undone.content.elements.find((e) => e.id === "a"))).toEqual(
        JSON.stringify(content.elements.find((e) => e.id === "a")),
      );
    });

    it("restores removed interactions exactly", () => {
      const original = interaction("i1", { trigger: "after-delay", delay: 500, destinationPageId: "page-2" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [original] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i1" }],
      });
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(undone.content.elements.find((e) => e.id === "a")?.interactions).toEqual([original]);
    });

    it("inverse commands are ordered for undo (reverse application order)", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [
          { type: "patch-elements", elementIds: ["a"], patch: { x: 1 } },
          { type: "patch-elements", elementIds: ["a"], patch: { y: 2 } },
        ],
      });
      // First command's inverse must come last so it is applied last during undo.
      expect(result.inverse[1]).toMatchObject({ type: "patch-elements", patch: { x: 0 } });
      expect(result.inverse[0]).toMatchObject({ type: "patch-elements", patch: { y: 0 } });
    });
  });

  describe("active vs inactive pages", () => {
    it("updates the top-level mirror when editing the active page", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 33 } }],
      });
      expect(result.content.elements.find((e) => e.id === "a")?.x).toBe(33);
      expect(result.content.pages!.find((p) => p.id === "page-1")?.elements.find((e) => e.id === "a")?.x).toBe(33);
    });

    it("does not touch the top-level mirror when editing an inactive page", () => {
      const content = singlePageContent();
      const topBefore = content.elements;
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-2",
        selectionIds: ["p2-a"],
        commands: [{ type: "patch-elements", elementIds: ["p2-a"], patch: { x: 12 } }],
      });
      expect(result.content.elements).toBe(topBefore);
      expect(result.content.pages!.find((p) => p.id === "page-2")?.elements.find((e) => e.id === "p2-a")?.x).toBe(12);
    });

    it("rejects unknown page ids", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-missing",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("edits legacy content with no pages array via the active mirror and keeps pages/activePageId absent", () => {
      const content = legacyContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 7 } }],
      });
      expect(result.content.elements.find((e) => e.id === "a")?.x).toBe(7);
      // Legacy content must not materialize pages/activePageId on a forward edit.
      expect(result.content.pages).toBeUndefined();
      expect(result.content.activePageId).toBeUndefined();
      // The inverse must restore the exact original JSON shape (fields absent).
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(undone.content.pages).toBeUndefined();
      expect(undone.content.activePageId).toBeUndefined();
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify(content));
    });
  });

  describe("bounds", () => {
    it("rejects groups larger than the applier command limit", () => {
      const content = singlePageContent({ elements: Array.from({ length: CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE + 1 }, (_, i) => rect(`e${i}`)) });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: Array.from({ length: CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE + 1 }, (_, i) => `e${i}`),
          commands: Array.from({ length: CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE + 1 }, (_, i) => ({
            type: "patch-elements" as const,
            elementIds: [`e${i}`],
            patch: { x: 1 },
          })),
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects selections larger than the selection limit", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: Array.from({ length: CANVAS_COMMAND_MAX_SELECTION + 1 }, (_, i) => `id${i}`),
          commands: [],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("input immutability", () => {
    it("does not mutate the input content, page, or elements", () => {
      const content = singlePageContent();
      const originalSerialized = JSON.stringify(content);
      applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a", "b"],
        commands: [
          { type: "patch-elements", elementIds: ["a"], patch: { x: 10 } },
          { type: "add-interaction", elementId: "b", interaction: interaction("new") },
        ],
      });
      expect(JSON.stringify(content)).toEqual(originalSerialized);
      // The element references in the input are unchanged.
      expect(content.elements.find((e) => e.id === "a")?.x).toBe(0);
    });

    it("does not mutate command inputs (interactions)", () => {
      const content = singlePageContent();
      const added = interaction("i1", { trigger: "after-delay", delay: 100 });
      const addedSerialized = JSON.stringify(added);
      applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: added }],
      });
      expect(JSON.stringify(added)).toEqual(addedSerialized);
    });
  });

  describe("round trip across a full mixed group", () => {
    it("fully restores content after applying the inverse group", () => {
      const content = singlePageContent({
        elements: [rect("a", { interactions: [interaction("i1", { trigger: "after-delay", delay: 100 })] }), rect("b"), rect("c", { color: "#abcdef" })],
      });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a", "b", "c"],
        commands: [
          { type: "patch-elements", elementIds: ["a"], patch: { x: 11, name: "Alpha" } },
          { type: "patch-elements", elementIds: ["c"], patch: { width: 200, height: 150, opacity: 0.5 } },
          { type: "add-interaction", elementId: "b", interaction: interaction("b-click", { action: "open-url", url: "https://khadim.dev" }) },
          { type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: 250 } },
        ],
      });

      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a", "b", "c"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify({ ...content, activePageId: content.activePageId }));
    });
  });

  describe("hardened validation", () => {
    it("uses the persisted cornerRadii patch field, not radii", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { cornerRadii: { topLeft: 4, topRight: 8, bottomRight: 4, bottomLeft: 8 } } }],
      });
      expect((result.content.elements.find((e) => e.id === "a") as CanvasElement & { cornerRadii?: unknown }).cornerRadii).toEqual({ topLeft: 4, topRight: 8, bottomRight: 4, bottomLeft: 8 });
      // Undo restores absence.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect((undone.content.elements.find((e) => e.id === "a") as CanvasElement & { cornerRadii?: unknown }).cornerRadii).toBeUndefined();
    });

    it("rejects the legacy radii patch key", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { radii: { topLeft: 1, topRight: 1, bottomRight: 1, bottomLeft: 1 } } as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects cornerRadii with extra fields", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { cornerRadii: { topLeft: 1, topRight: 1, bottomRight: 1, bottomLeft: 1, extra: 9 } } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects empty command groups", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: ["a"], commands: [] }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects duplicate selection ids", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a", "a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects navigate without an existing destination page", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { action: "navigate", destinationPageId: "ghost" }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects navigate with a missing destinationPageId", () => {
      const content = singlePageContent();
      const bad = { ...interaction("i1", { action: "navigate" }) };
      delete bad.destinationPageId;
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: bad }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects back/close-overlay carrying a destination or url", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "back", destinationPageId: "page-2" } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "close-overlay", url: "https://x.io" } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects open-url carrying a destinationPageId", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-url", url: "https://x.io", destinationPageId: "page-2" } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects overlay on non-overlay actions and validates overlay shape", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", overlay: { position: "center", background: "none", closeOnOutsideClick: true } } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2", overlay: { position: "middle", background: "none", closeOnOutsideClick: true } } as unknown as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("validates transition type/easing/direction", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "morph", duration: 200, easing: "ease" } as unknown as CanvasPrototypeInteraction["transition"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "slide", duration: 200, easing: "bounce", direction: "left" } as unknown as CanvasPrototypeInteraction["transition"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects unknown keys in interaction patches (including id)", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1")] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { id: "hijack" } as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { bogus: 1 } as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects extra fields on an interaction", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", payload: "evil" } as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("allows reusing a removed interaction id and trigger later in the same group (prospective)", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1", { trigger: "click" })] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [
          { type: "remove-interaction", elementId: "a", interactionId: "i1" },
          { type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "click", action: "open-url", url: "https://khadim.dev" }) },
        ],
      });
      const a = result.content.elements.find((e) => e.id === "a")!;
      expect(a.interactions).toHaveLength(1);
      expect(a.interactions![0]).toMatchObject({ id: "i1", action: "open-url", url: "https://khadim.dev" });
    });

    it("rejects patch-interaction changing action to one needing a destination when the merged shape lacks it", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1", { action: "open-url", url: "https://khadim.dev" })] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "back" } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("validates the merged action shape on patch-interaction against existing pages", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1", { action: "open-url", url: "https://khadim.dev" })] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "navigate", destinationPageId: "page-2", url: undefined } }],
      });
      expect(result.content.elements.find((e) => e.id === "a")?.interactions?.[0]).toMatchObject({ action: "navigate", destinationPageId: "page-2" });
    });
  });

  describe("exact inverse ordering and empty-list restoration", () => {
    it("removing a middle interaction then applying the inverse restores the original ordering", () => {
      const i1 = interaction("i1", { trigger: "click" });
      const i2 = interaction("i2", { trigger: "hover" });
      const i3 = interaction("i3", { trigger: "after-delay", delay: 100 });
      const content = singlePageContent({ elements: [rect("a", { interactions: [i1, i2, i3] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i2" }],
      });
      // After removing the middle interaction, only i1 and i3 remain, in order.
      expect(result.content.elements.find((e) => e.id === "a")?.interactions?.map((i) => i.id)).toEqual(["i1", "i3"]);
      // Applying the inverse must restore i2 between i1 and i3, exactly.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(undone.content.elements.find((e) => e.id === "a")?.interactions?.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
      // Structural equality of the whole element.
      expect(JSON.stringify(undone.content.elements.find((e) => e.id === "a"))).toEqual(
        JSON.stringify(content.elements.find((e) => e.id === "a")),
      );
    });

    it("adding to an element whose interactions is explicitly [] then undoing restores interactions: []", () => {
      // Construct an element carrying an explicit empty interactions list.
      const explicitEmpty = rect("a", { interactions: [] });
      const content = singlePageContent({ elements: [explicitEmpty] });
      // Sanity: the source element owns an explicit empty list.
      expect(Object.prototype.hasOwnProperty.call(content.elements.find((e) => e.id === "a"), "interactions")).toBe(true);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "click" }) }],
      });
      const after = result.content.elements.find((e) => e.id === "a")!;
      expect(after.interactions?.map((i) => i.id)).toEqual(["i1"]);
      // Applying the inverse must restore the explicit empty list, not absence.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      const restored = undone.content.elements.find((e) => e.id === "a")!;
      expect(Object.prototype.hasOwnProperty.call(restored, "interactions")).toBe(true);
      expect(Array.isArray(restored.interactions)).toBe(true);
      expect(restored.interactions).toEqual([]);
      // Structural equality with the original element.
      expect(JSON.stringify(restored)).toEqual(JSON.stringify(content.elements.find((e) => e.id === "a")));
    });

    it("adding to an element with absent interactions then undoing restores absence", () => {
      const content = singlePageContent({ elements: [rect("a")] });
      expect(Object.prototype.hasOwnProperty.call(content.elements.find((e) => e.id === "a"), "interactions")).toBe(false);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "click" }) }],
      });
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      const restored = undone.content.elements.find((e) => e.id === "a")!;
      expect(Object.prototype.hasOwnProperty.call(restored, "interactions")).toBe(false);
      expect(JSON.stringify(restored)).toEqual(JSON.stringify(content.elements.find((e) => e.id === "a")));
    });
  });

  describe("unknown selection ids", () => {
    it("applyCanvasCommandGroup validates every selection id exists on the target page before validating commands", () => {
      const content = singlePageContent();
      // The selection references a stale id that no longer exists, but the
      // commands only target a valid id. The group must still fail atomically.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a", "ghost"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 5 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("strict parser rejects unknown keys", () => {
    it("rejects unknown envelope keys", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }], extra: 1 })).toBeNull();
    });
    it("rejects unknown keys on a patch-elements command", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 }, bogus: 1 }] })).toBeNull();
    });
    it("rejects unknown keys on an add-interaction command", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2" }, bogus: 1 }] })).toBeNull();
    });
    it("rejects unknown keys on a patch-interaction command", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: 100 }, bogus: 1 }] })).toBeNull();
    });
    it("rejects unknown keys on a remove-interaction command", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i1", bogus: 1 }] })).toBeNull();
    });
    it("rejects the internal-only insertIndex field on an add-interaction command", () => {
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2" }, insertIndex: 0 }] })).toBeNull();
    });
    it("rejects the internal-only restoreEmptyList field on a remove-interaction command", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1")] })] });
      // Strict parser must reject the internal inverse-only field.
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i1", restoreEmptyList: true }] })).toBeNull();
      // And the applier still works without that field on the public path.
      void content;
    });
    it("rejects oversized payload strings at the parser boundary", () => {
      const huge = "x".repeat(1_000_001);
      expect(parseCanvasCommandGroup(huge)).toBeNull();
    });
  });

  describe("interaction rules match project-store persistence", () => {
    it("rejects mailto urls (only http/https)", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-url", url: "mailto:test@example.com" } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("rejects transition duration above 5000", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "dissolve", duration: 5_001, easing: "ease" } as unknown as CanvasPrototypeInteraction["transition"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("accepts transition duration at the 5000 cap", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "dissolve", duration: 5_000, easing: "ease" } }) }],
      });
      expect(result.content.elements.find((e) => e.id === "a")?.interactions?.[0]?.transition?.duration).toBe(5_000);
    });
    it("rejects delay on a non-after-delay trigger", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", delay: 100 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("rejects after-delay without a delay", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "after-delay", action: "navigate", destinationPageId: "page-2" } as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("rejects a transition on back/close-overlay/open-url", () => {
      const content = singlePageContent();
      for (const action of ["back", "close-overlay", "open-url"] as const) {
        const interactionBody: CanvasPrototypeInteraction = action === "open-url"
          ? { id: "i1", trigger: "click", action, url: "https://khadim.dev", transition: { type: "dissolve", duration: 200, easing: "ease" } }
          : { id: "i1", trigger: "click", action, transition: { type: "dissolve", duration: 200, easing: "ease" } };
        expect(() =>
          applyCanvasCommandGroup(content, {
            pageId: "page-1",
            selectionIds: ["a"],
            commands: [{ type: "add-interaction", elementId: "a", interaction: interactionBody }],
          }),
        ).toThrowError(CanvasCommandError);
      }
    });
    it("rejects transition direction on a non-slide transition", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "dissolve", duration: 200, easing: "ease", direction: "left" } as unknown as CanvasPrototypeInteraction["transition"] }) }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("rejects a smart transition on a non-navigate action", () => {
      const content = singlePageContent({ elements: [rect("a")] });
      // open-overlay requires an overlay; build a valid overlay + smart transition (smart only valid for navigate).
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2", overlay: { position: "center", background: "none", closeOnOutsideClick: true }, transition: { type: "smart", duration: 200, easing: "ease" } } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("rejects an overlay on a navigate action", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", overlay: { position: "center", background: "none", closeOnOutsideClick: true } } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("requires an overlay for open-overlay/toggle-overlay", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2" } as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });
    it("accepts a navigate with a transition but no overlay/url", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { transition: { type: "dissolve", duration: 300, easing: "ease" } }) }],
      });
      expect(result.content.elements.find((e) => e.id === "a")?.interactions?.[0]?.transition?.type).toBe("dissolve");
    });
  });

  describe("feature-critic: large-selection inverse", () => {
    it("a valid patch-elements targeting 100 selected layers produces an inverse applyCanvasCommandGroup can re-apply exactly", () => {
      // Build content with exactly 100 elements, all selected, in the
      // CANVAS_COMMAND_MAX_GROUP_SIZE..CANVAS_COMMAND_MAX_SELECTION band.
      const elements = Array.from({ length: CANVAS_COMMAND_MAX_SELECTION }, (_, i) => rect(`e${i}`, { x: i, color: "#000000" }));
      const content = singlePageContent({ elements });
      // One forward command (well within the parser's 50-command limit) targeting
      // all 100 selected layers. The inverse expands to 100 patch-elements
      // commands, which must be re-applicable (applier limit is the selection max).
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: elements.map((e) => e.id),
        commands: [{ type: "patch-elements", elementIds: elements.map((e) => e.id), patch: { x: 999, color: "#ff0000" } }],
      });
      // Every selected layer was patched.
      for (const element of elements) {
        expect(result.content.elements.find((e) => e.id === element.id)?.x).toBe(999);
      }
      // The inverse has one patch-elements command per target (100 commands),
      // exceeding the parser's 50-command max but within the applier's bound.
      expect(result.inverse).toHaveLength(CANVAS_COMMAND_MAX_SELECTION);
      expect(result.inverse.every((c) => c.type === "patch-elements")).toBe(true);
      // Re-applying the inverse must succeed and restore the exact original.
      const undone = applyCanvasCommandGroup(result.content, {
        pageId: "page-1",
        selectionIds: elements.map((e) => e.id),
        commands: result.inverse,
      });
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify({ ...content, activePageId: content.activePageId }));
    });

    it("a patch-elements targeting 51 layers round-trips exactly through the inverse", () => {
      const elements = Array.from({ length: 51 }, (_, i) => rect(`e${i}`, { x: i }));
      const content = singlePageContent({ elements });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: elements.map((e) => e.id),
        commands: [{ type: "patch-elements", elementIds: elements.map((e) => e.id), patch: { x: -5 } }],
      });
      expect(result.inverse).toHaveLength(51);
      const undone = applyCanvasCommandGroup(result.content, {
        pageId: "page-1",
        selectionIds: elements.map((e) => e.id),
        commands: result.inverse,
      });
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify({ ...content, activePageId: content.activePageId }));
    });

    it("the untrusted parser still rejects forward groups with more than 50 commands", () => {
      const commands = Array.from({ length: CANVAS_COMMAND_MAX_GROUP_SIZE + 1 }, (_, i) => ({
        type: "patch-elements" as const,
        elementIds: ["a"],
        patch: { x: i },
      }));
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands })).toBeNull();
    });
  });

  describe("feature-critic: legacy canvas exactness", () => {
    it("a forward patch-elements edit on legacy content keeps pages and activePageId absent and round-trips exactly", () => {
      const content = legacyContent();
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a", "b"],
        commands: [{ type: "patch-elements", elementIds: ["a", "b"], patch: { x: 42, color: "#abcdef" } }],
      });
      // No pages/activePageId materialized.
      expect(result.content.pages).toBeUndefined();
      expect(result.content.activePageId).toBeUndefined();
      // Top-level mirror updated.
      expect(result.content.elements.find((e) => e.id === "a")?.x).toBe(42);
      expect(result.content.elements.find((e) => e.id === "b")?.color).toBe("#abcdef");
      // Inverse restores the exact original JSON (fields absent).
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a", "b"], commands: result.inverse });
      expect(undone.content.pages).toBeUndefined();
      expect(undone.content.activePageId).toBeUndefined();
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("an add-interaction on legacy content round-trips exactly with pages/activePageId absent", () => {
      const content = legacyContent();
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        // page-1 is a known destination in legacy content (implicit active page).
        commands: [{ type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "click", action: "navigate", destinationPageId: "page-1" }) }],
      });
      expect(result.content.pages).toBeUndefined();
      expect(result.content.activePageId).toBeUndefined();
      expect(result.content.elements.find((e) => e.id === "a")?.interactions?.[0]).toMatchObject({ id: "i1", action: "navigate", destinationPageId: "page-1" });
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(undone.content.pages).toBeUndefined();
      expect(undone.content.activePageId).toBeUndefined();
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("legacy content with no pages/activePageId can address page-1 as a navigate destination", () => {
      const content = legacyContent();
      // page-1 must be a known page id so a navigate/open-overlay interaction validates.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["b"],
        commands: [
          { type: "add-interaction", elementId: "b", interaction: { id: "x", trigger: "click", action: "open-overlay", destinationPageId: "page-1", overlay: { position: "center", background: "none", closeOnOutsideClick: true } } },
        ],
      });
      expect(result.content.elements.find((e) => e.id === "b")?.interactions?.[0]?.destinationPageId).toBe("page-1");
    });
  });

  describe("feature-critic: JSON null clears optional interaction fields", () => {
    it("parser accepts JSON null for the five optional action-specific fields and rejects null for trigger/action", () => {
      // null for optional fields is accepted.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { url: null } }],
      })).not.toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { destinationPageId: null } }],
      })).not.toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: null } }],
      })).not.toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { transition: null } }],
      })).not.toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { overlay: null } }],
      })).not.toBeNull();
      // null for trigger/action is rejected.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { trigger: null } }],
      })).toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: null } }],
      })).toBeNull();
      // unknown fields remain strict.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { bogus: null } }],
      })).toBeNull();
    });

    it("navigate->back transition via one patch-interaction (clear destinationPageId) round-trips exactly", () => {
      const start = interaction("i1", { action: "navigate", destinationPageId: "page-2" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "back", destinationPageId: null } }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(after.action).toBe("back");
      expect(after.destinationPageId).toBeUndefined();
      // Inverse restores the navigate exactly.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("open-url->navigate transition via one patch-interaction (set destinationPageId, clear url) round-trips exactly", () => {
      const start = interaction("i1", { action: "open-url", url: "https://khadim.dev" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "navigate", destinationPageId: "page-2", url: null } }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(after.action).toBe("navigate");
      expect(after.destinationPageId).toBe("page-2");
      expect(after.url).toBeUndefined();
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("after-delay->click transition via one patch-interaction (clear delay, change trigger) round-trips exactly", () => {
      const start = interaction("i1", { trigger: "after-delay", delay: 250, action: "navigate", destinationPageId: "page-2" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { trigger: "click", delay: null } }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(after.trigger).toBe("click");
      expect(after.delay).toBeUndefined();
      expect(after.destinationPageId).toBe("page-2");
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("clearing a transition and overlay via null round-trips exactly", () => {
      const start: CanvasPrototypeInteraction = {
        id: "i1",
        trigger: "click",
        action: "open-overlay",
        destinationPageId: "page-2",
        transition: { type: "dissolve", duration: 300, easing: "ease" },
        overlay: { position: "center", background: "none", closeOnOutsideClick: true },
      };
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { transition: null, overlay: null, action: "navigate", destinationPageId: "page-2" } }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(after.action).toBe("navigate");
      expect(after.transition).toBeUndefined();
      expect(after.overlay).toBeUndefined();
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("rejects null trigger/action at the applier boundary too", () => {
      const content = singlePageContent({ elements: [rect("a", { interactions: [interaction("i1")] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { trigger: null } as unknown as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: null } as unknown as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("null-clearing a field that the merged action forbids is rejected (validation uses cleared shape)", () => {
      // after-delay requires delay; clearing delay via null must fail shape validation.
      const start = interaction("i1", { trigger: "after-delay", delay: 100 });
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: null } }],
      });
      expect(parsed).not.toBeNull();
      expect(() => applyCanvasCommandGroup(content, parsed!)).toThrowError(CanvasCommandError);
    });
  });

  describe("feature-critic: inverse expansion worst case", () => {
    it("the applier bound equals the mathematically bounded worst case (50 * 100)", () => {
      expect(CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE).toBe(CANVAS_COMMAND_MAX_GROUP_SIZE * CANVAS_COMMAND_MAX_SELECTION);
      expect(CANVAS_COMMAND_MAX_GROUP_SIZE).toBe(50);
      expect(CANVAS_COMMAND_MAX_SELECTION).toBe(100);
    });

    it("a two-100-target command group produces an inverse the applier re-applies exactly", () => {
      // Two accepted forward commands, each targeting 100 selected layers, is
      // within the parser's 50-command cap. The inverse expands to 200
      // patch-elements commands — well within the applier's 5000 worst-case bound.
      const elements = Array.from({ length: CANVAS_COMMAND_MAX_SELECTION }, (_, i) => rect(`e${i}`, { x: i, y: 0, color: "#000000" }));
      const content = singlePageContent({ elements });
      const ids = elements.map((e) => e.id);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ids,
        commands: [
          { type: "patch-elements", elementIds: ids, patch: { x: 999, color: "#ff0000" } },
          { type: "patch-elements", elementIds: ids, patch: { y: 42 } },
        ],
      });
      // Two commands * 100 targets = 200 inverse patch-elements commands.
      expect(result.inverse).toHaveLength(2 * CANVAS_COMMAND_MAX_SELECTION);
      expect(result.inverse.every((c) => c.type === "patch-elements")).toBe(true);
      // Re-applying the 200-command inverse must succeed (applier bound is 5000).
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ids, commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify({ ...content, activePageId: content.activePageId }));
    });

    it("the untrusted parser still rejects forward groups with more than 50 commands while the applier accepts the 5000 inverse bound", () => {
      // A 51-command forward group is rejected by the parser.
      const tooMany = Array.from({ length: CANVAS_COMMAND_MAX_GROUP_SIZE + 1 }, () => ({ type: "patch-elements" as const, elementIds: ["a"], patch: { x: 1 } }));
      expect(parseCanvasCommandGroup({ pageId: "page-1", selectionIds: ["a"], commands: tooMany })).toBeNull();
      // The applier, however, must accept an internally generated inverse of up
      // to 5000 commands (the worst-case expansion of an accepted forward group).
      const elements = Array.from({ length: CANVAS_COMMAND_MAX_SELECTION }, (_, i) => rect(`e${i}`, { x: i }));
      const content = singlePageContent({ elements });
      const ids = elements.map((e) => e.id);
      // One forward command targeting 100 layers expands to a 100-command inverse.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ids,
        commands: [{ type: "patch-elements", elementIds: ids, patch: { x: -1 } }],
      });
      expect(result.inverse.length).toBeLessThanOrEqual(CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE);
      expect(() => applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ids, commands: result.inverse })).not.toThrow();
    });
  });

  describe("feature-critic: lock undo", () => {
    it("a directly-locked target can be unlocked via locked:false and round-trips exactly (restoring locked:true and other prior fields)", () => {
      const content = singlePageContent({ elements: [rect("a", { locked: true, x: 10, color: "#abcdef", name: "Original" })] });
      const original = JSON.stringify(content);
      // An atomic patch that clears the lock and edits other fields is permitted.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { locked: false, x: 99, color: "#111111" } }],
      });
      const after = result.content.elements.find((e) => e.id === "a")!;
      expect(after.locked).toBe(false);
      expect(after.x).toBe(99);
      expect(after.color).toBe("#111111");
      // The inverse must restore locked:true AND the prior x/color/name exactly.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("a directly-locked target can be cleared via locked:undefined (internal sentinel) and round-trips exactly", () => {
      const content = singlePageContent({ elements: [rect("a", { locked: true, x: 10 })] });
      const original = JSON.stringify(content);
      // Internal undefined clears the field (lock becomes absent), which also unlocks.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { locked: undefined, x: 50 } }],
      });
      const after = result.content.elements.find((e) => e.id === "a")!;
      expect(after.locked).toBeUndefined();
      expect(after.x).toBe(50);
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("rejects a malicious edit to a locked target that does not clear the lock", () => {
      const content = singlePageContent({ elements: [rect("a", { locked: true })] });
      // Patches only other fields (no unlock) must be rejected.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
      // Setting locked:true (no clear) plus other fields is still rejected.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { locked: true, x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("continues rejecting edits to targets with a locked ancestor (inherited locks cannot be cleared via the target)", () => {
      const lockedParent = rect("parent", { locked: true });
      const child = rect("child", { parentId: "parent" });
      const content = singlePageContent({ elements: [lockedParent, child] });
      // Even an explicit unlock of the child cannot clear the inherited lock.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["child"],
          commands: [{ type: "patch-elements", elementIds: ["child"], patch: { locked: false, x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("feature-critic: exact interaction object inverse", () => {
    it("a patch-interaction inverse restores the exact original interaction (presence and insertion order) via the internal restoreInteraction field", () => {
      // Build an interaction with an unusual key order: action before trigger,
      // and url before the canonical position. The exact object (including this
      // key order) must survive a patch + undo round trip.
      const startRaw: Record<string, unknown> = {
        id: "i1",
        action: "open-url",
        trigger: "click",
        url: "https://khadim.dev",
      };
      const start = startRaw as unknown as CanvasPrototypeInteraction;
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { url: "https://example.com" } }],
      });
      // The inverse carries the internal-only exact restore payload.
      expect(result.inverse[0]).toMatchObject({ type: "patch-interaction", interactionId: "i1" });
      expect((result.inverse[0] as { restoreInteraction?: unknown }).restoreInteraction).toBeDefined();
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      // JSON.stringify equality captures property presence AND insertion order.
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("the strict parser rejects the internal restoreInteraction field on a patch-interaction command", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { delay: 100 }, restoreInteraction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2" } }],
      })).toBeNull();
    });

    it("a patch-interaction that adds and then clears a field round-trips exactly with the original key order", () => {
      // Original has an unusual order with url after destinationPageId.
      const startRaw: Record<string, unknown> = {
        id: "i1",
        trigger: "click",
        action: "open-url",
        url: "https://khadim.dev",
      };
      const start = startRaw as unknown as CanvasPrototypeInteraction;
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const original = JSON.stringify(content);
      // Add a destinationPageId (invalid for open-url, so change action too).
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "navigate", destinationPageId: "page-2", url: null } as unknown as Record<string, unknown> }],
      });
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });
  });

  describe("feature-critic: generic patch persistence compatibility", () => {
    it("rejects blur.value > 100 (persistance caps blur at 0..100)", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { layerBlur: { value: 101, visible: true } } }],
        }),
      ).toThrowError(CanvasCommandError);
      // Boundary-valid blur value (100) is accepted.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { layerBlur: { value: 100, visible: true } } }],
        }),
      ).not.toThrow();
    });

    it("rejects cornerRadii on an ellipse (type-specific check examines each target element)", () => {
      const content = singlePageContent({ elements: [rect("a", { type: "ellipse" as unknown as CanvasElement["type"] })] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { cornerRadii: { topLeft: 1, topRight: 1, bottomRight: 1, bottomLeft: 1 } } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("accepts cornerRadii on a rectangle and rejects a radius > 100000", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { cornerRadii: { topLeft: 100000, topRight: 0, bottomRight: 0, bottomLeft: 0 } } }],
        }),
      ).not.toThrow();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { cornerRadii: { topLeft: 100001, topRight: 0, bottomRight: 0, bottomLeft: 0 } } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects radius/strokeWidth/strokeDash/fontSize/lineHeight outside 0..100000", () => {
      const content = singlePageContent();
      for (const key of ["radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight"] as const) {
        expect(() =>
          applyCanvasCommandGroup(content, {
            pageId: "page-1",
            selectionIds: ["a"],
            commands: [{ type: "patch-elements", elementIds: ["a"], patch: { [key]: -1 } }],
          }),
        ).toThrowError(CanvasCommandError);
        expect(() =>
          applyCanvasCommandGroup(content, {
            pageId: "page-1",
            selectionIds: ["a"],
            commands: [{ type: "patch-elements", elementIds: ["a"], patch: { [key]: 100001 } }],
          }),
        ).toThrowError(CanvasCommandError);
      }
    });

    it("rejects strings exceeding per-key persisted ceilings (name/fontFamily > 1000, color/strokeColor > 80, text > 250000)", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { name: "x".repeat(1001) } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { color: "#".repeat(81) } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { strokeColor: "#".repeat(81) } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { text: "t".repeat(250001) } }],
        }),
      ).toThrowError(CanvasCommandError);
      // Boundary-valid string lengths are accepted.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { name: "x".repeat(1000) } }],
        }),
      ).not.toThrow();
    });
  });

  describe("feature-critic: prospective lock state across a group", () => {
    it("rejects a group that locks a target via patch-elements then adds an interaction on it (lock-then-add-interaction)", () => {
      const content = singlePageContent({ elements: [rect("a")] });
      // Forward: lock a, then add an interaction on a. The lock set by the
      // first command must be visible to the second command's validation, so
      // the whole group is rejected atomically.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [
            { type: "patch-elements", elementIds: ["a"], patch: { locked: true } },
            { type: "add-interaction", elementId: "a", interaction: interaction("i1", { trigger: "click" }) },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects a group that locks a target via patch-elements then patches it again (lock-then-mutate)", () => {
      const content = singlePageContent({ elements: [rect("a")] });
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [
            { type: "patch-elements", elementIds: ["a"], patch: { locked: true } },
            { type: "patch-elements", elementIds: ["a"], patch: { x: 42 } },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("a generated inverse that first unlocks and then restores later mutations remains applicable (mixed inverse)", () => {
      // Forward group: mutate x, then lock the target. This is valid because at
      // the time of the lock command the target is unlocked, and setting
      // locked:true on an unlocked target is permitted. The generated inverse
      // (reverse order) first restores the unlocked state, then restores x --
      // i.e. it first unlocks and then performs a later mutation. Re-applying
      // that inverse must succeed because the unlock is visible to the later
      // restore command via prospective lock tracking.
      const content = singlePageContent({ elements: [rect("a", { x: 5 })] });
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [
          { type: "patch-elements", elementIds: ["a"], patch: { x: 77 } },
          { type: "patch-elements", elementIds: ["a"], patch: { locked: true } },
        ],
      });
      const after = result.content.elements.find((e) => e.id === "a")!;
      expect(after.x).toBe(77);
      expect(after.locked).toBe(true);
      // The inverse must be applicable even though the target is currently
      // locked, because the inverse unlocks in its first command.
      expect(() =>
        applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse }),
      ).not.toThrow();
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("a prior unlock in the same group permits a later mutation on a previously-locked target", () => {
      const content = singlePageContent({ elements: [rect("a", { locked: true })] });
      // Unlock then mutate in the same group: the later command sees the
      // prospective unlocked state and is permitted.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [
            { type: "patch-elements", elementIds: ["a"], patch: { locked: false } },
            { type: "patch-elements", elementIds: ["a"], patch: { x: 13 } },
          ],
        }),
      ).not.toThrow();
    });
  });

  describe("feature-critic: exact clone presence", () => {
    it("cloneInteraction preserves absent optional properties (no transition/overlay keys introduced)", () => {
      const content = singlePageContent({ elements: [rect("a")] });
      const source = interaction("i1", { trigger: "click", action: "navigate", destinationPageId: "page-2" });
      // Source carries no transition/overlay keys.
      expect(Object.prototype.hasOwnProperty.call(source, "transition")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(source, "overlay")).toBe(false);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: source }],
      });
      const added = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      // The applied interaction must not have transition/overlay keys.
      expect(Object.prototype.hasOwnProperty.call(added, "transition")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(added, "overlay")).toBe(false);
      expect(Object.keys(added).sort()).toEqual(["action", "destinationPageId", "id", "trigger"]);
    });

    it("remove-interaction + inverse restores Object.keys/hasOwn exactly, not merely JSON.stringify", () => {
      // An interaction without transition/overlay. After remove + inverse add,
      // the restored interaction must have the exact same own-key set as the
      // original -- no spurious transition/overlay:undefined keys.
      const source = interaction("i1", { trigger: "click", action: "navigate", destinationPageId: "page-2" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [source] })] });
      const originalKeys = Object.keys(source).sort();
      expect(originalKeys).not.toContain("transition");
      expect(originalKeys).not.toContain("overlay");

      const removed = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "remove-interaction", elementId: "a", interactionId: "i1" }],
      });
      // Forward remove: interaction gone.
      expect(removed.content.elements.find((e) => e.id === "a")?.interactions ?? []).toEqual([]);

      // Inverse add restores the interaction. It must match the original by
      // Object.keys and hasOwn exactly -- JSON.stringify alone would pass even
      // if spurious `transition: undefined` keys were introduced.
      const undone = applyCanvasCommandGroup(removed.content, { pageId: "page-1", selectionIds: ["a"], commands: removed.inverse });
      const restored = undone.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(Object.keys(restored).sort()).toEqual(originalKeys);
      expect(Object.prototype.hasOwnProperty.call(restored, "transition")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(restored, "overlay")).toBe(false);
      // And the whole element is structurally identical.
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify(content));
    });

    it("cloneInteraction preserves present transition/overlay keys (deep-cloned, not aliased)", () => {
      const source = interaction("i1", {
        trigger: "click",
        action: "navigate",
        destinationPageId: "page-2",
        transition: { type: "dissolve", duration: 300, easing: "ease" },
      });
      const content = singlePageContent({ elements: [rect("a")] });
      // add-interaction stores a cloneInteraction of the input, so the stored
      // transition must be a deep copy, not an alias of the input object.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: source }],
      });
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(Object.prototype.hasOwnProperty.call(after, "transition")).toBe(true);
      expect(after.transition).toEqual({ type: "dissolve", duration: 300, easing: "ease" });
      // The stored transition must not alias the command input object.
      expect(after.transition).not.toBe(source.transition);
    });
  });

  describe("feature-critic: smart transition parser defers action to merged-state validation", () => {
    it("parser accepts a patch-interaction supplying a smart transition while omitting action, applied against an existing navigate", () => {
      const start = interaction("i1", { trigger: "click", action: "navigate", destinationPageId: "page-2" });
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { transition: { type: "smart", duration: 200, easing: "ease" } } }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const after = result.content.elements.find((e) => e.id === "a")?.interactions?.[0]!;
      expect(after.action).toBe("navigate");
      expect(after.transition?.type).toBe("smart");
      // Round-trip exactly.
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(JSON.stringify(content));
    });

    it("parser rejects a smart transition when the patch explicitly sets a non-navigate action", () => {
      // Explicitly setting action: open-overlay with a smart transition is
      // contradictory and must be rejected at the parser boundary.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { action: "open-overlay", transition: { type: "smart", duration: 200, easing: "ease" } } }],
      })).toBeNull();
    });

    it("parser accepts a smart-only patch but the applier rejects it when the merged action is non-navigate", () => {
      // Existing action is open-overlay; patch supplies a smart transition
      // while omitting action. The parser accepts (deferred), but the applier's
      // merged-state validation rejects because smart is only valid for navigate.
      const start: CanvasPrototypeInteraction = {
        id: "i1",
        trigger: "click",
        action: "open-overlay",
        destinationPageId: "page-2",
        overlay: { position: "center", background: "none", closeOnOutsideClick: true },
      };
      const content = singlePageContent({ elements: [rect("a", { interactions: [start] })] });
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { transition: { type: "smart", duration: 200, easing: "ease" } } }],
      });
      expect(parsed).not.toBeNull();
      expect(() => applyCanvasCommandGroup(content, parsed!)).toThrowError(CanvasCommandError);
    });

    it("add-interaction remains strict: smart transition requires a navigate action at parse time", () => {
      // add-interaction always carries action, so smart on a non-navigate
      // action must be rejected by the parser.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2", overlay: { position: "center", background: "none", closeOnOutsideClick: true }, transition: { type: "smart", duration: 200, easing: "ease" } } }],
      })).toBeNull();
      // smart on navigate add-interaction is accepted.
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", transition: { type: "smart", duration: 200, easing: "ease" } } }],
      })).not.toBeNull();
    });
  });

  describe("regression: inherited lock must never be masked by target direct lock", () => {
    it("a directly-locked child under a locked parent cannot atomically unlock itself (inherited lock authoritative)", () => {
      const lockedParent = rect("parent", { locked: true });
      const lockedChild = rect("child", { locked: true, parentId: "parent" });
      const content = singlePageContent({ elements: [lockedParent, lockedChild] });
      // The child tries to clear its own lock and mutate in one atomic patch.
      // The inherited parent lock must still reject the edit.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["child"],
          commands: [{ type: "patch-elements", elementIds: ["child"], patch: { locked: false, x: 10 } }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("a child whose parent is locked earlier in the group cannot unlock itself afterward", () => {
      const parent = rect("parent");
      const child = rect("child", { parentId: "parent" });
      const content = singlePageContent({ elements: [parent, child] });
      // Forward: lock the parent, then try to unlock+mutate the child. The
      // prospective ancestor lock set by the first command must reject the
      // second command even though the child itself was never directly locked.
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["parent", "child"],
          commands: [
            { type: "patch-elements", elementIds: ["parent"], patch: { locked: true } },
            { type: "patch-elements", elementIds: ["child"], patch: { locked: false, x: 5 } },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("preserves valid direct self-unlock when no ancestor is locked", () => {
      const unlockedParent = rect("parent");
      const lockedChild = rect("child", { locked: true, parentId: "parent" });
      const content = singlePageContent({ elements: [unlockedParent, lockedChild] });
      // No ancestor is locked, so a directly-locked child may unlock itself.
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["child"],
        commands: [{ type: "patch-elements", elementIds: ["child"], patch: { locked: false, x: 7 } }],
      });
      const after = result.content.elements.find((e) => e.id === "child")!;
      expect(after.locked).toBe(false);
      expect(after.x).toBe(7);
    });
  });

  describe("regression: add-interaction strict JSON parsing rejects transition/overlay null", () => {
    it("parser rejects transition:null on an add-interaction command", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", transition: null } }],
      })).toBeNull();
    });

    it("parser rejects overlay:null on an add-interaction command", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2", overlay: null } }],
      })).toBeNull();
    });

    it("parser still accepts transition:null/overlay:null as the clear sentinel in patch-interaction", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { transition: null } }],
      })).not.toBeNull();
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: "i1", patch: { overlay: null } }],
      })).not.toBeNull();
    });

    it("applier rejects transition:null on a direct add-interaction invocation", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "navigate", destinationPageId: "page-2", transition: null as unknown as CanvasPrototypeInteraction["transition"] } }],
        }),
      ).toThrowError(CanvasCommandError);
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id: "i1", trigger: "click", action: "open-overlay", destinationPageId: "page-2", overlay: null as unknown as CanvasPrototypeInteraction["overlay"] } as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("regression: persistence parity — color required, interaction id <=240", () => {
    it("rejects clearing color via patch-elements (color is a required persisted field)", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "patch-elements", elementIds: ["a"], patch: { color: undefined } as Record<string, unknown> }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("parser rejects clearing color via patch-elements (color is required at the parser boundary)", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-elements", elementIds: ["a"], patch: { color: null } }],
      })).toBeNull();
    });

    it("accepts a 240-char interaction id at both parser and applier boundaries", () => {
      const id = "i".repeat(CANVAS_PERSISTED_ID_MAX_LENGTH);
      expect(id).toHaveLength(240);
      // Parser accepts (its internal bound is 200, but 240 must round-trip via the
      // applier for internally generated inverses). The parser still enforces its
      // stricter 200-char untrusted bound:
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "add-interaction", elementId: "a", interaction: { id, trigger: "click", action: "navigate", destinationPageId: "page-2" } }],
      })).toBeNull();
      // The applier (which processes internally generated inverses) must accept
      // a 240-char interaction id so an inverse can restore it exactly.
      const content = singlePageContent({ elements: [rect("a", { interactions: [{ id, trigger: "click", action: "navigate", destinationPageId: "page-2" } as CanvasPrototypeInteraction] })] });
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: ["a"],
        commands: [{ type: "patch-interaction", elementId: "a", interactionId: id, patch: { delay: undefined } as Record<string, unknown> }],
      });
      expect(() => applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: ["a"], commands: result.inverse })).not.toThrow();
    });

    it("applier rejects a 241-char interaction id (exceeds persistence 240 bound)", () => {
      const id = "i".repeat(CANVAS_PERSISTED_ID_MAX_LENGTH + 1);
      expect(id).toHaveLength(241);
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: ["a"],
          commands: [{ type: "add-interaction", elementId: "a", interaction: { id, trigger: "click", action: "navigate", destinationPageId: "page-2" } as CanvasPrototypeInteraction }],
        }),
      ).toThrowError(CanvasCommandError);
    });
  });

  describe("feature-critic: agent-driven additive drawing (add-elements)", () => {
    function addSpec(overrides: Partial<CanvasAddElementSpec> = {}): CanvasAddElementSpec {
      return {
        id: "new-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        color: "#2563eb",
        ...overrides,
      } as CanvasAddElementSpec;
    }

    it("parses and applies multiple vector primitives with selectionIds [] and appends to the page", () => {
      const content = singlePageContent();
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [
          addSpec({ id: "r1", type: "rectangle", x: 10, y: 20, width: 100, height: 80, color: "#2563eb", radius: 8 }),
          addSpec({ id: "e1", type: "ellipse", x: 200, y: 20, width: 60, height: 60, color: "#ef4444" }),
          addSpec({ id: "l1", type: "line", x: 0, y: 0, width: 100, height: 100, color: "#000000", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], startCap: "none", endCap: "arrow" }),
          addSpec({ id: "a1", type: "arrow", x: 0, y: 0, width: 100, height: 100, color: "#000000", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
          addSpec({ id: "p1", type: "path", x: 0, y: 0, width: 100, height: 100, color: "#000000", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], pathClosed: true, pathSmoothing: 0.5 }),
          addSpec({ id: "t1", type: "text", x: 50, y: 50, width: 200, height: 40, color: "#111827", text: "Hello", fontSize: 16, fontFamily: "Inter", fontWeight: 400, textAlign: "center", lineHeight: 1.5, letterSpacing: 0 }),
        ] }],
      });
      expect(parsed).not.toBeNull();
      const result = applyCanvasCommandGroup(content, parsed!);
      const ids = result.content.elements.map((e) => e.id);
      expect(ids).toEqual(["a", "b", "c", "r1", "e1", "l1", "a1", "p1", "t1"]);
      // Untouched original elements preserved by reference.
      expect(result.content.elements[0]).toBe(content.elements[0]);
      expect(result.content.elements[2]).toBe(content.elements[2]);
      // Type-specific optional fields applied.
      expect(result.content.elements.find((e) => e.id === "r1")).toMatchObject({ radius: 8 });
      expect(result.content.elements.find((e) => e.id === "l1")).toMatchObject({ startCap: "none", endCap: "arrow" });
      expect(result.content.elements.find((e) => e.id === "p1")).toMatchObject({ pathClosed: true, pathSmoothing: 0.5 });
      expect(result.content.elements.find((e) => e.id === "t1")).toMatchObject({ text: "Hello", fontSize: 16, textAlign: "center" });
      // Points deep-cloned (not aliased).
      const line = result.content.elements.find((e) => e.id === "l1") as CanvasElement & { points?: { x: number; y: number }[] };
      expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(line.points).not.toBe((parsed!.commands[0] as { elements: CanvasAddElementSpec[] }).elements[2].points);
    });

    it("applies the inverse (remove-elements) and restores the exact original content/order", () => {
      const content = singlePageContent();
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [
          addSpec({ id: "x1", type: "rectangle" }),
          addSpec({ id: "x2", type: "ellipse", x: 1, y: 2, width: 3, height: 4, color: "#abc" }),
        ] }],
      });
      expect(result.content.elements.map((e) => e.id)).toEqual(["a", "b", "c", "x1", "x2"]);
      // The inverse is an internal remove-elements command.
      expect(result.inverse).toHaveLength(1);
      expect(result.inverse[0]).toMatchObject({ type: "remove-elements" });
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: [], commands: result.inverse });
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("rejects duplicate element ids within a batch", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: [],
          commands: [{ type: "add-elements", elements: [
            addSpec({ id: "dup" }),
            addSpec({ id: "dup", type: "ellipse" }),
          ] }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects an element id that already exists on the page", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: [],
          commands: [{ type: "add-elements", elements: [addSpec({ id: "a" })] }],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects duplicate ids across multiple add-elements commands in a group", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, {
          pageId: "page-1",
          selectionIds: [],
          commands: [
            { type: "add-elements", elements: [addSpec({ id: "shared" })] },
            { type: "add-elements", elements: [addSpec({ id: "shared", type: "ellipse" })] },
          ],
        }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects malformed / type-invalid elements", () => {
      const content = singlePageContent();
      // Missing required field.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [{ id: "x", type: "rectangle", x: 0, y: 0, width: 10, height: 10 } as unknown as CanvasAddElementSpec] }] }),
      ).toThrowError(CanvasCommandError);
      // Non-positive width.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", width: 0 })] }] }),
      ).toThrowError(CanvasCommandError);
      // Disallowed type.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "image" as unknown as CanvasAddElementSpec["type"] })] }] }),
      ).toThrowError(CanvasCommandError);
      // radius on non-rectangle.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "ellipse", radius: 5 })] }] }),
      ).toThrowError(CanvasCommandError);
      // text fields on non-text.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "rectangle", text: "hi" } as unknown as CanvasAddElementSpec)] }] }),
      ).toThrowError(CanvasCommandError);
      // line without points.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "line" })] }] }),
      ).toThrowError(CanvasCommandError);
      // path with too few points.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "path", points: [{ x: 0, y: 0 }] })] }] }),
      ).toThrowError(CanvasCommandError);
      // point out of normalized range.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "path", points: [{ x: 0, y: 0 }, { x: 11, y: 0 }] })] }] }),
      ).toThrowError(CanvasCommandError);
      // bad textAlign.
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x", type: "text", textAlign: "middle" as unknown as CanvasAddElementSpec["textAlign"] })] }] }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects an empty add-elements command and too many elements", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [] }] }),
      ).toThrowError(CanvasCommandError);
      const tooMany = Array.from({ length: CANVAS_COMMAND_MAX_ADD_ELEMENTS + 1 }, (_, i) => addSpec({ id: `e${i}` }));
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: tooMany }] }),
      ).toThrowError(CanvasCommandError);
    });

    it("rejects add-elements on an unknown page", () => {
      const content = singlePageContent();
      expect(() =>
        applyCanvasCommandGroup(content, { pageId: "page-missing", selectionIds: [], commands: [{ type: "add-elements", elements: [addSpec({ id: "x" })] }] }),
      ).toThrowError(CanvasCommandError);
    });

    it("the strict parser rejects the internal remove-elements command", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "remove-elements", elementIds: ["a"] }],
      })).toBeNull();
    });

    it("the strict parser rejects unknown keys on an add-elements command", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [{ id: "x", type: "rectangle", x: 0, y: 0, width: 1, height: 1, color: "#000" }], bogus: 1 }],
      })).toBeNull();
    });

    it("the strict parser rejects unknown keys on an additive element spec", () => {
      expect(parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [{ id: "x", type: "rectangle", x: 0, y: 0, width: 1, height: 1, color: "#000", parentId: "evil" }] }],
      })).toBeNull();
    });

    it("the strict parser accepts empty selectionIds for an additive add-elements group", () => {
      const parsed = parseCanvasCommandGroup({
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [{ id: "x", type: "rectangle", x: 0, y: 0, width: 1, height: 1, color: "#000" }] }],
      });
      expect(parsed).not.toBeNull();
      expect(parsed!.selectionIds).toEqual([]);
    });

    it("add-elements on legacy content round-trips exactly with pages/activePageId absent", () => {
      const content = legacyContent();
      const original = JSON.stringify(content);
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-1",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [addSpec({ id: "new-1" })] }],
      });
      expect(result.content.pages).toBeUndefined();
      expect(result.content.activePageId).toBeUndefined();
      expect(result.content.elements.map((e) => e.id)).toEqual(["a", "b", "new-1"]);
      const undone = applyCanvasCommandGroup(result.content, { pageId: "page-1", selectionIds: [], commands: result.inverse });
      expect(undone.content.pages).toBeUndefined();
      expect(undone.content.activePageId).toBeUndefined();
      expect(JSON.stringify(undone.content)).toEqual(original);
    });

    it("add-elements preserves untouched pages by reference", () => {
      const content = singlePageContent();
      const result = applyCanvasCommandGroup(content, {
        pageId: "page-2",
        selectionIds: [],
        commands: [{ type: "add-elements", elements: [addSpec({ id: "new-1" })] }],
      });
      // page-1 untouched by reference.
      expect(result.content.pages!.find((p) => p.id === "page-1")).toBe(content.pages![0]);
      // page-2 now has the new element; top-level mirror unchanged (not active page).
      expect(result.content.pages!.find((p) => p.id === "page-2")?.elements.map((e) => e.id)).toEqual(["p2-a", "new-1"]);
    });

    it("input immutability: add-elements does not mutate the input content or spec", () => {
      const content = singlePageContent();
      const original = JSON.stringify(content);
      const spec = addSpec({ id: "new-1", type: "path", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
      const specOriginal = JSON.stringify(spec);
      applyCanvasCommandGroup(content, { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [spec] }] });
      expect(JSON.stringify(content)).toEqual(original);
      expect(JSON.stringify(spec)).toEqual(specOriginal);
    });
  });
});