import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { googleWorkspaceServiceIds } from "../shared/google-workspace";
import { isHarnessMode } from "../shared/plugins";
import { CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES, canvasComponentAmbiguousLegacyOverridePaths, canvasComponentExpandedNodeCounts, canvasComponentGraphIssue, canvasComponentLegacyOverridePaths, canvasComponentPrimitiveSources } from "../shared/canvas-components";
import type { Artifact, CanvasComponentDefinition, Conversation, Project } from "../shared/types";
import { safeModelBaseUrl } from "./model-endpoint-policy";
import type { ProjectDataRepository, ProjectAvailability } from "./domain/repositories";

interface StoredProjectIndex {
  version: 1;
  projects: Project[];
}

interface ProjectStoreOptions {
  createId?: () => string;
  now?: () => string;
}

export type { ProjectAvailability } from "./domain/repositories";

type LegacyConversation = Omit<Conversation, "projectId"> & { projectId?: string };
interface LegacyArtifact {
  id: string;
  projectId?: string;
  title?: string;
  kind?: string;
  status?: string;
  html: string;
  baselineHtml: string;
  createdAt: string;
  updatedAt: string;
  sourceRunId?: string;
  sourceMessageId?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
  deletedAt?: string;
}

const projectIndexVersion = 1;

function validatedProjectName(value: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 160) throw new Error("Project name must be between 1 and 160 characters.");
  return name;
}

function isProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const project = value as Record<string, unknown>;
  return isBoundedString(project.id, 240)
    && /^[a-zA-Z0-9._-]+$/.test(project.id)
    && isBoundedString(project.name, 160)
    && isBoundedString(project.rootPath, 4_096)
    && isAbsolute(project.rootPath)
    && ["createdAt", "updatedAt", "lastOpenedAt"].every((key) => isBoundedString(project[key], 80));
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || Boolean(value.trim()));
}

function isChatMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (!isBoundedString(message.id, 240) || !["user", "assistant"].includes(String(message.role))) return false;
  if (!isBoundedString(message.content, 5 * 1024 * 1024, true) || !isBoundedString(message.createdAt, 80)) return false;
  if (message.status !== undefined && !["streaming", "complete", "error"].includes(String(message.status))) return false;
  if (message.runId !== undefined && !isBoundedString(message.runId, 240)) return false;
  if (message.artifactIds !== undefined && (!Array.isArray(message.artifactIds)
    || message.artifactIds.length > 250
    || !message.artifactIds.every((id) => isBoundedString(id, 240))
    || new Set(message.artifactIds).size !== message.artifactIds.length)) return false;
  if (message.attachments !== undefined && (!Array.isArray(message.attachments)
    || message.attachments.length > 20
    || !message.attachments.every((attachment) => {
      if (typeof attachment !== "object" || attachment === null || Array.isArray(attachment)) return false;
      const candidate = attachment as Record<string, unknown>;
      return isBoundedString(candidate.name, 512) && isBoundedString(candidate.type, 160, true);
    }))) return false;
  if (message.toolCalls !== undefined && (!Array.isArray(message.toolCalls)
    || message.toolCalls.length > 1_000
    || !message.toolCalls.every((toolCall) => {
      if (typeof toolCall !== "object" || toolCall === null || Array.isArray(toolCall)) return false;
      const candidate = toolCall as Record<string, unknown>;
      return isBoundedString(candidate.id, 240)
        && isBoundedString(candidate.tool, 240)
        && isBoundedString(candidate.title, 1_000)
        && ["running", "complete", "error"].includes(String(candidate.status))
        && (candidate.input === undefined || isBoundedString(candidate.input, 5 * 1024 * 1024, true))
        && (candidate.result === undefined || isBoundedString(candidate.result, 5 * 1024 * 1024, true));
    }))) return false;
  if (message.usage !== undefined) {
    if (typeof message.usage !== "object" || message.usage === null || Array.isArray(message.usage)) return false;
    const usage = message.usage as Record<string, unknown>;
    if (!["input", "output", "cacheRead", "cacheWrite"].every((key) => typeof usage[key] === "number" && Number.isFinite(usage[key]) && (usage[key] as number) >= 0)) return false;
  }
  return true;
}

function isAgentRun(value: unknown, conversation: Record<string, unknown>, messagesById: Map<string, Record<string, unknown>>): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  if (!["id", "projectId", "conversationId", "userMessageId", "assistantMessageId", "createdAt"].every((key) => isBoundedString(run[key], 240))) return false;
  if (run.artifactId !== undefined && !isBoundedString(run.artifactId, 240)) return false;
  if (run.projectId !== conversation.projectId || run.conversationId !== conversation.id) return false;
  const userMessage = messagesById.get(String(run.userMessageId));
  const assistantMessage = messagesById.get(String(run.assistantMessageId));
  if (userMessage?.role !== "user" || assistantMessage?.role !== "assistant" || assistantMessage.runId !== run.id) return false;
  if (!["running", "complete", "error", "stopped"].includes(String(run.status))) return false;
  if (run.completedAt !== undefined && !isBoundedString(run.completedAt, 80)) return false;
  if (run.lastEventSequence !== undefined && (!Number.isSafeInteger(run.lastEventSequence) || (run.lastEventSequence as number) < 0)) return false;
  if (!isHarnessMode(run.harness)) return false;
  if (run.runtimeMode !== undefined && !["approval-required", "auto-accept-edits", "full-access"].includes(String(run.runtimeMode))) return false;
  if (run.interactionMode !== undefined && !isBoundedString(run.interactionMode, 160)) return false;
  if (run.multiAgent !== undefined && typeof run.multiAgent !== "boolean") return false;
  if (!Array.isArray(run.enabledTools) || run.enabledTools.length > 100 || !run.enabledTools.every((tool) => isBoundedString(tool, 120))) return false;
  if (new Set(run.enabledTools).size !== run.enabledTools.length) return false;
  if (run.enabledApps !== undefined && (!Array.isArray(run.enabledApps)
    || run.enabledApps.length > googleWorkspaceServiceIds.length
    || !run.enabledApps.every((appId) => typeof appId === "string" && googleWorkspaceServiceIds.includes(appId as (typeof googleWorkspaceServiceIds)[number]))
    || new Set(run.enabledApps).size !== run.enabledApps.length)) return false;
  for (const [key, required] of [["agent", ["id", "name", "systemPrompt"]], ["model", ["id", "name", "provider", "model"]]] as const) {
    const nested = run[key];
    if (typeof nested !== "object" || nested === null || Array.isArray(nested)) return false;
    const candidate = nested as Record<string, unknown>;
    if (!required.every((field) => isBoundedString(candidate[field], field === "systemPrompt" ? 250_000 : 1_000, field === "systemPrompt"))) return false;
  }
  const model = run.model as Record<string, unknown>;
  if (model.temperature !== undefined) {
    if (!isBoundedString(model.temperature, 40)) return false;
    const temperature = Number(model.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return false;
  }
  if (model.baseUrl !== undefined) {
    if (!isBoundedString(model.baseUrl, 4_096)) return false;
    try {
      safeModelBaseUrl(model.baseUrl, "invalid");
    } catch {
      return false;
    }
  }
  return true;
}

function isConversation(value: unknown): value is Conversation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const conversation = value as Record<string, unknown>;
  if (!["id", "projectId", "engineSessionKey", "title", "createdAt", "updatedAt"]
    .every((key) => isBoundedString(conversation[key], key === "title" ? 500 : 240))) return false;
  if (!Array.isArray(conversation.messages) || conversation.messages.length > 4_000 || !conversation.messages.every(isChatMessage)) return false;
  const messagesById = new Map(conversation.messages.map((message) => {
    const candidate = message as Record<string, unknown>;
    return [candidate.id as string, candidate] as const;
  }));
  if (messagesById.size !== conversation.messages.length) return false;
  if (conversation.runs !== undefined) {
    if (!Array.isArray(conversation.runs) || conversation.runs.length > 2_000 || !conversation.runs.every((run) => isAgentRun(run, conversation, messagesById))) return false;
    if (new Set(conversation.runs.map((run) => (run as Record<string, unknown>).id)).size !== conversation.runs.length) return false;
  }
  return true;
}

