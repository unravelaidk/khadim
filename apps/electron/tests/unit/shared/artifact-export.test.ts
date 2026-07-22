import { describe, expect, it } from "vitest";
import type { Artifact } from "../../../src/shared/types";
import { renderArtifactForPdf, renderCanvasSvg } from "../../../src/shared/artifact-export";

const common = {
  id: "artifact-a",
  projectId: "project-a",
  schemaVersion: 2 as const,
  lifecycle: "draft" as const,
  provenance: { origin: "user" as const },
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
};

describe("renderArtifactForPdf", () => {
  it("makes site exports inert while retaining their authored markup", () => {
    const artifact: Artifact = {
      ...common,
      kind: "site",
      title: "Portal",
      content: {
        format: "html",
        html: "<html><body><h1 onclick=\"steal()\">Portal</h1><script>steal()</script></body></html>",
        baselineHtml: "",
      },
    };

    const html = renderArtifactForPdf(artifact);

    expect(html).toContain("Portal");
    expect(html).toContain("script-src 'none'");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
  });

  it("renders structured documents as paginated printable HTML", () => {
    const artifact: Artifact = {
      ...common,
      kind: "document",
      title: "Field report",
      content: {
        format: "tiptap",
        document: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Field & report" }] }] },
        page: { size: "A4", orientation: "portrait", margin: 24 },
      },
    };

    const html = renderArtifactForPdf(artifact);

    expect(html).toContain("@page");
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("Field &amp; report");
  });

  it("exports HTML documents with authoritative page settings and inert markup", () => {
    const artifact: Artifact = {
      ...common,
      kind: "document",
      title: "Editorial brief",
      content: {
        format: "document-html",
        html: "<!doctype html><html><head><style>@page { size: A4; }</style></head><body><h1 onclick=\"bad()\">Editorial brief</h1><script>bad()</script></body></html>",
        baselineHtml: "",
        page: { size: "Letter", orientation: "landscape", margin: 18 },
      },
    };

    const html = renderArtifactForPdf(artifact);

    expect(html).toContain("Editorial brief");
    expect(html).toContain("data-khadim-page");
    expect(html).toContain("size: Letter landscape; margin: 18mm");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
  });

  it("renders canvas elements into SVG", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Flow",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [{ id: "shape-a", type: "rectangle", x: 10, y: 20, width: 100, height: 60, color: "#6652d9" }],
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    expect(renderArtifactForPdf(artifact)).toContain("<rect");
  });

  it("exports every canvas page to its own printable sheet", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Product flow",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [{ id: "home-shape", type: "rectangle", name: "Home card", x: 10, y: 20, width: 100, height: 60, color: "#6652d9" }],
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
        activePageId: "home",
        pages: [
          {
            id: "home",
            name: "Home",
            frame: { width: 960, height: 600 },
            elements: [{ id: "home-shape", type: "rectangle", name: "Home card", x: 10, y: 20, width: 100, height: 60, color: "#6652d9" }],
            appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
          },
          {
            id: "details",
            name: "Details",
            frame: { width: 720, height: 900 },
            elements: [{ id: "details-title", type: "text", name: "Details heading", x: 40, y: 40, width: 240, height: 48, color: "#17181c", text: "Details screen" }],
            appState: { viewBackgroundColor: "#f5f5f5", snapToGrid: true },
          },
        ],
      },
    };

    const html = renderArtifactForPdf(artifact);

    expect(html.match(/class="canvas-pdf-page"/g)).toHaveLength(2);
    expect(html).toContain('data-canvas-page="Home"');
    expect(html).toContain('data-canvas-page="Details"');
    expect(html).toContain('<rect x="10" y="20" width="100" height="60"');
    expect(html).toContain("Details screen");
    expect(html).toContain("page-break-after: always");
  });

  it("crops selection exports and supports a transparent canvas", () => {
    const content = {
      format: "khadim-canvas" as const,
      sceneVersion: 1 as const,
      frame: { width: 960, height: 600 },
      elements: [{ id: "shape-a", type: "rectangle" as const, x: 120, y: 80, width: 240, height: 160, color: "#6652d9" }],
      components: [],
      appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
      files: {},
    };
    const svg = renderCanvasSvg(content, "Selection", { bounds: { x: 120, y: 80, width: 240, height: 160 }, transparent: true });
    expect(svg).toContain('viewBox="120 80 240 160"');
    expect(svg).toContain('width="240" height="160"');
    expect(svg).not.toContain('<rect x="120" y="80" width="240" height="160" fill="#ffffff"');
  });

  it("exports only explicit selection members even when unselected layers overlap the crop", () => {
    const content = {
      format: "khadim-canvas" as const,
      sceneVersion: 1 as const,
      frame: { width: 300, height: 200 },
      elements: [
        { id: "selected", type: "rectangle" as const, x: 20, y: 20, width: 100, height: 100, color: "#ff0000" },
        { id: "overlap", type: "ellipse" as const, x: 40, y: 40, width: 80, height: 80, color: "#00ff00" },
      ],
      components: [],
      appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
      files: {},
    };

    const svg = renderCanvasSvg(content, "Selection", { bounds: { x: 20, y: 20, width: 100, height: 100 }, transparent: true, elementIds: ["selected"] });
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).not.toContain('fill="#00ff00"');
  });

  it("renders masks stored inside component definitions", () => {
    const content = {
      format: "khadim-canvas" as const,
      sceneVersion: 1 as const,
      frame: { width: 300, height: 200 },
      elements: [{ id: "instance", type: "component" as const, componentId: "masked", componentRole: "instance" as const, x: 20, y: 20, width: 120, height: 80, color: "#ffffff" }],
      components: [{ id: "masked", name: "Masked art", width: 120, height: 80, nodes: [
        { id: "mask", type: "ellipse" as const, x: 20, y: 0, width: 80, height: 80, color: "#000000" },
        { id: "art", type: "rectangle" as const, x: 0, y: 0, width: 120, height: 80, color: "#ff0000", maskId: "mask" },
      ] }],
      appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
      files: {},
    };

    const svg = renderCanvasSvg(content, "Masked component");
    expect(svg).toContain('id="canvas-component-mask-instance-mask"');
    expect(svg).toContain('clip-path="url(#canvas-component-mask-instance-mask)"');
    expect(svg.match(/fill="#000000"/g)).toHaveLength(1);
  });

  it("renders linked canvas component instances with local text overrides", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Component sheet",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [{ id: "instance-a", type: "component", componentId: "button", componentRole: "instance", x: 40, y: 50, width: 160, height: 48, color: "#2563eb", opacity: .2, overrides: { label: { text: "Ship now" } } }],
        components: [{ id: "button", name: "Button", width: 160, height: 48, nodes: [{ id: "surface", type: "rectangle", x: 0, y: 0, width: 160, height: 48, color: "#2563eb", radius: 10 }, { id: "label", type: "text", x: 34, y: 8, width: 90, height: 30, color: "#ffffff", text: "Continue", fontSize: 15, fontWeight: 650, opacity: .5 }] }],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).toContain("Ship now");
    expect(html).not.toContain(">Continue<");
    expect(html).toContain('rx="10"');
    expect(html).toContain('font-size="15"');
    expect(html).toContain('font-weight="650"');
    expect(html).toContain('opacity="0.1"');
    expect(html).toContain('viewBox="0 0 960 600"');
  });

  it("exports the extended native shape and transform model", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Shape sheet",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [
          { id: "frame", type: "frame", x: 10, y: 10, width: 400, height: 180, color: "#ffffff", clipContent: true },
          { id: "ellipse", parentId: "frame", type: "ellipse", x: 20, y: 30, width: 80, height: 60, color: "#f59e0b", strokeColor: "#17181c", strokeWidth: 2, rotation: 25 },
          { id: "line", type: "line", x: 120, y: 40, width: 100, height: 50, color: "#17181c", strokeColor: "#2563eb", strokeWidth: 3 },
          { id: "image", type: "image", x: 240, y: 30, width: 120, height: 90, color: "#ffffff", src: "data:image/png;base64,AA==" },
        ],
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).toContain("<ellipse");
    expect(html).toContain("<line");
    expect(html).toContain("<image");
    expect(html).toContain('clipPath id="canvas-clip-frame"');
    expect(html).toContain('clip-path="url(#canvas-clip-frame)"');
    expect(html).toContain('transform="rotate(25 60 60)"');
  });

  it("exports authored vector paths and arrow caps", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Vector flow",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 600, height: 400 },
        elements: [
          { id: "curve", type: "path", x: 20, y: 30, width: 100, height: 80, points: [{ x: 0, y: 0 }, { x: .5, y: .2 }, { x: 1, y: 1 }], pathSmoothing: .6, pathClosed: true, color: "#f59e0b", fillGradient: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#f59e0b" }, { offset: 1, color: "#ef4444", opacity: .8 }] }, strokeColor: "#17181c", strokeWidth: 3 },
          { id: "arrow", type: "arrow", x: 180, y: 60, width: 180, height: 100, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#2563eb", strokeColor: "#2563eb", strokeWidth: 2 },
        ],
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).toContain('marker id="canvas-arrowhead"');
    expect(html).toContain('marker-end="url(#canvas-arrowhead)"');
    expect(html).toContain('d="M 20 30 Q 70 46');
    expect(html).toContain('T 120 110 Z"');
    expect(html).toContain('linearGradient id="canvas-gradient-curve"');
    expect(html).toContain('fill="url(#canvas-gradient-curve)"');
    expect(html).toContain('stop-opacity="0.8"');
  });

  it("exports bezier handles and materializes non-destructive boolean groups", () => {
    const content = {
      format: "khadim-canvas" as const,
      sceneVersion: 1 as const,
      frame: { width: 400, height: 240 },
      elements: [
        { id: "boolean", type: "boolean" as const, booleanOperation: "union" as const, x: 20, y: 20, width: 150, height: 100, color: "#2563eb" },
        { id: "bottom", parentId: "boolean", type: "rectangle" as const, x: 20, y: 20, width: 100, height: 100, color: "#f59e0b" },
        { id: "top", parentId: "boolean", type: "rectangle" as const, x: 70, y: 20, width: 100, height: 100, color: "#2563eb" },
        { id: "curve", type: "path" as const, x: 200, y: 40, width: 100, height: 80, points: [
          { x: 0, y: 0, handleOut: { x: .25, y: -.2 }, nodeType: "smooth" as const },
          { x: 1, y: 1, handleIn: { x: .75, y: 1.2 }, nodeType: "smooth" as const },
        ], color: "#111827", strokeColor: "#111827", strokeWidth: 2 },
      ],
      components: [],
      appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
      files: {},
    };

    const svg = renderCanvasSvg(content, "Vector systems");
    expect(svg).toContain('d="M 20 20 L 170 20');
    expect(svg).not.toContain('<rect x="20" y="20" width="100"');
    expect(svg).toContain('d="M 200 40 C 225 24 275 136 300 120"');

    const childSvg = renderCanvasSvg(content, "Boolean operand", { bounds: { x: 20, y: 20, width: 100, height: 100 }, transparent: true, elementIds: ["bottom"] });
    expect(childSvg).toContain('<rect x="20" y="20" width="100" height="100"');
    expect(childSvg).toContain('fill="#f59e0b"');
  });

  it("preserves hidden ancestors and internal frame clipping in component exports", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Nested component",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 400, height: 300 },
        elements: [
          { id: "hidden-parent", type: "frame", x: 0, y: 0, width: 100, height: 100, color: "#ffffff", hidden: true },
          { id: "hidden-child", parentId: "hidden-parent", type: "rectangle", x: 10, y: 10, width: 20, height: 20, color: "#ff0000" },
          { id: "instance", type: "component", componentId: "card", componentRole: "instance", x: 120, y: 20, width: 120, height: 80, color: "#ffffff" },
        ],
        components: [{ id: "card", name: "Card", width: 120, height: 80, nodes: [
          { id: "clip-frame", type: "frame", x: 0, y: 0, width: 120, height: 80, color: "#ffffff", clipContent: true },
          { id: "inner-clip", parentId: "clip-frame", type: "frame", x: 10, y: 10, width: 90, height: 60, color: "#ffffff", clipContent: true },
          { id: "overflow", parentId: "inner-clip", type: "rectangle", x: 90, y: 20, width: 60, height: 40, color: "#00ff00" },
        ] }],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).not.toContain("#ff0000");
    expect(html).toContain('clipPath id="canvas-component-clip-instance-clip-frame"');
    expect(html).toContain('clip-path="url(#canvas-component-clip-instance-clip-frame)"');
    expect(html).toContain('clipPath id="canvas-component-clip-instance-inner-clip"');
    expect(html).toContain('clip-path="url(#canvas-component-clip-instance-inner-clip)"');
  });

  it("exports instance-specific gradient overrides without sharing definitions", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Gradient instances",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 400, height: 200 },
        elements: [
          { id: "warm", type: "component", componentId: "tile", componentRole: "instance", x: 20, y: 20, width: 120, height: 80, color: "#fff", overrides: { surface: { fillGradient: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#f59e0b" }, { offset: 1, color: "#ef4444" }] } } } },
          { id: "cool", type: "component", componentId: "tile", componentRole: "instance", x: 180, y: 20, width: 120, height: 80, color: "#fff", overrides: { surface: { fillGradient: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#2563eb" }, { offset: 1, color: "#6652d9" }] } } } },
        ],
        components: [{ id: "tile", name: "Tile", width: 120, height: 80, nodes: [{ id: "surface", type: "rectangle", x: 0, y: 0, width: 120, height: 80, color: "#ffffff" }] }],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).toContain('linearGradient id="canvas-component-gradient-warm-surface"');
    expect(html).toContain('linearGradient id="canvas-component-gradient-cool-surface"');
    expect(html).toContain('fill="url(#canvas-component-gradient-warm-surface)"');
    expect(html).toContain('fill="url(#canvas-component-gradient-cool-surface)"');
  });

  it("resolves bound connector endpoints during export", () => {
    const artifact: Artifact = {
      ...common,
      kind: "canvas",
      title: "Bound flow",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 500, height: 300 },
        elements: [
          { id: "source", type: "rectangle", x: 20, y: 40, width: 100, height: 60, color: "#ffffff" },
          { id: "target", type: "rectangle", x: 300, y: 160, width: 120, height: 80, color: "#ffffff" },
          { id: "arrow", type: "arrow", x: 0, y: 0, width: 10, height: 10, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#17181c", startBindingId: "source", endBindingId: "target" },
        ],
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    const html = renderArtifactForPdf(artifact);
    expect(html).not.toContain('d="M 0 0 L 10 10"');
    expect(html).toMatch(/d="M 120 [\d.]+ L 300 [\d.]+"/);
  });

  it("exports the latest safe visual preview for a React artifact", () => {
    const artifact: Artifact = {
      ...common,
      kind: "site",
      title: "React portal",
      content: {
        format: "web-project",
        framework: "react",
        entryFile: "/src/App.jsx",
        files: { "/src/App.jsx": "export default () => <h1>Portal</h1>" },
        baselineFiles: {},
        previewHtml: "<main><h1 onclick=\"bad()\">Portal</h1><script>bad()</script></main>",
        baselinePreviewHtml: "",
      },
    };

    const html = renderArtifactForPdf(artifact);

    expect(html).toContain("Portal");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
  });
});
