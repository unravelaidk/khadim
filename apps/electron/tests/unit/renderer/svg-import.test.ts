// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { importSvgToCanvasNodes } from "../../../src/renderer/src/studio/svg-import";

describe("editable SVG import", () => {
  it("turns safe SVG shapes into restylable vector layers", () => {
    const nodes = importSvgToCanvasNodes(`
      <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(4 2)" fill="#ff3366">
          <rect id="card" x="10" y="10" width="50" height="30" rx="4" />
          <path id="curve" d="M 5 60 C 35 5 75 75 110 20" fill="none" stroke="rgb(17, 24, 39)" stroke-width="3" />
        </g>
      </svg>
    `, { x: 96, y: 88, name: "Logo" });

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: "path", name: "card", x: 110, y: 100, width: 50, height: 30, color: "#ff3366", pathClosed: true, svgViewBox: { x: 14, y: 12, width: 50, height: 30 }, svgTransform: "translate(4 2)" });
    expect(nodes[0].svgPathData).toContain("A 4 4");
    expect(nodes[1]).toMatchObject({ name: "curve", pathClosed: false, strokeColor: "#111827", strokeWidth: 3 });
    expect(nodes[1].width).toBeLessThan(120);
    expect(nodes[1].height).toBeLessThan(80);
    expect(nodes[1].svgPathData).toBe("M 5 60 C 35 5 75 75 110 20");
  });

  it("does not preserve executable or external SVG markup", () => {
    const nodes = importSvgToCanvasNodes(`
      <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <foreignObject width="20" height="20"><iframe src="https://example.com" /></foreignObject>
        <image href="https://example.com/tracker.png" />
        <path d="M0 0L20 20" stroke="#000" onclick="alert(2)" />
      </svg>
    `, { x: 0, y: 0 });

    expect(nodes).toHaveLength(1);
    expect(JSON.stringify(nodes)).not.toMatch(/script|iframe|example|onclick/i);
  });

  it("rejects malformed XML and unsafe path data", () => {
    expect(() => importSvgToCanvasNodes("<svg><path></svg>", { x: 0, y: 0 })).toThrow("Invalid SVG");
    expect(importSvgToCanvasNodes(`<svg viewBox="0 0 10 10"><path d="M0 0 javascript:alert(1)" /></svg>`, { x: 0, y: 0 })).toEqual([]);
  });
});