function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  if (!isBoundedString(artifact.id, 240)
    || !isBoundedString(artifact.projectId, 240)
    || !isBoundedString(artifact.title, 1_000)
    || !isBoundedString(artifact.createdAt, 80)
    || !isBoundedString(artifact.updatedAt, 80)
    || artifact.schemaVersion !== 2
    || !["document", "site", "canvas"].includes(String(artifact.kind))
    || !["draft", "ready", "published"].includes(String(artifact.lifecycle))
    || (artifact.deletedAt !== undefined && !isBoundedString(artifact.deletedAt, 80))) return false;
  const content = artifact.content;
  if (typeof content !== "object" || content === null || Array.isArray(content)) return false;
  const data = content as Record<string, unknown>;
  if (artifact.kind === "site") {
    if (data.format === "html") {
      if (typeof data.html !== "string" || typeof data.baselineHtml !== "string") return false;
      if (data.html.length > 10 * 1024 * 1024 || data.baselineHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (data.html !== "" || data.baselineHtml !== "")) return false;
    } else if (data.format === "web-project") {
      if (!["static", "react", "react-router", "vue", "svelte"].includes(String(data.framework))
        || !isBoundedString(data.entryFile, 500)
        || typeof data.previewHtml !== "string"
        || typeof data.baselinePreviewHtml !== "string"
        || !isArtifactFileMap(data.files)
        || !isArtifactFileMap(data.baselineFiles)
        || !isVisualDocument(data.visual)) return false;
      if (data.previewHtml.length > 10 * 1024 * 1024 || data.baselinePreviewHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (Object.keys(data.files).length > 0 || Object.keys(data.baselineFiles).length > 0 || data.previewHtml !== "" || data.baselinePreviewHtml !== "")) return false;
    } else return false;
  } else if (artifact.kind === "document") {
    if (data.format === "tiptap") {
      if (typeof data.document !== "object" || data.document === null || Array.isArray(data.document)) return false;
    } else if (data.format === "document-html") {
      if (typeof data.html !== "string" || typeof data.baselineHtml !== "string") return false;
      if (data.html.length > 10 * 1024 * 1024 || data.baselineHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (data.html !== "" || data.baselineHtml !== "")) return false;
    } else return false;
    const page = data.page;
    if (typeof page !== "object" || page === null || Array.isArray(page)) return false;
    const settings = page as Record<string, unknown>;
    if (!["A4", "Letter"].includes(String(settings.size))
      || !["portrait", "landscape"].includes(String(settings.orientation))
      || typeof settings.margin !== "number"
      || !Number.isFinite(settings.margin)
      || settings.margin < 0
      || settings.margin > 80) return false;
  } else {
    if (data.format !== "khadim-canvas" || data.sceneVersion !== 1 || !isCanvasScene(data)) return false;
  }
  if (artifact.provenance !== undefined) {
    if (typeof artifact.provenance !== "object" || artifact.provenance === null || Array.isArray(artifact.provenance)) return false;
    const provenance = artifact.provenance as Record<string, unknown>;
    if (!["user", "agent", "import"].includes(String(provenance.origin))) return false;
    if (!["runId", "messageId", "conversationId"].every((key) => provenance[key] === undefined || isBoundedString(provenance[key], 240))) return false;
    if (provenance.conversationTitle !== undefined && !isBoundedString(provenance.conversationTitle, 500)) return false;
  }
  return true;
}

function isArtifactFileMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 1_000) return false;
  let total = 0;
  for (const [path, source] of entries) {
    if (!path.startsWith("/") || path.length > 500 || path.includes("\0") || typeof source !== "string") return false;
    total += source.length;
    if (total > 20 * 1024 * 1024) return false;
  }
  return true;
}

function isVisualDocument(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const visual = value as Record<string, unknown>;
  if (visual.editor !== "puck" || typeof visual.data !== "object" || visual.data === null || Array.isArray(visual.data)) return false;
  const document = visual.data as Record<string, unknown>;
  if (!Array.isArray(document.content) || document.content.length > 5_000 || typeof document.root !== "object" || document.root === null || Array.isArray(document.root)) return false;
  try {
    return JSON.stringify(document).length <= 10 * 1024 * 1024;
  } catch {
    return false;
  }
}

function isFiniteCanvasNumber(value: unknown, minimum = -100_000, maximum = 100_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isCanvasGradient(value: unknown, allowRadial = true): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const gradient = value as Record<string, unknown>;
  const geometryValid = gradient.type === "linear"
    ? isFiniteCanvasNumber(gradient.angle, -360_000, 360_000)
    : allowRadial && gradient.type === "radial"
      && isFiniteCanvasNumber(gradient.centerX, 0, 1)
      && isFiniteCanvasNumber(gradient.centerY, 0, 1)
      && isFiniteCanvasNumber(gradient.radius, .001, 2);
  return geometryValid
    && Array.isArray(gradient.stops)
    && gradient.stops.length >= 2
    && gradient.stops.length <= 16
    && gradient.stops.every((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const stop = value as Record<string, unknown>;
      return isFiniteCanvasNumber(stop.offset, 0, 1)
        && isBoundedString(stop.color, 80)
        && (stop.opacity === undefined || isFiniteCanvasNumber(stop.opacity, 0, 1));
    });
}

function isCanvasFills(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 16) return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const fill = entry as Record<string, unknown>;
    if (!isBoundedString(fill.id, 240) || ids.has(fill.id) || typeof fill.visible !== "boolean" || !isFiniteCanvasNumber(fill.opacity, 0, 1) || !isBoundedString(fill.color, 80)) return false;
    ids.add(fill.id);
    return fill.gradient === undefined || isCanvasGradient(fill.gradient);
  });
}

function isCanvasStrokes(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 16) return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const stroke = entry as Record<string, unknown>;
    if (!isBoundedString(stroke.id, 240) || ids.has(stroke.id) || typeof stroke.visible !== "boolean" || !isBoundedString(stroke.color, 80)
      || !isFiniteCanvasNumber(stroke.opacity, 0, 1) || !isFiniteCanvasNumber(stroke.width, 0, 10_000)
      || !["inside", "center", "outside"].includes(String(stroke.alignment)) || !["solid", "dotted", "dashed", "mixed"].includes(String(stroke.style))
      || (stroke.dash !== undefined && !isFiniteCanvasNumber(stroke.dash, .1, 10_000)) || (stroke.gap !== undefined && !isFiniteCanvasNumber(stroke.gap, .1, 10_000))) return false;
    ids.add(stroke.id);
    return true;
  });
}

function isCanvasShadow(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const shadow = value as Record<string, unknown>;
  return isBoundedString(shadow.color, 80)
    && isFiniteCanvasNumber(shadow.x, -10_000, 10_000)
    && isFiniteCanvasNumber(shadow.y, -10_000, 10_000)
    && isFiniteCanvasNumber(shadow.blur, 0, 10_000)
    && isFiniteCanvasNumber(shadow.opacity, 0, 1);
}

function isCanvasShadows(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 16) return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const shadow = entry as Record<string, unknown>;
    if (!isBoundedString(shadow.id, 240) || ids.has(shadow.id) || typeof shadow.visible !== "boolean" || !["drop", "inner"].includes(String(shadow.type))
      || !isCanvasShadow(shadow) || !isFiniteCanvasNumber(shadow.spread, -10_000, 10_000)) return false;
    ids.add(shadow.id);
    return true;
  });
}

function isCanvasBlur(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const blur = value as Record<string, unknown>;
  return Object.keys(blur).every((key) => ["value", "visible"].includes(key))
    && isFiniteCanvasNumber(blur.value, 0, 100)
    && typeof blur.visible === "boolean";
}

function isCanvasCornerRadii(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const radii = value as Record<string, unknown>;
  const keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
  return Object.keys(radii).length === keys.length
    && keys.every((key) => isFiniteCanvasNumber(radii[key], 0, 100_000));
}

