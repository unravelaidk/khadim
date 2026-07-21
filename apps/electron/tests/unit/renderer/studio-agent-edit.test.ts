import { describe, expect, it } from "vitest";
import { createArtifact } from "../../../src/renderer/src/artifact-model";
import { applyStudioArtifactEdit, parseStudioArtifactEdit, studioAgentPrompt } from "../../../src/renderer/src/studio/studio-agent-edit";

describe("studio agent edits", () => {
  it("applies file and visual changes without allowing artifact identity changes", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit(`<artifact-edit>{
      "id": "artifact-hostile",
      "projectId": "project-hostile",
      "title": "A clearer landing page",
      "files": { "/src/styles.css": ".page-shell { padding: 3rem; }" },
      "visual": { "root": { "props": {} }, "content": [{ "type": "Heading", "props": { "id": "heading", "text": "A better heading" } }] }
    }</artifact-edit>`);

    expect(edit).not.toBeNull();
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");
    expect(updated.id).toBe("artifact-a");
    expect(updated.projectId).toBe("project-a");
    expect(updated.title).toBe("A clearer landing page");
    expect(updated.content.format).toBe("web-project");
    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.files["/src/styles.css"]).toContain("padding: 3rem");
    expect(updated.content.files["/src/StudioPage.jsx"]).toContain("A better heading");
    expect(updated.lifecycle).toBe("draft");
  });

  it("rejects malformed, unsafe, and oversized edit payloads", () => {
    expect(parseStudioArtifactEdit("Here is some JSON: {}" )).toBeNull();
    expect(parseStudioArtifactEdit('<artifact-edit>{"files":{"relative.jsx":"no"}}</artifact-edit>')).toBeNull();
    expect(parseStudioArtifactEdit(`<artifact-edit>{"files":{"/big.txt":"${"a".repeat(600_000)}"}}</artifact-edit>`)).toBeNull();
  });

  it("builds a bounded prompt that binds edits to the selected artifact tools", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const prompt = studioAgentPrompt(artifact, "Make the hero work better on mobile");
    expect(prompt).toContain("Make the hero work better on mobile");
    expect(prompt).toContain("artifact-a");
    expect(prompt).toContain("artifact_read");
    expect(prompt).toContain("artifact_edit");
    expect(prompt).toContain("Do not create a new artifact");
    expect(prompt).not.toContain("/absolute/artifact/path");
    expect(prompt).toContain("Do not call project file read, write, or edit tools");
    expect(prompt.length).toBeLessThan(10_000);
  });

  it("patches one selected Puck component without replacing the other blocks", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit('<artifact-edit>{"componentPatches":[{"id":"starter-heading","props":{"text":"A shorter headline"}}]}</artifact-edit>');
    expect(edit).not.toBeNull();
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");
    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.visual?.data.content).toHaveLength(2);
    expect(updated.content.previewHtml).toContain("A shorter headline");
    expect(updated.content.previewHtml).toContain("Created in Khadim Studio");
    expect(updated.content.previewHtml).toContain("site-navigation");
  });

  it("patches a component nested inside visual layout slots", () => {
    const artifact = createArtifact("site", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const edit = parseStudioArtifactEdit('<artifact-edit>{"componentPatches":[{"id":"starter-heading","props":{"text":"Nested headline"}}]}</artifact-edit>');
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");

    if (updated.content.format !== "web-project") throw new Error("Expected web project");
    expect(updated.content.files["/src/StudioPage.jsx"]).toContain("Nested headline");
    expect(updated.content.previewHtml).toContain("Nested headline");
    expect(updated.content.previewHtml).toContain("site-navigation");
  });

  it("includes and applies complete HTML document revisions", () => {
    const artifact = createArtifact("document", "project-a", "artifact-a", "2026-01-01T00:00:00.000Z");
    const prompt = studioAgentPrompt(artifact, "Turn this into a concise field report");
    expect(prompt).toContain("artifact_read");
    expect(prompt).toContain("artifact-a");

    const edit = parseStudioArtifactEdit('<artifact-edit>{"title":"Field report","html":"<!doctype html><html><body><h1>Field report</h1></body></html>"}</artifact-edit>');
    const updated = applyStudioArtifactEdit(artifact, edit!, "2026-01-02T00:00:00.000Z");

    expect(updated.title).toBe("Field report");
    expect(updated.content).toMatchObject({
      format: "document-html",
      html: expect.stringContaining("<h1>Field report</h1>"),
      baselineHtml: expect.stringContaining("same HTML drives"),
    });
  });
});
