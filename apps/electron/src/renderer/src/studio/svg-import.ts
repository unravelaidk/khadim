import type { CanvasPrimitiveElement, CanvasSvgViewBox } from "../../../shared/types";
import { svgPathBounds } from "../../../shared/vector-boolean";

export interface SvgImportOptions {
  x: number;
  y: number;
  maxWidth?: number;
  maxHeight?: number;
  name?: string;
}

const safePathData = /^[\s0-9eE+.,MmLlHhVvCcSsQqTtAaZz-]+$/;
const safeTransform = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9.eE,\s]+\)\s*)*$/;
const namedColors: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  gray: "#808080", grey: "#808080", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  pink: "#ffc0cb", cyan: "#00ffff", magenta: "#ff00ff", navy: "#000080", teal: "#008080",
};

function finiteNumber(value: string | null | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeColor(value: string | null | undefined): string | undefined {
  const color = value?.trim().toLowerCase();
  if (!color || color === "none" || color === "transparent" || color.startsWith("url(")) return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return `#${rgb.slice(1, 4).map((channel) => Math.min(255, Math.max(0, Math.round(Number(channel)))).toString(16).padStart(2, "0")).join("")}`;
  return namedColors[color];
}

function styleValue(element: Element, property: string): string | undefined {
  const style = element.getAttribute("style")?.split(";").map((part) => part.split(":"))
    .find(([name]) => name?.trim().toLowerCase() === property)?.slice(1).join(":").trim();
  const direct = element.getAttribute(property)?.trim();
  if (style || direct) return style || direct || undefined;
  const parent = element.parentElement;
  return parent ? styleValue(parent, property) : undefined;
}

function inheritedTransform(element: Element, root: Element): string | undefined {
  const transforms: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const transform = current.getAttribute("transform")?.trim();
    if (transform) {
      if (!safeTransform.test(transform)) return undefined;
      transforms.unshift(transform);
    }
    current = current.parentElement;
  }
  return transforms.join(" ") || undefined;
}