function isCanvasLayout(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  return ["row", "column"].includes(String(layout.direction))
    && ["start", "center", "end"].includes(String(layout.align))
    && ["start", "center", "end", "space-between"].includes(String(layout.justify))
    && ["fixed", "hug"].includes(String(layout.sizing))
    && isFiniteCanvasNumber(layout.gap, 0, 100_000)
    && (layout.crossGap === undefined || isFiniteCanvasNumber(layout.crossGap, 0, 100_000))
    && (layout.wrap === undefined || typeof layout.wrap === "boolean")
    && isFiniteCanvasNumber(layout.padding, 0, 100_000);
}

function hasCanvasParentCycle(nodes: Record<string, unknown>[]): boolean {
  const parentById = new Map(nodes.map((node) => [node.id as string, node.parentId as string | undefined]));
  const state = new Map<string, "visiting" | "complete">();
  for (const node of nodes) {
    if (state.get(node.id as string) === "complete") continue;
    const path: string[] = [];
    let current: string | undefined = node.id as string;
    while (current) {
      const currentState = state.get(current);
      if (currentState === "visiting") return true;
      if (currentState === "complete") break;
      state.set(current, "visiting");
      path.push(current);
      current = parentById.get(current);
    }
    path.forEach((id) => state.set(id, "complete"));
  }
  return false;
}

function isCanvasPrototypeInteraction(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const interaction = value as Record<string, unknown>;
  if (!isBoundedString(interaction.id, 240) || !["click", "hover", "after-delay"].includes(String(interaction.trigger)) || !["navigate", "back", "open-url", "open-overlay", "toggle-overlay", "close-overlay"].includes(String(interaction.action))) return false;
  if (interaction.trigger === "after-delay") {
    if (!isFiniteCanvasNumber(interaction.delay, 0, 60_000)) return false;
  } else if (interaction.delay !== undefined) return false;
  const opensDestination = interaction.action === "navigate" || interaction.action === "open-overlay" || interaction.action === "toggle-overlay";
  if (interaction.action === "navigate" && (!isBoundedString(interaction.destinationPageId, 240) || interaction.url !== undefined || interaction.overlay !== undefined)) return false;
  if (interaction.action === "back" || interaction.action === "close-overlay") {
    if (interaction.destinationPageId !== undefined || interaction.url !== undefined || interaction.transition !== undefined || interaction.overlay !== undefined) return false;
  }
  if (interaction.action === "open-url") {
    if (interaction.destinationPageId !== undefined || interaction.transition !== undefined || interaction.overlay !== undefined) return false;
    if (interaction.url !== undefined) {
      if (!isBoundedString(interaction.url, 2_048)) return false;
      try {
        const parsed = new URL(interaction.url as string);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      } catch {
        return false;
      }
    }
  }
  if (interaction.action === "open-overlay" || interaction.action === "toggle-overlay") {
    if (!isBoundedString(interaction.destinationPageId, 240) || interaction.url !== undefined || typeof interaction.overlay !== "object" || interaction.overlay === null || Array.isArray(interaction.overlay)) return false;
    const overlay = interaction.overlay as Record<string, unknown>;
    if (!["center", "top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"].includes(String(overlay.position))
      || !["none", "dim"].includes(String(overlay.background)) || typeof overlay.closeOnOutsideClick !== "boolean") return false;
  }
  if (interaction.transition !== undefined) {
    if (!opensDestination || typeof interaction.transition !== "object" || interaction.transition === null || Array.isArray(interaction.transition)) return false;
    const transition = interaction.transition as Record<string, unknown>;
    if (!["instant", "dissolve", "slide", "smart"].includes(String(transition.type)) || !isFiniteCanvasNumber(transition.duration, 0, 5_000) || !["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(String(transition.easing))) return false;
    if (transition.direction !== undefined && !["left", "right", "up", "down"].includes(String(transition.direction))) return false;
    if (transition.type !== "slide" && transition.direction !== undefined) return false;
    if (transition.type === "smart" && interaction.action !== "navigate") return false;
  }
  return true;
}

function isCanvasElement(value: unknown, allowComponent = true): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const element = value as Record<string, unknown>;
  const types = allowComponent ? ["rectangle", "ellipse", "line", "path", "arrow", "text", "image", "frame", "boolean", "component"] : ["rectangle", "ellipse", "line", "path", "arrow", "text", "image", "frame"];
  if (!isBoundedString(element.id, 240) || !types.includes(String(element.type))) return false;
  if (!isBoundedString(element.color, 80)) return false;
  if (!["x", "y", "width", "height"].every((key) => isFiniteCanvasNumber(element[key]))) return false;
  if ((element.width as number) < 0 || (element.height as number) < 0) return false;
  for (const key of ["name", "parentId", "groupId", "maskId", "prototypeKey", "color", "strokeColor", "text", "src", "alt", "startBindingId", "endBindingId", "fontFamily"]) {
    if (element[key] !== undefined && !isBoundedString(element[key], key === "src" ? 15 * 1024 * 1024 : key === "text" ? 250_000 : 1_000, true)) return false;
  }
  if (element.fillGradient !== undefined && (!isCanvasGradient(element.fillGradient, false) || (element.fillGradient as Record<string, unknown>).type !== "linear")) return false;
  if (element.fills !== undefined && (element.type === "component" || !isCanvasFills(element.fills))) return false;
  if (element.strokes !== undefined && (element.type === "component" || !isCanvasStrokes(element.strokes))) return false;
  const supportsFills = element.type === "text" || !["line", "arrow", "image"].includes(String(element.type)) && (element.type !== "path" || element.pathClosed === true);
  if (element.fills !== undefined && !supportsFills) return false;
  const requiresCenteredStrokes = ["text", "line", "arrow"].includes(String(element.type)) || element.type === "path" && element.pathClosed !== true;
  if (requiresCenteredStrokes && Array.isArray(element.strokes) && element.strokes.some((stroke) => (stroke as Record<string, unknown>).alignment !== "center")) return false;
  if (element.fillStyleId !== undefined && !isBoundedString(element.fillStyleId, 240)) return false;
  if (element.textStyleId !== undefined && (element.type !== "text" || !isBoundedString(element.textStyleId, 240))) return false;
  if (element.effectStyleId !== undefined && !isBoundedString(element.effectStyleId, 240)) return false;
  if (element.tokenBindings !== undefined) {
    if (typeof element.tokenBindings !== "object" || element.tokenBindings === null || Array.isArray(element.tokenBindings)) return false;
    const bindings = element.tokenBindings as Record<string, unknown>;
    if (Object.keys(bindings).some((key) => !["fill", "stroke", "radius", "opacity", "gap", "padding"].includes(key)) || Object.values(bindings).some((value) => !isBoundedString(value, 240))) return false;
  }
  if (element.svgPathData !== undefined && (element.type !== "path" || !isBoundedString(element.svgPathData, 1_000_000) || !/^[\s0-9eE+.,MmLlHhVvCcSsQqTtAaZz-]+$/.test(element.svgPathData as string))) return false;
  if (element.svgTransform !== undefined && (element.type !== "path" || !isBoundedString(element.svgTransform, 4_000) || !/^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9.eE,\s]+\)\s*)*$/.test(element.svgTransform as string))) return false;
  if (element.svgViewBox !== undefined) {
    if (element.type !== "path" || typeof element.svgViewBox !== "object" || element.svgViewBox === null || Array.isArray(element.svgViewBox)) return false;
    const viewBox = element.svgViewBox as Record<string, unknown>;
    if (!isFiniteCanvasNumber(viewBox.x) || !isFiniteCanvasNumber(viewBox.y) || !isFiniteCanvasNumber(viewBox.width, .0001, 100_000) || !isFiniteCanvasNumber(viewBox.height, .0001, 100_000)) return false;
  }
  for (const key of ["rotation", "fontWeight", "letterSpacing"]) {
    if (element[key] !== undefined && !isFiniteCanvasNumber(element[key])) return false;
  }
  if (element.opacity !== undefined && !isFiniteCanvasNumber(element.opacity, 0, 1)) return false;
  if (element.blendMode !== undefined && !["normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"].includes(String(element.blendMode))) return false;
  if (element.layerBlur !== undefined && !isCanvasBlur(element.layerBlur)) return false;
  if (element.backgroundBlur !== undefined && !isCanvasBlur(element.backgroundBlur)) return false;
  for (const key of ["radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight"]) if (element[key] !== undefined && !isFiniteCanvasNumber(element[key], 0, 100_000)) return false;
  if (element.cornerRadii !== undefined && (!isCanvasCornerRadii(element.cornerRadii) || !["rectangle", "frame", "image"].includes(String(element.type)))) return false;
  for (const key of ["hidden", "locked", "lineFlip", "clipContent", "fixedInPrototype"]) if (element[key] !== undefined && typeof element[key] !== "boolean") return false;
  if (element.fontStyle !== undefined && !["normal", "italic"].includes(String(element.fontStyle))) return false;
  if (element.textAlign !== undefined && !["left", "center", "right"].includes(String(element.textAlign))) return false;
  if (element.layoutPosition !== undefined && !["static", "absolute"].includes(String(element.layoutPosition))) return false;
  if (element.interactions !== undefined) {
    if (!allowComponent || !Array.isArray(element.interactions) || element.interactions.length > 3 || !element.interactions.every(isCanvasPrototypeInteraction)) return false;
    const interactions = element.interactions as Array<Record<string, unknown>>;
    if (new Set(interactions.map((interaction) => interaction.id)).size !== interactions.length || new Set(interactions.map((interaction) => interaction.trigger)).size !== interactions.length) return false;
  }
  if (element.shadow !== undefined && !isCanvasShadow(element.shadow)) return false;
  if (element.shadows !== undefined && (element.type === "component" || !isCanvasShadows(element.shadows))) return false;
  if (element.layout !== undefined && (element.type !== "frame" || !isCanvasLayout(element.layout))) return false;
  if (element.layoutGrids !== undefined && (element.type !== "frame" || !Array.isArray(element.layoutGrids) || element.layoutGrids.length > 16 || element.layoutGrids.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
    const grid = value as Record<string, unknown>;
    return !isBoundedString(grid.id, 240) || !["square", "columns", "rows"].includes(String(grid.type)) || typeof grid.visible !== "boolean" || !isBoundedString(grid.color, 80)
      || !isFiniteCanvasNumber(grid.opacity, 0, 1) || (grid.size !== undefined && !isFiniteCanvasNumber(grid.size, 1, 10_000)) || (grid.count !== undefined && !isFiniteCanvasNumber(grid.count, 1, 100))
      || (grid.gutter !== undefined && !isFiniteCanvasNumber(grid.gutter, 0, 100_000)) || (grid.margin !== undefined && !isFiniteCanvasNumber(grid.margin, 0, 100_000));
  }))) return false;
  if (element.type === "path" || element.type === "arrow") {
    const validPoints = Array.isArray(element.points)
      && element.points.length >= 2
      && element.points.length <= 20_000
      && element.points.every((point) => typeof point === "object" && point !== null && !Array.isArray(point)
        && isFiniteCanvasNumber((point as Record<string, unknown>).x, -10, 10)
        && isFiniteCanvasNumber((point as Record<string, unknown>).y, -10, 10)
        && ((point as Record<string, unknown>).nodeType === undefined || ["corner", "smooth"].includes(String((point as Record<string, unknown>).nodeType)))
        && ["handleIn", "handleOut"].every((key) => {
          const handle = (point as Record<string, unknown>)[key];
          return handle === undefined || typeof handle === "object" && handle !== null && !Array.isArray(handle)
            && isFiniteCanvasNumber((handle as Record<string, unknown>).x, -100_000, 100_000)
            && isFiniteCanvasNumber((handle as Record<string, unknown>).y, -100_000, 100_000);
        }));
    const validImportedPath = element.type === "path" && element.svgPathData !== undefined && element.svgViewBox !== undefined;
    if (!validPoints && !validImportedPath) return false;
  }
  if (element.pathSmoothing !== undefined && !isFiniteCanvasNumber(element.pathSmoothing, 0, 1)) return false;
  if (element.pathClosed !== undefined && typeof element.pathClosed !== "boolean") return false;
  if (element.fillRule !== undefined && !["nonzero", "evenodd"].includes(String(element.fillRule))) return false;
  if (element.startCap !== undefined && !["none", "arrow", "round"].includes(String(element.startCap))) return false;
  if (element.endCap !== undefined && !["none", "arrow", "round"].includes(String(element.endCap))) return false;
  if (element.constraintH !== undefined && !["left", "right", "left-right", "center", "scale"].includes(String(element.constraintH))) return false;
  if (element.constraintV !== undefined && !["top", "bottom", "top-bottom", "center", "scale"].includes(String(element.constraintV))) return false;
  if (element.type === "boolean" && !["union", "difference", "intersection", "exclusion"].includes(String(element.booleanOperation))) return false;
  if (element.type !== "boolean" && element.booleanOperation !== undefined) return false;
  if (element.type === "component") {
    if (!isBoundedString(element.componentId, 240) || !["main", "instance"].includes(String(element.componentRole))) return false;
    if (element.overrides !== undefined && (typeof element.overrides !== "object" || element.overrides === null || Array.isArray(element.overrides))) return false;
  }
  return true;
}

