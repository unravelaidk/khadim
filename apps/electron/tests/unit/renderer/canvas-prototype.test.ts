import { describe, expect, it } from "vitest";
import { canvasPrototypeInteractiveElements, canvasPrototypeLayerMatches, canvasPrototypePageLayers } from "../../../src/renderer/src/studio/canvas-prototype";
import type { CanvasComponentDefinition, CanvasPage } from "../../../src/shared/types";

const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };

describe("canvas prototype matching", () => {
  it("matches unique root layers by authored key and includes their descendants", () => {
    const source: CanvasPage = { id: "source", name: "Source", frame: { width: 960, height: 600 }, appState, elements: [
      { id: "source-shell", type: "frame", name: "Shell", x: 0, y: 0, width: 400, height: 300, color: "#f8fafc" },
      { id: "source-card", parentId: "source-shell", type: "frame", prototypeKey: "hero", x: 40, y: 60, width: 240, height: 160, color: "#ffffff" },
      { id: "source-title", parentId: "source-card", type: "text", x: 64, y: 84, width: 160, height: 40, color: "#111827", text: "Hello" },
    ] };
    const destination: CanvasPage = { id: "destination", name: "Destination", frame: { width: 960, height: 600 }, appState, elements: [
      { id: "destination-shell", type: "frame", name: "Shell", x: 0, y: 0, width: 900, height: 560, color: "#f8fafc" },
      { id: "destination-card", parentId: "destination-shell", type: "frame", prototypeKey: "hero", x: 520, y: 180, width: 320, height: 220, color: "#ffffff" },
      { id: "destination-title", parentId: "destination-card", type: "text", x: 552, y: 220, width: 180, height: 44, color: "#111827", text: "Hello" },
    ] };

    expect(canvasPrototypeLayerMatches(source, destination)).toEqual([
      expect.objectContaining({ key: "key:hero", sourceElementIds: ["source-card", "source-title"], destinationElementIds: ["destination-card", "destination-title"] }),
    ]);
  });

  it("falls back to unique names but avoids ambiguous or differently sized screens", () => {
    const source: CanvasPage = { id: "source", name: "Source", frame: { width: 960, height: 600 }, appState, elements: [
      { id: "a", type: "rectangle", name: "Card", x: 0, y: 0, width: 100, height: 80, color: "#ffffff" },
      { id: "b", type: "rectangle", name: "Card", x: 120, y: 0, width: 100, height: 80, color: "#ffffff" },
      { id: "logo-a", type: "ellipse", name: "Logo", x: 20, y: 20, width: 40, height: 40, color: "#2563eb" },
    ] };
    const destination: CanvasPage = { id: "destination", name: "Destination", frame: { width: 960, height: 600 }, appState, elements: [
      { id: "card", type: "rectangle", name: "Card", x: 0, y: 0, width: 100, height: 80, color: "#ffffff" },
      { id: "logo-b", type: "ellipse", name: "Logo", x: 700, y: 40, width: 64, height: 64, color: "#2563eb" },
    ] };

    expect(canvasPrototypeLayerMatches(source, destination).map((match) => match.key)).toEqual(["name:Logo"]);
    expect(canvasPrototypeLayerMatches(source, { ...destination, frame: { width: 400, height: 300 } })).toEqual([]);
    expect(canvasPrototypeLayerMatches({ ...source, prototypeViewport: { width: 960, height: 400, direction: "vertical", preservePosition: false } }, destination)).toEqual([]);
  });

  it("pins complete topmost fixed subtrees and leaves unrelated layers scrolling", () => {
    const page: CanvasPage = { id: "long", name: "Long page", frame: { width: 400, height: 1600 }, appState, prototypeViewport: { width: 400, height: 800, direction: "vertical", preservePosition: true }, elements: [
      { id: "body", type: "frame", x: 0, y: 72, width: 400, height: 1528, color: "#f8fafc" },
      { id: "card", parentId: "body", type: "rectangle", x: 24, y: 120, width: 352, height: 180, color: "#ffffff" },
      { id: "header", type: "frame", fixedInPrototype: true, x: 0, y: 0, width: 400, height: 72, color: "#ffffff" },
      { id: "logo", parentId: "header", type: "rectangle", fixedInPrototype: true, x: 24, y: 16, width: 40, height: 40, color: "#2563eb" },
    ] };

    const layers = canvasPrototypePageLayers(page);
    expect(layers.fixedRootIds).toEqual(["header"]);
    expect([...layers.fixedElementIds]).toEqual(["header", "logo"]);
    expect(layers.scrollingElementIds).toEqual(["body", "card"]);
  });

  it("keeps expanded owner ids unique for delimiter-ambiguous root and path tuples", () => {
    const components: CanvasComponentDefinition[] = [
      { id: "leaf", name: "Leaf", width: 40, height: 40, nodes: [{ id: "c", type: "rectangle", x: 0, y: 0, width: 40, height: 40, color: "#2563eb", interactions: [{ id: "go", trigger: "click", action: "back" }] }] },
      { id: "nested", name: "Nested", width: 40, height: 40, nodes: [{ id: "b", type: "component", componentId: "leaf", componentRole: "instance", x: 0, y: 0, width: 40, height: 40, color: "#ffffff" }] },
    ];
    const page: CanvasPage = { id: "owners", name: "Owners", frame: { width: 200, height: 100 }, appState, elements: [
      { id: "a", type: "component", componentId: "nested", componentRole: "instance", x: 0, y: 0, width: 40, height: 40, color: "#ffffff" },
      { id: "a/b", type: "component", componentId: "leaf", componentRole: "instance", x: 80, y: 0, width: 40, height: 40, color: "#ffffff" },
    ] };

    const ownerIds = canvasPrototypeInteractiveElements(page, components).filter((element) => element.interactions?.length).map((element) => element.id);
    expect(ownerIds).toHaveLength(2);
    expect(new Set(ownerIds).size).toBe(2);
  });

  it("treats a boolean group as atomic when one of its operands is fixed", () => {
    const page: CanvasPage = { id: "boolean", name: "Boolean", frame: { width: 400, height: 800 }, appState, elements: [
      { id: "content", type: "rectangle", x: 0, y: 100, width: 400, height: 700, color: "#ffffff" },
      { id: "shape", type: "boolean", booleanOperation: "union", x: 20, y: 20, width: 120, height: 60, color: "#2563eb" },
      { id: "operand-a", parentId: "shape", type: "rectangle", fixedInPrototype: true, x: 20, y: 20, width: 80, height: 60, color: "#2563eb" },
      { id: "operand-b", parentId: "shape", type: "ellipse", x: 60, y: 20, width: 80, height: 60, color: "#2563eb" },
    ] };

    const layers = canvasPrototypePageLayers(page);
    expect(layers.fixedRootIds).toEqual(["shape"]);
    expect([...layers.fixedElementIds]).toEqual(["shape", "operand-a", "operand-b"]);
    expect(layers.scrollingElementIds).toEqual(["content"]);
  });

  it("bounds the number of independently rendered smart layers", () => {
    const elements = Array.from({ length: 80 }, (_, index) => ({ id: `layer-${index}`, type: "rectangle" as const, name: `Layer ${index}`, x: index * 2, y: index * 2, width: 40, height: 40, color: "#2563eb" }));
    const source: CanvasPage = { id: "source", name: "Source", frame: { width: 960, height: 600 }, appState, elements };
    const destination: CanvasPage = { id: "destination", name: "Destination", frame: { width: 960, height: 600 }, appState, elements: elements.map((element) => ({ ...element, x: element.x + 100 })) };

    expect(canvasPrototypeLayerMatches(source, destination)).toHaveLength(32);
  });

  it("resolves deeply nested keyed scenes without walking every ancestor per candidate", () => {
    const elements = Array.from({ length: 8_000 }, (_, index) => ({
      id: `nested-${index}`,
      parentId: index ? `nested-${index - 1}` : undefined,
      type: "frame" as const,
      prototypeKey: `key-${index}`,
      x: index,
      y: index,
      width: 100,
      height: 100,
      color: "#ffffff",
    }));
    const source: CanvasPage = { id: "source", name: "Source", frame: { width: 10_000, height: 10_000 }, appState, elements };
    const destination: CanvasPage = { id: "destination", name: "Destination", frame: { width: 10_000, height: 10_000 }, appState, elements: elements.map((element) => ({ ...element, x: element.x + 10 })) };

    expect(canvasPrototypeLayerMatches(source, destination)).toEqual([
      expect.objectContaining({ key: "key:key-7999", sourceElementIds: ["nested-7999"], destinationElementIds: ["nested-7999"] }),
    ]);
  });
});
