import { describe, expect, it } from "vitest";
import type { Artifact } from "../../../src/shared/types";
import { renderArtifactForPdf } from "../../../src/shared/artifact-export";

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
        format: "excalidraw",
        elements: [{ id: "shape-a", type: "rectangle", x: 10, y: 20, width: 100, height: 60, color: "#6652d9" }],
        appState: {},
        files: {},
      },
    };

    expect(renderArtifactForPdf(artifact)).toContain("<rect");
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
