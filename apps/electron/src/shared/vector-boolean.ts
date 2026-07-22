import polygonClipping from "polygon-clipping";
import type { CanvasBooleanOperation, CanvasPrimitiveElement } from "./types";
export type { CanvasBooleanOperation } from "./types";
import { canvasPathAbsolutePoints, canvasPathData } from "./canvas-geometry";

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];
type Matrix = [number, number, number, number, number, number];

const identity: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const transformPoint = (point: Point, matrix: Matrix): Point => [matrix[0] * point[0] + matrix[2] * point[1] + matrix[4], matrix[1] * point[0] + matrix[3] * point[1] + matrix[5]];

function transformMatrix(value?: string): Matrix {
  if (!value) return identity;
  let matrix = identity;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const values = match[2].match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    let next = identity;
    if (match[1] === "matrix" && values.length >= 6) next = values.slice(0, 6) as Matrix;
    if (match[1] === "translate") next = [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0];
    if (match[1] === "scale") next = [values[0] ?? 1, 0, 0, values[1] ?? values[0] ?? 1, 0, 0];
    if (match[1] === "rotate") {
      const angle = (values[0] ?? 0) * Math.PI / 180; const c = Math.cos(angle); const s = Math.sin(angle); const cx = values[1] ?? 0; const cy = values[2] ?? 0;
      next = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
    if (match[1] === "skewX") next = [1, 0, Math.tan((values[0] ?? 0) * Math.PI / 180), 1, 0, 0];
    if (match[1] === "skewY") next = [1, Math.tan((values[0] ?? 0) * Math.PI / 180), 0, 1, 0, 0];
    matrix = multiply(matrix, next);
  }
  return matrix;
}

function curvePoint(a: Point, b: Point, c: Point, d: Point | undefined, t: number): Point {
  const u = 1 - t;
  return d ? [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0], u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]] : [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
}

function arcPoints(start: Point, rxValue: number, ryValue: number, rotation: number, large: number, sweep: number, end: Point): Point[] {
  let rx = Math.abs(rxValue); let ry = Math.abs(ryValue);
  if (!rx || !ry || start[0] === end[0] && start[1] === end[1]) return [end];
  const phi = rotation * Math.PI / 180; const c = Math.cos(phi); const s = Math.sin(phi);
  const dx = (start[0] - end[0]) / 2; const dy = (start[1] - end[1]) / 2;
  const xp = c * dx + s * dy; const yp = -s * dx + c * dy;
  const scale = Math.sqrt(Math.max(1, xp * xp / (rx * rx) + yp * yp / (ry * ry))); rx *= scale; ry *= scale;
  const sign = large === sweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / Math.max(1e-9, rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = factor * rx * yp / ry; const cyp = factor * -ry * xp / rx;
  const cx = c * cxp - s * cyp + (start[0] + end[0]) / 2; const cy = s * cxp + c * cyp + (start[1] + end[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx; const uy = (yp - cyp) / ry; const vx = (-xp - cxp) / rx; const vy = (-yp - cyp) / ry;
  let startAngle = angle(1, 0, ux, uy); let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= Math.PI * 2; if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 16)));
  return Array.from({ length: steps }, (_, index) => { const theta = startAngle + delta * (index + 1) / steps; return [cx + c * rx * Math.cos(theta) - s * ry * Math.sin(theta), cy + s * rx * Math.cos(theta) + c * ry * Math.sin(theta)] as Point; });
}

