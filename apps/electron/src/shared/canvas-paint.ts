import type { CanvasFillPaint, CanvasGradient, CanvasLinearGradient, CanvasPrimitiveElement, CanvasRadialGradient, CanvasStrokePaint } from "./types";

export function canvasGradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) / 2;
  const y = Math.sin(radians) / 2;
  return { x1: .5 - x, y1: .5 - y, x2: .5 + x, y2: .5 + y };
}

export function normalizedCanvasGradient(gradient: CanvasLinearGradient): CanvasLinearGradient {
  return {
    type: "linear",
    angle: ((gradient.angle % 360) + 360) % 360,
    stops: gradient.stops
      .map((stop) => ({ ...stop, offset: Math.min(1, Math.max(0, stop.offset)), opacity: stop.opacity === undefined ? undefined : Math.min(1, Math.max(0, stop.opacity)) }))
      .sort((first, second) => first.offset - second.offset),
  };
}

export function normalizedCanvasRadialGradient(gradient: CanvasRadialGradient): CanvasRadialGradient {
  return {
    type: "radial",
    centerX: Math.min(1, Math.max(0, gradient.centerX)),
    centerY: Math.min(1, Math.max(0, gradient.centerY)),
    radius: Math.min(2, Math.max(.001, gradient.radius)),
    stops: gradient.stops
      .map((stop) => ({ ...stop, offset: Math.min(1, Math.max(0, stop.offset)), opacity: stop.opacity === undefined ? undefined : Math.min(1, Math.max(0, stop.opacity)) }))
      .sort((first, second) => first.offset - second.offset),
  };
}

export function normalizedCanvasPaintGradient(gradient: CanvasGradient): CanvasGradient {
  return gradient.type === "linear" ? normalizedCanvasGradient(gradient) : normalizedCanvasRadialGradient(gradient);
}

export function canvasElementIsClosed(node: CanvasPrimitiveElement): boolean {
  return node.type !== "text" && node.type !== "line" && node.type !== "arrow" && (node.type !== "path" || node.pathClosed === true);
}

export function canvasElementFills(node: CanvasPrimitiveElement): CanvasFillPaint[] {
  if (node.fills) return node.fills;
  if (node.type === "image" || node.type !== "text" && !canvasElementIsClosed(node)) return [];
  return [{ id: `legacy-fill-${node.id}`, visible: true, opacity: 1, color: node.color, ...(node.fillGradient ? { gradient: node.fillGradient } : {}) }];
}

export function canvasElementStrokes(node: CanvasPrimitiveElement): CanvasStrokePaint[] {
  if (node.strokes) return node.strokes;
  const width = node.strokeWidth ?? (node.type === "line" || node.type === "arrow" ? 2 : 0);
  if (width <= 0) return [];
  return [{
    id: `legacy-stroke-${node.id}`,
    visible: true,
    color: node.strokeColor ?? node.color,
    opacity: 1,
    width,
    alignment: "center",
    style: node.strokeDash ? "dashed" : "solid",
    ...(node.strokeDash ? { dash: node.strokeDash, gap: node.strokeDash } : {}),
  }];
}

export function canvasStrokeDashArray(stroke: CanvasStrokePaint): string | undefined {
  if (stroke.style === "solid") return undefined;
  const dash = Math.max(.1, stroke.dash ?? (stroke.style === "dotted" ? .1 : stroke.width * 2));
  const gap = Math.max(.1, stroke.gap ?? stroke.width * 2);
  if (stroke.style === "mixed") return `${dash} ${gap} ${dash * 2} ${gap}`;
  return `${dash} ${gap}`;
}

export function canvasElementStrokeOutset(node: CanvasPrimitiveElement): number {
  const closed = canvasElementIsClosed(node);
  const hasArrowMarker = node.type === "arrow" || node.startCap === "arrow" || node.endCap === "arrow";
  return Math.max(0, ...canvasElementStrokes(node)
    .filter((stroke) => stroke.visible && stroke.width > 0)
    .map((stroke) => {
      if (hasArrowMarker) return stroke.width * 7;
      if (!closed || stroke.alignment === "center") return stroke.width / 2;
      return stroke.alignment === "outside" ? stroke.width : 0;
    }));
}
