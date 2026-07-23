import type { Artifact, CanvasArtifactContent, CanvasComponentDefinition, CanvasComponentElement, CanvasElement, CanvasPrimitiveElement, HtmlDocumentArtifactContent } from "./types";
import { canvasImportedPathTransform, canvasPathAbsolutePoints, canvasPathData, canvasRoundedRectPath, resolveCanvasConnectors } from "./canvas-geometry";
import { booleanCanvasNodes, canBooleanNode } from "./vector-boolean";
import { canvasElementFills, canvasElementIsClosed, canvasElementStrokes, canvasElementStrokeOutset, canvasGradientVector, canvasStrokeDashArray } from "./canvas-paint";
import { canvasElementShadows, canvasShadowFilterDefinition, canvasShadowFilterId } from "./canvas-effects";
import { CANVAS_COMPONENT_MAX_DEPTH, CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES, canvasComponentLegacyOverridePaths, canvasComponentOverrideAtPath, canvasComponentPath, canvasComponentPrimitiveSources } from "./canvas-components";

const inertPolicy = "default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function shell(title: string, body: string, styles = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${inertPolicy}"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${body}</body></html>`;
}

function inertSite(html: string): string {
  const sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "$1=\"#\"");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${inertPolicy}">`;
  if (/<head\b[^>]*>/i.test(sanitized)) return sanitized.replace(/<head\b[^>]*>/i, (head) => `${head}${meta}`);
  return `${meta}${sanitized}`;
}

function pageRule(content: HtmlDocumentArtifactContent): string {
  const margin = Number.isFinite(content.page.margin)
    ? Math.min(80, Math.max(0, content.page.margin))
    : 24;
  return `@page { size: ${content.page.size} ${content.page.orientation}; margin: ${margin}mm; }`;
}

/**
 * Produce the inert, paginated representation shared by document preview and
 * Electron's print pipeline. The final style is deliberately appended after
 * authored styles so the explicit Studio page settings win in print.
 */
export function renderHtmlDocument(content: HtmlDocumentArtifactContent): string {
  const pageStyle = `<style data-khadim-page>${pageRule(content)}</style>`;
  const paginated = /<\/head\s*>/i.test(content.html)
    ? content.html.replace(/<\/head\s*>/i, `${pageStyle}</head>`)
    : `${pageStyle}${content.html}`;
  return inertSite(paginated);
}

interface RichNode {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  marks?: Array<{ type?: unknown }>;
}

function renderRichNode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as RichNode;
  if (typeof node.text === "string") {
    let text = escapeHtml(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      if (mark.type === "italic") text = `<em>${text}</em>`;
      if (mark.type === "code") text = `<code>${text}</code>`;
    }
    return text;
  }
  const children = Array.isArray(node.content) ? node.content.map(renderRichNode).join("") : "";
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return `<h${level}>${children}</h${level}>`;
  }
  if (node.type === "paragraph") return `<p>${children || "&nbsp;"}</p>`;
  if (node.type === "bulletList") return `<ul>${children}</ul>`;
  if (node.type === "orderedList") return `<ol>${children}</ol>`;
  if (node.type === "listItem") return `<li>${children}</li>`;
  if (node.type === "blockquote") return `<blockquote>${children}</blockquote>`;
  if (node.type === "hardBreak") return "<br>";
  return children;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#6652d9";
}

function opacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

const svgIdPart = (value: string): string => `${value.length}x${Array.from(value, (character) => character.codePointAt(0)!.toString(16)).join("-")}`;
const componentSvgId = (kind: string, rootId: string, path: string): string => `canvas-component-${kind}-${svgIdPart(rootId)}-${svgIdPart(path)}`;

function wrapCanvasText(text: string, width: number, fontSize: number): string[] {
  const maximum = Math.max(1, Math.floor(width / Math.max(1, fontSize * .56)));
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if (`${line} ${word}`.length <= maximum) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
    return lines;
  });
}

function appearanceStyle(node: Pick<CanvasElement, "blendMode" | "layerBlur" | "backgroundBlur">, scale = 1, liveEffects = false, shadowFilterId?: string, legacyShadowOrder = false): string {
  const filters = [];
  if (!legacyShadowOrder && shadowFilterId) filters.push(`url(#${shadowFilterId})`);
  if (node.layerBlur?.visible && node.layerBlur.value > 0) filters.push(`blur(${finite(node.layerBlur.value, 0) * scale}px)`);
  if (legacyShadowOrder && shadowFilterId) filters.push(`url(#${shadowFilterId})`);
  const declarations = [
    filters.length ? `filter:${filters.join(" ")}` : "",
    node.blendMode && node.blendMode !== "normal" ? `mix-blend-mode:${node.blendMode}` : "",
    liveEffects && node.backgroundBlur?.visible && node.backgroundBlur.value > 0 ? `backdrop-filter:blur(${finite(node.backgroundBlur.value, 0) * scale}px)` : "",
  ].filter(Boolean);
  return declarations.length ? ` style="${declarations.join(";")}"` : "";
}

