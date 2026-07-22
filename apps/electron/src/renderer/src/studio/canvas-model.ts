import type {
  CanvasArtifactContent,
  CanvasAutoLayout,
  CanvasComponentDefinition,
  CanvasComponentElement,
  CanvasElement,
  CanvasHorizontalConstraint,
  CanvasPaintStyle,
  CanvasPage,
  CanvasPrototypeFlow,
  CanvasPoint,
  CanvasPrimitiveElement,
  CanvasPrimitiveType,
  CanvasShadow,
  CanvasSvgViewBox,
  CanvasTextStyle,
  CanvasEffectStyle,
  CanvasTokenCollection,
  CanvasVerticalConstraint,
} from "../../../shared/types";
import { canvasPathAbsolutePoints, canvasPathData } from "../../../shared/canvas-geometry";
import { canvasElementStrokeOutset } from "../../../shared/canvas-paint";
import { svgPathBounds } from "../../../shared/vector-boolean";

export type {
  CanvasArtifactContent,
  CanvasAutoLayout,
  CanvasComponentDefinition,
  CanvasHorizontalConstraint,
  CanvasPaintStyle,
  CanvasPage,
  CanvasPrototypeFlow,
  CanvasPoint,
  CanvasPrimitiveType,
  CanvasShadow,
  CanvasSvgViewBox,
  CanvasTextStyle,
  CanvasEffectStyle,
  CanvasTokenCollection,
  CanvasVerticalConstraint,
};
export type CanvasPrimitiveNode = CanvasPrimitiveElement;
export type CanvasComponentNode = CanvasComponentElement;
export type CanvasNode = CanvasElement;

export interface CanvasSnapshot {
  nodes: CanvasNode[];
  components: CanvasComponentDefinition[];
  styles?: CanvasPaintStyle[];
  textStyles?: CanvasTextStyle[];
  effectStyles?: CanvasEffectStyle[];
  tokenCollections?: CanvasTokenCollection[];
  pages?: CanvasPage[];
  activePageId?: string;
  prototypeFlows?: CanvasPrototypeFlow[];
  prototypeStartPageId?: string;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CanvasSnapAxis = "x" | "y";
export type CanvasSnapTargetKind = "shape" | "frame" | "page" | "guide" | "layout-grid";

export interface CanvasSnapRectTarget {
  id: string;
  rect: CanvasRect;
  kind?: Extract<CanvasSnapTargetKind, "shape" | "frame" | "page">;
}

export interface CanvasSnapAxisTarget {
  axis: CanvasSnapAxis;
  position: number;
  kind: Extract<CanvasSnapTargetKind, "guide" | "layout-grid">;
  from?: number;
  to?: number;
}

export interface CanvasSnapLine {
  axis: CanvasSnapAxis;
  position: number;
  from: number;
  to: number;
  kind: CanvasSnapTargetKind;
}

export interface CanvasSnapMeasurement {
  axis: CanvasSnapAxis;
  start: number;
  end: number;
  cross: number;
  value: number;
}

export interface CanvasSnapFeedback {
  lines: CanvasSnapLine[];
  measurements: CanvasSnapMeasurement[];
}

export interface CanvasSnapIndexedCandidate {
  position: number;
  from: number;
  to: number;
  kind: CanvasSnapTargetKind;
}

export interface CanvasSnapIndex {
  x: CanvasSnapIndexedCandidate[];
  y: CanvasSnapIndexedCandidate[];
  rectsByLeft: CanvasSnapRectTarget[];
  rectsByRight: CanvasSnapRectTarget[];
  rectsByTop: CanvasSnapRectTarget[];
  rectsByBottom: CanvasSnapRectTarget[];
}

export interface CanvasMoveSnapInput {
  bounds: CanvasRect;
  deltaX: number;
  deltaY: number;
  rectTargets?: CanvasSnapRectTarget[];
  axisTargets?: CanvasSnapAxisTarget[];
  snapIndex?: CanvasSnapIndex;
  threshold: number;
  pageRect: CanvasRect;
  snapToGrid?: boolean;
  gridSize?: number;
  gridOriginX?: number;
  gridOriginY?: number;
  disabled?: boolean;
}

export interface CanvasMoveSnapResult extends CanvasSnapFeedback {
  deltaX: number;
  deltaY: number;
}

export interface CanvasGeometryEntry {
  node: CanvasNode;
  rect: CanvasRect;
  visualRect: CanvasRect;
  hidden: boolean;
  locked: boolean;
}

export interface CanvasVirtualRange {
  start: number;
  end: number;
  before: number;
  after: number;
}

export interface CanvasLayerTree {
  rows: CanvasNode[];
  depthById: Map<string, number>;
}

export function isCanvasPrimitiveNode(value: unknown): value is CanvasPrimitiveNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<CanvasPrimitiveNode>;
  const validPath = node.type !== "path" && node.type !== "arrow"
    || Array.isArray(node.points) && node.points.length >= 2 && node.points.every((point) => typeof point?.x === "number" && typeof point?.y === "number"
      && (point.nodeType === undefined || point.nodeType === "corner" || point.nodeType === "smooth")
      && [point.handleIn, point.handleOut].every((handle) => handle === undefined || typeof handle.x === "number" && typeof handle.y === "number"))
    || node.type === "path" && typeof node.svgPathData === "string" && Boolean(node.svgViewBox);
  return typeof node.id === "string"
    && (node.type === "rectangle" || node.type === "ellipse" || node.type === "line" || node.type === "path" || node.type === "arrow" || node.type === "text" || node.type === "image" || node.type === "frame" || node.type === "boolean")
    && typeof node.x === "number"
    && typeof node.y === "number"
    && typeof node.width === "number"
    && typeof node.height === "number"
    && typeof node.color === "string"
    && (node.type !== "boolean" || node.booleanOperation === "union" || node.booleanOperation === "difference" || node.booleanOperation === "intersection" || node.booleanOperation === "exclusion")
    && validPath;
}