function shapePath(element: Element): string | undefined {
  const tag = element.tagName.toLowerCase();
  if (tag === "path") {
    const data = element.getAttribute("d")?.trim();
    return data && data.length <= 1_000_000 && safePathData.test(data) ? data : undefined;
  }
  if (tag === "line") return `M ${finiteNumber(element.getAttribute("x1"))} ${finiteNumber(element.getAttribute("y1"))} L ${finiteNumber(element.getAttribute("x2"))} ${finiteNumber(element.getAttribute("y2"))}`;
  if (tag === "polyline" || tag === "polygon") {
    const values = (element.getAttribute("points") ?? "").match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) return undefined;
    const pairs: string[] = [];
    for (let index = 0; index + 1 < values.length; index += 2) pairs.push(`${index ? "L" : "M"} ${values[index]} ${values[index + 1]}`);
    return `${pairs.join(" ")}${tag === "polygon" ? " Z" : ""}`;
  }
  if (tag === "rect") {
    const x = finiteNumber(element.getAttribute("x"));
    const y = finiteNumber(element.getAttribute("y"));
    const width = Math.max(0, finiteNumber(element.getAttribute("width")));
    const height = Math.max(0, finiteNumber(element.getAttribute("height")));
    if (!width || !height) return undefined;
    const radius = Math.min(width / 2, height / 2, Math.max(0, finiteNumber(element.getAttribute("rx"), finiteNumber(element.getAttribute("ry")))));
    if (!radius) return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
    return `M ${x + radius} ${y} H ${x + width - radius} A ${radius} ${radius} 0 0 1 ${x + width} ${y + radius} V ${y + height - radius} A ${radius} ${radius} 0 0 1 ${x + width - radius} ${y + height} H ${x + radius} A ${radius} ${radius} 0 0 1 ${x} ${y + height - radius} V ${y + radius} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = finiteNumber(element.getAttribute("cx"));
    const cy = finiteNumber(element.getAttribute("cy"));
    const rx = Math.max(0, finiteNumber(element.getAttribute(tag === "circle" ? "r" : "rx")));
    const ry = Math.max(0, finiteNumber(element.getAttribute(tag === "circle" ? "r" : "ry")));
    if (!rx || !ry) return undefined;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }
  return undefined;
}

function svgViewBox(root: Element): CanvasSvgViewBox {
  const values = root.getAttribute("viewBox")?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
  if (values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) return { x: values[0], y: values[1], width: values[2], height: values[3] };
  return { x: 0, y: 0, width: Math.max(1, finiteNumber(root.getAttribute("width"), 320)), height: Math.max(1, finiteNumber(root.getAttribute("height"), 200)) };
}

/** Parse an SVG into selectable, restylable native vector layers. Raw markup is never rendered. */
export function importSvgToCanvasNodes(source: string, options: SvgImportOptions): CanvasPrimitiveElement[] {
  if (source.length > 10 * 1024 * 1024) throw new Error("SVG is larger than 10 MB");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (root.tagName.toLowerCase() !== "svg" || document.querySelector("parsererror")) throw new Error("Invalid SVG document");
  const viewBox = svgViewBox(root);
  const scale = Math.min(1, (options.maxWidth ?? 480) / viewBox.width, (options.maxHeight ?? 360) / viewBox.height);
  const visible = [...root.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon")].filter((element) => !element.closest("defs, clipPath, mask, symbol"));
  const reused = [...root.querySelectorAll("use")].filter((use) => !use.closest("defs, clipPath, mask, symbol")).flatMap((use): Element[] => {
    const href = use.getAttribute("href") ?? use.getAttribute("xlink:href");
    const source = href?.startsWith("#") ? document.getElementById(href.slice(1)) : null;
    if (!source || !["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(source.tagName.toLowerCase())) return [];
    const clone = source.cloneNode(true) as Element;
    for (const attribute of ["fill", "stroke", "stroke-width", "opacity", "style"]) if (use.hasAttribute(attribute)) clone.setAttribute(attribute, use.getAttribute(attribute)!);
    const translation = `translate(${finiteNumber(use.getAttribute("x"))} ${finiteNumber(use.getAttribute("y"))})`;
    const transforms = [translation, use.getAttribute("transform"), source.getAttribute("transform")].filter(Boolean).join(" ");
    if (safeTransform.test(transforms)) clone.setAttribute("transform", transforms);
    return [clone];
  });
  const elements = [...visible, ...reused].slice(0, 2_000);
  return elements.flatMap((element, index): CanvasPrimitiveElement[] => {
    const data = shapePath(element);
    if (!data) return [];
    const transform = inheritedTransform(element, root);
    const bounds = svgPathBounds(data, transform);
    if (!bounds) return [];
    const tag = element.tagName.toLowerCase();
    const defaultFill = tag === "line" || tag === "polyline" ? undefined : "#000000";
    const fill = normalizeColor(styleValue(element, "fill")) ?? (styleValue(element, "fill") === "none" ? undefined : defaultFill);
    const stroke = normalizeColor(styleValue(element, "stroke"));
    const opacity = Math.min(1, Math.max(0, finiteNumber(styleValue(element, "opacity"), 1)));
    const strokeWidth = stroke ? Math.max(.1, finiteNumber(styleValue(element, "stroke-width"), 1)) : 0;
    return [{
      id: crypto.randomUUID(),
      type: "path",
      name: element.getAttribute("id") || `${options.name ?? "SVG"} ${index + 1}`,
      x: options.x + (bounds.x - viewBox.x) * scale,
      y: options.y + (bounds.y - viewBox.y) * scale,
      width: Math.max(1, bounds.width * scale),
      height: Math.max(1, bounds.height * scale),
      color: fill ?? "#000000",
      opacity,
      strokeColor: stroke ?? "#000000",
      strokeWidth,
      pathClosed: Boolean(fill),
      svgPathData: data,
      svgViewBox: bounds,
      svgTransform: transform,
    }];
  });
}