function roundedRectShape(node: CanvasPrimitiveElement, x: number, y: number, width: number, height: number, scale: number): { tag: "rect" | "path"; geometry: string } {
  if (node.cornerRadii) return { tag: "path", geometry: `d="${canvasRoundedRectPath(x, y, width, height, node.cornerRadii, scale)}"` };
  return { tag: "rect", geometry: `x="${x}" y="${y}" width="${width}" height="${height}" rx="${finite(node.radius, node.type === "frame" ? 4 : 8) * scale}"` };
}

function paintGradientDefinition(node: CanvasPrimitiveElement, fill: NonNullable<CanvasPrimitiveElement["fills"]>[number], id: string): string {
  if (!fill.gradient) return "";
  const stops = fill.gradient.stops.map((stop) => `<stop offset="${Math.min(1, Math.max(0, stop.offset)) * 100}%" stop-color="${safeColor(stop.color)}" stop-opacity="${opacity(stop.opacity)}"/>`).join("");
  if (fill.gradient.type === "radial") return `<radialGradient id="${escapeHtml(id)}" cx="${fill.gradient.centerX}" cy="${fill.gradient.centerY}" r="${fill.gradient.radius}">${stops}</radialGradient>`;
  const vector = canvasGradientVector(fill.gradient.angle);
  return `<linearGradient id="${escapeHtml(id)}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">${stops}</linearGradient>`;
}

function rotationWrapper(content: string, rotation: number, x: number, y: number, width: number, height: number): string {
  return rotation ? `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">${content}</g>` : content;
}