export function isCanvasNode(value: unknown): value is CanvasNode {
  if (isCanvasPrimitiveNode(value)) return true;
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<CanvasComponentNode>;
  return node.type === "component"
    && typeof node.id === "string"
    && typeof node.componentId === "string"
    && (node.componentRole === "main" || node.componentRole === "instance")
    && typeof node.x === "number"
    && typeof node.y === "number"
    && typeof node.width === "number"
    && typeof node.height === "number"
    && typeof node.color === "string";
}

export function isComponentDefinition(value: unknown): value is CanvasComponentDefinition {
  if (!value || typeof value !== "object") return false;
  const component = value as Partial<CanvasComponentDefinition>;
  return typeof component.id === "string"
    && typeof component.name === "string"
    && typeof component.width === "number"
    && typeof component.height === "number"
    && Array.isArray(component.nodes)
    && component.nodes.every(isCanvasPrimitiveNode);
}

export function canvasNodes(content: CanvasArtifactContent): CanvasNode[] {
  return content.elements.filter(isCanvasNode);
}

export function canvasComponents(content: CanvasArtifactContent): CanvasComponentDefinition[] {
  return (content.components ?? []).filter(isComponentDefinition);
}

export function canvasPages(content: CanvasArtifactContent): CanvasPage[] {
  const activeId = content.activePageId ?? content.pages?.[0]?.id ?? "page-1";
  const pages = content.pages?.length ? content.pages : [{ id: activeId, name: "Page 1", frame: content.frame, elements: content.elements, appState: content.appState }];
  return pages.map((page) => page.id === activeId ? { ...page, frame: content.frame, elements: content.elements, appState: content.appState } : page);
}

export function canvasPrototypeFlows(content: Pick<CanvasArtifactContent, "prototypeFlows" | "prototypeStartPageId">, pages: CanvasPage[]): CanvasPrototypeFlow[] {
  const pageIds = new Set(pages.map((page) => page.id));
  const seen = new Set<string>();
  const flows = (content.prototypeFlows ?? []).flatMap((flow) => {
    const name = flow.name.trim();
    if (!flow.id || seen.has(flow.id) || !name || !pageIds.has(flow.startPageId)) return [];
    seen.add(flow.id);
    return [{ ...flow, name }];
  });
  if (flows.length) return flows;
  const startPageId = pageIds.has(content.prototypeStartPageId ?? "") ? content.prototypeStartPageId! : pages[0]?.id;
  return startPageId ? [{ id: "default-flow", name: "Main flow", startPageId }] : [];
}

export function canvasSignature(nodes: CanvasNode[], components: CanvasComponentDefinition[], styles: CanvasPaintStyle[] = []): string {
  return JSON.stringify({ nodes, components, styles });
}

export function nodeSize(node: CanvasNode, components: CanvasComponentDefinition[]): { width: number; height: number } {
  if (node.type !== "component") return node;
  const definition = components.find((component) => component.id === node.componentId);
  return { width: node.width || definition?.width || 1, height: node.height || definition?.height || 1 };
}

export function nodeRect(node: CanvasNode, components: CanvasComponentDefinition[]): CanvasRect {
  const size = nodeSize(node, components);
  return { x: node.x, y: node.y, width: size.width, height: size.height };
}

