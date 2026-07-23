import type { CanvasComponentDefinition, CanvasComponentElement, CanvasPrimitiveElement } from "./types";

export const CANVAS_COMPONENT_MAX_DEPTH = 32;
export const CANVAS_COMPONENT_MAX_EXPANDED_NODES = 20_000;
export const CANVAS_COMPONENT_MAX_SCENE_EXPANDED_NODES = 100_000;

export interface CanvasComponentPrimitiveSource {
  path: string;
  node: CanvasPrimitiveElement;
  /** Source plus overrides authored on nested instances inside the definition. */
  effective: CanvasPrimitiveElement;
}

export type CanvasComponentGraphIssue =
  | { kind: "missing"; componentId: string; referencedId: string }
  | { kind: "cycle"; componentId: string }
  | { kind: "depth"; componentId: string }
  | { kind: "size"; componentId: string };

export function canvasComponentPath(prefix: string, id: string): string {
  const segment = id.replace(/~/g, "~0").replace(/\//g, "~1");
  return prefix ? `${prefix}/${segment}` : segment;
}

/** Raw-key aliases accepted for unambiguous primitives created before nested paths existed. */
export function canvasComponentLegacyOverridePaths(definition: CanvasComponentDefinition, components: CanvasComponentDefinition[] = [definition]): Map<string, string> {
  const candidates = definition.nodes.filter((node): node is CanvasPrimitiveElement => node.type !== "component" && canvasComponentPath("", node.id) !== node.id);
  if (!candidates.length) return new Map();
  const canonicalPaths = new Set(canvasComponentPrimitiveSources(definition, components, false).map((source) => source.path));
  return new Map(candidates.flatMap((node) => {
    const canonical = canvasComponentPath("", node.id);
    return !canonicalPaths.has(node.id) ? [[canonical, node.id] as const] : [];
  }));
}

/** Raw legacy keys that now collide with a canonical nested path. Maps raw key to the direct node's canonical path. */
export function canvasComponentAmbiguousLegacyOverridePaths(definition: CanvasComponentDefinition, components: CanvasComponentDefinition[] = [definition]): Map<string, string> {
  const candidates = definition.nodes.filter((node): node is CanvasPrimitiveElement => node.type !== "component" && canvasComponentPath("", node.id) !== node.id);
  if (!candidates.length) return new Map();
  const canonicalPaths = new Set(canvasComponentPrimitiveSources(definition, components, false).map((source) => source.path));
  return new Map(candidates.flatMap((node) => canonicalPaths.has(node.id) ? [[node.id, canvasComponentPath("", node.id)] as const] : []));
}

/** Validates definition references with an iterative DFS so hostile data cannot exhaust the stack. */
export function canvasComponentGraphIssue(components: CanvasComponentDefinition[]): CanvasComponentGraphIssue | undefined {
  const byId = new Map(components.map((component) => [component.id, component]));
  const state = new Map<string, "visiting" | "complete">();
  const depthById = new Map<string, number>();
  const expandedById = new Map<string, number>();
  for (const root of components) {
    if (state.get(root.id) === "complete") continue;
    const stack: Array<{ id: string; references: string[]; index: number }> = [{
      id: root.id,
      references: root.nodes.flatMap((node) => node.type === "component" ? [node.componentId] : []),
      index: 0,
    }];
    state.set(root.id, "visiting");
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.references.length) {
        const definition = byId.get(frame.id)!;
        const depth = 1 + Math.max(0, ...frame.references.map((id) => depthById.get(id) ?? 0));
        const expanded = definition.nodes.length + frame.references.reduce((count, id) => Math.min(CANVAS_COMPONENT_MAX_EXPANDED_NODES + 1, count + (expandedById.get(id) ?? 0)), 0);
        if (depth > CANVAS_COMPONENT_MAX_DEPTH) return { kind: "depth", componentId: frame.id };
        if (expanded > CANVAS_COMPONENT_MAX_EXPANDED_NODES) return { kind: "size", componentId: frame.id };
        depthById.set(frame.id, depth);
        expandedById.set(frame.id, expanded);
        state.set(frame.id, "complete");
        stack.pop();
        continue;
      }
      const referencedId = frame.references[frame.index++];
      const referenced = byId.get(referencedId);
      if (!referenced) return { kind: "missing", componentId: frame.id, referencedId };
      if (state.get(referencedId) === "visiting") return { kind: "cycle", componentId: referencedId };
      if (state.get(referencedId) === "complete") continue;
      state.set(referencedId, "visiting");
      stack.push({
        id: referencedId,
        references: referenced.nodes.flatMap((node) => node.type === "component" ? [node.componentId] : []),
        index: 0,
      });
    }
  }
  return undefined;
}