export function flattenSvgPath(data: string): Ring[] {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) ?? [];
  let index = 0; let command = ""; let current: Point = [0, 0]; let start: Point = [0, 0]; let lastControl: Point | undefined; let ring: Ring = []; const rings: Ring[] = [];
  const number = (): number => Number(tokens[index++]); const point = (relative: boolean): Point => { const p: Point = [number(), number()]; return relative ? [current[0] + p[0], current[1] + p[1]] : p; };
  const pushRing = (): void => { if (ring.length >= 2) { if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push([...ring[0]] as Point); rings.push(ring); } ring = []; };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase(); const upper = command.toUpperCase();
    if (upper === "M") { if (ring.length) pushRing(); current = point(relative); start = current; ring.push(current); command = relative ? "l" : "L"; lastControl = undefined; continue; }
    if (upper === "Z") { current = start; pushRing(); command = ""; lastControl = undefined; continue; }
    if (upper === "L") { current = point(relative); ring.push(current); lastControl = undefined; continue; }
    if (upper === "H") { const x = number(); current = [relative ? current[0] + x : x, current[1]]; ring.push(current); lastControl = undefined; continue; }
    if (upper === "V") { const y = number(); current = [current[0], relative ? current[1] + y : y]; ring.push(current); lastControl = undefined; continue; }
    if (upper === "C") { const c1 = point(relative); const c2 = point(relative); const end = point(relative); for (let step = 1; step <= 16; step++) ring.push(curvePoint(current, c1, c2, end, step / 16)); current = end; lastControl = c2; continue; }
    if (upper === "S") { const c1: Point = lastControl ? [current[0] * 2 - lastControl[0], current[1] * 2 - lastControl[1]] : current; const c2 = point(relative); const end = point(relative); for (let step = 1; step <= 16; step++) ring.push(curvePoint(current, c1, c2, end, step / 16)); current = end; lastControl = c2; continue; }
    if (upper === "Q" || upper === "T") { const control: Point = upper === "T" && lastControl ? [current[0] * 2 - lastControl[0], current[1] * 2 - lastControl[1]] : point(relative); const end = point(relative); for (let step = 1; step <= 12; step++) ring.push(curvePoint(current, control, end, undefined, step / 12)); current = end; lastControl = control; continue; }
    if (upper === "A") { const rx = number(); const ry = number(); const rotation = number(); const large = number(); const sweep = number(); const end = point(relative); ring.push(...arcPoints(current, rx, ry, rotation, large, sweep, end)); current = end; lastControl = undefined; continue; }
    break;
  }
  if (ring.length) pushRing();
  return rings;
}

export function svgPathBounds(data: string, transform?: string): { x: number; y: number; width: number; height: number } | null {
  const matrix = transformMatrix(transform);
  const points = flattenSvgPath(data).flat().map((point) => transformPoint(point, matrix));
  if (!points.length) return null;
  const left = Math.min(...points.map((point) => point[0]));
  const top = Math.min(...points.map((point) => point[1]));
  const right = Math.max(...points.map((point) => point[0]));
  const bottom = Math.max(...points.map((point) => point[1]));
  return { x: left, y: top, width: Math.max(.0001, right - left), height: Math.max(.0001, bottom - top) };
}

function nodeRings(node: CanvasPrimitiveElement): Ring[] {
  let rings: Ring[];
  if (node.type === "rectangle" || node.type === "frame") {
    const radius = Math.min(node.width / 2, node.height / 2, Math.max(0, node.radius ?? 0));
    if (!radius) rings = [[[node.x, node.y], [node.x + node.width, node.y], [node.x + node.width, node.y + node.height], [node.x, node.y + node.height], [node.x, node.y]]];
    else {
      const corners: Array<[number, number, number]> = [[node.x + node.width - radius, node.y + radius, -90], [node.x + node.width - radius, node.y + node.height - radius, 0], [node.x + radius, node.y + node.height - radius, 90], [node.x + radius, node.y + radius, 180]];
      rings = [corners.flatMap(([cx, cy, start]) => Array.from({ length: 9 }, (_, index) => { const angle = (start + index * 90 / 8) * Math.PI / 180; return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as Point; }))];
    }
  }
  else if (node.type === "ellipse") rings = [Array.from({ length: 65 }, (_, index) => { const angle = index / 64 * Math.PI * 2; return [node.x + node.width / 2 + Math.cos(angle) * node.width / 2, node.y + node.height / 2 + Math.sin(angle) * node.height / 2] as Point; })];
  else if (node.type === "path" && node.svgPathData && node.svgViewBox) {
    const source = flattenSvgPath(node.svgPathData); const sourceTransform = transformMatrix(node.svgTransform); const sx = node.width / node.svgViewBox.width; const sy = node.height / node.svgViewBox.height;
    const viewport: Matrix = [sx, 0, 0, sy, node.x - node.svgViewBox.x * sx, node.y - node.svgViewBox.y * sy]; rings = source.map((value) => value.map((p) => transformPoint(transformPoint(p, sourceTransform), viewport)));
  } else if (node.type === "path") rings = flattenSvgPath(canvasPathData(canvasPathAbsolutePoints(node), node.pathSmoothing ?? 0, Boolean(node.pathClosed)));
  else return [];
  if (node.rotation) { const angle = node.rotation * Math.PI / 180; const c = Math.cos(angle); const s = Math.sin(angle); const cx = node.x + node.width / 2; const cy = node.y + node.height / 2; const rotation: Matrix = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]); rings = rings.map((value) => value.map((p) => transformPoint(p, rotation))); }
  return rings.filter((value) => value.length >= 4).map((value) => value[0][0] === value.at(-1)![0] && value[0][1] === value.at(-1)![1] ? value : [...value, [...value[0]] as Point]);
}

