import type { Artifact } from "../../../shared/types";
import {
  applyStudioArtifactEdit,
  parseStudioArtifactEditPayload,
  type StudioArtifactEdit,
} from "../../../shared/studio-artifact-edit";

const maxResponseLength = 700_000;

export { applyStudioArtifactEdit, type StudioArtifactEdit };

/** Compatibility parser for responses produced by older sidecars/models. */
export function parseStudioArtifactEdit(response: string): StudioArtifactEdit | null {
  if (response.length > maxResponseLength) return null;
  const match = response.match(/<artifact-edit>\s*([\s\S]*?)\s*<\/artifact-edit>/i);
  if (!match) return null;
  try {
    return parseStudioArtifactEditPayload(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

export function studioAgentPrompt(artifact: Artifact, instruction: string): string {
  return `You are editing the existing Khadim Studio artifact "${artifact.title}" (artifact ID: ${artifact.id}).

User instruction:
${instruction.trim()}

You must use the artifact tools provided for this run:
1. Call artifact_read to inspect the selected artifact. For a web project, read its manifest first, then read any files you need by absolute artifact path.
2. Call artifact_edit with only the title, files, HTML, visual data, or component props that must change.
3. Briefly tell the user what you changed after the tool succeeds.

Do not create a new artifact. Do not write a replacement artifact into the project filesystem. Do not call project file read, write, or edit tools for artifact paths. artifact_edit is already bound to artifact ID ${artifact.id}; it preserves identity, project, provenance, and baselines. Paths such as /src/App.tsx are virtual paths inside the artifact and are valid only in artifact_read or artifact_edit. Prefer componentPatches for focused Puck changes so every other block remains intact. File values are complete replacements, not diffs.`;
}
