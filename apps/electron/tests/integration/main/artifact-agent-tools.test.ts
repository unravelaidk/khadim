import { afterEach, describe, expect, it } from "vitest";
import { createArtifactAgentToolServer, type ArtifactAgentToolServer } from "../../../src/main/artifact-agent-tools";
import { createArtifact } from "../../../src/renderer/src/artifact-model";
import type { Artifact } from "../../../src/shared/types";

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
});
