import { describe, expect, it } from "vitest";
import {
  applyFrameResizeConstraints,
  applyFrameLayout,
  canvasGeometryIndex,
  canvasLayerTree,
  canvasPages,
  canvasPrototypeFlows,
  canvasThumbnailElements,
  canvasVirtualRange,
  canvasViewportElements,
  descendantIds,
  effectivePrimitive,
  isCanvasNode,
  prepareCanvasSnapIndex,
  selectionRect,
  snapCanvasMove,
} from "../../../src/renderer/src/studio/canvas-model";
import type { CanvasComponentNode, CanvasNode, CanvasPrimitiveNode } from "../../../src/renderer/src/studio/canvas-model";

const frame: CanvasPrimitiveNode = {
  id: "frame-a",
  type: "frame",
  name: "Stack",
  x: 40,
  y: 60,
  width: 300,
  height: 120,
  color: "#ffffff",
  layout: { direction: "row", align: "center", justify: "start", gap: 12, padding: 20, sizing: "hug" },
};

const first: CanvasPrimitiveNode = { id: "first", parentId: frame.id, type: "rectangle", x: 0, y: 0, width: 80, height: 40, color: "#2563eb" };
const second: CanvasPrimitiveNode = { id: "second", parentId: frame.id, type: "ellipse", x: 0, y: 0, width: 48, height: 48, color: "#f59e0b" };