function renderCanvasPaintStack(node: CanvasPrimitiveElement, x: number, y: number, width: number, height: number, scaleX: number, scaleY: number, parentOpacity: number, gradientId: string, liveEffects: boolean): string {
  const scale = Math.min(scaleX, scaleY);
  const fills = canvasElementFills(node).filter((fill) => fill.visible);
  const strokes = canvasElementStrokes(node).filter((stroke) => stroke.visible && stroke.width > 0);
  const closed = canvasElementIsClosed(node);
  const idBase = gradientId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const clipId = `canvas-paint-inside-${idBase}`;
  const maskId = `canvas-paint-outside-${idBase}`;
  const shape = (attrs: string): string => {
    if (node.type === "ellipse") return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${attrs}/>`;
    if (node.type === "line") return `<line x1="${node.lineFlip ? x + width : x}" y1="${y}" x2="${node.lineFlip ? x : x + width}" y2="${y + height}" ${attrs}/>`;
    if (node.type === "path" || node.type === "arrow") {
      const pathNode = { ...node, x, y, width, height };
      const importedTransform = node.type === "path" && node.svgPathData ? canvasImportedPathTransform(pathNode) : undefined;
      const data = node.type === "path" && node.svgPathData ? node.svgPathData : canvasPathData(canvasPathAbsolutePoints(pathNode), finite(node.pathSmoothing, 0), Boolean(node.pathClosed));
      return `<path d="${escapeHtml(data)}"${importedTransform ? ` transform="${escapeHtml(importedTransform)}"` : ""} fill-rule="${node.fillRule ?? "nonzero"}" ${attrs}/>`;
    }
    const rounded = roundedRectShape(node.type === "image" ? { ...node, radius: node.radius ?? 0 } : node, x, y, width, height, scale);
    return `<${rounded.tag} ${rounded.geometry} ${attrs}/>`;
  };
  const text = (attrs: string): string => {
    const fontSize = finite(node.fontSize, 26) * scale;
    const lineHeight = fontSize * finite(node.lineHeight, 1.2);
    const textX = node.textAlign === "center" ? x + width / 2 : node.textAlign === "right" ? x + width : x;
    const anchor = node.textAlign === "center" ? "middle" : node.textAlign === "right" ? "end" : "start";
    const spans = wrapCanvasText(node.text ?? "", width, fontSize).map((line, index) => `<tspan x="${textX}" dy="${index ? lineHeight : 0}">${escapeHtml(line || "\u00a0")}</tspan>`).join("");
    return `<text x="${textX}" y="${y + fontSize}" font-family="${escapeHtml(node.fontFamily ?? "Atkinson Hyperlegible Next")}" font-size="${fontSize}" font-weight="${finite(node.fontWeight, 620)}" font-style="${node.fontStyle ?? "normal"}" letter-spacing="${finite(node.letterSpacing, 0)}" text-anchor="${anchor}" ${attrs}>${spans}</text>`;
  };
  const paintShape = (attrs: string): string => node.type === "text" ? text(attrs) : shape(attrs);
  const fillLayers = closed || node.type === "text" ? fills.map((fill, index) => {
    const fillId = `${idBase}-fill-${index}-${fill.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const value = fill.gradient ? `url(#${escapeHtml(fillId)})` : safeColor(fill.color);
    return paintShape(`fill="${value}" fill-opacity="${opacity(fill.opacity)}" stroke="none"`);
  }).join("") : "";
  const strokeLayers = strokes.map((stroke) => {
    const alignment = closed ? stroke.alignment : "center";
    const strokeWidth = stroke.width * scale * (alignment === "center" ? 1 : 2);
    const dash = canvasStrokeDashArray(stroke);
    const attrs = `fill="none" stroke="${safeColor(stroke.color)}" stroke-opacity="${opacity(stroke.opacity)}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="${stroke.style === "dotted" ? "round" : node.startCap === "round" || node.endCap === "round" ? "round" : "butt"}" stroke-linejoin="round"${node.startCap === "arrow" ? ' marker-start="url(#canvas-arrowhead)"' : ""}${node.type === "arrow" || node.endCap === "arrow" ? ' marker-end="url(#canvas-arrowhead)"' : ""}`;
    const rendered = paintShape(attrs);
    if (alignment === "inside") return `<g clip-path="url(#${clipId})">${rendered}</g>`;
    if (alignment === "outside") return `<g mask="url(#${maskId})">${rendered}</g>`;
    return rendered;
  }).join("");
  const definitions = fills.map((fill, index) => paintGradientDefinition(node, fill, `${idBase}-fill-${index}-${fill.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`)).join("");
  const needsInside = closed && strokes.some((stroke) => stroke.alignment === "inside");
  const needsOutside = closed && strokes.some((stroke) => stroke.alignment === "outside");
  const maximumStroke = Math.max(0, ...strokes.map((stroke) => stroke.width * scale * 2));
  const clipping = `${needsInside ? `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${shape('fill="#ffffff" stroke="none"')}</clipPath>` : ""}${needsOutside ? `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${x - maximumStroke}" y="${y - maximumStroke}" width="${width + maximumStroke * 2}" height="${height + maximumStroke * 2}"><rect x="${x - maximumStroke}" y="${y - maximumStroke}" width="${width + maximumStroke * 2}" height="${height + maximumStroke * 2}" fill="#ffffff"/>${shape('fill="#000000" stroke="none"')}</mask>` : ""}`;
  const shadowId = canvasElementShadows(node).some((shadow) => shadow.visible) ? canvasShadowFilterId(gradientId) : undefined;
  const shadowDefinition = shadowId ? canvasShadowFilterDefinition(node, shadowId, scale, { x, y, width, height }, canvasElementStrokeOutset(node) * scale) : "";
  const outerAppearance = appearanceStyle({ blendMode: node.blendMode, layerBlur: node.layerBlur }, scale, false, shadowId, node.shadows === undefined && Boolean(node.shadow));
  const backgroundAppearance = appearanceStyle({ backgroundBlur: node.backgroundBlur }, scale, liveEffects);
  const backgroundLayer = backgroundAppearance && closed ? shape(`fill="#00000000" stroke="none"${backgroundAppearance}`) : "";
  const imageLayer = node.type === "image" ? `<image href="${escapeHtml(node.src ?? "")}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>` : "";
  const imageClip = node.type === "image" && (node.cornerRadii || node.radius) ? `<clipPath id="canvas-paint-image-${idBase}" clipPathUnits="userSpaceOnUse">${shape('fill="#ffffff" stroke="none"')}</clipPath>` : "";
  const painted = node.type === "image" && imageClip ? `<g clip-path="url(#canvas-paint-image-${idBase})">${backgroundLayer}${imageLayer}</g>${strokeLayers}` : `${backgroundLayer}${imageLayer}${fillLayers}${strokeLayers}`;
  return `${definitions || clipping || imageClip || shadowDefinition ? `<defs>${definitions}${clipping}${imageClip}${shadowDefinition}</defs>` : ""}<g opacity="${opacity(node.opacity) * parentOpacity}"${outerAppearance}>${painted}</g>`;
}

