import type { CanvasComponentDefinition, CanvasComponentElement, CanvasElement, CanvasPage } from "../../../shared/types";
import { CANVAS_COMPONENT_MAX_DEPTH, CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES, canvasComponentLegacyOverridePaths, canvasComponentOverrideAtPath, canvasComponentPath } from "../../../shared/canvas-components";

export interface CanvasPrototypeLayerMatch {
  key: string;
  source: CanvasElement;
  destination: CanvasElement;
  sourceElementIds: string[];
  destinationElementIds: string[];
}

const maxSmartLayerMatches = 32;
const prototypeIdPart = (value: string): string => `${value.length}x${Array.from(value, (character) => character.codePointAt(0)!.toString(16)).join("-")}`;
const expandedComponentId = (rootId: string, path: string): string => `canvas-component-expanded-${prototypeIdPart(rootId)}-${prototypeIdPart(path)}`;

type Affine = [number, number, number, number, number, number];
const multiplyAffine = (outer: Affine, inner: Affine): Affine => [
  outer[0] * inner[0] + outer[2] * inner[1], outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3], outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4], outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];
const translateAffine = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
const scaleAffine = (x: number, y: number): Affine => [x, 0, 0, y, 0, 0];
const rotateAffine = (degrees: number): Affine => {
  const radians = degrees * Math.PI / 180;
  return [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
};
const aroundRectAffine = (x: number, y: number, width: number, height: number, rotation = 0): Affine => multiplyAffine(
  multiplyAffine(translateAffine(x + width / 2, y + height / 2), rotateAffine(rotation)),
  translateAffine(-width / 2, -height / 2),
);
const transformPoint = (matrix: Affine, x: number, y: number): { x: number; y: number } => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
const transformedBounds = (matrix: Affine, node: CanvasElement): { x: number; y: number; width: number; height: number } => {
  const rotation = node.rotation ?? 0;
  const local = multiplyAffine(matrix, aroundRectAffine(node.x, node.y, node.width, node.height, rotation));
  const corners = [transformPoint(local, 0, 0), transformPoint(local, node.width, 0), transformPoint(local, 0, node.height), transformPoint(local, node.width, node.height)];
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  return { x, y, width: Math.max(...corners.map((point) => point.x)) - x, height: Math.max(...corners.map((point) => point.y)) - y };
};

/** Expands nested component interactions into absolute page-space hotspot layers. */
export function canvasPrototypeInteractiveElements(page: CanvasPage, components: CanvasComponentDefinition[]): CanvasElement[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const pageById = new Map(page.elements.map((element) => [element.id, element]));
  const result = [...page.elements];
  const budget = { remaining: CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES };
  const visit = (definition: CanvasComponentDefinition, matrix: Affine, rootId: string, prefix: string, fixed: boolean, ancestors: Set<string>, depth: number, scopes: Array<{ prefix: string; overrides?: CanvasComponentElement["overrides"] }>, budget: { remaining: number }): void => {
    if (depth > CANVAS_COMPONENT_MAX_DEPTH || ancestors.has(definition.id) || budget.remaining <= 0) return;
    const nextAncestors = new Set(ancestors).add(definition.id);
    const legacyPaths = canvasComponentLegacyOverridePaths(definition, components);
    for (const source of definition.nodes) {
      if (budget.remaining-- <= 0) return;
      const path = canvasComponentPath(prefix, source.id);
      const child: CanvasElement = source.type === "component" ? source : { ...source, ...canvasComponentOverrideAtPath(path, scopes, prefix, legacyPaths.get(canvasComponentPath("", source.id))) };
      const bounds = transformedBounds(matrix, child);
      const parentPath = child.parentId ? canvasComponentPath(prefix, child.parentId) : prefix;
      result.push({
        ...child,
        id: expandedComponentId(rootId, path),
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        parentId: parentPath ? expandedComponentId(rootId, parentPath) : rootId,
        ...(child.type !== "component" && child.maskId ? { maskId: expandedComponentId(rootId, canvasComponentPath(prefix, child.maskId)) } : {}),
        fixedInPrototype: fixed || undefined,
      });
      if (child.type !== "component" || child.hidden) continue;
      const nested = byId.get(child.componentId);
      if (!nested) continue;
      const childMatrix = multiplyAffine(matrix, multiplyAffine(aroundRectAffine(child.x, child.y, child.width, child.height, child.rotation), scaleAffine(child.width / Math.max(1, nested.width), child.height / Math.max(1, nested.height))));
      visit(nested, childMatrix, rootId, path, fixed, nextAncestors, depth + 1, [...scopes, { prefix: path, overrides: child.overrides }], budget);
    }
  };
  for (const node of page.elements) {
    if (node.type !== "component" || node.hidden) continue;
    const definition = byId.get(node.componentId);
    if (!definition) continue;
    let fixed = Boolean(node.fixedInPrototype);
    let parentId = node.parentId;
    const visited = new Set<string>();
    while (!fixed && parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = pageById.get(parentId);
      fixed = Boolean(parent?.fixedInPrototype);
      parentId = parent?.parentId;
    }
    const matrix = multiplyAffine(aroundRectAffine(node.x, node.y, node.width, node.height, node.rotation), scaleAffine(node.width / Math.max(1, definition.width), node.height / Math.max(1, definition.height)));
    visit(definition, matrix, node.id, "", fixed, new Set(), 1, [{ prefix: "", overrides: node.overrides }], budget);
  }
  return result;
}

export interface CanvasPrototypePageLayers {
  fixedRootIds: string[];
  fixedElementIds: Set<string>;
  scrollingElementIds: string[];
}

/** Partitions a page into scrolling content and topmost fixed layer subtrees in linear time. */
export function canvasPrototypePageLayers(page: CanvasPage): CanvasPrototypePageLayers {
  const elementsById = new Map(page.elements.map((element) => [element.id, element]));
  const fixedDeclarations = new Set(page.elements.filter((element) => element.fixedInPrototype).map((element) => element.id));
  const booleanAncestorById = new Map<string, string | undefined>();
  for (const element of page.elements) {
    if (booleanAncestorById.has(element.id)) continue;
    const path: CanvasElement[] = [];
    const visited = new Set<string>();
    let current: CanvasElement | undefined = element;
    while (current && !booleanAncestorById.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? elementsById.get(current.parentId) : undefined;
    }
    let booleanAncestor = current ? booleanAncestorById.get(current.id) : undefined;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (path[index].type === "boolean") booleanAncestor = path[index].id;
      booleanAncestorById.set(path[index].id, booleanAncestor);
    }
  }
  for (const declaration of [...fixedDeclarations]) {
    const booleanAncestor = booleanAncestorById.get(declaration);
    if (booleanAncestor) fixedDeclarations.add(booleanAncestor);
  }
  const fixedById = new Map<string, boolean>();
  const fixedRootById = new Map<string, string | undefined>();
  for (const element of page.elements) {
    if (fixedById.has(element.id)) continue;
    const path: CanvasElement[] = [];
    const visited = new Set<string>();
    let current: CanvasElement | undefined = element;
    while (current && !fixedById.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? elementsById.get(current.parentId) : undefined;
    }
    let inheritedFixed = current ? fixedById.get(current.id) ?? false : false;
    let inheritedRoot = current ? fixedRootById.get(current.id) : undefined;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const node = path[index];
      if (!inheritedFixed && fixedDeclarations.has(node.id)) {
        inheritedFixed = true;
        inheritedRoot = node.id;
      }
      fixedById.set(node.id, inheritedFixed);
      fixedRootById.set(node.id, inheritedRoot);
    }
  }
  const fixedElementIds = new Set(page.elements.filter((element) => fixedById.get(element.id)).map((element) => element.id));
  const fixedRootIds = page.elements.filter((element) => fixedRootById.get(element.id) === element.id).map((element) => element.id);
  return {
    fixedRootIds,
    fixedElementIds,
    scrollingElementIds: page.elements.filter((element) => !fixedElementIds.has(element.id)).map((element) => element.id),
  };
}