/** Builds reusable geometry and inherited interaction flags in linear time. */
export function canvasGeometryIndex(nodes: CanvasNode[], components: CanvasComponentDefinition[]): CanvasGeometryEntry[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const flagsById = new Map<string, { hidden: boolean; locked: boolean }>();

  for (const node of nodes) {
    if (flagsById.has(node.id)) continue;
    const path: CanvasNode[] = [];
    const visited = new Set<string>();
    let current: CanvasNode | undefined = node;
    while (current && !flagsById.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? nodesById.get(current.parentId) : undefined;
    }
    let flags = current ? flagsById.get(current.id) ?? { hidden: false, locked: false } : { hidden: false, locked: false };
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const candidate = path[index];
      flags = { hidden: flags.hidden || Boolean(candidate.hidden), locked: flags.locked || Boolean(candidate.locked) };
      flagsById.set(candidate.id, flags);
    }
  }

  return nodes.map((node) => {
    const definition = node.type === "component" ? componentsById.get(node.componentId) : undefined;
    const width = node.type === "component" ? node.width || definition?.width || 1 : node.width;
    const height = node.type === "component" ? node.height || definition?.height || 1 : node.height;
    const rect = { x: node.x, y: node.y, width, height };
    const pathRect = node.type !== "component" && (node.type === "path" || node.type === "arrow") && node.points?.length
      ? svgPathBounds(canvasPathData(canvasPathAbsolutePoints(node), node.pathSmoothing ?? 0, Boolean(node.pathClosed)))
      : undefined;
    const scale = definition ? Math.max(width / Math.max(1, definition.width), height / Math.max(1, definition.height)) : 1;
    const visualOutset = node.type === "component"
      ? (node.layerBlur?.visible ? node.layerBlur.value * 2 : 0) + Math.max(0, ...(definition?.nodes.map((child) => {
        const effective = { ...child, ...node.overrides?.[child.id] };
        return (canvasElementStrokeOutset(effective) + (effective.shadow ? effective.shadow.blur * 2 + Math.abs(effective.shadow.x) + Math.abs(effective.shadow.y) : 0) + (effective.layerBlur?.visible ? effective.layerBlur.value * 2 : 0)) * scale;
      }) ?? []))
      : canvasElementStrokeOutset(node) + (node.shadow ? node.shadow.blur * 2 + Math.abs(node.shadow.x) + Math.abs(node.shadow.y) : 0) + (node.layerBlur?.visible ? node.layerBlur.value * 2 : 0);
    const rotated = pathRect
      ? rotatedRectAround(pathRect, node.rotation ?? 0, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
      : rotatedRect(rect, node.rotation);
    const visualRect = { x: rotated.x - visualOutset, y: rotated.y - visualOutset, width: rotated.width + visualOutset * 2, height: rotated.height + visualOutset * 2 };
    return { node, rect, visualRect, ...(flagsById.get(node.id) ?? { hidden: Boolean(node.hidden), locked: Boolean(node.locked) }) };
  });
}

