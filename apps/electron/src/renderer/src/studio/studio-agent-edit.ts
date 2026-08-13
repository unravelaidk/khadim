import type { Artifact } from "../../../shared/types";
import {
  applyStudioArtifactEdit,
  parseStudioArtifactEditPayload,
  type StudioArtifactEdit,
} from "../../../shared/studio-artifact-edit";

const maxResponseLength = 700_000;

export { applyStudioArtifactEdit, type StudioArtifactEdit };

/**
 * Enforces the trusted Canvas selection binding on a parsed Studio edit, in the
 * renderer legacy `<artifact-edit>` fallback path. When a trusted selection is
 * bound, the edit may ONLY carry canvasCommands that exactly match that page
 * and ordered selection; title/html/files/visual/componentPatches — alongside
 * or instead of canvasCommands — are rejected. Returns the edit to apply, or
 * null when the edit must be rejected.
 */
export function enforceCanvasSelectionBinding(
  edit: StudioArtifactEdit,
  canvasSelection: { pageId: string; elementIds: string[] } | undefined,
): StudioArtifactEdit | null {
  if (!canvasSelection) {
    // Without a trusted selection, only additive Canvas add-elements groups on
    // a khadim-canvas artifact are permitted (with an empty selection). The
    // agent must not patch/remove existing elements or mutate non-canvas fields.
    if (!edit.canvasCommands) return edit;
    if (edit.title !== undefined
      || edit.html !== undefined
      || edit.files !== undefined
      || edit.visual !== undefined
      || edit.componentPatches !== undefined) {
      return null;
    }
    const group = edit.canvasCommands;
    if (group.selectionIds.length !== 0) return null;
    if (!group.commands.every((command) => command.type === "add-elements")) return null;
    return edit;
  }
  if (edit.canvasCommands === undefined
    || edit.title !== undefined
    || edit.html !== undefined
    || edit.files !== undefined
    || edit.visual !== undefined
    || edit.componentPatches !== undefined) {
    return null;
  }
  const group = edit.canvasCommands;
  if (group.pageId !== canvasSelection.pageId
    || group.selectionIds.length !== canvasSelection.elementIds.length
    || !group.selectionIds.every((id, index) => id === canvasSelection.elementIds[index])) {
    return null;
  }
  // A trusted selection must never permit the additive drawing command.
  if (group.commands.some((command) => command.type === "add-elements")) return null;
  return edit;
}

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
  const canvasGuidance = artifact.content.format === "khadim-canvas"
    ? `\nFor this Canvas artifact, prefer the canvasCommands field of artifact_edit. When you have a selected layer scope, make focused, reversible patch-elements/interaction edits scoped to the current page and the selected layer ids; each command group is applied atomically and undoable. When the Canvas is open with no selected layers, you may draw new vector primitives by sending an add-elements command group with selectionIds: [] — supply stable, unique ids and only the safe primitive types (rectangle, ellipse, line, arrow, path, text). An empty/no-selection run may only add new elements; it must not patch or remove existing elements or change non-canvas fields. Do not rewrite the whole scene.`
    : "";
  return `You are editing the existing Khadim Studio artifact "${artifact.title}" (artifact ID: ${artifact.id}).

User instruction:
${instruction.trim()}

You must use the artifact tools provided for this run:
1. Call artifact_read to inspect the selected artifact. For a web project, read its manifest first, then read any files you need by absolute artifact path.
2. Call artifact_edit with only the title, files, HTML, visual data, or component props that must change.${canvasGuidance}
3. Briefly tell the user what you changed after the tool succeeds.

Do not create a new artifact. Do not write a replacement artifact into the project filesystem. Do not call project file read, write, or edit tools for artifact paths. artifact_edit is already bound to artifact ID ${artifact.id}; it preserves identity, project, provenance, and baselines. Paths such as /src/App.tsx are virtual paths inside the artifact and are valid only in artifact_read or artifact_edit. Prefer componentPatches for focused Puck changes so every other block remains intact. File values are complete replacements, not diffs.`;
}