function renderCanvasPrimitive(value: CanvasPrimitiveElement, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, override?: Partial<CanvasPrimitiveElement>, parentOpacity = 1, gradientId = `canvas-gradient-${value.id}`, liveEffects = false): string {
  const node = { ...value, ...override };
  if (node.hidden) return "";
  const x = offsetX + finite(node.x, 0) * scaleX;
  const y = offsetY + finite(node.y, 0) * scaleY;
  const width = finite(node.width, 120) * scaleX;
  const height = finite(node.height, 80) * scaleY;
  const color = node.fillGradient ? `url(#${escapeHtml(gradientId)})` : safeColor(node.color);
  const alpha = opacity(node.opacity) * parentOpacity;
  const stroke = node.strokeWidth ? safeColor(node.strokeColor ?? "#17181c") : "none";
  const strokeWidth = finite(node.strokeWidth, 0) * Math.min(scaleX, scaleY);
  const dash = finite(node.strokeDash, 0) > 0 ? ` stroke-dasharray="${finite(node.strokeDash, 0)}"` : "";
  const scale = Math.min(scaleX, scaleY);
  const shadowId = canvasElementShadows(node).some((shadow) => shadow.visible) ? canvasShadowFilterId(gradientId) : undefined;
  const shadowDefinition = shadowId ? canvasShadowFilterDefinition(node, shadowId, scale, { x, y, width, height }, canvasElementStrokeOutset(node) * scale) : "";
  const appearance = appearanceStyle(node, scale, liveEffects, shadowId, node.shadows === undefined && Boolean(node.shadow));
  let content = "";
  if (node.fills !== undefined || node.strokes !== undefined) {
    content = renderCanvasPaintStack(node, x, y, width, height, scaleX, scaleY, parentOpacity, gradientId, liveEffects);
    return rotationWrapper(content, finite(node.rotation, 0), x, y, width, height);
  }
  if (node.type === "text") {
    const fontSize = finite(node.fontSize, 26) * Math.min(scaleX, scaleY);
    const lineHeight = fontSize * finite(node.lineHeight, 1.2);
    const lines = wrapCanvasText(node.text ?? "", width, fontSize);
    const textX = node.textAlign === "center" ? x + width / 2 : node.textAlign === "right" ? x + width : x;
    const anchor = node.textAlign === "center" ? "middle" : node.textAlign === "right" ? "end" : "start";
    const spans = lines.map((line, index) => `<tspan x="${textX}" dy="${index ? lineHeight : 0}">${escapeHtml(line || "\u00a0")}</tspan>`).join("");
    content = `<text x="${textX}" y="${y + fontSize}" fill="${color}" font-family="${escapeHtml(node.fontFamily ?? "Atkinson Hyperlegible Next")}" font-size="${fontSize}" font-weight="${finite(node.fontWeight, 620)}" font-style="${node.fontStyle ?? "normal"}" letter-spacing="${finite(node.letterSpacing, 0)}" text-anchor="${anchor}" opacity="${alpha}"${appearance}>${spans}</text>`;
  } else if (node.type === "ellipse") content = `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} opacity="${alpha}"${appearance}/>`;
  else if (node.type === "line") content = `<line x1="${node.lineFlip ? x + width : x}" y1="${y}" x2="${node.lineFlip ? x : x + width}" y2="${y + height}" stroke="${safeColor(node.strokeColor ?? node.color)}" stroke-width="${Math.max(1, strokeWidth || 2)}" stroke-linecap="round"${dash} opacity="${alpha}"${appearance}/>`;
  else if (node.type === "path" || node.type === "arrow") {
    const pathNode = { ...node, x, y, width, height };
    const importedTransform = node.type === "path" && node.svgPathData ? canvasImportedPathTransform(pathNode) : undefined;
    const data = node.type === "path" && node.svgPathData ? node.svgPathData : canvasPathData(canvasPathAbsolutePoints(pathNode), finite(node.pathSmoothing, 0), Boolean(node.pathClosed));
    const startMarker = node.startCap === "arrow" ? ' marker-start="url(#canvas-arrowhead)"' : "";
    const endMarker = node.type === "arrow" || node.endCap === "arrow" ? ' marker-end="url(#canvas-arrowhead)"' : "";
    content = `<path d="${escapeHtml(data)}"${importedTransform ? ` transform="${escapeHtml(importedTransform)}"` : ""} fill="${node.pathClosed ? color : "none"}" fill-rule="${node.fillRule ?? "nonzero"}" stroke="${node.strokeWidth ? safeColor(node.strokeColor ?? node.color) : "none"}" stroke-width="${strokeWidth}" stroke-linecap="${node.startCap === "round" || node.endCap === "round" ? "round" : "butt"}" stroke-linejoin="round"${startMarker}${endMarker}${dash} opacity="${alpha}"${appearance}/>`;
  }
  else if (node.type === "image") {
    const hasRadius = Boolean(node.cornerRadii || node.radius);
    const clipId = `canvas-radius-clip-${gradientId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const shape = roundedRectShape(node, x, y, width, height, Math.min(scaleX, scaleY));
    const clip = hasRadius ? `<defs><clipPath id="${escapeHtml(clipId)}" clipPathUnits="userSpaceOnUse"><${shape.tag} ${shape.geometry}/></clipPath></defs>` : "";
    const image = `<image href="${escapeHtml(node.src ?? "")}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${alpha}"/>`;
    const backgroundAppearance = appearanceStyle({ backgroundBlur: node.backgroundBlur }, Math.min(scaleX, scaleY), liveEffects);
    const clipped = hasRadius || backgroundAppearance ? `<g${hasRadius ? ` clip-path="url(#${escapeHtml(clipId)})"` : ""}${backgroundAppearance}>${image}</g>` : image;
    const outerAppearance = appearanceStyle({ blendMode: node.blendMode, layerBlur: node.layerBlur }, scale, false, shadowId, node.shadows === undefined && Boolean(node.shadow));
    content = `${clip}${shadowDefinition ? `<defs>${shadowDefinition}</defs>` : ""}${outerAppearance ? `<g${outerAppearance}>${clipped}</g>` : clipped}`;
  } else {
    const shape = roundedRectShape(node, x, y, width, height, Math.min(scaleX, scaleY));
    content = `<${shape.tag} ${shape.geometry} fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} opacity="${alpha}"${appearance}/>`;
  }
  if (shadowDefinition && node.type !== "image") content = `<defs>${shadowDefinition}</defs>${content}`;
  return rotationWrapper(content, finite(node.rotation, 0), x, y, width, height);
}

interface CanvasRenderIndex {
  nodesById: Map<string, CanvasElement>;
  ancestorStateById: Map<string, CanvasRenderAncestorState>;
  maskSourceIds: Set<string>;
  booleanChildrenByParent: Map<string, CanvasPrimitiveElement[]>;
  componentsById: Map<string, CanvasComponentDefinition>;
  componentDefinitions: CanvasComponentDefinition[];
  componentBudget: { remaining: number };
}

interface CanvasRenderAncestorState {
  hidden: boolean;
  clipIds: string[];
}

function canvasRenderAncestorStates(elements: CanvasElement[]): Map<string, CanvasRenderAncestorState> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const stateById = new Map<string, CanvasRenderAncestorState>();
  for (const element of elements) {
    if (stateById.has(element.id)) continue;
    const path: CanvasElement[] = [];
    const visited = new Set<string>();
    let current: CanvasElement | undefined = element;
    while (current && !stateById.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    let inherited = current ? stateById.get(current.id)! : { hidden: false, clipIds: [] };
    for (let pathIndex = path.length - 1; pathIndex >= 0; pathIndex -= 1) {
      const node = path[pathIndex];
      inherited = {
        hidden: inherited.hidden || Boolean(node.hidden),
        clipIds: node.type === "frame" && node.clipContent ? [...inherited.clipIds, node.id] : inherited.clipIds,
      };
      stateById.set(node.id, inherited);
    }
  }
  return stateById;
}

function renderCanvasComponentContents(
  instance: CanvasComponentElement,
  rootInstanceId: string,
  definition: CanvasComponentDefinition,
  index: CanvasRenderIndex,
  offsetX: number,
  offsetY: number,
  prefix: string,
  scopes: Array<{ prefix: string; overrides?: CanvasComponentElement["overrides"] }>,
  ancestors: Set<string>,
  depth: number,
  liveEffects: boolean,
  budget: { remaining: number },
): string {
  if (depth > CANVAS_COMPONENT_MAX_DEPTH || ancestors.has(definition.id) || budget.remaining <= 0) return "";
  const nextAncestors = new Set(ancestors).add(definition.id);
  const scaleX = finite(instance.width, definition.width) / Math.max(1, finite(definition.width, 1));
  const scaleY = finite(instance.height, definition.height) / Math.max(1, finite(definition.height, 1));
  const legacyPaths = canvasComponentLegacyOverridePaths(definition, index.componentDefinitions);
  const effectiveNode = (child: CanvasElement): CanvasElement => child.type === "component" ? child : { ...child, ...canvasComponentOverrideAtPath(canvasComponentPath(prefix, child.id), scopes, prefix, legacyPaths.get(canvasComponentPath("", child.id))) };
  const ancestorStates = canvasRenderAncestorStates(definition.nodes.map(effectiveNode));
  const clipId = (frameId: string): string => componentSvgId("clip", rootInstanceId, canvasComponentPath(prefix, frameId));
  const maskId = (sourceId: string): string => componentSvgId("mask", rootInstanceId, canvasComponentPath(prefix, sourceId));
  const internalMaskSourceIds = new Set(definition.nodes.flatMap((child) => {
    const effective = effectiveNode(child);
    return effective.type !== "component" && effective.maskId ? [effective.maskId] : [];
  }));
  const clips = definition.nodes.filter((child): child is CanvasPrimitiveElement => child.type === "frame" && Boolean(child.clipContent)).map((frame) => {
    const effective = effectiveNode(frame) as CanvasPrimitiveElement;
    const x = offsetX + effective.x * scaleX;
    const y = offsetY + effective.y * scaleY;
    const width = effective.width * scaleX;
    const height = effective.height * scaleY;
    const shape = roundedRectShape({ ...effective, radius: effective.radius ?? 0 }, x, y, width, height, Math.min(scaleX, scaleY));
    return `<clipPath id="${clipId(frame.id)}" clipPathUnits="userSpaceOnUse"><${shape.tag} ${shape.geometry}${effective.rotation ? ` transform="rotate(${effective.rotation} ${x + width / 2} ${y + height / 2})"` : ""}/></clipPath>`;
  }).join("");
  const masks = definition.nodes.filter((child): child is CanvasPrimitiveElement => child.type !== "component" && internalMaskSourceIds.has(child.id)).map((source) => {
    const effective = effectiveNode(source) as CanvasPrimitiveElement;
    return `<clipPath id="${maskId(source.id)}" clipPathUnits="userSpaceOnUse">${renderCanvasPrimitive({ ...effective, opacity: 1, shadow: undefined, shadows: [], strokeWidth: 0, fills: [{ id: `mask-fill-${source.id}`, visible: true, opacity: 1, color: "#ffffff" }], strokes: [] }, offsetX, offsetY, scaleX, scaleY, undefined, 1, componentSvgId("mask-gradient", rootInstanceId, canvasComponentPath(prefix, source.id)), liveEffects)}</clipPath>`;
  }).join("");
  const children = definition.nodes.map((child) => {
    if (budget.remaining-- <= 0) return "";
    if (internalMaskSourceIds.has(child.id)) return "";
    const state = child.parentId ? ancestorStates.get(child.parentId) : undefined;
    if (state?.hidden) return "";
    const path = canvasComponentPath(prefix, child.id);
    let rendered: string;
    if (child.type === "component") {
      const nested = index.componentsById.get(child.componentId);
      if (!nested || child.hidden) return "";
      const x = offsetX + child.x * scaleX;
      const y = offsetY + child.y * scaleY;
      const width = child.width * scaleX;
      const height = child.height * scaleY;
      const nestedInstance = { ...child, x, y, width, height };
      const contents = renderCanvasComponentContents(nestedInstance, rootInstanceId, nested, index, x, y, path, [...scopes, { prefix: path, overrides: child.overrides }], nextAncestors, depth + 1, liveEffects, budget);
      rendered = rotationWrapper(`<g opacity="${opacity(child.opacity)}"${appearanceStyle(child, Math.min(scaleX, scaleY), liveEffects)}>${contents}</g>`, finite(child.rotation, 0), x, y, width, height);
    } else {
      const effective = effectiveNode(child) as CanvasPrimitiveElement;
      rendered = renderCanvasPrimitive(effective, offsetX, offsetY, scaleX, scaleY, undefined, 1, componentSvgId("gradient", rootInstanceId, path), liveEffects);
      if (effective.maskId) rendered = `<g clip-path="url(#${maskId(effective.maskId)})">${rendered}</g>`;
    }
    return (state?.clipIds ?? []).reduce((nested, frameId) => `<g clip-path="url(#${clipId(frameId)})">${nested}</g>`, rendered);
  }).join("");
  return `${clips || masks ? `<defs>${clips}${masks}</defs>` : ""}${children}`;
}

function renderCanvasNode(node: CanvasElement, index: CanvasRenderIndex, explicitIds?: Set<string>, liveEffects = false): string {
  if (node.parentId && index.nodesById.get(node.parentId)?.type === "boolean" && (!explicitIds?.has(node.id) || explicitIds.has(node.parentId))) return "";
  const ancestorState = node.parentId ? index.ancestorStateById.get(node.parentId) : undefined;
  if (ancestorState?.hidden) return "";
  const clipAncestorIds = ancestorState?.clipIds ?? [];
  if (node.hidden || index.maskSourceIds.has(node.id)) return "";
  const wrapAncestorClips = (rendered: string): string => clipAncestorIds.reduce((nested, frameId) => `<g clip-path="url(#canvas-clip-${escapeHtml(frameId)})">${nested}</g>`, rendered);
  const wrapMask = (rendered: string): string => node.type !== "component" && node.maskId ? `<g clip-path="url(#canvas-mask-${escapeHtml(node.maskId)})">${rendered}</g>` : rendered;
  if (node.type !== "component") {
    const renderedNode = node.type === "boolean" ? (() => {
      const children = index.booleanChildrenByParent.get(node.id) ?? [];
      const result = node.booleanOperation ? booleanCanvasNodes(children, node.booleanOperation) : null;
      return result ? { ...result, id: node.id, name: node.name, color: node.color, fillGradient: node.fillGradient, fills: node.fills, opacity: node.opacity, blendMode: node.blendMode, layerBlur: node.layerBlur, backgroundBlur: node.backgroundBlur, strokeColor: node.strokeColor, strokeWidth: node.strokeWidth, strokes: node.strokes, shadow: node.shadow, shadows: node.shadows, parentId: node.parentId } : null;
    })() : node;
    if (!renderedNode) return "";
    const rendered = renderCanvasPrimitive(renderedNode, 0, 0, 1, 1, undefined, 1, `canvas-gradient-${renderedNode.id}`, liveEffects);
    return wrapAncestorClips(wrapMask(rendered));
  }
  const definition = index.componentsById.get(node.componentId);
  if (!definition || !Array.isArray(definition.nodes)) return "";
  const width = finite(node.width, finite(definition.width, 1));
  const height = finite(node.height, finite(definition.height, 1));
  const renderedChildren = renderCanvasComponentContents(node, node.id, definition, index, finite(node.x, 0), finite(node.y, 0), "", [{ prefix: "", overrides: node.overrides }], new Set(), 1, liveEffects, index.componentBudget);
  const rendered = `<g opacity="${opacity(node.opacity)}"${appearanceStyle(node, 1, liveEffects)}>${renderedChildren}</g>`;
  const rotated = rotationWrapper(rendered, finite(node.rotation, 0), finite(node.x, 0), finite(node.y, 0), width, height);
  return wrapAncestorClips(rotated);
}

export interface CanvasSvgExportOptions {
  bounds?: { x: number; y: number; width: number; height: number };
  transparent?: boolean;
  elementIds?: string[];
  /** Enables live-only effects for interactive viewers. Never use for exported files. */
  liveEffects?: boolean;
}

export function renderCanvasSvg(content: CanvasArtifactContent, title: string, options: CanvasSvgExportOptions = {}): string {
  const pageWidth = finite(content.frame.width, 960);
  const pageHeight = finite(content.frame.height, 600);
  const bounds = options.bounds && options.bounds.width > 0 && options.bounds.height > 0 ? options.bounds : { x: 0, y: 0, width: pageWidth, height: pageHeight };
  const width = Math.max(1, finite(bounds.width, pageWidth));
  const height = Math.max(1, finite(bounds.height, pageHeight));
  const background = safeColor(content.appState.viewBackgroundColor);
  const resolvedElements = resolveCanvasConnectors(content.elements);
  const renderIndex: CanvasRenderIndex = {
    nodesById: new Map(resolvedElements.map((element) => [element.id, element])),
    ancestorStateById: canvasRenderAncestorStates(resolvedElements),
    maskSourceIds: new Set(resolvedElements.flatMap((element) => element.type !== "component" && element.maskId ? [element.maskId] : [])),
    booleanChildrenByParent: new Map(),
    componentsById: new Map(content.components.map((component) => [component.id, component])),
    componentDefinitions: content.components,
    componentBudget: { remaining: CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES },
  };
  for (const element of resolvedElements) {
    if (!element.parentId || element.type === "component" || element.type === "boolean" || !canBooleanNode(element)) continue;
    const parent = renderIndex.nodesById.get(element.parentId);
    if (parent?.type !== "boolean") continue;
    renderIndex.booleanChildrenByParent.set(parent.id, [...(renderIndex.booleanChildrenByParent.get(parent.id) ?? []), element]);
  }
  const clips = resolvedElements.filter((element): element is CanvasPrimitiveElement => element.type === "frame" && Boolean(element.clipContent)).map((frame) => {
    const shape = roundedRectShape({ ...frame, radius: frame.radius ?? 0 }, frame.x, frame.y, frame.width, frame.height, 1);
    return `<clipPath id="canvas-clip-${escapeHtml(frame.id)}" clipPathUnits="userSpaceOnUse"><${shape.tag} ${shape.geometry}${frame.rotation ? ` transform="rotate(${frame.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})"` : ""}/></clipPath>`;
  }).join("");
  const maskIds = new Set(resolvedElements.flatMap((element) => element.type !== "component" && element.maskId ? [element.maskId] : []));
  const masks = resolvedElements.filter((element): element is CanvasPrimitiveElement => element.type !== "component" && maskIds.has(element.id)).map((mask) => `<clipPath id="canvas-mask-${escapeHtml(mask.id)}" clipPathUnits="userSpaceOnUse">${renderCanvasPrimitive({ ...mask, opacity: 1, shadow: undefined, shadows: [], strokeWidth: 0, fills: [{ id: `mask-fill-${mask.id}`, visible: true, opacity: 1, color: "#ffffff" }], strokes: [] })}</clipPath>`).join("");
  const gradientDefinition = (node: CanvasPrimitiveElement, id: string): string => {
    if (!node.fillGradient) return "";
    const vector = canvasGradientVector(node.fillGradient.angle);
    const stops = node.fillGradient.stops.map((stop) => `<stop offset="${Math.min(1, Math.max(0, stop.offset)) * 100}%" stop-color="${safeColor(stop.color)}" stop-opacity="${opacity(stop.opacity)}"/>`).join("");
    return `<linearGradient id="${escapeHtml(id)}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">${stops}</linearGradient>`;
  };
  const gradients = resolvedElements.flatMap((element) => {
    if (element.type !== "component") return [gradientDefinition(element, `canvas-gradient-${element.id}`)];
    const definition = content.components.find((component) => component.id === element.componentId);
    if (!definition) return [];
    const legacyPaths = canvasComponentLegacyOverridePaths(definition, content.components);
    return canvasComponentPrimitiveSources(definition, content.components).map(({ path, effective }) => gradientDefinition({ ...effective, ...(element.overrides?.[path] ?? element.overrides?.[legacyPaths.get(path) ?? ""]) }, componentSvgId("gradient", element.id, path)));
  }).join("");
  const exportIds = options.elementIds ? new Set(options.elementIds) : undefined;
  const elements = resolvedElements.filter((element) => !exportIds || exportIds.has(element.id)).map((element) => renderCanvasNode(element, renderIndex, exportIds, options.liveEffects)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${finite(bounds.x, 0)} ${finite(bounds.y, 0)} ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)}"><style>text{font-family:"Atkinson Hyperlegible Next Variable","Segoe UI",sans-serif}</style><defs><marker id="canvas-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>${clips}${masks}${gradients}</defs>${options.transparent ? "" : `<rect x="${finite(bounds.x, 0)}" y="${finite(bounds.y, 0)}" width="${width}" height="${height}" fill="${background}"/>`}${elements}</svg>`;
}

