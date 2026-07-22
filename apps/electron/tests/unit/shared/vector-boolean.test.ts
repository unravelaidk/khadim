import { describe, expect, it } from "vitest";
import { booleanCanvasNodes, flattenSvgPath } from "../../../src/shared/vector-boolean";
import type { CanvasPrimitiveElement } from "../../../src/shared/types";

const rectangle = (id: string, x: number, y: number, width: number, height: number): CanvasPrimitiveElement => ({
  id,
  type: "rectangle",
  x,
  y,
  width,
  height,
  color: id === "top" ? "#2563eb" : "#f59e0b",
});

describe("canvas vector boolean operations", () => {
  it("unions overlapping closed shapes into one editable path", () => {
    const result = booleanCanvasNodes([rectangle("bottom", 0, 0, 100, 100), rectangle("top", 50, 0, 100, 100)], "union");

    expect(result).toMatchObject({ type: "path", x: 0, y: 0, width: 150, height: 100, pathClosed: true, fillRule: "evenodd", color: "#2563eb" });
    expect(result?.svgPathData).toContain("M ");
    expect(result?.svgPathData).toContain(" Z");
  });

  it("supports subtract, intersection, exclusion, and flatten without corrupting bounds", () => {
    const nodes = [rectangle("bottom", 0, 0, 100, 100), rectangle("top", 50, 0, 100, 100)];

    expect(booleanCanvasNodes(nodes, "difference")).toMatchObject({ x: 0, y: 0, width: 50, height: 100 });
    expect(booleanCanvasNodes(nodes, "intersection")).toMatchObject({ x: 50, y: 0, width: 50, height: 100 });
    expect(booleanCanvasNodes(nodes, "exclusion")).toMatchObject({ x: 0, y: 0, width: 150, height: 100 });
    expect(booleanCanvasNodes(nodes, "flatten")).toMatchObject({ x: 0, y: 0, width: 150, height: 100 });
  });

  it("flattens curved and arc SVG path commands into closed polygon rings", () => {
    const rings = flattenSvgPath("M 10 40 C 10 10 60 10 60 40 A 25 25 0 0 1 10 40 Z");

    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeGreaterThan(24);
    expect(rings[0][0]).toEqual(rings[0].at(-1));
  });

  it("preserves independent contours instead of interpreting them as holes", () => {
    const compound: CanvasPrimitiveElement = { id: "compound", type: "path", x: 0, y: 0, width: 150, height: 40, color: "#2563eb", pathClosed: true, svgPathData: "M 0 0 H 40 V 40 H 0 Z M 110 0 H 150 V 40 H 110 Z", svgViewBox: { x: 0, y: 0, width: 150, height: 40 }, fillRule: "evenodd" };
    const result = booleanCanvasNodes([compound, rectangle("top", 20, 0, 40, 40)], "union");

    expect(result).toMatchObject({ x: 0, y: 0, width: 150, height: 40 });
    expect(result?.svgPathData?.match(/M /g)).toHaveLength(2);
  });

  it("keeps rounded rectangle corners when producing boolean geometry", () => {
    const rounded = { ...rectangle("bottom", 0, 0, 100, 100), radius: 16 };
    const result = booleanCanvasNodes([rounded, rectangle("top", 80, 30, 40, 40)], "union");

    expect(result?.svgPathData).not.toContain("M 0 0");
    expect(result?.svgPathData).toMatch(/15\.\d|16 /);
  });

  it("flattens explicit bezier handles before boolean geometry", () => {
    const curved: CanvasPrimitiveElement = {
      id: "curved", type: "path", x: 0, y: 0, width: 100, height: 100, color: "#2563eb", pathClosed: true,
      points: [
        { x: 0, y: 0, handleOut: { x: .25, y: -.8 }, nodeType: "smooth" },
        { x: 1, y: 0, handleIn: { x: .75, y: -.8 }, nodeType: "smooth" },
        { x: 1, y: 1 }, { x: 0, y: 1 },
      ],
    };
    const result = booleanCanvasNodes([curved, rectangle("distant", 140, 0, 20, 20)], "union");
    expect(result?.y).toBeLessThan(0);
    expect(result?.svgPathData).toMatch(/-\d/);
  });

  it("uses nonzero fill when flattening overlapping source contours", () => {
    const result = booleanCanvasNodes([rectangle("first", 0, 0, 100, 100), rectangle("second", 50, 0, 100, 100)], "flatten");
    expect(result?.fillRule).toBe("nonzero");
  });
});
