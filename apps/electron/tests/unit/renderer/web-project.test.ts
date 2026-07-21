import { describe, expect, it } from "vitest";
import type { VisualDocumentData, WebProjectArtifactContent } from "../../../src/shared/types";
import { applyVisualDocument, updateWebProjectFile, webProjectStyles } from "../../../src/renderer/src/studio/web-project";

function project(): WebProjectArtifactContent {
  return {
    format: "web-project",
    framework: "react",
    entryFile: "/src/App.jsx",
    files: { "/src/App.jsx": "old app", "/src/StudioPage.jsx": "old visual source" },
    baselineFiles: {},
    previewHtml: "old preview",
    baselinePreviewHtml: "",
    visual: { editor: "puck", data: { root: { props: {} }, content: [] } },
  };
}

describe("web project editing", () => {
  it("edits one Monaco file without replacing the visual document", () => {
    const content = project();
    const next = updateWebProjectFile(content, "/src/App.jsx", "new app");

    expect(next.files).toEqual({ "/src/App.jsx": "new app", "/src/StudioPage.jsx": "old visual source" });
    expect(next.visual).toBe(content.visual);
  });

  it("keeps the printable visual preview in sync when its stylesheet changes", () => {
    const content = project();
    const next = updateWebProjectFile(content, "/src/styles.css", "body { color: tomato; }");

    expect(next.previewHtml).toContain("body { color: tomato; }");
  });

  it("collects project stylesheets for the visual editor without including source files", () => {
    const styles = webProjectStyles({
      "/src/reset.css": "* { box-sizing: border-box; }",
      "/src/App.jsx": "export default function App() {}",
      "/src/styles.css": ".page-shell { color: royalblue; }",
    });

    expect(styles).toContain("/* /src/reset.css */");
    expect(styles).toContain("* { box-sizing: border-box; }");
    expect(styles).toContain("/* /src/styles.css */");
    expect(styles).toContain(".page-shell { color: royalblue; }");
    expect(styles).not.toContain("export default function App");
  });

  it("regenerates only the managed React page and printable preview after a Puck edit", () => {
    const data: VisualDocumentData = {
      root: { props: {} },
      content: [{ type: "Heading", props: { id: "heading", text: "A visual launch" } }],
    };

    const next = applyVisualDocument(project(), data);

    expect(next.files["/src/App.jsx"]).toBe("old app");
    expect(next.files["/src/StudioPage.jsx"]).toContain("A visual launch");
    expect(next.previewHtml).toContain("A visual launch");
    expect(next.visual?.data).toEqual(data);
  });

  it("renders nested layout slots to equivalent React source and printable HTML", () => {
    const data: VisualDocumentData = {
      root: { props: {} },
      content: [{
        type: "Section",
        props: {
          id: "section",
          tone: "accent",
          space: "generous",
          content: [{
            type: "Columns",
            props: {
              id: "columns",
              ratio: "wide-left",
              gap: "large",
              left: [{ type: "Heading", props: { id: "heading", text: "Nested visual page" } }],
              right: [{ type: "Card", props: { id: "card", title: "Fast", text: "Direct editing", linkLabel: "Explore", href: "/work" } }],
            },
          }],
        },
      }],
    };

    const next = applyVisualDocument(project(), data);

    expect(next.files["/src/StudioPage.jsx"]).toContain('className="site-section tone-accent space-generous"');
    expect(next.files["/src/StudioPage.jsx"]).toContain("Nested visual page");
    expect(next.previewHtml).toContain('class="site-columns ratio-wide-left gap-large"');
    expect(next.previewHtml).toContain("Direct editing");
  });
});
