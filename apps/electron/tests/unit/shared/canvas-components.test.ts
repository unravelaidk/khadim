import { describe, expect, it } from "vitest";
import { CANVAS_COMPONENT_MAX_DEPTH, canvasComponentGraphIssue, canvasComponentLegacyOverridePaths, canvasComponentPrimitiveSources } from "../../../src/shared/canvas-components";
import type { CanvasComponentDefinition } from "../../../src/shared/types";

const primitive = (id: string, text = id) => ({ id, type: "text" as const, x: 0, y: 0, width: 100, height: 24, color: "#111827", text });
const instance = (id: string, componentId: string) => ({ id, type: "component" as const, componentId, componentRole: "instance" as const, x: 0, y: 0, width: 100, height: 40, color: "#ffffff" });

describe("canvas component graphs", () => {
  it("flattens nested primitive paths and composes authored nested overrides", () => {
    const button: CanvasComponentDefinition = { id: "button", name: "Button", width: 100, height: 40, nodes: [primitive("label", "Continue")] };
    const card: CanvasComponentDefinition = { id: "card", name: "Card", width: 200, height: 120, nodes: [{ ...instance("action", "button"), x: 50, y: 60, overrides: { label: { text: "Buy now" } } }] };

    expect(canvasComponentPrimitiveSources(card, [button, card])).toEqual([
      expect.objectContaining({ path: "action/label", node: expect.objectContaining({ text: "Continue" }), effective: expect.objectContaining({ text: "Buy now" }) }),
    ]);
    expect(canvasComponentGraphIssue([button, card])).toBeUndefined();
  });

  it("escapes local path segments so direct and nested ids cannot collide", () => {
    const leaf: CanvasComponentDefinition = { id: "leaf", name: "Leaf", width: 100, height: 40, nodes: [primitive("b", "Nested")] };
    const root: CanvasComponentDefinition = { id: "root", name: "Root", width: 100, height: 40, nodes: [primitive("a/b", "Direct"), instance("a", "leaf")] };

    expect(canvasComponentPrimitiveSources(root, [leaf, root]).map(({ path, node }) => [path, node.text])).toEqual([
      ["a~1b", "Direct"],
      ["a/b", "Nested"],
    ]);
    expect(canvasComponentLegacyOverridePaths(root, [leaf, root]).has("a~1b")).toBe(false);
  });

  it("honors unambiguous raw override keys authored before path escaping", () => {
    const decoration: CanvasComponentDefinition = { id: "decoration", name: "Decoration", width: 10, height: 10, nodes: [primitive("dot")] };
    const leaf: CanvasComponentDefinition = { id: "leaf", name: "Leaf", width: 100, height: 40, nodes: [primitive("a/b", "Original"), instance("decoration", "decoration")] };
    const root: CanvasComponentDefinition = { id: "root", name: "Root", width: 100, height: 40, nodes: [{ ...instance("child", "leaf"), overrides: { "a/b": { text: "Legacy" } } }] };

    expect(canvasComponentPrimitiveSources(root, [decoration, leaf, root])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "child/a~1b", effective: expect.objectContaining({ text: "Legacy" }) }),
    ]));
  });

  it("reports missing links, indirect cycles, and excessive nesting", () => {
    const missing: CanvasComponentDefinition = { id: "missing-root", name: "Missing", width: 100, height: 40, nodes: [instance("lost", "unknown")] };
    expect(canvasComponentGraphIssue([missing])).toEqual({ kind: "missing", componentId: "missing-root", referencedId: "unknown" });

    const first: CanvasComponentDefinition = { id: "first", name: "First", width: 100, height: 40, nodes: [instance("second-link", "second")] };
    const second: CanvasComponentDefinition = { id: "second", name: "Second", width: 100, height: 40, nodes: [instance("first-link", "first")] };
    expect(canvasComponentGraphIssue([first, second])).toEqual({ kind: "cycle", componentId: "first" });

    const deep = Array.from({ length: CANVAS_COMPONENT_MAX_DEPTH + 1 }, (_, index): CanvasComponentDefinition => ({
      id: `depth-${index}`,
      name: `Depth ${index}`,
      width: 100,
      height: 40,
      nodes: index === CANVAS_COMPONENT_MAX_DEPTH ? [primitive("leaf")] : [instance(`link-${index}`, `depth-${index + 1}`)],
    }));
    expect(canvasComponentGraphIssue(deep)).toMatchObject({ kind: "depth" });
    expect(canvasComponentGraphIssue([...deep].reverse())).toMatchObject({ kind: "depth" });

    const expanding = Array.from({ length: 16 }, (_, index): CanvasComponentDefinition => ({
      id: `fan-${index}`,
      name: `Fan ${index}`,
      width: 100,
      height: 40,
      nodes: index === 15 ? [primitive("leaf")] : [instance(`left-${index}`, `fan-${index + 1}`), instance(`right-${index}`, `fan-${index + 1}`)],
    }));
    expect(canvasComponentGraphIssue(expanding)).toMatchObject({ kind: "size" });
  });
});