interface PrototypePageIndex {
  childrenById: Map<string, string[]>;
  depthById: Map<string, number>;
  entryById: Map<string, number>;
  exitById: Map<string, number>;
  explicitByKey: Map<string, CanvasElement>;
  rootFallbackByKey: Map<string, CanvasElement>;
  orderById: Map<string, number>;
}

function uniqueLayers(layers: CanvasElement[], keyFor: (layer: CanvasElement) => string | undefined): Map<string, CanvasElement> {
  const counts = new Map<string, number>();
  for (const layer of layers) {
    const key = keyFor(layer);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(layers.flatMap((layer) => {
    const key = keyFor(layer);
    return key && counts.get(key) === 1 ? [[key, layer] as const] : [];
  }));
}

function pageIndex(page: CanvasPage): PrototypePageIndex {
  const elementsById = new Map(page.elements.map((element) => [element.id, element]));
  const childrenById = new Map<string, string[]>();
  const orderById = new Map(page.elements.map((element, index) => [element.id, index]));
  for (const element of page.elements) {
    if (!element.parentId) continue;
    childrenById.set(element.parentId, [...(childrenById.get(element.parentId) ?? []), element.id]);
  }

  const depthById = new Map<string, number>();
  const hiddenById = new Map<string, boolean>();
  for (const element of page.elements) {
    if (depthById.has(element.id)) continue;
    const path: CanvasElement[] = [];
    const visited = new Set<string>();
    let current: CanvasElement | undefined = element;
    while (current && !depthById.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? elementsById.get(current.parentId) : undefined;
    }
    let depth = current ? depthById.get(current.id) ?? -1 : -1;
    let hidden = current ? hiddenById.get(current.id) ?? false : false;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      depth += 1;
      hidden ||= Boolean(path[index].hidden);
      depthById.set(path[index].id, depth);
      hiddenById.set(path[index].id, hidden);
    }
  }

  const visible = page.elements.filter((element) => !hiddenById.get(element.id));
  const entryById = new Map<string, number>();
  const exitById = new Map<string, number>();
  const traversed = new Set<string>();
  let clock = 0;
  const traverse = (rootId: string): void => {
    const stack: Array<{ id: string; exit: boolean }> = [{ id: rootId, exit: false }];
    while (stack.length) {
      const step = stack.pop()!;
      if (step.exit) {
        exitById.set(step.id, clock++);
        continue;
      }
      if (traversed.has(step.id)) continue;
      traversed.add(step.id);
      entryById.set(step.id, clock++);
      stack.push({ id: step.id, exit: true });
      const children = childrenById.get(step.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ id: children[index], exit: false });
    }
  };
  for (const element of page.elements) if (!element.parentId || !elementsById.has(element.parentId)) traverse(element.id);
  for (const element of page.elements) if (!traversed.has(element.id)) traverse(element.id);
  const explicitByKey = uniqueLayers(visible.filter((element) => element.prototypeKey?.trim()), (element) => element.prototypeKey?.trim());
  const roots = visible.filter((element) => !element.parentId);
  const rootFallbackByKey = uniqueLayers(roots, (element) => element.name?.trim() || element.id);
  return { childrenById, depthById, entryById, exitById, explicitByKey, rootFallbackByKey, orderById };
}