/** Keeps the editable SVG bounded to the padded viewport while retaining scene dependencies. */
export function canvasViewportElements(index: CanvasGeometryEntry[], viewport: CanvasRect, retainedIds: Iterable<string> = [], editingBooleanId?: string): CanvasNode[] {
  const byId = new Map(index.map((entry) => [entry.node.id, entry.node]));
  const included = new Set<string>();
  for (const entry of index) {
    if (!entry.hidden && intersects(viewport, entry.visualRect)) included.add(entry.node.id);
  }
  for (const id of retainedIds) if (byId.has(id)) included.add(id);
  if (editingBooleanId) {
    included.add(editingBooleanId);
    for (const entry of index) if (entry.node.parentId === editingBooleanId) included.add(entry.node.id);
  }

  const includeDependencies = (id: string): void => {
    let current = byId.get(id);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      included.add(current.id);
      if (current.type !== "component") {
        if (current.maskId && byId.has(current.maskId)) included.add(current.maskId);
        if (current.startBindingId && byId.has(current.startBindingId)) included.add(current.startBindingId);
        if (current.endBindingId && byId.has(current.endBindingId)) included.add(current.endBindingId);
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  };
  [...included].forEach(includeDependencies);
  return index.flatMap((entry) => included.has(entry.node.id) ? [entry.node] : []);
}

/** Bounds preview work while retaining backdrops, top layers, and their scene dependencies. */
export function canvasThumbnailElements(nodes: CanvasNode[], maximum = 180): CanvasNode[] {
  if (nodes.length <= maximum) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = new Set<string>();
  const dependencyLimit = maximum * 2;
  const backgroundCount = Math.min(36, Math.floor(maximum / 4));
  nodes.slice(0, backgroundCount).forEach((node) => selected.add(node.id));
  nodes.slice(-(maximum - backgroundCount)).forEach((node) => selected.add(node.id));

  const includeDependency = (id: string | undefined): void => {
    const visited = new Set<string>();
    let currentId = id;
    while (currentId && !visited.has(currentId) && selected.size < dependencyLimit) {
      visited.add(currentId);
      const dependency = byId.get(currentId);
      if (!dependency) break;
      selected.add(dependency.id);
      if (dependency.type !== "component") {
        if (dependency.maskId) selected.add(dependency.maskId);
        if (dependency.startBindingId) selected.add(dependency.startBindingId);
        if (dependency.endBindingId) selected.add(dependency.endBindingId);
      }
      currentId = dependency.parentId;
    }
  };

  [...selected].forEach((id) => {
    const node = byId.get(id);
    includeDependency(node?.parentId);
    if (node?.type !== "component") {
      includeDependency(node?.maskId);
      includeDependency(node?.startBindingId);
      includeDependency(node?.endBindingId);
    }
  });
  return nodes.filter((node) => selected.has(node.id));
}

export function rotatedRect(rect: CanvasRect, rotation = 0): CanvasRect {
  if (!rotation) return rect;
  return rotatedRectAround(rect, rotation, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
}

function rotatedRectAround(rect: CanvasRect, rotation: number, center: { x: number; y: number }): CanvasRect {
  if (!rotation) return rect;
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ].map(([x, y]) => ({ x: center.x + (x - center.x) * cosine - (y - center.y) * sine, y: center.y + (x - center.x) * sine + (y - center.y) * cosine }));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Calculates a fixed-row virtual window with symmetric overscan. */
export function canvasVirtualRange(count: number, scrollTop: number, viewportHeight: number, rowHeight: number, overscan = 8): CanvasVirtualRange {
  if (count <= 0 || viewportHeight <= 0 || rowHeight <= 0) return { start: 0, end: count, before: 0, after: 0 };
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return { start, end, before: start * rowHeight, after: (count - end) * rowHeight };
}

/** Flattens the layer hierarchy in visual order without recursive stack growth. */
export function canvasLayerTree(nodes: CanvasNode[]): CanvasLayerTree {
  const rows: CanvasNode[] = [];
  const depthById = new Map<string, number>();
  const childrenByParent = new Map<string | undefined, CanvasNode[]>();
  const reversed = [...nodes].reverse();
  for (const node of reversed) {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  const visited = new Set<string>();
  const append = (root: CanvasNode, rootDepth: number): void => {
    const stack = [{ node: root, depth: rootDepth }];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.node.id)) continue;
      visited.add(current.node.id);
      rows.push(current.node);
      depthById.set(current.node.id, Math.min(current.depth, 8));
      const children = childrenByParent.get(current.node.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ node: children[index], depth: current.depth + 1 });
    }
  };
  for (const root of childrenByParent.get(undefined) ?? []) append(root, 0);
  for (const node of reversed) append(node, 0);
  return { rows, depthById };
}

