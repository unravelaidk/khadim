import type { CanvasElement, CanvasPoint, CanvasPrimitiveElement } from "./types";

export interface CanvasAbsolutePoint {
  x: number;
  y: number;
  handleIn?: CanvasAbsoluteControlPoint;
  handleOut?: CanvasAbsoluteControlPoint;
  nodeType?: "corner" | "smooth";
}

export interface CanvasAbsoluteControlPoint {
  x: number;
  y: number;
}

export interface NormalizedCanvasPath {
  x: number;
  y: number;
  width: number;
  height: number;
  points: CanvasPoint[];
}

export function normalizeCanvasPath(points: CanvasAbsolutePoint[]): NormalizedCanvasPath {
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1, points: [] };
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    x: left,
    y: top,
    width,
    height,
    points: points.map((point) => ({
      x: (point.x - left) / width,
      y: (point.y - top) / height,
      ...(point.handleIn ? { handleIn: { x: (point.handleIn.x - left) / width, y: (point.handleIn.y - top) / height } } : {}),
      ...(point.handleOut ? { handleOut: { x: (point.handleOut.x - left) / width, y: (point.handleOut.y - top) / height } } : {}),
      ...(point.nodeType ? { nodeType: point.nodeType } : {}),
    })),
  };
}

export function canvasPathAbsolutePoints(node: Pick<CanvasPrimitiveElement, "x" | "y" | "width" | "height" | "points">): CanvasAbsolutePoint[] {
  return (node.points ?? []).map((point) => ({
    x: node.x + point.x * node.width,
    y: node.y + point.y * node.height,
    ...(point.handleIn ? { handleIn: { x: node.x + point.handleIn.x * node.width, y: node.y + point.handleIn.y * node.height } } : {}),
    ...(point.handleOut ? { handleOut: { x: node.x + point.handleOut.x * node.width, y: node.y + point.handleOut.y * node.height } } : {}),
    ...(point.nodeType ? { nodeType: point.nodeType } : {}),
  }));
}

function pathSegmentCommand(start: CanvasAbsolutePoint, end: CanvasAbsolutePoint): string {
  if (!start.handleOut && !end.handleIn) return `L ${end.x} ${end.y}`;
  const first = start.handleOut ?? start;
  const second = end.handleIn ?? end;
  return `C ${first.x} ${first.y} ${second.x} ${second.y} ${end.x} ${end.y}`;
}

export function canvasPathData(points: CanvasAbsolutePoint[], smoothing = 0, closed = false): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const hasBezierHandles = points.some((point) => point.handleIn || point.handleOut);
  if (hasBezierHandles) {
    const commands = [`M ${points[0].x} ${points[0].y}`];
    for (let index = 1; index < points.length; index += 1) commands.push(pathSegmentCommand(points[index - 1], points[index]));
    if (closed) commands.push(pathSegmentCommand(points.at(-1)!, points[0]), "Z");
    return commands.join(" ");
  }
  const strength = Math.min(1, Math.max(0, smoothing));
  if (!strength || points.length < 3) return `M ${points[0].x} ${points[0].y} ${points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ")}${closed ? " Z" : ""}`;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpoint = { x: current.x + (next.x - current.x) * .5, y: current.y + (next.y - current.y) * .5 };
    const target = { x: current.x + (midpoint.x - current.x) * strength, y: current.y + (midpoint.y - current.y) * strength };
    commands.push(`Q ${current.x} ${current.y} ${target.x} ${target.y}`);
  }
  const last = points.at(-1)!;
  commands.push(`T ${last.x} ${last.y}`);
  if (closed) commands.push("Z");
  return commands.join(" ");
}

export function canvasImportedPathTransform(node: Pick<CanvasPrimitiveElement, "x" | "y" | "width" | "height" | "svgViewBox" | "svgTransform">): string | undefined {
  const viewBox = node.svgViewBox;
  if (!viewBox || !Number.isFinite(viewBox.width) || !Number.isFinite(viewBox.height) || viewBox.width <= 0 || viewBox.height <= 0) return undefined;
  const scaleX = node.width / viewBox.width;
  const scaleY = node.height / viewBox.height;
  const sourceTransform = node.svgTransform?.trim();
  return `translate(${node.x} ${node.y}) scale(${scaleX} ${scaleY}) translate(${-viewBox.x} ${-viewBox.y})${sourceTransform ? ` ${sourceTransform}` : ""}`;
}

function nodeCenter(node: CanvasElement): CanvasAbsolutePoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function rotateAround(point: CanvasAbsolutePoint, center: CanvasAbsolutePoint, angle: number): CanvasAbsolutePoint {
  if (!angle) return point;
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: center.x + (point.x - center.x) * cosine - (point.y - center.y) * sine, y: center.y + (point.x - center.x) * sine + (point.y - center.y) * cosine };
}

function nodeBoundaryPoint(node: CanvasElement, toward: CanvasAbsolutePoint): CanvasAbsolutePoint {
  const center = nodeCenter(node);
  const localToward = rotateAround(toward, center, -(node.rotation ?? 0));
  const dx = localToward.x - center.x;
  const dy = localToward.y - center.y;
  if (!dx && !dy) return center;
  const halfWidth = Math.max(.5, node.width / 2);
  const halfHeight = Math.max(.5, node.height / 2);
  let scale: number;
  if (node.type === "ellipse") scale = 1 / Math.sqrt((dx * dx) / (halfWidth * halfWidth) + (dy * dy) / (halfHeight * halfHeight));
  else scale = Math.min(dx ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY, dy ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY);
  return rotateAround({ x: center.x + dx * scale, y: center.y + dy * scale }, center, node.rotation ?? 0);
}

export function resolveCanvasConnectors(nodes: CanvasElement[]): CanvasElement[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    if (node.type !== "arrow") return node;
    const current = canvasPathAbsolutePoints(node);
    const hasStartBinding = Boolean(node.startBindingId && byId.has(node.startBindingId));
    const hasEndBinding = Boolean(node.endBindingId && byId.has(node.endBindingId));
    const startTarget = hasStartBinding ? byId.get(node.startBindingId!)! : undefined;
    const endTarget = hasEndBinding ? byId.get(node.endBindingId!)! : undefined;
    const rawStart = startTarget ? nodeCenter(startTarget) : current[0];
    const rawEnd = endTarget ? nodeCenter(endTarget) : current.at(-1);
    const start = startTarget && rawEnd ? nodeBoundaryPoint(startTarget, rawEnd) : rawStart;
    const end = endTarget && rawStart ? nodeBoundaryPoint(endTarget, rawStart) : rawEnd;
    if (!start || !end) return node;
    return { ...node, ...normalizeCanvasPath([start, end]), startBindingId: hasStartBinding ? node.startBindingId : undefined, endBindingId: hasEndBinding ? node.endBindingId : undefined };
  });
}