describe("Khadim canvas scene model", () => {
  it("recognizes native designer primitives and rejects unrelated Excalidraw records", () => {
    expect(isCanvasNode(first)).toBe(true);
    expect(isCanvasNode({ ...second, type: "line" })).toBe(true);
    expect(isCanvasNode({ ...second, type: "image", src: "data:image/png;base64,AA==" })).toBe(true);
    expect(isCanvasNode({ id: "legacy", type: "rectangle", x: 0, y: 0, width: 20, height: 20, color: "#fff", version: 1 })).toBe(true);
    expect(isCanvasNode({ id: "real-excalidraw", type: "rectangle", x: 0, y: 0, width: 20, height: 20 })).toBe(false);
    expect(isCanvasNode({ id: "path", type: "freedraw", points: [[0, 0], [2, 4]] })).toBe(false);
  });

  it("lays out frame children using explicit parent links and hug sizing", () => {
    const grandchild: CanvasPrimitiveNode = { ...second, id: "grandchild", parentId: first.id, x: 10, y: 12, width: 20, height: 20 };
    const result = applyFrameLayout([frame, first, second, grandchild], frame.id, []);
    expect(result.find((node) => node.id === frame.id)).toMatchObject({ width: 180, height: 88 });
    expect(result.find((node) => node.id === first.id)).toMatchObject({ x: 60, y: 84 });
    expect(result.find((node) => node.id === second.id)).toMatchObject({ x: 152, y: 80 });
    expect(result.find((node) => node.id === grandchild.id)).toMatchObject({ x: 70, y: 96 });
  });

  it("propagates nested hug-size changes through ancestor auto-layout frames", () => {
    const outer: CanvasPrimitiveNode = { ...frame, id: "outer", x: 0, y: 0, layout: { ...frame.layout!, direction: "column" } };
    const inner: CanvasPrimitiveNode = { ...frame, id: "inner", parentId: outer.id, x: 20, y: 20, width: 80, height: 60 };
    const leaf: CanvasPrimitiveNode = { ...first, id: "leaf", parentId: inner.id, width: 160, height: 30 };
    const result = applyFrameLayout([outer, inner, leaf], inner.id, []);
    expect(result.find((node) => node.id === inner.id)).toMatchObject({ width: 200, height: 70 });
    expect(result.find((node) => node.id === outer.id)).toMatchObject({ width: 240, height: 110 });
  });

  it("wraps fixed auto-layout children into lines with an independent cross gap", () => {
    const wrappingFrame: CanvasPrimitiveNode = { ...frame, id: "wrapping", x: 40, y: 60, width: 220, height: 220, layout: { direction: "row", align: "start", justify: "start", gap: 10, crossGap: 12, padding: 10, sizing: "fixed", wrap: true } };
    const children: CanvasPrimitiveNode[] = [
      { ...first, id: "wrap-a", parentId: wrappingFrame.id, width: 80, height: 40 },
      { ...first, id: "wrap-b", parentId: wrappingFrame.id, width: 80, height: 48 },
      { ...first, id: "wrap-c", parentId: wrappingFrame.id, width: 80, height: 30 },
    ];

    const result = applyFrameLayout([wrappingFrame, ...children], wrappingFrame.id, []);

    expect(result.find((node) => node.id === "wrap-a")).toMatchObject({ x: 50, y: 70 });
    expect(result.find((node) => node.id === "wrap-b")).toMatchObject({ x: 140, y: 70 });
    expect(result.find((node) => node.id === "wrap-c")).toMatchObject({ x: 50, y: 130 });
  });

  it("tracks descendants and computes selection bounds without relying on rendering", () => {
    const nested: CanvasNode = { ...first, id: "nested", parentId: second.id };
    expect(descendantIds([frame, first, second, nested], [frame.id])).toEqual(expect.arrayContaining([first.id, second.id, nested.id]));
    expect(selectionRect([first, second], [])).toEqual({ x: 0, y: 0, width: 80, height: 48 });
  });

  it("snaps move bounds to semantic shape centers and returns bounded feedback lines", () => {
    const result = snapCanvasMove({
      bounds: { x: 10, y: 20, width: 40, height: 30 },
      deltaX: 94,
      deltaY: 28,
      rectTargets: [{ id: "target", rect: { x: 100, y: 50, width: 50, height: 80 } }],
      threshold: 6,
      pageRect: { x: 0, y: 0, width: 500, height: 400 },
    });

    expect(result).toMatchObject({ deltaX: 95, deltaY: 30 });
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: "x", position: 125, from: 50, to: 130, kind: "shape" }),
      expect.objectContaining({ axis: "y", position: 50, from: 100, to: 150, kind: "shape" }),
    ]));
  });

  it("snaps between nearby peers at equal distances and exposes both measurements", () => {
    const result = snapCanvasMove({
      bounds: { x: 50, y: 60, width: 40, height: 40 },
      deltaX: 26,
      deltaY: 0,
      rectTargets: [
        { id: "left", rect: { x: 0, y: 60, width: 40, height: 40 } },
        { id: "right", rect: { x: 160, y: 60, width: 40, height: 40 } },
      ],
      threshold: 6,
      pageRect: { x: 0, y: 0, width: 500, height: 400 },
    });

    expect(result.deltaX).toBe(30);
    expect(result.measurements).toEqual([
      expect.objectContaining({ axis: "x", start: 40, end: 80, value: 40 }),
      expect.objectContaining({ axis: "x", start: 120, end: 160, value: 40 }),
    ]);
    expect(result.lines.filter((line) => line.axis === "x")).toHaveLength(0);

    const vertical = snapCanvasMove({
      bounds: { x: 60, y: 50, width: 40, height: 40 },
      deltaX: 0,
      deltaY: 26,
      rectTargets: [
        { id: "top", rect: { x: 60, y: 0, width: 40, height: 40 } },
        { id: "bottom", rect: { x: 60, y: 160, width: 40, height: 40 } },
      ],
      threshold: 6,
      pageRect: { x: 0, y: 0, width: 500, height: 500 },
    });
    expect(vertical.deltaY).toBe(30);
    expect(vertical.measurements).toEqual([
      expect.objectContaining({ axis: "y", start: 40, end: 80, value: 40 }),
      expect.objectContaining({ axis: "y", start: 120, end: 160, value: 40 }),
    ]);
  });

  it("prefers explicit ruler and layout guides when snap coordinates coincide", () => {
    const result = snapCanvasMove({
      bounds: { x: 48, y: 30, width: 40, height: 40 },
      deltaX: 1,
      deltaY: 0,
      rectTargets: [{ id: "shape", rect: { x: 50, y: 10, width: 60, height: 80 } }],
      axisTargets: [
        { axis: "x", position: 50, kind: "layout-grid", from: 0, to: 200 },
        { axis: "x", position: 50, kind: "guide", from: 0, to: 300 },
      ],
      threshold: 6,
      pageRect: { x: 0, y: 0, width: 500, height: 400 },
    });

    expect(result.deltaX).toBe(2);
    expect(result.lines).toEqual(expect.arrayContaining([expect.objectContaining({ axis: "x", position: 50, from: 0, to: 300, kind: "guide" })]));
  });

  it("falls back to the configured grid and bypasses every snap source on demand", () => {
    const input = {
      bounds: { x: 13, y: 17, width: 40, height: 40 },
      deltaX: 10,
      deltaY: 10,
      rectTargets: [],
      axisTargets: [{ axis: "x" as const, position: 26, kind: "guide" as const }],
      threshold: 3,
      pageRect: { x: 0, y: 0, width: 500, height: 400 },
      snapToGrid: true,
      gridSize: 8,
    };

    expect(snapCanvasMove(input)).toMatchObject({ deltaX: 13, deltaY: 7, lines: [expect.objectContaining({ kind: "guide", position: 26 })] });
    expect(snapCanvasMove({ ...input, disabled: true })).toEqual({ deltaX: 10, deltaY: 10, lines: [], measurements: [] });
  });

  it("resolves snapping across large peer sets without recursive traversal", () => {
    const rectTargets = Array.from({ length: 10_000 }, (_, index) => ({
      id: `far-${index}`,
      rect: { x: 1_000 + index * 100, y: 1_000, width: 40, height: 40 },
    }));
    rectTargets.push({ id: "near", rect: { x: 100, y: 0, width: 20, height: 20 } });

    const pageRect = { x: 0, y: 0, width: 100_000, height: 100_000 };
    const result = snapCanvasMove({
      bounds: { x: 0, y: 0, width: 20, height: 20 },
      deltaX: 89,
      deltaY: 0,
      snapIndex: prepareCanvasSnapIndex(rectTargets, [], pageRect),
      threshold: 6,
      pageRect,
    });

    expect(result.deltaX).toBe(90);
    expect(result.lines).toEqual(expect.arrayContaining([expect.objectContaining({ axis: "x", position: 100 })]));
  });

  it("keeps instance overrides local to the linked component copy", () => {
    const source: CanvasPrimitiveNode = { ...first, id: "label", type: "text", text: "Continue" };
    const instance: CanvasComponentNode = { id: "instance", type: "component", componentId: "button", componentRole: "instance", x: 0, y: 0, width: 80, height: 40, color: "#2563eb", overrides: { label: { text: "Ship now", color: "#ffffff" } } };
    expect(effectivePrimitive(source, instance)).toMatchObject({ text: "Ship now", color: "#ffffff" });
    expect(source.text).toBe("Continue");
  });

  it("applies explicit frame constraints recursively during resize", () => {
    const fixedFrame: CanvasPrimitiveNode = { ...frame, id: "fixed", x: 100, y: 100, width: 200, height: 160, layout: undefined };
    const rightBottom: CanvasPrimitiveNode = { ...first, id: "right-bottom", parentId: fixedFrame.id, x: 240, y: 210, width: 40, height: 30, constraintH: "right", constraintV: "bottom" };
    const stretched: CanvasPrimitiveNode = { ...first, id: "stretched", parentId: fixedFrame.id, x: 120, y: 130, width: 160, height: 80, constraintH: "left-right", constraintV: "top-bottom" };
    const scaledFrame: CanvasPrimitiveNode = { ...fixedFrame, id: "scaled-frame", parentId: fixedFrame.id, x: 140, y: 140, width: 100, height: 80, constraintH: "scale", constraintV: "scale" };
    const nested: CanvasPrimitiveNode = { ...first, id: "nested", parentId: scaledFrame.id, x: 160, y: 160, width: 20, height: 20, constraintH: "right", constraintV: "bottom" };
    const before = [fixedFrame, rightBottom, stretched, scaledFrame, nested];
    const resized = before.map((node) => node.id === fixedFrame.id ? { ...node, width: 400, height: 320 } : node);
    const result = applyFrameResizeConstraints(before, resized, fixedFrame.id);

    expect(result.find((node) => node.id === rightBottom.id)).toMatchObject({ x: 440, y: 370, width: 40, height: 30 });
    expect(result.find((node) => node.id === stretched.id)).toMatchObject({ x: 120, y: 130, width: 360, height: 240 });
    expect(result.find((node) => node.id === scaledFrame.id)).toMatchObject({ x: 180, y: 180, width: 200, height: 160 });
    expect(result.find((node) => node.id === nested.id)).toMatchObject({ x: 300, y: 280, width: 20, height: 20 });
  });

  it("upgrades a legacy single-page scene into a stable page snapshot", () => {
    const pages = canvasPages({ format: "khadim-canvas", sceneVersion: 1, frame: { width: 960, height: 600 }, elements: [first], components: [], appState: { viewBackgroundColor: "#ffffff", snapToGrid: true }, files: {} });
    expect(pages).toEqual([{ id: "page-1", name: "Page 1", frame: { width: 960, height: 600 }, elements: [first], appState: { viewBackgroundColor: "#ffffff", snapToGrid: true } }]);
  });

  it("normalizes named prototype flows and upgrades the legacy start page", () => {
    const pages = canvasPages({ format: "khadim-canvas", sceneVersion: 1, frame: { width: 960, height: 600 }, elements: [first], components: [], appState: { viewBackgroundColor: "#ffffff", snapToGrid: true }, files: {} });
    expect(canvasPrototypeFlows({ prototypeStartPageId: pages[0].id }, pages)).toEqual([{ id: "default-flow", name: "Main flow", startPageId: pages[0].id }]);
    expect(canvasPrototypeFlows({ prototypeFlows: [{ id: "journey", name: "  Checkout  ", startPageId: pages[0].id }, { id: "journey", name: "Duplicate", startPageId: pages[0].id }, { id: "stale", name: "Stale", startPageId: "missing" }] }, pages)).toEqual([{ id: "journey", name: "Checkout", startPageId: pages[0].id }]);
  });

  it("indexes large scene geometry and inherited interaction flags without recursive walks", () => {
    const nodes: CanvasNode[] = Array.from({ length: 5_000 }, (_, index) => ({
      ...first,
      id: `node-${index}`,
      parentId: index ? `node-${index - 1}` : undefined,
      x: index,
      hidden: index === 12,
      locked: index === 24,
    }));

    const index = canvasGeometryIndex(nodes, []);

    expect(index).toHaveLength(5_000);
    expect(index[11]).toMatchObject({ hidden: false, locked: false, rect: { x: 11, y: 0, width: 80, height: 40 }, visualRect: { x: 11, y: 0, width: 80, height: 40 } });
    expect(index[12]).toMatchObject({ hidden: true, locked: false });
    expect(index[24]).toMatchObject({ hidden: true, locked: true });
    expect(index.at(-1)).toMatchObject({ hidden: true, locked: true });
  });

  it("bounds thumbnail scenes while retaining backdrops, top layers, and dependencies", () => {
    const nodes: CanvasNode[] = Array.from({ length: 600 }, (_, index) => ({
      ...first,
      id: `layer-${index}`,
      parentId: index === 599 ? "layer-200" : undefined,
      maskId: index === 599 ? "layer-300" : undefined,
    }));

    const preview = canvasThumbnailElements(nodes, 120);
    const ids = new Set(preview.map((node) => node.id));

    expect(preview.length).toBeLessThanOrEqual(240);
    expect(ids.has("layer-0")).toBe(true);
    expect(ids.has("layer-599")).toBe(true);
    expect(ids.has("layer-300")).toBe(true);
    expect(ids.has("layer-200")).toBe(true);
  });

  it("culls distant scene nodes while retaining selected layers and dependencies", () => {
    const components = [{ id: "blur-card", name: "Blur card", width: 80, height: 40, nodes: [{ ...first, id: "surface", x: 0, y: 0, layerBlur: { value: 80, visible: true } }] }];
    const nodes: CanvasNode[] = [
      { ...frame, id: "visible-parent", x: 0, y: 0, width: 500, height: 400 },
      { ...first, id: "visible", parentId: "visible-parent", x: 40, y: 40 },
      { ...first, id: "distant", x: 5_000, y: 5_000 },
      { ...first, id: "shadow-nearby", x: 1_070, y: 40, shadow: { color: "#000000", x: -120, y: 0, blur: 80, opacity: .2 } },
      { ...first, id: "stack-shadow-nearby", x: 1_000, y: 100, shadows: [{ id: "drop", visible: true, type: "drop", color: "#000000", x: -120, y: 0, blur: 80, spread: 10, opacity: .2 }] },
      { ...first, id: "inner-shadow-distant", x: 1_070, y: 180, shadows: [{ id: "inner", visible: true, type: "inner", color: "#000000", x: -120, y: 0, blur: 80, spread: 10, opacity: .2 }] },
      { ...first, id: "blur-nearby", x: 880, y: 40, layerBlur: { value: 50, visible: true } },
      { ...first, id: "outside-stroke-nearby", x: 830, y: 100, strokes: [{ id: "outer", visible: true, color: "#111827", opacity: 1, width: 40, alignment: "outside", style: "solid" }] },
      { ...first, id: "inside-stroke-distant", x: 830, y: 180, strokes: [{ id: "inner", visible: true, color: "#111827", opacity: 1, width: 40, alignment: "inside", style: "solid" }] },
      { ...first, id: "arrowhead-nearby", type: "arrow", x: 850, y: 260, width: 100, height: 40, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], strokes: [{ id: "arrow-stroke", visible: true, color: "#111827", opacity: 1, width: 10, alignment: "center", style: "solid" }] },
      { id: "blur-component", type: "component", componentId: "blur-card", componentRole: "instance", x: 940, y: 140, width: 80, height: 40, color: "#ffffff" },
      { ...first, id: "curved-nearby", type: "path", x: 1_200, y: 80, width: 100, height: 100, points: [{ x: 0, y: 0, handleOut: { x: -8, y: 0 } }, { x: 1, y: 1, handleIn: { x: -8, y: 1 } }], strokeWidth: 2 },
      { ...first, id: "selected-distant", x: 6_000, y: 6_000, maskId: "mask" },
      { ...first, id: "mask", x: 6_000, y: 6_000 },
      { ...frame, id: "boolean", type: "boolean", booleanOperation: "union", x: 7_000, y: 7_000 },
      { ...first, id: "operand-a", parentId: "boolean", x: 7_000, y: 7_000 },
      { ...second, id: "operand-b", parentId: "boolean", x: 7_020, y: 7_000 },
    ];

    const culled = canvasViewportElements(canvasGeometryIndex(nodes, components), { x: -100, y: -100, width: 900, height: 700 }, ["selected-distant"], "boolean");
    const ids = new Set(culled.map((node) => node.id));

    expect(ids).toEqual(new Set(["visible-parent", "visible", "shadow-nearby", "stack-shadow-nearby", "blur-nearby", "outside-stroke-nearby", "arrowhead-nearby", "blur-component", "curved-nearby", "selected-distant", "mask", "boolean", "operand-a", "operand-b"]));
    expect(ids.has("distant")).toBe(false);
    expect(ids.has("inside-stroke-distant")).toBe(false);
    expect(ids.has("inner-shadow-distant")).toBe(false);
  });

  it("calculates bounded layer-rail windows with overscan and stable spacers", () => {
    expect(canvasVirtualRange(1_000, 16_000, 320, 32, 10)).toEqual({ start: 490, end: 520, before: 15_680, after: 15_360 });
    expect(canvasVirtualRange(12, 0, 0, 32)).toEqual({ start: 0, end: 12, before: 0, after: 0 });
  });

  it("flattens deeply nested layer rails without recursive stack growth", () => {
    const nodes: CanvasNode[] = Array.from({ length: 8_000 }, (_, index) => ({
      ...first,
      id: `nested-${index}`,
      parentId: index ? `nested-${index - 1}` : undefined,
    }));

    const tree = canvasLayerTree(nodes);

    expect(tree.rows).toHaveLength(8_000);
    expect(tree.rows[0].id).toBe("nested-0");
    expect(tree.rows.at(-1)?.id).toBe("nested-7999");
    expect(tree.depthById.get("nested-7999")).toBe(8);
  });
});
