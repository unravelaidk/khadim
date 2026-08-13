import { applyStudioArtifactEdit, parseStudioArtifactEditPayload } from "../../../src/shared/studio-artifact-edit";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "../../../src/main/project-store";
import type { ArtifactDraft, CanvasPage, CanvasPrimitiveElement, Conversation } from "../../../src/shared/types";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "khadim-project-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectStore", () => {
  it("keeps a local project available after the store is reopened", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "customer-onboarding");
    await mkdir(projectDirectory);

    const firstSession = new ProjectStore(dataDirectory);
    const created = await firstSession.addProject(projectDirectory);

    const reopenedSession = new ProjectStore(dataDirectory);
    const projects = await reopenedSession.listProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: created.id,
        name: "customer-onboarding",
        rootPath: projectDirectory,
      }),
    ]);
  });

  it("reports a missing project folder without changing the project index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "missing-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-13T10:00:00.000Z" });
    const project = await store.addProject(projectDirectory);
    await rm(projectDirectory, { recursive: true });

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: false,
      reason: "missing",
    });
    await expect(store.listProjects()).resolves.toEqual([project]);
  });

  it("reports an existing project folder as available", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "available-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: true,
    });
  });

  it("reports a project path replaced by a file without changing the project index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "not-a-folder");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-13T10:00:00.000Z" });
    const project = await store.addProject(projectDirectory);
    await rm(projectDirectory, { recursive: true });
    await writeFile(projectDirectory, "not a directory", "utf8");

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: false,
      reason: "not-directory",
    });
    await expect(store.listProjects()).resolves.toEqual([project]);
  });

  it("keeps chat history isolated to its owning project after restart", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);

    const firstSession = new ProjectStore(dataDirectory);
    const firstProject = await firstSession.addProject(firstFolder);
    const secondProject = await firstSession.addProject(secondFolder);
    const firstConversation: Conversation = {
      id: "chat-first",
      projectId: firstProject.id,
      engineSessionKey: "electron.v1.chat-first",
      title: "First project chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    const secondConversation: Conversation = {
      id: "chat-second",
      projectId: secondProject.id,
      engineSessionKey: "electron.v1.chat-second",
      title: "Second project chat",
      createdAt: "2026-07-13T11:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      messages: [],
    };

    await firstSession.saveConversation(firstConversation);
    await firstSession.saveConversation(secondConversation);

    const reopenedSession = new ProjectStore(dataDirectory);
    await expect(reopenedSession.listConversations(firstProject.id)).resolves.toEqual([firstConversation]);
    await expect(reopenedSession.listConversations(secondProject.id)).resolves.toEqual([secondConversation]);
  });

  it("keeps artifacts isolated to their owning project after restart", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);

    const firstSession = new ProjectStore(dataDirectory);
    const firstProject = await firstSession.addProject(firstFolder);
    const secondProject = await firstSession.addProject(secondFolder);
    const artifact: ArtifactDraft = {
      id: "artifact-first",
      projectId: firstProject.id,
      title: "First project",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "html",
        html: "<h1>First project</h1>",
        baselineHtml: "<h1>First project</h1>",
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
    };

    await firstSession.saveArtifacts(firstProject.id, [artifact]);

    const reopenedSession = new ProjectStore(dataDirectory);
    await expect(reopenedSession.listArtifacts(firstProject.id)).resolves.toEqual([artifact]);
    await expect(reopenedSession.listArtifacts(secondProject.id)).resolves.toEqual([]);
  });

  it("persists file-backed React artifacts and their visual document", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "react-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "react-site",
      projectId: project.id,
      title: "React launch page",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "web-project",
        framework: "react",
        entryFile: "/src/App.jsx",
        files: { "/src/App.jsx": "export default function App() { return <h1>Launch</h1>; }" },
        baselineFiles: { "/src/App.jsx": "export default function App() { return <h1>Launch</h1>; }" },
        previewHtml: "<h1>Launch</h1>",
        baselinePreviewHtml: "<h1>Launch</h1>",
        visual: { editor: "puck", data: { root: { props: {} }, content: [{ type: "Heading", props: { id: "heading", text: "Launch" } }] } },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-17T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
  });

  it("persists the default React Router v7 artifact project", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "react-router-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "react-router-site",
      projectId: project.id,
      title: "Router launch page",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "web-project",
        framework: "react-router",
        entryFile: "/src/router.jsx",
        files: {
          "/package.json": JSON.stringify({ dependencies: { "react-router": "^7.14.1" } }),
          "/src/router.jsx": "export const router = {};",
        },
        baselineFiles: {
          "/package.json": JSON.stringify({ dependencies: { "react-router": "^7.14.1" } }),
          "/src/router.jsx": "export const router = {};",
        },
        previewHtml: "<h1>Router launch</h1>",
        baselinePreviewHtml: "<h1>Router launch</h1>",
        visual: { editor: "puck", data: { root: { props: {} }, content: [] } },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-18T10:00:00.000Z",
      updatedAt: "2026-07-18T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
  });

  it("persists HTML documents with bounded page settings", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "document-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "html-document",
      projectId: project.id,
      title: "Field report",
      schemaVersion: 2,
      kind: "document",
      lifecycle: "draft",
      content: {
        format: "document-html",
        html: "<!doctype html><html><body><h1>Field report</h1></body></html>",
        baselineHtml: "<!doctype html><html><body><h1>Field report</h1></body></html>",
        page: { size: "A4", orientation: "portrait", margin: 24 },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-17T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
    if (artifact.content.format !== "document-html") throw new Error("Expected HTML document");
    const invalidArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, page: { ...artifact.content.page, margin: 120 } } };
    await expect(store.saveArtifacts(project.id, [invalidArtifact])).rejects.toThrow("artifact library is invalid");
  });

  it("upgrades a legacy HTML artifact into a versioned site without losing its source", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "legacy-site-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifactDirectory = join(dataDirectory, "projects", project.id);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, "artifacts.json"), JSON.stringify([{
      id: "legacy-site",
      projectId: project.id,
      title: "Customer portal",
      kind: "html",
      status: "generated",
      html: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      baselineHtml: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      sourceRunId: "run-site",
      sourceMessageId: "message-site",
      sourceConversationId: "chat-site",
      sourceConversationTitle: "Build a customer portal",
    }]), "utf8");

    await expect(store.listArtifacts(project.id)).resolves.toEqual([{
      id: "legacy-site",
      projectId: project.id,
      title: "Customer portal",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: {
        format: "html",
        html: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
        baselineHtml: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      },
      provenance: {
        origin: "agent",
        runId: "run-site",
        messageId: "message-site",
        conversationId: "chat-site",
        conversationTitle: "Build a customer portal",
      },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
    }]);
  });

  it("migrates Khadim's legacy custom canvas records without claiming Excalidraw compatibility", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "legacy-canvas-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifactDirectory = join(dataDirectory, "projects", project.id);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, "artifacts.json"), JSON.stringify([{
      id: "legacy-canvas",
      projectId: project.id,
      title: "Legacy canvas",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      content: {
        format: "excalidraw",
        elements: [{ id: "shape", type: "rectangle", x: 20, y: 30, width: 100, height: 60, color: "#2563eb" }],
        appState: { snapToGrid: false },
        files: {},
      },
    }]), "utf8");

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([
      expect.objectContaining({ content: expect.objectContaining({ format: "khadim-canvas", sceneVersion: 1, frame: { width: 960, height: 600 }, components: [], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } }) }),
    ]);
  });

  it("rejects actual Excalidraw records instead of silently dropping unsupported properties", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "foreign-canvas-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifactDirectory = join(dataDirectory, "projects", project.id);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, "artifacts.json"), JSON.stringify([{
      id: "foreign-canvas",
      projectId: project.id,
      title: "Imported drawing",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      content: { format: "excalidraw", elements: [{ id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 80, version: 1, versionNonce: 42 }], appState: {}, files: {} },
    }]), "utf8");

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).rejects.toThrow("artifact library is invalid");
  });

  it("persists bounded vector geometry and rejects malformed canvas paths", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "vector-canvas-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "vector-canvas",
      projectId: project.id,
      title: "Vector canvas",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [
          { id: "target", type: "rectangle", x: 300, y: 200, width: 100, height: 80, color: "#ffffff", fillStyleId: "brand", fillGradient: { type: "linear", angle: 45, stops: [{ offset: 0, color: "#2563eb" }, { offset: 1, color: "#6652d9" }] } },
          { id: "arrow", type: "arrow", x: 10, y: 20, width: 340, height: 220, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#17181c", endCap: "arrow", endBindingId: "target", constraintH: "scale", constraintV: "center" },
        ],
        components: [],
        styles: [{ id: "brand", name: "Brand gradient", color: "#2563eb", gradient: { type: "linear", angle: 45, stops: [{ offset: 0, color: "#2563eb" }, { offset: 1, color: "#6652d9" }] } }],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: true },
        files: {},
      },
    };

    await store.saveArtifacts(project.id, [artifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
    if (artifact.content.format !== "khadim-canvas") throw new Error("Expected canvas artifact");
    const paintedShape: CanvasPrimitiveElement = { id: "painted", type: "rectangle", x: 20, y: 20, width: 180, height: 100, color: "#ef4444", fills: [{ id: "base", visible: true, opacity: 1, color: "#ef4444" }, { id: "radial", visible: true, opacity: .7, color: "#2563eb", gradient: { type: "radial", centerX: .4, centerY: .6, radius: .8, stops: [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#2563eb" }] } }], strokes: [{ id: "outline", visible: true, color: "#111827", opacity: .8, width: 6, alignment: "outside", style: "dashed", dash: 8, gap: 4 }] };
    const paintArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [paintedShape] } };
    await store.saveArtifacts(project.id, [paintArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([paintArtifact]);
    const shadowStack = [
      { id: "drop", visible: true, type: "drop" as const, color: "#101828", opacity: .2, x: 0, y: 8, blur: 18, spread: 2 },
      { id: "inner", visible: true, type: "inner" as const, color: "#ffffff", opacity: .35, x: 0, y: 1, blur: 3, spread: -1 },
    ];
    const shadowArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...paintedShape, shadows: shadowStack }], effectStyles: [{ id: "raised", name: "Raised", shadows: shadowStack, shadow: { color: "#101828", opacity: .2, x: 0, y: 8, blur: 18 } }] } };
    await store.saveArtifacts(project.id, [shadowArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([shadowArtifact]);
    const duplicateShadowId = { ...shadowArtifact, content: { ...shadowArtifact.content, elements: [{ ...paintedShape, shadows: [shadowStack[0], { ...shadowStack[0] }] }] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [duplicateShadowId])).rejects.toThrow("artifact library is invalid");
    const invalidShadowType = { ...shadowArtifact, content: { ...shadowArtifact.content, elements: [{ ...paintedShape, shadows: [{ ...shadowStack[0], type: "ambient" }] }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidShadowType])).rejects.toThrow("artifact library is invalid");
    const emptyEffectStyle = { ...shadowArtifact, content: { ...shadowArtifact.content, effectStyles: [{ id: "empty", name: "Empty", shadows: [] }] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [emptyEffectStyle])).rejects.toThrow("artifact library is invalid");
    const componentInstance = { id: "instance", type: "component" as const, componentId: "card", componentRole: "instance" as const, x: 20, y: 20, width: 180, height: 100, color: "#ffffff", overrides: { surface: { effectStyleId: "raised", shadows: shadowStack } } };
    const componentShadowArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content,
      elements: [componentInstance],
      components: [{ id: "card", name: "Card", width: 180, height: 100, nodes: [{ ...paintedShape, id: "surface", x: 0, y: 0, effectStyleId: "raised", shadows: shadowStack }] }],
      effectStyles: [{ id: "raised", name: "Raised", shadows: shadowStack, shadow: { color: "#101828", opacity: .2, x: 0, y: 8, blur: 18 } }],
    } };
    await store.saveArtifacts(project.id, [componentShadowArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([componentShadowArtifact]);
    const nestedComponentArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content,
      elements: [{ id: "card-instance", type: "component", componentId: "card", componentRole: "instance", x: 20, y: 20, width: 240, height: 160, color: "#ffffff", overrides: { "action~1label": { text: "Ship direct" }, "action/label": { text: "Ship nested" } } }],
      components: [
        { id: "button", name: "Button", width: 100, height: 40, nodes: [{ id: "label", type: "text", x: 10, y: 8, width: 80, height: 24, color: "#ffffff", text: "Continue" }] },
        { id: "card", name: "Card", width: 240, height: 160, nodes: [{ id: "action/label", type: "text", x: 20, y: 20, width: 120, height: 24, color: "#111827", text: "Direct" }, { id: "action", type: "component", componentId: "button", componentRole: "instance", x: 70, y: 90, width: 100, height: 40, color: "#ffffff" }] },
      ],
    } };
    await store.saveArtifacts(project.id, [nestedComponentArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([nestedComponentArtifact]);
    const ambiguousLegacyOverride = structuredClone(nestedComponentArtifact);
    if (ambiguousLegacyOverride.content.format !== "khadim-canvas" || ambiguousLegacyOverride.content.elements[0].type !== "component") throw new Error("Expected component artifact");
    delete ambiguousLegacyOverride.content.elements[0].overrides?.["action~1label"];
    await expect(store.saveArtifacts(project.id, [ambiguousLegacyOverride])).rejects.toThrow("artifact library is invalid");
    const legacyComponentPathArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content,
      elements: [{ id: "legacy-instance", type: "component", componentId: "legacy-label", componentRole: "instance", x: 20, y: 20, width: 120, height: 40, color: "#ffffff", overrides: { "a/b": { text: "Legacy override" } } }],
      components: [
        { id: "legacy-decoration", name: "Decoration", width: 10, height: 10, nodes: [{ id: "dot", type: "ellipse", x: 0, y: 0, width: 10, height: 10, color: "#2563eb" }] },
        { id: "legacy-label", name: "Legacy label", width: 120, height: 40, nodes: [{ id: "a/b", type: "text", x: 0, y: 0, width: 120, height: 40, color: "#111827", text: "Original" }, { id: "decoration", type: "component", componentId: "legacy-decoration", componentRole: "instance", x: 100, y: 0, width: 10, height: 10, color: "#ffffff" }] },
      ],
    } };
    await store.saveArtifacts(project.id, [legacyComponentPathArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([legacyComponentPathArtifact]);
    const cyclicComponents = structuredClone(nestedComponentArtifact);
    if (cyclicComponents.content.format !== "khadim-canvas") throw new Error("Expected canvas artifact");
    cyclicComponents.content.components[0].nodes = [{ id: "card-cycle", type: "component", componentId: "card", componentRole: "instance", x: 0, y: 0, width: 100, height: 40, color: "#ffffff" }];
    await expect(store.saveArtifacts(project.id, [cyclicComponents])).rejects.toThrow("artifact library is invalid");
    const nestedMain = structuredClone(nestedComponentArtifact);
    if (nestedMain.content.format !== "khadim-canvas") throw new Error("Expected canvas artifact");
    Object.assign(nestedMain.content.components[1].nodes[1], { componentRole: "main" });
    await expect(store.saveArtifacts(project.id, [nestedMain])).rejects.toThrow("artifact library is invalid");
    const staleOverrideStyle = { ...componentShadowArtifact, content: { ...artifact.content, elements: [{ ...componentInstance, overrides: { surface: { effectStyleId: "missing" } } }], components: componentShadowArtifact.content.format === "khadim-canvas" ? componentShadowArtifact.content.components : [], effectStyles: componentShadowArtifact.content.format === "khadim-canvas" ? componentShadowArtifact.content.effectStyles : [] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [staleOverrideStyle])).rejects.toThrow("artifact library is invalid");
    const nullOverride = { ...componentShadowArtifact, content: { ...artifact.content, elements: [{ ...componentInstance, overrides: { surface: null } }], components: componentShadowArtifact.content.format === "khadim-canvas" ? componentShadowArtifact.content.components : [], effectStyles: componentShadowArtifact.content.format === "khadim-canvas" ? componentShadowArtifact.content.effectStyles : [] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [nullOverride])).rejects.toThrow("artifact library is invalid");
    const duplicatePaintId = { ...paintArtifact, content: { ...paintArtifact.content, elements: [{ ...paintedShape, fills: [...paintedShape.fills!, { ...paintedShape.fills![0] }] }] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [duplicatePaintId])).rejects.toThrow("artifact library is invalid");
    const invalidRadial = { ...paintArtifact, content: { ...paintArtifact.content, elements: [{ ...paintedShape, fills: [{ ...paintedShape.fills![1], gradient: { ...paintedShape.fills![1].gradient!, radius: 3 } }] }] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidRadial])).rejects.toThrow("artifact library is invalid");
    const invalidStroke = { ...paintArtifact, content: { ...paintArtifact.content, elements: [{ ...paintedShape, strokes: [{ ...paintedShape.strokes![0], alignment: "floating" }] }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidStroke])).rejects.toThrow("artifact library is invalid");
    const openCurve: CanvasPrimitiveElement = { id: "open-curve", type: "path", x: 0, y: 0, width: 100, height: 60, color: "#111827", pathClosed: false, svgPathData: "M 0 0 L 100 60", svgViewBox: { x: 0, y: 0, width: 100, height: 60 }, strokes: [{ id: "curve-stroke", visible: true, color: "#111827", opacity: 1, width: 4, alignment: "center", style: "solid" }] };
    const invalidOpenFill = { ...paintArtifact, content: { ...paintArtifact.content, elements: [{ ...openCurve, fills: [{ id: "bad-fill", visible: true, opacity: 1, color: "#ef4444" }] }] } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidOpenFill])).rejects.toThrow("artifact library is invalid");
    const invalidOpenAlignment = { ...paintArtifact, content: { ...paintArtifact.content, elements: [{ ...openCurve, strokes: [{ ...openCurve.strokes![0], alignment: "outside" }] }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidOpenAlignment])).rejects.toThrow("artifact library is invalid");
    const deepElements: CanvasPrimitiveElement[] = Array.from({ length: 8_000 }, (_, index) => ({ id: `deep-${index}`, parentId: index ? `deep-${index - 1}` : undefined, type: "rectangle", x: index, y: index, width: 10, height: 10, color: "#ffffff" }));
    const deepArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: deepElements } };
    await store.saveArtifacts(project.id, [deepArtifact]);
    const [reloadedDeepArtifact] = await new ProjectStore(dataDirectory).listArtifacts(project.id);
    expect(reloadedDeepArtifact.content.format === "khadim-canvas" ? reloadedDeepArtifact.content.elements : []).toHaveLength(8_000);
    const pagedArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, activePageId: "page-a", pages: [
      { id: "page-a", name: "Flow", frame: artifact.content.frame, elements: artifact.content.elements, appState: artifact.content.appState },
      { id: "page-b", name: "Archive", frame: { width: 1200, height: 800 }, elements: [], appState: { viewBackgroundColor: "#f8fafc", snapToGrid: false, guides: [{ id: "guide-a", axis: "x", position: 240 }] } },
    ] } };
    await store.saveArtifacts(project.id, [pagedArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([pagedArtifact]);
    const prototypeButton: CanvasPrimitiveElement = { id: "prototype-button", type: "rectangle", prototypeKey: "primary-cta", x: 40, y: 40, width: 160, height: 48, color: "#2563eb", interactions: [{ id: "go", trigger: "click", action: "navigate", destinationPageId: "page-b", transition: { type: "smart", duration: 180, easing: "ease-out" } }, { id: "docs", trigger: "hover", action: "open-url", url: "https://example.com/docs" }, { id: "reminder", trigger: "after-delay", delay: 400, action: "open-overlay", destinationPageId: "page-b", overlay: { position: "bottom-center", background: "dim", closeOnOutsideClick: true }, transition: { type: "dissolve", duration: 120, easing: "ease-out" } }] };
    const prototypePages: CanvasPage[] = [
      { id: "page-a", name: "Flow", frame: artifact.content.frame, elements: [prototypeButton], appState: artifact.content.appState },
      { id: "page-b", name: "Archive", frame: artifact.content.frame, elements: [], appState: artifact.content.appState },
    ];
    const prototypeArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [prototypeButton], activePageId: "page-a", prototypeFlows: [{ id: "main", name: "Main journey", startPageId: "page-b" }, { id: "alternate", name: "Alternate journey", startPageId: "page-a" }], prototypeStartPageId: "page-b", pages: prototypePages } };
    await store.saveArtifacts(project.id, [prototypeArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([prototypeArtifact]);
    const nestedPrototypeInstance = { id: "nested-prototype", type: "component" as const, componentId: "prototype-card", componentRole: "instance" as const, x: 40, y: 40, width: 200, height: 120, color: "#ffffff", overrides: { "action/nested-link": { color: "#ef4444" } } };
    const nestedPrototypeComponents = [
      { id: "prototype-button", name: "Prototype button", width: 100, height: 40, nodes: [{ id: "nested-link", type: "rectangle" as const, x: 0, y: 0, width: 100, height: 40, color: "#2563eb", interactions: [{ id: "nested-go", trigger: "click" as const, action: "navigate" as const, destinationPageId: "page-b" }] }] },
      { id: "prototype-card", name: "Prototype card", width: 200, height: 120, nodes: [{ id: "action", type: "component" as const, componentId: "prototype-button", componentRole: "instance" as const, x: 50, y: 60, width: 100, height: 40, color: "#ffffff" }] },
    ];
    const nestedPrototypePages = prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [nestedPrototypeInstance] } : page);
    const nestedPrototypeArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [nestedPrototypeInstance], components: nestedPrototypeComponents, activePageId: "page-a", pages: nestedPrototypePages } };
    await store.saveArtifacts(project.id, [nestedPrototypeArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([nestedPrototypeArtifact]);
    const staleNestedDestination = structuredClone(nestedPrototypeArtifact);
    if (staleNestedDestination.content.format !== "khadim-canvas") throw new Error("Expected canvas artifact");
    Object.assign(staleNestedDestination.content.components[0].nodes[0].interactions![0], { destinationPageId: "missing" });
    await expect(store.saveArtifacts(project.id, [staleNestedDestination])).rejects.toThrow("artifact library is invalid");
    const fixedPrototypeButton: CanvasPrimitiveElement = { ...prototypeButton, fixedInPrototype: true };
    const scrollingPrototypePages: CanvasPage[] = prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [fixedPrototypeButton], prototypeViewport: { width: page.frame.width, height: 400, direction: "vertical", preservePosition: true } } : page);
    const scrollingPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [fixedPrototypeButton], activePageId: "page-a", pages: scrollingPrototypePages } };
    await store.saveArtifacts(project.id, [scrollingPrototype]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([scrollingPrototype]);
    const invalidViewport = { ...scrollingPrototype, content: { ...scrollingPrototype.content, pages: scrollingPrototypePages.map((page) => page.id === "page-a" ? { ...page, prototypeViewport: { width: 500, height: 400, direction: "vertical", preservePosition: true } } : page) } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidViewport])).rejects.toThrow("artifact library is invalid");
    const scrollingLayer: CanvasPrimitiveElement = { id: "scrolling-content", type: "rectangle", x: 0, y: 100, width: 400, height: 500, color: "#ffffff" };
    const invalidFixedOrder = { ...scrollingPrototype, content: { ...scrollingPrototype.content, elements: [fixedPrototypeButton, scrollingLayer], pages: scrollingPrototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [fixedPrototypeButton, scrollingLayer] } : page) } } as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [invalidFixedOrder])).rejects.toThrow("artifact library is invalid");
    const stalePrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "go", trigger: "click", action: "navigate", destinationPageId: "missing" }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "go", trigger: "click", action: "navigate", destinationPageId: "missing" }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [stalePrototype])).rejects.toThrow("artifact library is invalid");
    const unsafePrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "bad-url", trigger: "click", action: "open-url", url: "javascript:alert(1)" }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "bad-url", trigger: "click", action: "open-url", url: "javascript:alert(1)" }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [unsafePrototype])).rejects.toThrow("artifact library is invalid");
    const duplicateTriggerPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "first", trigger: "click", action: "back" }, { id: "second", trigger: "click", action: "back" }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "first", trigger: "click", action: "back" }, { id: "second", trigger: "click", action: "back" }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [duplicateTriggerPrototype])).rejects.toThrow("artifact library is invalid");
    const invalidDelayPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "late", trigger: "after-delay", delay: 60_001, action: "back" }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "late", trigger: "after-delay", delay: 60_001, action: "back" }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [invalidDelayPrototype])).rejects.toThrow("artifact library is invalid");
    const malformedOverlayPrototype = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "open-overlay", destinationPageId: "page-b", overlay: { position: "floating", background: "dim", closeOnOutsideClick: true } }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "open-overlay", destinationPageId: "page-b", overlay: { position: "floating", background: "dim", closeOnOutsideClick: true } }] }] } : page) } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [malformedOverlayPrototype])).rejects.toThrow("artifact library is invalid");
    const staleOverlayPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "toggle-overlay", destinationPageId: "missing", overlay: { position: "center", background: "none", closeOnOutsideClick: false } }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "toggle-overlay", destinationPageId: "missing", overlay: { position: "center", background: "none", closeOnOutsideClick: false } }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [staleOverlayPrototype])).rejects.toThrow("artifact library is invalid");
    const smartOverlayPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "open-overlay", destinationPageId: "page-b", overlay: { position: "center", background: "dim", closeOnOutsideClick: true }, transition: { type: "smart", duration: 180, easing: "ease-out" } }] }], activePageId: "page-a", pages: prototypePages.map((page) => page.id === "page-a" ? { ...page, elements: [{ ...prototypeButton, interactions: [{ id: "modal", trigger: "click", action: "open-overlay", destinationPageId: "page-b", overlay: { position: "center", background: "dim", closeOnOutsideClick: true }, transition: { type: "smart", duration: 180, easing: "ease-out" } }] }] } : page) } };
    await expect(store.saveArtifacts(project.id, [smartOverlayPrototype])).rejects.toThrow("artifact library is invalid");
    const invalidStartPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [prototypeButton], activePageId: "page-a", prototypeStartPageId: "missing", pages: prototypePages } };
    await expect(store.saveArtifacts(project.id, [invalidStartPrototype])).rejects.toThrow("artifact library is invalid");
    const staleFlowPrototype: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [prototypeButton], activePageId: "page-a", prototypeFlows: [{ id: "stale", name: "Stale journey", startPageId: "missing" }], pages: prototypePages } };
    await expect(store.saveArtifacts(project.id, [staleFlowPrototype])).rejects.toThrow("artifact library is invalid");
    const mismatchedLegacyStart: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [prototypeButton], activePageId: "page-a", prototypeFlows: [{ id: "main", name: "Main journey", startPageId: "page-a" }], prototypeStartPageId: "page-b", pages: prototypePages } };
    await expect(store.saveArtifacts(project.id, [mismatchedLegacyStart])).rejects.toThrow("artifact library is invalid");
    const systemArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content,
      elements: [
        { id: "frame", type: "frame", x: 0, y: 0, width: 400, height: 300, color: "#ffffff", layout: { direction: "row", align: "start", justify: "space-between", gap: 16, crossGap: 20, padding: 24, sizing: "fixed", wrap: true }, layoutGrids: [{ id: "grid", type: "columns", visible: true, color: "#2563eb", opacity: .12, count: 12, gutter: 16, margin: 24 }] },
        { id: "surface", parentId: "frame", type: "rectangle", x: 24, y: 24, width: 120, height: 80, color: "#2563eb", blendMode: "multiply", layerBlur: { value: 4, visible: true }, backgroundBlur: { value: 12, visible: false }, cornerRadii: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 0 }, tokenBindings: { fill: "brand-token" } },
        { id: "boolean", type: "boolean", booleanOperation: "union", x: 460, y: 20, width: 150, height: 100, color: "#2563eb" },
        { id: "boolean-a", parentId: "boolean", type: "rectangle", x: 460, y: 20, width: 100, height: 100, color: "#2563eb" },
        { id: "boolean-b", parentId: "boolean", type: "ellipse", x: 510, y: 20, width: 100, height: 100, color: "#2563eb" },
        { id: "bezier", type: "path", x: 460, y: 160, width: 150, height: 80, color: "#17181c", points: [{ x: 0, y: 0, handleOut: { x: .25, y: -.2 }, nodeType: "smooth" }, { x: 1, y: 1, handleIn: { x: .75, y: 1.2 }, nodeType: "smooth" }] },
      ],
      components: [{ id: "button-default", name: "Button", width: 120, height: 40, variantSetId: "button-set", variantSetName: "Button", variantProperties: { State: "Default" }, nodes: [{ id: "surface", type: "rectangle", x: 0, y: 0, width: 120, height: 40, color: "#2563eb", tokenBindings: { fill: "brand-token" } }] }],
      tokenCollections: [{ id: "core", name: "Core", modes: ["Light", "Dark"], activeMode: "Dark", tokens: [{ id: "brand-token", name: "Brand / Primary", type: "color", values: { Light: "#2563eb", Dark: "#93c5fd" } }] }],
    } };
    await store.saveArtifacts(project.id, [systemArtifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([systemArtifact]);
    const malformed: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...(artifact.content.elements[1] as CanvasPrimitiveElement), points: [{ x: Number.NaN, y: 0 }] }] } };
    await expect(store.saveArtifacts(project.id, [malformed])).rejects.toThrow("artifact library is invalid");
    const malformedBoolean: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [
      { id: "boolean", type: "boolean", booleanOperation: "union", x: 0, y: 0, width: 100, height: 100, color: "#fff" },
      { id: "only-child", parentId: "boolean", type: "rectangle", x: 0, y: 0, width: 100, height: 100, color: "#fff" },
    ] } };
    await expect(store.saveArtifacts(project.id, [malformedBoolean])).rejects.toThrow("artifact library is invalid");
    const malformedGradient: ArtifactDraft = { ...artifact, content: { ...artifact.content, styles: [{ id: "bad", name: "Bad", color: "#fff", gradient: { type: "linear", angle: 0, stops: [{ offset: 2, color: "#fff" }, { offset: 1, color: "#000" }] } }] } };
    await expect(store.saveArtifacts(project.id, [malformedGradient])).rejects.toThrow("artifact library is invalid");
    const danglingBinding: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ ...(artifact.content.elements[1] as CanvasPrimitiveElement), endBindingId: "missing-target" }] } };
    await expect(store.saveArtifacts(project.id, [danglingBinding])).rejects.toThrow("artifact library is invalid");
    const malformedViewport: ArtifactDraft = { ...artifact, content: { ...artifact.content, appState: { ...artifact.content.appState, viewport: { x: 0, y: 0, zoom: 0 } } } };
    await expect(store.saveArtifacts(project.id, [malformedViewport])).rejects.toThrow("artifact library is invalid");
    const malformedLayout: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [{ id: "frame", type: "frame", x: 0, y: 0, width: 200, height: 120, color: "#fff", layout: { direction: "row", align: "center", justify: "start", sizing: "fixed", gap: -4, padding: 12 } }] } };
    await expect(store.saveArtifacts(project.id, [malformedLayout])).rejects.toThrow("artifact library is invalid");
    const malformedBlend = { ...artifact, content: { ...artifact.content, elements: [{ id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#fff", blendMode: "pass-through" }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [malformedBlend])).rejects.toThrow("artifact library is invalid");
    const malformedBlur = { ...artifact, content: { ...artifact.content, elements: [{ id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#fff", layerBlur: { value: 101, visible: true } }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [malformedBlur])).rejects.toThrow("artifact library is invalid");
    const malformedCorners = { ...artifact, content: { ...artifact.content, elements: [{ id: "shape", type: "ellipse", x: 0, y: 0, width: 100, height: 80, color: "#fff", cornerRadii: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 } }] } } as unknown as ArtifactDraft;
    await expect(store.saveArtifacts(project.id, [malformedCorners])).rejects.toThrow("artifact library is invalid");
    const cyclicHierarchy: ArtifactDraft = { ...artifact, content: { ...artifact.content, elements: [
      { id: "a", parentId: "b", type: "frame", x: 0, y: 0, width: 200, height: 120, color: "#fff" },
      { id: "b", parentId: "a", type: "rectangle", x: 20, y: 20, width: 60, height: 40, color: "#fff" },
    ] } };
    await expect(store.saveArtifacts(project.id, [cyclicHierarchy])).rejects.toThrow("artifact library is invalid");
  });

  it("persists a source-backed artifact tombstone across restarts", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "deleted-artifact-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const tombstone: ArtifactDraft = {
      id: "artifact-deleted",
      projectId: project.id,
      title: "Deleted report",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: { format: "html", html: "", baselineHtml: "" },
      provenance: {
        origin: "agent",
        runId: "run-report",
        messageId: "assistant-report",
        conversationId: "chat-report",
        conversationTitle: "Create a report",
      },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      deletedAt: "2026-07-13T11:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [tombstone]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([tombstone]);
  });

  it("keeps artifacts while clearing stale source references when a chat is removed", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "source-reference-project");
    await mkdir(projectDirectory);

    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const removedConversation: Conversation = {
      id: "chat-removed",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-removed",
      title: "Original research chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    const retainedConversation: Conversation = {
      ...removedConversation,
      id: "chat-retained",
      engineSessionKey: "electron.v1.chat-retained",
      title: "Retained research chat",
    };
    const removedSourceArtifact: ArtifactDraft = {
      id: "artifact-from-removed-chat",
      projectId: project.id,
      title: "Research summary",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: { format: "html", html: "<h1>Research summary</h1>", baselineHtml: "<h1>Research summary</h1>" },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      provenance: {
        origin: "agent",
        runId: "run-removed",
        conversationId: removedConversation.id,
        messageId: "message-removed",
        conversationTitle: removedConversation.title,
      },
    };
    const retainedSourceArtifact: ArtifactDraft = {
      ...removedSourceArtifact,
      id: "artifact-from-retained-chat",
      updatedAt: "2026-07-13T12:00:00.000Z",
      provenance: {
        origin: "agent",
        runId: "run-retained",
        conversationId: retainedConversation.id,
        messageId: "message-retained",
        conversationTitle: retainedConversation.title,
      },
    };

    await store.saveConversation(removedConversation);
    await store.saveConversation(retainedConversation);
    await store.saveArtifacts(project.id, [removedSourceArtifact, retainedSourceArtifact]);

    await store.removeConversation(project.id, removedConversation.id);

    const reopenedStore = new ProjectStore(dataDirectory);
    await expect(reopenedStore.listArtifacts(project.id)).resolves.toEqual([
      retainedSourceArtifact,
      {
        ...removedSourceArtifact,
        provenance: {
          origin: "agent",
          conversationTitle: removedConversation.title,
        },
      },
    ]);
  });

  it("migrates legacy chats and artifact drafts into their original workspace project", async () => {
    const dataDirectory = await temporaryDirectory();
    const workspaceDirectory = join(dataDirectory, "legacy-workspace");
    await mkdir(workspaceDirectory);
    await writeFile(join(dataDirectory, "conversations.json"), JSON.stringify([{
      id: "legacy-chat",
      title: "Legacy chat",
      createdAt: "2026-07-12T10:00:00.000Z",
      updatedAt: "2026-07-12T10:00:00.000Z",
      messages: [],
    }]), "utf8");
    await writeFile(join(dataDirectory, "artifact-drafts.json"), JSON.stringify({
      version: 1,
      workspaces: [{
        workspace: workspaceDirectory,
        drafts: [{
          id: "legacy-artifact",
          html: "<h1>Legacy artifact</h1>",
          baselineHtml: "<h1>Legacy artifact</h1>",
          createdAt: "2026-07-12T10:00:00.000Z",
          updatedAt: "2026-07-12T10:00:00.000Z",
          sourceConversationId: "legacy-chat",
          sourceConversationTitle: "Legacy chat",
        }],
      }],
    }), "utf8");

    const store = new ProjectStore(dataDirectory);
    const project = await store.migrateLegacyWorkspace(workspaceDirectory);

    await expect(store.listConversations(project.id)).resolves.toEqual([
      expect.objectContaining({ id: "legacy-chat", projectId: project.id }),
    ]);
    await expect(store.listArtifacts(project.id)).resolves.toEqual([
      expect.objectContaining({
        id: "legacy-artifact",
        projectId: project.id,
        provenance: expect.objectContaining({ conversationId: "legacy-chat" }),
      }),
    ]);
  });

  it("records the project most recently opened by the user", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const firstProject = await store.addProject(firstFolder);
    now = "2026-07-13T11:00:00.000Z";
    await store.addProject(secondFolder);
    now = "2026-07-13T12:00:00.000Z";

    const opened = await store.openProject(firstProject.id);

    expect(opened.lastOpenedAt).toBe(now);
    await expect(store.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: firstProject.id, lastOpenedAt: now }),
      expect.not.objectContaining({ id: firstProject.id }),
    ]);
  });

  it("renames a project with a trimmed name and records the update", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-name");
    await mkdir(projectDirectory);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const project = await store.addProject(projectDirectory);
    now = "2026-07-13T11:00:00.000Z";

    const renamed = await store.renameProject(project.id, "  Customer operations  ");

    expect(renamed).toEqual({
      ...project,
      name: "Customer operations",
      updatedAt: now,
    });
    await expect(new ProjectStore(dataDirectory).getProject(project.id)).resolves.toEqual(renamed);
  });

  it.each([
    ["blank", "   "],
    ["longer than 160 characters", "x".repeat(161)],
  ])("rejects a %s project name", async (_label, invalidName) => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-name");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.renameProject(project.id, invalidName)).rejects.toThrow(
      "Project name must be between 1 and 160 characters.",
    );
    await expect(store.getProject(project.id)).resolves.toEqual(project);
  });

  it("relocates a project while preserving its identity, name, and local data", async () => {
    const dataDirectory = await temporaryDirectory();
    const originalDirectory = join(dataDirectory, "original-folder");
    const relocatedDirectory = join(dataDirectory, "relocated-folder");
    await Promise.all([mkdir(originalDirectory), mkdir(relocatedDirectory)]);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const project = await store.addProject(originalDirectory, "Customer operations");
    const conversation: Conversation = {
      id: "chat-before-relocation",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-before-relocation",
      title: "Relocation-safe chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await store.saveConversation(conversation);
    now = "2026-07-13T11:00:00.000Z";

    const relocated = await store.relocateProject(project.id, join(relocatedDirectory, "."));

    expect(relocated).toEqual({
      ...project,
      rootPath: relocatedDirectory,
      updatedAt: now,
    });
    await expect(new ProjectStore(dataDirectory).getProject(project.id)).resolves.toEqual(relocated);
    await expect(store.listConversations(project.id)).resolves.toEqual([conversation]);
  });

  it("rejects relocating a project into a folder owned by another project", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstDirectory = join(dataDirectory, "first-folder");
    const secondDirectory = join(dataDirectory, "second-folder");
    await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)]);
    const store = new ProjectStore(dataDirectory);
    const firstProject = await store.addProject(firstDirectory);
    await store.addProject(secondDirectory);

    await expect(store.relocateProject(firstProject.id, join(secondDirectory, "."))).rejects.toThrow(
      "This local folder already belongs to another project.",
    );
    await expect(store.getProject(firstProject.id)).resolves.toEqual(firstProject);
  });

  it("rejects relocating a project to a path that is not an existing directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-folder");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.relocateProject(project.id, join(dataDirectory, "missing-folder"))).rejects.toThrow(
      "Choose an existing local project folder.",
    );
    await expect(store.getProject(project.id)).resolves.toEqual(project);
  });

  it("updates a project's name only when relocation explicitly includes one", async () => {
    const dataDirectory = await temporaryDirectory();
    const originalDirectory = join(dataDirectory, "original-folder");
    const relocatedDirectory = join(dataDirectory, "relocated-folder");
    await Promise.all([mkdir(originalDirectory), mkdir(relocatedDirectory)]);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(originalDirectory, "Original name");

    const relocated = await store.relocateProject(project.id, relocatedDirectory, "  Relocated name  ");

    expect(relocated.name).toBe("Relocated name");
  });

  it("removes a project from the index without deleting its local store data", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "removable-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const conversation: Conversation = {
      id: "retained-chat",
      projectId: project.id,
      engineSessionKey: "electron.v1.retained-chat",
      title: "Retained after index removal",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    await store.saveConversation(conversation);
    const indexedProject = await store.getProject(project.id);

    await expect(store.removeProject(project.id)).resolves.toEqual(indexedProject);

    await expect(store.listProjects()).resolves.toEqual([]);
    await expect(store.getProject(project.id)).rejects.toThrow("The project no longer exists.");
    await expect(readFile(join(dataDirectory, "projects", project.id, "conversations.json"), "utf8"))
      .resolves.toContain(conversation.id);
  });

  it("rejects malformed nested chat records instead of persisting corrupt history", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "validated-project");
    await mkdir(projectDirectory);

    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const malformed = {
      id: "chat-invalid",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-invalid",
      title: "Invalid chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [
        { id: "duplicate", role: "user", content: "Hello", createdAt: "2026-07-13T10:00:00.000Z", status: "complete" },
        { id: "duplicate", role: "assistant", content: "Hi", createdAt: "2026-07-13T10:00:01.000Z", status: "complete" },
      ],
    } as Conversation;

    await expect(store.saveConversation(malformed)).rejects.toThrow("chat is invalid");
    await expect(store.listConversations(project.id)).resolves.toEqual([]);
  });

  it("rejects run snapshots whose message links or model policy are corrupt", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "run-validation-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const base = {
      id: "chat-run-validation",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-run-validation",
      title: "Validate a run",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [
        { id: "user-one", role: "user", content: "Hello", createdAt: "2026-07-13T10:00:00.000Z", status: "complete" },
        { id: "assistant-one", role: "assistant", content: "", createdAt: "2026-07-13T10:00:01.000Z", status: "streaming", runId: "wrong-run" },
      ],
      runs: [{
        id: "run-one",
        projectId: project.id,
        conversationId: "chat-run-validation",
        userMessageId: "user-one",
        assistantMessageId: "assistant-one",
        status: "running",
        createdAt: "2026-07-13T10:00:01.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-one", name: "Model", provider: "openai", model: "gpt-5", temperature: "0.2" },
        harness: "assistant",
        enabledTools: ["web", "files"],
      }],
    } as Conversation;

    await expect(store.saveConversation(base)).rejects.toThrow("chat is invalid");
    const badEndpoint = structuredClone(base);
    badEndpoint.messages[1].runId = "run-one";
    badEndpoint.runs![0].model.baseUrl = "file:///tmp/model";
    await expect(store.saveConversation(badEndpoint)).rejects.toThrow("chat is invalid");

    const invalidApps = structuredClone(base);
    invalidApps.messages[1].runId = "run-one";
    Object.assign(invalidApps.runs![0], { enabledApps: ["drive", "not-a-google-service"] });
    await expect(store.saveConversation(invalidApps)).rejects.toThrow("chat is invalid");
    await expect(store.listConversations(project.id)).resolves.toEqual([]);

    const selectedArtifactRun = structuredClone(base);
    selectedArtifactRun.messages[1].runId = "run-one";
    selectedArtifactRun.runs![0].artifactId = "artifact-selected";
    await expect(store.saveConversation(selectedArtifactRun)).resolves.toBeUndefined();
    await expect(store.listConversations(project.id)).resolves.toEqual([selectedArtifactRun]);
  });

  it("persists valid plugin harness run snapshots", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "plugin-harness-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const conversation: Conversation = {
      id: "chat-plugin-harness",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-plugin-harness",
      title: "Run through OpenCode",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:01.000Z",
      messages: [
        { id: "user-plugin", role: "user", content: "Hello", createdAt: "2026-07-21T00:00:00.000Z", status: "complete" },
        { id: "assistant-plugin", role: "assistant", content: "", createdAt: "2026-07-21T00:00:01.000Z", status: "streaming", runId: "run-plugin" },
      ],
      runs: [{
        id: "run-plugin",
        projectId: project.id,
        conversationId: "chat-plugin-harness",
        userMessageId: "user-plugin",
        assistantMessageId: "assistant-plugin",
        status: "running",
        createdAt: "2026-07-21T00:00:01.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-one", name: "Model", provider: "openai", model: "gpt-5" },
        harness: "plugin:khadim.opencode/opencode",
        enabledTools: ["web", "files"],
      }],
    };

    await expect(store.saveConversation(conversation)).resolves.toBeUndefined();
    await expect(store.listConversations(project.id)).resolves.toEqual([conversation]);
  });

  it("round-trips a per-chat harness preference for built-in and valid plugin modes", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "chat-harness-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    const assistantHarness: Conversation = {
      id: "chat-harness-assistant",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-harness-assistant",
      title: "Assistant chat",
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z",
      messages: [],
      harness: "assistant",
    };
    const rpaHarness: Conversation = {
      id: "chat-harness-rpa",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-harness-rpa",
      title: "RPA chat",
      createdAt: "2026-07-25T10:00:01.000Z",
      updatedAt: "2026-07-25T10:00:01.000Z",
      messages: [],
      harness: "rpa",
    };
    const pluginHarness: Conversation = {
      id: "chat-harness-plugin",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-harness-plugin",
      title: "Plugin chat",
      createdAt: "2026-07-25T10:00:02.000Z",
      updatedAt: "2026-07-25T10:00:02.000Z",
      messages: [],
      harness: "plugin:khadim.opencode/opencode",
    };

    await store.saveConversation(assistantHarness);
    await store.saveConversation(rpaHarness);
    await store.saveConversation(pluginHarness);

    const reopened = new ProjectStore(dataDirectory);
    await expect(reopened.listConversations(project.id)).resolves.toEqual([pluginHarness, rpaHarness, assistantHarness]);
  });

  it("keeps legacy chats without a per-chat harness preference valid", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "chat-harness-legacy-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    const legacyConversation: Conversation = {
      id: "chat-harness-legacy",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-harness-legacy",
      title: "Legacy chat",
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z",
      messages: [],
    };

    await store.saveConversation(legacyConversation);
    await expect(new ProjectStore(dataDirectory).listConversations(project.id)).resolves.toEqual([legacyConversation]);
  });

  it("rejects a malformed per-chat harness preference", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "chat-harness-malformed-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    const malformed = {
      id: "chat-harness-malformed",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-harness-malformed",
      title: "Malformed harness chat",
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z",
      messages: [],
      harness: "not-a-harness",
    } as unknown as Conversation;

    await expect(store.saveConversation(malformed)).rejects.toThrow("chat is invalid");
    await expect(store.listConversations(project.id)).resolves.toEqual([]);
  });

  it("rejects duplicate project identities in a corrupted index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "duplicate-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    await writeFile(join(dataDirectory, "projects.json"), JSON.stringify({ version: 1, projects: [project, project] }), "utf8");

    await expect(new ProjectStore(dataDirectory).listProjects()).rejects.toThrow("duplicate project identities");
  });

  it("persists canvas artifacts produced by accepted canvas interaction command groups across restarts", async () => {
    // Regression: a representative set of accepted Canvas interaction commands
    // (navigate / open-overlay / open-url / after-delay combinations) applied
    // through the real edit pipeline must round-trip through ProjectStore.
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "canvas-interaction-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-24T10:00:00.000Z" });
    const project = await store.addProject(projectDirectory);

    const baseElements: CanvasPrimitiveElement[] = [
      { id: "cta", type: "rectangle", x: 40, y: 40, width: 160, height: 48, color: "#2563eb" },
      { id: "help", type: "rectangle", x: 40, y: 120, width: 160, height: 48, color: "#111827" },
    ];
    const basePages: CanvasPage[] = [
      { id: "page-a", name: "Flow", frame: { width: 960, height: 600 }, elements: baseElements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
      { id: "page-b", name: "Archive", frame: { width: 960, height: 600 }, elements: [], appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
    ];
    const baseArtifact: ArtifactDraft = {
      id: "canvas-interactions",
      projectId: project.id,
      title: "Interaction canvas",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-24T10:00:00.000Z",
      updatedAt: "2026-07-24T10:00:00.000Z",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: baseElements,
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: false },
        files: {},
        activePageId: "page-a",
        pages: basePages,
      },
    };
    await store.saveArtifacts(project.id, [baseArtifact]);

    // Apply a representative command group containing valid navigate,
    // open-overlay, open-url, and after-delay interaction combinations via the
    // real edit payload parser + applier, then persist the result.
    const payload = parseStudioArtifactEditPayload({
      canvasCommands: {
        pageId: "page-a",
        selectionIds: ["cta", "help"],
        commands: [
          { type: "add-interaction", elementId: "cta", interaction: { id: "nav", trigger: "click", action: "navigate", destinationPageId: "page-b", transition: { type: "smart", duration: 180, easing: "ease-out" } } },
          { type: "add-interaction", elementId: "cta", interaction: { id: "overlay", trigger: "hover", action: "open-overlay", destinationPageId: "page-b", overlay: { position: "center", background: "dim", closeOnOutsideClick: true }, transition: { type: "dissolve", duration: 120, easing: "ease-out" } } },
          { type: "add-interaction", elementId: "help", interaction: { id: "docs", trigger: "click", action: "open-url", url: "https://example.com/docs" } },
          { type: "add-interaction", elementId: "help", interaction: { id: "reminder", trigger: "after-delay", delay: 400, action: "open-overlay", destinationPageId: "page-b", overlay: { position: "bottom-center", background: "dim", closeOnOutsideClick: true } } },
        ],
      },
    });
    expect(payload).not.toBeNull();
    const updated = applyStudioArtifactEdit(baseArtifact, payload!, "2026-07-24T11:00:00.000Z");
    await store.saveArtifacts(project.id, [updated]);

    // Reload through a fresh ProjectStore and assert the interaction-rich
    // artifact round-trips exactly.
    const reopened = new ProjectStore(dataDirectory);
    await expect(reopened.listArtifacts(project.id)).resolves.toEqual([updated]);
    if (updated.content.format !== "khadim-canvas") throw new Error("Expected canvas artifact");
    const cta = updated.content.elements.find((e) => e.id === "cta");
    if (!cta || !cta.interactions) throw new Error("Expected cta interactions");
    expect(cta.interactions.map((i) => i.action)).toEqual(["navigate", "open-overlay"]);
    const help = updated.content.elements.find((e) => e.id === "help");
    if (!help || !help.interactions) throw new Error("Expected help interactions");
    expect(help.interactions.map((i) => i.action)).toEqual(["open-url", "open-overlay"]);
  });

  it("persists canvas elements with boundary-valid generic patch values applied via canvasCommands", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "canvas-bounds-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-24T12:00:00.000Z" });
    const project = await store.addProject(projectDirectory);

    const baseElements: CanvasPrimitiveElement[] = [
      { id: "rect", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
      { id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
      { id: "text", type: "text", x: 0, y: 0, width: 100, height: 40, color: "#111827", text: "Hi" },
    ];
    const basePages: CanvasPage[] = [
      { id: "page-a", name: "Flow", frame: { width: 960, height: 600 }, elements: baseElements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
    ];
    const baseArtifact: ArtifactDraft = {
      id: "canvas-bounds",
      projectId: project.id,
      title: "Bounds canvas",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: baseElements,
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: false },
        files: {},
        activePageId: "page-a",
        pages: basePages,
      },
    };
    await store.saveArtifacts(project.id, [baseArtifact]);

    // Apply boundary-valid generic patch values that align with project-store's
    // isCanvasElement constraints, then persist and reload exactly.
    const payload = parseStudioArtifactEditPayload({
      canvasCommands: {
        pageId: "page-a",
        selectionIds: ["rect", "frame", "text"],
        commands: [
          // blur.value at the persisted ceiling (100), radius/fontSize/lineHeight/strokeWidth/strokeDash at 0..100000.
          { type: "patch-elements", elementIds: ["rect"], patch: { layerBlur: { value: 100, visible: true }, radius: 100000, strokeWidth: 100000, strokeDash: 100000, cornerRadii: { topLeft: 100000, topRight: 0, bottomRight: 0, bottomLeft: 0 }, name: "x".repeat(1000), color: "#".repeat(80), strokeColor: "#".repeat(80), opacity: 0.5 } },
          // cornerRadii is valid on a frame, and text gets the persisted text ceiling.
          { type: "patch-elements", elementIds: ["frame"], patch: { cornerRadii: { topLeft: 1, topRight: 1, bottomRight: 1, bottomLeft: 1 } } },
          { type: "patch-elements", elementIds: ["text"], patch: { fontSize: 100000, lineHeight: 100000, fontFamily: "f".repeat(1000), text: "t".repeat(250000) } },
        ],
      },
    });
    expect(payload).not.toBeNull();
    const updated = applyStudioArtifactEdit(baseArtifact, payload!, "2026-07-24T12:01:00.000Z");
    // The applied result must survive persistence validation and reload exactly.
    await store.saveArtifacts(project.id, [updated]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([updated]);
  });

  it("rejects canvas elements whose generic patch values exceed persisted bounds before they reach storage", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "canvas-bounds-reject-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-24T12:00:00.000Z" });
    const project = await store.addProject(projectDirectory);

    const baseElements: CanvasPrimitiveElement[] = [
      { id: "rect", type: "rectangle", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
      { id: "ellipse", type: "ellipse", x: 0, y: 0, width: 100, height: 80, color: "#111827" },
    ];
    const basePages: CanvasPage[] = [
      { id: "page-a", name: "Flow", frame: { width: 960, height: 600 }, elements: baseElements, appState: { viewBackgroundColor: "#ffffff", snapToGrid: false } },
    ];
    const baseArtifact: ArtifactDraft = {
      id: "canvas-bounds-reject",
      projectId: project.id,
      title: "Bounds reject canvas",
      schemaVersion: 2,
      kind: "canvas",
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
      content: {
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: baseElements,
        components: [],
        appState: { viewBackgroundColor: "#ffffff", snapToGrid: false },
        files: {},
        activePageId: "page-a",
        pages: basePages,
      },
    };
    await store.saveArtifacts(project.id, [baseArtifact]);

    // blur.value 101 is rejected by the strict command parser before application.
    const blurReject = parseStudioArtifactEditPayload({
      canvasCommands: { pageId: "page-a", selectionIds: ["rect"], commands: [{ type: "patch-elements", elementIds: ["rect"], patch: { layerBlur: { value: 101, visible: true } } }] },
    });
    expect(blurReject).toBeNull();

    // cornerRadii on an ellipse is accepted by the parser (the value is generically
    // valid) but rejected by the applier's type-specific check before application.
    const radiiReject = parseStudioArtifactEditPayload({
      canvasCommands: { pageId: "page-a", selectionIds: ["ellipse"], commands: [{ type: "patch-elements", elementIds: ["ellipse"], patch: { cornerRadii: { topLeft: 1, topRight: 1, bottomRight: 1, bottomLeft: 1 } } }] },
    });
    expect(radiiReject).not.toBeNull();
    expect(() => applyStudioArtifactEdit(baseArtifact, radiiReject!, "2026-07-24T12:01:00.000Z")).toThrow();
  });
});
