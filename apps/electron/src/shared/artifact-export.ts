import type { Artifact, CanvasArtifactContent, CanvasComponentDefinition, CanvasElement, CanvasPrimitiveElement, HtmlDocumentArtifactContent } from "./types";
import { canvasImportedPathTransform, canvasPathAbsolutePoints, canvasPathData, resolveCanvasConnectors } from "./canvas-geometry";
import { booleanCanvasNodes, canBooleanNode } from "./vector-boolean";
import { canvasGradientVector } from "./canvas-paint";

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

function colorWithOpacity(value: unknown, alpha: number): string {
  const color = safeColor(value);
  const normalized = color.length === 4 ? `#${color.slice(1).split("").map((part) => part + part).join("")}` : color.slice(0, 7);
  const channel = Math.round(opacity(alpha) * 255).toString(16).padStart(2, "0");
  return `${normalized}${channel}`;
}

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

function shadowStyle(node: CanvasPrimitiveElement): string {
  if (!node.shadow) return "";
  return ` style="filter:drop-shadow(${finite(node.shadow.x, 0)}px ${finite(node.shadow.y, 8)}px ${finite(node.shadow.blur, 18)}px ${colorWithOpacity(node.shadow.color, node.shadow.opacity)})"`;
}

function rotationWrapper(content: string, rotation: number, x: number, y: number, width: number, height: number): string {
  return rotation ? `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">${content}</g>` : content;
}

