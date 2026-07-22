import { describe, expect, it } from "vitest";
import type { CanvasPrimitiveElement } from "../../../src/shared/types";
import { canvasElementFills, canvasElementStrokeOutset, canvasElementStrokes, canvasStrokeDashArray, normalizedCanvasPaintGradient } from "../../../src/shared/canvas-paint";

const rectangle: CanvasPrimitiveElement = { id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 60, color: "#2563eb", strokeColor: "#111827", strokeWidth: 4 };

describe("canvas paint stacks", () => {
  it("upgrades legacy paint fields without changing their appearance", () => {
    expect(canvasElementFills(rectangle)).toEqual([{ id: "legacy-fill-shape", visible: true, opacity: 1, color: "#2563eb" }]);
    expect(canvasElementStrokes(rectangle)).toEqual([{ id: "legacy-stroke-shape", visible: true, color: "#111827", opacity: 1, width: 4, alignment: "center", style: "solid" }]);
    expect(canvasElementFills({ ...rectangle, fills: [] })).toEqual([]);
    expect(canvasElementStrokes({ ...rectangle, strokes: [] })).toEqual([]);
  });

  it("normalizes radial gradients and produces deterministic stroke patterns", () => {
    expect(normalizedCanvasPaintGradient({ type: "radial", centerX: -1, centerY: 2, radius: 4, stops: [{ offset: 2, color: "#ffffff", opacity: 2 }, { offset: -.5, color: "#000000", opacity: -1 }] })).toEqual({
      type: "radial", centerX: 0, centerY: 1, radius: 2,
      stops: [{ offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#ffffff", opacity: 1 }],
    });
    expect(canvasStrokeDashArray({ id: "mixed", visible: true, color: "#000000", opacity: 1, width: 2, alignment: "center", style: "mixed", dash: 3, gap: 5 })).toBe("3 5 6 5");
  });

  it("uses alignment-aware visual outsets and centers open-path strokes", () => {
    const strokes = [
      { id: "inside", visible: true, color: "#000000", opacity: 1, width: 12, alignment: "inside" as const, style: "solid" as const },
      { id: "outside", visible: true, color: "#000000", opacity: 1, width: 8, alignment: "outside" as const, style: "solid" as const },
    ];
    expect(canvasElementStrokeOutset({ ...rectangle, strokes })).toBe(8);
    expect(canvasElementStrokeOutset({ ...rectangle, type: "line", strokes })).toBe(6);
    expect(canvasElementStrokeOutset({ ...rectangle, strokes: strokes.map((stroke) => ({ ...stroke, visible: false })) })).toBe(0);
    const importedCurve: CanvasPrimitiveElement = { ...rectangle, type: "path", pathClosed: false, svgPathData: "M 0 0 L 100 60", svgViewBox: { x: 0, y: 0, width: 100, height: 60 }, strokes: [{ ...strokes[1], width: 8 }] };
    expect(canvasElementFills(importedCurve)).toEqual([]);
    expect(canvasElementStrokeOutset(importedCurve)).toBe(4);
    expect(canvasElementStrokeOutset({ ...rectangle, type: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], strokes: [{ ...strokes[0], width: 2, alignment: "center" }] })).toBe(14);
  });
});