function treeElementIds(index: PrototypePageIndex, rootId: string): string[] {
  const result: string[] = [];
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    pending.push(...(index.childrenById.get(id) ?? []));
  }
  return result;
}

function related(index: PrototypePageIndex, firstId: string, secondId: string): boolean {
  const firstEntry = index.entryById.get(firstId);
  const firstExit = index.exitById.get(firstId);
  const secondEntry = index.entryById.get(secondId);
  const secondExit = index.exitById.get(secondId);
  if (firstEntry === undefined || firstExit === undefined || secondEntry === undefined || secondExit === undefined) return firstId === secondId;
  return firstEntry <= secondEntry && secondExit <= firstExit
    || secondEntry <= firstEntry && firstExit <= secondExit;
}

/** Matches a bounded set of non-overlapping visible layers between equal-sized screens. */
export function canvasPrototypeLayerMatches(source: CanvasPage | undefined, destination: CanvasPage | undefined): CanvasPrototypeLayerMatch[] {
  if (!source || !destination || source.prototypeViewport || destination.prototypeViewport || source.frame.width !== destination.frame.width || source.frame.height !== destination.frame.height) return [];
  const sourceIndex = pageIndex(source);
  const destinationIndex = pageIndex(destination);
  const candidates = [
    ...[...destinationIndex.explicitByKey].flatMap(([key, destinationNode]) => {
      const sourceNode = sourceIndex.explicitByKey.get(key);
      return sourceNode ? [{ key: `key:${key}`, source: sourceNode, destination: destinationNode, explicit: true }] : [];
    }),
    ...[...destinationIndex.rootFallbackByKey].flatMap(([key, destinationNode]) => {
      const sourceNode = sourceIndex.rootFallbackByKey.get(key);
      return sourceNode ? [{ key: `name:${key}`, source: sourceNode, destination: destinationNode, explicit: false }] : [];
    }),
  ].sort((first, second) => Number(second.explicit) - Number(first.explicit)
    || (destinationIndex.depthById.get(second.destination.id) ?? 0) - (destinationIndex.depthById.get(first.destination.id) ?? 0)
    || (destinationIndex.orderById.get(first.destination.id) ?? 0) - (destinationIndex.orderById.get(second.destination.id) ?? 0));

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.length >= maxSmartLayerMatches) break;
    if (selected.some((match) => related(sourceIndex, candidate.source.id, match.source.id) || related(destinationIndex, candidate.destination.id, match.destination.id))) continue;
    selected.push(candidate);
  }

  return selected
    .sort((first, second) => (destinationIndex.orderById.get(first.destination.id) ?? 0) - (destinationIndex.orderById.get(second.destination.id) ?? 0))
    .map(({ key, source: sourceNode, destination: destinationNode }) => ({
      key,
      source: sourceNode,
      destination: destinationNode,
      sourceElementIds: treeElementIds(sourceIndex, sourceNode.id),
      destinationElementIds: treeElementIds(destinationIndex, destinationNode.id),
    }));
}
