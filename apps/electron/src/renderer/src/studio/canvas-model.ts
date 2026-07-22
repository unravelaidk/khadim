import type {
  CanvasArtifactContent,
  CanvasAutoLayout,
  CanvasComponentDefinition,
  CanvasComponentElement,
  CanvasElement,
  CanvasHorizontalConstraint,
  CanvasPaintStyle,
  CanvasPage,
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

export type {
  CanvasArtifactContent,
  CanvasAutoLayout,
  CanvasComponentDefinition,
  CanvasHorizontalConstraint,
  CanvasPaintStyle,
  CanvasPage,
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
  prototypeStartPageId?: string;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasGeometryEntry {
  node: CanvasNode;
  rect: CanvasRect;
  hidden: boolean;
  locked: boolean;
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
    return { node, rect: { x: node.x, y: node.y, width, height }, ...(flagsById.get(node.id) ?? { hidden: Boolean(node.hidden), locked: Boolean(node.locked) }) };
  });
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
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ].map(([x, y]) => ({ x: centerX + (x - centerX) * cosine - (y - centerY) * sine, y: centerY + (x - centerX) * sine + (y - centerY) * cosine }));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
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
  let gap = layout.gap;
  let cursor = layout.padding;
  if (layout.justify === "center") cursor += Math.max(0, (availableMain - contentMain) / 2);
  if (layout.justify === "end") cursor += Math.max(0, availableMain - contentMain);
  if (layout.justify === "space-between" && sizes.length > 1) gap = Math.max(layout.gap, (availableMain - mainSizes.reduce((sum, size) => sum + size, 0)) / (sizes.length - 1));
  const positioned = new Map<string, { x: number; y: number }>();
  for (const size of sizes) {
    const availableCross = (layout.direction === "row" ? nextFrame.height : nextFrame.width) - layout.padding * 2;
    const crossSize = layout.direction === "row" ? size.height : size.width;
    const cross = layout.padding + (layout.align === "center" ? (availableCross - crossSize) / 2 : layout.align === "end" ? availableCross - crossSize : 0);
    positioned.set(size.node.id, layout.direction === "row"
      ? { x: nextFrame.x + cursor, y: nextFrame.y + cross }
      : { x: nextFrame.x + cross, y: nextFrame.y + cursor });
    cursor += (layout.direction === "row" ? size.width : size.height) + gap;
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