/** Returns all editable primitive sources in visual tree order, guarded against cycles and excessive depth. */
export function canvasComponentPrimitiveSources(
  definition: CanvasComponentDefinition,
  components: CanvasComponentDefinition[],
  includeLegacyOverrides = true,
): CanvasComponentPrimitiveSource[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const result: CanvasComponentPrimitiveSource[] = [];
  let remaining = CANVAS_COMPONENT_MAX_EXPANDED_NODES;
  const visit = (current: CanvasComponentDefinition, prefix: string, ancestors: Set<string>, depth: number, scopes: Array<{ prefix: string; overrides?: CanvasComponentElement["overrides"] }>): void => {
    if (depth > CANVAS_COMPONENT_MAX_DEPTH || ancestors.has(current.id) || remaining <= 0) return;
    const nextAncestors = new Set(ancestors).add(current.id);
    const legacyPaths = includeLegacyOverrides ? canvasComponentLegacyOverridePaths(current, components) : new Map<string, string>();
    for (const node of current.nodes) {
      if (remaining-- <= 0) return;
      const path = canvasComponentPath(prefix, node.id);
      if (node.type !== "component") result.push({ path, node, effective: { ...node, ...canvasComponentOverrideAtPath(path, scopes, prefix, legacyPaths.get(canvasComponentPath("", node.id))) } });
      else {
        const nested = byId.get(node.componentId);
        if (nested) visit(nested, path, nextAncestors, depth + 1, [...scopes, { prefix: path, overrides: node.overrides }]);
      }
    }
  };
  visit(definition, "", new Set(), 1, []);
  return result;
}

export function canvasComponentExpandedNodeCounts(components: CanvasComponentDefinition[]): Map<string, number> {
  const byId = new Map(components.map((component) => [component.id, component]));
  const counts = new Map<string, number>();
  const count = (definition: CanvasComponentDefinition, ancestors: Set<string>): number => {
    const cached = counts.get(definition.id);
    if (cached !== undefined) return cached;
    if (ancestors.has(definition.id) || ancestors.size >= CANVAS_COMPONENT_MAX_DEPTH) return CANVAS_COMPONENT_MAX_EXPANDED_NODES + 1;
    const nextAncestors = new Set(ancestors).add(definition.id);
    let expanded = definition.nodes.length;
    for (const node of definition.nodes) {
      if (node.type !== "component") continue;
      const nested = byId.get(node.componentId);
      if (!nested) continue;
      expanded = Math.min(CANVAS_COMPONENT_MAX_EXPANDED_NODES + 1, expanded + count(nested, nextAncestors));
    }
    counts.set(definition.id, expanded);
    return expanded;
  };
  for (const component of components) count(component, new Set());
  return counts;
}

export function canvasComponentOverrideAtPath(
  path: string,
  scopes: Array<{ prefix: string; overrides?: CanvasComponentElement["overrides"] }>,
  ownerPrefix?: string,
  legacyLocalPath?: string,
): Partial<CanvasPrimitiveElement> | undefined {
  let merged: Partial<CanvasPrimitiveElement> | undefined;
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    const relative = scope.prefix ? path.slice(scope.prefix.length + 1) : path;
    const override = scope.overrides?.[relative] ?? (legacyLocalPath !== undefined && scope.prefix === ownerPrefix ? scope.overrides?.[legacyLocalPath] : undefined);
    if (override) merged = { ...merged, ...override };
  }
  return merged;
}

export function canvasComponentOverridesBelow(
  overrides: CanvasComponentElement["overrides"],
  prefix: string,
): CanvasComponentElement["overrides"] {
  if (!overrides) return undefined;
  const marker = `${prefix}/`;
  const entries = Object.entries(overrides).flatMap(([path, value]) => path.startsWith(marker) ? [[path.slice(marker.length), value] as const] : []);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function mergeCanvasComponentOverrides(
  authored: CanvasComponentElement["overrides"],
  local: CanvasComponentElement["overrides"],
): CanvasComponentElement["overrides"] {
  const paths = new Set([...Object.keys(authored ?? {}), ...Object.keys(local ?? {})]);
  return paths.size ? Object.fromEntries([...paths].map((path) => [path, { ...authored?.[path], ...local?.[path] }])) : undefined;
}