function canvasPrototypeFixedIds(elements: Record<string, unknown>[]): Set<string> {
  const byId = new Map(elements.map((element) => [element.id as string, element]));
  const declarations = new Set(elements.filter((element) => element.fixedInPrototype === true).map((element) => element.id as string));
  const booleanAncestorById = new Map<string, string | undefined>();
  for (const element of elements) {
    if (booleanAncestorById.has(element.id as string)) continue;
    const path: Record<string, unknown>[] = [];
    const visited = new Set<string>();
    let current: Record<string, unknown> | undefined = element;
    while (current && !booleanAncestorById.has(current.id as string) && !visited.has(current.id as string)) {
      visited.add(current.id as string);
      path.push(current);
      current = current.parentId ? byId.get(current.parentId as string) : undefined;
    }
    let booleanAncestor = current ? booleanAncestorById.get(current.id as string) : undefined;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (path[index].type === "boolean") booleanAncestor = path[index].id as string;
      booleanAncestorById.set(path[index].id as string, booleanAncestor);
    }
  }
  for (const declaration of [...declarations]) {
    const booleanAncestor = booleanAncestorById.get(declaration);
    if (booleanAncestor) declarations.add(booleanAncestor);
  }
  const fixedById = new Map<string, boolean>();
  const fixed = new Set<string>();
  for (const element of elements) {
    if (fixedById.has(element.id as string)) continue;
    const path: Record<string, unknown>[] = [];
    const visited = new Set<string>();
    let current: Record<string, unknown> | undefined = element;
    while (current && !fixedById.has(current.id as string) && !visited.has(current.id as string)) {
      visited.add(current.id as string);
      path.push(current);
      current = current.parentId ? byId.get(current.parentId as string) : undefined;
    }
    let inheritedFixed = current ? fixedById.get(current.id as string) ?? false : false;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      inheritedFixed ||= declarations.has(path[index].id as string);
      fixedById.set(path[index].id as string, inheritedFixed);
      if (inheritedFixed) fixed.add(path[index].id as string);
    }
  }
  return fixed;
}

interface CanvasSceneValidationContext {
  components: Record<string, unknown>[];
  componentIds: Set<string>;
  typedComponents: CanvasComponentDefinition[];
  componentsById: Map<string, CanvasComponentDefinition>;
  expandedComponentCounts: Map<string, number>;
  componentSourceMaps: Map<string, Map<string, Record<string, unknown>>>;
  ambiguousLegacyPaths: Map<string, Map<string, string>>;
  styleIds?: Set<string>;
  textStyleIds?: Set<string>;
  effectStyleIds?: Set<string>;
  tokenIds?: Set<string>;
}

