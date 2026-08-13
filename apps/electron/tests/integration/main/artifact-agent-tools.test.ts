import { afterEach, describe, expect, it } from "vitest";
import { createArtifactAgentToolServer, type ArtifactAgentToolServer } from "../../../src/main/artifact-agent-tools";
import { createArtifact } from "../../../src/renderer/src/artifact-model";
import type { Artifact, CanvasArtifactContent } from "../../../src/shared/types";

function canvasArtifact(): Artifact {
  const artifact = createArtifact("canvas", "project-a", "canvas-a", "2026-01-01T00:00:00.000Z");
  if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas");
  artifact.content = {
    ...artifact.content,
    activePageId: "page-1",
    pages: [
      { id: "page-1", name: "Page 1", frame: { width: 800, height: 600 }, elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
        { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
      ], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
    ],
    elements: [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
      { id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
    ],
  } as CanvasArtifactContent;
  return artifact;
}

describe("selected artifact agent tools", () => {
  let server: ArtifactAgentToolServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("binds reads and edits to one persisted artifact without creating another", async () => {
    let artifacts: Artifact[] = [createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z")];
    const repository = {
      listArtifacts: async (projectId: string) => artifacts.filter((artifact) => artifact.projectId === projectId),
      saveArtifacts: async (_projectId: string, next: Artifact[]) => { artifacts = structuredClone(next); },
    };
    server = await createArtifactAgentToolServer(
      repository,
      { projectId: "project-a", artifactId: "artifact-a" },
      () => "2026-01-02T00:00:00.000Z",
    );
    const url = server.env.KHADIM_NATIVE_TOOL_RPC_URL;
    const authorization = `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}`;
    expect((JSON.parse(server.env.KHADIM_NATIVE_TOOLS) as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(["artifact_read", "artifact_edit"]);

    const manifestResponse = await fetch(`${url}/tool/artifact_read`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });
    const manifest = await manifestResponse.json() as { content: string; metadata: Record<string, unknown> };
    expect(manifestResponse.status).toBe(200);
    expect(JSON.parse(manifest.content)).toMatchObject({ id: "artifact-a", framework: "react-router" });
    expect(manifest.metadata).toMatchObject({ artifactId: "artifact-a" });

    const editResponse = await fetch(`${url}/tool/artifact_edit`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ input: { componentPatches: [{ id: "starter-heading", props: { text: "Bound to the selected artifact" } }] } }),
    });
    const editResult = await editResponse.json() as { metadata: Record<string, unknown> };

    expect(editResponse.status).toBe(200);
    expect(editResult.metadata).toMatchObject({ artifactId: "artifact-a", changeCount: 1 });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].id).toBe("artifact-a");
    expect(artifacts[0].updatedAt).toBe("2026-01-02T00:00:00.000Z");
    if (artifacts[0].content.format !== "web-project") throw new Error("Expected web project");
    expect(artifacts[0].content.previewHtml).toContain("Bound to the selected artifact");
  });

  it("exposes a concrete nested JSON Schema for canvasCommands add-elements in KHADIM_NATIVE_TOOLS", async () => {
    const artifact = createArtifact("canvas", "project-a", "canvas-a", "2026-01-01T00:00:00.000Z");
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => [artifact],
      saveArtifacts: async () => undefined,
    }, { projectId: "project-a", artifactId: "canvas-a" });

    const tools = JSON.parse(server.env.KHADIM_NATIVE_TOOLS) as Array<{
      name: string;
      parameters?: { properties?: Record<string, unknown> };
    }>;
    const edit = tools.find((tool) => tool.name === "artifact_edit")!;
    expect(edit).toBeTruthy();
    const canvasCommands = edit.parameters!.properties!.canvasCommands as {
      properties?: { commands?: { items?: { oneOf?: unknown[] } } };
    };
    const commands = canvasCommands.properties!.commands!;
    const variants = commands.items!.oneOf! as Array<{ type?: string; const?: string; properties?: Record<string, unknown> }>;
    // The add-elements variant must be a concrete object schema.
    const addElements = variants.find((v) => v.const === "add-elements" || (v.properties?.type as { const?: string })?.const === "add-elements")!;
    expect(addElements).toBeTruthy();
    const elementsItem = (addElements.properties!.elements as {
      items?: { required?: string[]; properties?: Record<string, unknown> };
    }).items!;
    expect((elementsItem.required as string[])).toEqual(expect.arrayContaining(["id", "type", "x", "y", "width", "height", "color"]));
    expect((elementsItem.properties!.type as { enum?: string[] }).enum).toEqual(["rectangle", "ellipse", "line", "arrow", "path", "text"]);
    // The points sub-schema must expose the 2..1000 normalized-point shape.
    const points = elementsItem.properties!.points as {
      type?: string; minItems?: number; maxItems?: number;
      items?: { properties?: Record<string, unknown> };
    };
    expect(points.type).toBe("array");
    expect(points.minItems).toBe(2);
    expect(points.maxItems).toBe(1000);
    const pointProps = points.items!.properties!;
    expect(pointProps.x).toMatchObject({ minimum: -10, maximum: 10 });
    expect(pointProps.y).toMatchObject({ minimum: -10, maximum: 10 });
    expect(pointProps.nodeType).toMatchObject({ enum: ["corner", "smooth"] });
    const handleIn = pointProps.handleIn as { properties?: Record<string, unknown> };
    expect(handleIn.properties).toMatchObject({ x: { minimum: -100000, maximum: 100000 }, y: { minimum: -100000, maximum: 100000 } });
    const handleOut = pointProps.handleOut as { properties?: Record<string, unknown> };
    expect(handleOut.properties).toMatchObject({ x: { minimum: -100000, maximum: 100000 }, y: { minimum: -100000, maximum: 100000 } });
    // The selected mutation command variants remain representable.
    const patchElements = variants.find((v) => (v.properties?.type as { const?: string })?.const === "patch-elements");
    expect(patchElements).toBeTruthy();
  });

  it("rejects requests that do not have the run-scoped bearer token", async () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => [artifact],
      saveArtifacts: async () => undefined,
    }, { projectId: "project-a", artifactId: "artifact-a" });

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_read`, {
      method: "POST",
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(401);
  });

  it("keeps artifact validation errors inside the generic tool protocol", async () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => [artifact],
      saveArtifacts: async () => undefined,
    }, { projectId: "project-a", artifactId: "artifact-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      content: "artifact_edit requires at least one valid, bounded change.",
    });
  });

  it("exposes a bounded canvas manifest without binary file data", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {} }),
    });
    const manifest = await response.json() as { content: string };
    expect(response.status).toBe(200);
    const parsed = JSON.parse(manifest.content);
    expect(parsed.format).toBe("khadim-canvas");
    expect(parsed.activePageId).toBe("page-1");
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.activePageElements).toHaveLength(2);
    expect(parsed.activePageElements[0]).toMatchObject({ id: "a", type: "rectangle" });
    expect(parsed.files).toBeUndefined();
    expect(JSON.stringify(parsed).length).toBeLessThan(120_000);
    // Useful truncation metadata is present for the active page summary.
    expect(parsed.truncation.activePageElements).toMatchObject({ total: 2, included: 2, omitted: 0 });
  });

  it("bounds a large valid-canvas manifest under maxReadLength with useful truncation metadata", async () => {
    // Build a canvas with many elements and long text to exercise truncation.
    const bigCanvas = canvasArtifact();
    if (bigCanvas.content.format !== "khadim-canvas") throw new Error("Expected canvas");
    const elements = Array.from({ length: 5_000 }, (_, i) => ({
      id: `e${i}`,
      type: "rectangle",
      x: i * 10,
      y: 0,
      width: 100,
      height: 80,
      color: "#111827",
      ...(i % 7 === 0 ? { text: "T".repeat(2_000) } : {}),
    })) as CanvasArtifactContent["elements"];
    bigCanvas.content = {
      ...bigCanvas.content,
      elements,
      pages: [
        { id: "page-1", name: "Page 1", frame: { width: 800, height: 600 }, elements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
      ],
    };
    let artifacts: Artifact[] = [bigCanvas];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {} }),
    });
    const manifest = await response.json() as { content: string; metadata: Record<string, unknown> };
    expect(response.status).toBe(200);
    // The serialized manifest must stay under the maxReadLength ceiling.
    expect(manifest.content.length).toBeLessThanOrEqual(240_000);
    const parsed = JSON.parse(manifest.content);
    // Binary file data is never serialized.
    expect(parsed.files).toBeUndefined();
    // Useful truncation metadata reports totals and how many were omitted.
    expect(parsed.truncation.activePageElements).toMatchObject({ total: 5_000 });
    expect(parsed.truncation.activePageElements.omitted).toBeGreaterThan(0);
    // Text summaries are truncated, with original length reported alongside.
    const withText = parsed.activePageElements.find((element: { textLength?: number }) => element.textLength);
    expect(withText).toBeTruthy();
    expect(typeof withText.textLength).toBe("number");
    expect(withText.text.length).toBeLessThan(withText.textLength);
  });

  it("bounds an extreme valid canvas with thousands of long style/component/token names", async () => {
    // Build an extreme but valid canvas: thousands of components, styles,
    // token collections, prototype flows, and pages, all with very long names,
    // plus thousands of elements with long text. The manifest must stay under
    // maxReadLength, remain parseable JSON, omit binary file data, report
    // truncation metadata for every omitted section, and keep core active-page
    // and selection-relevant information intact.
    const extreme = canvasArtifact();
    if (extreme.content.format !== "khadim-canvas") throw new Error("Expected canvas");
    const longName = "N".repeat(500);
    const elements = Array.from({ length: 6_000 }, (_, i) => ({
      id: `e${i}`,
      type: "rectangle",
      name: `${longName}-${i}`,
      x: i,
      y: 0,
      width: 100,
      height: 80,
      color: "#111827",
      ...(i % 5 === 0 ? { text: "X".repeat(2_000) } : {}),
    })) as CanvasArtifactContent["elements"];
    extreme.content = {
      ...extreme.content,
      activePageId: "page-1",
      frame: { width: 960, height: 600 },
      elements,
      components: Array.from({ length: 4_000 }, (_, i) => ({
        id: `c${i}`,
        name: `${longName}-component-${i}`,
        width: 120,
        height: 80,
        nodes: [{ id: `c${i}-n`, type: "rectangle", x: 0, y: 0, width: 120, height: 80, color: "#2563eb" }],
      })),
      styles: Array.from({ length: 3_000 }, (_, i) => ({ id: `s${i}`, name: `${longName}-paint-${i}`, color: "#2563eb" })),
      textStyles: Array.from({ length: 3_000 }, (_, i) => ({ id: `ts${i}`, name: `${longName}-text-${i}`, fontFamily: "Inter", fontSize: 14, fontWeight: 400, fontStyle: "normal", textAlign: "left", lineHeight: 1.5, letterSpacing: 0 })),
      effectStyles: Array.from({ length: 3_000 }, (_, i) => ({ id: `es${i}`, name: `${longName}-effect-${i}`, shadows: [] })),
      tokenCollections: Array.from({ length: 2_000 }, (_, i) => ({
        id: `tc${i}`,
        name: `${longName}-collection-${i}`,
        modes: ["Light", "Dark"],
        activeMode: "Light",
        tokens: Array.from({ length: 60 }, (_, j) => ({ id: `tc${i}-t${j}`, name: `${longName}-token-${j}`, type: "color", values: { Light: "#2563eb", Dark: "#93c5fd" } })),
      })),
      prototypeFlows: Array.from({ length: 2_000 }, (_, i) => ({ id: `flow${i}`, name: `${longName}-flow-${i}`, startPageId: "page-1" })),
      pages: [
        { id: "page-1", name: `${longName}-active-page`, frame: { width: 960, height: 600 }, elements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
        ...Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `${longName}-page-${i}`, frame: { width: 960, height: 600 }, elements: [], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } })),
      ],
    };
    let artifacts: Artifact[] = [extreme];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {} }),
    });
    const manifest = await response.json() as { content: string; metadata: Record<string, unknown> };
    expect(response.status).toBe(200);
    // The serialized manifest must stay under the maxReadLength ceiling.
    expect(manifest.content.length).toBeLessThanOrEqual(240_000);
    // The manifest must always be valid, parseable JSON.
    const parsed = JSON.parse(manifest.content);
    // Binary file data is never serialized.
    expect(parsed.files).toBeUndefined();
    // Truncation metadata reports omissions for the large sections.
    expect(parsed.truncation.activePageElements).toMatchObject({ total: 6_000 });
    expect(parsed.truncation.activePageElements.omitted).toBeGreaterThan(0);
    expect(parsed.truncation.components).toMatchObject({ total: 4_000 });
    expect(parsed.truncation.components.omitted).toBeGreaterThan(0);
    expect(parsed.truncation.paintStyles).toMatchObject({ total: 3_000 });
    expect(parsed.truncation.paintStyles.omitted).toBeGreaterThan(0);
    expect(parsed.truncation.tokenCollections).toMatchObject({ total: 2_000 });
    expect(parsed.truncation.tokenCollections.omitted).toBeGreaterThan(0);
    expect(parsed.truncation.prototypeFlows).toMatchObject({ total: 2_000 });
    expect(parsed.truncation.prototypeFlows.omitted).toBeGreaterThan(0);
    // Core active-page and selection-relevant information remains intact.
    expect(parsed.activePageId).toBe("page-1");
    expect(parsed.format).toBe("khadim-canvas");
    expect(Array.isArray(parsed.activePageElements)).toBe(true);
    expect(parsed.activePageElements.length).toBeGreaterThan(0);
    expect(parsed.activePageElements[0]).toMatchObject({ type: "rectangle" });
    // Long names in the included summaries are truncated, not passed through.
    const firstElementName = parsed.activePageElements[0].name as string;
    expect(firstElementName.length).toBeLessThanOrEqual(121);
  });

  it("applies canvasCommands matching the trusted selection and persists the change", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a", "b"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: ["a", "b"], commands: [{ type: "patch-elements", elementIds: ["a", "b"], patch: { x: 55 } }] } } }),
    });
    const result = await response.json() as { metadata: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(result.metadata).toMatchObject({ artifactId: "canvas-a", changeCount: 1 });
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.find((e) => e.id === "a")?.x).toBe(55);
    expect(artifacts[0].content.elements.find((e) => e.id === "b")?.x).toBe(55);
  });

  it("rejects canvasCommands that do not match the trusted selection", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: ["a", "b"], commands: [{ type: "patch-elements", elementIds: ["a", "b"], patch: { x: 1 } }] } } }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { content: string };
    expect(body.content).toContain("exact page and selection");
    // Nothing persisted.
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.find((e) => e.id === "a")?.x).toBe(0);
  });

  it("applies additive canvasCommands with no trusted selection and persists the new elements", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: [], commands: [
        { type: "add-elements", elements: [
          { id: "rect-1", type: "rectangle", x: 10, y: 20, width: 100, height: 80, color: "#2563eb" },
          { id: "ellipse-1", type: "ellipse", x: 200, y: 20, width: 60, height: 60, color: "#ef4444" },
        ] },
      ] } } }),
    });
    const result = await response.json() as { metadata: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(result.metadata).toMatchObject({ artifactId: "canvas-a", changeCount: 1 });
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    const ids = artifacts[0].content.elements.map((e) => e.id);
    expect(ids).toEqual(["a", "b", "rect-1", "ellipse-1"]);
    expect(artifacts[0].content.elements.find((e) => e.id === "rect-1")).toMatchObject({ type: "rectangle", x: 10, y: 20, width: 100, height: 80, color: "#2563eb" });
    expect(artifacts[0].content.elements.find((e) => e.id === "ellipse-1")).toMatchObject({ type: "ellipse", x: 200, y: 20, width: 60, height: 60, color: "#ef4444" });
  });

  it("rejects no-selection canvasCommands that patch existing elements (only add-elements permitted)", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: [], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }] } } }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { content: string };
    expect(body.content).toContain("add-elements");
    // Nothing persisted.
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.find((e) => e.id === "a")?.x).toBe(0);
    expect(artifacts[0].content.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("rejects no-selection canvasCommands that mix add-elements with a title edit", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a" });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { title: "Hostile rename", canvasCommands: { pageId: "page-1", selectionIds: [], commands: [{ type: "add-elements", elements: [{ id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, color: "#000" }] }] } } }),
    });
    expect(response.status).toBe(400);
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(artifacts[0].title).toBe("Untitled canvas");
  });

  it("rejects add-elements on a selection-bound run (additive only without selection)", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: ["a"], commands: [{ type: "add-elements", elements: [{ id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, color: "#000" }] }] } } }),
    });
    expect(response.status).toBe(400);
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("rejects malformed canvasCommands payloads at the tool boundary", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: ["a"], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { id: "hijack" } }] } } }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects title/html/files/visual/componentPatches when a trusted canvas selection is bound", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    // A title-only native edit must be rejected — the run is canvas-bound.
    const titleResponse = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { title: "Hostile rename" } }),
    });
    expect(titleResponse.status).toBe(400);
    const titleBody = await titleResponse.json() as { content: string };
    expect(titleBody.content).toContain("Canvas selection");

    // canvasCommands alongside a title must also be rejected.
    const mixedResponse = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { title: "Hostile rename", canvasCommands: { pageId: "page-1", selectionIds: ["a"], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }] } } }),
    });
    expect(mixedResponse.status).toBe(400);

    // Nothing persisted by the rejected edits.
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.find((e) => e.id === "a")?.x).toBe(0);
    expect(artifacts[0].title).toBe("Untitled canvas");
  });

  it("rejects canvasCommands whose selection text fallback mismatches the trusted selection", async () => {
    let artifacts: Artifact[] = [canvasArtifact()];
    server = await createArtifactAgentToolServer({
      listArtifacts: async () => artifacts,
      saveArtifacts: async (_projectId, next) => { artifacts = structuredClone(next); },
    }, { projectId: "project-a", artifactId: "canvas-a", canvasSelection: { pageId: "page-1", elementIds: ["a", "b"] } });
    const headers = { authorization: `Bearer ${server.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    // selectionIds reordered relative to the trusted binding must be rejected.
    const response = await fetch(`${server.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/artifact_edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { canvasCommands: { pageId: "page-1", selectionIds: ["b", "a"], commands: [{ type: "patch-elements", elementIds: ["a"], patch: { x: 1 } }] } } }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { content: string };
    expect(body.content).toContain("exact page and selection");
    if (artifacts[0].content.format !== "khadim-canvas") throw new Error("Expected canvas");
    expect(artifacts[0].content.elements.find((e) => e.id === "a")?.x).toBe(0);
  });
});