function ringArea(ring: Ring): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return area / 2;
}

function pointInRing(point: Point, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]; const [px, py] = ring[previous];
    if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}

function ringsToMultiPolygon(rings: Ring[]): MultiPolygon {
  const ordered = [...rings].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const polygons: MultiPolygon = [];
  const owners = new Map<Ring, Polygon>();
  for (const ring of ordered) {
    const containers = ordered.filter((candidate) => candidate !== ring && Math.abs(ringArea(candidate)) > Math.abs(ringArea(ring)) && pointInRing(ring[0], candidate));
    if (containers.length % 2 === 0) {
      const polygon: Polygon = [ring]; polygons.push(polygon); owners.set(ring, polygon);
      continue;
    }
    const nearestOuter = containers.filter((candidate) => owners.has(candidate)).sort((a, b) => Math.abs(ringArea(a)) - Math.abs(ringArea(b)))[0];
    if (nearestOuter) owners.get(nearestOuter)!.push(ring);
    else { const polygon: Polygon = [ring]; polygons.push(polygon); owners.set(ring, polygon); }
  }
  return polygons;
}

export function canBooleanNode(node: CanvasPrimitiveElement): boolean { return (node.type === "rectangle" || node.type === "ellipse" || node.type === "frame" || node.type === "path" && Boolean(node.pathClosed)) && nodeRings(node).length > 0; }

export function booleanCanvasNodes(nodes: CanvasPrimitiveElement[], operation: CanvasBooleanOperation): CanvasPrimitiveElement | null {
  if (nodes.length < 2 || nodes.some((node) => !canBooleanNode(node))) return null;
  const inputs = nodes.map((node) => ringsToMultiPolygon(nodeRings(node)));
  let result: MultiPolygon;
  if (operation === "flatten") result = inputs.flat();
  else if (operation === "union") result = polygonClipping.union(inputs[0], ...inputs.slice(1)) as MultiPolygon;
  else if (operation === "intersection") result = polygonClipping.intersection(inputs[0], ...inputs.slice(1)) as MultiPolygon;
  else if (operation === "exclusion") result = polygonClipping.xor(inputs[0], ...inputs.slice(1)) as MultiPolygon;
  else result = polygonClipping.difference(inputs[0], ...inputs.slice(1)) as MultiPolygon;
  const rings = result.flat(); if (!rings.length) return null;
  const points = rings.flat(); const left = Math.min(...points.map((p) => p[0])); const top = Math.min(...points.map((p) => p[1])); const right = Math.max(...points.map((p) => p[0])); const bottom = Math.max(...points.map((p) => p[1]));
  const data = rings.map((value) => `M ${value.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`).join(" ");
  const source = nodes.at(-1)!;
  return { id: crypto.randomUUID(), type: "path", name: `${operation[0].toUpperCase()}${operation.slice(1)}`, x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), color: source.color, fillGradient: source.fillGradient, opacity: source.opacity, strokeColor: source.strokeColor, strokeWidth: source.strokeWidth, pathClosed: true, svgPathData: data, svgViewBox: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }, fillRule: operation === "flatten" ? "nonzero" : "evenodd" };
}