function isCanvasScene(data: Record<string, unknown>, validatePrototypeDestinations = true, validationContext?: CanvasSceneValidationContext): boolean {
  if (!Array.isArray(data.elements) || data.elements.length > 10_000 || !data.elements.every((element) => isCanvasElement(element))) return false;
  const elements = data.elements as Record<string, unknown>[];
  const elementIds = new Set(elements.map((element) => element.id as string));
  if (elementIds.size !== elements.length) return false;
  if (elements.some((element) => element.parentId !== undefined && (!elementIds.has(element.parentId as string) || element.parentId === element.id))) return false;
  const booleanIds = new Set(elements.filter((element) => element.type === "boolean").map((element) => element.id as string));
  if (elements.some((element) => element.type === "boolean" && elements.filter((candidate) => candidate.parentId === element.id).length < 2)) return false;
  if (elements.some((element) => element.type === "boolean" && element.parentId !== undefined && booleanIds.has(element.parentId as string))) return false;
  if (elements.some((element) => element.parentId !== undefined && booleanIds.has(element.parentId as string)
    && !["rectangle", "ellipse", "frame", "path"].includes(String(element.type)))) return false;
  if (elements.some((element) => element.maskId !== undefined && (!elementIds.has(element.maskId as string) || element.maskId === element.id))) return false;
  if (hasCanvasParentCycle(elements)) return false;
  const fixedElementIds = canvasPrototypeFixedIds(elements);
  let reachedFixedLayer = false;
  for (const element of elements) {
    if (fixedElementIds.has(element.id as string)) reachedFixedLayer = true;
    else if (reachedFixedLayer) return false;
  }
  if (elements.some((element) => element.type === "arrow" && [element.startBindingId, element.endBindingId].some((id) => id !== undefined && (!elementIds.has(id as string) || id === element.id)))) return false;
  let components: Record<string, unknown>[];
  let componentIds: Set<string>;
  let typedComponents: CanvasComponentDefinition[];
  if (validationContext) {
    ({ components, componentIds, typedComponents } = validationContext);
  } else {
    if (!Array.isArray(data.components) || data.components.length > 1_000 || !data.components.every((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const component = value as Record<string, unknown>;
      return isBoundedString(component.id, 240)
        && isBoundedString(component.name, 1_000)
        && (component.variantSetId === undefined || isBoundedString(component.variantSetId, 240))
        && (component.variantSetName === undefined || isBoundedString(component.variantSetName, 1_000))
        && (component.variantProperties === undefined || typeof component.variantProperties === "object" && component.variantProperties !== null && !Array.isArray(component.variantProperties)
          && Object.entries(component.variantProperties as Record<string, unknown>).length <= 16
          && Object.entries(component.variantProperties as Record<string, unknown>).every(([key, property]) => isBoundedString(key, 240) && isBoundedString(property, 1_000)))
        && isFiniteCanvasNumber(component.width, 1)
        && isFiniteCanvasNumber(component.height, 1)
        && Array.isArray(component.nodes)
        && component.nodes.length <= 2_000
        && component.nodes.every((node) => isCanvasElement(node, true));
    })) return false;
    components = data.components as Record<string, unknown>[];
    componentIds = new Set(components.map((component) => component.id as string));
    if (componentIds.size !== components.length) return false;
    for (const component of components) {
      const componentNodes = component.nodes as Record<string, unknown>[];
      const nodeIds = new Set(componentNodes.map((node) => node.id as string));
      if (nodeIds.size !== componentNodes.length) return false;
      if (componentNodes.some((node) => node.parentId !== undefined && (!nodeIds.has(node.parentId as string) || node.parentId === node.id))) return false;
      if (componentNodes.some((node) => node.maskId !== undefined && (!nodeIds.has(node.maskId as string) || node.maskId === node.id))) return false;
      if (componentNodes.some((node) => node.startBindingId !== undefined && (!nodeIds.has(node.startBindingId as string) || node.startBindingId === node.id))) return false;
      if (componentNodes.some((node) => node.endBindingId !== undefined && (!nodeIds.has(node.endBindingId as string) || node.endBindingId === node.id))) return false;
      if (componentNodes.some((node) => node.type === "component" && node.componentRole !== "instance")) return false;
      if (hasCanvasParentCycle(componentNodes)) return false;
    }
    typedComponents = components as unknown as CanvasComponentDefinition[];
  }
  if (!validationContext && canvasComponentGraphIssue(typedComponents)) return false;
  const expandedComponentCounts = validationContext?.expandedComponentCounts ?? canvasComponentExpandedNodeCounts(typedComponents);
  const resolvedValidationContext: CanvasSceneValidationContext = validationContext ?? { components, componentIds, typedComponents, componentsById: new Map(typedComponents.map((component) => [component.id, component])), expandedComponentCounts, componentSourceMaps: new Map(), ambiguousLegacyPaths: new Map() };
  let expandedSceneNodes = 0;
  for (const element of elements) {
    expandedSceneNodes += element.type === "component" ? expandedComponentCounts.get(element.componentId as string) ?? CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES + 1 : 1;
    if (expandedSceneNodes > CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES) return false;
  }
  if (elements.some((element) => element.type === "component" && !componentIds.has(element.componentId as string))) return false;
  const overrideHolders = [...elements, ...(validationContext ? [] : components.flatMap((component) => component.nodes as Record<string, unknown>[]))];
  const componentOverrides = overrideHolders.flatMap((element) => element.type === "component" && element.overrides && typeof element.overrides === "object"
    ? Object.values(element.overrides as Record<string, unknown>).filter((override): override is Record<string, unknown> => typeof override === "object" && override !== null && !Array.isArray(override))
    : []);
  const hasInvalidPrimitiveReference = (predicate: (node: Record<string, unknown>) => boolean): boolean => {
    for (const element of elements) if (element.type !== "component" && predicate(element)) return true;
    // Validate each authored definition node once. Recursively expanding every possible root can
    // multiply a shared component DAG into millions of transient entries without adding coverage.
    if (!validationContext) {
      for (const component of components) {
        for (const node of component.nodes as Record<string, unknown>[]) {
          if (node.type !== "component" && predicate(node)) return true;
        }
      }
    }
    return componentOverrides.some(predicate);
  };
  if (!validationContext && data.styles !== undefined && (!Array.isArray(data.styles)
    || data.styles.length > 2_000
    || data.styles.some((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
      const style = value as Record<string, unknown>;
      return !isBoundedString(style.id, 240)
        || !isBoundedString(style.name, 1_000)
        || !isBoundedString(style.color, 80)
        || (style.gradient !== undefined && !isCanvasGradient(style.gradient));
    })
    || new Set(data.styles.map((style) => (style as Record<string, unknown>).id)).size !== data.styles.length)) return false;
  const styleIds = validationContext?.styleIds ?? new Set((data.styles as Record<string, unknown>[] | undefined)?.map((style) => style.id as string) ?? []);
  resolvedValidationContext.styleIds = styleIds;
  if (hasInvalidPrimitiveReference((element) => element.fillStyleId !== undefined && (typeof element.fillStyleId !== "string" || !styleIds.has(element.fillStyleId)))) return false;
  if (!validationContext && data.textStyles !== undefined && (!Array.isArray(data.textStyles) || data.textStyles.length > 2_000 || data.textStyles.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
    const style = value as Record<string, unknown>;
    return !isBoundedString(style.id, 240) || !isBoundedString(style.name, 1_000) || !isBoundedString(style.fontFamily, 240)
      || !isFiniteCanvasNumber(style.fontSize, 1, 100_000) || !isFiniteCanvasNumber(style.fontWeight, 1, 1_000)
      || !["normal", "italic"].includes(String(style.fontStyle)) || !["left", "center", "right"].includes(String(style.textAlign))
      || !isFiniteCanvasNumber(style.lineHeight, .1, 100) || !isFiniteCanvasNumber(style.letterSpacing);
  }) || new Set(data.textStyles.map((style) => (style as Record<string, unknown>).id)).size !== data.textStyles.length)) return false;
  if (!validationContext && data.effectStyles !== undefined && (!Array.isArray(data.effectStyles) || data.effectStyles.length > 2_000 || data.effectStyles.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
    const style = value as Record<string, unknown>;
    return !isBoundedString(style.id, 240) || !isBoundedString(style.name, 1_000)
      || style.shadow === undefined && style.shadows === undefined
      || style.shadow !== undefined && !isCanvasShadow(style.shadow)
      || style.shadows !== undefined && (!isCanvasShadows(style.shadows) || (style.shadows as unknown[]).length === 0);
  }) || new Set(data.effectStyles.map((style) => (style as Record<string, unknown>).id)).size !== data.effectStyles.length)) return false;
  const textStyleIds = validationContext?.textStyleIds ?? new Set((data.textStyles as Record<string, unknown>[] | undefined)?.map((style) => style.id as string) ?? []);
  const effectStyleIds = validationContext?.effectStyleIds ?? new Set((data.effectStyles as Record<string, unknown>[] | undefined)?.map((style) => style.id as string) ?? []);
  resolvedValidationContext.textStyleIds = textStyleIds;
  resolvedValidationContext.effectStyleIds = effectStyleIds;
  if (hasInvalidPrimitiveReference((element) => element.textStyleId !== undefined && !textStyleIds.has(element.textStyleId as string))) return false;
  if (hasInvalidPrimitiveReference((element) => element.effectStyleId !== undefined && !effectStyleIds.has(element.effectStyleId as string))) return false;
  if (data.tokenCollections !== undefined) {
    if (!validationContext && (!Array.isArray(data.tokenCollections) || data.tokenCollections.length > 100 || data.tokenCollections.some((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
      const collection = value as Record<string, unknown>;
      if (!isBoundedString(collection.id, 240) || !isBoundedString(collection.name, 1_000) || !Array.isArray(collection.modes) || !collection.modes.length || collection.modes.length > 32
        || collection.modes.some((mode) => !isBoundedString(mode, 240)) || new Set(collection.modes).size !== collection.modes.length || !collection.modes.includes(collection.activeMode)
        || !Array.isArray(collection.tokens) || collection.tokens.length > 2_000) return true;
      const modes = collection.modes as string[];
      return collection.tokens.some((tokenValue) => {
        if (typeof tokenValue !== "object" || tokenValue === null || Array.isArray(tokenValue)) return true;
        const token = tokenValue as Record<string, unknown>;
        if (!isBoundedString(token.id, 240) || !isBoundedString(token.name, 1_000) || !["color", "number"].includes(String(token.type)) || typeof token.values !== "object" || token.values === null || Array.isArray(token.values)) return true;
        const values = token.values as Record<string, unknown>;
        return modes.some((mode) => !(mode in values)) || Object.keys(values).some((mode) => !modes.includes(mode)) || Object.values(values).some((item) => token.type === "color" ? !isBoundedString(item, 80) : !isFiniteCanvasNumber(item));
      });
    }))) return false;
    const tokenIds = validationContext?.tokenIds ?? new Set((data.tokenCollections as Array<Record<string, unknown>>).flatMap((collection) => (collection.tokens as Array<Record<string, unknown>>).map((token) => token.id as string)));
    if (!validationContext && tokenIds.size !== (data.tokenCollections as Array<Record<string, unknown>>).reduce((count, collection) => count + (collection.tokens as unknown[]).length, 0)) return false;
    resolvedValidationContext.tokenIds = tokenIds;
    if (hasInvalidPrimitiveReference((node) => Boolean(node.tokenBindings) && Object.values(node.tokenBindings as Record<string, unknown>).some((tokenId) => !tokenIds.has(tokenId as string)))) return false;
  } else if (hasInvalidPrimitiveReference((node) => node.tokenBindings !== undefined)) return false;
  for (const element of overrideHolders) {
    if (element.type !== "component" || element.overrides === undefined) continue;
    const definition = resolvedValidationContext.componentsById.get(element.componentId as string)!;
    let sources = resolvedValidationContext.componentSourceMaps.get(definition.id);
    if (!sources) {
      sources = new Map(canvasComponentPrimitiveSources(definition, typedComponents).map(({ path, node }) => [path, node as unknown as Record<string, unknown>]));
      for (const [canonical, legacy] of canvasComponentLegacyOverridePaths(definition, typedComponents)) {
        const source = sources.get(canonical);
        if (source && !sources.has(legacy)) sources.set(legacy, source);
      }
      resolvedValidationContext.componentSourceMaps.set(definition.id, sources);
    }
    const overrides = element.overrides as Record<string, unknown>;
    let ambiguousLegacyPaths = resolvedValidationContext.ambiguousLegacyPaths.get(definition.id);
    if (!ambiguousLegacyPaths) {
      ambiguousLegacyPaths = canvasComponentAmbiguousLegacyOverridePaths(definition, typedComponents);
      resolvedValidationContext.ambiguousLegacyPaths.set(definition.id, ambiguousLegacyPaths);
    }
    for (const [raw, canonical] of ambiguousLegacyPaths) {
      if (raw in overrides && !(canonical in overrides)) return false;
    }
    for (const [nodeId, value] of Object.entries(overrides)) {
      const source = sources.get(nodeId);
      if (!source || typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const override = value as Record<string, unknown>;
      if (override.id !== undefined || override.type !== undefined || override.parentId !== undefined || !isCanvasElement({ ...source, ...override }, true)) return false;
    }
  }
  const frame = data.frame;
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) return false;
  const bounds = frame as Record<string, unknown>;
  if (!isFiniteCanvasNumber(bounds.width, 64) || !isFiniteCanvasNumber(bounds.height, 64)) return false;
  if (typeof data.appState !== "object" || data.appState === null || Array.isArray(data.appState)) return false;
  const appState = data.appState as Record<string, unknown>;
  if (!isBoundedString(appState.viewBackgroundColor, 80) || typeof appState.snapToGrid !== "boolean") return false;
  if (appState.viewport !== undefined) {
    if (typeof appState.viewport !== "object" || appState.viewport === null || Array.isArray(appState.viewport)) return false;
    const viewport = appState.viewport as Record<string, unknown>;
    if (!isFiniteCanvasNumber(viewport.x) || !isFiniteCanvasNumber(viewport.y) || !isFiniteCanvasNumber(viewport.zoom, .05, 16)) return false;
  }
  for (const key of ["rulersVisible", "guidesVisible", "guidesLocked"]) if (appState[key] !== undefined && typeof appState[key] !== "boolean") return false;
  if (appState.guides !== undefined && (!Array.isArray(appState.guides)
    || appState.guides.length > 2_000
    || appState.guides.some((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
      const guide = value as Record<string, unknown>;
      return !isBoundedString(guide.id, 240)
        || !["x", "y"].includes(String(guide.axis))
        || !isFiniteCanvasNumber(guide.position)
        || (guide.color !== undefined && !isBoundedString(guide.color, 80))
        || (guide.locked !== undefined && typeof guide.locked !== "boolean");
    })
    || new Set(appState.guides.map((guide) => (guide as Record<string, unknown>).id)).size !== appState.guides.length)) return false;
  if (typeof data.files !== "object" || data.files === null || Array.isArray(data.files)) return false;
  const files = Object.entries(data.files as Record<string, unknown>);
  if (files.length > 1_000 || files.some(([id, value]) => {
    if (!isBoundedString(id, 240) || typeof value !== "object" || value === null || Array.isArray(value)) return true;
    const file = value as Record<string, unknown>;
    return !isBoundedString(file.name, 1_000) || !isBoundedString(file.mimeType, 240) || !isBoundedString(file.data, 15 * 1024 * 1024);
  })) return false;
  if (data.pages !== undefined) {
    if (!Array.isArray(data.pages) || data.pages.length < 1 || data.pages.length > 500 || !isBoundedString(data.activePageId, 240)) return false;
    const pages = data.pages as Record<string, unknown>[];
    if (pages.some((page) => {
      if (typeof page !== "object" || page === null || Array.isArray(page) || !isBoundedString(page.id, 240) || !isBoundedString(page.name, 1_000)) return true;
      const pageFrame = page.frame as Record<string, unknown> | undefined;
      if (page.prototypeViewport !== undefined) {
        if (typeof page.prototypeViewport !== "object" || page.prototypeViewport === null || Array.isArray(page.prototypeViewport) || !pageFrame) return true;
        const viewport = page.prototypeViewport as Record<string, unknown>;
        if (!isFiniteCanvasNumber(viewport.width, 64, Number(pageFrame.width)) || !isFiniteCanvasNumber(viewport.height, 64, Number(pageFrame.height))
          || !["vertical", "horizontal", "both"].includes(String(viewport.direction)) || typeof viewport.preservePosition !== "boolean"
          || viewport.direction === "vertical" && viewport.width !== pageFrame.width
          || viewport.direction === "horizontal" && viewport.height !== pageFrame.height) return true;
      }
      return !isCanvasScene({ ...data, pages: undefined, activePageId: undefined, prototypeFlows: undefined, prototypeStartPageId: undefined, frame: page.frame, elements: page.elements, appState: page.appState }, false, resolvedValidationContext);
    })) return false;
    if (new Set(pages.map((page) => page.id)).size !== pages.length) return false;
    if (validatePrototypeDestinations) {
      const pageIds = new Set(pages.map((page) => page.id as string));
      if (data.prototypeStartPageId !== undefined && (!isBoundedString(data.prototypeStartPageId, 240) || !pageIds.has(data.prototypeStartPageId))) return false;
      if (data.prototypeFlows !== undefined) {
        if (!Array.isArray(data.prototypeFlows) || data.prototypeFlows.length < 1 || data.prototypeFlows.length > 64) return false;
        const flows = data.prototypeFlows as Array<Record<string, unknown>>;
        if (flows.some((flow) => !isBoundedString(flow.id, 240) || !isBoundedString(flow.name, 160) || !isBoundedString(flow.startPageId, 240) || !pageIds.has(flow.startPageId as string))) return false;
        if (new Set(flows.map((flow) => flow.id)).size !== flows.length) return false;
        if (data.prototypeStartPageId !== undefined && flows[0].startPageId !== data.prototypeStartPageId) return false;
      }
      const componentInteractionNodes = components.flatMap((component) => component.nodes as Array<Record<string, unknown>>);
      const destinations = [...pages.flatMap((page) => page.elements as Array<Record<string, unknown>>), ...componentInteractionNodes, ...componentOverrides].flatMap((element) => (element.interactions as Array<Record<string, unknown>> | undefined)?.flatMap((interaction) => ["navigate", "open-overlay", "toggle-overlay"].includes(String(interaction.action)) ? [interaction.destinationPageId as string] : []) ?? []);
      if (destinations.some((destination) => !pageIds.has(destination))) return false;
    }
    const activePage = pages.find((page) => page.id === data.activePageId);
    if (!activePage || JSON.stringify(activePage.frame) !== JSON.stringify(data.frame) || JSON.stringify(activePage.elements) !== JSON.stringify(data.elements) || JSON.stringify(activePage.appState) !== JSON.stringify(data.appState)) return false;
  } else if (data.activePageId !== undefined || data.prototypeFlows !== undefined || data.prototypeStartPageId !== undefined || validatePrototypeDestinations && [...elements, ...components.flatMap((component) => component.nodes as Array<Record<string, unknown>>), ...componentOverrides].some((element) => (element.interactions as Array<Record<string, unknown>> | undefined)?.some((interaction) => ["navigate", "open-overlay", "toggle-overlay"].includes(String(interaction.action))))) return false;
  if (validationContext) return true;
  try {
    return JSON.stringify(data).length <= 50 * 1024 * 1024;
  } catch {
    return false;
  }
}

