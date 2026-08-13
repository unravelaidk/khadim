import type { Artifact, CanvasArtifactContent, VisualDocumentData } from "./types";
import { applyCanvasCommandGroup, parseCanvasCommandGroup, type CanvasCommandGroup } from "./canvas-commands";
import { applyVisualDocument, updateWebProjectFile } from "./web-project";

const maxFileBytes = 512_000;

export interface StudioArtifactEdit {
  title?: string;
  files?: Record<string, string>;
  html?: string;
  visual?: VisualDocumentData;
  componentPatches?: Array<{ id: string; props: Record<string, unknown> }>;
  /** A semantic Canvas command group. Only valid for khadim-canvas artifacts. */
  canvasCommands?: CanvasCommandGroup;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeProps(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  try {
    return JSON.stringify(value).length <= 40_000;
  } catch {
    return false;
  }
}

function visualData(value: unknown): VisualDocumentData | null {
  if (!isRecord(value) || !isRecord(value.root) || !safeProps(value.root.props) || !Array.isArray(value.content) || value.content.length > 200) return null;
  const component = (candidate: unknown): candidate is VisualDocumentData["content"][number] => (
    isRecord(candidate)
    && typeof candidate.type === "string"
    && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(candidate.type)
    && safeProps(candidate.props)
  );
  if (!value.content.every(component)) return null;
  if (value.zones !== undefined) {
    if (!isRecord(value.zones) || Object.values(value.zones).some((zone) => !Array.isArray(zone) || zone.length > 200 || !zone.every(component))) return null;
  }
  return value as unknown as VisualDocumentData;
}

export function parseStudioArtifactEditPayload(payload: unknown): StudioArtifactEdit | null {
  if (!isRecord(payload)) return null;
  const edit: StudioArtifactEdit = {};
  if (payload.title !== undefined) {
    if (typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 200) return null;
    edit.title = payload.title.trim();
  }
  if (payload.html !== undefined) {
    if (typeof payload.html !== "string" || payload.html.length > maxFileBytes) return null;
    edit.html = payload.html;
  }
  if (payload.files !== undefined) {
    if (!isRecord(payload.files) || Object.keys(payload.files).length > 50) return null;
    const files: Record<string, string> = {};
    let bytes = 0;
    for (const [path, source] of Object.entries(payload.files)) {
      if (!/^\/(?!\/)[^\0]*[^\/]$/.test(path) || path.includes("/../") || path.endsWith("/..") || path === "/__proto__" || typeof source !== "string") return null;
      bytes += source.length;
      if (bytes > maxFileBytes) return null;
      files[path] = source;
    }
    edit.files = files;
  }
  if (payload.visual !== undefined) {
    const data = visualData(payload.visual);
    if (!data) return null;
    edit.visual = data;
  }
  if (payload.componentPatches !== undefined) {
    if (!Array.isArray(payload.componentPatches) || payload.componentPatches.length === 0 || payload.componentPatches.length > 50) return null;
    const patches: Array<{ id: string; props: Record<string, unknown> }> = [];
    for (const patch of payload.componentPatches) {
      if (!isRecord(patch) || typeof patch.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(patch.id) || !safeProps(patch.props)) return null;
      patches.push({ id: patch.id, props: patch.props });
    }
    edit.componentPatches = patches;
  }
  if (payload.canvasCommands !== undefined) {
    // Strict bounded runtime parsing of the untrusted command-group JSON.
    const group = parseCanvasCommandGroup(payload.canvasCommands);
    if (!group) return null;
    edit.canvasCommands = group;
  }
  return edit.title || edit.html !== undefined || edit.files || edit.visual || edit.componentPatches || edit.canvasCommands ? edit : null;
}

function patchVisualComponents(data: VisualDocumentData, patches: NonNullable<StudioArtifactEdit["componentPatches"]>): VisualDocumentData {
  const byId = new Map(patches.map((patch) => [patch.id, patch.props]));
  const patchSlotValue = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    return value.map((candidate) => (
      isRecord(candidate) && typeof candidate.type === "string" && isRecord(candidate.props)
        ? patchComponent(candidate as unknown as VisualDocumentData["content"][number])
        : candidate
    ));
  };
  const patchComponent = (component: VisualDocumentData["content"][number]): VisualDocumentData["content"][number] => {
    const id = typeof component.props.id === "string" ? component.props.id : "";
    const props = byId.get(id);
    const nestedProps = Object.fromEntries(Object.entries(component.props).map(([key, value]) => [key, patchSlotValue(value)]));
    return props ? { ...component, props: { ...nestedProps, ...props, id } } : { ...component, props: nestedProps };
  };
  return {
    ...data,
    content: data.content.map(patchComponent),
    zones: data.zones ? Object.fromEntries(Object.entries(data.zones).map(([zone, components]) => [zone, components.map(patchComponent)])) : undefined,
  };
}

export function applyStudioArtifactEdit(artifact: Artifact, edit: StudioArtifactEdit, now: string): Artifact {
  // canvasCommands are only valid for khadim-canvas artifacts. Rejecting here
  // keeps a misrouted edit from silently no-oping on a document or website.
  if (edit.canvasCommands && artifact.content.format !== "khadim-canvas") {
    throw new Error("canvasCommands are only valid for khadim-canvas artifacts.");
  }
  let content = artifact.content;
  if (content.format === "html" && edit.html !== undefined) content = { ...content, html: edit.html };
  if (content.format === "document-html" && edit.html !== undefined) content = { ...content, html: edit.html };
  if (content.format === "web-project") {
    let project = content;
    for (const [path, source] of Object.entries(edit.files ?? {})) project = updateWebProjectFile(project, path, source);
    if (edit.visual) project = applyVisualDocument(project, edit.visual);
    if (edit.componentPatches && project.visual) project = applyVisualDocument(project, patchVisualComponents(project.visual.data, edit.componentPatches));
    if (edit.html !== undefined) project = { ...project, previewHtml: edit.html };
    content = project;
  }
  if (content.format === "khadim-canvas" && edit.canvasCommands) {
    const result = applyCanvasCommandGroup(content, edit.canvasCommands);
    content = result.content;
  }
  return {
    ...artifact,
    title: edit.title ?? artifact.title,
    lifecycle: "draft",
    content,
    updatedAt: now,
  };
}

export function studioArtifactEditChangeCount(edit: StudioArtifactEdit): number {
  return Math.max(
    Object.keys(edit.files ?? {}).length
      + (edit.componentPatches?.length ?? 0)
      + (edit.visual ? 1 : 0)
      + (edit.html !== undefined ? 1 : 0)
      + (edit.title ? 1 : 0)
      + (edit.canvasCommands ? edit.canvasCommands.commands.length : 0),
    1,
  );
}
