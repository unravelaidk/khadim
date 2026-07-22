import { describe, expect, it } from "vitest";
import { canvasElementShadows, canvasLegacyShadowMirror, canvasShadowFilterDefinition, canvasShadowFilterId, canvasShadowOutset } from "../../../src/shared/canvas-effects";

describe("canvas shadow effects", () => {
  it("materializes legacy shadows unless an explicit stack is present", () => {
    const source = { id: "shape", shadow: { color: "#101828", x: 2, y: 8, blur: 18, opacity: .2 } };
    expect(canvasElementShadows(source)).toEqual([{ ...source.shadow, blur: 36, id: "legacy-shadow-shape", visible: true, type: "drop", spread: 0 }]);
    expect(canvasElementShadows({ ...source, shadows: [] })).toEqual([]);
    expect(canvasLegacyShadowMirror(canvasElementShadows(source))).toEqual(source.shadow);
  });

  it("mirrors the topmost visible drop and ignores inner-only stacks", () => {
    const inner = { id: "inner", visible: true, type: "inner" as const, color: "#000000", opacity: .4, x: 0, y: 2, blur: 4, spread: 1 };
    const drop = { id: "drop", visible: true, type: "drop" as const, color: "#112233", opacity: .3, x: 1, y: 5, blur: 10, spread: 2 };
    expect(canvasLegacyShadowMirror([drop, inner])).toEqual({ color: "#112233", opacity: .3, x: 1, y: 5, blur: 10 });
    expect(canvasLegacyShadowMirror([inner])).toBeUndefined();
  });

  it("counts only visible drop shadows in visual bounds", () => {
    expect(canvasShadowOutset({ id: "shape", shadows: [
      { id: "inner", visible: true, type: "inner", color: "#000000", opacity: .4, x: 0, y: 2, blur: 40, spread: 5 },
      { id: "hidden", visible: false, type: "drop", color: "#000000", opacity: .4, x: 100, y: 100, blur: 40, spread: 5 },
      { id: "drop", visible: true, type: "drop", color: "#000000", opacity: .4, x: -3, y: 7, blur: 10, spread: 2 },
    ] })).toBe(22);
  });

  it("builds ordered drop and inner SVG filter stages with spread", () => {
    const filter = canvasShadowFilterDefinition({ id: "shape", shadows: [
      { id: "drop", visible: true, type: "drop", color: "#112233", opacity: .3, x: 1, y: 5, blur: 10, spread: 2 },
      { id: "inner", visible: true, type: "inner", color: "#445566", opacity: .5, x: 0, y: 2, blur: 4, spread: 1 },
    ] }, "filter-id");
    expect(filter).toContain('<filter id="filter-id"');
    expect(filter).toContain('operator="dilate" radius="2"');
    expect(filter).toContain('operator="erode" radius="1"');
    expect(filter).toContain('<feMergeNode in="canvas-shadow-stage-0"/><feMergeNode in="SourceGraphic"/><feMergeNode in="canvas-shadow-stage-1"/>');
  });

  it("uses an expanded user-space region when shape bounds are available", () => {
    const source = { id: "shape", shadows: [{ id: "drop", visible: true, type: "drop" as const, color: "#000000", opacity: .3, x: 20, y: -10, blur: 10, spread: 2 }] };
    const filter = canvasShadowFilterDefinition(source, "bounded-filter", 2, { x: 100, y: 50, width: 200, height: 80 });
    expect(filter).toContain('filterUnits="userSpaceOnUse" x="-4" y="-54" width="408" height="288"');
  });

  it("keeps transparent filter signal around inner-only shadows and outward source strokes", () => {
    const source = { id: "shape", shadows: [{ id: "inner", visible: true, type: "inner" as const, color: "#000000", opacity: .3, x: 0, y: 2, blur: 6, spread: 1 }] };
    const filter = canvasShadowFilterDefinition(source, "inner-filter", 1, { x: 10, y: 20, width: 100, height: 60 }, 24);
    expect(filter).toContain('filterUnits="userSpaceOnUse" x="-29" y="-19" width="178" height="138"');
  });

  it("keeps distinct source IDs collision-free after SVG-safe encoding", () => {
    expect(canvasShadowFilterId("a:b")).not.toBe(canvasShadowFilterId("a-b"));
    expect(canvasShadowFilterId("a:b")).toMatch(/^canvas-shadow-[0-9a-f-]+$/);
  });
});