function isLegacyConversation(value: unknown): value is LegacyConversation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return isConversation({ ...(value as Record<string, unknown>), projectId: "legacy", engineSessionKey: "legacy" });
}

function isLegacyArtifact(value: unknown): value is LegacyArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  return ["id", "html", "baselineHtml", "createdAt", "updatedAt"].every((key) => typeof artifact[key] === "string");
}

function titleFromHtml(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return title?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || "Untitled artifact";
}

function normalizeArtifact(value: unknown, projectId: string): Artifact | null {
  if (isArtifact(value)) return value.projectId === projectId ? value : null;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const artifact = value as Record<string, unknown>;
    const content = artifact.content;
    if (artifact.kind === "canvas" && typeof content === "object" && content !== null && !Array.isArray(content)) {
      const legacy = content as Record<string, unknown>;
      if (legacy.format === "excalidraw" && Array.isArray(legacy.elements) && legacy.elements.every((element) => isCanvasElement(element))) {
        const migrated = {
          ...artifact,
          content: {
            ...legacy,
            format: "khadim-canvas",
            sceneVersion: 1,
            frame: { width: 960, height: 600 },
            components: Array.isArray(legacy.components) ? legacy.components : [],
            appState: { viewBackgroundColor: "#ffffff", snapToGrid: true, ...(legacy.appState as object ?? {}) },
          },
        };
        if (isArtifact(migrated)) return migrated.projectId === projectId ? migrated : null;
      }
    }
  }
  if (!isLegacyArtifact(value)) return null;
  const hasAgentSource = Boolean(value.sourceRunId || value.sourceMessageId || value.sourceConversationId || value.status === "generated");
  return {
    id: value.id,
    projectId,
    title: value.title?.trim() || titleFromHtml(value.html),
    schemaVersion: 2,
    kind: "site",
    lifecycle: value.status === "generated" ? "ready" : "draft",
    content: { format: "html", html: value.html, baselineHtml: value.baselineHtml },
    provenance: {
      origin: hasAgentSource ? "agent" : "user",
      runId: value.sourceRunId,
      messageId: value.sourceMessageId,
      conversationId: value.sourceConversationId,
      conversationTitle: value.sourceConversationTitle,
    },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: value.deletedAt,
  };
}