export function renderArtifactForPdf(artifact: Artifact): string {
  if (artifact.content.format === "html") return inertSite(artifact.content.html);
  if (artifact.content.format === "web-project") return inertSite(artifact.content.previewHtml);
  if (artifact.content.format === "document-html") return renderHtmlDocument(artifact.content);
  if (artifact.content.format === "tiptap") {
    const { page } = artifact.content;
    const styles = `@page { size: ${page.size} ${page.orientation}; margin: ${page.margin}mm; } body { margin: 0; color: #18191c; font: 12pt/1.6 Georgia, serif; } h1,h2,h3 { font-family: "Atkinson Hyperlegible Next Variable", "Segoe UI", sans-serif; line-height: 1.15; } p { orphans: 3; widows: 3; }`;
    return shell(artifact.title, renderRichNode(artifact.content.document), styles);
  }
  const canvasContent = artifact.content;
  const pages = canvasContent.pages?.length ? canvasContent.pages : undefined;
  const body = pages
    ? pages.map((page) => {
      const pageContent = {
        ...canvasContent,
        frame: page.frame,
        elements: page.elements,
        appState: page.appState,
        activePageId: page.id,
      };
      return `<section class="canvas-pdf-page" data-canvas-page="${escapeHtml(page.name)}">${renderCanvasSvg(pageContent, `${artifact.title} — ${page.name}`)}</section>`;
    }).join("")
    : `<section class="canvas-pdf-page">${renderCanvasSvg(canvasContent, artifact.title)}</section>`;
  const styles = "@page { size: A4 landscape; margin: 0; } body { margin: 0; } .canvas-pdf-page { box-sizing: border-box; width: 100vw; height: 100vh; break-after: page; page-break-after: always; overflow: hidden; } .canvas-pdf-page:last-child { break-after: auto; page-break-after: auto; } .canvas-pdf-page svg { display: block; width: 100%; height: 100%; }";
  return shell(artifact.title, body, styles);
}
