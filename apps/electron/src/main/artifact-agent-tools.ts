import {
  applyStudioArtifactEdit,
  parseStudioArtifactEditPayload,
  studioArtifactEditChangeCount,
} from "../shared/studio-artifact-edit";
import type { Artifact } from "../shared/types";
import type { ArtifactRepository } from "./domain/repositories";
import {
  createNativeToolHost,
  NativeToolError,
  type NativeTool,
  type NativeToolHost,
  type NativeToolResult,
} from "./native-tool-host";

const defaultReadLength = 160_000;
const maxReadLength = 240_000;

interface ArtifactToolContext {
  projectId: string;
  artifactId: string;
}

export type ArtifactAgentToolServer = NativeToolHost;

const toolDefinitions = [
  {
    name: "artifact_read",
    description: "Read the existing Studio artifact selected for this run. With no path it returns the artifact manifest and Puck tree; with a path it returns a bounded slice of that artifact file.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", description: "Absolute artifact file path such as /src/StudioPage.jsx. Omit for the manifest. HTML artifacts also accept $html." },
        offset: { type: "integer", minimum: 0, description: "Character offset for a large file." },
        limit: { type: "integer", minimum: 1, maximum: maxReadLength, description: "Maximum characters to return." },
      },
    },
    prompt_snippet: "- artifact_read: inspect the selected Studio artifact before editing it; this tool is already scoped to the correct artifact ID.",
  },
  {
    name: "artifact_edit",
    description: "Update the existing Studio artifact selected for this run without changing its identity. Send only the fields that should change.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        files: { type: "object", additionalProperties: { type: "string" }, description: "Complete replacement source keyed by absolute artifact file path." },
        html: { type: "string", description: "Complete replacement HTML or web-project preview HTML." },
        visual: { type: "object", description: "Complete Puck visual document data." },
        componentPatches: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "props"],
            properties: {
              id: { type: "string" },
              props: { type: "object" },
            },
          },
        },
      },
    },
    prompt_snippet: "- artifact_edit: apply changes to the selected Studio artifact; never create a second artifact or write an artifact copy into the project.",
  },
] as const;

async function selectedArtifact(repository: ArtifactRepository, context: ArtifactToolContext): Promise<{ artifact: Artifact; artifacts: Artifact[] }> {
  const artifacts = await repository.listArtifacts(context.projectId);
  const artifact = artifacts.find((candidate) => candidate.id === context.artifactId && !candidate.deletedAt);
  if (!artifact) throw new Error("The selected artifact is no longer available.");
  return { artifact, artifacts };
}

function boundedText(value: string, input: Record<string, unknown>): { text: string; offset: number; nextOffset?: number; totalLength: number } {
  const offset = typeof input.offset === "number" && Number.isSafeInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
  const requestedLimit = typeof input.limit === "number" && Number.isSafeInteger(input.limit) ? input.limit : defaultReadLength;
  const limit = Math.max(1, Math.min(requestedLimit, maxReadLength));
  const text = value.slice(offset, offset + limit);
  const nextOffset = offset + text.length < value.length ? offset + text.length : undefined;
  return { text, offset, ...(nextOffset === undefined ? {} : { nextOffset }), totalLength: value.length };
}

function artifactManifest(artifact: Artifact): Record<string, unknown> {
  const base = { id: artifact.id, title: artifact.title, kind: artifact.kind, lifecycle: artifact.lifecycle, format: artifact.content.format };
  if (artifact.content.format === "web-project") {
    return {
      ...base,
      framework: artifact.content.framework,
      entryFile: artifact.content.entryFile,
      files: Object.entries(artifact.content.files).map(([path, source]) => ({ path, characters: source.length })),
      visual: artifact.content.visual?.data,
    };
  }
  if (artifact.content.format === "html" || artifact.content.format === "document-html") {
    return { ...base, htmlCharacters: artifact.content.html.length, ...(artifact.content.format === "document-html" ? { page: artifact.content.page } : {}) };
  }
  if (artifact.content.format === "tiptap") return { ...base, page: artifact.content.page, document: artifact.content.document };
  return { ...base, elementCount: artifact.content.elements.length, appState: artifact.content.appState };
}

function readArtifact(artifact: Artifact, input: Record<string, unknown>): NativeToolResult {
  const path = typeof input.path === "string" ? input.path.trim() : "";
  if (!path) {
    return {
      content: JSON.stringify(artifactManifest(artifact), null, 2),
      metadata: { title: `Read ${artifact.title}`, artifactId: artifact.id, artifactTitle: artifact.title },
    };
  }
  let source: string | undefined;
  if (artifact.content.format === "web-project") source = artifact.content.files[path];
  else if ((artifact.content.format === "html" || artifact.content.format === "document-html") && path === "$html") source = artifact.content.html;
  if (source === undefined) throw new Error(`The selected artifact has no readable file named ${path}.`);
  return {
    content: JSON.stringify({ path, ...boundedText(source, input) }),
    metadata: { title: `Read ${path}`, artifactId: artifact.id, artifactTitle: artifact.title, path },
  };
}

async function executeTool(repository: ArtifactRepository, context: ArtifactToolContext, name: string, input: Record<string, unknown>, now: () => string): Promise<NativeToolResult> {
  const { artifact, artifacts } = await selectedArtifact(repository, context);
  if (name === "artifact_read") return readArtifact(artifact, input);
  if (name !== "artifact_edit") throw new Error("Unknown artifact tool.");
  const edit = parseStudioArtifactEditPayload(input);
  if (!edit) throw new Error("artifact_edit requires at least one valid, bounded change.");
  const updated = applyStudioArtifactEdit(artifact, edit, now());
  await repository.saveArtifacts(context.projectId, artifacts.map((candidate) => candidate.id === updated.id ? updated : candidate));
  const files = Object.keys(edit.files ?? {});
  return {
    content: `Updated the selected artifact ${updated.title}.`,
    metadata: {
      title: `Updated ${updated.title}`,
      artifactId: updated.id,
      artifactTitle: updated.title,
      artifactEdit: edit,
      changeCount: studioArtifactEditChangeCount(edit),
      ...(files[0] ? { path: files[0] } : {}),
    },
  };
}

export async function createArtifactAgentToolServer(
  repository: ArtifactRepository,
  context: ArtifactToolContext,
  now: () => string = () => new Date().toISOString(),
): Promise<ArtifactAgentToolServer> {
  return createNativeToolHost(await createArtifactAgentTools(repository, context, now));
}

export async function createArtifactAgentTools(
  repository: ArtifactRepository,
  context: ArtifactToolContext,
  now: () => string = () => new Date().toISOString(),
): Promise<NativeTool[]> {
  // Resolve the binding before exposing any tool endpoint.
  await selectedArtifact(repository, context);
  const tools: NativeTool[] = toolDefinitions.map((definition) => ({
    definition,
    execute: async (input) => {
      try {
        return await executeTool(repository, context, definition.name, input, now);
      } catch (cause) {
        throw new NativeToolError(400, cause instanceof Error ? cause.message : "Artifact tool failed.");
      }
    },
  }));
  return tools;
}