export class ProjectStore implements ProjectDataRepository {
  readonly #dataDirectory: string;
  readonly #createId: () => string;
  readonly #now: () => string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string, options: ProjectStoreOptions = {}) {
    this.#dataDirectory = resolve(dataDirectory);
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async listProjects(): Promise<Project[]> {
    await this.#writeQueue;
    const index = await this.#readIndex();
    return [...index.projects].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  }

  async addProject(rootPathValue: string, nameValue?: string): Promise<Project> {
    const rootPath = await this.#validatedRootPath(rootPathValue);
    const name = nameValue?.trim() || basename(rootPath);
    if (!name || name.length > 160) throw new Error("Project name must be between 1 and 160 characters.");

    return this.#mutate(async (index) => {
      const existing = index.projects.find((project) => project.rootPath === rootPath);
      if (existing) return existing;
      const now = this.#now();
      const project: Project = {
        id: `project-${this.#createId()}`,
        name,
        rootPath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      index.projects.push(project);
      return project;
    });
  }

  async migrateLegacyWorkspace(rootPathValue: string): Promise<Project> {
    const project = await this.addProject(rootPathValue);
    const legacyConversations = await this.#readLegacyJson(join(this.#dataDirectory, "conversations.json"));
    if (Array.isArray(legacyConversations)) {
      for (const legacy of legacyConversations.filter(isLegacyConversation)) {
        const digest = createHash("sha256").update(`${project.id}\0${legacy.id}`).digest("hex").slice(0, 40);
        await this.saveConversation({ ...legacy, projectId: project.id, engineSessionKey: `electron.v1.${digest}` });
      }
    }

    const artifactStore = await this.#readLegacyJson(join(this.#dataDirectory, "artifact-drafts.json"));
    if (typeof artifactStore === "object" && artifactStore !== null && !Array.isArray(artifactStore)) {
      const workspaces = (artifactStore as { workspaces?: unknown }).workspaces;
      if (Array.isArray(workspaces)) {
        const imported: Artifact[] = [];
        for (const entry of workspaces) {
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
          const candidate = entry as { workspace?: unknown; drafts?: unknown };
          if (typeof candidate.workspace !== "string" || !Array.isArray(candidate.drafts)) continue;
          const candidatePath = await realpath(resolve(candidate.workspace)).catch(() => resolve(candidate.workspace as string));
          if (candidatePath !== project.rootPath) continue;
          imported.push(...candidate.drafts
            .filter(isLegacyArtifact)
            .map((artifact) => normalizeArtifact({ ...artifact, projectId: project.id }, project.id))
            .filter((artifact): artifact is Artifact => artifact !== null));
        }
        if (imported.length > 0) {
          const current = await this.listArtifacts(project.id);
          const importedIds = new Set(imported.map((artifact) => artifact.id));
          await this.saveArtifacts(project.id, [...current.filter((artifact) => !importedIds.has(artifact.id)), ...imported]);
        }
      }
    }
    return project;
  }

  async openProject(projectId: string): Promise<Project> {
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      project.lastOpenedAt = this.#now();
      return { ...project };
    });
  }

  async getProject(projectId: string): Promise<Project> {
    await this.#writeQueue;
    return { ...await this.#requireProject(projectId) };
  }

  async renameProject(projectId: string, nameValue: string): Promise<Project> {
    const name = validatedProjectName(nameValue);
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      project.name = name;
      project.updatedAt = this.#now();
      return { ...project };
    });
  }

  async relocateProject(projectId: string, rootPathValue: string, nameValue?: string): Promise<Project> {
    const rootPath = await this.#validatedRootPath(rootPathValue);
    const name = nameValue === undefined ? undefined : validatedProjectName(nameValue);
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      const existingOwner = index.projects.find((candidate) => candidate.id !== projectId && candidate.rootPath === rootPath);
      if (existingOwner) throw new Error("This local folder already belongs to another project.");
      project.rootPath = rootPath;
      if (name !== undefined) project.name = name;
      project.updatedAt = this.#now();
      return { ...project };
    });
  }

  async removeProject(projectId: string): Promise<Project> {
    return this.#mutate((index) => {
      const projectIndex = index.projects.findIndex((candidate) => candidate.id === projectId);
      if (projectIndex === -1) throw new Error("The project no longer exists.");
      const [removedProject] = index.projects.splice(projectIndex, 1);
      return { ...removedProject };
    });
  }

  async checkProjectAvailability(projectId: string): Promise<ProjectAvailability> {
    await this.#writeQueue;
    const project = { ...await this.#requireProject(projectId) };
    let information;
    try {
      information = await stat(project.rootPath);
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return { project, available: false, reason: "missing" };
      }
      throw cause;
    }
    return information.isDirectory()
      ? { project, available: true }
      : { project, available: false, reason: "not-directory" };
  }

  async flush(): Promise<void> {
    await this.#writeQueue;
  }

  async listConversations(projectId: string): Promise<Conversation[]> {
    await this.#writeQueue;
    const project = await this.#requireProject(projectId);
    const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
    return conversations
      .filter((conversation) => conversation.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    if (!isConversation(conversation)) throw new Error("The chat is invalid.");
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === conversation.projectId);
      if (!project) throw new Error("The chat's project no longer exists.");
      const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
      const next = [conversation, ...conversations.filter((item) => item.id !== conversation.id)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await this.#writeJson(this.#conversationsPath(project), next);
      if (conversation.updatedAt > project.updatedAt) project.updatedAt = conversation.updatedAt;
      await this.#writeIndex(index);
    });
  }

  async removeConversation(projectId: string, conversationId: string): Promise<void> {
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The chat's project no longer exists.");
      const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
      const rawArtifacts = await this.#readRawCollection(this.#artifactsPath(project), "artifact library");
      let artifactReferencesChanged = false;
      const artifacts = rawArtifacts.map((value) => {
        const artifact = normalizeArtifact(value, project.id);
        if (!artifact) throw new Error("The local artifact library is invalid.");
        if (artifact.provenance?.conversationId !== conversationId) return artifact;
        artifactReferencesChanged = true;
        const provenance = { ...artifact.provenance };
        delete provenance.runId;
        delete provenance.conversationId;
        delete provenance.messageId;
        return { ...artifact, provenance };
      });
      if (artifactReferencesChanged) await this.#writeJson(this.#artifactsPath(project), artifacts);
      await this.#writeJson(this.#conversationsPath(project), conversations.filter((item) => item.id !== conversationId));
      project.updatedAt = this.#now();
      await this.#writeIndex(index);
    });
  }

  async listArtifacts(projectId: string): Promise<Artifact[]> {
    await this.#writeQueue;
    const project = await this.#requireProject(projectId);
    const rawArtifacts = await this.#readRawCollection(this.#artifactsPath(project), "artifact library");
    const artifacts = rawArtifacts.map((artifact) => normalizeArtifact(artifact, project.id));
    if (artifacts.some((artifact) => artifact === null)) throw new Error("The local artifact library is invalid.");
    return artifacts
      .filter((artifact): artifact is Artifact => artifact !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveArtifacts(projectId: string, artifacts: Artifact[]): Promise<void> {
    const activeArtifactCount = artifacts.filter((artifact) => !artifact.deletedAt).length;
    if (artifacts.length > 5_000 || activeArtifactCount > 250 || !artifacts.every(isArtifact) || artifacts.some((artifact) => artifact.projectId !== projectId)) {
      throw new Error("The artifact library is invalid.");
    }
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
      throw new Error("Artifact IDs must be unique within a project.");
    }
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The artifact's project no longer exists.");
      const next = [...artifacts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await this.#writeJson(this.#artifactsPath(project), next);
      const newestUpdate = next[0]?.updatedAt ?? this.#now();
      if (newestUpdate > project.updatedAt) project.updatedAt = newestUpdate;
      await this.#writeIndex(index);
    });
  }

  async #validatedRootPath(value: string): Promise<string> {
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
      throw new Error("Choose a valid local project folder.");
    }
    const candidate = resolve(value.trim());
    const information = await stat(candidate).catch(() => null);
    if (!information?.isDirectory()) throw new Error("Choose an existing local project folder.");
    return realpath(candidate);
  }

  #indexPath(): string {
    return join(this.#dataDirectory, "projects.json");
  }

  #conversationsPath(project: Project): string {
    return join(this.#dataDirectory, "projects", project.id, "conversations.json");
  }

  #artifactsPath(project: Project): string {
    return join(this.#dataDirectory, "projects", project.id, "artifacts.json");
  }

  async #requireProject(projectId: string): Promise<Project> {
    const index = await this.#readIndex();
    const project = index.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error("The project no longer exists.");
    return project;
  }

  async #readCollection<T>(path: string, validate: (value: unknown) => value is T, label: string): Promise<T[]> {
    const parsed = await this.#readRawCollection(path, label);
    if (!parsed.every(validate)) throw new Error(`The local ${label} is invalid.`);
    return parsed;
  }

  async #readRawCollection(path: string, label: string): Promise<unknown[]> {
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw cause;
    }
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`The local ${label} is invalid.`);
    return parsed;
  }

  async #readLegacyJson(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch {
      return null;
    }
  }

  async #readIndex(): Promise<StoredProjectIndex> {
    let content: string;
    try {
      content = await readFile(this.#indexPath(), "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: projectIndexVersion, projects: [] };
      }
      throw cause;
    }
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("The local project index is invalid.");
    }
    const candidate = parsed as Partial<StoredProjectIndex>;
    if (candidate.version !== projectIndexVersion || !Array.isArray(candidate.projects) || !candidate.projects.every(isProject)) {
      throw new Error("The local project index uses an unsupported format.");
    }
    if (new Set(candidate.projects.map((project) => project.id)).size !== candidate.projects.length
      || new Set(candidate.projects.map((project) => project.rootPath)).size !== candidate.projects.length) {
      throw new Error("The local project index contains duplicate project identities.");
    }
    return { version: projectIndexVersion, projects: candidate.projects };
  }

  async #writeIndex(index: StoredProjectIndex): Promise<void> {
    await this.#writeJson(this.#indexPath(), index);
  }

  async #writeJson(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
      await rename(temporaryPath, path);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  #mutate<T>(operation: (index: StoredProjectIndex) => Promise<T> | T): Promise<T> {
    let result: T;
    const mutation = this.#enqueue(async () => {
      const index = await this.#readIndex();
      result = await operation(index);
      await this.#writeIndex(index);
    });
    return mutation.then(() => result!);
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const mutation = this.#writeQueue.then(operation, operation);
    this.#writeQueue = mutation.catch(() => undefined);
    return mutation;
  }
}
