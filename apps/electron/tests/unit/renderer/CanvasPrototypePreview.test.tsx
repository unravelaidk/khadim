// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasPrototypePreview } from "../../../src/renderer/src/studio/CanvasPrototypePreview";
import type { CanvasArtifactContent, CanvasPage } from "../../../src/shared/types";

const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };

function fixture(preservePosition = true): { content: CanvasArtifactContent; pages: CanvasPage[] } {
  const pages: CanvasPage[] = [
    {
      id: "home",
      name: "Home",
      frame: { width: 400, height: 1200 },
      prototypeViewport: { width: 400, height: 400, direction: "vertical", preservePosition },
      appState,
      elements: [
        { id: "body-link", type: "rectangle", name: "Body details", x: 24, y: 900, width: 160, height: 48, color: "#7c3aed", interactions: [{ id: "body-go", trigger: "click", action: "navigate", destinationPageId: "details" }] },
        { id: "header", type: "frame", name: "Fixed header", fixedInPrototype: true, x: 0, y: 0, width: 400, height: 72, color: "#ffffff" },
        { id: "fixed-link", parentId: "header", type: "rectangle", name: "Fixed details", x: 280, y: 16, width: 96, height: 40, color: "#2563eb", interactions: [{ id: "fixed-go", trigger: "click", action: "navigate", destinationPageId: "details" }] },
      ],
    },
    {
      id: "details",
      name: "Details",
      frame: { width: 400, height: 800 },
      prototypeViewport: { width: 400, height: 400, direction: "vertical", preservePosition: false },
      appState,
      elements: [{ id: "back", type: "rectangle", name: "Return home", x: 24, y: 24, width: 120, height: 48, color: "#2563eb", interactions: [{ id: "back-home", trigger: "click", action: "back" }] }],
    },
  ];
  return {
    pages,
    content: { format: "khadim-canvas", sceneVersion: 1, frame: pages[0].frame, elements: pages[0].elements, components: [], pages, activePageId: "home", prototypeFlows: [{ id: "main", name: "Main flow", startPageId: "home" }], prototypeStartPageId: "home", appState, files: {} },
  };
}

describe("CanvasPrototypePreview scrolling", () => {
  afterEach(cleanup);

  it("keeps fixed layer interactions pinned and restores opted-in history positions", async () => {
    const { content, pages } = fixture(true);
    const flows = [...content.prototypeFlows!, { id: "alternate", name: "Alternate flow", startPageId: "home" }];
    const { container } = render(<CanvasPrototypePreview title="Prototype" content={content} pages={pages} flows={flows} onClose={() => undefined} />);
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    const scroll = within(preview).getByRole("region", { name: "Home scrollable prototype" });
    const fixedHotspot = within(preview).getByRole("button", { name: "Run Fixed details click interaction" });
    const bodyHotspot = within(preview).getByRole("button", { name: "Run Body details click interaction" });
    expect(fixedHotspot.closest(".canvas-prototype-fixed-content")).not.toBeNull();
    expect(bodyHotspot.closest(".canvas-prototype-scroll-content")).not.toBeNull();
    expect(container.querySelector(".canvas-prototype-scroll-content")).toHaveStyle({ width: "100%", height: "300%" });

    scroll.scrollTop = 180;
    fireEvent.change(within(preview).getByRole("combobox", { name: "Preview prototype flow" }), { target: { value: "alternate" } });
    await waitFor(() => expect(within(preview).getByRole("region", { name: "Home scrollable prototype" }).scrollTop).toBe(0));
    within(preview).getByRole("region", { name: "Home scrollable prototype" }).scrollTop = 260;
    fireEvent.click(within(preview).getByRole("button", { name: "Run Fixed details click interaction" }));
    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
    within(preview).getByRole("region", { name: "Details scrollable prototype" }).focus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    await waitFor(() => expect(within(preview).getByRole("region", { name: "Home scrollable prototype" }).scrollTop).toBe(260));
  });

  it("resets history positions when preservation is disabled", async () => {
    const { content, pages } = fixture(false);
    render(<CanvasPrototypePreview title="Prototype" content={content} pages={pages} flows={content.prototypeFlows!} onClose={() => undefined} />);
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    const scroll = within(preview).getByRole("region", { name: "Home scrollable prototype" });
    scroll.scrollTop = 260;
    fireEvent.click(within(preview).getByRole("button", { name: "Run Fixed details click interaction" }));
    fireEvent.click(within(preview).getByRole("button", { name: "Run Return home click interaction" }));

    await waitFor(() => expect(within(preview).getByRole("region", { name: "Home scrollable prototype" }).scrollTop).toBe(0));
  });

  it("leaves ArrowLeft available for horizontal prototype scrolling", () => {
    const { content, pages } = fixture(true);
    pages[1] = { ...pages[1], frame: { width: 800, height: 400 }, prototypeViewport: { width: 400, height: 400, direction: "horizontal", preservePosition: false } };
    render(<CanvasPrototypePreview title="Prototype" content={content} pages={pages} flows={content.prototypeFlows!} onClose={() => undefined} />);
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    fireEvent.click(within(preview).getByRole("button", { name: "Run Fixed details click interaction" }));
    within(preview).getByRole("region", { name: "Details scrollable prototype" }).focus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Previous prototype screen" })).toBeEnabled();
  });
});
