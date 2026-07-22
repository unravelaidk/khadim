import { describe, expect, it } from "vitest";
import type { Artifact } from "../../../src/shared/types";
import { createArtifact, deleteArtifact, discardArtifactChanges } from "../../../src/renderer/src/artifact-model";

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-1",
    projectId: "project-1",
    title: "Edited report",
    schemaVersion: 2,
    kind: "site",
    lifecycle: "draft",
    content: {
      format: "html",
      html: "<html><title>Edited report</title></html>",
      baselineHtml: "<html><title>Original report</title></html>",
    },
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T01:00:00.000Z",
    ...overrides,
  };
}

describe("discardArtifactChanges", () => {
  it("restores a source-backed artifact instead of deleting a record that recovery would recreate", () => {
    const sourceArtifact = artifact({
      provenance: { origin: "agent", runId: "run-1", messageId: "assistant-1", conversationId: "chat-1", conversationTitle: "Create a report" },
    });

    expect(discardArtifactChanges([sourceArtifact], sourceArtifact.id, "2026-07-13T02:00:00.000Z"))
      .toEqual([{
        ...sourceArtifact,
        title: "Original report",
        lifecycle: "ready",
        content: { format: "html", html: "<html><title>Original report</title></html>", baselineHtml: "<html><title>Original report</title></html>" },
        updatedAt: "2026-07-13T02:00:00.000Z",
      }]);
  });

  it("removes a locally-created draft that has no durable source", () => {
    const localDraft = artifact();
    expect(discardArtifactChanges([localDraft], localDraft.id, "2026-07-13T02:00:00.000Z")).toEqual([]);
  });
});

describe("deleteArtifact", () => {
  it("keeps a content-free tombstone for a source-backed artifact", () => {
    const sourceArtifact = artifact({
      lifecycle: "ready",
      provenance: { origin: "agent", runId: "run-1", messageId: "assistant-1", conversationId: "chat-1", conversationTitle: "Create a report" },
    });

    expect(deleteArtifact([sourceArtifact], sourceArtifact.id, "2026-07-13T02:00:00.000Z"))
      .toEqual([{
        ...sourceArtifact,
        lifecycle: "ready",
        content: { format: "html", html: "", baselineHtml: "" },
        deletedAt: "2026-07-13T02:00:00.000Z",
        updatedAt: "2026-07-13T02:00:00.000Z",
      }]);
  });
});

describe("createArtifact", () => {
  it.each(["document", "canvas"] as const)("creates a versioned %s with matching editable content", (kind) => {
    const artifact = createArtifact(kind, "project-a", "artifact-a", "2026-07-17T10:00:00.000Z");

    expect(artifact).toMatchObject({
      id: "artifact-a",
      projectId: "project-a",
      schemaVersion: 2,
      kind,
      lifecycle: "draft",
      provenance: { origin: "user" },
      createdAt: "2026-07-17T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    });
    expect(artifact.content.format).toBe(kind === "document" ? "document-html" : "khadim-canvas");
    if (kind === "document") {
      expect(artifact.content).toMatchObject({
        format: "document-html",
        html: expect.stringContaining("<!doctype html>"),
        baselineHtml: expect.stringContaining("<!doctype html>"),
        page: { size: "A4", orientation: "portrait", margin: 24 },
      });
    } else {
      expect(artifact.content).toMatchObject({
        format: "khadim-canvas",
        sceneVersion: 1,
        frame: { width: 960, height: 600 },
        elements: [],
        components: [],
        appState: { snapToGrid: true },
      });
    }
  });

  it("creates a React Router v7 website as a self-contained Vite project with an editable Puck document", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-07-17T10:00:00.000Z");

    expect(artifact.content).toMatchObject({
      format: "web-project",
      framework: "react-router",
      entryFile: "/src/router.jsx",
      files: {
        "/package.json": expect.stringContaining('"react-router": "^7.14.1"'),
        "/vite.config.js": expect.stringContaining("@vitejs/plugin-react"),
        "/index.html": expect.stringContaining('/src/main.jsx'),
        "/src/router.jsx": expect.stringContaining("createBrowserRouter"),
        "/src/routes/home.jsx": expect.stringContaining("StudioPage"),
        "/src/styles.css": expect.stringContaining(":root"),
      },
      visual: {
        editor: "puck",
        data: { root: { props: {} }, content: expect.any(Array) },
      },
    });
  });
});
