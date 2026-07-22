import { describe, expect, it } from "vitest";
import { canvasCornerRadii, canvasPathAbsolutePoints, canvasPathData, canvasRoundedRectPath, normalizeCanvasPath, resolveCanvasConnectors } from "../../../src/shared/canvas-geometry";
import type { CanvasElement } from "../../../src/shared/types";

describe("canvas vector geometry", () => {
  it("normalizes authored points without losing their absolute geometry", () => {
    const normalized = normalizeCanvasPath([{ x: 20, y: 30 }, { x: 70, y: 50 }, { x: 120, y: 130 }]);

    expect(normalized).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 100,
      points: [{ x: 0, y: 0 }, { x: .5, y: .2 }, { x: 1, y: 1 }],
    });
    expect(canvasPathAbsolutePoints(normalized)).toEqual([{ x: 20, y: 30 }, { x: 70, y: 50 }, { x: 120, y: 130 }]);
    expect(canvasPathData(canvasPathAbsolutePoints(normalized), .65, true)).toMatch(/^M 20 30 Q 70 50 .+ T 120 130 Z$/);
  });

  it("preserves explicit bezier handles through normalization and renders cubic segments", () => {
    const normalized = normalizeCanvasPath([
      { x: 10, y: 20, handleOut: { x: 30, y: 10 }, nodeType: "smooth" },
      { x: 90, y: 80, handleIn: { x: 70, y: 90 }, nodeType: "smooth" },
    ]);

    const points = canvasPathAbsolutePoints(normalized);
    expect(points).toEqual([
      { x: 10, y: 20, handleOut: { x: 30, y: 10 }, nodeType: "smooth" },
      { x: 90, y: 80, handleIn: { x: 70, y: 90 }, nodeType: "smooth" },
    ]);
    expect(canvasPathData(points)).toBe("M 10 20 C 30 10 70 90 90 80");
  });

  it("keeps bound arrow endpoints attached when their targets move", () => {
    const nodes: CanvasElement[] = [
      { id: "source", type: "rectangle", x: 10, y: 20, width: 100, height: 60, color: "#ffffff" },
      { id: "target", type: "ellipse", x: 300, y: 180, width: 80, height: 40, color: "#ffffff" },
      { id: "connector", type: "arrow", x: 0, y: 0, width: 1, height: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#17181c", startBindingId: "source", endBindingId: "target" },
    ];

    const connector = resolveCanvasConnectors(nodes).find((node) => node.id === "connector");
    expect(connector?.type).toBe("arrow");
    if (!connector || connector.type !== "arrow") throw new Error("Expected connector");
    const [start, end] = canvasPathAbsolutePoints(connector);
    expect(start.x).toBeCloseTo(110);
    expect(start.y).toBeCloseTo(76.786, 2);
    expect(end.x).toBeCloseTo(312.708, 2);
    expect(end.y).toBeCloseTo(185.379, 2);
  });

  it("detaches a connector cleanly when its target is deleted", () => {
    const connector: CanvasElement = { id: "connector", type: "arrow", x: 10, y: 20, width: 100, height: 80, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#17181c", startBindingId: "deleted", endBindingId: "also-deleted" };
    const [resolved] = resolveCanvasConnectors([connector]);
    expect(resolved).toMatchObject({ x: 10, y: 20, width: 100, height: 80 });
    expect(resolved).toMatchObject({ startBindingId: undefined, endBindingId: undefined });
  });

  it("normalizes independent radii without letting adjacent corners overlap", () => {
    const radii = canvasCornerRadii(100, 40, { topLeft: 80, topRight: 80, bottomRight: 20, bottomLeft: 20 });
    expect(radii).toEqual({ topLeft: 32, topRight: 32, bottomRight: 8, bottomLeft: 8 });
    expect(canvasRoundedRectPath(10, 20, 100, 40, { topLeft: 8, topRight: 16, bottomRight: 24, bottomLeft: 0 }))
      .toBe("M 18 20 H 94 A 16 16 0 0 1 110 36 V 36 A 24 24 0 0 1 86 60 H 10 L 10 60 V 28 A 8 8 0 0 1 18 20 Z");
  });
});
