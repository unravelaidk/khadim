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
  /** Trusted canvas selection; when present, canvasCommands must match it exactly. */
  canvasSelection?: { pageId: string; elementIds: string[] };
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
        canvasCommands: {
          type: "object",
          description: "Semantic Canvas command group. Only valid for khadim-canvas artifacts. When a trusted selection is bound to this run, pageId and selectionIds must exactly match it and only patch-elements/interaction commands are permitted. When no selection is bound, selectionIds must be [] and only additive add-elements commands are permitted (the agent draws new vector primitives on the open page).",
          additionalProperties: false,
          required: ["pageId", "selectionIds", "commands"],
          properties: {
            pageId: { type: "string", minLength: 1, maxLength: 200 },
            selectionIds: {
              type: "array",
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 200 },
              description: "Stable element ids the commands may mutate. Must exactly match the trusted selection bound to this run. Empty only for additive no-selection runs.",
            },
            commands: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              items: {
                oneOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    description: "Add new vector primitives to the page. Only permitted on no-selection runs (selectionIds: []). Agent-supplied ids must be unique against the page and within the batch; up to 100 elements per command.",
                    required: ["type", "elements"],
                    properties: {
                      type: { type: "string", const: "add-elements" },
                      elements: {
                        type: "array",
                        minItems: 1,
                        maxItems: 100,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          description: "A safe additive vector primitive. Required: id,type,x,y,width,height,color. Optional type-gated fields: radius (rectangle only); text,fontSize,fontFamily,fontWeight,textAlign,lineHeight,letterSpacing (text only); points,pathClosed,pathSmoothing,startCap,endCap (path/line/arrow as appropriate).",
                          required: ["id", "type", "x", "y", "width", "height", "color"],
                          properties: {
                            id: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                            type: { type: "string", enum: ["rectangle", "ellipse", "line", "arrow", "path", "text"] },
                            x: { type: "number" },
                            y: { type: "number" },
                            width: { type: "number", exclusiveMinimum: 0 },
                            height: { type: "number", exclusiveMinimum: 0 },
                            color: { type: "string", minLength: 1, maxLength: 80 },
                            name: { type: "string", maxLength: 1000 },
                            rotation: { type: "number" },
                            opacity: { type: "number", minimum: 0, maximum: 1 },
                            radius: { type: "number", minimum: 0, maximum: 100000 },
                            strokeColor: { type: "string", maxLength: 80 },
                            strokeWidth: { type: "number", minimum: 0, maximum: 100000 },
                            strokeDash: { type: "number", minimum: 0, maximum: 100000 },
                            text: { type: "string", maxLength: 250000 },
                            fontSize: { type: "number", minimum: 0, maximum: 100000 },
                            fontFamily: { type: "string", maxLength: 1000 },
                            fontWeight: { type: "number" },
                            textAlign: { type: "string", enum: ["left", "center", "right"] },
                            lineHeight: { type: "number", minimum: 0, maximum: 100000 },
                            letterSpacing: { type: "number" },
                            points: {
                              type: "array",
                              minItems: 2,
                              maxItems: 1000,
                              description: "Ordered vector points. Required for line/arrow/path; each point has unit-space x/y in [-10,10], optional nodeType (corner|smooth), and optional handleIn/handleOut {x,y} control points in [-100000,100000].",
                              items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["x", "y"],
                                properties: {
                                  x: { type: "number", minimum: -10, maximum: 10 },
                                  y: { type: "number", minimum: -10, maximum: 10 },
                                  nodeType: { type: "string", enum: ["corner", "smooth"] },
                                  handleIn: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["x", "y"],
                                    properties: { x: { type: "number", minimum: -100000, maximum: 100000 }, y: { type: "number", minimum: -100000, maximum: 100000 } },
                                  },
                                  handleOut: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["x", "y"],
                                    properties: { x: { type: "number", minimum: -100000, maximum: 100000 }, y: { type: "number", minimum: -100000, maximum: 100000 } },
                                  },
                                },
                              },
                            },
                            pathClosed: { type: "boolean" },
                            pathSmoothing: { type: "number", minimum: 0, maximum: 1 },
                            startCap: { type: "string", enum: ["none", "arrow", "round"] },
                            endCap: { type: "string", enum: ["none", "arrow", "round"] },
                          },
                        },
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    description: "Patch the geometry/appearance of selected layers. The run must carry a trusted selection; elementIds must all be in selectionIds.",
                    required: ["type", "elementIds", "patch"],
                    properties: {
                      type: { type: "string", const: "patch-elements" },
                      elementIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" } },
                      patch: { type: "object", description: "Partial element fields to apply to every target. Allowed keys: name,x,y,width,height,rotation,hidden,locked,opacity,color,text,fontSize,fontFamily,fontWeight,lineHeight,letterSpacing,textAlign,radius,cornerRadii,strokeColor,strokeWidth,strokeDash,blendMode,layerBlur,backgroundBlur." },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    description: "Append a prototype interaction to a selected layer.",
                    required: ["type", "elementId", "interaction"],
                    properties: {
                      type: { type: "string", const: "add-interaction" },
                      elementId: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                      interaction: { type: "object", description: "A serializable prototype interaction (id, trigger, action, and action-specific fields)." },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    description: "Patch a prototype interaction on a selected layer by stable id.",
                    required: ["type", "elementId", "interactionId", "patch"],
                    properties: {
                      type: { type: "string", const: "patch-interaction" },
                      elementId: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                      interactionId: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                      patch: { type: "object", description: "Partial interaction fields (trigger, action, delay, destinationPageId, url, transition, overlay). JSON null clears the optional action-specific fields." },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    description: "Remove a prototype interaction from a selected layer by stable id.",
                    required: ["type", "elementId", "interactionId"],
                    properties: {
                      type: { type: "string", const: "remove-interaction" },
                      elementId: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                      interactionId: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    prompt_snippet: "- artifact_edit: apply changes to the selected Studio artifact; never create a second artifact or write an artifact copy into the project. For Canvas artifacts, prefer canvasCommands scoped to the current page and selection; when no layer is selected you may draw new vector primitives with an add-elements command (selectionIds: []).",
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
  return canvasManifest(artifact);
}

/** Bounded, binary-free scene summary for a khadim-canvas artifact. */
function canvasManifest(artifact: Artifact): Record<string, unknown> {
  if (artifact.content.format !== "khadim-canvas") return { ...artifact.content };
  const content = artifact.content;
  const base = { id: artifact.id, title: artifact.title, kind: artifact.kind, lifecycle: artifact.lifecycle, format: content.format };
  const activePageId = content.activePageId ?? content.pages?.[0]?.id ?? "page-1";
  const pages = content.pages ?? [];
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  // Active-page elements mirror lives at the top level for legacy content.
  const activeElements = activePage?.elements ?? content.elements;

  // The truncation accumulator. Every potentially-large summary adds its own
  // total/included/omitted counters here so the agent can see exactly what was
  // dropped and why. Counts are reported even when nothing is omitted, so the
  // shape is stable and the agent never has to guess whether a full list is
  // present.
  const truncation: Record<string, { total: number; included: number; omitted: number }> = {};
  const recordTruncation = (key: string, total: number, included: number): void => {
    truncation[key] = { total, included, omitted: Math.max(0, total - included) };
  };

  const elementSummary = (element: typeof activeElements[number]): Record<string, unknown> => {
    const summary: Record<string, unknown> = {
      id: element.id,
      type: element.type,
      name: element.name && element.name.length > 120 ? `${element.name.slice(0, 120)}…` : (element.name ?? ""),
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      hidden: Boolean(element.hidden),
      locked: Boolean(element.locked),
    };
    if ("color" in element) summary.color = element.color;
    if ("text" in element && typeof element.text === "string") {
      const text = element.text;
      // Truncate long text so a single text element cannot blow the budget.
      if (text.length > 200) {
        summary.text = `${text.slice(0, 200)}…`;
        summary.textLength = text.length;
      } else {
        summary.text = text;
      }
    }
    if ("parentId" in element && element.parentId) summary.parentId = element.parentId;
    if ("componentId" in element && element.componentId) {
      summary.componentId = element.componentId;
      summary.componentRole = element.componentRole;
    }
    if (element.interactions?.length) summary.interactions = element.interactions;
    return summary;
  };

  // The manifest is built incrementally under a conservative character budget.
  // Each potentially-large summary section is appended only while the running
  // serialized length stays under {@link manifestBudget}, and every section
  // records total/included/omitted counts. This avoids ever serializing the
  // full huge object first — we build the bounded object directly. The section
  // arrays are assigned to {@link sections} before they are populated so the
  // running measurement reflects their growth.
  const manifestBudget = 200_000;
  const sections: Record<string, unknown> = {
    ...base,
    activePageId,
    frame: content.frame,
  };

  const measure = (): number => {
    try {
      return JSON.stringify(sections).length;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  // Active-page element summaries: the most useful scene information, so it is
  // included first under the budget. Include incrementally so a page with
  // thousands of elements still yields a bounded, parseable manifest with the
  // leading elements intact.
  {
    const accepted: Array<Record<string, unknown>> = [];
    sections.activePageElements = accepted;
    let included = 0;
    for (const element of activeElements) {
      accepted.push(elementSummary(element));
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.activePageElements;
    recordTruncation("activePageElements", activeElements.length, included);
  }

  // Page names: include every page id/name/elementCount. Page counts are
  // bounded by the scene model, but long page names can still blow the budget,
  // so each name is capped and the section is dropped entirely if it cannot fit.
  {
    const pageSummaries = pages.map((page) => ({
      id: page.id,
      name: page.name.length > 120 ? `${page.name.slice(0, 120)}…` : page.name,
      frame: page.frame,
      elementCount: page.elements.length,
    }));
    const accepted: typeof pageSummaries = [];
    sections.pages = accepted;
    let included = 0;
    for (const summary of pageSummaries) {
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.pages;
    recordTruncation("pages", pageSummaries.length, included);
  }

  // Components: id/name/size/builtIn. Component names and counts can be huge,
  // so include incrementally under the budget.
  {
    const components = content.components;
    const accepted: Array<Record<string, unknown>> = [];
    sections.components = accepted;
    let included = 0;
    for (const component of components) {
      const summary: Record<string, unknown> = {
        id: component.id,
        name: component.name.length > 120 ? `${component.name.slice(0, 120)}…` : component.name,
        width: component.width,
        height: component.height,
        builtIn: Boolean(component.builtIn),
        nodeCount: component.nodes.length,
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.components;
    recordTruncation("components", components.length, included);
  }

  // Paint styles: id/name only. Names can be long; cap each and include
  // incrementally.
  {
    const styles = content.styles ?? [];
    const accepted: Array<Record<string, unknown>> = [];
    sections.paintStyles = accepted;
    let included = 0;
    for (const style of styles) {
      const summary: Record<string, unknown> = {
        id: style.id,
        name: style.name.length > 120 ? `${style.name.slice(0, 120)}…` : style.name,
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.paintStyles;
    recordTruncation("paintStyles", styles.length, included);
  }

  // Text styles: id/name only.
  {
    const textStyles = content.textStyles ?? [];
    const accepted: Array<Record<string, unknown>> = [];
    sections.textStyles = accepted;
    let included = 0;
    for (const style of textStyles) {
      const summary: Record<string, unknown> = {
        id: style.id,
        name: style.name.length > 120 ? `${style.name.slice(0, 120)}…` : style.name,
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.textStyles;
    recordTruncation("textStyles", textStyles.length, included);
  }

  // Effect styles: id/name only.
  {
    const effectStyles = content.effectStyles ?? [];
    const accepted: Array<Record<string, unknown>> = [];
    sections.effectStyles = accepted;
    let included = 0;
    for (const style of effectStyles) {
      const summary: Record<string, unknown> = {
        id: style.id,
        name: style.name.length > 120 ? `${style.name.slice(0, 120)}…` : style.name,
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.effectStyles;
    recordTruncation("effectStyles", effectStyles.length, included);
  }

  // Token collections: id/name/activeMode and per-collection token names/counts.
  {
    const collections = content.tokenCollections ?? [];
    const accepted: Array<Record<string, unknown>> = [];
    sections.tokenCollections = accepted;
    let included = 0;
    for (const collection of collections) {
      const summary: Record<string, unknown> = {
        id: collection.id,
        name: collection.name.length > 120 ? `${collection.name.slice(0, 120)}…` : collection.name,
        activeMode: collection.activeMode,
        modeCount: collection.modes.length,
        tokenCount: collection.tokens.length,
        tokenNames: collection.tokens
          .slice(0, 50)
          .map((token) => (token.name.length > 80 ? `${token.name.slice(0, 80)}…` : token.name)),
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.tokenCollections;
    recordTruncation("tokenCollections", collections.length, included);
  }

  // Prototype flows: id/name/startPageId. Names are capped.
  {
    const flows = content.prototypeFlows ?? [];
    const accepted: Array<Record<string, unknown>> = [];
    sections.prototypeFlows = accepted;
    let included = 0;
    for (const flow of flows) {
      const summary: Record<string, unknown> = {
        id: flow.id,
        name: flow.name.length > 120 ? `${flow.name.slice(0, 120)}…` : flow.name,
        startPageId: flow.startPageId,
      };
      accepted.push(summary);
      included += 1;
      if (measure() > manifestBudget) {
        accepted.pop();
        included -= 1;
        break;
      }
    }
    if (included === 0) delete sections.prototypeFlows;
    recordTruncation("prototypeFlows", flows.length, included);
  }

  sections.truncation = truncation;
  return sections;
}

function readArtifact(artifact: Artifact, input: Record<string, unknown>): NativeToolResult {
  const path = typeof input.path === "string" ? input.path.trim() : "";
  if (!path) {
    const manifest = artifactManifest(artifact);
    const body = boundedManifest(manifest);
    return {
      content: body.text,
      metadata: {
        title: `Read ${artifact.title}`,
        artifactId: artifact.id,
        artifactTitle: artifact.title,
        ...(body.truncated ? { truncated: true, manifestCharacters: body.length, maxReadLength } : {}),
      },
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

/**
 * Serializes a manifest but keeps the result under {@link maxReadLength}. The
 * manifest object is already structurally budgeted by {@link canvasManifest},
 * so the full pretty-printed JSON should fit. If it still exceeds the budget
 * (for example a non-canvas manifest with enormous embedded text), the
 * compact form is tried and then, as a final guard, a tiny valid fallback is
 * returned that always parses. The raw JSON string is never sliced, which
 * would risk returning invalid, unparseable JSON to the agent.
 */
function boundedManifest(manifest: Record<string, unknown>): { text: string; truncated: boolean; length: number } {
  let text = JSON.stringify(manifest, null, 2);
  if (text.length <= maxReadLength) return { text, truncated: false, length: text.length };
  // Compact serialization is often enough to fit.
  text = JSON.stringify(manifest);
  if (text.length <= maxReadLength) return { text, truncated: false, length: text.length };
  // Final guard: a tiny, always-parseable fallback so the agent never receives
  // invalid JSON. Preserve the artifact identity when available.
  const fallback: Record<string, unknown> = {
    format: typeof manifest.format === "string" ? manifest.format : "unknown",
    id: typeof manifest.id === "string" ? manifest.id : undefined,
    title: typeof manifest.title === "string" ? manifest.title : undefined,
    truncation: { reason: "manifest exceeded maxReadLength after compaction", maxReadLength },
  };
  const fallbackText = JSON.stringify(fallback);
  return { text: fallbackText, truncated: true, length: fallbackText.length };
}

async function executeTool(repository: ArtifactRepository, context: ArtifactToolContext, name: string, input: Record<string, unknown>, now: () => string): Promise<NativeToolResult> {
  const { artifact, artifacts } = await selectedArtifact(repository, context);
  if (name === "artifact_read") return readArtifact(artifact, input);
  if (name !== "artifact_edit") throw new Error("Unknown artifact tool.");
  const edit = parseStudioArtifactEditPayload(input);
  if (!edit) throw new Error("artifact_edit requires at least one valid, bounded change.");
  // When a trusted Canvas selection is bound to this run, the agent may ONLY
  // edit via canvasCommands scoped to that exact page and ordered selection.
  // Any title/html/files/visual/componentPatches field — alongside or instead
  // of canvasCommands — must be rejected so the agent cannot bypass the
  // selection scope with a wholesale replacement.
  if (context.canvasSelection) {
    if (edit.canvasCommands === undefined
      || edit.title !== undefined
      || edit.html !== undefined
      || edit.files !== undefined
      || edit.visual !== undefined
      || edit.componentPatches !== undefined) {
      throw new Error("This run is bound to a Canvas selection; only canvasCommands matching that selection may be edited.");
    }
    if (artifact.content.format !== "khadim-canvas") {
      throw new Error("canvasCommands are only valid for khadim-canvas artifacts.");
    }
    const group = edit.canvasCommands;
    const trusted = context.canvasSelection;
    if (group.pageId !== trusted.pageId
      || group.selectionIds.length !== trusted.elementIds.length
      || !group.selectionIds.every((id, index) => id === trusted.elementIds[index])) {
      throw new Error("canvasCommands must target the exact page and selection recorded for this run.");
    }
    // A trusted selection must never permit the additive drawing command; the
    // agent is strictly bound to its exact page + ordered selection.
    if (group.commands.some((command) => command.type === "add-elements")) {
      throw new Error("add-elements is not permitted on a selection-bound run; use patch-elements scoped to the selection.");
    }
  } else if (edit.canvasCommands) {
    // No trusted selection: only additive Canvas add-elements groups on a
    // khadim-canvas artifact are permitted, with an empty selection. The agent
    // must not patch/remove existing elements or mutate non-canvas fields.
    if (artifact.content.format !== "khadim-canvas") {
      throw new Error("canvasCommands are only valid for khadim-canvas artifacts.");
    }
    if (edit.title !== undefined
      || edit.html !== undefined
      || edit.files !== undefined
      || edit.visual !== undefined
      || edit.componentPatches !== undefined) {
      throw new Error("This run has no Canvas selection; only canvasCommands with additive add-elements are permitted.");
    }
    const group = edit.canvasCommands;
    if (group.selectionIds.length !== 0) {
      throw new Error("This run has no Canvas selection; canvasCommands must use selectionIds: [] and only add-elements commands.");
    }
    if (!group.commands.every((command) => command.type === "add-elements")) {
      throw new Error("This run has no Canvas selection; only add-elements commands are permitted.");
    }
  }
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
