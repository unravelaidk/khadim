// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createArtifact } from "../../../src/renderer/src/artifact-model";
import { StudioWorkspace } from "../../../src/renderer/src/studio/StudioWorkspace";
import { applyStudioArtifactEdit } from "../../../src/shared/studio-artifact-edit";

describe("StudioWorkspace artifact synchronization", () => {
  afterEach(cleanup);

  it("refreshes an open document page when the same artifact receives an external HTML revision", async () => {
    const artifact = createArtifact("document", "project-a", "artifact-a", "2026-07-22T10:00:00.000Z");
    const props = {
      saveState: "saved" as const,
      onChange: vi.fn(),
      onClose: vi.fn(),
      onExportPdf: vi.fn(),
    };
    const { rerender } = render(<StudioWorkspace artifact={artifact} {...props} />);

    const frame = screen.getByTitle("Untitled document editable page");
    expect(frame).toHaveAttribute("srcdoc", expect.stringContaining("A clear title for the work"));

    const revised = applyStudioArtifactEdit(artifact, {
      title: "Field report",
      html: "<!doctype html><html><body><h1>Field report</h1><p>Updated by the agent.</p></body></html>",
    }, "2026-07-22T10:01:00.000Z");
    rerender(<StudioWorkspace artifact={revised} agentStatus={{ phase: "complete", message: "Changes applied to the artifact." }} {...props} />);

    await waitFor(() => expect(screen.getByTitle("Field report editable page")).toHaveAttribute("srcdoc", expect.stringContaining("Updated by the agent")));
    expect(screen.getByRole("status")).toHaveTextContent("Changes applied to the artifact");
    expect(screen.getByText("6 words")).toBeInTheDocument();
  });

  it("offers an in-place retry when local artifact persistence fails", async () => {
    const artifact = createArtifact("document", "project-a", "artifact-a", "2026-07-22T10:00:00.000Z");
    const onRetrySave = vi.fn();
    render(<StudioWorkspace artifact={artifact} saveState="error" onChange={vi.fn()} onRetrySave={onRetrySave} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    expect(screen.getByText(/Changes not saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetrySave).toHaveBeenCalledOnce();
  });

  it("does not reload the writing frame when Studio echoes a local edit", async () => {
    const artifact = createArtifact("document", "project-a", "artifact-a", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const props = { saveState: "dirty" as const, onChange, onClose: vi.fn(), onExportPdf: vi.fn() };
    const { rerender } = render(<StudioWorkspace artifact={artifact} {...props} />);
    const frame = screen.getByTitle("Untitled document editable page") as HTMLIFrameElement;
    const initialSrcDoc = frame.getAttribute("srcdoc");
    const frameDocument = frame.contentDocument!;
    frameDocument.documentElement.innerHTML = "<head><title>Draft</title></head><body><p>Typed locally</p></body>";
    fireEvent.load(frame);
    fireEvent.input(frameDocument.body);

    const echoed = onChange.mock.calls.at(-1)?.[0];
    expect(echoed?.content).toMatchObject({ format: "document-html", html: expect.stringContaining("Typed locally") });
    rerender(<StudioWorkspace artifact={echoed} {...props} />);

    await waitFor(() => expect(frame).toHaveAttribute("srcdoc", initialSrcDoc));
    expect(frameDocument.body).toHaveTextContent("Typed locally");

    rerender(<StudioWorkspace artifact={{ ...artifact, updatedAt: "2026-07-22T10:02:00.000Z" }} {...props} />);
    await waitFor(() => expect(screen.getByTitle("Untitled document editable page")).not.toBe(frame));
    expect(screen.getByTitle("Untitled document editable page")).toHaveAttribute("srcdoc", expect.stringContaining("A clear title for the work"));
  });

  it("refreshes a legacy HTML artifact preview after an external revision", async () => {
    const artifact = {
      ...createArtifact("document", "project-a", "artifact-a", "2026-07-22T10:00:00.000Z"),
      kind: "site" as const,
      title: "Imported page",
      content: { format: "html" as const, html: "<!doctype html><h1>First revision</h1>", baselineHtml: "<!doctype html><h1>First revision</h1>" },
    };
    const props = { saveState: "saved" as const, onChange: vi.fn(), onClose: vi.fn(), onExportPdf: vi.fn() };
    const { rerender } = render(<StudioWorkspace artifact={artifact} {...props} />);

    expect(screen.getByTitle("Imported page preview")).toHaveAttribute("srcdoc", expect.stringContaining("First revision"));
    const revised = applyStudioArtifactEdit(artifact, { html: "<!doctype html><h1>Second revision</h1>" }, "2026-07-22T10:01:00.000Z");
    rerender(<StudioWorkspace artifact={revised} {...props} />);

    await waitFor(() => expect(screen.getByTitle("Imported page preview")).toHaveAttribute("srcdoc", expect.stringContaining("Second revision")));
  });
});

describe("StudioWorkspace canvas design workflow", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("snaps dragged layers to equal peer spacing, shows measurements, and supports modifier bypass", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-snapping", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "left", type: "rectangle", name: "Left", x: 0, y: 60, width: 40, height: 40, color: "#2563eb" },
      { id: "moving", type: "rectangle", name: "Moving", x: 50, y: 60, width: 40, height: 40, color: "#f59e0b" },
      { id: "right", type: "rectangle", name: "Right", x: 160, y: 60, width: 40, height: 40, color: "#16a34a" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    const movingNode = container.querySelectorAll<SVGGraphicsElement>(".canvas-node")[1];

    fireEvent.pointerDown(movingNode, { button: 0, pointerId: 81, clientX: 125.2, clientY: 124.8 });
    fireEvent.pointerMove(canvas, { pointerId: 81, clientX: 144.96, clientY: 124.8 });
    expect(canvas).toHaveAccessibleDescription(/Control or Command while dragging to bypass snapping/);
    expect(container.querySelector(".canvas-snap-feedback")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("output[aria-live='polite']")).toHaveTextContent("Equal horizontal spacing 40 pixels");
    expect(container.querySelectorAll(".canvas-snap-distance")).toHaveLength(2);
    expect([...container.querySelectorAll(".canvas-snap-distance text")].map((node) => node.textContent)).toEqual(["40", "40"]);
    fireEvent.pointerUp(canvas, { pointerId: 81, clientX: 144.96, clientY: 124.8 });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements.find((node: { id: string }) => node.id === "moving")).toMatchObject({ x: 80, y: 60 });
    expect(container.querySelector(".canvas-snap-distance")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    const restoredNode = container.querySelectorAll<SVGGraphicsElement>(".canvas-node")[1];
    fireEvent.pointerDown(restoredNode, { button: 0, pointerId: 82, clientX: 125.2, clientY: 124.8 });
    fireEvent.pointerMove(canvas, { pointerId: 82, clientX: 144.96, clientY: 124.8, ctrlKey: true });
    expect(container.querySelector(".canvas-snap-feedback line")).toBeNull();
    fireEvent.pointerUp(canvas, { pointerId: 82, clientX: 144.96, clientY: 124.8, ctrlKey: true });
    const freelyMoved = onChange.mock.calls.at(-1)?.[0].content.elements.find((node: { id: string }) => node.id === "moving");
    expect(freelyMoved.x).toBeCloseTo(76);
    expect(freelyMoved.y).toBeCloseTo(60);
  });

  it("does not treat a moving frame's own layout grid as stationary snap geometry", () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-moving-grid", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.appState = { ...artifact.content.appState, snapToGrid: false };
    artifact.content.elements = [{
      id: "moving-frame",
      type: "frame",
      name: "Moving frame",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      color: "#ffffff",
      layoutGrids: [{ id: "columns", type: "columns", visible: true, color: "#2563eb", opacity: .2, count: 2, gutter: 0, margin: 0 }],
    }];
    const onChange = vi.fn();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    const frameNode = container.querySelector<SVGGraphicsElement>(".canvas-node")!;

    fireEvent.pointerDown(frameNode, { button: 0, pointerId: 83, clientX: 224, clientY: 178 });
    fireEvent.pointerMove(canvas, { pointerId: 83, clientX: 226.28, clientY: 178 });
    fireEvent.pointerUp(canvas, { pointerId: 83, clientX: 226.28, clientY: 178 });

    const moved = onChange.mock.calls.at(-1)?.[0].content.elements[0];
    expect(moved.x).toBeCloseTo(103);
  });

  it("ignores axis-aligned grid targets inside rotated frames", () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-rotated-grid", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.appState = { ...artifact.content.appState, snapToGrid: false };
    artifact.content.elements = [
      { id: "rotated", type: "frame", name: "Rotated frame", x: 400, y: 100, width: 300, height: 200, rotation: 90, color: "#ffffff", layoutGrids: [{ id: "columns", type: "columns", visible: true, color: "#2563eb", opacity: .2, count: 3, gutter: 10, margin: 10 }] },
      { id: "child", parentId: "rotated", type: "rectangle", name: "Child", x: 490, y: 160, width: 40, height: 40, color: "#f59e0b" },
    ];
    const onChange = vi.fn();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    const childNode = container.querySelectorAll<SVGGraphicsElement>(".canvas-node")[1];

    fireEvent.pointerDown(childNode, { button: 0, pointerId: 84, clientX: 459.6, clientY: 200.8 });
    fireEvent.pointerMove(canvas, { pointerId: 84, clientX: 461.88, clientY: 200.8 });
    fireEvent.pointerUp(canvas, { pointerId: 84, clientX: 461.88, clientY: 200.8 });

    const moved = onChange.mock.calls.at(-1)?.[0].content.elements.find((node: { id: string }) => node.id === "child");
    expect(moved.x).toBeCloseTo(493);
  });

  it("does not snap to ruler guides while guides are hidden", () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-hidden-guide", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.appState = { ...artifact.content.appState, snapToGrid: false, guidesVisible: false, guides: [{ id: "hidden", axis: "x", position: 333 }] };
    artifact.content.elements = [{ id: "moving", type: "rectangle", name: "Moving", x: 280, y: 100, width: 40, height: 40, color: "#2563eb" }];
    const onChange = vi.fn();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    const movingNode = container.querySelector<SVGGraphicsElement>(".canvas-node")!;

    fireEvent.pointerDown(movingNode, { button: 0, pointerId: 85, clientX: 300, clientY: 155.2 });
    fireEvent.pointerMove(canvas, { pointerId: 85, clientX: 307.6, clientY: 155.2 });
    fireEvent.pointerUp(canvas, { pointerId: 85, clientX: 307.6, clientY: 155.2 });

    const moved = onChange.mock.calls.at(-1)?.[0].content.elements[0];
    expect(moved.x).toBeCloseTo(290);
  });

  it("combines compatible multi-selections with editable non-destructive vector booleans", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-boolean", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "bottom", type: "rectangle", name: "Bottom", x: 20, y: 20, width: 100, height: 100, color: "#f59e0b" },
      { id: "top", type: "rectangle", name: "Top", x: 70, y: 20, width: 100, height: 100, color: "#2563eb" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: "Top" }));
    fireEvent.click(within(sidebar).getByRole("button", { name: "Bottom" }), { shiftKey: true });

    await user.click(screen.getByRole("button", { name: "Union selection" }));
    let elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    const group = elements.find((node: { type: string }) => node.type === "boolean");
    expect(group).toMatchObject({ type: "boolean", name: "Union", width: 150, height: 100, booleanOperation: "union" });
    expect(elements.filter((node: { parentId?: string }) => node.parentId === group.id)).toHaveLength(2);

    await user.selectOptions(screen.getByRole("combobox", { name: "Boolean operation" }), "difference");
    expect(onChange.mock.calls.at(-1)?.[0].content.elements.find((node: { type: string }) => node.type === "boolean")).toMatchObject({ booleanOperation: "difference", width: 50 });

    await user.click(screen.getByRole("button", { name: "Flatten" }));
    elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements).toEqual([expect.objectContaining({ type: "path", pathClosed: true, fillRule: "evenodd" })]);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toHaveLength(3);
  });

  it("converts path nodes to curves and splits their bezier segments", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-bezier", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [{ id: "path", type: "path", name: "Logo curve", x: 20, y: 20, width: 160, height: 100, points: [{ x: 0, y: 1 }, { x: .5, y: 0 }, { x: 1, y: 1 }], color: "#2563eb", strokeColor: "#2563eb", strokeWidth: 2 }];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: "Logo curve" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: /Path point 2/ }), { pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerUp(screen.getByRole("application", { name: "Canvas artwork" }), { pointerId: 1, clientX: 100, clientY: 20 });
    await user.click(screen.getByRole("button", { name: "Curve" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].points[1]).toMatchObject({ nodeType: "smooth", handleIn: expect.any(Object), handleOut: expect.any(Object) });

    await user.click(screen.getByRole("button", { name: "Split segment" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].points).toHaveLength(4);
  });

  it("does not combine boolean operands from different parents", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-parented-boolean", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "frame-a", type: "frame", name: "Frame A", x: 0, y: 0, width: 200, height: 160, color: "#fff" },
      { id: "child-a", parentId: "frame-a", type: "rectangle", name: "Child A", x: 20, y: 20, width: 80, height: 80, color: "#2563eb" },
      { id: "frame-b", type: "frame", name: "Frame B", x: 240, y: 0, width: 200, height: 160, color: "#fff" },
      { id: "child-b", parentId: "frame-b", type: "rectangle", name: "Child B", x: 260, y: 20, width: 80, height: 80, color: "#f59e0b" },
    ];
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: "Child A" }));
    fireEvent.click(within(sidebar).getByRole("button", { name: "Child B" }), { shiftKey: true });
    expect(screen.queryByRole("button", { name: "Union selection" })).toBeNull();
  });

  it("creates component variants and switches instances without losing matching overrides", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-variants", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.components = [{ id: "button", name: "Button", width: 120, height: 40, nodes: [
      { id: "surface", type: "rectangle", x: 0, y: 0, width: 120, height: 40, color: "#2563eb" },
      { id: "label", type: "text", x: 20, y: 6, width: 80, height: 28, color: "#ffffff", text: "Continue" },
    ] }];
    artifact.content.elements = [{ id: "main", type: "component", componentId: "button", componentRole: "main", name: "Button", x: 20, y: 20, width: 120, height: 40, color: "#2563eb" }];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add variant" }));
    let content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.components).toHaveLength(2);
    expect(content.components[0]).toMatchObject({ variantSetId: expect.any(String), variantProperties: { State: "Default" } });
    expect(content.components[1]).toMatchObject({ variantSetId: content.components[0].variantSetId, variantProperties: { State: "Variant 2" } });

    await user.click(screen.getByRole("tab", { name: "Assets" }));
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: "Button 2 layers" }));
    const override = screen.getByDisplayValue("Continue");
    await user.clear(override);
    await user.type(override, "Ship now");
    await user.selectOptions(screen.getByRole("combobox", { name: "Component variant" }), content.components[1].id);

    content = onChange.mock.calls.at(-1)?.[0].content;
    const instance = content.elements.find((node: { componentRole?: string }) => node.componentRole === "instance");
    expect(instance).toMatchObject({ componentId: content.components[1].id, overrides: { label: expect.objectContaining({ text: "Ship now" }) } });
  });

  it("binds semantic design tokens and switches collection modes", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-tokens", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [{ id: "surface", type: "rectangle", name: "Surface", x: 20, y: 20, width: 120, height: 80, color: "#2563eb", radius: 12 }];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: "Color token" }));
    let content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.tokenCollections[0]).toMatchObject({ name: "Core", modes: ["Light", "Dark"], activeMode: "Light" });
    expect(content.elements[0].tokenBindings.fill).toBe(content.tokenCollections[0].tokens[0].id);

    await user.selectOptions(screen.getByRole("combobox", { name: "Core token mode" }), "Dark");
    fireEvent.change(screen.getByLabelText("Surface / Fill Dark value"), { target: { value: "#111827" } });
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.elements[0].color).toBe("#111827");
    await user.selectOptions(screen.getByRole("combobox", { name: "Core token mode" }), "Light");
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].color).toBe("#2563eb");
  });

  it("configures square, column, and row layout grids on frames", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-layout-grids", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [{ id: "frame", type: "frame", name: "Desktop", x: 20, y: 20, width: 320, height: 240, color: "#ffffff" }];
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Square" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /Grid square size/ }), { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Grid columns size" }), { target: { value: "500" } });
    await user.click(screen.getByRole("button", { name: "Rows" }));
    const frame = onChange.mock.calls.at(-1)?.[0].content.elements[0];
    expect(frame.layoutGrids).toEqual([
      expect.objectContaining({ type: "square", size: 10, visible: true }),
      expect.objectContaining({ type: "columns", count: 100, gutter: 16, margin: 24 }),
      expect.objectContaining({ type: "rows", count: 12, gutter: 16, margin: 24 }),
    ]);
    expect(container.querySelector(".canvas-layout-grids")).not.toBeNull();
  });

  it("reflows auto-layout after token mode changes, deletion, and duplication", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-layout-reflow", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "frame", type: "frame", name: "Stack", x: 0, y: 0, width: 70, height: 40, color: "#ffffff", layout: { direction: "row", align: "start", justify: "start", gap: 10, padding: 10, sizing: "hug" }, tokenBindings: { gap: "space-gap" } },
      { id: "a", parentId: "frame", type: "rectangle", name: "Child A", x: 10, y: 10, width: 20, height: 20, color: "#2563eb" },
      { id: "b", parentId: "frame", type: "rectangle", name: "Child B", x: 40, y: 10, width: 20, height: 20, color: "#f59e0b" },
    ];
    artifact.content.tokenCollections = [{ id: "spacing", name: "Spacing", modes: ["Compact", "Comfortable"], activeMode: "Compact", tokens: [{ id: "space-gap", name: "Space / Gap", type: "number", values: { Compact: 10, Comfortable: 24 } }] }];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Assets" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Spacing token mode" }), "Comfortable");
    let elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements.find((node: { id: string }) => node.id === "b").x).toBe(54);
    expect(elements.find((node: { id: string }) => node.id === "frame").width).toBe(84);

    await user.click(screen.getByRole("tab", { name: "Layers" }));
    await user.click(screen.getByRole("button", { name: "Child A" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements.find((node: { id: string }) => node.id === "b").x).toBe(10);
    expect(elements.find((node: { id: string }) => node.id === "frame").width).toBe(40);

    await user.click(screen.getByRole("button", { name: "Child B" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements.find((node: { id: string }) => node.id === "frame")).toMatchObject({ width: 20, height: 20 });

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Child A" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements.filter((node: { parentId?: string }) => node.parentId === "frame").map((node: { x: number }) => node.x)).toEqual([10, 54, 98]);
    expect(elements.find((node: { id: string }) => node.id === "frame").width).toBe(128);
  });

  it("authors wrapping, alignment, and distribution for fixed auto-layout frames", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-layout-wrap", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "frame", type: "frame", name: "Wrapping stack", x: 40, y: 60, width: 220, height: 220, color: "#ffffff", layout: { direction: "row", align: "start", justify: "start", gap: 10, padding: 10, sizing: "fixed" } },
      { id: "a", parentId: "frame", type: "rectangle", name: "A", x: 50, y: 70, width: 80, height: 40, color: "#2563eb" },
      { id: "b", parentId: "frame", type: "rectangle", name: "B", x: 140, y: 70, width: 80, height: 48, color: "#f59e0b" },
      { id: "c", parentId: "frame", type: "rectangle", name: "C", x: 230, y: 70, width: 80, height: 30, color: "#10b981" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Wrap auto-layout children" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Layout cross gap" }), { target: { value: "12" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Layout distribution" }), "space-between");
    await user.selectOptions(screen.getByRole("combobox", { name: "Layout alignment" }), "end");

    const elements = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(elements.find((node: { id: string }) => node.id === "frame").layout).toMatchObject({ wrap: true, crossGap: 12, justify: "space-between", align: "end" });
    expect(elements.find((node: { id: string }) => node.id === "a")).toMatchObject({ x: 50, y: 78 });
    expect(elements.find((node: { id: string }) => node.id === "b")).toMatchObject({ x: 170, y: 70 });
    expect(elements.find((node: { id: string }) => node.id === "c")).toMatchObject({ x: 50, y: 130 });
  });

  it("pads selection exports for strokes and shadows", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-export-padding", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [{ id: "surface", type: "rectangle", name: "Surface", x: 20, y: 20, width: 100, height: 80, color: "#2563eb", strokeColor: "#111827", strokeWidth: 10, shadow: { color: "#111827", x: 0, y: 8, blur: 20, opacity: .2 } }];
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => { exported = value as Blob; return "blob:canvas-export"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "SVG selection" }));
    expect(exported).toBeDefined();
    const svg = await exported!.text();
    expect(svg).toContain('viewBox="-33 -33 206 186"');
  });

  it("includes bezier extrema outside anchor bounds in selection exports", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-curve-export", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [{ id: "curve", type: "path", name: "Curve", x: 100, y: 100, width: 100, height: 100, color: "#111827", strokeColor: "#111827", strokeWidth: 2, points: [
      { x: 0, y: 0, handleOut: { x: .33, y: -1 }, nodeType: "smooth" },
      { x: 1, y: 1, handleIn: { x: .66, y: -1 }, nodeType: "smooth" },
    ] }];
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => { exported = value as Blob; return "blob:curve-export"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: "Curve" }));
    await user.click(screen.getByRole("button", { name: "SVG selection" }));
    const svg = await exported!.text();
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1].split(" ").map(Number);
    expect(viewBox?.[1]).toBeLessThan(99);
    expect(svg).toContain("C 133 0 166 0 200 200");
  });

  it("imports SVG artwork as editable vector layers in one undo step", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-svg", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*="image/svg+xml"]');
    expect(input).not.toBeNull();

    await user.upload(input!, new File([`<svg viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"><rect id="surface" width="40" height="20" fill="#2563eb"/><path id="mark" d="M5 10 C10 2 30 18 35 10" fill="none" stroke="#fff" stroke-width="2"/></svg>`], "mark.svg", { type: "image/svg+xml" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const imported = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(imported).toHaveLength(2);
    expect(imported).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "path", name: "surface", svgPathData: expect.stringContaining("H 40") }),
      expect.objectContaining({ type: "path", name: "mark", svgPathData: "M5 10 C10 2 30 18 35 10" }),
    ]));
    expect(container.querySelectorAll("path.canvas-vector-node")).toHaveLength(2);
    expect(container.querySelector("image.canvas-node")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("No layers yet")).toBeInTheDocument();
  });

  it("restores a saved viewport without dirtying an artifact when it is merely opened", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-viewport", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.lifecycle = "ready";
    artifact.content.appState.viewport = { x: 123, y: 45, zoom: .9 };
    vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 900, height: 700, x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 700, toJSON: () => ({}) } as DOMRect);
    const onChange = vi.fn();

    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    expect(canvas.querySelector('g[transform="translate(123 45) scale(0.9)"]')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("culls large scenes to the viewport while keeping rail-selected layers editable", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-viewport-culling", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const elements = Array.from({ length: 450 }, (_, index) => ({
      id: `large-scene-${index}`,
      type: "rectangle" as const,
      name: index === 1 ? "Distant editable layer" : `Large scene ${index + 1}`,
      x: index === 0 ? 40 : 5_000 + index * 100,
      y: index === 0 ? 40 : 5_000,
      width: 80,
      height: 48,
      color: "#2563eb",
    }));
    artifact.content.elements = elements;
    artifact.content.appState.viewport = { x: 0, y: 0, zoom: 1 };
    const page = artifact.content.pages?.[0];
    if (page) artifact.content.pages = [{ ...page, elements, appState: artifact.content.appState }];
    const bounds = vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1_000, bottom: 700, width: 1_000, height: 700, toJSON: () => ({}) });
    const htmlBounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains("canvas-layer-list") ? 350 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: 210, bottom: height, width: 210, height, toJSON: () => ({}) };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();

    try {
      const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
      await waitFor(() => expect(container.querySelectorAll(".canvas-stage .canvas-node")).toHaveLength(1));
      await waitFor(() => expect(container.querySelectorAll(".canvas-layer-row").length).toBeLessThan(40));

      await user.click(screen.getByRole("button", { name: "Distant editable layer" }));
      await waitFor(() => expect(container.querySelectorAll(".canvas-stage .canvas-node")).toHaveLength(2));
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(onChange.mock.calls.at(-1)?.[0].content.elements[1]).toMatchObject({ id: "large-scene-1", x: 5_101 });
    } finally {
      bounds.mockRestore();
      htmlBounds.mockRestore();
    }
  });

  it("supports history, multi-selection alignment, and reusable component instances", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-a", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Rectangle$/ }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("No layers yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByRole("button", { name: "Hide Rectangle" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Rectangle$/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    const layerButtons = screen.getAllByRole("button", { name: /^Rectangle(?: copy)?$/ });
    expect(layerButtons).toHaveLength(2);
    await user.click(layerButtons[1]);
    fireEvent.click(layerButtons[0], { shiftKey: true });

    const alignment = screen.getByRole("toolbar", { name: "Selection alignment" });
    expect(alignment).toHaveTextContent("2 selected");
    await user.click(within(alignment).getByRole("button", { name: "Align left" }));
    const aligned = onChange.mock.calls.at(-1)?.[0].content;
    expect(aligned.elements[0].x).toBe(aligned.elements[1].x);

    await user.click(screen.getByRole("tab", { name: "Assets" }));
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    await user.click(within(sidebar).getByRole("button", { name: /Create component/ }));
    expect(within(sidebar).getByRole("button", { name: /Component 1/ })).toBeInTheDocument();

    await user.click(within(sidebar).getByRole("button", { name: /Button \/ Primary/ }));
    const override = screen.getByDisplayValue("Continue");
    await user.clear(override);
    await user.type(override, "Ship now");

    const updated = onChange.mock.calls.at(-1)?.[0].content;
    expect(updated.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Component 1" }),
      expect.objectContaining({ id: "starter-button", name: "Button / Primary" }),
    ]));
    expect(updated.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentId: "starter-button", componentRole: "instance", overrides: { label: expect.objectContaining({ text: "Ship now" }) } }),
    ]));

    await user.click(screen.getByRole("button", { name: "Reset overrides" }));
    expect(screen.getByDisplayValue("Continue")).toBeInTheDocument();
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentId: "starter-button", componentRole: "instance", overrides: {} }),
    ]));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Rotation" }), { target: { value: "90" } });
    await user.click(screen.getByRole("button", { name: "Detach" }));
    const detached = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(detached.some((node: { componentId?: string }) => node.componentId === "starter-button")).toBe(false);
    expect(detached.filter((node: { type: string; componentId?: string }) => node.type !== "component").every((node: { rotation?: number }) => node.rotation === 90)).toBe(true);
  });

  it("draws extended shapes and turns a grouped selection into an auto-layout frame", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-tools", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });

    await user.click(screen.getByRole("button", { name: "Ellipse tool" }));
    expect(screen.getByRole("button", { name: "Ellipse tool" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 270, clientY: 250 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 270, clientY: 250 });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ellipse" })]));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Rotation" }), { target: { value: "30" } });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ellipse", rotation: 30 })]));

    fireEvent.keyDown(window, { key: "l" });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 310, clientY: 170 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 420, clientY: 240 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 420, clientY: 240 });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([expect.objectContaining({ type: "line" })]));

    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    const ellipseLayer = within(sidebar).getByRole("button", { name: "Ellipse" });
    const lineLayer = within(sidebar).getByRole("button", { name: "Line" });
    await user.click(lineLayer);
    fireEvent.click(ellipseLayer, { shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Group" }));
    const grouped = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(grouped[0].groupId).toBeTruthy();
    expect(grouped[0].groupId).toBe(grouped[1].groupId);

    const widthsBeforeResize = grouped.map((node: { width: number }) => node.width);
    const multiResizeHandle = container.querySelector<SVGRectElement>(".canvas-multi-transform-handles .handle-se");
    expect(multiResizeHandle).not.toBeNull();
    fireEvent.pointerDown(multiResizeHandle!, { pointerId: 3, clientX: 420, clientY: 250 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 500, clientY: 310 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 500, clientY: 310 });
    const resized = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(resized.every((node: { width: number }, index: number) => node.width > widthsBeforeResize[index])).toBe(true);

    await user.click(screen.getByRole("button", { name: "Auto layout" }));
    const laidOut = onChange.mock.calls.at(-1)?.[0].content.elements;
    const frame = laidOut.find((node: { type: string }) => node.type === "frame");
    expect(frame).toMatchObject({ layout: expect.objectContaining({ direction: "row", sizing: "hug" }) });
    expect(laidOut.filter((node: { type: string }) => node.type !== "frame").every((node: { parentId?: string }) => node.parentId === frame.id)).toBe(true);

    const childrenBeforeRotation = laidOut.filter((node: { type: string }) => node.type !== "frame");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Rotation" }), { target: { value: "90" } });
    const rotated = onChange.mock.calls.at(-1)?.[0].content.elements;
    const rotatedChildren = rotated.filter((node: { type: string }) => node.type !== "frame");
    expect(rotatedChildren.every((node: { rotation?: number }, index: number) => node.rotation === ((childrenBeforeRotation[index].rotation ?? 0) + 90) % 360)).toBe(true);
    expect(rotatedChildren.some((node: { x: number; y: number }, index: number) => node.x !== childrenBeforeRotation[index].x || node.y !== childrenBeforeRotation[index].y)).toBe(true);

    const childrenBeforeMove = rotatedChildren;
    fireEvent.change(screen.getByRole("spinbutton", { name: "X position" }), { target: { value: String(frame.x + 20) } });
    const moved = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(moved.filter((node: { type: string }) => node.type !== "frame").every((node: { x: number }, index: number) => node.x === childrenBeforeMove[index].x + 20)).toBe(true);

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    const pasted = onChange.mock.calls.at(-1)?.[0].content.elements;
    const pastedFrames = pasted.filter((node: { type: string }) => node.type === "frame");
    expect(pastedFrames).toHaveLength(2);
    expect(pasted.filter((node: { parentId?: string }) => node.parentId === pastedFrames[1].id)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "SVG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PNG" })).toBeInTheDocument();
  });

  it("authors arrows, freehand strokes, and point-by-point vector paths", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-vectors", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });

    await user.click(screen.getByRole("button", { name: "Arrow tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 10, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(canvas, { pointerId: 10, clientX: 340, clientY: 250, shiftKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 10, clientX: 340, clientY: 250, shiftKey: true });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], endCap: "arrow" }),
    ]));

    await user.click(screen.getByRole("button", { name: "Pencil tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 11, clientX: 180, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 11, clientX: 220, clientY: 320 });
    fireEvent.pointerMove(canvas, { pointerId: 11, clientX: 270, clientY: 290 });
    fireEvent.pointerUp(canvas, { pointerId: 11, clientX: 270, clientY: 290 });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "path", name: "Freehand path", pathSmoothing: .65, points: expect.arrayContaining([expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })]) }),
    ]));

    await user.click(screen.getByRole("button", { name: "Pen tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 12, clientX: 420, clientY: 180 });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 13, clientX: 500, clientY: 230 });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 14, clientX: 470, clientY: 320 });
    fireEvent.keyDown(window, { key: "Enter" });
    const content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "path", name: "Vector path", points: expect.arrayContaining([expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })]) }),
    ]));
    expect(content.elements.filter((node: { type: string }) => node.type === "path")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Vector path" })).toBeInTheDocument();
  });

  it("creates gradient fills and reuses them as linked color styles", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-paints", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });

    await user.click(screen.getByRole("button", { name: "Rectangle tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 20, clientX: 140, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 20, clientX: 300, clientY: 260 });
    fireEvent.pointerUp(canvas, { pointerId: 20, clientX: 300, clientY: 260 });
    fireEvent.change(screen.getByRole("combobox", { name: "Fill type" }), { target: { value: "linear" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Gradient angle" }), { target: { value: "35" } });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0]).toMatchObject({ fillGradient: { type: "linear", angle: 35, stops: [{ offset: 0 }, { offset: 1 }] } });

    await user.click(screen.getByRole("tab", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: "Save selected fill as style" }));
    const styled = onChange.mock.calls.at(-1)?.[0].content;
    expect(styled.styles).toEqual([expect.objectContaining({ name: "Rectangle paint", gradient: expect.objectContaining({ angle: 35 }) })]);
    expect(styled.elements[0].fillStyleId).toBe(styled.styles[0].id);

    await user.click(screen.getByRole("button", { name: "Rectangle tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 21, clientX: 360, clientY: 180 });
    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 500, clientY: 280 });
    fireEvent.pointerUp(canvas, { pointerId: 21, clientX: 500, clientY: 280 });
    await user.click(screen.getByRole("button", { name: "Apply Rectangle paint" }));
    const reused = onChange.mock.calls.at(-1)?.[0].content;
    expect(reused.elements[1]).toMatchObject({ fillStyleId: styled.styles[0].id, fillGradient: { angle: 35 } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Gradient angle" }), { target: { value: "55" } });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[1]).toMatchObject({ fillStyleId: undefined, fillGradient: { angle: 55 } });
  });

  it("creates linked typography and effect styles with undoable design-system changes", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-design-styles", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.change(screen.getByRole("combobox", { name: "Font family" }), { target: { value: "Source Serif 4" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), { target: { value: "32" } });
    await user.click(screen.getByRole("tab", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: "Save typography as style" }));
    const styledText = onChange.mock.calls.at(-1)?.[0].content;
    expect(styledText.textStyles).toEqual([expect.objectContaining({ name: "Text text", fontFamily: "Source Serif 4", fontSize: 32 })]);
    expect(styledText.elements[0].textStyleId).toBe(styledText.textStyles[0].id);

    await user.click(screen.getByRole("button", { name: "Rectangle tool" }));
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Drop shadow" }));
    await user.click(screen.getByRole("tab", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: "Save shadow as style" }));
    const styledEffect = onChange.mock.calls.at(-1)?.[0].content;
    expect(styledEffect.effectStyles).toEqual([expect.objectContaining({ name: "Rectangle effect", shadow: expect.objectContaining({ blur: 18 }) })]);
    expect(styledEffect.elements[1].effectStyleId).toBe(styledEffect.effectStyles[0].id);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    const undone = onChange.mock.calls.at(-1)?.[0].content;
    expect(undone.effectStyles).toEqual([]);
    expect(undone.elements[1].effectStyleId).toBeUndefined();
  });

  it("creates and releases non-destructive shape masks", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-mask", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Rectangle tool" }));
    fireEvent.keyDown(window, { key: "Enter" });
    await user.click(screen.getByRole("button", { name: "Ellipse tool" }));
    fireEvent.keyDown(window, { key: "Enter" });
    const sidebar = screen.getByRole("complementary", { name: "Canvas layers and assets" });
    const rectangle = within(sidebar).getByRole("button", { name: "Rectangle" });
    const ellipse = within(sidebar).getByRole("button", { name: "Ellipse" });
    await user.click(ellipse);
    fireEvent.click(rectangle, { shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Use top as mask" }));
    const masked = onChange.mock.calls.at(-1)?.[0].content.elements;
    expect(masked[0].maskId).toBe(masked[1].id);
    expect(container.querySelector(`clipPath#canvas-mask-${masked[1].id}`)).not.toBeNull();
    expect(container.querySelector(`g[clip-path="url(#canvas-mask-${masked[1].id})"]`)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Release mask" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].maskId).toBeUndefined();
  });

  it("supports keyboard-only insertion and vector-point editing with large hit targets", () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-keyboard", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    fireEvent.keyDown(window, { key: "p" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual([expect.objectContaining({ type: "path", name: "Vector path" })]);
    const point = screen.getByRole("button", { name: /Path point 2/ });
    const before = onChange.mock.calls.at(-1)?.[0].content.elements[0].points;
    fireEvent.keyDown(point, { key: "ArrowRight", shiftKey: true });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].points).not.toEqual(before);

    fireEvent.keyDown(window, { key: "L", shiftKey: true });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([expect.objectContaining({ type: "arrow" })]));
    expect(container.querySelectorAll(".canvas-handle-hit").length).toBeGreaterThan(0);
    expect(container.querySelector(".canvas-resize-hit")).toHaveAttribute("width", expect.stringMatching(/^\d/));
  });

  it("flushes a pending viewport change when the editor closes immediately", () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-close-viewport", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const { unmount } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });

    fireEvent.wheel(canvas, { deltaX: 24, deltaY: 18 });
    unmount();
    expect(onChange.mock.calls.at(-1)?.[0].content.appState.viewport).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), zoom: expect.any(Number) }));
  });

  it("defers offscreen page thumbnails until their rail rows approach the viewport", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    class DeferredIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "84px";
      readonly thresholds = [0];
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      disconnect(): void { /* Test observer has no native resources. */ }
      observe(): void { /* Visibility is driven explicitly below. */ }
      takeRecords(): IntersectionObserverEntry[] { return []; }
      unobserve(): void { /* Visibility is driven explicitly below. */ }
    }
    vi.stubGlobal("IntersectionObserver", DeferredIntersectionObserver);
    const artifact = createArtifact("canvas", "project-a", "canvas-lazy-pages", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const elements = artifact.content.elements;
    artifact.content.pages = [
      { id: "active", name: "Active", frame: artifact.content.frame, elements, appState },
      { id: "later-a", name: "Later A", frame: artifact.content.frame, elements: [], appState },
      { id: "later-b", name: "Later B", frame: artifact.content.frame, elements: [], appState },
    ];
    artifact.content.activePageId = "active";
    artifact.content.appState = appState;

    try {
      const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);
      expect(container.querySelectorAll(".canvas-page-thumbnail")).toHaveLength(3);
      expect(container.querySelectorAll(".canvas-page-thumbnail img")).toHaveLength(1);
      expect(callbacks).toHaveLength(2);

      act(() => callbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      await waitFor(() => expect(container.querySelectorAll(".canvas-page-thumbnail img")).toHaveLength(2));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("applies page presets, custom dimensions, orientation, color, and undo", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-page-settings", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Page size preset" }), "phone");
    let content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.frame).toEqual({ width: 390, height: 844 });
    expect(content.pages.find((page: { id: string }) => page.id === content.activePageId).frame).toEqual(content.frame);

    await user.click(screen.getByRole("button", { name: "Swap orientation" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.frame).toEqual({ width: 844, height: 390 });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.frame).toEqual({ width: 390, height: 844 });
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.frame).toEqual({ width: 844, height: 390 });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Page width" }), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Page background"), { target: { value: "#fef3c7" } });
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.frame).toEqual({ width: 900, height: 390 });
    expect(content.appState.viewBackgroundColor).toBe("#fef3c7");
  });

  it("manages page-local layers, viewports, rulers, and persistent guides", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-pages", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);
    const canvas = screen.getByRole("application", { name: "Canvas artwork" });
    const initialThumbnailSource = container.querySelector<HTMLImageElement>(".canvas-page-thumbnail img")?.src;

    await user.click(screen.getByRole("button", { name: "Rectangle tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 31, clientX: 120, clientY: 140 });
    fireEvent.pointerMove(canvas, { pointerId: 31, clientX: 240, clientY: 220 });
    fireEvent.pointerUp(canvas, { pointerId: 31, clientX: 240, clientY: 220 });
    await waitFor(() => expect(container.querySelector<HTMLImageElement>(".canvas-page-thumbnail img")?.src).not.toBe(initialThumbnailSource));
    await user.click(screen.getByRole("button", { name: "Add page" }));
    let content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.pages).toHaveLength(2);
    expect(container.querySelectorAll(".canvas-page-thumbnail img")).toHaveLength(2);
    expect([...container.querySelectorAll<HTMLImageElement>(".canvas-page-thumbnail img")].every((image) => image.src.startsWith("data:image/svg+xml"))).toBe(true);
    expect(content.elements).toEqual([]);
    expect(content.pages.find((page: { id: string }) => page.id === content.activePageId).elements).toEqual(content.elements);

    await user.click(screen.getByRole("button", { name: "Ellipse tool" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 32, clientX: 300, clientY: 180 });
    fireEvent.pointerMove(canvas, { pointerId: 32, clientX: 400, clientY: 280 });
    fireEvent.pointerUp(canvas, { pointerId: 32, clientX: 400, clientY: 280 });
    await user.click(screen.getByRole("button", { name: "Set Page 2 as prototype start" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.prototypeStartPageId).toBe(content.activePageId);
    await user.click(screen.getByRole("button", { name: "Move Page 2 up" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.pages.map((page: { name: string }) => page.name)).toEqual(["Page 2", "Page 1"]);
    await user.click(screen.getByRole("button", { name: /^Page 1 1$/ }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.elements).toEqual([expect.objectContaining({ type: "rectangle" })]);
    expect(content.pages.find((page: { id: string }) => page.id === content.activePageId).elements).toEqual(content.elements);
    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    expect(screen.getByRole("dialog", { name: "Canvas prototype preview" })).toHaveTextContent("Page 2");
    expect(screen.getByAltText("Page 2 prototype screen")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close prototype preview" }));

    await user.click(screen.getByRole("checkbox", { name: "Show rulers" }));
    await user.click(screen.getByRole("button", { name: "Vertical" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.appState).toMatchObject({ rulersVisible: true, guidesVisible: true, guides: [expect.objectContaining({ axis: "x", position: 480 })] });
    expect(content.pages.find((page: { id: string }) => page.id === content.activePageId).appState).toEqual(content.appState);
    expect(container.querySelector(".canvas-rulers")).not.toBeNull();
    expect(container.querySelector(".canvas-ruler-guide")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete Page 2" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.pages).toHaveLength(1);
    expect(content.prototypeStartPageId).toBe(content.pages[0].id);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Current page name" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Undo" }));
    content = onChange.mock.calls.at(-1)?.[0].content;
    expect(content.pages).toHaveLength(2);
    expect(content.prototypeStartPageId).toBe(content.pages.find((page: { name: string }) => page.name === "Page 2").id);
  });

  it("exposes an accessible layer hierarchy and reparents layers into frames", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-hierarchy", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    artifact.content.elements = [
      { id: "frame", type: "frame", name: "Card frame", x: 80, y: 80, width: 300, height: 220, color: "#ffffff" },
      { id: "shape", type: "rectangle", name: "Card surface", x: 120, y: 120, width: 120, height: 80, color: "#2563eb" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Card surface" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Parent frame" }), "frame");
    expect(onChange.mock.calls.at(-1)?.[0].content.elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: "shape", parentId: "frame" })]));
    const row = screen.getByRole("button", { name: "Card surface" }).closest(".canvas-layer-row");
    expect(row).toHaveClass("nested");
    expect(row).toHaveAttribute("draggable", "true");
    expect(container.querySelector('.canvas-layer-row[title*="Drag to reorder"]')).not.toBeNull();
  });

  it("authors page interactions and runs them in the in-canvas prototype player", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const homeElements = [{ id: "cta", type: "rectangle" as const, name: "Open details", x: 80, y: 80, width: 180, height: 64, color: "#2563eb" }];
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 960, height: 600 }, elements: homeElements, appState },
      { id: "details", name: "Details", frame: { width: 960, height: 600 }, elements: [{ id: "title", type: "text", name: "Details title", x: 80, y: 80, width: 260, height: 60, color: "#17181c", text: "Details" }], appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.elements = homeElements;
    artifact.content.appState = appState;
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Interaction" }));
    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].interactions).toEqual([
      expect.objectContaining({ trigger: "click", action: "navigate", destinationPageId: "details", transition: expect.objectContaining({ type: "dissolve" }) }),
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Interaction 1 transition" }), "slide");
    await user.selectOptions(screen.getByRole("combobox", { name: "Interaction 1 direction" }), "right");

    const playButton = screen.getByRole("button", { name: "Play prototype" });
    const callsBeforePreview = onChange.mock.calls.length;
    await user.click(playButton);
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    expect(preview).toHaveFocus();
    expect(document.querySelector(".canvas-layers")).toHaveAttribute("inert");
    expect(document.querySelector(".studio-inspector")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    expect(onChange).toHaveBeenCalledTimes(callsBeforePreview);
    expect(within(preview).getByAltText("Home prototype screen")).toBeInTheDocument();
    await user.click(within(preview).getByRole("button", { name: "Run Open details click interaction" }));
    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
    expect(preview.querySelector(".canvas-prototype-screen")).toHaveClass("slide-right");
    expect(preview.querySelector(".canvas-prototype-screen")).toHaveStyle({ animationDuration: "180ms", animationTimingFunction: "ease-out" });
    await user.click(within(preview).getByRole("button", { name: "Previous prototype screen" }));
    expect(within(preview).getByAltText("Home prototype screen")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Canvas prototype preview" })).toBeNull();
    expect(playButton).toHaveFocus();
  });

  it("authors named flows and previews smart transitions between matching layers", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-smart-prototype", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const homeElements = [{ id: "hero-home", type: "rectangle" as const, name: "Hero", prototypeKey: "hero", x: 80, y: 80, width: 180, height: 100, color: "#2563eb", interactions: [{ id: "expand", trigger: "click" as const, action: "navigate" as const, destinationPageId: "details", transition: { type: "smart" as const, duration: 320, easing: "ease-in-out" as const } }] }];
    const detailElements = [{ id: "hero-details", type: "rectangle" as const, name: "Hero", prototypeKey: "hero", x: 480, y: 160, width: 340, height: 240, color: "#7c3aed" }];
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 960, height: 600 }, elements: homeElements, appState },
      { id: "details", name: "Details", frame: { width: 960, height: 600 }, elements: detailElements, appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.elements = homeElements;
    artifact.content.appState = appState;
    artifact.content.prototypeFlows = [{ id: "main", name: "Main flow", startPageId: "home" }];
    artifact.content.prototypeStartPageId = "home";
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add prototype flow" }));
    await user.clear(screen.getByRole("textbox", { name: "Prototype flow name" }));
    await user.type(screen.getByRole("textbox", { name: "Prototype flow name" }), "Alternate journey");
    await user.tab();
    await user.selectOptions(screen.getByRole("combobox", { name: "Prototype flow start page" }), "details");
    expect(onChange.mock.calls.at(-1)?.[0].content.prototypeFlows).toEqual([
      { id: "main", name: "Main flow", startPageId: "home" },
      expect.objectContaining({ name: "Alternate journey", startPageId: "details" }),
    ]);
    expect(onChange.mock.calls.at(-1)?.[0].content.prototypeStartPageId).toBe("home");

    await user.selectOptions(screen.getByRole("combobox", { name: "Active prototype flow" }), "main");
    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    expect(within(preview).getByRole("combobox", { name: "Preview prototype flow" })).toHaveValue("main");
    await user.click(within(preview).getByRole("button", { name: "Run Hero click interaction" }));
    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
    expect(preview.querySelector(".canvas-prototype-screen")).toHaveClass("smart");
    expect(preview.querySelector(".canvas-prototype-smart-source")).toHaveStyle({ transformOrigin: "17.708333333333336% 21.666666666666668%" });
    expect(preview.querySelector(".canvas-prototype-smart-destination")).not.toBeNull();

    await user.selectOptions(within(preview).getByRole("combobox", { name: "Preview prototype flow" }), within(preview).getByRole("option", { name: "Alternate journey" }));
    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
    expect(within(preview).getByText("Starting screen")).toBeInTheDocument();
    expect(within(preview).getByRole("status")).toHaveTextContent("Alternate journey: Details");
  });

  it("keeps prototype hotspots keyboard reachable and clips them to visible frame bounds", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype-a11y", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const elements = [
      { id: "clip", type: "frame" as const, name: "Clip", x: 100, y: 100, width: 100, height: 100, color: "#ffffff", clipContent: true },
      { id: "hover", parentId: "clip", type: "rectangle" as const, name: "Hover target", x: 150, y: 150, width: 100, height: 100, color: "#2563eb", interactions: [{ id: "hover-go", trigger: "hover" as const, action: "navigate" as const, destinationPageId: "details" }] },
      { id: "hidden", type: "frame" as const, name: "Hidden group", x: 300, y: 100, width: 120, height: 120, color: "#ffffff", hidden: true },
      { id: "hidden-link", parentId: "hidden", type: "rectangle" as const, name: "Hidden link", x: 310, y: 110, width: 80, height: 40, color: "#2563eb", interactions: [{ id: "hidden-go", trigger: "click" as const, action: "navigate" as const, destinationPageId: "details" }] },
    ];
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 500, height: 400 }, elements, appState },
      { id: "details", name: "Details", frame: { width: 500, height: 400 }, elements: [], appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.frame = { width: 500, height: 400 };
    artifact.content.elements = elements;
    artifact.content.appState = appState;
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    const hotspot = within(preview).getByRole("button", { name: "Run Hover target hover interaction" });
    expect(hotspot).toHaveStyle({ left: "30%", top: "37.5%", width: "10%", height: "12.5%" });
    expect(within(preview).queryByRole("button", { name: /Hidden link/ })).toBeNull();
    fireEvent.focus(hotspot);
    expect(within(preview).getByAltText("Details prototype screen")).toBeInTheDocument();
  });

  it("authors overlay actions and delayed triggers in the prototype inspector", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype-authoring", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const target = { id: "target", type: "rectangle" as const, name: "Prototype target", x: 80, y: 80, width: 180, height: 64, color: "#2563eb" };
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 960, height: 600 }, elements: [target], appState },
      { id: "details", name: "Details", frame: { width: 400, height: 260 }, elements: [], appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.elements = [target];
    artifact.content.appState = appState;
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    const addInteraction = screen.getByRole("button", { name: "Interaction" });
    await user.click(addInteraction);
    await user.click(addInteraction);
    await user.selectOptions(screen.getByRole("combobox", { name: "Interaction 2 action" }), "open-overlay");
    await user.selectOptions(screen.getByRole("combobox", { name: "Interaction 2 overlay position" }), "bottom-right");
    await user.selectOptions(screen.getByRole("combobox", { name: "Interaction 2 overlay background" }), "none");
    await user.click(screen.getByRole("checkbox", { name: "Interaction 2 close outside" }));
    await user.click(addInteraction);
    expect(addInteraction).toBeDisabled();
    await user.clear(screen.getByRole("spinbutton", { name: "Interaction 3 delay" }));
    await user.type(screen.getByRole("spinbutton", { name: "Interaction 3 delay" }), "750");

    expect(onChange.mock.calls.at(-1)?.[0].content.elements[0].interactions).toEqual([
      expect.objectContaining({ trigger: "click", action: "navigate", destinationPageId: "details" }),
      expect.objectContaining({ trigger: "hover", action: "open-overlay", destinationPageId: "details", overlay: { position: "bottom-right", background: "none", closeOnOutsideClick: false } }),
      expect.objectContaining({ trigger: "after-delay", delay: 750, action: "navigate", destinationPageId: "details" }),
    ]);
  });

  it("opens accessible prototype overlays and restores focus when they close", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype-overlay", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const open = { id: "open", type: "rectangle" as const, name: "Open preferences", x: 80, y: 80, width: 180, height: 64, color: "#2563eb", interactions: [{ id: "open-modal", trigger: "click" as const, action: "open-overlay" as const, destinationPageId: "modal", overlay: { position: "center" as const, background: "dim" as const, closeOnOutsideClick: true }, transition: { type: "dissolve" as const, duration: 120, easing: "ease-out" as const } }] };
    const close = { id: "close", type: "rectangle" as const, name: "Save preferences", x: 40, y: 120, width: 160, height: 52, color: "#2563eb", interactions: [{ id: "close-modal", trigger: "click" as const, action: "close-overlay" as const }] };
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 960, height: 600 }, elements: [open], appState },
      { id: "modal", name: "Preferences", frame: { width: 400, height: 260 }, elements: [close], appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.elements = [open];
    artifact.content.appState = appState;
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    const openHotspot = within(preview).getByRole("button", { name: "Run Open preferences click interaction" });
    await user.click(openHotspot);
    expect(within(preview).getByRole("region", { name: "Preferences overlay" })).toBeInTheDocument();
    expect(preview.querySelector(".canvas-prototype-screen")).toHaveAttribute("inert");
    const closeHotspot = within(preview).getByRole("button", { name: "Run Save preferences click interaction" });
    await waitFor(() => expect(closeHotspot).toHaveFocus());
    await user.click(closeHotspot);
    expect(within(preview).queryByRole("region", { name: "Preferences overlay" })).toBeNull();
    await waitFor(() => expect(openHotspot).toHaveFocus());

    await user.click(openHotspot);
    await user.click(within(preview).getByRole("button", { name: "Close Preferences overlay" }));
    expect(within(preview).queryByRole("region", { name: "Preferences overlay" })).toBeNull();
    await user.click(openHotspot);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Canvas prototype preview" })).toBeInTheDocument();
    expect(within(preview).queryByRole("region", { name: "Preferences overlay" })).toBeNull();
  });

  it("runs delayed prototype interactions without exposing a false hotspot", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype-timer", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const timer = { id: "timer", type: "rectangle" as const, name: "Loading indicator", x: 80, y: 80, width: 180, height: 64, color: "#2563eb", interactions: [{ id: "finish-loading", trigger: "after-delay" as const, delay: 0, action: "navigate" as const, destinationPageId: "ready", transition: { type: "instant" as const, duration: 0, easing: "linear" as const } }] };
    artifact.content.pages = [
      { id: "loading", name: "Loading", frame: { width: 960, height: 600 }, elements: [timer], appState },
      { id: "ready", name: "Ready", frame: { width: 960, height: 600 }, elements: [], appState },
    ];
    artifact.content.activePageId = "loading";
    artifact.content.elements = [timer];
    artifact.content.appState = appState;
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={vi.fn()} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    expect(within(preview).queryByRole("button", { name: /Loading indicator/ })).toBeNull();
    await waitFor(() => expect(within(preview).getByAltText("Ready prototype screen")).toBeInTheDocument());
  });

  it("restores blank page names instead of emitting invalid canvas data", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-page-name", "2026-07-22T10:00:00.000Z");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    const pageName = screen.getByRole("textbox", { name: "Current page name" });
    await user.clear(pageName);
    await user.tab();

    expect(pageName).toHaveValue("Page 1");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens only safe prototype links and removes links to deleted pages", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-prototype-safety", "2026-07-22T10:00:00.000Z");
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas content");
    const appState = { viewBackgroundColor: "#ffffff", snapToGrid: true };
    const linked = { id: "link", type: "rectangle" as const, name: "Documentation", x: 20, y: 20, width: 160, height: 52, color: "#2563eb", interactions: [{ id: "external", trigger: "click" as const, action: "open-url" as const, url: "https://example.com/guide" }] };
    const stale = { id: "stale", type: "rectangle" as const, name: "Old screen", x: 20, y: 100, width: 160, height: 52, color: "#64748b", interactions: [{ id: "obsolete", trigger: "click" as const, action: "navigate" as const, destinationPageId: "obsolete" }] };
    artifact.content.pages = [
      { id: "home", name: "Home", frame: { width: 960, height: 600 }, elements: [linked, stale], appState },
      { id: "obsolete", name: "Obsolete", frame: { width: 960, height: 600 }, elements: [], appState },
    ];
    artifact.content.activePageId = "home";
    artifact.content.elements = [linked, stale];
    artifact.content.appState = appState;
    const openExternal = vi.fn(async () => undefined);
    Object.defineProperty(window, "khadim", { configurable: true, value: { shell: { openExternal } } });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StudioWorkspace artifact={artifact} saveState="saved" onChange={onChange} onClose={vi.fn()} onExportPdf={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Play prototype" }));
    const preview = screen.getByRole("dialog", { name: "Canvas prototype preview" });
    await user.click(within(preview).getByRole("button", { name: "Run Documentation click interaction" }));
    expect(openExternal).toHaveBeenCalledWith("https://example.com/guide");
    await user.click(within(preview).getByRole("button", { name: "Close prototype preview" }));

    await user.click(screen.getByRole("button", { name: "Delete Obsolete" }));
    const saved = onChange.mock.calls.at(-1)?.[0].content;
    expect(saved.pages).toHaveLength(1);
    expect(saved.elements[0].interactions).toEqual([expect.objectContaining({ id: "external" })]);
    expect(saved.elements[1].interactions).toBeUndefined();
  });
});