export function selectionRect(nodes: CanvasNode[], components: CanvasComponentDefinition[]): CanvasRect | null {
  if (!nodes.length) return null;
  const rects = nodes.map((node) => rotatedRect(nodeRect(node, components), node.rotation));
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function intersects(first: CanvasRect, second: CanvasRect): boolean {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

type AxisCandidate = CanvasSnapIndexedCandidate;

interface AxisSnap {
  correction: number;
  line: CanvasSnapLine;
}

interface SpacingSnap {
  correction: number;
  measurements: CanvasSnapMeasurement[];
}

const snapKindPriority: Record<CanvasSnapTargetKind, number> = {
  guide: 0,
  "layout-grid": 1,
  shape: 2,
  frame: 3,
  page: 4,
};

function rectAxisCandidates(target: CanvasSnapRectTarget, axis: CanvasSnapAxis): AxisCandidate[] {
  const { rect } = target;
  const kind = target.kind ?? "shape";
  if (axis === "x") {
    return [rect.x, rect.x + rect.width / 2, rect.x + rect.width].map((position) => ({ position, from: rect.y, to: rect.y + rect.height, kind }));
  }
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height].map((position) => ({ position, from: rect.x, to: rect.x + rect.width, kind }));
}

function coalesceAxisCandidates(candidates: AxisCandidate[]): AxisCandidate[] {
  const sorted = candidates.sort((first, second) => first.position - second.position || snapKindPriority[first.kind] - snapKindPriority[second.kind]);
  const result: AxisCandidate[] = [];
  for (const candidate of sorted) {
    const previous = result.at(-1);
    if (!previous || Math.abs(previous.position - candidate.position) > 1e-6) {
      result.push({ ...candidate });
      continue;
    }
    previous.from = Math.min(previous.from, candidate.from);
    previous.to = Math.max(previous.to, candidate.to);
    if (snapKindPriority[candidate.kind] < snapKindPriority[previous.kind]) previous.kind = candidate.kind;
  }
  return result;
}

/** Prepares sorted, coalesced snap data once at gesture start. */
export function prepareCanvasSnapIndex(rectTargets: CanvasSnapRectTarget[], axisTargets: CanvasSnapAxisTarget[], pageRect: CanvasRect): CanvasSnapIndex {
  const candidates = (axis: CanvasSnapAxis): AxisCandidate[] => coalesceAxisCandidates([
    ...rectTargets.flatMap((target) => rectAxisCandidates(target, axis)),
    ...rectAxisCandidates({ id: "page", rect: pageRect, kind: "page" }, axis),
    ...axisTargets.filter((target) => target.axis === axis).map((target) => ({
      position: target.position,
      from: target.from ?? (axis === "x" ? pageRect.y : pageRect.x),
      to: target.to ?? (axis === "x" ? pageRect.y + pageRect.height : pageRect.x + pageRect.width),
      kind: target.kind,
    })),
  ]);
  return {
    x: candidates("x"),
    y: candidates("y"),
    rectsByLeft: [...rectTargets].sort((first, second) => first.rect.x - second.rect.x),
    rectsByRight: [...rectTargets].sort((first, second) => first.rect.x + first.rect.width - (second.rect.x + second.rect.width)),
    rectsByTop: [...rectTargets].sort((first, second) => first.rect.y - second.rect.y),
    rectsByBottom: [...rectTargets].sort((first, second) => first.rect.y + first.rect.height - (second.rect.y + second.rect.height)),
  };
}

function lowerBound<T>(items: T[], value: number, coordinate: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (coordinate(items[middle]) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound<T>(items: T[], value: number, coordinate: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (coordinate(items[middle]) <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nearbyAxisCandidates(candidates: AxisCandidate[], anchors: number[], threshold: number): AxisCandidate[] {
  const result = new Set<AxisCandidate>();
  for (const anchor of anchors) {
    const start = lowerBound(candidates, anchor - threshold, (candidate) => candidate.position);
    const end = upperBound(candidates, anchor + threshold, (candidate) => candidate.position);
    for (let index = start; index < end; index += 1) result.add(candidates[index]);
  }
  return [...result];
}

function closestAxisSnap(axis: CanvasSnapAxis, bounds: CanvasRect, delta: number, candidates: AxisCandidate[], threshold: number): AxisSnap | undefined {
  const start = axis === "x" ? bounds.x + delta : bounds.y + delta;
  const size = axis === "x" ? bounds.width : bounds.height;
  const anchors = [start, start + size / 2, start + size];
  let best: { correction: number; candidate: AxisCandidate } | undefined;
  for (const anchor of anchors) {
    for (const candidate of candidates) {
      const correction = candidate.position - anchor;
      if (Math.abs(correction) > threshold) continue;
      if (!best
        || Math.abs(correction) < Math.abs(best.correction) - 1e-6
        || Math.abs(Math.abs(correction) - Math.abs(best.correction)) <= 1e-6 && snapKindPriority[candidate.kind] < snapKindPriority[best.candidate.kind]) {
        best = { correction, candidate };
      }
    }
  }
  if (!best) return undefined;
  const sameLine = candidates.filter((candidate) => Math.abs(candidate.position - best!.candidate.position) <= 1e-6);
  return {
    correction: best.correction,
    line: {
      axis,
      position: best.candidate.position,
      from: Math.min(...sameLine.map((candidate) => candidate.from)),
      to: Math.max(...sameLine.map((candidate) => candidate.to)),
      kind: best.candidate.kind,
    },
  };
}

function perpendicularOverlap(first: CanvasRect, second: CanvasRect, axis: CanvasSnapAxis): number {
  if (axis === "x") return Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
}

function closestSpacingSnap(axis: CanvasSnapAxis, moving: CanvasRect, index: CanvasSnapIndex, threshold: number): SpacingSnap | undefined {
  const scanLimit = 96;
  if (axis === "x") {
    let left: CanvasSnapRectTarget | undefined;
    let right: CanvasSnapRectTarget | undefined;
    const leftStart = upperBound(index.rectsByRight, moving.x + threshold, (target) => target.rect.x + target.rect.width) - 1;
    const rightStart = lowerBound(index.rectsByLeft, moving.x + moving.width - threshold, (target) => target.rect.x);
    for (let offset = 0; offset < scanLimit && leftStart - offset >= 0; offset += 1) {
      const target = index.rectsByRight[leftStart - offset];
      if (perpendicularOverlap(moving, target.rect, axis) > 0) { left = target; break; }
    }
    for (let offset = 0; offset < scanLimit && rightStart + offset < index.rectsByLeft.length; offset += 1) {
      const target = index.rectsByLeft[rightStart + offset];
      if (perpendicularOverlap(moving, target.rect, axis) > 0) { right = target; break; }
    }
    if (!left || !right || left.id === right.id) return undefined;
    const correction = (left.rect.x + left.rect.width + right.rect.x - moving.width) / 2 - moving.x;
    if (Math.abs(correction) > threshold) return undefined;
    const next = { ...moving, x: moving.x + correction };
    const gap = next.x - (left.rect.x + left.rect.width);
    if (gap < 0 || Math.abs(right.rect.x - (next.x + next.width) - gap) > 1e-6) return undefined;
    const cross = Math.min(left.rect.y, next.y, right.rect.y) - 10;
    return {
      correction,
      measurements: [
        { axis, start: left.rect.x + left.rect.width, end: next.x, cross, value: gap },
        { axis, start: next.x + next.width, end: right.rect.x, cross, value: gap },
      ],
    };
  }
  let top: CanvasSnapRectTarget | undefined;
  let bottom: CanvasSnapRectTarget | undefined;
  const topStart = upperBound(index.rectsByBottom, moving.y + threshold, (target) => target.rect.y + target.rect.height) - 1;
  const bottomStart = lowerBound(index.rectsByTop, moving.y + moving.height - threshold, (target) => target.rect.y);
  for (let offset = 0; offset < scanLimit && topStart - offset >= 0; offset += 1) {
    const target = index.rectsByBottom[topStart - offset];
    if (perpendicularOverlap(moving, target.rect, axis) > 0) { top = target; break; }
  }
  for (let offset = 0; offset < scanLimit && bottomStart + offset < index.rectsByTop.length; offset += 1) {
    const target = index.rectsByTop[bottomStart + offset];
    if (perpendicularOverlap(moving, target.rect, axis) > 0) { bottom = target; break; }
  }
  if (!top || !bottom || top.id === bottom.id) return undefined;
  const correction = (top.rect.y + top.rect.height + bottom.rect.y - moving.height) / 2 - moving.y;
  if (Math.abs(correction) > threshold) return undefined;
  const next = { ...moving, y: moving.y + correction };
  const gap = next.y - (top.rect.y + top.rect.height);
  if (gap < 0 || Math.abs(bottom.rect.y - (next.y + next.height) - gap) > 1e-6) return undefined;
  const cross = Math.min(top.rect.x, next.x, bottom.rect.x) - 10;
  return {
    correction,
    measurements: [
      { axis, start: top.rect.y + top.rect.height, end: next.y, cross, value: gap },
      { axis, start: next.y + next.height, end: bottom.rect.y, cross, value: gap },
    ],
  };
}

/**
 * Resolves one move against semantic shape/page points, ruler and layout guides,
 * equal spacing, then the pixel grid. The pure result is shared by pointer
 * interaction tests and the transient canvas feedback renderer.
 */
export function snapCanvasMove(input: CanvasMoveSnapInput): CanvasMoveSnapResult {
  if (input.disabled) return { deltaX: input.deltaX, deltaY: input.deltaY, lines: [], measurements: [] };
  const snapIndex = input.snapIndex ?? prepareCanvasSnapIndex(input.rectTargets ?? [], input.axisTargets ?? [], input.pageRect);
  const proposed = { ...input.bounds, x: input.bounds.x + input.deltaX, y: input.bounds.y + input.deltaY };
  const xAnchors = [proposed.x, proposed.x + proposed.width / 2, proposed.x + proposed.width];
  const yAnchors = [proposed.y, proposed.y + proposed.height / 2, proposed.y + proposed.height];
  const xAlignment = closestAxisSnap("x", input.bounds, input.deltaX, nearbyAxisCandidates(snapIndex.x, xAnchors, input.threshold), input.threshold);
  const yAlignment = closestAxisSnap("y", input.bounds, input.deltaY, nearbyAxisCandidates(snapIndex.y, yAnchors, input.threshold), input.threshold);
  const xSpacing = closestSpacingSnap("x", proposed, snapIndex, input.threshold);
  const ySpacing = closestSpacingSnap("y", proposed, snapIndex, input.threshold);
  const useXSpacing = xSpacing && (!xAlignment || Math.abs(xSpacing.correction) < Math.abs(xAlignment.correction) - 1e-6);
  const useYSpacing = ySpacing && (!yAlignment || Math.abs(ySpacing.correction) < Math.abs(yAlignment.correction) - 1e-6);
  let deltaX = input.deltaX + (useXSpacing ? xSpacing.correction : xAlignment?.correction ?? 0);
  let deltaY = input.deltaY + (useYSpacing ? ySpacing.correction : yAlignment?.correction ?? 0);
  if (!useXSpacing && !xAlignment && input.snapToGrid) {
    const size = Math.max(1, input.gridSize ?? 8);
    const origin = input.gridOriginX ?? 0;
    deltaX = Math.round((input.bounds.x + deltaX - origin) / size) * size + origin - input.bounds.x;
  }
  if (!useYSpacing && !yAlignment && input.snapToGrid) {
    const size = Math.max(1, input.gridSize ?? 8);
    const origin = input.gridOriginY ?? 0;
    deltaY = Math.round((input.bounds.y + deltaY - origin) / size) * size + origin - input.bounds.y;
  }
  const moved = { ...input.bounds, x: input.bounds.x + deltaX, y: input.bounds.y + deltaY };
  const lines = [!useXSpacing && xAlignment?.line, !useYSpacing && yAlignment?.line].filter((line): line is CanvasSnapLine => Boolean(line)).map((line) => line.axis === "x"
    ? { ...line, from: Math.min(line.from, moved.y), to: Math.max(line.to, moved.y + moved.height) }
    : { ...line, from: Math.min(line.from, moved.x), to: Math.max(line.to, moved.x + moved.width) });
  return {
    deltaX,
    deltaY,
    lines,
    measurements: [...(useXSpacing ? xSpacing.measurements : []), ...(useYSpacing ? ySpacing.measurements : [])],
  };
}

export function effectivePrimitive(node: CanvasPrimitiveNode, componentNode: CanvasComponentNode): CanvasPrimitiveNode {
  const override = componentNode.overrides?.[node.id];
  return override ? { ...node, ...override } : node;
}

export function directChildren(nodes: CanvasNode[], parentId: string): CanvasNode[] {
  return nodes.filter((node) => node.parentId === parentId);
}

export function descendantIds(nodes: CanvasNode[], parentIds: string[]): string[] {
  const result = new Set<string>();
  let frontier = [...parentIds];
  while (frontier.length) {
    const children = nodes.filter((node) => node.parentId && frontier.includes(node.parentId));
    frontier = [];
    for (const child of children) {
      if (result.has(child.id)) continue;
      result.add(child.id);
      frontier.push(child.id);
    }
  }
  return [...result];
}

export function applyFrameLayout(nodes: CanvasNode[], frameId: string, components: CanvasComponentDefinition[]): CanvasNode[] {
  return applyFrameLayoutCascade(nodes, frameId, components, new Set());
}

function constrainedAxis(origin: { position: number; size: number }, parentOrigin: { position: number; size: number }, parentNext: { position: number; size: number }, constraint: CanvasHorizontalConstraint | CanvasVerticalConstraint): { position: number; size: number } {
  const leading = origin.position - parentOrigin.position;
  const trailing = parentOrigin.position + parentOrigin.size - (origin.position + origin.size);
  if (constraint === "right" || constraint === "bottom") return { position: parentNext.position + parentNext.size - trailing - origin.size, size: origin.size };
  if (constraint === "left-right" || constraint === "top-bottom") return { position: parentNext.position + leading, size: Math.max(1, parentNext.size - leading - trailing) };
  if (constraint === "center") return { position: parentNext.position + parentNext.size / 2 + (origin.position + origin.size / 2 - (parentOrigin.position + parentOrigin.size / 2)) - origin.size / 2, size: origin.size };
  if (constraint === "scale") {
    const scale = parentNext.size / Math.max(1, parentOrigin.size);
    return { position: parentNext.position + leading * scale, size: Math.max(1, origin.size * scale) };
  }
  return { position: parentNext.position + leading, size: origin.size };
}

/** Applies Penpot-style explicit child constraints when a non-layout frame changes bounds. */
export function applyFrameResizeConstraints(before: CanvasNode[], after: CanvasNode[], frameId: string): CanvasNode[] {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  const resultById = new Map(after.map((node) => [node.id, node]));
  const visited = new Set<string>();

  const resizeChildren = (parentId: string): void => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const parentBefore = beforeById.get(parentId);
    const parentAfter = resultById.get(parentId);
    if (!parentBefore || !parentAfter) return;
    for (const childBefore of before.filter((node) => node.parentId === parentId)) {
      const childCurrent = resultById.get(childBefore.id);
      if (!childCurrent) continue;
      const horizontal = constrainedAxis(
        { position: childBefore.x, size: childBefore.width },
        { position: parentBefore.x, size: parentBefore.width },
        { position: parentAfter.x, size: parentAfter.width },
        childBefore.constraintH ?? "left",
      );
      const vertical = constrainedAxis(
        { position: childBefore.y, size: childBefore.height },
        { position: parentBefore.y, size: parentBefore.height },
        { position: parentAfter.y, size: parentAfter.height },
        childBefore.constraintV ?? "top",
      );
      resultById.set(childBefore.id, { ...childCurrent, x: horizontal.position, y: vertical.position, width: horizontal.size, height: vertical.size } as CanvasNode);
      resizeChildren(childBefore.id);
    }
  };

  resizeChildren(frameId);
  return after.map((node) => resultById.get(node.id) ?? node);
}

function applyFrameLayoutCascade(nodes: CanvasNode[], frameId: string, components: CanvasComponentDefinition[], visitedFrames: Set<string>): CanvasNode[] {
  if (visitedFrames.has(frameId)) return nodes;
  visitedFrames.add(frameId);
  const frame = nodes.find((node): node is CanvasPrimitiveNode => node.id === frameId && node.type === "frame");
  if (!frame?.layout) return nodes;
  const children = directChildren(nodes, frameId).filter((node) => node.layoutPosition !== "absolute" && !node.hidden);
  if (!children.length) {
    if (frame.layout.sizing !== "hug") return nodes;
    const size = Math.max(1, frame.layout.padding * 2);
    const result = nodes.map((node) => node.id === frameId ? { ...frame, width: size, height: size } : node);
    if (!frame.parentId || frame.layoutPosition === "absolute") return result;
    const parent = result.find((node) => node.id === frame.parentId);
    return parent?.type === "frame" && parent.layout ? applyFrameLayoutCascade(result, parent.id, components, visitedFrames) : result;
  }
  const layout = frame.layout;
  const sizes = children.map((node) => ({ node, ...nodeSize(node, components) }));
  const mainSizes = sizes.map((size) => layout.direction === "row" ? size.width : size.height);
  const crossSizes = sizes.map((size) => layout.direction === "row" ? size.height : size.width);
  const contentMain = mainSizes.reduce((sum, size) => sum + size, 0) + layout.gap * Math.max(0, sizes.length - 1);
  const contentCross = Math.max(...crossSizes);
  const nextFrame = layout.sizing === "hug"
    ? {
        ...frame,
        width: layout.direction === "row" ? contentMain + layout.padding * 2 : contentCross + layout.padding * 2,
        height: layout.direction === "row" ? contentCross + layout.padding * 2 : contentMain + layout.padding * 2,
      }
    : frame;
  const availableMain = (layout.direction === "row" ? nextFrame.width : nextFrame.height) - layout.padding * 2;
  const availableCross = (layout.direction === "row" ? nextFrame.height : nextFrame.width) - layout.padding * 2;
  const wraps = Boolean(layout.wrap) && layout.sizing === "fixed";
  const lines: typeof sizes[] = [];
  for (const size of sizes) {
    const line = lines.at(-1);
    const sizeMain = layout.direction === "row" ? size.width : size.height;
    const lineMain = line?.reduce((sum, candidate) => sum + (layout.direction === "row" ? candidate.width : candidate.height), 0) ?? 0;
    const required = lineMain + (line?.length ? layout.gap * line.length : 0) + sizeMain;
    if (wraps && line?.length && required > availableMain) lines.push([size]);
    else if (line) line.push(size);
    else lines.push([size]);
  }
  const positioned = new Map<string, { x: number; y: number }>();
  let crossCursor = layout.padding;
  for (const line of lines) {
    const lineMainSizes = line.map((size) => layout.direction === "row" ? size.width : size.height);
    const lineContentMain = lineMainSizes.reduce((sum, size) => sum + size, 0) + layout.gap * Math.max(0, line.length - 1);
    const lineCross = wraps ? Math.max(...line.map((size) => layout.direction === "row" ? size.height : size.width)) : availableCross;
    let gap = layout.gap;
    let cursor = layout.padding;
    if (layout.justify === "center") cursor += Math.max(0, (availableMain - lineContentMain) / 2);
    if (layout.justify === "end") cursor += Math.max(0, availableMain - lineContentMain);
    if (layout.justify === "space-between" && line.length > 1) gap = Math.max(layout.gap, (availableMain - lineMainSizes.reduce((sum, size) => sum + size, 0)) / (line.length - 1));
    for (const size of line) {
      const crossSize = layout.direction === "row" ? size.height : size.width;
      const cross = crossCursor + (layout.align === "center" ? (lineCross - crossSize) / 2 : layout.align === "end" ? lineCross - crossSize : 0);
      positioned.set(size.node.id, layout.direction === "row"
        ? { x: nextFrame.x + cursor, y: nextFrame.y + cross }
        : { x: nextFrame.x + cross, y: nextFrame.y + cursor });
      cursor += (layout.direction === "row" ? size.width : size.height) + gap;
    }
    crossCursor += lineCross + (layout.crossGap ?? layout.gap);
  }
  const deltas = new Map(children.map((child) => {
    const position = positioned.get(child.id)!;
    return [child.id, { x: position.x - child.x, y: position.y - child.y }] as const;
  }));
  const result = nodes.map((node) => {
    if (node.id === frameId) return nextFrame;
    const position = positioned.get(node.id);
    if (position) return { ...node, ...position };
    let parentId = node.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const delta = deltas.get(parentId);
      if (delta) return { ...node, x: node.x + delta.x, y: node.y + delta.y };
      parentId = nodes.find((candidate) => candidate.id === parentId)?.parentId;
    }
    return node;
  });
  if (!frame.parentId || frame.layoutPosition === "absolute") return result;
  const parent = result.find((node) => node.id === frame.parentId);
  return parent?.type === "frame" && parent.layout ? applyFrameLayoutCascade(result, parent.id, components, visitedFrames) : result;
}

export function nodeLabel(node: CanvasNode): string {
  if (node.name) return node.name;
  if (node.type === "component") return "Component";
  if (node.type === "text") return node.text || "Text";
  if (node.type === "boolean") return "Boolean group";
  return node.type[0].toUpperCase() + node.type.slice(1);
}