function renderCanvasPrimitive(value: CanvasPrimitiveElement, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, override?: Partial<CanvasPrimitiveElement>, parentOpacity = 1, gradientId = `canvas-gradient-${value.id}`): string {
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
  const shadow = shadowStyle(node);
  let content = "";
  if (node.type === "text") {
    const fontSize = finite(node.fontSize, 26) * Math.min(scaleX, scaleY);
    const lineHeight = fontSize * finite(node.lineHeight, 1.2);
    const lines = wrapCanvasText(node.text ?? "", width, fontSize);
    const textX = node.textAlign === "center" ? x + width / 2 : node.textAlign === "right" ? x + width : x;
    const anchor = node.textAlign === "center" ? "middle" : node.textAlign === "right" ? "end" : "start";
    const spans = lines.map((line, index) => `<tspan x="${textX}" dy="${index ? lineHeight : 0}">${escapeHtml(line || "\u00a0")}</tspan>`).join("");
    content = `<text x="${textX}" y="${y + fontSize}" fill="${color}" font-family="${escapeHtml(node.fontFamily ?? "Atkinson Hyperlegible Next")}" font-size="${fontSize}" font-weight="${finite(node.fontWeight, 620)}" font-style="${node.fontStyle ?? "normal"}" letter-spacing="${finite(node.letterSpacing, 0)}" text-anchor="${anchor}" opacity="${alpha}"${shadow}>${spans}</text>`;
  } else if (node.type === "ellipse") content = `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} opacity="${alpha}"${shadow}/>`;
  else if (node.type === "line") content = `<line x1="${node.lineFlip ? x + width : x}" y1="${y}" x2="${node.lineFlip ? x : x + width}" y2="${y + height}" stroke="${safeColor(node.strokeColor ?? node.color)}" stroke-width="${Math.max(1, strokeWidth || 2)}" stroke-linecap="round"${dash} opacity="${alpha}"${shadow}/>`;
  else if (node.type === "path" || node.type === "arrow") {
    const pathNode = { ...node, x, y, width, height };
    const importedTransform = node.type === "path" && node.svgPathData ? canvasImportedPathTransform(pathNode) : undefined;
    const data = node.type === "path" && node.svgPathData ? node.svgPathData : canvasPathData(canvasPathAbsolutePoints(pathNode), finite(node.pathSmoothing, 0), Boolean(node.pathClosed));
    const startMarker = node.startCap === "arrow" ? ' marker-start="url(#canvas-arrowhead)"' : "";
    const endMarker = node.type === "arrow" || node.endCap === "arrow" ? ' marker-end="url(#canvas-arrowhead)"' : "";
    content = `<path d="${escapeHtml(data)}"${importedTransform ? ` transform="${escapeHtml(importedTransform)}"` : ""} fill="${node.pathClosed ? color : "none"}" fill-rule="${node.fillRule ?? "nonzero"}" stroke="${node.strokeWidth ? safeColor(node.strokeColor ?? node.color) : "none"}" stroke-width="${strokeWidth}" stroke-linecap="${node.startCap === "round" || node.endCap === "round" ? "round" : "butt"}" stroke-linejoin="round"${startMarker}${endMarker}${dash} opacity="${alpha}"${shadow}/>`;
  }
  else if (node.type === "image") content = `<image href="${escapeHtml(node.src ?? "")}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${alpha}"${shadow}/>`;
  else content = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${finite(node.radius, node.type === "frame" ? 4 : 8) * Math.min(scaleX, scaleY)}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} opacity="${alpha}"${shadow}/>`;
  return rotationWrapper(content, finite(node.rotation, 0), x, y, width, height);
}

function renderCanvasNode(node: CanvasElement, components: CanvasComponentDefinition[], nodes: CanvasElement[], explicitIds?: Set<string>): string {
  if (node.parentId && nodes.some((candidate) => candidate.id === node.parentId && candidate.type === "boolean") && (!explicitIds?.has(node.id) || explicitIds.has(node.parentId))) return "";
  let ancestorId = node.parentId;
  const visited = new Set<string>();
  const clipAncestorIds: string[] = [];
  while (ancestorId && !visited.has(ancestorId)) {
    visited.add(ancestorId);
    const ancestor = nodes.find((candidate) => candidate.id === ancestorId);
    if (ancestor?.hidden) return "";
    if (ancestor?.type === "frame" && ancestor.clipContent) clipAncestorIds.push(ancestor.id);
    ancestorId = ancestor?.parentId;
  }
  if (node.hidden || nodes.some((candidate) => candidate.type !== "component" && candidate.maskId === node.id)) return "";
  const wrapAncestorClips = (rendered: string): string => clipAncestorIds.reduce((nested, frameId) => `<g clip-path="url(#canvas-clip-${escapeHtml(frameId)})">${nested}</g>`, rendered);
  const wrapMask = (rendered: string): string => node.type !== "component" && node.maskId ? `<g clip-path="url(#canvas-mask-${escapeHtml(node.maskId)})">${rendered}</g>` : rendered;
  if (node.type !== "component") {
    const renderedNode = node.type === "boolean" ? (() => {
      const children = nodes.filter((candidate): candidate is CanvasPrimitiveElement => candidate.parentId === node.id && candidate.type !== "component" && candidate.type !== "boolean" && canBooleanNode(candidate));
      const result = node.booleanOperation ? booleanCanvasNodes(children, node.booleanOperation) : null;
      return result ? { ...result, id: node.id, name: node.name, color: node.color, fillGradient: node.fillGradient, opacity: node.opacity, strokeColor: node.strokeColor, strokeWidth: node.strokeWidth, shadow: node.shadow, parentId: node.parentId } : null;
    })() : node;
    if (!renderedNode) return "";
    const rendered = renderCanvasPrimitive(renderedNode);
    return wrapAncestorClips(wrapMask(rendered));
  }
  const definition = components.find((component) => component.id === node.componentId);
  if (!definition || !Array.isArray(definition.nodes)) return "";
  const width = finite(node.width, finite(definition.width, 1));
  const height = finite(node.height, finite(definition.height, 1));
  const scaleX = width / Math.max(1, finite(definition.width, width));
  const scaleY = height / Math.max(1, finite(definition.height, height));
  const overrides = node.overrides ?? {};
  const clipId = (frameId: string): string => `canvas-component-clip-${escapeHtml(node.id)}-${escapeHtml(frameId)}`;
  const maskId = (sourceId: string): string => `canvas-component-mask-${escapeHtml(node.id)}-${escapeHtml(sourceId)}`;
  const internalMaskSourceIds = new Set(definition.nodes.flatMap((child) => {
    const effective = { ...child, ...overrides[child.id] };
    return effective.maskId ? [effective.maskId] : [];
  }));
  const componentClips = definition.nodes.filter((child) => child.type === "frame" && child.clipContent).map((frame) => {
    const effective = { ...frame, ...overrides[frame.id] };
    const x = finite(node.x, 0) + finite(effective.x, 0) * scaleX;
    const y = finite(node.y, 0) + finite(effective.y, 0) * scaleY;
    const frameWidth = finite(effective.width, 1) * scaleX;
    const frameHeight = finite(effective.height, 1) * scaleY;
    const rotation = finite(effective.rotation, 0);
    return `<clipPath id="${clipId(frame.id)}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${frameWidth}" height="${frameHeight}" rx="${finite(effective.radius, 0) * Math.min(scaleX, scaleY)}"${rotation ? ` transform="rotate(${rotation} ${x + frameWidth / 2} ${y + frameHeight / 2})"` : ""}/></clipPath>`;
  }).join("");
  const componentMasks = definition.nodes.filter((child) => internalMaskSourceIds.has(child.id)).map((source) => {
    const effective = { ...source, ...overrides[source.id], opacity: 1, shadow: undefined, strokeWidth: 0 };
    return `<clipPath id="${maskId(source.id)}" clipPathUnits="userSpaceOnUse">${renderCanvasPrimitive(effective, finite(node.x, 0), finite(node.y, 0), scaleX, scaleY)}</clipPath>`;
  }).join("");
  const renderedChildren = definition.nodes.map((child) => {
    if (internalMaskSourceIds.has(child.id)) return "";
    let parentId = child.parentId;
    const visitedParents = new Set<string>();
    const internalClipIds: string[] = [];
    while (parentId && !visitedParents.has(parentId)) {
      visitedParents.add(parentId);
      const ancestor = definition.nodes.find((candidate) => candidate.id === parentId);
      if (!ancestor) break;
      if ({ ...ancestor, ...overrides[ancestor.id] }.hidden) return "";
      if (ancestor.type === "frame" && ancestor.clipContent) internalClipIds.push(ancestor.id);
      parentId = ancestor.parentId;
    }
    const effective = { ...child, ...overrides[child.id] };
    const renderedChild = renderCanvasPrimitive(child, finite(node.x, 0), finite(node.y, 0), scaleX, scaleY, overrides[child.id], opacity(node.opacity), `canvas-component-gradient-${node.id}-${child.id}`);
    const maskedChild = effective.maskId ? `<g clip-path="url(#${maskId(effective.maskId)})">${renderedChild}</g>` : renderedChild;
    return internalClipIds.reduce((nested, frameId) => `<g clip-path="url(#${clipId(frameId)})">${nested}</g>`, maskedChild);
  }).join("");
  const componentDefinitions = `${componentClips}${componentMasks}`;
  const rendered = `${componentDefinitions ? `<defs>${componentDefinitions}</defs>` : ""}${renderedChildren}`;
  const rotated = rotationWrapper(rendered, finite(node.rotation, 0), finite(node.x, 0), finite(node.y, 0), width, height);
  return wrapAncestorClips(rotated);
}

export interface CanvasSvgExportOptions {
  bounds?: { x: number; y: number; width: number; height: number };
  transparent?: boolean;
  elementIds?: string[];
}

export function renderCanvasSvg(content: CanvasArtifactContent, title: string, options: CanvasSvgExportOptions = {}): string {
  const pageWidth = finite(content.frame.width, 960);
  const pageHeight = finite(content.frame.height, 600);
  const bounds = options.bounds && options.bounds.width > 0 && options.bounds.height > 0 ? options.bounds : { x: 0, y: 0, width: pageWidth, height: pageHeight };
  const width = Math.max(1, finite(bounds.width, pageWidth));
  const height = Math.max(1, finite(bounds.height, pageHeight));
  const background = safeColor(content.appState.viewBackgroundColor);
  const resolvedElements = resolveCanvasConnectors(content.elements);
  const clips = resolvedElements.filter((element): element is CanvasPrimitiveElement => element.type === "frame" && Boolean(element.clipContent)).map((frame) => `<clipPath id="canvas-clip-${escapeHtml(frame.id)}" clipPathUnits="userSpaceOnUse"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${finite(frame.radius, 0)}"${frame.rotation ? ` transform="rotate(${frame.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})"` : ""}/></clipPath>`).join("");
  const maskIds = new Set(resolvedElements.flatMap((element) => element.type !== "component" && element.maskId ? [element.maskId] : []));
  const masks = resolvedElements.filter((element): element is CanvasPrimitiveElement => element.type !== "component" && maskIds.has(element.id)).map((mask) => `<clipPath id="canvas-mask-${escapeHtml(mask.id)}" clipPathUnits="userSpaceOnUse">${renderCanvasPrimitive({ ...mask, opacity: 1, shadow: undefined, strokeWidth: 0 })}</clipPath>`).join("");
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
    return definition.nodes.map((node) => gradientDefinition({ ...node, ...element.overrides?.[node.id] }, `canvas-component-gradient-${element.id}-${node.id}`));
  }).join("");
  const exportIds = options.elementIds ? new Set(options.elementIds) : undefined;
  const elements = resolvedElements.filter((element) => !exportIds || exportIds.has(element.id)).map((element) => renderCanvasNode(element, content.components, resolvedElements, exportIds)).join("");
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
