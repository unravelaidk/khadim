import {
  AlignBottom,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignTop,
  ArrowRight,
  ArrowClockwise,
  ArrowCounterClockwise,
  BoundingBox,
  CaretDown,
  CaretUp,
  Circle,
  Copy,
  CornersOut,
  Cursor,
  DiamondsFour,
  DotsSixVertical,
  DownloadSimple,
  Eye,
  EyeSlash,
  Flag,
  GridFour,
  Hand,
  ImageSquare,
  LinkBreak,
  LineSegment,
  LockSimple,
  LockSimpleOpen,
  Minus,
  Path,
  PencilSimple,
  Play,
  Plus,
  Rows,
  Ruler,
  Selection,
  SidebarSimple,
  Square,
  Stack,
  TextT,
  Trash,
} from "@phosphor-icons/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, CanvasPrototypeFlow, CanvasPrototypeInteraction } from "../../../shared/types";
import { renderCanvasSvg } from "../../../shared/artifact-export";
import { canvasImportedPathTransform, canvasPathAbsolutePoints, canvasPathData, normalizeCanvasPath, resolveCanvasConnectors, type CanvasAbsolutePoint } from "../../../shared/canvas-geometry";
import { canvasGradientVector } from "../../../shared/canvas-paint";
import { booleanCanvasNodes, canBooleanNode, svgPathBounds, type CanvasBooleanOperation } from "../../../shared/vector-boolean";
import { importSvgToCanvasNodes } from "./svg-import";
import { CanvasPrototypePreview } from "./CanvasPrototypePreview";
import { canvasPrototypePageLayers } from "./canvas-prototype";
import {
  applyFrameLayout,
  applyFrameResizeConstraints,
  canvasComponents,
  canvasGeometryIndex,
  canvasLayerTree,
  canvasNodes,
  canvasPages,
  canvasPrototypeFlows,
  canvasSignature,
  canvasThumbnailElements,
  canvasVirtualRange,
  canvasViewportElements,
  descendantIds,
  effectivePrimitive,
  intersects,
  nodeLabel,
  nodeRect,
  nodeSize,
  rotatedRect,
  selectionRect,
  prepareCanvasSnapIndex,
  snapCanvasMove,
} from "./canvas-model";
import type {
  CanvasArtifactContent,
  CanvasComponentDefinition,
  CanvasComponentNode,
  CanvasNode,
  CanvasPaintStyle,
  CanvasTextStyle,
  CanvasEffectStyle,
  CanvasTokenCollection,
  CanvasPage,
  CanvasPrimitiveNode,
  CanvasRect,
  CanvasSnapAxisTarget,
  CanvasSnapFeedback,
  CanvasSnapIndex,
  CanvasSnapRectTarget,
  CanvasSnapshot,
} from "./canvas-model";

type CanvasDrawingTool = "rectangle" | "ellipse" | "line" | "arrow" | "text" | "frame";
type CanvasTool = "select" | "hand" | "pen" | "pencil" | CanvasDrawingTool;
type CanvasSidePanel = "layers" | "assets";
type ResizeHandle = "nw" | "ne" | "se" | "sw";
type CanvasMoveSnapContext = {
  snapIndex: CanvasSnapIndex;
  gridSize: number;
  gridOriginX: number;
  gridOriginY: number;
};
type CanvasGesture =
  | { kind: "pan"; pointerX: number; pointerY: number; originX: number; originY: number }
  | { kind: "marquee"; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: "draw"; tool: CanvasDrawingTool; startX: number; startY: number; currentX: number; currentY: number; nodeId: string; before: CanvasSnapshot }
  | { kind: "freehand"; nodeId: string; absolutePoints: Array<{ x: number; y: number }>; before: CanvasSnapshot }
  | { kind: "path-point"; nodeId: string; pointIndex: number; centerX: number; centerY: number; rotation: number; before: CanvasSnapshot }
  | { kind: "path-handle"; nodeId: string; pointIndex: number; handle: "in" | "out"; centerX: number; centerY: number; rotation: number; before: CanvasSnapshot }
  | { kind: "move"; pointerX: number; pointerY: number; origins: Record<string, { x: number; y: number }>; bounds: CanvasRect; selectedIds: string[]; snapContext: CanvasMoveSnapContext; before: CanvasSnapshot }
  | { kind: "resize"; pointerX: number; pointerY: number; origin: CanvasRect; centerX: number; centerY: number; rotation: number; handle: ResizeHandle; nodeId: string; before: CanvasSnapshot }
  | { kind: "multi-resize"; pointerX: number; pointerY: number; origin: CanvasRect; handle: ResizeHandle; selectedIds: string[]; before: CanvasSnapshot }
  | { kind: "rotate"; centerX: number; centerY: number; initialAngle: number; initialRotation: number; nodeId: string; before: CanvasSnapshot }
  | { kind: "multi-rotate"; centerX: number; centerY: number; initialAngle: number; selectedIds: string[]; before: CanvasSnapshot };

interface CanvasEditorProps {
  artifact: Artifact;
  content: CanvasArtifactContent;
  onChange: (artifact: Artifact, flush?: boolean) => void;
}

const snapGridSize = 8;
const canvasPagePresets = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 1024, height: 1366 },
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
  { id: "presentation", label: "Presentation", width: 1920, height: 1080 },
  { id: "a4", label: "A4 portrait", width: 794, height: 1123 },
] as const;
const clampCanvasZoom = (zoom: number): number => Math.min(2, Math.max(.25, zoom));
const cloneSnapshot = <T,>(value: T): T => structuredClone(value);
const withoutTokenBindings = (bindings: CanvasPrimitiveNode["tokenBindings"], keys: Array<keyof NonNullable<CanvasPrimitiveNode["tokenBindings"]>>): CanvasPrimitiveNode["tokenBindings"] => {
  if (!bindings) return undefined;
  const next = Object.fromEntries(Object.entries(bindings).filter(([key]) => !keys.includes(key as keyof NonNullable<CanvasPrimitiveNode["tokenBindings"]>))) as NonNullable<CanvasPrimitiveNode["tokenBindings"]>;
  return Object.keys(next).length ? next : undefined;
};

function booleanResultForNode(node: CanvasPrimitiveNode, scene: CanvasNode[]): CanvasPrimitiveNode | null {
  if (node.type !== "boolean" || !node.booleanOperation) return null;
  const children = scene.filter((candidate): candidate is CanvasPrimitiveNode => candidate.parentId === node.id && candidate.type !== "component" && candidate.type !== "boolean" && canBooleanNode(candidate));
  const result = booleanCanvasNodes(children, node.booleanOperation);
  return result ? { ...result, id: node.id, name: node.name, color: node.color, fillGradient: node.fillGradient, opacity: node.opacity, strokeColor: node.strokeColor, strokeWidth: node.strokeWidth, strokeDash: node.strokeDash, shadow: node.shadow, parentId: node.parentId, groupId: node.groupId } : null;
}

function resolveBooleanGroups(scene: CanvasNode[]): CanvasNode[] {
  return scene.map((node) => {
    if (node.type === "component" || node.type !== "boolean") return node;
    const result = booleanResultForNode(node, scene);
    return result ? { ...node, x: result.x, y: result.y, width: result.width, height: result.height, rotation: 0 } : node;
  });
}

const starterComponents: CanvasComponentDefinition[] = [
  {
    id: "starter-button",
    name: "Button / Primary",
    width: 152,
    height: 44,
    builtIn: true,
    nodes: [
      { id: "surface", type: "rectangle", name: "Surface", x: 0, y: 0, width: 152, height: 44, color: "#2563eb", radius: 10, opacity: 1 },
      { id: "label", type: "text", name: "Label", x: 36, y: 7, width: 80, height: 30, text: "Continue", color: "#ffffff", fontSize: 15, fontWeight: 650, opacity: 1 },
    ],
  },
  {
    id: "starter-input",
    name: "Input / Default",
    width: 280,
    height: 48,
    builtIn: true,
    nodes: [
      { id: "surface", type: "rectangle", name: "Field", x: 0, y: 0, width: 280, height: 48, color: "#f1f3f5", radius: 9, opacity: 1 },
      { id: "placeholder", type: "text", name: "Placeholder", x: 14, y: 8, width: 180, height: 30, text: "Email address", color: "#667085", fontSize: 15, fontWeight: 500, opacity: 1 },
    ],
  },
  {
    id: "starter-card",
    name: "Card / Content",
    width: 320,
    height: 184,
    builtIn: true,
    nodes: [
      { id: "surface", type: "rectangle", name: "Surface", x: 0, y: 0, width: 320, height: 184, color: "#ffffff", radius: 16, opacity: 1 },
      { id: "eyebrow", type: "text", name: "Eyebrow", x: 22, y: 20, width: 180, height: 25, text: "NEW PROJECT", color: "#2563eb", fontSize: 11, fontWeight: 700, opacity: 1 },
      { id: "title", type: "text", name: "Title", x: 22, y: 61, width: 270, height: 36, text: "Design with real structure", color: "#17181c", fontSize: 24, fontWeight: 650, opacity: 1 },
      { id: "body", type: "text", name: "Body", x: 22, y: 112, width: 270, height: 30, text: "Reusable, editable, ready to ship.", color: "#667085", fontSize: 14, fontWeight: 450, opacity: 1 },
    ],
  },
  {
    id: "starter-badge",
    name: "Badge / Status",
    width: 104,
    height: 32,
    builtIn: true,
    nodes: [
      { id: "surface", type: "rectangle", name: "Surface", x: 0, y: 0, width: 104, height: 32, color: "#dcfce7", radius: 16, opacity: 1 },
      { id: "label", type: "text", name: "Label", x: 17, y: 2, width: 78, height: 26, text: "Published", color: "#167044", fontSize: 13, fontWeight: 650, opacity: 1 },
    ],
  },
];

function nextComponentName(components: CanvasComponentDefinition[]): string {
  let index = components.length + 1;
  while (components.some((component) => component.name === `Component ${index}`)) index += 1;
  return `Component ${index}`;
}

const drawingDefaults: Record<CanvasDrawingTool, { width: number; height: number; color: string; name: string }> = {
  rectangle: { width: 180, height: 120, color: "#6652d9", name: "Rectangle" },
  ellipse: { width: 140, height: 140, color: "#f59e0b", name: "Ellipse" },
  line: { width: 180, height: 72, color: "#17181c", name: "Line" },
  arrow: { width: 180, height: 72, color: "#17181c", name: "Arrow" },
  text: { width: 210, height: 52, color: "#17181c", name: "Text" },
  frame: { width: 320, height: 240, color: "#ffffff", name: "Frame" },
};

function createPrimitive(type: CanvasDrawingTool, x: number, y: number, width = drawingDefaults[type].width, height = drawingDefaults[type].height): CanvasPrimitiveNode {
  const defaults = drawingDefaults[type];
  return {
    id: crypto.randomUUID(),
    type,
    name: defaults.name,
    x,
    y,
    width,
    height,
    text: type === "text" ? "New idea" : undefined,
    color: defaults.color,
    fontSize: type === "text" ? 26 : undefined,
    fontFamily: type === "text" ? "Atkinson Hyperlegible Next" : undefined,
    fontWeight: type === "text" ? 620 : undefined,
    lineHeight: type === "text" ? 1.2 : undefined,
    letterSpacing: type === "text" ? 0 : undefined,
    textAlign: type === "text" ? "left" : undefined,
    opacity: 1,
    radius: type === "rectangle" ? 12 : type === "frame" ? 4 : 0,
    points: type === "arrow" ? [{ x: 0, y: 0 }, { x: 1, y: 1 }] : undefined,
    endCap: type === "arrow" ? "arrow" : undefined,
    strokeColor: type === "frame" ? "#d0d5dd" : type === "line" || type === "arrow" ? defaults.color : undefined,
    strokeWidth: type === "frame" || type === "line" ? 1 : type === "arrow" ? 2 : 0,
  };
}

function normalizedAngle(value: number): number {
  const angle = value % 360;
  return angle < 0 ? angle + 360 : angle;
}

function rotatePoint(point: { x: number; y: number }, centerX: number, centerY: number, angle: number): { x: number; y: number } {
  if (!angle) return point;
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: centerX + (point.x - centerX) * cosine - (point.y - centerY) * sine, y: centerY + (point.x - centerX) * sine + (point.y - centerY) * cosine };
}

function wrapTextLines(text: string, width: number, fontSize: number): string[] {
  const maximum = Math.max(1, Math.floor(width / Math.max(1, fontSize * .56)));
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
        continue;
      }
      if (`${line} ${word}`.length <= maximum) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    return lines;
  });
}

interface CanvasPageThumbnailProps {
  page: CanvasPage;
  components: CanvasComponentDefinition[];
  files: CanvasArtifactContent["files"];
  title: string;
  eager?: boolean;
}

function canvasPageThumbnailSource({ page, components, files, title }: CanvasPageThumbnailProps): string {
  const svg = renderCanvasSvg({
    format: "khadim-canvas",
    sceneVersion: 1,
    frame: page.frame,
    elements: canvasThumbnailElements(page.elements),
    components,
    appState: page.appState,
    files,
  }, `${title} — ${page.name} thumbnail`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CanvasPageThumbnail = memo(function CanvasPageThumbnail({ page, components, files, title, eager = false }: CanvasPageThumbnailProps): React.JSX.Element {
  const props = { page, components, files, title, eager };
  const hostRef = useRef<HTMLSpanElement>(null);
  const initiallyVisible = eager || typeof IntersectionObserver === "undefined";
  const [visible, setVisible] = useState(initiallyVisible);
  const [source, setSource] = useState<string | undefined>(() => initiallyVisible ? canvasPageThumbnailSource(props) : undefined);
  const sourceRef = useRef(source);
  const previousInputRef = useRef({ page, components, files, title });
  sourceRef.current = source;
  useEffect(() => { if (eager) setVisible(true); }, [eager]);
  useEffect(() => {
    if (visible || typeof IntersectionObserver === "undefined") return;
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { root: host.closest(".canvas-pages-panel > div"), rootMargin: "84px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    const previous = previousInputRef.current;
    const changed = previous.page !== page || previous.components !== components || previous.files !== files || previous.title !== title;
    previousInputRef.current = { page, components, files, title };
    if (!visible) return;
    if (!sourceRef.current) {
      setSource(canvasPageThumbnailSource(props));
      return;
    }
    if (!changed) return;
    const timeout = window.setTimeout(() => setSource(canvasPageThumbnailSource(props)), 160);
    return () => window.clearTimeout(timeout);
  }, [components, files, page, title, visible]);
  return <span ref={hostRef} className="canvas-page-thumbnail" aria-hidden="true">{source && <img alt="" draggable={false} src={source} />}</span>;
});

export function CanvasEditor({ artifact, content, onChange }: CanvasEditorProps): React.JSX.Element {
  const incomingNodes = useMemo(() => canvasNodes(content), [content.elements]);
  const incomingComponents = useMemo(() => canvasComponents(content), [content.components]);
  const incomingStyles = useMemo(() => content.styles ?? [], [content.styles]);
  const incomingTextStyles = useMemo(() => content.textStyles ?? [], [content.textStyles]);
  const incomingEffectStyles = useMemo(() => content.effectStyles ?? [], [content.effectStyles]);
  const incomingTokenCollections = useMemo(() => content.tokenCollections ?? [], [content.tokenCollections]);
  const incomingPages = useMemo(() => canvasPages(content), [content.activePageId, content.appState, content.elements, content.frame, content.pages]);
  const incomingActivePageId = content.activePageId ?? incomingPages[0].id;
  const incomingPrototypeFlows = useMemo(() => canvasPrototypeFlows(content, incomingPages), [content.prototypeFlows, content.prototypeStartPageId, incomingPages]);
  const incomingPrototypeStartPageId = incomingPrototypeFlows[0]?.startPageId ?? incomingPages[0].id;
  const incomingSignature = useMemo(() => JSON.stringify({ scene: canvasSignature(incomingNodes, incomingComponents, incomingStyles), textStyles: incomingTextStyles, effectStyles: incomingEffectStyles, tokenCollections: incomingTokenCollections, pages: incomingPages, activePageId: incomingActivePageId, prototypeFlows: incomingPrototypeFlows, prototypeStartPageId: incomingPrototypeStartPageId }), [incomingActivePageId, incomingComponents, incomingEffectStyles, incomingNodes, incomingPages, incomingPrototypeFlows, incomingPrototypeStartPageId, incomingStyles, incomingTextStyles, incomingTokenCollections]);
  const [nodes, setCanvasNodes] = useState<CanvasNode[]>(incomingNodes);
  const [components, setComponents] = useState<CanvasComponentDefinition[]>(incomingComponents);
  const [paintStyles, setPaintStyles] = useState<CanvasPaintStyle[]>(incomingStyles);
  const [textStyles, setTextStyles] = useState<CanvasTextStyle[]>(incomingTextStyles);
  const [effectStyles, setEffectStyles] = useState<CanvasEffectStyle[]>(incomingEffectStyles);
  const [tokenCollections, setTokenCollections] = useState<CanvasTokenCollection[]>(incomingTokenCollections);
  const [pages, setPages] = useState<CanvasPage[]>(incomingPages);
  const [activePageId, setActivePageId] = useState(incomingActivePageId);
  const [prototypeFlows, setPrototypeFlows] = useState<CanvasPrototypeFlow[]>(incomingPrototypeFlows);
  const [activePrototypeFlowId, setActivePrototypeFlowId] = useState(incomingPrototypeFlows[0]?.id ?? "");
  const [prototypeStartPageId, setPrototypeStartPageId] = useState(incomingPrototypeStartPageId);
  const [selectedIds, setSelectedIds] = useState<string[]>(incomingNodes[0] ? [incomingNodes[0].id] : []);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [sidePanel, setSidePanel] = useState<CanvasSidePanel>("layers");
  const [assetSearch, setAssetSearch] = useState("");
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(content.appState.snapToGrid !== false);
  const [viewport, setViewport] = useState(content.appState.viewport ?? { x: 72, y: 64, zoom: .76 });
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>();
  const [layerViewport, setLayerViewport] = useState({ scrollTop: 0, height: 0 });
  const [snapFeedback, setSnapFeedback] = useState<CanvasSnapFeedback>({ lines: [], measurements: [] });
  const [snapTargetRevision, setSnapTargetRevision] = useState(0);
  const [marquee, setMarquee] = useState<CanvasRect | null>(null);
  const [editingText, setEditingText] = useState<{ id: string; value: string } | null>(null);
  const [selectedPathPointIndex, setSelectedPathPointIndex] = useState<number | null>(null);
  const [editingBooleanId, setEditingBooleanId] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [transparentExport, setTransparentExport] = useState(false);
  const [prototypeOpen, setPrototypeOpen] = useState(false);
  const stageRef = useRef<SVGSVGElement>(null);
  const layerListRef = useRef<HTMLDivElement>(null);
  const pageRowRefs = useRef(new Map<string, HTMLDivElement>());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef(viewport);
  const viewportSaveRef = useRef<number | undefined>(undefined);
  const viewportDirtyRef = useRef(false);
  const flushViewportRef = useRef<() => void>(() => undefined);
  const fittedRef = useRef(false);
  const nodesRef = useRef(nodes);
  const componentsRef = useRef(components);
  const paintStylesRef = useRef(paintStyles);
  const textStylesRef = useRef(textStyles);
  const effectStylesRef = useRef(effectStyles);
  const tokenCollectionsRef = useRef(tokenCollections);
  const pagesRef = useRef(pages);
  const activePageIdRef = useRef(activePageId);
  const prototypeFlowsRef = useRef(prototypeFlows);
  const prototypeStartPageIdRef = useRef(prototypeStartPageId);
  const gestureRef = useRef<CanvasGesture | null>(null);
  const penDraftRef = useRef<{ nodeId: string; before: CanvasSnapshot; absolutePoints: Array<{ x: number; y: number }> } | null>(null);
  const lastCommittedSignatureRef = useRef(incomingSignature);
  const pastRef = useRef<CanvasSnapshot[]>([]);
  const futureRef = useRef<CanvasSnapshot[]>([]);
  const inspectorHistoryRef = useRef<{ key: string; at: number } | null>(null);
  const clipboardRef = useRef<CanvasNode[]>([]);
  const clipboardRootIdsRef = useRef<string[]>([]);
  const snapRectTargetsByParentRef = useRef(new Map<string, CanvasSnapRectTarget[]>());
  nodesRef.current = nodes;
  componentsRef.current = components;
  paintStylesRef.current = paintStyles;
  textStylesRef.current = textStyles;
  effectStylesRef.current = effectStyles;
  tokenCollectionsRef.current = tokenCollections;
  pagesRef.current = pages;
  activePageIdRef.current = activePageId;
  prototypeFlowsRef.current = prototypeFlows;
  prototypeStartPageIdRef.current = prototypeStartPageId;
  viewportRef.current = viewport;

  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const activePrototypeFlow = prototypeFlows.find((flow) => flow.id === activePrototypeFlowId) ?? prototypeFlows[0];
  const canvasFrame = activePage?.frame ?? content.frame;
  const pageAppState = activePage?.appState ?? content.appState;
  const rulerGuides = pageAppState.guides ?? [];
  const rulersVisible = Boolean(pageAppState.rulersVisible);
  const guidesVisible = pageAppState.guidesVisible !== false;
  const currentPagePreset = canvasPagePresets.find((preset) => preset.width === canvasFrame.width && preset.height === canvasFrame.height)?.id ?? "custom";

  const selectedNodes = nodes.filter((node) => selectedIds.includes(node.id));
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const selectedBounds = selectionRect(selectedNodes, components);
  const geometryIndex = useMemo(() => canvasGeometryIndex(nodes, components), [components, nodes]);
  const geometryById = useMemo(() => new Map(geometryIndex.map((entry) => [entry.node.id, entry])), [geometryIndex]);
  const snapRectTargetsByParent = useMemo(() => {
    if (gestureRef.current && snapRectTargetsByParentRef.current.size) return snapRectTargetsByParentRef.current;
    const byParent = new Map<string, CanvasSnapRectTarget[]>();
    for (const entry of geometryIndex) {
      if (entry.hidden) continue;
      const key = entry.node.parentId ?? "__page__";
      const targets = byParent.get(key) ?? [];
      targets.push({ id: entry.node.id, rect: rotatedRect(entry.rect, entry.node.rotation), kind: entry.node.type === "frame" ? "frame" : "shape" });
      byParent.set(key, targets);
    }
    snapRectTargetsByParentRef.current = byParent;
    return byParent;
  }, [geometryIndex, snapTargetRevision]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const maskSourceIds = useMemo(() => new Set(nodes.flatMap((node) => node.type !== "component" && node.maskId ? [node.maskId] : [])), [nodes]);
  const viewportSceneRect = useMemo(() => {
    if (!stageSize?.width || !stageSize.height) return undefined;
    const padding = 160 / viewport.zoom;
    return {
      x: -viewport.x / viewport.zoom - padding,
      y: -viewport.y / viewport.zoom - padding,
      width: stageSize.width / viewport.zoom + padding * 2,
      height: stageSize.height / viewport.zoom + padding * 2,
    };
  }, [stageSize, viewport]);
  const renderedNodes = useMemo(() => nodes.length < 400 || !viewportSceneRect
    ? nodes
    : canvasViewportElements(geometryIndex, viewportSceneRect, selectedIds, editingBooleanId ?? undefined), [editingBooleanId, geometryIndex, nodes, selectedIds, viewportSceneRect]);
  const selectedExportBounds = selectedBounds ? (() => {
    const visualRects = selectedNodes.map((node) => {
      if (node.type !== "component" && (node.type === "path" || node.type === "arrow") && node.points?.length) {
        const bounds = svgPathBounds(canvasPathData(canvasPathAbsolutePoints(node), node.pathSmoothing ?? 0, Boolean(node.pathClosed)));
        if (bounds) return rotatedRect(bounds, node.rotation);
      }
      return rotatedRect(nodeRect(node, components), node.rotation);
    });
    const visualBounds = {
      x: Math.min(...visualRects.map((rect) => rect.x)),
      y: Math.min(...visualRects.map((rect) => rect.y)),
      width: Math.max(...visualRects.map((rect) => rect.x + rect.width)) - Math.min(...visualRects.map((rect) => rect.x)),
      height: Math.max(...visualRects.map((rect) => rect.y + rect.height)) - Math.min(...visualRects.map((rect) => rect.y)),
    };
    const padding = selectedNodes.reduce((maximum, node) => {
      if (node.type === "component") {
        const definition = components.find((component) => component.id === node.componentId);
        const scale = definition ? Math.max(node.width / Math.max(1, definition.width), node.height / Math.max(1, definition.height)) : 1;
        return Math.max(maximum, ...(definition?.nodes.map((child) => (child.strokeWidth ?? 0) * scale / 2 + (child.shadow ? (child.shadow.blur * 2 + Math.abs(child.shadow.x) + Math.abs(child.shadow.y)) * scale : 0)) ?? [0]));
      }
      return Math.max(maximum, (node.strokeWidth ?? 0) / 2 + (node.shadow ? node.shadow.blur * 2 + Math.abs(node.shadow.x) + Math.abs(node.shadow.y) : 0));
    }, 0);
    return { x: visualBounds.x - padding, y: visualBounds.y - padding, width: visualBounds.width + padding * 2, height: visualBounds.height + padding * 2 };
  })() : null;
  const selectedComponent = selectedNode?.type === "component" ? components.find((component) => component.id === selectedNode.componentId) : undefined;
  const usedPrototypeTriggers = new Set(selectedNode?.interactions?.map((interaction) => interaction.trigger) ?? []);
  const selectedPathPoint = selectedNode && selectedNode.type !== "component" && (selectedNode.type === "path" || selectedNode.type === "arrow") && selectedPathPointIndex !== null ? selectedNode.points?.[selectedPathPointIndex] : undefined;
  const canCreateComponent = selectedNodes.length > 0 && selectedNodes.every((node) => node.type !== "component" && node.type !== "boolean" && !nodes.some((candidate) => candidate.parentId === node.id && candidate.type === "boolean"));
  const maskCandidate = [...nodes].reverse().find((node) => selectedIds.includes(node.id) && node.type !== "component" && node.type !== "boolean" && node.type !== "text" && node.type !== "image" && node.type !== "line" && node.type !== "arrow" && (node.type !== "path" || node.pathClosed));
  const canCreateMask = selectedNodes.length > 1 && Boolean(maskCandidate) && selectedNodes.every((node) => node.type !== "component" && node.type !== "boolean");
  const canCreatePaintStyle = Boolean(selectedNode && selectedNode.type !== "component" && selectedNode.type !== "line" && selectedNode.type !== "arrow" && selectedNode.type !== "image" && (selectedNode.type !== "path" || selectedNode.pathClosed));
  const selectedBooleanNodes = selectedNodes.filter((node): node is CanvasPrimitiveNode => node.type !== "component" && canBooleanNode(node));
  const canBooleanSelection = selectedBooleanNodes.length === selectedNodes.length && selectedBooleanNodes.length > 1
    && selectedBooleanNodes.every((node) => node.parentId === selectedBooleanNodes[0].parentId && !nodes.some((candidate) => candidate.parentId === node.id) && !nodes.some((candidate) => candidate.id === node.parentId && candidate.type === "boolean"));
  const query = assetSearch.trim().toLowerCase();
  const filteredComponents = components.filter((component) => !query || component.name.toLowerCase().includes(query));
  const filteredStarters = starterComponents.filter((component) => !query || component.name.toLowerCase().includes(query));
  const filteredPaintStyles = paintStyles.filter((style) => !query || style.name.toLowerCase().includes(query));
  const filteredTextStyles = textStyles.filter((style) => !query || style.name.toLowerCase().includes(query));
  const filteredEffectStyles = effectStyles.filter((style) => !query || style.name.toLowerCase().includes(query));
  const layerTree = useMemo(() => canvasLayerTree(nodes), [nodes]);
  const layerRows = layerTree.rows;
  const layerWindow = nodes.length >= 400 && layerViewport.height > 0
    ? canvasVirtualRange(layerRows.length, Math.max(0, layerViewport.scrollTop - 30), Math.max(0, layerViewport.height - 30), 32, 10)
    : { start: 0, end: layerRows.length, before: 0, after: 0 };
  const visibleLayerRows = layerRows.slice(layerWindow.start, layerWindow.end);

  useEffect(() => setSelectedPathPointIndex(null), [selectedNode?.id]);

  function hasNodeOrAncestorFlag(node: CanvasNode, flag: "hidden" | "locked"): boolean {
    return geometryById.get(node.id)?.[flag] ?? Boolean(node[flag]);
  }

  function selectLayerNode(event: React.MouseEvent<HTMLButtonElement>, node: CanvasNode): void {
    const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
    if (parent?.type === "boolean") setEditingBooleanId(parent.id);
    else if (node.type === "boolean") setEditingBooleanId(null);
    setSelectedIds((current) => event.shiftKey ? current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id] : [node.id]);
  }

  useEffect(() => {
    if (incomingSignature === lastCommittedSignatureRef.current) return;
    const previousActivePageId = activePageIdRef.current;
    setCanvasNodes(incomingNodes);
    setComponents(incomingComponents);
    setPaintStyles(incomingStyles);
    setTextStyles(incomingTextStyles);
    setEffectStyles(incomingEffectStyles);
    setTokenCollections(incomingTokenCollections);
    setPages(incomingPages);
    setActivePageId(incomingActivePageId);
    setPrototypeFlows(incomingPrototypeFlows);
    setActivePrototypeFlowId((current) => incomingPrototypeFlows.some((flow) => flow.id === current) ? current : incomingPrototypeFlows[0]?.id ?? "");
    setPrototypeStartPageId(incomingPrototypeStartPageId);
    const incomingPage = incomingPages.find((page) => page.id === incomingActivePageId) ?? incomingPages[0];
    const incomingViewport = incomingPage?.appState.viewport ?? content.appState.viewport ?? { x: 72, y: 64, zoom: .76 };
    const incomingSnapToGrid = incomingPage?.appState.snapToGrid ?? content.appState.snapToGrid !== false;
    setViewport(incomingViewport);
    viewportRef.current = incomingViewport;
    setSnapToGrid(incomingSnapToGrid);
    setEditingText(null);
    setMarquee(null);
    setSnapFeedback({ lines: [], measurements: [] });
    nodesRef.current = incomingNodes;
    componentsRef.current = incomingComponents;
    paintStylesRef.current = incomingStyles;
    textStylesRef.current = incomingTextStyles;
    effectStylesRef.current = incomingEffectStyles;
    tokenCollectionsRef.current = incomingTokenCollections;
    pagesRef.current = incomingPages;
    activePageIdRef.current = incomingActivePageId;
    prototypeFlowsRef.current = incomingPrototypeFlows;
    prototypeStartPageIdRef.current = incomingPrototypeStartPageId;
    lastCommittedSignatureRef.current = incomingSignature;
    pastRef.current = [];
    futureRef.current = [];
    inspectorHistoryRef.current = null;
    setHistoryRevision((revision) => revision + 1);
    setSelectedIds((current) => incomingActivePageId === previousActivePageId ? current.filter((id) => incomingNodes.some((node) => node.id === id)) : []);
  }, [content.appState.snapToGrid, content.appState.viewport, incomingActivePageId, incomingComponents, incomingEffectStyles, incomingNodes, incomingPages, incomingPrototypeFlows, incomingPrototypeStartPageId, incomingSignature, incomingStyles, incomingTextStyles, incomingTokenCollections]);

  function syncedPages(nextNodes: CanvasNode[], nextAppState: CanvasPage["appState"] = { ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), snapToGrid, viewport: viewportRef.current }, nextFrame = canvasFrame, sourcePages = pagesRef.current): CanvasPage[] {
    const existing = sourcePages.find((candidate) => candidate.id === activePageIdRef.current);
    const prototypeViewport = existing?.prototypeViewport ? {
      ...existing.prototypeViewport,
      width: existing.prototypeViewport.direction === "vertical" ? nextFrame.width : Math.min(nextFrame.width, existing.prototypeViewport.width),
      height: existing.prototypeViewport.direction === "horizontal" ? nextFrame.height : Math.min(nextFrame.height, existing.prototypeViewport.height),
    } : undefined;
    const page: CanvasPage = { ...existing, id: activePageIdRef.current, name: existing?.name ?? "Page 1", frame: nextFrame, elements: nextNodes, appState: nextAppState, prototypeViewport };
    return sourcePages.some((candidate) => candidate.id === page.id) ? sourcePages.map((candidate) => candidate.id === page.id ? page : candidate) : [...sourcePages, page];
  }

  function sceneDocumentSignature(nextNodes: CanvasNode[], nextComponents: CanvasComponentDefinition[], nextStyles: CanvasPaintStyle[], nextPages: CanvasPage[], nextActivePageId = activePageIdRef.current, nextTextStyles = textStylesRef.current, nextEffectStyles = effectStylesRef.current, nextTokenCollections = tokenCollectionsRef.current, nextPrototypeFlows = prototypeFlowsRef.current): string {
    return JSON.stringify({ scene: canvasSignature(nextNodes, nextComponents, nextStyles), textStyles: nextTextStyles, effectStyles: nextEffectStyles, tokenCollections: nextTokenCollections, pages: nextPages, activePageId: nextActivePageId, prototypeFlows: nextPrototypeFlows, prototypeStartPageId: nextPrototypeFlows[0]?.startPageId });
  }

  function currentSnapshot(): CanvasSnapshot {
    return cloneSnapshot({ nodes: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: syncedPages(nodesRef.current), activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current });
  }

  function restoreDocumentSnapshot(snapshot: CanvasSnapshot): void {
    if (!snapshot.pages?.length || !snapshot.activePageId) {
      commitCanvas(cloneSnapshot(snapshot.nodes), cloneSnapshot(snapshot.components), false, cloneSnapshot(snapshot.styles ?? []), cloneSnapshot(snapshot.textStyles ?? []), cloneSnapshot(snapshot.effectStyles ?? []), cloneSnapshot(snapshot.tokenCollections ?? []));
      return;
    }
    const nextPages = cloneSnapshot(snapshot.pages);
    const active = nextPages.find((page) => page.id === snapshot.activePageId) ?? nextPages[0];
    const nextPrototypeFlows = canvasPrototypeFlows({ prototypeFlows: snapshot.prototypeFlows, prototypeStartPageId: snapshot.prototypeStartPageId }, nextPages);
    const nextPrototypeStartPageId = nextPrototypeFlows[0].startPageId;
    const nextNodes = cloneSnapshot(active.elements) as CanvasNode[];
    pagesRef.current = nextPages; activePageIdRef.current = active.id; prototypeFlowsRef.current = nextPrototypeFlows; prototypeStartPageIdRef.current = nextPrototypeStartPageId; nodesRef.current = nextNodes;
    componentsRef.current = cloneSnapshot(snapshot.components); paintStylesRef.current = cloneSnapshot(snapshot.styles ?? []); textStylesRef.current = cloneSnapshot(snapshot.textStyles ?? []); effectStylesRef.current = cloneSnapshot(snapshot.effectStyles ?? []); tokenCollectionsRef.current = cloneSnapshot(snapshot.tokenCollections ?? []);
    setPages(nextPages); setActivePageId(active.id); setPrototypeFlows(nextPrototypeFlows); setActivePrototypeFlowId((current) => nextPrototypeFlows.some((flow) => flow.id === current) ? current : nextPrototypeFlows[0].id); setPrototypeStartPageId(nextPrototypeStartPageId); setCanvasNodes(nextNodes); setComponents(componentsRef.current); setPaintStyles(paintStylesRef.current); setTextStyles(textStylesRef.current); setEffectStyles(effectStylesRef.current); setTokenCollections(tokenCollectionsRef.current);
    setViewport(active.appState.viewport ?? { x: 72, y: 64, zoom: .76 }); setSnapToGrid(active.appState.snapToGrid !== false); setSelectedIds([]);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nextNodes, componentsRef.current, paintStylesRef.current, nextPages, active.id, textStylesRef.current, effectStylesRef.current, tokenCollectionsRef.current, nextPrototypeFlows);
    onChange({ ...artifact, lifecycle: "draft", updatedAt: new Date().toISOString(), content: { ...content, frame: active.frame, elements: nextNodes, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: active.id, prototypeFlows: nextPrototypeFlows, prototypeStartPageId: nextPrototypeStartPageId, appState: active.appState } });
    setHistoryRevision((revision) => revision + 1);
  }

  function commitCanvas(nextNodes: CanvasNode[], nextComponents = componentsRef.current, recordHistory = true, nextStyles = paintStylesRef.current, nextTextStyles = textStylesRef.current, nextEffectStyles = effectStylesRef.current, nextTokenCollections = tokenCollectionsRef.current): void {
    if (recordHistory) {
      pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()];
      futureRef.current = [];
    }
    const connectedNodes = resolveCanvasConnectors(resolveBooleanGroups(nextNodes)) as CanvasNode[];
    const currentPage = pagesRef.current.find((page) => page.id === activePageIdRef.current);
    const prototypeLayers = canvasPrototypePageLayers({ id: currentPage?.id ?? activePageIdRef.current, name: currentPage?.name ?? "Page", frame: currentPage?.frame ?? canvasFrame, elements: connectedNodes, appState: currentPage?.appState ?? content.appState, prototypeViewport: currentPage?.prototypeViewport });
    const connectedById = new Map(connectedNodes.map((node) => [node.id, node]));
    const resolvedNodes = [...prototypeLayers.scrollingElementIds, ...prototypeLayers.fixedElementIds].flatMap((id) => connectedById.get(id) ?? []) as CanvasNode[];
    const nextAppState = { ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), snapToGrid, viewport: viewportRef.current };
    const nextPages = syncedPages(resolvedNodes, nextAppState);
    const signature = sceneDocumentSignature(resolvedNodes, nextComponents, nextStyles, nextPages, activePageIdRef.current, nextTextStyles, nextEffectStyles, nextTokenCollections);
    lastCommittedSignatureRef.current = signature;
    nodesRef.current = resolvedNodes;
    componentsRef.current = nextComponents;
    paintStylesRef.current = nextStyles;
    textStylesRef.current = nextTextStyles;
    effectStylesRef.current = nextEffectStyles;
    tokenCollectionsRef.current = nextTokenCollections;
    pagesRef.current = nextPages;
    setCanvasNodes(resolvedNodes);
    setComponents(nextComponents);
    setPaintStyles(nextStyles);
    setTextStyles(nextTextStyles);
    setEffectStyles(nextEffectStyles);
    setTokenCollections(nextTokenCollections);
    setPages(nextPages);
    setHistoryRevision((revision) => revision + 1);
    onChange({
      ...artifact,
      lifecycle: "draft",
      updatedAt: new Date().toISOString(),
      content: { ...content, frame: canvasFrame, elements: resolvedNodes, components: nextComponents, styles: nextStyles, textStyles: nextTextStyles, effectStyles: nextEffectStyles, tokenCollections: nextTokenCollections, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current, appState: nextAppState },
    });
  }

  function undo(): void {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    const restoredSelection = [...new Set(selectedIds.flatMap((id) => {
      const node = previous.nodes.find((candidate) => candidate.id === id);
      const parent = node?.parentId ? previous.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
      return node ? parent?.type === "boolean" && editingBooleanId !== parent.id ? [parent.id] : [id] : [];
    }))];
    inspectorHistoryRef.current = null;
    futureRef.current = [currentSnapshot(), ...futureRef.current.slice(0, 49)];
    pastRef.current = pastRef.current.slice(0, -1);
    restoreDocumentSnapshot(previous);
    setSelectedIds(restoredSelection);
  }

  function redo(): void {
    const next = futureRef.current[0];
    if (!next) return;
    const restoredSelection = [...new Set(selectedIds.flatMap((id) => {
      const node = next.nodes.find((candidate) => candidate.id === id);
      const parent = node?.parentId ? next.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
      return node ? parent?.type === "boolean" && editingBooleanId !== parent.id ? [parent.id] : [id] : [];
    }))];
    inspectorHistoryRef.current = null;
    pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()];
    futureRef.current = futureRef.current.slice(1);
    restoreDocumentSnapshot(next);
    setSelectedIds(restoredSelection);
  }

  function persistPageAppState(nextAppState: CanvasPage["appState"]): void {
    const nextPages = syncedPages(nodesRef.current, nextAppState);
    pagesRef.current = nextPages;
    setPages(nextPages);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nodesRef.current, componentsRef.current, paintStylesRef.current, nextPages);
    onChange({
      ...artifact,
      lifecycle: "draft",
      updatedAt: new Date().toISOString(),
      content: { ...content, frame: canvasFrame, elements: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current, appState: nextAppState },
    });
  }

  function patchWorkspaceAppState(patch: Partial<CanvasPage["appState"]>): void {
    if (shouldRecordInspectorHistory(`workspace:${Object.keys(patch).sort().join(",")}`)) { pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()]; futureRef.current = []; }
    persistPageAppState({ ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), ...patch, snapToGrid, viewport: viewportRef.current });
  }

  function addRulerGuide(axis: "x" | "y", position?: number): void {
    const fallback = axis === "x" ? canvasFrame.width / 2 : canvasFrame.height / 2;
    patchWorkspaceAppState({ guides: [...rulerGuides, { id: crypto.randomUUID(), axis, position: Math.round(position ?? fallback), color: "#2563eb" }], guidesVisible: true });
  }

  function patchRulerGuide(id: string, patch: Partial<NonNullable<CanvasPage["appState"]["guides"]>[number]>): void {
    patchWorkspaceAppState({ guides: rulerGuides.map((guide) => guide.id === id ? { ...guide, ...patch } : guide) });
  }

  function removeRulerGuide(id: string): void {
    patchWorkspaceAppState({ guides: rulerGuides.filter((guide) => guide.id !== id) });
  }

  function setSnapMode(enabled: boolean): void {
    setSnapToGrid(enabled);
    persistPageAppState({ ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), snapToGrid: enabled, viewport: viewportRef.current });
  }

  function persistViewport(nextViewport: typeof viewport, delay = 180): void {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    viewportDirtyRef.current = true;
    if (viewportSaveRef.current !== undefined) window.clearTimeout(viewportSaveRef.current);
    viewportSaveRef.current = window.setTimeout(() => {
      viewportSaveRef.current = undefined;
      flushViewportRef.current();
    }, delay);
  }

  flushViewportRef.current = (): void => {
    if (!viewportDirtyRef.current) return;
    viewportDirtyRef.current = false;
    persistPageAppState({ ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), snapToGrid, viewport: viewportRef.current });
  };

  useEffect(() => () => {
    if (viewportSaveRef.current !== undefined) window.clearTimeout(viewportSaveRef.current);
    flushViewportRef.current();
  }, []);

  function add(type: CanvasDrawingTool): void {
    const offset = (nodes.length % 8) * 18;
    const next = createPrimitive(type, 96 + offset, 88 + offset);
    commitCanvas([...nodes, next]);
    setSelectedIds([next.id]);
    setTool("select");
    if (type === "text") setEditingText({ id: next.id, value: next.text ?? "" });
  }

  function addKeyboardVector(type: "pen" | "pencil"): void {
    const offset = (nodesRef.current.length % 8) * 18;
    const absolutePoints = type === "pen"
      ? [{ x: 112 + offset, y: 112 + offset }, { x: 212 + offset, y: 112 + offset }, { x: 172 + offset, y: 192 + offset }]
      : [{ x: 112 + offset, y: 152 + offset }, { x: 152 + offset, y: 122 + offset }, { x: 192 + offset, y: 182 + offset }, { x: 232 + offset, y: 142 + offset }];
    const node: CanvasPrimitiveNode = {
      id: crypto.randomUUID(),
      type: "path",
      name: type === "pen" ? "Vector path" : "Freehand path",
      ...normalizeCanvasPath(absolutePoints),
      color: "#17181c",
      strokeColor: "#17181c",
      strokeWidth: 2,
      pathSmoothing: type === "pencil" ? .65 : 0,
      opacity: 1,
    };
    commitCanvas([...nodesRef.current, node]);
    setSelectedIds([node.id]);
    setTool("select");
  }

  function openPage(nextPageId: string, sourcePages = syncedPages(nodesRef.current), recordHistory = false, nextPrototypeFlows = prototypeFlowsRef.current): void {
    const target = sourcePages.find((page) => page.id === nextPageId);
    if (!target || nextPageId === activePageIdRef.current && sourcePages === pagesRef.current) return;
    if (recordHistory) { pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()]; futureRef.current = []; }
    if (viewportSaveRef.current !== undefined) window.clearTimeout(viewportSaveRef.current);
    viewportSaveRef.current = undefined;
    viewportDirtyRef.current = false;
    const targetNodes = resolveCanvasConnectors(target.elements) as CanvasNode[];
    const targetViewport = target.appState.viewport ?? { x: 72, y: 64, zoom: .76 };
    const normalizedPages = sourcePages.map((page) => page.id === target.id ? { ...target, elements: targetNodes, appState: { ...target.appState, viewport: targetViewport } } : page);
    activePageIdRef.current = nextPageId;
    const nextPrototypeStartPageId = nextPrototypeFlows[0]?.startPageId ?? sourcePages[0].id;
    prototypeFlowsRef.current = nextPrototypeFlows;
    prototypeStartPageIdRef.current = nextPrototypeStartPageId;
    pagesRef.current = normalizedPages;
    nodesRef.current = targetNodes;
    viewportRef.current = targetViewport;
    setActivePageId(nextPageId);
    setPrototypeFlows(nextPrototypeFlows);
    setPrototypeStartPageId(nextPrototypeStartPageId);
    setPages(normalizedPages);
    setCanvasNodes(targetNodes);
    setViewport(targetViewport);
    setSnapToGrid(target.appState.snapToGrid !== false);
    setSelectedIds([]);
    setEditingText(null);
    inspectorHistoryRef.current = null;
    setHistoryRevision((revision) => revision + 1);
    lastCommittedSignatureRef.current = sceneDocumentSignature(targetNodes, componentsRef.current, paintStylesRef.current, normalizedPages, nextPageId, textStylesRef.current, effectStylesRef.current, tokenCollectionsRef.current, nextPrototypeFlows);
    onChange({
      ...artifact,
      lifecycle: "draft",
      updatedAt: new Date().toISOString(),
      content: { ...content, frame: target.frame, elements: targetNodes, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: normalizedPages, activePageId: nextPageId, prototypeFlows: nextPrototypeFlows, prototypeStartPageId: nextPrototypeStartPageId, appState: { ...target.appState, viewport: targetViewport } },
    });
  }

  function createPage(duplicate = false): void {
    const currentPages = syncedPages(nodesRef.current);
    const current = currentPages.find((page) => page.id === activePageIdRef.current)!;
    const id = crypto.randomUUID();
    const page: CanvasPage = duplicate
      ? { ...cloneSnapshot(current), id, name: `${current.name} copy` }
      : { id, name: `Page ${currentPages.length + 1}`, frame: { ...canvasFrame }, elements: [], appState: { viewBackgroundColor: current.appState.viewBackgroundColor, snapToGrid: current.appState.snapToGrid, rulersVisible: current.appState.rulersVisible, guidesVisible: true, viewport: { x: 72, y: 64, zoom: .76 } } };
    openPage(id, [...currentPages, page], true);
  }

  function renamePage(pageId: string, name: string): void {
    const finalName = name.trim();
    if (!finalName || pagesRef.current.find((page) => page.id === pageId)?.name === finalName) return;
    if (shouldRecordInspectorHistory(`page:${pageId}:name`)) { pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()]; futureRef.current = []; }
    const nextPages = syncedPages(nodesRef.current).map((page) => page.id === pageId ? { ...page, name: finalName } : page);
    pagesRef.current = nextPages;
    setPages(nextPages);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nodesRef.current, componentsRef.current, paintStylesRef.current, nextPages);
    onChange({ ...artifact, lifecycle: "draft", updatedAt: new Date().toISOString(), content: { ...content, frame: canvasFrame, elements: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current, appState: nextPages.find((page) => page.id === activePageIdRef.current)!.appState } });
  }

  function patchActivePrototypeViewport(prototypeViewport: CanvasPage["prototypeViewport"]): void {
    const current = pagesRef.current.find((page) => page.id === activePageIdRef.current);
    if (!current || JSON.stringify(current.prototypeViewport) === JSON.stringify(prototypeViewport)) return;
    if (shouldRecordInspectorHistory("page:prototype-viewport")) { pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()]; futureRef.current = []; }
    const nextPages = syncedPages(nodesRef.current).map((page) => page.id === activePageIdRef.current ? { ...page, prototypeViewport } : page);
    pagesRef.current = nextPages;
    setPages(nextPages);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nodesRef.current, componentsRef.current, paintStylesRef.current, nextPages);
    setHistoryRevision((revision) => revision + 1);
    onChange({ ...artifact, lifecycle: "draft", updatedAt: new Date().toISOString(), content: { ...content, frame: canvasFrame, elements: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current, appState: current.appState } });
  }

  function resizeActivePageFrame(width: number, height: number, fit = false): void {
    const nextFrame = { width: Math.min(100_000, Math.max(64, Math.round(width))), height: Math.min(100_000, Math.max(64, Math.round(height))) };
    if (nextFrame.width === canvasFrame.width && nextFrame.height === canvasFrame.height) return;
    if (fit) inspectorHistoryRef.current = null;
    if (fit || shouldRecordInspectorHistory("page:frame-size")) {
      pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()];
      futureRef.current = [];
    }
    if (viewportSaveRef.current !== undefined) window.clearTimeout(viewportSaveRef.current);
    viewportSaveRef.current = undefined;
    viewportDirtyRef.current = false;
    let nextViewport = viewportRef.current;
    if (fit) {
      const bounds = stageRef.current?.getBoundingClientRect();
      if (bounds?.width && bounds.height) {
        const zoom = clampCanvasZoom(Math.min((bounds.width - 112) / nextFrame.width, (bounds.height - 112) / nextFrame.height));
        nextViewport = { zoom, x: Math.round((bounds.width - nextFrame.width * zoom) / 2), y: Math.round((bounds.height - nextFrame.height * zoom) / 2) };
        fittedRef.current = true;
      }
    }
    const nextAppState = { ...(pagesRef.current.find((page) => page.id === activePageIdRef.current)?.appState ?? content.appState), snapToGrid, viewport: nextViewport };
    const nextPages = syncedPages(nodesRef.current, nextAppState, nextFrame);
    pagesRef.current = nextPages;
    viewportRef.current = nextViewport;
    setPages(nextPages);
    setViewport(nextViewport);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nodesRef.current, componentsRef.current, paintStylesRef.current, nextPages, activePageIdRef.current, textStylesRef.current, effectStylesRef.current, tokenCollectionsRef.current, prototypeFlowsRef.current);
    setHistoryRevision((revision) => revision + 1);
    onChange({
      ...artifact,
      lifecycle: "draft",
      updatedAt: new Date().toISOString(),
      content: { ...content, frame: nextFrame, elements: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: prototypeFlowsRef.current, prototypeStartPageId: prototypeStartPageIdRef.current, appState: nextAppState },
    });
  }

  function movePage(pageId: string, offset: -1 | 1): void {
    const currentPages = syncedPages(nodesRef.current);
    const index = currentPages.findIndex((page) => page.id === pageId);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentPages.length) return;
    const nextPages = [...currentPages];
    [nextPages[index], nextPages[targetIndex]] = [nextPages[targetIndex], nextPages[index]];
    openPage(activePageIdRef.current, nextPages, true);
  }

  function persistPrototypeFlows(nextFlows: CanvasPrototypeFlow[]): void {
    if (!nextFlows.length) return;
    pastRef.current = [...pastRef.current.slice(-49), currentSnapshot()];
    futureRef.current = [];
    const nextPrototypeStartPageId = nextFlows[0].startPageId;
    prototypeFlowsRef.current = nextFlows;
    prototypeStartPageIdRef.current = nextPrototypeStartPageId;
    setPrototypeFlows(nextFlows);
    setPrototypeStartPageId(nextPrototypeStartPageId);
    const nextPages = syncedPages(nodesRef.current);
    lastCommittedSignatureRef.current = sceneDocumentSignature(nodesRef.current, componentsRef.current, paintStylesRef.current, nextPages, activePageIdRef.current, textStylesRef.current, effectStylesRef.current, tokenCollectionsRef.current, nextFlows);
    onChange({ ...artifact, lifecycle: "draft", updatedAt: new Date().toISOString(), content: { ...content, frame: canvasFrame, elements: nodesRef.current, components: componentsRef.current, styles: paintStylesRef.current, textStyles: textStylesRef.current, effectStyles: effectStylesRef.current, tokenCollections: tokenCollectionsRef.current, pages: nextPages, activePageId: activePageIdRef.current, prototypeFlows: nextFlows, prototypeStartPageId: nextPrototypeStartPageId, appState: nextPages.find((page) => page.id === activePageIdRef.current)!.appState } });
    setHistoryRevision((revision) => revision + 1);
  }

  function markPrototypeStart(pageId: string): void {
    if (!activePrototypeFlow || pageId === activePrototypeFlow.startPageId || !pagesRef.current.some((page) => page.id === pageId)) return;
    persistPrototypeFlows(prototypeFlowsRef.current.map((flow) => flow.id === activePrototypeFlow.id ? { ...flow, startPageId: pageId } : flow));
  }

  function addPrototypeFlow(): void {
    if (prototypeFlowsRef.current.length >= 64) return;
    const flow: CanvasPrototypeFlow = { id: crypto.randomUUID(), name: `Flow ${prototypeFlowsRef.current.length + 1}`, startPageId: activePageIdRef.current };
    persistPrototypeFlows([...prototypeFlowsRef.current, flow]);
    setActivePrototypeFlowId(flow.id);
  }

  function renamePrototypeFlow(flowId: string, name: string): void {
    const finalName = name.trim();
    const flow = prototypeFlowsRef.current.find((candidate) => candidate.id === flowId);
    if (!flow || !finalName || finalName === flow.name) return;
    persistPrototypeFlows(prototypeFlowsRef.current.map((candidate) => candidate.id === flowId ? { ...candidate, name: finalName.slice(0, 160) } : candidate));
  }

  function deletePrototypeFlow(flowId: string): void {
    if (prototypeFlowsRef.current.length <= 1) return;
    const nextFlows = prototypeFlowsRef.current.filter((flow) => flow.id !== flowId);
    if (nextFlows.length === prototypeFlowsRef.current.length) return;
    persistPrototypeFlows(nextFlows);
    if (activePrototypeFlowId === flowId) setActivePrototypeFlowId(nextFlows[0].id);
  }

  function deletePage(pageId: string): void {
    const currentPages = syncedPages(nodesRef.current);
    if (currentPages.length <= 1) return;
    const index = currentPages.findIndex((page) => page.id === pageId);
    const nextPages = currentPages.filter((page) => page.id !== pageId).map((page) => ({
      ...page,
      elements: page.elements.map((node) => {
        const interactions = node.interactions?.filter((interaction) => interaction.destinationPageId !== pageId);
        return interactions?.length === node.interactions?.length ? node : { ...node, interactions: interactions?.length ? interactions : undefined };
      }),
    }));
    const nextActiveId = pageId === activePageIdRef.current ? nextPages[Math.min(index, nextPages.length - 1)].id : activePageIdRef.current;
    const focusPageId = nextPages[Math.min(index, nextPages.length - 1)].id;
    const nextPrototypeFlows = prototypeFlowsRef.current.map((flow) => flow.startPageId === pageId ? { ...flow, startPageId: nextPages[0].id } : flow);
    openPage(nextActiveId, nextPages, true, nextPrototypeFlows);
    window.setTimeout(() => pageRowRefs.current.get(focusPageId)?.querySelector<HTMLElement>(".canvas-page-open, input, .canvas-page-start")?.focus(), 0);
  }

  function importImage(file: File | undefined): void {
    if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return;
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      const offset = (nodesRef.current.length % 8) * 18;
      if (isSvg) {
        try {
          const imported = importSvgToCanvasNodes(reader.result, { x: 96 + offset, y: 88 + offset, name: file.name.replace(/\.[^.]+$/, "") || "SVG" });
          if (!imported.length) return;
          commitCanvas([...nodesRef.current, ...imported]);
          setSelectedIds(imported.map((node) => node.id));
        } catch {
          // Invalid and unsupported SVG content stays inert and is not added to the scene.
        }
        return;
      }
      const node: CanvasPrimitiveNode = {
        id: crypto.randomUUID(),
        type: "image",
        name: file.name.replace(/\.[^.]+$/, "") || "Image",
        x: 96 + offset,
        y: 88 + offset,
        width: 320,
        height: 200,
        color: "#ffffff",
        src: reader.result,
        alt: file.name,
        opacity: 1,
        radius: 0,
      };
      commitCanvas([...nodesRef.current, node]);
      setSelectedIds([node.id]);
    });
    if (isSvg) reader.readAsText(file);
    else reader.readAsDataURL(file);
  }

  function downloadBlob(blob: Blob, extension: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "canvas"}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportSvg(selectionOnly = false): void {
    const bounds = selectionOnly ? selectedExportBounds ?? undefined : undefined;
    const elementIds = selectionOnly ? [...new Set([...selectedIds, ...descendantIds(nodes, selectedIds)])] : undefined;
    downloadBlob(new Blob([renderCanvasSvg({ ...content, frame: canvasFrame, elements: nodes, components, styles: paintStyles, textStyles, effectStyles }, artifact.title, { bounds, transparent: transparentExport, elementIds })], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }

  async function exportPng(selectionOnly = false): Promise<void> {
    const bounds = selectionOnly ? selectedExportBounds ?? undefined : undefined;
    const elementIds = selectionOnly ? [...new Set([...selectedIds, ...descendantIds(nodes, selectedIds)])] : undefined;
    const svg = renderCanvasSvg({ ...content, frame: canvasFrame, elements: nodes, components, styles: paintStyles, textStyles, effectStyles }, artifact.title, { bounds, transparent: transparentExport, elementIds });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(bounds?.width ?? canvasFrame.width));
      canvas.height = Math.max(1, Math.ceil(bounds?.height ?? canvasFrame.height));
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) downloadBlob(blob, "png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function shouldRecordInspectorHistory(key: string): boolean {
    const now = performance.now();
    const previous = inspectorHistoryRef.current;
    inspectorHistoryRef.current = { key, at: now };
    return !previous || previous.key !== key || now - previous.at > 800;
  }

  function patchSelected(patch: Partial<CanvasNode>): void {
    if (!selectedNode) return;
    let authoredPatch = selectedNode.type !== "component" && ("color" in patch || "fillGradient" in patch) && !("fillStyleId" in patch) ? { ...patch, fillStyleId: undefined } : patch;
    if (selectedNode.type === "text" && ["fontFamily", "fontSize", "fontWeight", "fontStyle", "textAlign", "lineHeight", "letterSpacing"].some((key) => key in patch) && !("textStyleId" in patch)) authoredPatch = { ...authoredPatch, textStyleId: undefined };
    if (selectedNode.type !== "component" && "shadow" in patch && !("effectStyleId" in patch)) authoredPatch = { ...authoredPatch, effectStyleId: undefined };
    if (selectedNode.type !== "component" && selectedNode.tokenBindings && !("tokenBindings" in patch)) {
      const detached: Array<keyof NonNullable<CanvasPrimitiveNode["tokenBindings"]>> = [];
      if ("color" in patch || "fillGradient" in patch) detached.push("fill");
      if ("strokeColor" in patch) detached.push("stroke");
      if ("radius" in patch) detached.push("radius");
      if ("opacity" in patch) detached.push("opacity");
      if ("layout" in patch) detached.push("gap", "padding");
      if (detached.length) authoredPatch = { ...authoredPatch, tokenBindings: withoutTokenBindings(selectedNode.tokenBindings, detached) };
    }
    const deltaX = typeof patch.x === "number" ? patch.x - selectedNode.x : 0;
    const deltaY = typeof patch.y === "number" ? patch.y - selectedNode.y : 0;
    const transformsChildren = selectedNode.type === "frame" || selectedNode.type === "boolean";
    const rotationDelta = transformsChildren && typeof patch.rotation === "number" ? patch.rotation - (selectedNode.rotation ?? 0) : 0;
    const children = transformsChildren && (deltaX || deltaY || rotationDelta || patch.width !== undefined || patch.height !== undefined) ? new Set(descendantIds(nodes, [selectedNode.id])) : new Set<string>();
    const centerX = selectedNode.x + deltaX + selectedNode.width / 2;
    const centerY = selectedNode.y + deltaY + selectedNode.height / 2;
    let next = nodes.map((node) => {
      if (node.id === selectedNode.id) return { ...node, ...authoredPatch } as CanvasNode;
      if (!children.has(node.id)) return node;
      const shifted = { x: node.x + deltaX + node.width / 2, y: node.y + deltaY + node.height / 2 };
      const center = rotatePoint(shifted, centerX, centerY, rotationDelta);
      const moved = { ...node, x: center.x - node.width / 2, y: center.y - node.height / 2, rotation: normalizedAngle((node.rotation ?? 0) + rotationDelta) } as CanvasNode;
      if (selectedNode.type !== "boolean" || patch.width === undefined && patch.height === undefined) return moved;
      const nextWidth = Math.max(1, patch.width ?? selectedNode.width);
      const nextHeight = Math.max(1, patch.height ?? selectedNode.height);
      const scaleX = nextWidth / Math.max(1, selectedNode.width);
      const scaleY = nextHeight / Math.max(1, selectedNode.height);
      const baseX = selectedNode.x + deltaX;
      const baseY = selectedNode.y + deltaY;
      return { ...moved, x: baseX + (moved.x - baseX) * scaleX, y: baseY + (moved.y - baseY) * scaleY, width: Math.max(1, moved.width * scaleX), height: Math.max(1, moved.height * scaleY) } as CanvasNode;
    });
    if (selectedNode.parentId) next = applyFrameLayout(next, selectedNode.parentId, components);
    if (selectedNode.type === "frame" && !selectedNode.layout && (patch.width !== undefined || patch.height !== undefined)) next = applyFrameResizeConstraints(nodes, next, selectedNode.id);
    if (selectedNode.type === "frame" && ((patch as Partial<CanvasPrimitiveNode>).layout !== undefined || patch.width !== undefined || patch.height !== undefined)) next = applyFrameLayout(next, selectedNode.id, components);
    commitCanvas(next, componentsRef.current, shouldRecordInspectorHistory(`${selectedNode.id}:${Object.keys(patch).sort().join(",")}`));
  }

  function addPrototypeInteraction(): void {
    if (!selectedNode) return;
    const trigger = (["click", "hover", "after-delay"] as const).find((candidate) => !selectedNode.interactions?.some((interaction) => interaction.trigger === candidate));
    if (!trigger) return;
    const destination = pages.find((page) => page.id !== activePageId)?.id;
    const interaction: CanvasPrototypeInteraction = {
      id: crypto.randomUUID(),
      trigger,
      action: destination ? "navigate" : "back",
      delay: trigger === "after-delay" ? 500 : undefined,
      destinationPageId: destination,
      transition: destination ? { type: "dissolve", duration: 180, easing: "ease-out" } : undefined,
    };
    patchSelected({ interactions: [...(selectedNode.interactions ?? []), interaction] });
  }

  function patchPrototypeInteraction(interactionId: string, patch: Partial<CanvasPrototypeInteraction>): void {
    if (!selectedNode) return;
    const interactions = (selectedNode.interactions ?? []).map((interaction) => interaction.id === interactionId ? { ...interaction, ...patch } : interaction);
    patchSelected({ interactions });
  }

  function removePrototypeInteraction(interactionId: string): void {
    if (!selectedNode) return;
    const interactions = (selectedNode.interactions ?? []).filter((interaction) => interaction.id !== interactionId);
    patchSelected({ interactions: interactions.length ? interactions : undefined });
  }

  function createPaintStyle(): void {
    if (!selectedNode || selectedNode.type === "component" || selectedNode.type === "line" || selectedNode.type === "arrow" || selectedNode.type === "image" || selectedNode.type === "path" && !selectedNode.pathClosed) return;
    const style: CanvasPaintStyle = {
      id: crypto.randomUUID(),
      name: `${nodeLabel(selectedNode)} paint`,
      color: selectedNode.color,
      gradient: selectedNode.fillGradient ? cloneSnapshot(selectedNode.fillGradient) : undefined,
    };
    const nextNodes = nodes.map((node) => node.id === selectedNode.id && node.type !== "component" ? { ...node, fillStyleId: style.id } : node) as CanvasNode[];
    commitCanvas(nextNodes, componentsRef.current, true, [...paintStylesRef.current, style]);
  }

  function applyPaintStyle(style: CanvasPaintStyle): void {
    if (!selectedNodes.length) return;
    const ids = new Set(selectedIds);
    const nextNodes = nodes.map((node) => ids.has(node.id) && node.type !== "component" && node.type !== "line" && node.type !== "arrow" && node.type !== "image" && (node.type !== "path" || node.pathClosed)
      ? { ...node, color: style.color, fillGradient: style.gradient ? cloneSnapshot(style.gradient) : undefined, fillStyleId: style.id, tokenBindings: withoutTokenBindings(node.tokenBindings, ["fill"]) }
      : node) as CanvasNode[];
    commitCanvas(nextNodes);
  }

  function updatePaintStyle(styleId: string): void {
    if (!selectedNode || selectedNode.type === "component") return;
    const before = currentSnapshot();
    const nextStyles = paintStylesRef.current.map((style) => style.id === styleId ? { ...style, color: selectedNode.color, gradient: selectedNode.fillGradient ? cloneSnapshot(selectedNode.fillGradient) : undefined } : style);
    const updated = nextStyles.find((style) => style.id === styleId);
    if (!updated) return;
    const nextNodes = nodes.map((node) => node.type !== "component" && node.fillStyleId === styleId ? { ...node, color: updated.color, fillGradient: updated.gradient ? cloneSnapshot(updated.gradient) : undefined } : node) as CanvasNode[];
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.fillStyleId === styleId ? { ...node, color: updated.color, fillGradient: updated.gradient ? cloneSnapshot(updated.gradient) : undefined } : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type !== "component" && node.fillStyleId === styleId ? { ...node, color: updated.color, fillGradient: updated.gradient ? cloneSnapshot(updated.gradient) : undefined } : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, nextStyles);
  }

  function removePaintStyle(styleId: string): void {
    const before = currentSnapshot();
    const nextNodes = nodes.map((node) => node.type !== "component" && node.fillStyleId === styleId ? { ...node, fillStyleId: undefined } : node) as CanvasNode[];
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.fillStyleId === styleId ? { ...node, fillStyleId: undefined } : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type !== "component" && node.fillStyleId === styleId ? { ...node, fillStyleId: undefined } : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, paintStylesRef.current.filter((style) => style.id !== styleId));
  }

  function textStyleFromNode(node: CanvasPrimitiveNode, id: string = crypto.randomUUID(), name = `${nodeLabel(node)} text`): CanvasTextStyle {
    return { id, name, fontFamily: node.fontFamily ?? "Atkinson Hyperlegible Next", fontSize: node.fontSize ?? 26, fontWeight: node.fontWeight ?? 620, fontStyle: node.fontStyle ?? "normal", textAlign: node.textAlign ?? "left", lineHeight: node.lineHeight ?? 1.2, letterSpacing: node.letterSpacing ?? 0 };
  }

  function applyTextStyleValues(node: CanvasPrimitiveNode, style: CanvasTextStyle): CanvasPrimitiveNode {
    return { ...node, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textAlign: style.textAlign, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textStyleId: style.id };
  }

  function createTextStyle(): void {
    if (selectedNode?.type !== "text") return;
    const style = textStyleFromNode(selectedNode);
    const nextNodes = nodes.map((node) => node.id === selectedNode.id && node.type === "text" ? applyTextStyleValues(node, style) : node);
    commitCanvas(nextNodes, componentsRef.current, true, paintStylesRef.current, [...textStylesRef.current, style]);
  }

  function applyTextStyle(style: CanvasTextStyle): void {
    const ids = new Set(selectedIds);
    commitCanvas(nodes.map((node) => ids.has(node.id) && node.type === "text" ? applyTextStyleValues(node, style) : node));
  }

  function updateTextStyle(styleId: string): void {
    if (selectedNode?.type !== "text") return;
    const current = textStylesRef.current.find((style) => style.id === styleId);
    if (!current) return;
    const before = currentSnapshot();
    const updated = textStyleFromNode(selectedNode, styleId, current.name);
    const nextStyles = textStylesRef.current.map((style) => style.id === styleId ? updated : style);
    const nextNodes = nodes.map((node) => node.type === "text" && node.textStyleId === styleId ? applyTextStyleValues(node, updated) : node);
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.type === "text" && node.textStyleId === styleId ? applyTextStyleValues(node, updated) : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type === "text" && node.textStyleId === styleId ? applyTextStyleValues(node, updated) : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, paintStylesRef.current, nextStyles);
  }

  function removeTextStyle(styleId: string): void {
    const before = currentSnapshot();
    const nextNodes = nodes.map((node) => node.type === "text" && node.textStyleId === styleId ? { ...node, textStyleId: undefined } : node) as CanvasNode[];
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.type === "text" && node.textStyleId === styleId ? { ...node, textStyleId: undefined } : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type === "text" && node.textStyleId === styleId ? { ...node, textStyleId: undefined } : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, paintStylesRef.current, textStylesRef.current.filter((style) => style.id !== styleId));
  }

  function createEffectStyle(): void {
    if (!selectedNode || selectedNode.type === "component" || !selectedNode.shadow) return;
    const style: CanvasEffectStyle = { id: crypto.randomUUID(), name: `${nodeLabel(selectedNode)} effect`, shadow: cloneSnapshot(selectedNode.shadow) };
    const nextNodes = nodes.map((node) => node.id === selectedNode.id && node.type !== "component" ? { ...node, effectStyleId: style.id } : node) as CanvasNode[];
    commitCanvas(nextNodes, componentsRef.current, true, paintStylesRef.current, textStylesRef.current, [...effectStylesRef.current, style]);
  }

  function applyEffectStyle(style: CanvasEffectStyle): void {
    const ids = new Set(selectedIds);
    const nextNodes = nodes.map((node) => ids.has(node.id) && node.type !== "component" ? { ...node, shadow: cloneSnapshot(style.shadow), effectStyleId: style.id } : node) as CanvasNode[];
    commitCanvas(nextNodes);
  }

  function updateEffectStyle(styleId: string): void {
    if (!selectedNode || selectedNode.type === "component" || !selectedNode.shadow) return;
    const before = currentSnapshot();
    const nextStyles = effectStylesRef.current.map((style) => style.id === styleId ? { ...style, shadow: cloneSnapshot(selectedNode.shadow!) } : style);
    const updated = nextStyles.find((style) => style.id === styleId);
    if (!updated) return;
    const nextNodes = nodes.map((node) => node.type !== "component" && node.effectStyleId === styleId ? { ...node, shadow: cloneSnapshot(updated.shadow) } : node) as CanvasNode[];
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.effectStyleId === styleId ? { ...node, shadow: cloneSnapshot(updated.shadow) } : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type !== "component" && node.effectStyleId === styleId ? { ...node, shadow: cloneSnapshot(updated.shadow) } : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, paintStylesRef.current, textStylesRef.current, nextStyles);
  }

  function removeEffectStyle(styleId: string): void {
    const before = currentSnapshot();
    const nextNodes = nodes.map((node) => node.type !== "component" && node.effectStyleId === styleId ? { ...node, effectStyleId: undefined } : node) as CanvasNode[];
    const nextComponents = componentsRef.current.map((component) => ({ ...component, nodes: component.nodes.map((node) => node.effectStyleId === styleId ? { ...node, effectStyleId: undefined } : node) }));
    pagesRef.current = syncedPages(nodesRef.current).map((page) => ({ ...page, elements: page.elements.map((node) => node.type !== "component" && node.effectStyleId === styleId ? { ...node, effectStyleId: undefined } : node) }));
    pastRef.current = [...pastRef.current.slice(-49), before]; futureRef.current = [];
    commitCanvas(nextNodes, nextComponents, false, paintStylesRef.current, textStylesRef.current, effectStylesRef.current.filter((style) => style.id !== styleId));
  }

  function applyTokenValues(node: CanvasPrimitiveNode, collections: CanvasTokenCollection[]): CanvasPrimitiveNode {
    const bindings = node.tokenBindings;
    if (!bindings) return node;
    const values = new Map(collections.flatMap((collection) => collection.tokens.map((token) => [token.id, token.values[collection.activeMode]] as const)));
    const fill = bindings.fill ? values.get(bindings.fill) : undefined;
    const stroke = bindings.stroke ? values.get(bindings.stroke) : undefined;
    const radius = bindings.radius ? values.get(bindings.radius) : undefined;
    const opacity = bindings.opacity ? values.get(bindings.opacity) : undefined;
    const gap = bindings.gap ? values.get(bindings.gap) : undefined;
    const padding = bindings.padding ? values.get(bindings.padding) : undefined;
    return {
      ...node,
      color: typeof fill === "string" ? fill : node.color,
      strokeColor: typeof stroke === "string" ? stroke : node.strokeColor,
      radius: typeof radius === "number" ? Math.max(0, radius) : node.radius,
      opacity: typeof opacity === "number" ? Math.min(1, Math.max(0, opacity)) : node.opacity,
      layout: node.layout && (typeof gap === "number" || typeof padding === "number") ? { ...node.layout, gap: typeof gap === "number" ? Math.max(0, gap) : node.layout.gap, padding: typeof padding === "number" ? Math.max(0, padding) : node.layout.padding } : node.layout,
    };
  }

  function commitTokenCollections(nextCollections: CanvasTokenCollection[], activeNodes = nodesRef.current): void {
    const applyNodes = (values: CanvasNode[], definitions: CanvasComponentDefinition[]): CanvasNode[] => {
      let result = values.map((node) => node.type === "component" ? node : applyTokenValues(node, nextCollections));
      for (const frame of result.filter((node): node is CanvasPrimitiveNode => node.type === "frame" && Boolean(node.layout))) result = applyFrameLayout(result, frame.id, definitions);
      return result;
    };
    const nextComponents = componentsRef.current.map((component) => {
      let componentNodes: CanvasNode[] = component.nodes.map((node) => applyTokenValues(node, nextCollections));
      for (const frame of componentNodes.filter((node): node is CanvasPrimitiveNode => node.type === "frame" && Boolean(node.layout))) componentNodes = applyFrameLayout(componentNodes, frame.id, componentsRef.current);
      return { ...component, nodes: componentNodes.filter((node): node is CanvasPrimitiveNode => node.type !== "component") };
    });
    const nextPages = syncedPages(activeNodes).map((page) => ({ ...page, elements: applyNodes(page.elements, nextComponents) }));
    const active = nextPages.find((page) => page.id === activePageIdRef.current) ?? nextPages[0];
    pagesRef.current = nextPages;
    commitCanvas(active.elements, nextComponents, true, paintStylesRef.current, textStylesRef.current, effectStylesRef.current, nextCollections);
  }

  function createDesignToken(type: "color" | "number"): void {
    if (!selectedNode || selectedNode.type === "component") return;
    const collection = tokenCollections[0] ?? { id: crypto.randomUUID(), name: "Core", modes: ["Light", "Dark"], activeMode: "Light", tokens: [] };
    const value = type === "color" ? selectedNode.color : selectedNode.radius ?? 8;
    const token = { id: crypto.randomUUID(), name: type === "color" ? `${nodeLabel(selectedNode)} / Fill` : `${nodeLabel(selectedNode)} / Radius`, type, values: Object.fromEntries(collection.modes.map((mode) => [mode, value])) } as const;
    const nextCollection = { ...collection, tokens: [...collection.tokens, token] };
    const nextCollections = tokenCollections.length ? tokenCollections.map((candidate) => candidate.id === collection.id ? nextCollection : candidate) : [nextCollection];
    const binding = type === "color" ? { fill: token.id } : { radius: token.id };
    const boundNodes = nodes.map((node) => node.id === selectedNode.id && node.type !== "component" ? { ...node, tokenBindings: { ...node.tokenBindings, ...binding } } : node) as CanvasNode[];
    commitTokenCollections(nextCollections, boundNodes);
  }

  function bindDesignToken(tokenId: string): void {
    if (!selectedNode || selectedNode.type === "component") return;
    const token = tokenCollections.flatMap((collection) => collection.tokens).find((candidate) => candidate.id === tokenId);
    if (!token) return;
    const binding = token.type === "color" ? { fill: token.id } : { radius: token.id };
    const boundNodes = nodes.map((node) => node.id === selectedNode.id && node.type !== "component" ? { ...node, tokenBindings: { ...node.tokenBindings, ...binding } } : node) as CanvasNode[];
    commitTokenCollections(tokenCollections, boundNodes);
  }

  function setTokenMode(collectionId: string, mode: string): void {
    const next = tokenCollections.map((collection) => collection.id === collectionId && collection.modes.includes(mode) ? { ...collection, activeMode: mode } : collection);
    commitTokenCollections(next);
  }

  function updateDesignToken(collectionId: string, tokenId: string, patch: { name?: string; value?: string | number }): void {
    const next = tokenCollections.map((collection) => collection.id === collectionId ? { ...collection, tokens: collection.tokens.map((token) => token.id === tokenId ? { ...token, name: patch.name ?? token.name, values: patch.value === undefined ? token.values : { ...token.values, [collection.activeMode]: patch.value } } : token) } : collection);
    commitTokenCollections(next);
  }

  function createMaskFromSelection(): void {
    if (!canCreateMask || !maskCandidate) return;
    const selected = new Set(selectedIds);
    const nextNodes = nodes.map((node) => node.type !== "component" && selected.has(node.id) && node.id !== maskCandidate.id ? { ...node, maskId: maskCandidate.id } : node) as CanvasNode[];
    commitCanvas(nextNodes);
    setSelectedIds(selectedIds.filter((id) => id !== maskCandidate.id));
  }

  function releaseSelectedMask(): void {
    if (!selectedNode || selectedNode.type === "component" || !selectedNode.maskId) return;
    patchSelected({ maskId: undefined });
  }

  function removeSelected(): void {
    if (!selectedIds.length) return;
    const removing = new Set([...selectedIds, ...descendantIds(nodes, selectedIds)]);
    const affectedParents = [...new Set(nodes.filter((node) => removing.has(node.id)).flatMap((node) => node.parentId ? [node.parentId] : []))];
    let next = nodes.filter((node) => !removing.has(node.id)).map((node) => node.type !== "component" && node.maskId && removing.has(node.maskId) ? { ...node, maskId: undefined } : node) as CanvasNode[];
    for (const parentId of affectedParents) {
      const parent = next.find((node) => node.id === parentId);
      if (parent?.type !== "boolean") continue;
      const survivors = next.filter((node) => node.parentId === parent.id);
      if (survivors.length >= 2) continue;
      next = next.filter((node) => node.id !== parent.id).map((node) => node.parentId === parent.id ? { ...node, parentId: parent.parentId, groupId: parent.groupId } as CanvasNode : node);
      if (parent.parentId) next = applyFrameLayout(next, parent.parentId, componentsRef.current);
      if (editingBooleanId === parent.id) setEditingBooleanId(null);
    }
    for (const parentId of affectedParents) next = applyFrameLayout(next, parentId, componentsRef.current);
    commitCanvas(next);
    setSelectedIds([]);
  }

  function applyBooleanOperation(operation: CanvasBooleanOperation): void {
    if (!canBooleanSelection) return;
    const result = booleanCanvasNodes(selectedBooleanNodes, operation);
    if (!result) return;
    const firstIndex = Math.min(...selectedIds.map((id) => nodes.findIndex((node) => node.id === id)).filter((index) => index >= 0));
    const sharedParent = selectedBooleanNodes.every((node) => node.parentId === selectedBooleanNodes[0].parentId) ? selectedBooleanNodes[0].parentId : undefined;
    const sharedGroup = selectedBooleanNodes.every((node) => node.groupId === selectedBooleanNodes[0].groupId) ? selectedBooleanNodes[0].groupId : undefined;
    if (operation === "flatten") {
      const selectedSet = new Set(selectedIds);
      const next = nodes.filter((node) => !selectedSet.has(node.id));
      next.splice(Math.max(0, firstIndex), 0, { ...result, parentId: sharedParent, groupId: sharedGroup });
      commitCanvas(sharedParent ? applyFrameLayout(next, sharedParent, componentsRef.current) : next);
      setSelectedIds([result.id]);
      return;
    }
    const group: CanvasPrimitiveNode = { id: crypto.randomUUID(), type: "boolean", name: `${operation[0].toUpperCase()}${operation.slice(1)}`, x: result.x, y: result.y, width: result.width, height: result.height, color: result.color, fillGradient: result.fillGradient, opacity: result.opacity, strokeColor: result.strokeColor, strokeWidth: result.strokeWidth, parentId: sharedParent, groupId: sharedGroup, booleanOperation: operation };
    const selectedSet = new Set(selectedIds);
    const next = nodes.map((node) => selectedSet.has(node.id) ? { ...node, parentId: group.id, groupId: undefined } as CanvasNode : node);
    next.splice(Math.max(0, firstIndex), 0, group);
    commitCanvas(sharedParent ? applyFrameLayout(next, sharedParent, componentsRef.current) : next);
    setEditingBooleanId(null);
    setSelectedIds([group.id]);
  }

  function releaseSelectedBoolean(): void {
    if (selectedNode?.type !== "boolean") return;
    const children = nodes.filter((node) => node.parentId === selectedNode.id);
    const childIds = new Set(children.map((node) => node.id));
    const next = nodes.filter((node) => node.id !== selectedNode.id).map((node) => childIds.has(node.id) ? { ...node, parentId: selectedNode.parentId, groupId: selectedNode.groupId } as CanvasNode : node);
    commitCanvas(selectedNode.parentId ? applyFrameLayout(next, selectedNode.parentId, componentsRef.current) : next);
    setEditingBooleanId(null);
    setSelectedIds(children.map((node) => node.id));
  }

  function flattenSelectedBoolean(): void {
    if (selectedNode?.type !== "boolean") return;
    const result = booleanResultForNode(selectedNode, nodes);
    if (!result) return;
    const removing = new Set([selectedNode.id, ...descendantIds(nodes, [selectedNode.id])]);
    const index = nodes.findIndex((node) => node.id === selectedNode.id);
    const next = nodes.filter((node) => !removing.has(node.id));
    const flattened = { ...result, id: crypto.randomUUID(), name: `${nodeLabel(selectedNode)} flattened`, parentId: selectedNode.parentId, groupId: selectedNode.groupId };
    next.splice(Math.max(0, index), 0, flattened);
    commitCanvas(selectedNode.parentId ? applyFrameLayout(next, selectedNode.parentId, componentsRef.current) : next);
    setEditingBooleanId(null);
    setSelectedIds([flattened.id]);
  }

  function duplicateSelected(): void {
    if (!selectedNodes.length) return;
    const sourceIds = new Set([...selectedIds, ...descendantIds(nodes, selectedIds)]);
    const sources = nodes.filter((node) => sourceIds.has(node.id));
    const idMap = new Map(sources.map((node) => [node.id, crypto.randomUUID()]));
    const groupMap = new Map(sources.map((node) => node.groupId).filter((id): id is string => Boolean(id)).map((id) => [id, crypto.randomUUID()]));
    const copies = sources.map((node) => ({
      ...cloneSnapshot(node),
      id: idMap.get(node.id)!,
      name: selectedIds.includes(node.id) ? `${nodeLabel(node)} copy` : node.name,
      x: node.x + 18,
      y: node.y + 18,
      parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : node.parentId,
      groupId: node.groupId ? groupMap.get(node.groupId) : undefined,
      ...(node.type !== "component" ? {
        startBindingId: node.startBindingId && idMap.has(node.startBindingId) ? idMap.get(node.startBindingId) : node.startBindingId,
        endBindingId: node.endBindingId && idMap.has(node.endBindingId) ? idMap.get(node.endBindingId) : node.endBindingId,
        maskId: node.maskId && idMap.has(node.maskId) ? idMap.get(node.maskId) : node.maskId,
      } : {}),
      ...(node.type === "component" && node.componentRole === "main" ? { componentRole: "instance" as const } : {}),
    })) as CanvasNode[];
    commitCanvas(applyAffectedLayouts([...nodes, ...copies], copies.map((node) => node.id)));
    setSelectedIds(selectedIds.flatMap((id) => { const mapped = idMap.get(id); return mapped ? [mapped] : []; }));
  }

  function moveLayerInTree(dragId: string, targetId: string, nest: boolean): void {
    if (dragId === targetId) return;
    const moving = nodes.find((node) => node.id === dragId);
    const target = nodes.find((node) => node.id === targetId);
    if (!moving || !target || descendantIds(nodes, [dragId]).includes(targetId)) return;
    const parentId = nest && target.type === "frame" ? target.id : target.parentId;
    const currentBooleanParent = moving.parentId ? nodes.find((node) => node.id === moving.parentId && node.type === "boolean") : undefined;
    const nextBooleanParent = parentId ? nodes.find((node) => node.id === parentId && node.type === "boolean") : undefined;
    if ((currentBooleanParent || nextBooleanParent) && currentBooleanParent?.id !== nextBooleanParent?.id) return;
    const subtreeIds = new Set([dragId, ...descendantIds(nodes, [dragId])]);
    const subtree = nodes.filter((node) => subtreeIds.has(node.id));
    const without = nodes.filter((node) => !subtreeIds.has(node.id));
    const targetIndex = without.findIndex((node) => node.id === targetId);
    const updated = { ...moving, parentId, groupId: parentId ? undefined : moving.groupId } as CanvasNode;
    without.splice(Math.max(0, targetIndex + 1), 0, updated, ...subtree.filter((node) => node.id !== dragId));
    let next = without;
    for (const frameId of new Set([moving.parentId, parentId].filter((id): id is string => Boolean(id)))) next = applyFrameLayout(next, frameId, componentsRef.current);
    commitCanvas(next);
    setSelectedIds([dragId]);
  }

  function reparentSelected(parentId?: string): void {
    if (!selectedNode || parentId === selectedNode.parentId || parentId && descendantIds(nodes, [selectedNode.id]).includes(parentId)) return;
    const previousParentId = selectedNode.parentId;
    const previousBooleanParent = previousParentId ? nodes.find((node) => node.id === previousParentId && node.type === "boolean") : undefined;
    const nextBooleanParent = parentId ? nodes.find((node) => node.id === parentId && node.type === "boolean") : undefined;
    if ((previousBooleanParent || nextBooleanParent) && previousBooleanParent?.id !== nextBooleanParent?.id) return;
    let next = nodes.map((node) => node.id === selectedNode.id ? { ...node, parentId, groupId: parentId ? undefined : node.groupId } as CanvasNode : node);
    for (const frameId of new Set([previousParentId, parentId].filter((id): id is string => Boolean(id)))) next = applyFrameLayout(next, frameId, componentsRef.current);
    commitCanvas(next);
  }

  function groupSelected(): void {
    if (selectedNodes.length < 2) return;
    const groupId = crypto.randomUUID();
    commitCanvas(nodes.map((node) => selectedIds.includes(node.id) ? { ...node, groupId } : node) as CanvasNode[]);
  }

  function ungroupSelected(): void {
    const groupIds = new Set(selectedNodes.map((node) => node.groupId).filter((id): id is string => Boolean(id)));
    if (!groupIds.size) return;
    const ungroupedIds = nodes.filter((node) => node.groupId && groupIds.has(node.groupId)).map((node) => node.id);
    commitCanvas(nodes.map((node) => node.groupId && groupIds.has(node.groupId) ? { ...node, groupId: undefined } : node) as CanvasNode[]);
    setSelectedIds(ungroupedIds);
  }

  function createFrameFromSelection(withLayout = false): void {
    if (!selectedBounds || !selectedNodes.length) return;
    const padding = 24;
    const frame = createPrimitive("frame", selectedBounds.x - padding, selectedBounds.y - padding, selectedBounds.width + padding * 2, selectedBounds.height + padding * 2);
    if (withLayout) frame.layout = { direction: "row", align: "center", justify: "start", gap: 16, padding, sizing: "hug" };
    const firstSelectedIndex = Math.min(...selectedIds.map((id) => nodes.findIndex((node) => node.id === id)).filter((index) => index >= 0));
    const parented = nodes.map((node) => selectedIds.includes(node.id) ? { ...node, parentId: frame.id, groupId: undefined } as CanvasNode : node);
    parented.splice(Math.max(0, firstSelectedIndex), 0, frame);
    const laidOut = withLayout ? applyFrameLayout(parented, frame.id, components) : parented;
    commitCanvas(laidOut);
    setSelectedIds([frame.id]);
  }

  function toggleAutoLayout(): void {
    if (selectedNode?.type === "frame") {
      const layout = selectedNode.layout
        ? undefined
        : { direction: "row", align: "center", justify: "start", gap: 16, padding: 24, sizing: "fixed" } as const;
      patchSelected({ layout } as Partial<CanvasPrimitiveNode>);
      return;
    }
    if (selectedNodes.length) createFrameFromSelection(true);
  }

  function patchFrameLayout(patch: Partial<NonNullable<CanvasPrimitiveNode["layout"]>>): void {
    if (!selectedNode || selectedNode.type !== "frame" || !selectedNode.layout) return;
    const layout = { ...selectedNode.layout, ...patch };
    const detached = ["gap" in patch ? "gap" : undefined, "padding" in patch ? "padding" : undefined].filter((key): key is "gap" | "padding" => Boolean(key));
    const next = applyFrameLayout(nodes.map((node) => node.id === selectedNode.id ? { ...node, layout, tokenBindings: detached.length ? withoutTokenBindings(selectedNode.tokenBindings, detached) : selectedNode.tokenBindings } : node) as CanvasNode[], selectedNode.id, components);
    commitCanvas(next, componentsRef.current, shouldRecordInspectorHistory(`${selectedNode.id}:layout:${Object.keys(patch).sort().join(",")}`));
  }

  function addFrameLayoutGrid(type: "square" | "columns" | "rows"): void {
    if (selectedNode?.type !== "frame") return;
    const grid = { id: crypto.randomUUID(), type, visible: true, color: "#2563eb", opacity: type === "square" ? .24 : .12, ...(type === "square" ? { size: snapGridSize } : { count: 12, gutter: 16, margin: 24 }) } as const;
    patchSelected({ layoutGrids: [...(selectedNode.layoutGrids ?? []), grid] });
  }

  function patchFrameLayoutGrid(gridId: string, patch: Partial<NonNullable<CanvasPrimitiveNode["layoutGrids"]>[number]>): void {
    if (selectedNode?.type !== "frame") return;
    const bounded = {
      ...patch,
      ...(patch.count !== undefined ? { count: Math.min(100, Math.max(1, Math.round(patch.count))) } : {}),
      ...(patch.size !== undefined ? { size: Math.min(10_000, Math.max(1, patch.size)) } : {}),
    };
    patchSelected({ layoutGrids: (selectedNode.layoutGrids ?? []).map((grid) => grid.id === gridId ? { ...grid, ...bounded } : grid) });
  }

  function removeFrameLayoutGrid(gridId: string): void {
    if (selectedNode?.type !== "frame") return;
    patchSelected({ layoutGrids: (selectedNode.layoutGrids ?? []).filter((grid) => grid.id !== gridId) });
  }

  function createComponentFromSelection(): void {
    if (!canCreateComponent || !selectedBounds) return;
    const sourceIds = new Set([...selectedIds, ...descendantIds(nodes, selectedIds)]);
    const sourceNodes = nodes.filter((node): node is CanvasPrimitiveNode => sourceIds.has(node.id) && node.type !== "component");
    const sourceBounds = selectionRect(sourceNodes, components) ?? selectedBounds;
    const definitionId = crypto.randomUUID();
    const definition: CanvasComponentDefinition = {
      id: definitionId,
      name: nextComponentName(components),
      width: sourceBounds.width,
      height: sourceBounds.height,
      nodes: sourceNodes.map((node) => ({ ...cloneSnapshot(node), x: node.x - sourceBounds.x, y: node.y - sourceBounds.y, parentId: node.parentId && sourceIds.has(node.parentId) ? node.parentId : undefined, maskId: node.maskId && sourceIds.has(node.maskId) ? node.maskId : undefined, startBindingId: node.startBindingId && sourceIds.has(node.startBindingId) ? node.startBindingId : undefined, endBindingId: node.endBindingId && sourceIds.has(node.endBindingId) ? node.endBindingId : undefined })),
    };
    const main: CanvasComponentNode = {
      id: crypto.randomUUID(),
      type: "component",
      componentId: definitionId,
      componentRole: "main",
      name: definition.name,
      x: sourceBounds.x,
      y: sourceBounds.y,
      width: definition.width,
      height: definition.height,
      color: "#2563eb",
      opacity: 1,
    };
    commitCanvas([...nodes.filter((node) => !sourceIds.has(node.id)), main], [...components, definition]);
    setSelectedIds([main.id]);
    setSidePanel("assets");
  }

  function insertComponent(source: CanvasComponentDefinition): void {
    const existing = components.find((component) => component.id === source.id);
    const definition = existing ?? cloneSnapshot(source);
    const nextComponents = existing ? components : [...components, definition];
    const offset = (nodes.length % 7) * 16;
    const instance: CanvasComponentNode = {
      id: crypto.randomUUID(),
      type: "component",
      componentId: definition.id,
      componentRole: "instance",
      name: definition.name,
      x: 116 + offset,
      y: 104 + offset,
      width: definition.width,
      height: definition.height,
      color: "#2563eb",
      opacity: 1,
    };
    commitCanvas([...nodes, instance], nextComponents);
    setSelectedIds([instance.id]);
  }

  function detachSelectedInstance(): void {
    if (!selectedNode || selectedNode.type !== "component" || selectedNode.componentRole !== "instance" || !selectedComponent) return;
    const scaleX = selectedNode.width / selectedComponent.width;
    const scaleY = selectedNode.height / selectedComponent.height;
    const centerX = selectedNode.x + selectedNode.width / 2;
    const centerY = selectedNode.y + selectedNode.height / 2;
    const instanceRotation = selectedNode.rotation ?? 0;
    const idMap = new Map(selectedComponent.nodes.map((source) => [source.id, crypto.randomUUID()]));
    const detached = selectedComponent.nodes.map((source) => {
      const node = effectivePrimitive(source, selectedNode);
      const width = node.width * scaleX;
      const height = node.height * scaleY;
      const unrotatedCenter = { x: selectedNode.x + node.x * scaleX + width / 2, y: selectedNode.y + node.y * scaleY + height / 2 };
      const center = rotatePoint(unrotatedCenter, centerX, centerY, instanceRotation);
      return {
        ...cloneSnapshot(node),
        id: idMap.get(source.id)!,
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        opacity: (node.opacity ?? 1) * (selectedNode.opacity ?? 1),
        rotation: normalizedAngle((node.rotation ?? 0) + instanceRotation),
        parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined,
        groupId: undefined,
        startBindingId: node.startBindingId && idMap.has(node.startBindingId) ? idMap.get(node.startBindingId) : undefined,
        endBindingId: node.endBindingId && idMap.has(node.endBindingId) ? idMap.get(node.endBindingId) : undefined,
        maskId: node.maskId && idMap.has(node.maskId) ? idMap.get(node.maskId) : undefined,
        name: node.name ?? (node.type === "text" ? "Text" : "Rectangle"),
      } satisfies CanvasPrimitiveNode;
    });
    commitCanvas([...nodes.filter((node) => node.id !== selectedNode.id), ...detached]);
    setSelectedIds(detached.map((node) => node.id));
    setSidePanel("layers");
  }

  function patchComponentPrimitive(sourceId: string, patch: Partial<Pick<CanvasPrimitiveNode, "text" | "color" | "opacity">>): void {
    if (!selectedNode || selectedNode.type !== "component" || !selectedComponent) return;
    if (selectedNode.componentRole === "main") {
      const nextComponents = components.map((component) => component.id === selectedComponent.id
        ? { ...component, nodes: component.nodes.map((node) => node.id === sourceId ? { ...node, ...patch } : node) }
        : component);
      commitCanvas(nodes, nextComponents, shouldRecordInspectorHistory(`${selectedNode.id}:component:${sourceId}:${Object.keys(patch).sort().join(",")}`));
      return;
    }
    patchSelected({ overrides: { ...selectedNode.overrides, [sourceId]: { ...selectedNode.overrides?.[sourceId], ...patch } } } as Partial<CanvasComponentNode>);
  }

  function resetSelectedOverrides(): void {
    if (!selectedNode || selectedNode.type !== "component" || selectedNode.componentRole !== "instance") return;
    patchSelected({ overrides: {} } as Partial<CanvasComponentNode>);
  }

  function renameSelectedComponent(name: string): void {
    const finalName = name.trim();
    if (!selectedComponent || !finalName) return;
    const nextComponents = components.map((component) => component.id === selectedComponent.id ? { ...component, name: finalName } : component);
    const nextNodes = nodes.map((node) => node.type === "component" && node.componentId === selectedComponent.id ? { ...node, name: finalName } : node);
    commitCanvas(nextNodes, nextComponents, shouldRecordInspectorHistory(`${selectedNode?.id ?? selectedComponent.id}:component-name`));
  }

  function createComponentVariant(): void {
    if (!selectedNode || selectedNode.type !== "component" || selectedNode.componentRole !== "main" || !selectedComponent) return;
    const setId = selectedComponent.variantSetId ?? crypto.randomUUID();
    const setName = selectedComponent.variantSetName ?? (selectedComponent.name.split("/")[0].trim() || selectedComponent.name);
    const variants = components.filter((component) => component.variantSetId === setId);
    const propertyName = Object.keys(selectedComponent.variantProperties ?? {})[0] ?? "State";
    const baseDefinition = selectedComponent.variantSetId ? selectedComponent : { ...selectedComponent, variantSetId: setId, variantSetName: setName, variantProperties: { [propertyName]: "Default" } };
    const nextValue = `Variant ${variants.length + (selectedComponent.variantSetId ? 1 : 2)}`;
    const nextDefinition: CanvasComponentDefinition = {
      ...cloneSnapshot(baseDefinition),
      id: crypto.randomUUID(),
      name: `${setName} / ${nextValue}`,
      builtIn: false,
      variantProperties: { ...baseDefinition.variantProperties, [propertyName]: nextValue },
    };
    const nextComponents = components.map((component) => component.id === selectedComponent.id ? baseDefinition : component).concat(nextDefinition);
    const main: CanvasComponentNode = {
      ...cloneSnapshot(selectedNode),
      id: crypto.randomUUID(),
      componentId: nextDefinition.id,
      name: nextDefinition.name,
      x: selectedNode.x + selectedNode.width + 32,
      overrides: undefined,
    };
    commitCanvas([...nodes, main], nextComponents);
    setSelectedIds([main.id]);
  }

  function updateSelectedVariant(propertyName: string, propertyValue: string): void {
    if (!selectedComponent?.variantSetId) return;
    const previousName = Object.keys(selectedComponent.variantProperties ?? {})[0] ?? "State";
    const safeName = propertyName.trim() || previousName;
    const safeValue = propertyValue.trim() || "Default";
    const nextComponents = components.map((component) => {
      if (component.variantSetId !== selectedComponent.variantSetId) return component;
      const existingValue = component.variantProperties?.[previousName] ?? component.variantProperties?.[safeName] ?? "Default";
      return {
        ...component,
        variantProperties: { ...Object.fromEntries(Object.entries(component.variantProperties ?? {}).filter(([key]) => key !== previousName && key !== safeName)), [safeName]: component.id === selectedComponent.id ? safeValue : existingValue },
      };
    });
    commitCanvas(nodes, nextComponents, shouldRecordInspectorHistory(`${selectedComponent.id}:variant-metadata`));
  }

  function switchSelectedVariant(componentId: string): void {
    if (!selectedNode || selectedNode.type !== "component" || selectedNode.componentRole !== "instance" || !selectedComponent?.variantSetId) return;
    const target = components.find((component) => component.id === componentId && component.variantSetId === selectedComponent.variantSetId);
    if (!target) return;
    const targetNodeIds = new Set(target.nodes.map((node) => node.id));
    const overrides = Object.fromEntries(Object.entries(selectedNode.overrides ?? {}).filter(([nodeId]) => targetNodeIds.has(nodeId)));
    commitCanvas(nodes.map((node) => node.id === selectedNode.id ? { ...node, componentId: target.id, name: target.name, overrides } : node));
  }

  function reorderSelected(direction: "front" | "forward" | "backward" | "back"): void {
    if (!selectedIds.length) return;
    const selectedSet = new Set(selectedIds);
    const selectedRoots = selectedIds.filter((id) => {
      let parentId = nodes.find((node) => node.id === id)?.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        if (selectedSet.has(parentId)) return false;
        visited.add(parentId);
        parentId = nodes.find((node) => node.id === parentId)?.parentId;
      }
      return true;
    });
    const parentKeys = new Set(selectedRoots.map((id) => nodes.find((node) => node.id === id)?.parentId ?? "__root__"));
    const siblingOrders = new Map<string, CanvasNode[]>();
    for (const parentKey of parentKeys) {
      const siblings = nodes.filter((node) => (node.parentId ?? "__root__") === parentKey);
      const moving = new Set(selectedRoots.filter((id) => siblings.some((node) => node.id === id)));
      if (direction === "front" || direction === "back") {
        const selected = siblings.filter((node) => moving.has(node.id));
        const rest = siblings.filter((node) => !moving.has(node.id));
        siblingOrders.set(parentKey, direction === "front" ? [...rest, ...selected] : [...selected, ...rest]);
      } else {
        const ordered = [...siblings];
        if (direction === "forward") {
          for (let index = ordered.length - 2; index >= 0; index -= 1) if (moving.has(ordered[index].id) && !moving.has(ordered[index + 1].id)) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
        } else {
          for (let index = 1; index < ordered.length; index += 1) if (moving.has(ordered[index].id) && !moving.has(ordered[index - 1].id)) [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
        }
        siblingOrders.set(parentKey, ordered);
      }
    }
    const siblingsFor = (parentId: string | undefined): CanvasNode[] => siblingOrders.get(parentId ?? "__root__") ?? nodes.filter((node) => node.parentId === parentId);
    const flattened: CanvasNode[] = [];
    const visited = new Set<string>();
    const visit = (node: CanvasNode): void => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      flattened.push(node);
      for (const child of siblingsFor(node.id)) visit(child);
    };
    for (const root of siblingsFor(undefined).filter((node) => !node.parentId || !nodes.some((candidate) => candidate.id === node.parentId))) visit(root);
    for (const node of nodes) visit(node);
    commitCanvas(flattened);
  }

  function toggleSelectedLock(): void {
    if (!selectedNodes.length) return;
    const lock = selectedNodes.some((node) => !node.locked);
    commitCanvas(nodes.map((node) => selectedIds.includes(node.id) ? { ...node, locked: lock } : node) as CanvasNode[]);
  }

  function toggleSelectedVisibility(): void {
    if (!selectedNodes.length) return;
    const hidden = selectedNodes.some((node) => !node.hidden);
    commitCanvas(nodes.map((node) => selectedIds.includes(node.id) ? { ...node, hidden } : node) as CanvasNode[]);
    if (hidden) setSelectedIds([]);
  }

  function alignSelected(mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom"): void {
    if (selectedNodes.length < 2 || !selectedBounds) return;
    const deltas = new Map<string, { x: number; y: number }>();
    for (const node of selectedNodes) {
      const size = nodeSize(node, components);
      const x = mode === "left" ? selectedBounds.x : mode === "center-x" ? selectedBounds.x + (selectedBounds.width - size.width) / 2 : mode === "right" ? selectedBounds.x + selectedBounds.width - size.width : node.x;
      const y = mode === "top" ? selectedBounds.y : mode === "center-y" ? selectedBounds.y + (selectedBounds.height - size.height) / 2 : mode === "bottom" ? selectedBounds.y + selectedBounds.height - size.height : node.y;
      deltas.set(node.id, { x: x - node.x, y: y - node.y });
    }
    commitCanvas(applyPositionDeltas(deltas));
  }

  function distributeSelected(axis: "horizontal" | "vertical"): void {
    if (selectedNodes.length < 3 || !selectedBounds) return;
    const sorted = [...selectedNodes].sort((first, second) => axis === "horizontal" ? first.x - second.x : first.y - second.y);
    const totalSize = sorted.reduce((sum, node) => sum + (axis === "horizontal" ? nodeSize(node, components).width : nodeSize(node, components).height), 0);
    const space = ((axis === "horizontal" ? selectedBounds.width : selectedBounds.height) - totalSize) / (sorted.length - 1);
    let cursor = axis === "horizontal" ? selectedBounds.x : selectedBounds.y;
    const positions = new Map<string, number>();
    for (const node of sorted) {
      positions.set(node.id, cursor);
      cursor += (axis === "horizontal" ? nodeSize(node, components).width : nodeSize(node, components).height) + space;
    }
    const deltas = new Map(sorted.map((node) => [node.id, axis === "horizontal" ? { x: positions.get(node.id)! - node.x, y: 0 } : { x: 0, y: positions.get(node.id)! - node.y }]));
    commitCanvas(applyPositionDeltas(deltas));
  }

  function applyPositionDeltas(deltas: Map<string, { x: number; y: number }>): CanvasNode[] {
    return nodes.map((node) => {
      let delta = deltas.get(node.id);
      let parentId = node.parentId;
      const visited = new Set<string>();
      while (!delta && parentId && !visited.has(parentId)) {
        visited.add(parentId);
        delta = deltas.get(parentId);
        parentId = nodes.find((candidate) => candidate.id === parentId)?.parentId;
      }
      return delta ? { ...node, x: node.x + delta.x, y: node.y + delta.y } as CanvasNode : node;
    });
  }

  function applyAffectedLayouts(source: CanvasNode[], movedIds: string[]): CanvasNode[] {
    const parentIds = [...new Set(movedIds.flatMap((id) => {
      const node = source.find((candidate) => candidate.id === id);
      if (!node?.parentId || node.layoutPosition === "absolute") return [];
      const parent = source.find((candidate) => candidate.id === node.parentId);
      return parent?.type === "frame" && parent.layout ? [parent.id] : [];
    }))];
    return parentIds.reduce((current, parentId) => applyFrameLayout(current, parentId, componentsRef.current), source);
  }

  function fitFrame(): void {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const zoom = clampCanvasZoom(Math.min((bounds.width - 112) / canvasFrame.width, (bounds.height - 112) / canvasFrame.height));
    persistViewport({ zoom, x: Math.round((bounds.width - canvasFrame.width * zoom) / 2), y: Math.round((bounds.height - canvasFrame.height * zoom) / 2) });
    fittedRef.current = true;
  }

  useEffect(() => {
    fittedRef.current = Boolean(content.appState.viewport);
    const element = stageRef.current;
    if (!element) return;
    const measure = (): void => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) setStageSize((current) => current?.width === bounds.width && current.height === bounds.height ? current : { width: bounds.width, height: bounds.height });
      if (!fittedRef.current) fitFrame();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [artifact.id]);

  useEffect(() => {
    const element = layerListRef.current;
    if (!element || sidePanel !== "layers") return;
    const measure = (): void => {
      const height = element.getBoundingClientRect().height;
      setLayerViewport((current) => current.height === height ? current : { ...current, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [artifact.id, sidePanel]);

  useEffect(() => {
    const selectedId = selectedIds.at(-1);
    const element = layerListRef.current;
    if (!selectedId || !element || layerRows.length < 400 || layerViewport.height <= 30) return;
    const index = layerRows.findIndex((node) => node.id === selectedId);
    if (index < 0) return;
    const top = 30 + index * 32;
    const bottom = top + 32;
    if (top >= element.scrollTop + 30 && bottom <= element.scrollTop + layerViewport.height) return;
    const scrollTop = Math.max(0, top - 30 - (layerViewport.height - 30) / 2 + 16);
    element.scrollTop = scrollTop;
    setLayerViewport((current) => ({ ...current, scrollTop }));
  }, [layerRows, layerViewport.height, selectedIds]);

  function stagePoint(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = stageRef.current?.getBoundingClientRect();
    const current = viewportRef.current;
    return { x: (clientX - (bounds?.left ?? 0) - current.x) / current.zoom, y: (clientY - (bounds?.top ?? 0) - current.y) / current.zoom };
  }

  function beginPan(clientX: number, clientY: number, pointerId: number): void {
    const stage = stageRef.current;
    if (!stage) return;
    gestureRef.current = { kind: "pan", pointerX: clientX, pointerY: clientY, originX: viewport.x, originY: viewport.y };
    stage.setPointerCapture?.(pointerId);
  }

  function nodeAtPoint(point: { x: number; y: number }, excludeId?: string): CanvasNode | undefined {
    for (let index = geometryIndex.length - 1; index >= 0; index -= 1) {
      const entry = geometryIndex[index];
      if (entry.node.id !== excludeId && entry.node.type !== "arrow" && !entry.hidden && !entry.locked
        && intersects({ x: point.x, y: point.y, width: 0, height: 0 }, entry.rect)) return entry.node;
    }
    return undefined;
  }

  function finishPenDraft(closed = false): void {
    const draft = penDraftRef.current;
    if (!draft) return;
    penDraftRef.current = null;
    const filtered = draft.absolutePoints.filter((point, index, points) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .5);
    if (filtered.length < 2) {
      nodesRef.current = cloneSnapshot(draft.before.nodes);
      setCanvasNodes(nodesRef.current);
      setSelectedIds([]);
      return;
    }
    const geometry = normalizeCanvasPath(filtered);
    const next = nodesRef.current.map((node) => node.id === draft.nodeId && node.type === "path" ? { ...node, ...geometry, pathClosed: closed } : node) as CanvasNode[];
    nodesRef.current = next;
    setCanvasNodes(next);
    pastRef.current = [...pastRef.current.slice(-49), draft.before];
    futureRef.current = [];
    commitCanvas(next, componentsRef.current, false);
    setSelectedIds([draft.nodeId]);
  }

  function cancelPenDraft(): void {
    const draft = penDraftRef.current;
    if (!draft) return;
    penDraftRef.current = null;
    nodesRef.current = cloneSnapshot(draft.before.nodes);
    setCanvasNodes(nodesRef.current);
    setSelectedIds([]);
  }

  function chooseTool(nextTool: CanvasTool): void {
    if (penDraftRef.current) finishPenDraft(false);
    setTool(nextTool);
  }

  function handleStagePointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    if (event.button === 1 || tool === "hand") {
      event.preventDefault();
      beginPan(event.clientX, event.clientY, event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = stagePoint(event.clientX, event.clientY);
    if (tool === "pen") {
      const draft = penDraftRef.current;
      if (!draft) {
        const before = currentSnapshot();
        const node: CanvasPrimitiveNode = { id: crypto.randomUUID(), type: "path", name: "Vector path", x: point.x, y: point.y, width: 1, height: 1, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], color: "#17181c", strokeColor: "#17181c", strokeWidth: 2, opacity: 1 };
        penDraftRef.current = { nodeId: node.id, before, absolutePoints: [point] };
        nodesRef.current = [...nodesRef.current, node];
        setCanvasNodes(nodesRef.current);
        setSelectedIds([node.id]);
      } else {
        const first = draft.absolutePoints[0];
        const close = draft.absolutePoints.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= 8 / viewport.zoom;
        if (close) finishPenDraft(true);
        else {
          draft.absolutePoints.push(point);
          const geometry = normalizeCanvasPath(draft.absolutePoints);
          nodesRef.current = nodesRef.current.map((node) => node.id === draft.nodeId && node.type === "path" ? { ...node, ...geometry } : node) as CanvasNode[];
          setCanvasNodes(nodesRef.current);
        }
      }
      event.currentTarget.focus();
      return;
    }
    if (tool === "pencil") {
      const before = currentSnapshot();
      const node: CanvasPrimitiveNode = { id: crypto.randomUUID(), type: "path", name: "Freehand path", x: point.x, y: point.y, width: 1, height: 1, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], color: "#17181c", strokeColor: "#17181c", strokeWidth: 2, pathSmoothing: .65, opacity: 1 };
      nodesRef.current = [...nodesRef.current, node];
      setCanvasNodes(nodesRef.current);
      setSelectedIds([node.id]);
      gestureRef.current = { kind: "freehand", nodeId: node.id, absolutePoints: [point], before };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus();
      return;
    }
    if (tool !== "select") {
      const draft = createPrimitive(tool, point.x, point.y, 1, 1);
      if (draft.type === "arrow") draft.startBindingId = nodeAtPoint(point)?.id;
      const before = currentSnapshot();
      const next = [...nodesRef.current, draft];
      nodesRef.current = next;
      setCanvasNodes(next);
      setSelectedIds([draft.id]);
      gestureRef.current = { kind: "draw", tool, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, nodeId: draft.id, before };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus();
      return;
    }
    gestureRef.current = { kind: "marquee", startX: point.x, startY: point.y, currentX: point.x, currentY: point.y };
    setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
    setSelectedIds([]);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
  }

  function createMoveSnapContext(movingIds: string[], directIds: string[]): CanvasMoveSnapContext {
    const movingIdSet = new Set(movingIds);
    const directNodes = nodes.filter((node) => directIds.includes(node.id));
    const parentKeys = new Set(directNodes.map((node) => node.parentId ?? "__page__"));
    const hasSharedParent = parentKeys.size === 1;
    const sharedParentId = hasSharedParent ? directNodes[0]?.parentId : undefined;
    const targetPool = hasSharedParent
      ? snapRectTargetsByParent.get(sharedParentId ?? "__page__") ?? []
      : [...snapRectTargetsByParent.values()].flat();
    const rectTargets = targetPool.filter((target) => !movingIdSet.has(target.id));
    const parentFrame = sharedParentId ? nodes.find((node): node is CanvasPrimitiveNode => node.id === sharedParentId && node.type === "frame") : undefined;
    if (parentFrame && !movingIdSet.has(parentFrame.id) && !rectTargets.some((target) => target.id === parentFrame.id)) {
      rectTargets.push({ id: parentFrame.id, rect: rotatedRect(nodeRect(parentFrame, components), parentFrame.rotation), kind: "frame" });
    }
    const gridFrame = parentFrame && !(parentFrame.rotation ?? 0) ? parentFrame : undefined;
    const squareGrid = gridFrame?.layoutGrids?.find((grid) => grid.visible && grid.type === "square");
    const axisTargets: CanvasSnapAxisTarget[] = guidesVisible ? rulerGuides.map((guide) => ({ axis: guide.axis, position: guide.position, kind: "guide" })) : [];
    for (const grid of snapToGrid ? gridFrame?.layoutGrids?.filter((candidate) => candidate.visible) ?? [] : []) {
      const count = Math.min(100, Math.max(1, Math.round(grid.count ?? 12)));
      const gutter = grid.gutter ?? 16;
      const margin = grid.margin ?? 24;
      if (grid.type === "columns") {
        const size = Math.max(0, (gridFrame!.width - margin * 2 - gutter * (count - 1)) / count);
        for (let index = 0; index < count; index += 1) {
          const start = gridFrame!.x + margin + index * (size + gutter);
          axisTargets.push({ axis: "x", position: start, kind: "layout-grid", from: gridFrame!.y, to: gridFrame!.y + gridFrame!.height });
          axisTargets.push({ axis: "x", position: start + size, kind: "layout-grid", from: gridFrame!.y, to: gridFrame!.y + gridFrame!.height });
        }
      }
      if (grid.type === "rows") {
        const size = Math.max(0, (gridFrame!.height - margin * 2 - gutter * (count - 1)) / count);
        for (let index = 0; index < count; index += 1) {
          const start = gridFrame!.y + margin + index * (size + gutter);
          axisTargets.push({ axis: "y", position: start, kind: "layout-grid", from: gridFrame!.x, to: gridFrame!.x + gridFrame!.width });
          axisTargets.push({ axis: "y", position: start + size, kind: "layout-grid", from: gridFrame!.x, to: gridFrame!.x + gridFrame!.width });
        }
      }
    }
    return {
      snapIndex: prepareCanvasSnapIndex(rectTargets, axisTargets, { x: 0, y: 0, ...canvasFrame }),
      gridSize: squareGrid?.size ?? snapGridSize,
      gridOriginX: gridFrame?.x ?? 0,
      gridOriginY: gridFrame?.y ?? 0,
    };
  }

  function beginNodeMove(event: React.PointerEvent<SVGElement>, node: CanvasNode): void {
    if (tool !== "select" && tool !== "hand") return;
    event.stopPropagation();
    if (hasNodeOrAncestorFlag(node, "hidden") || hasNodeOrAncestorFlag(node, "locked")) return;
    if (tool === "hand") {
      beginPan(event.clientX, event.clientY, event.pointerId);
      return;
    }
    if (event.shiftKey) {
      const toggleIds = node.groupId ? nodes.filter((item) => item.groupId === node.groupId).map((item) => item.id) : [node.id];
      setSelectedIds((current) => toggleIds.every((id) => current.includes(id)) ? current.filter((id) => !toggleIds.includes(id)) : [...new Set([...current, ...toggleIds])]);
      return;
    }
    const directIds = selectedIds.includes(node.id)
      ? selectedIds
      : node.groupId ? nodes.filter((item) => item.groupId === node.groupId).map((item) => item.id) : [node.id];
    const ids = [...new Set([...directIds, ...descendantIds(nodes, directIds)])].filter((id) => !nodes.find((item) => item.id === id)?.locked);
    const movingNodes = nodes.filter((item) => ids.includes(item.id));
    const bounds = selectionRect(movingNodes, components);
    if (!bounds) return;
    setSelectedIds(directIds);
    const point = stagePoint(event.clientX, event.clientY);
    gestureRef.current = {
      kind: "move",
      pointerX: point.x,
      pointerY: point.y,
      selectedIds: ids,
      bounds,
      origins: Object.fromEntries(movingNodes.map((item) => [item.id, { x: item.x, y: item.y }])),
      snapContext: createMoveSnapContext(ids, directIds),
      before: currentSnapshot(),
    };
    stageRef.current?.setPointerCapture?.(event.pointerId);
    stageRef.current?.focus();
  }

  function beginResize(event: React.PointerEvent<SVGRectElement>, node: CanvasNode, handle: ResizeHandle): void {
    event.stopPropagation();
    if (node.locked) return;
    const origin = nodeRect(node, components);
    const centerX = origin.x + origin.width / 2;
    const centerY = origin.y + origin.height / 2;
    const point = rotatePoint(stagePoint(event.clientX, event.clientY), centerX, centerY, -(node.rotation ?? 0));
    gestureRef.current = { kind: "resize", pointerX: point.x, pointerY: point.y, origin, centerX, centerY, rotation: node.rotation ?? 0, handle, nodeId: node.id, before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function beginPathPointMove(event: React.PointerEvent<SVGCircleElement>, node: CanvasPrimitiveNode, pointIndex: number): void {
    event.stopPropagation();
    if (node.locked) return;
    setSelectedPathPointIndex(pointIndex);
    gestureRef.current = { kind: "path-point", nodeId: node.id, pointIndex, centerX: node.x + node.width / 2, centerY: node.y + node.height / 2, rotation: node.rotation ?? 0, before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function beginPathHandleMove(event: React.PointerEvent<SVGCircleElement>, node: CanvasPrimitiveNode, pointIndex: number, handle: "in" | "out"): void {
    event.stopPropagation();
    if (node.locked) return;
    setSelectedPathPointIndex(pointIndex);
    gestureRef.current = { kind: "path-handle", nodeId: node.id, pointIndex, handle, centerX: node.x + node.width / 2, centerY: node.y + node.height / 2, rotation: node.rotation ?? 0, before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function replacePathPoint(node: CanvasPrimitiveNode, pointIndex: number, nextPoint: CanvasAbsolutePoint, recordHistory = true): void {
    const points = canvasPathAbsolutePoints(node);
    if (!points[pointIndex]) return;
    points[pointIndex] = nextPoint;
    const geometry = normalizeCanvasPath(points);
    commitCanvas(nodesRef.current.map((candidate) => candidate.id === node.id ? { ...candidate, ...geometry, pathSmoothing: 0 } as CanvasNode : candidate), componentsRef.current, recordHistory);
  }

  function setSelectedPathNodeType(nodeType: "corner" | "smooth"): void {
    if (!selectedNode || selectedNode.type === "component" || selectedPathPointIndex === null || (selectedNode.type !== "path" && selectedNode.type !== "arrow")) return;
    const points = canvasPathAbsolutePoints(selectedNode);
    const point = points[selectedPathPointIndex];
    if (!point) return;
    if (nodeType === "corner") {
      replacePathPoint(selectedNode, selectedPathPointIndex, { x: point.x, y: point.y, nodeType: "corner" });
      return;
    }
    const hasPrevious = selectedPathPointIndex > 0 || Boolean(selectedNode.pathClosed);
    const hasNext = selectedPathPointIndex < points.length - 1 || Boolean(selectedNode.pathClosed);
    const previous = points[selectedPathPointIndex - 1] ?? (selectedNode.pathClosed ? points.at(-1) : undefined) ?? point;
    const next = points[selectedPathPointIndex + 1] ?? (selectedNode.pathClosed ? points[0] : undefined) ?? point;
    let dx = (next.x - previous.x) / 6;
    let dy = (next.y - previous.y) / 6;
    if (Math.hypot(dx, dy) < 1) { dx = Math.max(12, selectedNode.width / 6); dy = 0; }
    replacePathPoint(selectedNode, selectedPathPointIndex, { ...point, nodeType: "smooth", handleIn: hasPrevious ? { x: point.x - dx, y: point.y - dy } : undefined, handleOut: hasNext ? { x: point.x + dx, y: point.y + dy } : undefined });
  }

  function addPathPointAfterSelection(): void {
    if (!selectedNode || selectedNode.type === "component" || selectedPathPointIndex === null || (selectedNode.type !== "path" && selectedNode.type !== "arrow")) return;
    const points = canvasPathAbsolutePoints(selectedNode);
    const startIndex = selectedPathPointIndex;
    const endIndex = startIndex + 1 < points.length ? startIndex + 1 : selectedNode.pathClosed ? 0 : -1;
    if (endIndex < 0) return;
    const start = points[startIndex];
    const end = points[endIndex];
    const p0 = { x: start.x, y: start.y };
    const p1 = start.handleOut ?? p0;
    const p3 = { x: end.x, y: end.y };
    const p2 = end.handleIn ?? p3;
    const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const q0 = midpoint(p0, p1); const q1 = midpoint(p1, p2); const q2 = midpoint(p2, p3);
    const r0 = midpoint(q0, q1); const r1 = midpoint(q1, q2); const anchor = midpoint(r0, r1);
    const curved = Boolean(start.handleOut || end.handleIn);
    points[startIndex] = curved ? { ...start, handleOut: q0 } : start;
    points[endIndex] = curved ? { ...end, handleIn: q2 } : end;
    const inserted: CanvasAbsolutePoint = curved ? { ...anchor, handleIn: r0, handleOut: r1, nodeType: "smooth" } : { ...anchor, nodeType: "corner" };
    points.splice(startIndex + 1, 0, inserted);
    const geometry = normalizeCanvasPath(points);
    commitCanvas(nodes.map((candidate) => candidate.id === selectedNode.id ? { ...candidate, ...geometry, ...(curved ? { pathSmoothing: 0 } : {}) } as CanvasNode : candidate));
    setSelectedPathPointIndex(startIndex + 1);
  }

  function deleteSelectedPathPoint(): void {
    if (!selectedNode || selectedNode.type === "component" || selectedPathPointIndex === null || (selectedNode.type !== "path" && selectedNode.type !== "arrow") || (selectedNode.points?.length ?? 0) <= 2) return;
    const points = canvasPathAbsolutePoints(selectedNode).filter((_, index) => index !== selectedPathPointIndex);
    const geometry = normalizeCanvasPath(points);
    commitCanvas(nodes.map((candidate) => candidate.id === selectedNode.id ? { ...candidate, ...geometry } as CanvasNode : candidate));
    setSelectedPathPointIndex(Math.min(selectedPathPointIndex, points.length - 1));
  }

  function nudgePathPoint(event: React.KeyboardEvent<SVGCircleElement>, node: CanvasPrimitiveNode, pointIndex: number): void {
    if ((event.key === "Backspace" || event.key === "Delete") && (node.points?.length ?? 0) > 2) {
      event.preventDefault(); event.stopPropagation();
      const remaining = canvasPathAbsolutePoints(node).filter((_, index) => index !== pointIndex);
      const geometry = normalizeCanvasPath(remaining);
      commitCanvas(nodesRef.current.map((candidate) => candidate.id === node.id ? { ...candidate, ...geometry } as CanvasNode : candidate));
      setSelectedPathPointIndex(Math.min(pointIndex, remaining.length - 1));
      return;
    }
    const delta = event.shiftKey ? 10 : 1;
    const movement = event.key === "ArrowLeft" ? { x: -delta, y: 0 } : event.key === "ArrowRight" ? { x: delta, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -delta } : event.key === "ArrowDown" ? { x: 0, y: delta } : undefined;
    if (!movement) return;
    event.preventDefault();
    event.stopPropagation();
    const points = canvasPathAbsolutePoints(node);
    const current = points[pointIndex];
    if (!current) return;
    points[pointIndex] = { ...current, x: current.x + movement.x, y: current.y + movement.y, handleIn: current.handleIn ? { x: current.handleIn.x + movement.x, y: current.handleIn.y + movement.y } : undefined, handleOut: current.handleOut ? { x: current.handleOut.x + movement.x, y: current.handleOut.y + movement.y } : undefined };
    const geometry = normalizeCanvasPath(points);
    commitCanvas(nodesRef.current.map((candidate) => candidate.id === node.id ? { ...candidate, ...geometry } as CanvasNode : candidate));
  }

  function beginRotate(event: React.PointerEvent<SVGCircleElement>, node: CanvasNode): void {
    event.stopPropagation();
    if (node.locked) return;
    const point = stagePoint(event.clientX, event.clientY);
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    gestureRef.current = { kind: "rotate", centerX, centerY, initialAngle: Math.atan2(point.y - centerY, point.x - centerX) * 180 / Math.PI, initialRotation: node.rotation ?? 0, nodeId: node.id, before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function beginMultiResize(event: React.PointerEvent<SVGRectElement>, handle: ResizeHandle): void {
    event.stopPropagation();
    if (!selectedBounds || selectedNodes.some((node) => node.locked)) return;
    const point = stagePoint(event.clientX, event.clientY);
    gestureRef.current = { kind: "multi-resize", pointerX: point.x, pointerY: point.y, origin: selectedBounds, handle, selectedIds: selectedIds.slice(), before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function beginMultiRotate(event: React.PointerEvent<SVGCircleElement>): void {
    event.stopPropagation();
    if (!selectedBounds || selectedNodes.some((node) => node.locked)) return;
    const point = stagePoint(event.clientX, event.clientY);
    const centerX = selectedBounds.x + selectedBounds.width / 2;
    const centerY = selectedBounds.y + selectedBounds.height / 2;
    const rotatingIds = [...new Set([...selectedIds, ...descendantIds(nodes, selectedIds)])];
    gestureRef.current = { kind: "multi-rotate", centerX, centerY, initialAngle: Math.atan2(point.y - centerY, point.x - centerX) * 180 / Math.PI, selectedIds: rotatingIds, before: currentSnapshot() };
    stageRef.current?.setPointerCapture?.(event.pointerId);
  }

  function handleStagePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === "pan") {
      const next = { ...viewportRef.current, x: gesture.originX + event.clientX - gesture.pointerX, y: gesture.originY + event.clientY - gesture.pointerY };
      viewportRef.current = next;
      setViewport(next);
      return;
    }
    const point = stagePoint(event.clientX, event.clientY);
    if (gesture.kind === "marquee") {
      gesture.currentX = point.x;
      gesture.currentY = point.y;
      setMarquee({ x: Math.min(gesture.startX, point.x), y: Math.min(gesture.startY, point.y), width: Math.abs(point.x - gesture.startX), height: Math.abs(point.y - gesture.startY) });
      return;
    }
    if (gesture.kind === "freehand") {
      const previous = gesture.absolutePoints.at(-1)!;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2 / viewport.zoom) return;
      gesture.absolutePoints.push(point);
      const geometry = normalizeCanvasPath(gesture.absolutePoints);
      const next = nodesRef.current.map((node) => node.id === gesture.nodeId && node.type === "path" ? { ...node, ...geometry } : node) as CanvasNode[];
      nodesRef.current = next;
      setCanvasNodes(next);
      return;
    }
    if (gesture.kind === "path-point") {
      const node = nodesRef.current.find((candidate): candidate is CanvasPrimitiveNode => candidate.id === gesture.nodeId && (candidate.type === "path" || candidate.type === "arrow"));
      if (!node) return;
      const points = canvasPathAbsolutePoints(node);
      const current = points[gesture.pointIndex];
      const moved = rotatePoint(point, gesture.centerX, gesture.centerY, -gesture.rotation);
      const delta = { x: moved.x - current.x, y: moved.y - current.y };
      points[gesture.pointIndex] = { ...current, ...moved, handleIn: current.handleIn ? { x: current.handleIn.x + delta.x, y: current.handleIn.y + delta.y } : undefined, handleOut: current.handleOut ? { x: current.handleOut.x + delta.x, y: current.handleOut.y + delta.y } : undefined };
      const geometry = normalizeCanvasPath(points);
      const next = nodesRef.current.map((candidate) => candidate.id === node.id ? { ...candidate, ...geometry } as CanvasNode : candidate);
      nodesRef.current = next;
      setCanvasNodes(next);
      return;
    }
    if (gesture.kind === "path-handle") {
      const node = nodesRef.current.find((candidate): candidate is CanvasPrimitiveNode => candidate.id === gesture.nodeId && (candidate.type === "path" || candidate.type === "arrow"));
      if (!node) return;
      const points = canvasPathAbsolutePoints(node);
      const current = points[gesture.pointIndex];
      if (!current) return;
      const moved = rotatePoint(point, gesture.centerX, gesture.centerY, -gesture.rotation);
      const changed = gesture.handle === "in" ? { ...current, handleIn: moved } : { ...current, handleOut: moved };
      if (current.nodeType === "smooth" && !event.altKey) {
        const dx = moved.x - current.x; const dy = moved.y - current.y;
        if (gesture.handle === "in") changed.handleOut = { x: current.x - dx, y: current.y - dy };
        else changed.handleIn = { x: current.x - dx, y: current.y - dy };
      } else if (event.altKey) changed.nodeType = "corner";
      points[gesture.pointIndex] = changed;
      const geometry = normalizeCanvasPath(points);
      const next = nodesRef.current.map((candidate) => candidate.id === node.id ? { ...candidate, ...geometry, pathSmoothing: 0 } as CanvasNode : candidate);
      nodesRef.current = next; setCanvasNodes(next); return;
    }
    if (gesture.kind === "draw") {
      gesture.currentX = point.x;
      gesture.currentY = point.y;
      const angle = Math.atan2(point.y - gesture.startY, point.x - gesture.startX);
      const distance = Math.hypot(point.x - gesture.startX, point.y - gesture.startY);
      const snappedAngle = event.shiftKey && (gesture.tool === "line" || gesture.tool === "arrow") ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) : angle;
      const drawPoint = event.shiftKey && (gesture.tool === "line" || gesture.tool === "arrow") ? { x: gesture.startX + Math.cos(snappedAngle) * distance, y: gesture.startY + Math.sin(snappedAngle) * distance } : point;
      const geometry = normalizeCanvasPath([{ x: gesture.startX, y: gesture.startY }, drawPoint]);
      const x = Math.min(gesture.startX, drawPoint.x);
      const y = Math.min(gesture.startY, drawPoint.y);
      const width = Math.max(1, Math.abs(drawPoint.x - gesture.startX));
      const height = Math.max(1, Math.abs(drawPoint.y - gesture.startY));
      const next = nodesRef.current.map((node) => node.id !== gesture.nodeId || node.type === "component" ? node : gesture.tool === "arrow"
        ? { ...node, ...geometry }
        : { ...node, x, y, width, height, lineFlip: gesture.tool === "line" ? (drawPoint.x - gesture.startX) * (drawPoint.y - gesture.startY) < 0 : node.lineFlip } as CanvasNode);
      nodesRef.current = next;
      setCanvasNodes(next);
      return;
    }
    if (gesture.kind === "move") {
      const snapped = snapCanvasMove({
        bounds: gesture.bounds,
        deltaX: point.x - gesture.pointerX,
        deltaY: point.y - gesture.pointerY,
        ...gesture.snapContext,
        threshold: 6 / viewport.zoom,
        pageRect: { x: 0, y: 0, ...canvasFrame },
        snapToGrid,
        disabled: event.ctrlKey || event.metaKey,
      });
      const next = nodesRef.current.map((node) => {
        const origin = gesture.origins[node.id];
        return origin ? { ...node, x: origin.x + snapped.deltaX, y: origin.y + snapped.deltaY } as CanvasNode : node;
      });
      const resolved = resolveCanvasConnectors(resolveBooleanGroups(next)) as CanvasNode[];
      nodesRef.current = resolved;
      setCanvasNodes(resolved);
      setSnapFeedback({ lines: snapped.lines, measurements: snapped.measurements });
      return;
    }
    if (gesture.kind === "rotate" || gesture.kind === "multi-rotate") {
      const pointerAngle = Math.atan2(point.y - gesture.centerY, point.x - gesture.centerX) * 180 / Math.PI;
      const rawDelta = pointerAngle - gesture.initialAngle;
      const delta = event.shiftKey ? Math.round(rawDelta / 15) * 15 : rawDelta;
      if (gesture.kind === "multi-rotate") {
        const booleanRoots = gesture.selectedIds.filter((id) => gesture.before.nodes.some((node) => node.id === id && node.type === "boolean"));
        const selected = new Set([...gesture.selectedIds, ...descendantIds(gesture.before.nodes, booleanRoots)]);
        const next = gesture.before.nodes.map((node) => {
          if (!selected.has(node.id)) return node;
          if (node.type === "boolean") return { ...node, rotation: 0 };
          const center = rotatePoint({ x: node.x + node.width / 2, y: node.y + node.height / 2 }, gesture.centerX, gesture.centerY, delta);
          return { ...node, x: center.x - node.width / 2, y: center.y - node.height / 2, rotation: normalizedAngle((node.rotation ?? 0) + delta) } as CanvasNode;
        });
        const resolved = resolveBooleanGroups(next);
        nodesRef.current = resolved;
        setCanvasNodes(resolved);
        return;
      }
      const originNode = gesture.before.nodes.find((node) => node.id === gesture.nodeId);
      const rotation = originNode?.type === "boolean" ? 0 : normalizedAngle(gesture.initialRotation + delta);
      const descendants = new Set(descendantIds(gesture.before.nodes, [gesture.nodeId]));
      const next = gesture.before.nodes.map((node) => {
        if (node.id === gesture.nodeId) return { ...node, rotation } as CanvasNode;
        if (!descendants.has(node.id)) return node;
        const center = rotatePoint({ x: node.x + node.width / 2, y: node.y + node.height / 2 }, gesture.centerX, gesture.centerY, delta);
        return { ...node, x: center.x - node.width / 2, y: center.y - node.height / 2, rotation: normalizedAngle((node.rotation ?? 0) + delta) } as CanvasNode;
      });
      const resolved = resolveBooleanGroups(next);
      nodesRef.current = resolved;
      setCanvasNodes(resolved);
      return;
    }
    if (gesture.kind === "multi-resize") {
      const horizontal = gesture.handle.includes("e") ? point.x - gesture.pointerX : gesture.pointerX - point.x;
      const vertical = gesture.handle.includes("s") ? point.y - gesture.pointerY : gesture.pointerY - point.y;
      let width = Math.max(1, gesture.origin.width + horizontal * (event.altKey ? 2 : 1));
      let height = Math.max(1, gesture.origin.height + vertical * (event.altKey ? 2 : 1));
      if (event.shiftKey) {
        const ratio = gesture.origin.width / Math.max(1, gesture.origin.height);
        if (Math.abs(horizontal) >= Math.abs(vertical)) height = width / ratio;
        else width = height * ratio;
      }
      let x = gesture.handle.includes("w") ? gesture.origin.x + gesture.origin.width - width : gesture.origin.x;
      let y = gesture.handle.includes("n") ? gesture.origin.y + gesture.origin.height - height : gesture.origin.y;
      if (event.altKey) {
        x = gesture.origin.x - (width - gesture.origin.width) / 2;
        y = gesture.origin.y - (height - gesture.origin.height) / 2;
      }
      const scaleX = width / Math.max(1, gesture.origin.width);
      const scaleY = height / Math.max(1, gesture.origin.height);
      const booleanRoots = gesture.selectedIds.filter((id) => gesture.before.nodes.some((node) => node.id === id && node.type === "boolean"));
      const selected = new Set([...gesture.selectedIds, ...descendantIds(gesture.before.nodes, booleanRoots)]);
      const next = gesture.before.nodes.map((node) => !selected.has(node.id) ? node : {
        ...node,
        x: x + (node.x - gesture.origin.x) * scaleX,
        y: y + (node.y - gesture.origin.y) * scaleY,
        width: Math.max(1, node.width * scaleX),
        height: Math.max(1, node.height * scaleY),
        ...(node.type !== "component" && node.type === "text" ? { fontSize: Math.max(6, (node.fontSize ?? 26) * Math.min(scaleX, scaleY)) } : {}),
      } as CanvasNode);
      const resolved = resolveBooleanGroups(next);
      nodesRef.current = resolved;
      setCanvasNodes(resolved);
      return;
    }
    const localPoint = rotatePoint(point, gesture.centerX, gesture.centerY, -gesture.rotation);
    const horizontal = gesture.handle.includes("e") ? localPoint.x - gesture.pointerX : gesture.pointerX - localPoint.x;
    const vertical = gesture.handle.includes("s") ? localPoint.y - gesture.pointerY : gesture.pointerY - localPoint.y;
    let width = Math.max(1, gesture.origin.width + horizontal * (event.altKey ? 2 : 1));
    let height = Math.max(1, gesture.origin.height + vertical * (event.altKey ? 2 : 1));
    if (event.shiftKey) {
      const ratio = gesture.origin.width / Math.max(1, gesture.origin.height);
      if (Math.abs(horizontal) >= Math.abs(vertical)) height = width / ratio;
      else width = height * ratio;
    }
    if (snapToGrid && !event.ctrlKey && !event.metaKey) {
      width = Math.max(1, Math.round(width / snapGridSize) * snapGridSize);
      height = Math.max(1, Math.round(height / snapGridSize) * snapGridSize);
    }
    let x = gesture.origin.x;
    let y = gesture.origin.y;
    if (gesture.handle.includes("w")) x = gesture.origin.x + gesture.origin.width - width;
    if (gesture.handle.includes("n")) y = gesture.origin.y + gesture.origin.height - height;
    if (event.altKey) {
      x = gesture.origin.x - (width - gesture.origin.width) / 2;
      y = gesture.origin.y - (height - gesture.origin.height) / 2;
    }
    const originNode = gesture.before.nodes.find((node) => node.id === gesture.nodeId);
    let next = originNode?.type === "boolean" ? (() => {
      const scaleX = width / Math.max(1, gesture.origin.width);
      const scaleY = height / Math.max(1, gesture.origin.height);
      const descendants = new Set(descendantIds(gesture.before.nodes, [gesture.nodeId]));
      return gesture.before.nodes.map((node) => {
        if (node.id === gesture.nodeId) return { ...node, x, y, width, height, rotation: 0 } as CanvasNode;
        if (!descendants.has(node.id)) return node;
        return { ...node, x: x + (node.x - gesture.origin.x) * scaleX, y: y + (node.y - gesture.origin.y) * scaleY, width: Math.max(1, node.width * scaleX), height: Math.max(1, node.height * scaleY) } as CanvasNode;
      });
    })() : nodesRef.current.map((node) => node.id !== gesture.nodeId ? node : { ...node, x, y, width, height } as CanvasNode);
    const resized = next.find((node) => node.id === gesture.nodeId);
    if (resized?.type === "frame" && resized.layout) next = applyFrameLayout(next, resized.id, componentsRef.current);
    else if (resized?.type === "frame") next = applyFrameResizeConstraints(gesture.before.nodes, next, resized.id);
    const resolved = resolveCanvasConnectors(resolveBooleanGroups(next)) as CanvasNode[];
    nodesRef.current = resolved;
    setCanvasNodes(resolved);
  }

  function endGesture(event?: React.PointerEvent<SVGSVGElement>): void {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setSnapFeedback({ lines: [], measurements: [] });
    setSnapTargetRevision((revision) => revision + 1);
    if (!gesture) return;
    if (gesture.kind === "pan") {
      persistViewport(viewportRef.current);
      return;
    }
    if (gesture.kind === "draw") {
      let created = nodesRef.current.find((node) => node.id === gesture.nodeId);
      if (created?.type === "arrow" && event) {
        const binding = nodeAtPoint(stagePoint(event.clientX, event.clientY), created.id);
        const next = nodesRef.current.map((node) => node.id === created!.id ? { ...node, endBindingId: binding?.id } as CanvasNode : node);
        nodesRef.current = resolveCanvasConnectors(next) as CanvasNode[];
        setCanvasNodes(nodesRef.current);
        created = nodesRef.current.find((node) => node.id === gesture.nodeId);
      }
      if (created && created.width < 4 && created.height < 4 && created.type !== "component") {
        const defaults = drawingDefaults[gesture.tool];
        const next = nodesRef.current.map((node) => node.id === gesture.nodeId ? { ...node, width: defaults.width, height: defaults.height } : node) as CanvasNode[];
        nodesRef.current = next;
        setCanvasNodes(next);
      }
      pastRef.current = [...pastRef.current.slice(-49), gesture.before];
      futureRef.current = [];
      commitCanvas(nodesRef.current, componentsRef.current, false);
      setTool("select");
      if (created?.type === "text") setEditingText({ id: created.id, value: created.text ?? "" });
      return;
    }
    if (gesture.kind === "freehand" || gesture.kind === "path-point" || gesture.kind === "path-handle") {
      if (gesture.kind === "freehand" && gesture.absolutePoints.length < 2) {
        nodesRef.current = cloneSnapshot(gesture.before.nodes);
        setCanvasNodes(nodesRef.current);
        setSelectedIds([]);
        setTool("select");
        return;
      }
      const node = nodesRef.current.find((candidate) => candidate.id === gesture.nodeId);
      if (node?.type === "path" && (node.points?.length ?? 0) < 2) {
        nodesRef.current = cloneSnapshot(gesture.before.nodes);
        setCanvasNodes(nodesRef.current);
        setSelectedIds([]);
        return;
      }
      pastRef.current = [...pastRef.current.slice(-49), gesture.before];
      futureRef.current = [];
      commitCanvas(nodesRef.current, componentsRef.current, false);
      if (gesture.kind === "freehand") setTool("select");
      return;
    }
    if (gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "multi-resize" || gesture.kind === "rotate" || gesture.kind === "multi-rotate") {
      pastRef.current = [...pastRef.current.slice(-49), gesture.before];
      futureRef.current = [];
      if (gesture.kind === "move") {
        const laidOut = applyAffectedLayouts(nodesRef.current, gesture.selectedIds);
        nodesRef.current = laidOut;
        setCanvasNodes(laidOut);
      }
      commitCanvas(nodesRef.current, componentsRef.current, false);
      return;
    }
    if (gesture.kind === "marquee") {
      const rect = { x: Math.min(gesture.startX, gesture.currentX), y: Math.min(gesture.startY, gesture.currentY), width: Math.abs(gesture.currentX - gesture.startX), height: Math.abs(gesture.currentY - gesture.startY) };
      if (rect.width > 2 || rect.height > 2) setSelectedIds(geometryIndex.filter((entry) => !entry.hidden && !entry.locked && intersects(rect, entry.rect)).map((entry) => entry.node.id));
      setMarquee(null);
    }
  }

  function zoomAt(nextZoom: number, anchorX?: number, anchorY?: number): void {
    const current = viewportRef.current;
    const zoom = clampCanvasZoom(nextZoom);
    const bounds = stageRef.current?.getBoundingClientRect();
    const anchor = { x: anchorX ?? (bounds?.width ?? 0) / 2, y: anchorY ?? (bounds?.height ?? 0) / 2 };
    const canvasX = (anchor.x - current.x) / current.zoom;
    const canvasY = (anchor.y - current.y) / current.zoom;
    persistViewport({ zoom, x: anchor.x - canvasX * zoom, y: anchor.y - canvasY * zoom });
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = event.currentTarget.getBoundingClientRect();
      zoomAt(viewport.zoom * Math.exp(-event.deltaY * .002), event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }
    const current = viewportRef.current;
    persistViewport({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY });
  }

  function copySelection(): void {
    const sourceIds = new Set([...selectedIds, ...descendantIds(nodes, selectedIds)]);
    clipboardRef.current = cloneSnapshot(nodes.filter((node) => sourceIds.has(node.id)));
    clipboardRootIdsRef.current = selectedIds.slice();
  }

  function pasteSelection(): void {
    if (!clipboardRef.current.length) return;
    const idMap = new Map(clipboardRef.current.map((node) => [node.id, crypto.randomUUID()]));
    const groupMap = new Map(clipboardRef.current.map((node) => node.groupId).filter((id): id is string => Boolean(id)).map((id) => [id, crypto.randomUUID()]));
    const pasted = clipboardRef.current.map((node) => ({
      ...cloneSnapshot(node),
      id: idMap.get(node.id)!,
      x: node.x + 24,
      y: node.y + 24,
      parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined,
      groupId: node.groupId ? groupMap.get(node.groupId) : undefined,
      ...(node.type !== "component" ? {
        startBindingId: node.startBindingId && idMap.has(node.startBindingId) ? idMap.get(node.startBindingId) : undefined,
        endBindingId: node.endBindingId && idMap.has(node.endBindingId) ? idMap.get(node.endBindingId) : undefined,
        maskId: node.maskId && idMap.has(node.maskId) ? idMap.get(node.maskId) : undefined,
      } : {}),
      ...(node.type === "component" && node.componentRole === "main" ? { componentRole: "instance" as const } : {}),
    })) as CanvasNode[];
    const nextRootIds = clipboardRootIdsRef.current.flatMap((id) => idMap.get(id) ? [idMap.get(id)!] : []);
    clipboardRef.current = cloneSnapshot(pasted);
    clipboardRootIdsRef.current = nextRootIds;
    commitCanvas([...nodes, ...pasted]);
    setSelectedIds(nextRootIds.length ? nextRootIds : pasted.map((node) => node.id));
  }

  function handleKeyDown(event: KeyboardEvent | React.KeyboardEvent<SVGSVGElement>): void {
    if (prototypeOpen) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (penDraftRef.current && event.key === "Enter") { event.preventDefault(); finishPenDraft(false); return; }
    if (penDraftRef.current && event.key === "Escape") { event.preventDefault(); cancelPenDraft(); return; }
    if (!command && event.key === "Enter" && tool !== "select" && tool !== "hand") {
      event.preventDefault();
      if (tool === "pen" || tool === "pencil") addKeyboardVector(tool);
      else add(tool);
      return;
    }
    if (command && key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (command && key === "y") { event.preventDefault(); redo(); return; }
    if (command && key === "a") { event.preventDefault(); setSelectedIds(nodes.filter((node) => !node.hidden).map((node) => node.id)); return; }
    if (command && key === "c") { event.preventDefault(); copySelection(); return; }
    if (command && key === "v") { event.preventDefault(); pasteSelection(); return; }
    if (command && key === "d") { event.preventDefault(); duplicateSelected(); return; }
    if (command && event.shiftKey && key === "g") { event.preventDefault(); ungroupSelected(); return; }
    if (command && key === "g") { event.preventDefault(); groupSelected(); return; }
    if (command && event.shiftKey && key === "k") { event.preventDefault(); detachSelectedInstance(); return; }
    if (command && key === "k") { event.preventDefault(); createComponentFromSelection(); return; }
    if (command && event.shiftKey && key === "l") { event.preventDefault(); toggleSelectedLock(); return; }
    if (command && event.shiftKey && key === "h") { event.preventDefault(); toggleSelectedVisibility(); return; }
    if (command && event.shiftKey && key === "]") { event.preventDefault(); reorderSelected("front"); return; }
    if (command && event.shiftKey && key === "[") { event.preventDefault(); reorderSelected("back"); return; }
    if (command && key === "]") { event.preventDefault(); reorderSelected("forward"); return; }
    if (command && key === "[") { event.preventDefault(); reorderSelected("backward"); return; }
    if (!command && key === "v") { chooseTool("select"); return; }
    if (!command && key === "h") { chooseTool("hand"); return; }
    if (!command && key === "r") { chooseTool("rectangle"); return; }
    if (!command && key === "o") { chooseTool("ellipse"); return; }
    if (!command && event.shiftKey && key === "l") { chooseTool("arrow"); return; }
    if (!command && key === "l") { chooseTool("line"); return; }
    if (!command && event.shiftKey && key === "p") { chooseTool("pencil"); return; }
    if (!command && key === "p") { chooseTool("pen"); return; }
    if (!command && key === "t") { chooseTool("text"); return; }
    if (!command && key === "f") { chooseTool("frame"); return; }
    if (!command && event.shiftKey && key === "a") { event.preventDefault(); toggleAutoLayout(); return; }
    if ((event.key === "Backspace" || event.key === "Delete") && selectedIds.length) { event.preventDefault(); removeSelected(); return; }
    if (event.key === "Escape") {
      setEditingText(null);
      if (editingBooleanId) { setSelectedIds([editingBooleanId]); setEditingBooleanId(null); }
      else setSelectedIds([]);
      chooseTool("select"); return;
    }
    const delta = event.shiftKey ? 10 : 1;
    const movement = event.key === "ArrowLeft" ? { x: -delta } : event.key === "ArrowRight" ? { x: delta } : event.key === "ArrowUp" ? { y: -delta } : event.key === "ArrowDown" ? { y: delta } : null;
    if (!movement || !selectedIds.length) return;
    event.preventDefault();
    const moved = applyPositionDeltas(new Map(selectedIds.map((id) => [id, { x: movement.x ?? 0, y: movement.y ?? 0 }])));
    commitCanvas(applyAffectedLayouts(moved, selectedIds));
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => handleKeyDown(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function commitInlineText(): void {
    if (!editingText) return;
    const node = nodes.find((item) => item.id === editingText.id);
    if (node?.type === "text" && node.text !== editingText.value) commitCanvas(nodes.map((item) => item.id === node.id ? { ...item, text: editingText.value } : item));
    setEditingText(null);
  }

  function renderPrimitive(node: CanvasPrimitiveNode, key: string, parent?: CanvasComponentNode, scaleX = 1, scaleY = 1): React.ReactNode {
    const effective = parent ? effectivePrimitive(node, parent) : node;
    if (effective.hidden) return null;
    const x = effective.x * scaleX;
    const y = effective.y * scaleY;
    const width = effective.width * scaleX;
    const height = effective.height * scaleY;
    const stroke = effective.strokeWidth ? effective.strokeColor ?? "#17181c" : "none";
    const strokeWidth = (effective.strokeWidth ?? 0) * Math.min(scaleX, scaleY);
    const shadow = effective.shadow;
    const gradientId = `canvas-editor-gradient-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const gradientVector = effective.fillGradient ? canvasGradientVector(effective.fillGradient.angle) : undefined;
    const fill = effective.fillGradient ? `url(#${gradientId})` : effective.color;
    const style = shadow ? { filter: `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px color-mix(in srgb, ${shadow.color} ${Math.round(shadow.opacity * 100)}%, transparent))` } : undefined;
    let primitive: React.ReactNode;
    if (effective.type === "text") {
      const fontSize = (effective.fontSize ?? 26) * Math.min(scaleX, scaleY);
      const lineHeight = fontSize * (effective.lineHeight ?? 1.2);
      const lines = wrapTextLines(effective.text ?? "", width, fontSize);
      const textX = effective.textAlign === "center" ? x + width / 2 : effective.textAlign === "right" ? x + width : x;
      const anchor = effective.textAlign === "center" ? "middle" : effective.textAlign === "right" ? "end" : "start";
      primitive = <text className="canvas-node" x={textX} y={y + fontSize} fill={fill} fontFamily={effective.fontFamily ?? "Atkinson Hyperlegible Next"} fontSize={fontSize} fontWeight={effective.fontWeight ?? 620} fontStyle={effective.fontStyle ?? "normal"} letterSpacing={effective.letterSpacing ?? 0} textAnchor={anchor} opacity={effective.opacity ?? 1} style={style}>{lines.map((line, index) => <tspan key={`${key}:${index}`} x={textX} dy={index ? lineHeight : 0}>{line || "\u00a0"}</tspan>)}</text>;
    } else if (effective.type === "ellipse") primitive = <ellipse className="canvas-node" cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={effective.strokeDash || undefined} opacity={effective.opacity ?? 1} style={style} />;
    else if (effective.type === "line") primitive = <line className="canvas-node" x1={effective.lineFlip ? x + width : x} y1={y} x2={effective.lineFlip ? x : x + width} y2={y + height} stroke={effective.strokeColor ?? effective.color} strokeWidth={Math.max(1, strokeWidth || 2)} strokeDasharray={effective.strokeDash || undefined} strokeLinecap="round" opacity={effective.opacity ?? 1} style={style} />;
    else if (effective.type === "path" || effective.type === "arrow") {
      const pathNode = { ...effective, x, y, width, height };
      const importedTransform = effective.type === "path" && effective.svgPathData ? canvasImportedPathTransform(pathNode) : undefined;
      primitive = <path className="canvas-node canvas-vector-node" d={effective.type === "path" && effective.svgPathData ? effective.svgPathData : canvasPathData(canvasPathAbsolutePoints(pathNode), effective.pathSmoothing ?? 0, effective.pathClosed)} transform={importedTransform} fill={effective.pathClosed ? fill : "none"} fillRule={effective.fillRule ?? "nonzero"} stroke={effective.strokeWidth ? effective.strokeColor ?? effective.color : "none"} strokeWidth={strokeWidth} strokeDasharray={effective.strokeDash || undefined} strokeLinecap={effective.startCap === "round" || effective.endCap === "round" ? "round" : "butt"} strokeLinejoin="round" markerStart={effective.startCap === "arrow" ? "url(#canvas-arrowhead)" : undefined} markerEnd={effective.type === "arrow" || effective.endCap === "arrow" ? "url(#canvas-arrowhead)" : undefined} opacity={effective.opacity ?? 1} style={style} />;
    }
    else if (effective.type === "image") primitive = <image className="canvas-node" href={effective.src} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid slice" opacity={effective.opacity ?? 1} style={style} />;
    else primitive = <rect className={`canvas-node ${effective.type === "frame" ? "canvas-frame-node" : ""}`} x={x} y={y} width={width} height={height} rx={(effective.radius ?? 8) * Math.min(scaleX, scaleY)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={effective.strokeDash || undefined} opacity={effective.opacity ?? 1} style={style} />;
    const rotation = parent ? effective.rotation ?? 0 : 0;
    return <g key={key} transform={rotation ? `rotate(${rotation} ${x + width / 2} ${y + height / 2})` : undefined}>{effective.fillGradient && gradientVector && <defs><linearGradient id={gradientId} x1={gradientVector.x1} y1={gradientVector.y1} x2={gradientVector.x2} y2={gradientVector.y2}>{effective.fillGradient.stops.map((stop, index) => <stop key={`${gradientId}:${index}`} offset={`${Math.min(1, Math.max(0, stop.offset)) * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1} />)}</linearGradient></defs>}{primitive}</g>;
  }

  function renderCanvasNode(node: CanvasNode): React.ReactNode {
    const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
    const booleanParent = parent?.type === "boolean" ? parent : undefined;
    if (booleanParent && editingBooleanId !== booleanParent.id) return null;
    if (hasNodeOrAncestorFlag(node, "hidden") || maskSourceIds.has(node.id)) return null;
    const clipFrames: CanvasPrimitiveNode[] = [];
    let ancestorId = node.parentId;
    const visitedAncestors = new Set<string>();
    while (ancestorId && !visitedAncestors.has(ancestorId)) {
      visitedAncestors.add(ancestorId);
      const ancestor = nodeById.get(ancestorId);
      if (!ancestor) break;
      if (ancestor.type === "frame" && ancestor.clipContent) clipFrames.push(ancestor);
      ancestorId = ancestor.parentId;
    }
    const wrapExternalClips = (rendered: React.ReactNode): React.ReactNode => {
      const masked = node.type !== "component" && node.maskId ? <g key={`${node.id}:mask`} clipPath={`url(#canvas-mask-${node.maskId})`}>{rendered}</g> : rendered;
      return clipFrames.reduce((child, frame) => <g key={`${node.id}:external-clip:${frame.id}`} clipPath={`url(#canvas-clip-${frame.id})`}>{child}</g>, masked);
    };
    const rotation = node.rotation ?? 0;
    const transform = rotation ? `rotate(${rotation} ${node.x + node.width / 2} ${node.y + node.height / 2})` : undefined;
    if (node.type !== "component") {
      if (node.type === "boolean" && editingBooleanId === node.id) return null;
      const renderedNode = node.type === "boolean" ? booleanResultForNode(node, nodes) : node;
      if (!renderedNode) return null;
      return wrapExternalClips(
      <g key={node.id} transform={node.type === "boolean" ? undefined : transform} onPointerDown={(event) => beginNodeMove(event, node)} onDoubleClick={() => { if (node.type === "text") setEditingText({ id: node.id, value: node.text ?? "" }); if (node.type === "boolean") { setEditingBooleanId(node.id); setSelectedIds(nodes.filter((candidate) => candidate.parentId === node.id).slice(0, 1).map((candidate) => candidate.id)); } }}>
        {renderPrimitive(renderedNode, node.id)}
      </g>
      );
    }
    const definition = components.find((component) => component.id === node.componentId);
    if (!definition) return null;
    const scaleX = node.width / Math.max(1, definition.width);
    const scaleY = node.height / Math.max(1, definition.height);
    const internalClipId = (frameId: string): string => `canvas-component-clip-${node.id}-${frameId}`;
    const internalMaskId = (maskId: string): string => `canvas-component-mask-${node.id}-${maskId}`;
    const internalMaskSourceIds = new Set(definition.nodes.flatMap((child) => {
      const maskId = effectivePrimitive(child, node).maskId;
      return maskId ? [maskId] : [];
    }));
    const internalAncestorHidden = (child: CanvasPrimitiveNode): boolean => {
      let parentId = child.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parentNode = definition.nodes.find((candidate) => candidate.id === parentId);
        if (!parentNode) break;
        if (effectivePrimitive(parentNode, node).hidden) return true;
        parentId = parentNode.parentId;
      }
      return false;
    };
    return wrapExternalClips(
      <g className="canvas-component-node" key={node.id} transform={transform} opacity={node.opacity ?? 1} onPointerDown={(event) => beginNodeMove(event, node)}>
        <g transform={`translate(${node.x} ${node.y})`}>
          <defs>
            {definition.nodes.filter((child) => child.type === "frame" && child.clipContent).map((frame) => {
              const effective = effectivePrimitive(frame, node);
              const x = effective.x * scaleX;
              const y = effective.y * scaleY;
              const width = effective.width * scaleX;
              const height = effective.height * scaleY;
              return <clipPath id={internalClipId(frame.id)} key={frame.id} clipPathUnits="userSpaceOnUse"><rect x={x} y={y} width={width} height={height} rx={(effective.radius ?? 0) * Math.min(scaleX, scaleY)} transform={effective.rotation ? `rotate(${effective.rotation} ${x + width / 2} ${y + height / 2})` : undefined} /></clipPath>;
            })}
            {definition.nodes.filter((child) => internalMaskSourceIds.has(child.id)).map((mask) => {
              const effective = effectivePrimitive(mask, node);
              return <clipPath id={internalMaskId(mask.id)} key={`mask:${mask.id}`} clipPathUnits="userSpaceOnUse">{renderPrimitive({ ...effective, opacity: 1, shadow: undefined, strokeWidth: 0 }, `${node.id}:mask:${mask.id}`, undefined, scaleX, scaleY)}</clipPath>;
            })}
          </defs>
          {definition.nodes.map((child) => {
            if (internalAncestorHidden(child)) return null;
            if (internalMaskSourceIds.has(child.id)) return null;
            const effective = effectivePrimitive(child, node);
            const rendered = renderPrimitive(child, `${node.id}:${child.id}`, node, scaleX, scaleY);
            const clipAncestors: CanvasPrimitiveNode[] = [];
            let parentId = child.parentId;
            const visited = new Set<string>();
            while (parentId && !visited.has(parentId)) {
              visited.add(parentId);
              const parentFrame = definition.nodes.find((candidate) => candidate.id === parentId);
              if (!parentFrame) break;
              if (parentFrame.type === "frame" && parentFrame.clipContent) clipAncestors.push(parentFrame);
              parentId = parentFrame.parentId;
            }
            const masked = effective.maskId ? <g key={`${node.id}:mask-target:${child.id}`} clipPath={`url(#${internalMaskId(effective.maskId)})`}>{rendered}</g> : rendered;
            return clipAncestors.reduce((nested, frame) => <g key={`${node.id}:clip:${child.id}:${frame.id}`} clipPath={`url(#${internalClipId(frame.id)})`}>{nested}</g>, masked);
          })}
          {node.componentRole === "main" && <><rect className="canvas-component-main-outline" width={node.width} height={node.height} /><text className="canvas-component-label" x="0" y="-9">◆ {definition.name}</text></>}
        </g>
      </g>
    );
  }

  function renderFrameLayoutGrids(frame: CanvasPrimitiveNode): React.ReactNode {
    if (frame.type !== "frame" || !frame.layoutGrids?.some((grid) => grid.visible)) return null;
    const transform = frame.rotation ? `rotate(${frame.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})` : undefined;
    return <g className="canvas-layout-grids" key={`layout-grids:${frame.id}`} transform={transform} pointerEvents="none">{frame.layoutGrids.filter((grid) => grid.visible).map((grid) => {
      const color = grid.color;
      const opacity = grid.opacity;
      if (grid.type === "square") {
        const size = Math.max(2, grid.size ?? snapGridSize);
        const vertical = Array.from({ length: Math.min(400, Math.ceil(frame.width / size) + 1) }, (_, index) => frame.x + index * size);
        const horizontal = Array.from({ length: Math.min(400, Math.ceil(frame.height / size) + 1) }, (_, index) => frame.y + index * size);
        return <g key={grid.id} stroke={color} opacity={opacity} vectorEffect="non-scaling-stroke">{vertical.map((x) => <line key={`x:${x}`} x1={x} x2={x} y1={frame.y} y2={frame.y + frame.height} />)}{horizontal.map((y) => <line key={`y:${y}`} x1={frame.x} x2={frame.x + frame.width} y1={y} y2={y} />)}</g>;
      }
      const count = Math.min(100, Math.max(1, Math.round(grid.count ?? 12)));
      const gutter = grid.gutter ?? 16;
      const margin = grid.margin ?? 24;
      const available = (grid.type === "columns" ? frame.width : frame.height) - margin * 2 - gutter * (count - 1);
      const size = Math.max(0, available / count);
      return <g key={grid.id} fill={color} opacity={opacity}>{Array.from({ length: count }, (_, index) => grid.type === "columns"
        ? <rect key={index} x={frame.x + margin + index * (size + gutter)} y={frame.y} width={size} height={frame.height} />
        : <rect key={index} x={frame.x} y={frame.y + margin + index * (size + gutter)} width={frame.width} height={size} />)}</g>;
    })}</g>;
  }

  const historyCanUndo = pastRef.current.length > 0 && historyRevision >= 0;
  const historyCanRedo = futureRef.current.length > 0 && historyRevision >= 0;
  const rulerStep = viewport.zoom >= 1.5 ? 50 : viewport.zoom < .5 ? 200 : 100;
  const snapAnnouncement = snapFeedback.measurements.length
    ? [...new Map(snapFeedback.measurements.map((measurement) => [measurement.axis, measurement])).values()]
      .map((measurement) => `Equal ${measurement.axis === "x" ? "horizontal" : "vertical"} spacing ${Math.round(measurement.value * 100) / 100} pixels.`).join(" ")
    : snapFeedback.lines.map((line) => `${line.axis === "x" ? "Vertical" : "Horizontal"} alignment at ${Math.round(line.position * 100) / 100} pixels.`).join(" ");

  return (
    <div className="studio-editor-layout canvas-layout">
      <aside className="canvas-layers" aria-label="Canvas layers and assets">
        <section className="canvas-pages-panel" aria-label="Canvas pages">
          <header><strong>Pages</strong><span><button type="button" aria-label="Duplicate current page" title="Duplicate page" onClick={() => createPage(true)}><Copy size={12} /></button><button type="button" aria-label="Add page" title="Add page" onClick={() => createPage(false)}><Plus size={13} /></button></span></header>
          <div>{pages.map((page, index) => <div ref={(row) => { if (row) pageRowRefs.current.set(page.id, row); else pageRowRefs.current.delete(page.id); }} className={page.id === activePageId ? "active" : ""} key={page.id}>
            <CanvasPageThumbnail page={page} components={components} files={content.files} title={artifact.title} eager={page.id === activePageId} />
            {page.id === activePageId
              ? <input key={`${page.id}:${page.name}`} aria-label="Current page name" defaultValue={page.name} onBlur={(event) => { if (!event.currentTarget.value.trim()) event.currentTarget.value = page.name; else renamePage(page.id, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              : <button className="canvas-page-open" type="button" onClick={() => openPage(page.id)}><span>{page.name}</span><small>{page.elements.length}</small></button>}
            <button className="canvas-page-start" type="button" aria-label={page.id === activePrototypeFlow?.startPageId ? `${page.name} is prototype start` : `Set ${page.name} as prototype start`} aria-pressed={page.id === activePrototypeFlow?.startPageId} title={page.id === activePrototypeFlow?.startPageId ? `Starts ${activePrototypeFlow?.name ?? "prototype flow"}` : `Set as ${activePrototypeFlow?.name ?? "flow"} start`} onClick={() => markPrototypeStart(page.id)}><Flag size={11} weight={page.id === activePrototypeFlow?.startPageId ? "fill" : "regular"} /></button>
            <span className="canvas-page-move">
              <button type="button" aria-label={`Move ${page.name} up`} disabled={index === 0} onClick={() => movePage(page.id, -1)}><CaretUp size={10} /></button>
              <button type="button" aria-label={`Move ${page.name} down`} disabled={index === pages.length - 1} onClick={() => movePage(page.id, 1)}><CaretDown size={10} /></button>
            </span>
            <button type="button" aria-label={`Delete ${page.name}`} disabled={pages.length <= 1} onClick={() => deletePage(page.id)}><Trash size={11} /></button>
          </div>)}</div>
        </section>
        <section className="canvas-flows-panel" aria-label="Prototype flows">
          <header><strong>Flows</strong><button type="button" aria-label="Add prototype flow" title="Add flow" disabled={prototypeFlows.length >= 64} onClick={addPrototypeFlow}><Plus size={12} /></button></header>
          <div>
            <select aria-label="Active prototype flow" value={activePrototypeFlow?.id ?? ""} onChange={(event) => setActivePrototypeFlowId(event.target.value)}>{prototypeFlows.map((flow) => <option value={flow.id} key={flow.id}>{flow.name}</option>)}</select>
            {activePrototypeFlow && <>
              <input key={`${activePrototypeFlow.id}:${activePrototypeFlow.name}`} aria-label="Prototype flow name" defaultValue={activePrototypeFlow.name} maxLength={160} onBlur={(event) => { if (!event.currentTarget.value.trim()) event.currentTarget.value = activePrototypeFlow.name; else renamePrototypeFlow(activePrototypeFlow.id, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              <select aria-label="Prototype flow start page" value={activePrototypeFlow.startPageId} onChange={(event) => markPrototypeStart(event.target.value)}>{pages.map((page) => <option value={page.id} key={page.id}>{page.name}</option>)}</select>
              <button type="button" aria-label={`Delete ${activePrototypeFlow.name}`} title="Delete flow" disabled={prototypeFlows.length <= 1} onClick={() => deletePrototypeFlow(activePrototypeFlow.id)}><Trash size={11} /></button>
            </>}
          </div>
        </section>
        <div className="canvas-panel-tabs" role="tablist" aria-label="Canvas sidebar">
          <button role="tab" aria-selected={sidePanel === "layers"} onClick={() => setSidePanel("layers")}><Stack size={13} /> Layers</button>
          <button role="tab" aria-selected={sidePanel === "assets"} onClick={() => setSidePanel("assets")}><DiamondsFour size={13} /> Assets</button>
        </div>
        {sidePanel === "layers" ? <div ref={layerListRef} className="canvas-layer-list" role="list" aria-label="Canvas layer list" onScroll={(event) => setLayerViewport((current) => ({ ...current, scrollTop: event.currentTarget.scrollTop }))}>
          <header role="presentation"><span>Frame 1</span><small>{nodes.length}</small></header>
          {layerWindow.before > 0 && <div className="canvas-layer-spacer" style={{ height: layerWindow.before }} aria-hidden="true" />}
          {visibleLayerRows.map((node, windowIndex) => {
            const selected = selectedIds.includes(node.id);
            const position = layerWindow.start + windowIndex;
            return <div role="listitem" aria-posinset={position + 1} aria-setsize={layerRows.length} className={`canvas-layer-row ${selected ? "selected" : ""} ${node.parentId ? "nested" : ""} ${dragLayerId === node.id ? "dragging" : ""}`} style={{ "--layer-depth": layerTree.depthById.get(node.id) ?? 0 } as React.CSSProperties} key={node.id} draggable onDragStart={(event) => { setDragLayerId(node.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); }} onDragEnd={() => setDragLayerId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const sourceId = dragLayerId ?? event.dataTransfer.getData("text/plain"); moveLayerInTree(sourceId, node.id, event.shiftKey); setDragLayerId(null); }} title={node.type === "frame" ? "Drop to reorder. Hold Shift while dropping to nest inside this frame." : "Drag to reorder layers"}>
              <DotsSixVertical size={13} aria-hidden="true" />
              <button className="canvas-layer-name" type="button" aria-pressed={selected} onClick={(event) => selectLayerNode(event, node)}>
                {node.type === "component" ? <DiamondsFour size={14} /> : node.type === "text" ? <TextT size={14} /> : node.type === "ellipse" ? <Circle size={14} /> : node.type === "line" ? <LineSegment size={14} /> : node.type === "arrow" ? <ArrowRight size={14} /> : node.type === "path" || node.type === "boolean" ? <Path size={14} /> : node.type === "image" ? <ImageSquare size={14} /> : node.type === "frame" ? <BoundingBox size={14} /> : <Square size={14} />}
                <span>{nodeLabel(node)}</span>
              </button>
              <button className="canvas-layer-lock" type="button" aria-label={`${node.locked ? "Unlock" : "Lock"} ${nodeLabel(node)}`} onClick={() => commitCanvas(nodes.map((item) => item.id === node.id ? { ...item, locked: !item.locked } as CanvasNode : item))}>{node.locked ? <LockSimple size={13} /> : <LockSimpleOpen size={13} />}</button>
              <button className="canvas-layer-visibility" type="button" aria-label={`${node.hidden ? "Show" : "Hide"} ${node.name ?? node.type}`} onClick={() => commitCanvas(nodes.map((item) => item.id === node.id ? { ...item, hidden: !item.hidden } as CanvasNode : item))}>{node.hidden ? <EyeSlash size={13} /> : <Eye size={13} />}</button>
            </div>;
          })}
          {layerWindow.after > 0 && <div className="canvas-layer-spacer" style={{ height: layerWindow.after }} aria-hidden="true" />}
          {nodes.length === 0 && <p>No layers yet</p>}
        </div> : <div className="canvas-assets-panel">
          <label className="canvas-asset-search"><span className="sr-only">Search components</span><input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search components" /></label>
          {canCreateComponent && <button className="canvas-create-component" type="button" onClick={createComponentFromSelection}><DiamondsFour size={14} /><span><strong>Create component</strong><small>From {selectedNodes.length} selected {selectedNodes.length === 1 ? "layer" : "layers"}</small></span><kbd>⌘K</kbd></button>}
          <section className="canvas-paint-styles"><header><strong>Design tokens</strong><small>{tokenCollections.reduce((count, collection) => count + collection.tokens.length, 0)}</small></header>
            {selectedNode && selectedNode.type !== "component" && <div className="canvas-guide-actions"><button type="button" onClick={() => createDesignToken("color")}><Plus size={12} /> Color token</button>{(selectedNode.type === "rectangle" || selectedNode.type === "frame") && <button type="button" onClick={() => createDesignToken("number")}><Plus size={12} /> Radius token</button>}</div>}
            {tokenCollections.map((collection) => <div key={collection.id} className="canvas-token-collection"><label><span>{collection.name} mode</span><select aria-label={`${collection.name} token mode`} value={collection.activeMode} onChange={(event) => setTokenMode(collection.id, event.target.value)}>{collection.modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label><div className="canvas-style-list">{collection.tokens.map((token) => {
              const value = token.values[collection.activeMode];
              return <div className="canvas-style-row" key={token.id}><button type="button" aria-label={`Apply token ${token.name}`} onClick={() => bindDesignToken(token.id)}><i style={{ background: token.type === "color" ? String(value) : "#eef2f6" }} /><span><strong>{token.name}</strong><small>{token.type === "color" ? String(value).toUpperCase() : `${value}px`}</small></span></button>{token.type === "color" ? <input aria-label={`${token.name} ${collection.activeMode} value`} type="color" value={String(value)} onChange={(event) => updateDesignToken(collection.id, token.id, { value: event.target.value })} /> : <input aria-label={`${token.name} ${collection.activeMode} value`} type="number" min="0" value={Number(value)} onChange={(event) => updateDesignToken(collection.id, token.id, { value: Number(event.target.value) })} />}</div>;
            })}</div></div>)}
            {!tokenCollections.length && <p>Create semantic color or radius tokens from the selected layer. Every collection starts with Light and Dark modes.</p>}
          </section>
          <section className="canvas-paint-styles"><header><strong>Color styles</strong><small>{filteredPaintStyles.length}</small></header>
            {canCreatePaintStyle && <button className="canvas-create-style" type="button" onClick={createPaintStyle}><Plus size={13} /> Save selected fill as style</button>}
            <div className="canvas-style-list">{filteredPaintStyles.map((style) => <div className="canvas-style-row" key={style.id}><button type="button" aria-label={`Apply ${style.name}`} onClick={() => applyPaintStyle(style)}><i style={{ background: style.gradient ? `linear-gradient(${style.gradient.angle}deg, ${style.gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ")})` : style.color }} /><span><strong>{style.name}</strong><small>{style.gradient ? "Linear gradient" : style.color.toUpperCase()}</small></span></button>{selectedNode && selectedNode.type !== "component" && <button type="button" aria-label={`Update ${style.name} from selection`} title="Update from selection" onClick={() => updatePaintStyle(style.id)}><ArrowClockwise size={12} /></button>}<button type="button" aria-label={`Delete ${style.name}`} onClick={() => removePaintStyle(style.id)}><Trash size={12} /></button></div>)}</div>
            {!filteredPaintStyles.length && <p>{paintStyles.length ? "No matching color styles" : "Save a fill to reuse it across layers."}</p>}
          </section>
          <section className="canvas-paint-styles"><header><strong>Text styles</strong><small>{filteredTextStyles.length}</small></header>
            {selectedNode?.type === "text" && <button className="canvas-create-style" type="button" onClick={createTextStyle}><Plus size={13} /> Save typography as style</button>}
            <div className="canvas-style-list">{filteredTextStyles.map((style) => <div className="canvas-style-row" key={style.id}><button type="button" aria-label={`Apply ${style.name}`} onClick={() => applyTextStyle(style)}><i className="canvas-text-style-swatch">Aa</i><span><strong>{style.name}</strong><small>{style.fontFamily} · {style.fontSize}px</small></span></button>{selectedNode?.type === "text" && <button type="button" aria-label={`Update ${style.name} from selection`} onClick={() => updateTextStyle(style.id)}><ArrowClockwise size={12} /></button>}<button type="button" aria-label={`Delete ${style.name}`} onClick={() => removeTextStyle(style.id)}><Trash size={12} /></button></div>)}</div>
            {!filteredTextStyles.length && <p>{textStyles.length ? "No matching text styles" : "Save typography to keep type consistent."}</p>}
          </section>
          <section className="canvas-paint-styles"><header><strong>Effect styles</strong><small>{filteredEffectStyles.length}</small></header>
            {selectedNode && selectedNode.type !== "component" && selectedNode.shadow && <button className="canvas-create-style" type="button" onClick={createEffectStyle}><Plus size={13} /> Save shadow as style</button>}
            <div className="canvas-style-list">{filteredEffectStyles.map((style) => <div className="canvas-style-row" key={style.id}><button type="button" aria-label={`Apply ${style.name}`} onClick={() => applyEffectStyle(style)}><i style={{ background: "#ffffff", boxShadow: `${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur}px color-mix(in srgb, ${style.shadow.color} ${style.shadow.opacity * 100}%, transparent)` }} /><span><strong>{style.name}</strong><small>{style.shadow.y}px / {style.shadow.blur}px blur</small></span></button>{selectedNode && selectedNode.type !== "component" && selectedNode.shadow && <button type="button" aria-label={`Update ${style.name} from selection`} onClick={() => updateEffectStyle(style.id)}><ArrowClockwise size={12} /></button>}<button type="button" aria-label={`Delete ${style.name}`} onClick={() => removeEffectStyle(style.id)}><Trash size={12} /></button></div>)}</div>
            {!filteredEffectStyles.length && <p>{effectStyles.length ? "No matching effect styles" : "Save a shadow to reuse its effect."}</p>}
          </section>
          <section><header><strong>Local components</strong><small>{filteredComponents.length}</small></header>
            <div className="canvas-asset-grid">{filteredComponents.map((component) => <button type="button" key={component.id} onClick={() => insertComponent(component)}><span className="canvas-asset-preview"><DiamondsFour size={17} /></span><span><strong>{component.name}</strong><small>{component.nodes.length} layers</small></span><Plus size={13} /></button>)}</div>
            {!filteredComponents.length && <p>{components.length ? "No matching components" : "Select layers and create your first reusable component."}</p>}
          </section>
          <section><header><strong>Starter kit</strong><small>{filteredStarters.length}</small></header>
            <div className="canvas-asset-grid">{filteredStarters.map((component) => <button type="button" key={component.id} onClick={() => insertComponent(component)}><span className={`canvas-asset-preview ${component.id.replace("starter-", "")}`}><DiamondsFour size={17} /></span><span><strong>{component.name}</strong><small>{component.width} × {component.height}</small></span><Plus size={13} /></button>)}</div>
          </section>
        </div>}
      </aside>

      <main className={`canvas-stage canvas-tool-${tool}`}>
        <div className="canvas-topbar" role="toolbar" aria-label="Canvas tools">
          <button type="button" aria-label="Undo" title="Undo" disabled={!historyCanUndo} onClick={undo}><ArrowCounterClockwise size={15} /></button>
          <button type="button" aria-label="Redo" title="Redo" disabled={!historyCanRedo} onClick={redo}><ArrowClockwise size={15} /></button>
          <span />
          <button className={tool === "select" ? "active" : ""} type="button" aria-pressed={tool === "select"} aria-label="Select tool" title="Select · V" onClick={() => chooseTool("select")}><Cursor size={16} /></button>
          <button className={tool === "hand" ? "active" : ""} type="button" aria-pressed={tool === "hand"} aria-label="Hand tool" title="Hand · H" onClick={() => chooseTool("hand")}><Hand size={16} /></button>
          <span />
          <button className={tool === "frame" ? "active" : ""} type="button" aria-pressed={tool === "frame"} onClick={() => chooseTool("frame")} aria-label="Frame tool" title="Frame · F"><BoundingBox size={16} /></button>
          <button className={tool === "rectangle" ? "active" : ""} type="button" aria-pressed={tool === "rectangle"} onClick={() => chooseTool("rectangle")} aria-label="Rectangle tool" title="Rectangle · R"><Square size={16} /></button>
          <button className={tool === "ellipse" ? "active" : ""} type="button" aria-pressed={tool === "ellipse"} onClick={() => chooseTool("ellipse")} aria-label="Ellipse tool" title="Ellipse · O"><Circle size={16} /></button>
          <button className={tool === "line" ? "active" : ""} type="button" aria-pressed={tool === "line"} onClick={() => chooseTool("line")} aria-label="Line tool" title="Line · L"><LineSegment size={16} /></button>
          <button className={tool === "arrow" ? "active" : ""} type="button" aria-pressed={tool === "arrow"} onClick={() => chooseTool("arrow")} aria-label="Arrow tool" title="Arrow · Shift L"><ArrowRight size={16} /></button>
          <button className={tool === "pen" ? "active" : ""} type="button" aria-pressed={tool === "pen"} onClick={() => chooseTool("pen")} aria-label="Pen tool" title="Pen · P"><Path size={16} /></button>
          <button className={tool === "pencil" ? "active" : ""} type="button" aria-pressed={tool === "pencil"} onClick={() => chooseTool("pencil")} aria-label="Pencil tool" title="Pencil · Shift P"><PencilSimple size={16} /></button>
          <button className={tool === "text" ? "active" : ""} type="button" aria-pressed={tool === "text"} onClick={() => chooseTool("text")} aria-label="Text tool" title="Text · T"><TextT size={17} /></button>
          <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Import image or editable SVG" title="Import image or editable SVG"><ImageSquare size={16} /></button>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { importImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <span />
          <button className={snapToGrid ? "enabled" : ""} type="button" aria-pressed={snapToGrid} aria-label="Snap to grid" title="Snap to grid" onClick={() => setSnapMode(!snapToGrid)}><GridFour size={16} /></button>
          <button className={rulersVisible ? "enabled" : ""} type="button" aria-pressed={rulersVisible} aria-label="Show rulers" title="Rulers and guides" onClick={() => patchWorkspaceAppState({ rulersVisible: !rulersVisible, guidesVisible: true })}><Ruler size={16} /></button>
          <span />
          <button type="button" aria-label="Play prototype" title="Play prototype" onClick={() => setPrototypeOpen(true)}><Play size={16} weight="fill" /></button>
        </div>

        {selectedNodes.length > 1 && <div className="canvas-selectionbar" role="toolbar" aria-label="Selection alignment">
          <span>{selectedNodes.length} selected</span>
          <button aria-label="Align left" title="Align left" onClick={() => alignSelected("left")}><AlignLeft size={14} /></button>
          <button aria-label="Align horizontal centers" title="Align horizontal centers" onClick={() => alignSelected("center-x")}><AlignCenterHorizontal size={14} /></button>
          <button aria-label="Align right" title="Align right" onClick={() => alignSelected("right")}><AlignRight size={14} /></button>
          <i />
          <button aria-label="Align top" title="Align top" onClick={() => alignSelected("top")}><AlignTop size={14} /></button>
          <button aria-label="Align vertical centers" title="Align vertical centers" onClick={() => alignSelected("center-y")}><AlignCenterVertical size={14} /></button>
          <button aria-label="Align bottom" title="Align bottom" onClick={() => alignSelected("bottom")}><AlignBottom size={14} /></button>
          {selectedNodes.length > 2 && <><i /><button aria-label="Distribute horizontally" title="Distribute horizontally" onClick={() => distributeSelected("horizontal")}><Rows size={14} /></button><button aria-label="Distribute vertically" title="Distribute vertically" onClick={() => distributeSelected("vertical")}><Rows className="vertical" size={14} /></button></>}
          {canBooleanSelection && <><i /><button aria-label="Union selection" title="Union" onClick={() => applyBooleanOperation("union")}>Union</button><button aria-label="Subtract selection" title="Subtract" onClick={() => applyBooleanOperation("difference")}>Subtract</button><button aria-label="Intersect selection" title="Intersect" onClick={() => applyBooleanOperation("intersection")}>Intersect</button><button aria-label="Exclude overlap" title="Exclude" onClick={() => applyBooleanOperation("exclusion")}>Exclude</button><button aria-label="Flatten selection" title="Flatten" onClick={() => applyBooleanOperation("flatten")}>Flatten</button></>}
        </div>}

        <p id="canvas-keyboard-help" className="sr-only">Choose a drawing tool and press Enter to insert it. Use arrow keys to move selected layers. Hold Control or Command while dragging to bypass snapping. Tab to vector points and use arrow keys to edit them.</p>
        <output className="sr-only" aria-live="polite" aria-atomic="true">{snapAnnouncement}</output>
        <svg ref={stageRef} role="application" aria-label="Canvas artwork" aria-describedby="canvas-keyboard-help" tabIndex={0} onPointerDown={handleStagePointerDown} onPointerMove={handleStagePointerMove} onPointerUp={endGesture} onPointerCancel={endGesture} onDoubleClick={() => finishPenDraft(false)} onWheel={handleWheel}>
          <defs>
            <pattern id="khadim-canvas-grid" width={snapGridSize} height={snapGridSize} patternUnits="userSpaceOnUse"><circle cx=".75" cy=".75" r=".55" /></pattern>
            <filter id="khadim-canvas-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="18" floodOpacity=".16" /></filter>
            <marker id="canvas-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
            {renderedNodes.filter((node): node is CanvasPrimitiveNode => node.type === "frame" && Boolean(node.clipContent)).map((frame) => <clipPath id={`canvas-clip-${frame.id}`} key={frame.id} clipPathUnits="userSpaceOnUse"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={frame.radius ?? 0} transform={frame.rotation ? `rotate(${frame.rotation} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})` : undefined} /></clipPath>)}
            {renderedNodes.filter((node): node is CanvasPrimitiveNode => node.type !== "component" && maskSourceIds.has(node.id)).map((mask) => <clipPath id={`canvas-mask-${mask.id}`} key={`mask:${mask.id}`} clipPathUnits="userSpaceOnUse"><g transform={mask.rotation ? `rotate(${mask.rotation} ${mask.x + mask.width / 2} ${mask.y + mask.height / 2})` : undefined}>{renderPrimitive({ ...mask, opacity: 1, shadow: undefined, strokeWidth: 0 }, `mask-shape:${mask.id}`)}</g></clipPath>)}
          </defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
            <text className="canvas-frame-label" x="0" y="-15">Frame 1 · {canvasFrame.width} × {canvasFrame.height}</text>
            <rect className="canvas-frame" width={canvasFrame.width} height={canvasFrame.height} style={{ fill: pageAppState.viewBackgroundColor }} />
            <rect className="canvas-grid" width={canvasFrame.width} height={canvasFrame.height} fill="url(#khadim-canvas-grid)" />
            {guidesVisible && rulerGuides.map((guide) => guide.axis === "x" ? <line className="canvas-ruler-guide" key={guide.id} x1={guide.position} x2={guide.position} y1={-1000} y2={canvasFrame.height + 1000} stroke={guide.color ?? "#2563eb"} vectorEffect="non-scaling-stroke" /> : <line className="canvas-ruler-guide" key={guide.id} x1={-1000} x2={canvasFrame.width + 1000} y1={guide.position} y2={guide.position} stroke={guide.color ?? "#2563eb"} vectorEffect="non-scaling-stroke" />)}
            {renderedNodes.map(renderCanvasNode)}
            {activePage?.prototypeViewport && <g className="canvas-prototype-viewport-outline" aria-hidden="true" pointerEvents="none"><rect width={activePage.prototypeViewport.width} height={activePage.prototypeViewport.height} vectorEffect="non-scaling-stroke" /><text x={12 / viewport.zoom} y={activePage.prototypeViewport.height - 10 / viewport.zoom} fontSize={10 / viewport.zoom}>Prototype viewport</text></g>}
            {renderedNodes.filter((node): node is CanvasPrimitiveNode => node.type === "frame").map(renderFrameLayoutGrids)}
            <g className="canvas-snap-feedback" aria-hidden="true">
              {snapFeedback.lines.map((line, index) => line.axis === "x"
                ? <line className={`canvas-smart-guide canvas-smart-guide-${line.kind}`} key={`snap-line:${index}`} x1={line.position} x2={line.position} y1={line.from} y2={line.to} vectorEffect="non-scaling-stroke" />
                : <line className={`canvas-smart-guide canvas-smart-guide-${line.kind}`} key={`snap-line:${index}`} x1={line.from} x2={line.to} y1={line.position} y2={line.position} vectorEffect="non-scaling-stroke" />)}
              {snapFeedback.measurements.map((measurement, index) => {
                const value = Math.round(measurement.value * 100) / 100;
                const label = String(value);
                const width = Math.max(24, label.length * 7 + 10) / viewport.zoom;
                const height = 18 / viewport.zoom;
                const center = (measurement.start + measurement.end) / 2;
                return measurement.axis === "x" ? <g className="canvas-snap-distance" key={`snap-distance:${index}`}>
                  <line x1={measurement.start} x2={measurement.end} y1={measurement.cross} y2={measurement.cross} vectorEffect="non-scaling-stroke" />
                  <line x1={measurement.start} x2={measurement.start} y1={measurement.cross - 4 / viewport.zoom} y2={measurement.cross + 4 / viewport.zoom} vectorEffect="non-scaling-stroke" />
                  <line x1={measurement.end} x2={measurement.end} y1={measurement.cross - 4 / viewport.zoom} y2={measurement.cross + 4 / viewport.zoom} vectorEffect="non-scaling-stroke" />
                  <rect x={center - width / 2} y={measurement.cross - height / 2} width={width} height={height} rx={4 / viewport.zoom} />
                  <text x={center} y={measurement.cross + 4 / viewport.zoom} fontSize={10 / viewport.zoom}>{label}</text>
                </g> : <g className="canvas-snap-distance" key={`snap-distance:${index}`}>
                  <line x1={measurement.cross} x2={measurement.cross} y1={measurement.start} y2={measurement.end} vectorEffect="non-scaling-stroke" />
                  <line x1={measurement.cross - 4 / viewport.zoom} x2={measurement.cross + 4 / viewport.zoom} y1={measurement.start} y2={measurement.start} vectorEffect="non-scaling-stroke" />
                  <line x1={measurement.cross - 4 / viewport.zoom} x2={measurement.cross + 4 / viewport.zoom} y1={measurement.end} y2={measurement.end} vectorEffect="non-scaling-stroke" />
                  <rect x={measurement.cross - width / 2} y={center - height / 2} width={width} height={height} rx={4 / viewport.zoom} />
                  <text x={measurement.cross} y={center + 4 / viewport.zoom} fontSize={10 / viewport.zoom}>{label}</text>
                </g>;
              })}
            </g>
            {selectedNodes.filter((node) => !hasNodeOrAncestorFlag(node, "hidden")).map((node) => {
              const rect = nodeRect(node, components);
              const transform = node.rotation ? `rotate(${node.rotation} ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})` : undefined;
              return <rect className="canvas-selection-outline" key={`selection:${node.id}`} transform={transform} x={rect.x - 1} y={rect.y - 1} width={rect.width + 2} height={rect.height + 2} rx={Math.min(node.type === "rectangle" ? node.radius ?? 0 : 0, 8)} vectorEffect="non-scaling-stroke" />;
            })}
            {selectedNode && !hasNodeOrAncestorFlag(selectedNode, "hidden") && !hasNodeOrAncestorFlag(selectedNode, "locked") && <g className="canvas-transform-handles" transform={selectedNode.rotation ? `rotate(${selectedNode.rotation} ${selectedNode.x + selectedNode.width / 2} ${selectedNode.y + selectedNode.height / 2})` : undefined}>
              <line className="canvas-rotation-stem" x1={selectedNode.x + selectedNode.width / 2} y1={selectedNode.y} x2={selectedNode.x + selectedNode.width / 2} y2={selectedNode.y - 24 / viewport.zoom} />
              <circle className="canvas-handle-hit canvas-rotation-hit" cx={selectedNode.x + selectedNode.width / 2} cy={selectedNode.y - 28 / viewport.zoom} r={14 / viewport.zoom} onPointerDown={(event) => beginRotate(event, selectedNode)} />
              <circle className="canvas-rotation-handle" cx={selectedNode.x + selectedNode.width / 2} cy={selectedNode.y - 28 / viewport.zoom} r={5 / viewport.zoom} pointerEvents="none" />
              {(["nw", "ne", "se", "sw"] as const).map((handle) => {
                const x = handle.includes("e") ? selectedNode.x + selectedNode.width : selectedNode.x;
                const y = handle.includes("s") ? selectedNode.y + selectedNode.height : selectedNode.y;
                return <g key={handle}><rect className={`canvas-handle-hit canvas-resize-hit handle-${handle}`} x={x - 14 / viewport.zoom} y={y - 14 / viewport.zoom} width={28 / viewport.zoom} height={28 / viewport.zoom} onPointerDown={(event) => beginResize(event, selectedNode, handle)} /><rect className={`canvas-resize-handle handle-${handle}`} x={x - 5 / viewport.zoom} y={y - 5 / viewport.zoom} width={10 / viewport.zoom} height={10 / viewport.zoom} rx={2 / viewport.zoom} pointerEvents="none" /></g>;
              })}
            </g>}
            {selectedNode && selectedNode.type !== "component" && (selectedNode.type === "path" || selectedNode.type === "arrow") && !selectedNode.locked && <g className="canvas-path-points" transform={selectedNode.rotation ? `rotate(${selectedNode.rotation} ${selectedNode.x + selectedNode.width / 2} ${selectedNode.y + selectedNode.height / 2})` : undefined}>
              {canvasPathAbsolutePoints(selectedNode).map((point, index) => <g key={`${selectedNode.id}:point:${index}`}>
                {selectedPathPointIndex === index && point.handleIn && <><line className="canvas-bezier-handle-line" x1={point.x} y1={point.y} x2={point.handleIn.x} y2={point.handleIn.y} /><circle className="canvas-handle-hit canvas-bezier-handle-hit" cx={point.handleIn.x} cy={point.handleIn.y} r={12 / viewport.zoom} onPointerDown={(event) => beginPathHandleMove(event, selectedNode, index, "in")} /><circle className="canvas-bezier-handle" cx={point.handleIn.x} cy={point.handleIn.y} r={4 / viewport.zoom} pointerEvents="none" /></>}
                {selectedPathPointIndex === index && point.handleOut && <><line className="canvas-bezier-handle-line" x1={point.x} y1={point.y} x2={point.handleOut.x} y2={point.handleOut.y} /><circle className="canvas-handle-hit canvas-bezier-handle-hit" cx={point.handleOut.x} cy={point.handleOut.y} r={12 / viewport.zoom} onPointerDown={(event) => beginPathHandleMove(event, selectedNode, index, "out")} /><circle className="canvas-bezier-handle" cx={point.handleOut.x} cy={point.handleOut.y} r={4 / viewport.zoom} pointerEvents="none" /></>}
                <circle className="canvas-handle-hit canvas-path-point-hit" cx={point.x} cy={point.y} r={14 / viewport.zoom} role="button" tabIndex={0} aria-label={`Path point ${index + 1}. Use arrow keys to move.`} aria-pressed={selectedPathPointIndex === index} onPointerDown={(event) => beginPathPointMove(event, selectedNode, index)} onKeyDown={(event) => nudgePathPoint(event, selectedNode, index)} />
                <circle className={selectedPathPointIndex === index ? "canvas-path-point-active" : undefined} cx={point.x} cy={point.y} r={5 / viewport.zoom} pointerEvents="none" aria-hidden="true" />
              </g>)}
            </g>}
            {selectedNodes.length > 1 && selectedBounds && !selectedNodes.some((node) => node.hidden || node.locked) && <g className="canvas-transform-handles canvas-multi-transform-handles">
              <rect className="canvas-multi-transform-outline" x={selectedBounds.x} y={selectedBounds.y} width={selectedBounds.width} height={selectedBounds.height} vectorEffect="non-scaling-stroke" />
              <line className="canvas-rotation-stem" x1={selectedBounds.x + selectedBounds.width / 2} y1={selectedBounds.y} x2={selectedBounds.x + selectedBounds.width / 2} y2={selectedBounds.y - 24 / viewport.zoom} />
              <circle className="canvas-handle-hit canvas-rotation-hit" cx={selectedBounds.x + selectedBounds.width / 2} cy={selectedBounds.y - 28 / viewport.zoom} r={14 / viewport.zoom} onPointerDown={beginMultiRotate} />
              <circle className="canvas-rotation-handle" cx={selectedBounds.x + selectedBounds.width / 2} cy={selectedBounds.y - 28 / viewport.zoom} r={5 / viewport.zoom} pointerEvents="none" />
              {(["nw", "ne", "se", "sw"] as const).map((handle) => {
                const x = handle.includes("e") ? selectedBounds.x + selectedBounds.width : selectedBounds.x;
                const y = handle.includes("s") ? selectedBounds.y + selectedBounds.height : selectedBounds.y;
                return <g key={`multi:${handle}`}><rect className={`canvas-handle-hit canvas-resize-hit handle-${handle}`} x={x - 14 / viewport.zoom} y={y - 14 / viewport.zoom} width={28 / viewport.zoom} height={28 / viewport.zoom} onPointerDown={(event) => beginMultiResize(event, handle)} /><rect className={`canvas-resize-handle handle-${handle}`} x={x - 5 / viewport.zoom} y={y - 5 / viewport.zoom} width={10 / viewport.zoom} height={10 / viewport.zoom} rx={2 / viewport.zoom} pointerEvents="none" /></g>;
              })}
            </g>}
            {marquee && <rect className="canvas-marquee" x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} vectorEffect="non-scaling-stroke" />}
            {editingText && (() => {
              const node = nodes.find((item) => item.id === editingText.id);
              if (node?.type !== "text") return null;
              return <foreignObject className="canvas-inline-editor" x={node.x - 4} y={node.y - 4} width={Math.max(node.width + 8, 120)} height={Math.max(node.height + 8, 46)}><textarea autoFocus style={{ fontSize: node.fontSize ?? 26, fontWeight: node.fontWeight ?? 620 }} value={editingText.value} onChange={(event) => setEditingText({ id: editingText.id, value: event.target.value })} onBlur={commitInlineText} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingText(null); }} /></foreignObject>;
            })()}
          </g>
          {rulersVisible && <g className="canvas-rulers">
            <rect className="canvas-ruler-surface" x="0" y="0" width="100%" height="22" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); addRulerGuide("x", stagePoint(event.clientX, event.clientY).x); }} />
            <rect className="canvas-ruler-surface" x="0" y="0" width="22" height="100%" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); addRulerGuide("y", stagePoint(event.clientX, event.clientY).y); }} />
            {Array.from({ length: Math.ceil(canvasFrame.width / rulerStep) + 1 }, (_, index) => index * rulerStep).map((value) => { const x = viewport.x + value * viewport.zoom; return <g key={`rx:${value}`} transform={`translate(${x} 0)`}><line x1="0" x2="0" y1="14" y2="22" /><text x="3" y="11">{value}</text></g>; })}
            {Array.from({ length: Math.ceil(canvasFrame.height / rulerStep) + 1 }, (_, index) => index * rulerStep).map((value) => { const y = viewport.y + value * viewport.zoom; return <g key={`ry:${value}`} transform={`translate(0 ${y})`}><line x1="14" x2="22" y1="0" y2="0" /><text x="4" y="-3" transform="rotate(-90 4 -3)">{value}</text></g>; })}
            <rect className="canvas-ruler-corner" x="0" y="0" width="22" height="22" />
          </g>}
        </svg>

        <div className="canvas-zoom" aria-label="Canvas zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(viewport.zoom - .1)}><Minus size={13} /></button>
          <button className="canvas-zoom-value" type="button" onClick={fitFrame} title="Fit frame">{Math.round(viewport.zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(viewport.zoom + .1)}><Plus size={13} /></button>
          <span />
          <button type="button" aria-label="Fit frame" onClick={fitFrame}><CornersOut size={14} /></button>
        </div>
        {nodes.length === 0 && <div className="canvas-empty"><Selection size={25} /><strong>Start with a frame or shape</strong><span>Draw on the canvas, import an image, or use a reusable component.</span><div><button type="button" onClick={() => add("frame")}><BoundingBox size={14} /> Frame</button><button type="button" onClick={() => add("rectangle")}><Square size={14} /> Rectangle</button><button type="button" onClick={() => setSidePanel("assets")}><DiamondsFour size={14} /> Assets</button></div></div>}
        {prototypeOpen && <CanvasPrototypePreview title={artifact.title} content={{ ...content, frame: canvasFrame, elements: nodes, components, styles: paintStyles, textStyles, effectStyles, tokenCollections, pages, activePageId, prototypeFlows, prototypeStartPageId, appState: pageAppState }} pages={syncedPages(nodes)} flows={prototypeFlows} initialFlowId={activePrototypeFlow?.id} onClose={() => setPrototypeOpen(false)} />}
      </main>

      <aside className="studio-inspector" aria-label="Canvas settings">
        <header><SidebarSimple size={16} /><strong>{selectedNodes.length > 1 ? `${selectedNodes.length} layers` : selectedNode?.name ?? "Canvas"}</strong></header>
        {selectedNodes.length > 1 && selectedBounds ? <>
          <section className="canvas-inspector-section canvas-multi-summary"><h3>Selection</h3><dl><div><dt>X</dt><dd>{Math.round(selectedBounds.x)}</dd></div><div><dt>Y</dt><dd>{Math.round(selectedBounds.y)}</dd></div><div><dt>W</dt><dd>{Math.round(selectedBounds.width)}</dd></div><div><dt>H</dt><dd>{Math.round(selectedBounds.height)}</dd></div></dl></section>
          <section className="canvas-inspector-section"><h3>Align</h3><div className="canvas-align-grid">
            <button aria-label="Align left" onClick={() => alignSelected("left")}><AlignLeft size={15} /></button><button aria-label="Align horizontal centers" onClick={() => alignSelected("center-x")}><AlignCenterHorizontal size={15} /></button><button aria-label="Align right" onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
            <button aria-label="Align top" onClick={() => alignSelected("top")}><AlignTop size={15} /></button><button aria-label="Align vertical centers" onClick={() => alignSelected("center-y")}><AlignCenterVertical size={15} /></button><button aria-label="Align bottom" onClick={() => alignSelected("bottom")}><AlignBottom size={15} /></button>
          </div>{selectedNodes.length > 2 && <div className="canvas-distribute-actions"><button onClick={() => distributeSelected("horizontal")}><Rows size={14} /> Horizontal</button><button onClick={() => distributeSelected("vertical")}><Rows className="vertical" size={14} /> Vertical</button></div>}</section>
          <section className="canvas-inspector-section"><h3>Structure</h3><div className="canvas-structure-actions"><button type="button" onClick={groupSelected}><BoundingBox size={14} /> Group</button><button type="button" onClick={() => createFrameFromSelection(false)}><BoundingBox size={14} /> Frame</button><button type="button" onClick={() => createFrameFromSelection(true)}><Rows size={14} /> Auto layout</button><button type="button" disabled={!canCreateMask} onClick={createMaskFromSelection}><Selection size={14} /> Use top as mask</button></div></section>
          <section className="canvas-inspector-section"><button className="canvas-component-action" disabled={!canCreateComponent} onClick={createComponentFromSelection}><DiamondsFour size={15} /><span><strong>Create component</strong><small>Turn this selection into a reusable asset</small></span></button></section>
          <div className="canvas-inspector-actions"><button type="button" onClick={duplicateSelected}><Copy size={14} /> Duplicate</button><button className="danger" type="button" onClick={removeSelected}><Trash size={14} /> Delete</button></div>
        </> : selectedNode ? <>
          {selectedNode.type === "component" && selectedComponent && <section className="canvas-inspector-section canvas-instance-section"><h3>{selectedNode.componentRole === "main" ? "Main component" : "Instance"}</h3><label><span>{selectedNode.componentRole === "main" ? "Component name" : "Layer name"}</span>{selectedNode.componentRole === "main" ? <input key={`${selectedComponent.id}:${selectedComponent.name}`} defaultValue={selectedComponent.name} onBlur={(event) => { if (!event.currentTarget.value.trim()) event.currentTarget.value = selectedComponent.name; else renameSelectedComponent(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <input value={selectedNode.name ?? selectedComponent.name} onChange={(event) => patchSelected({ name: event.target.value })} />}</label><div className="canvas-component-meta"><DiamondsFour size={14} /><span><strong>{selectedComponent.nodes.length} layers</strong><small>{selectedNode.componentRole === "main" ? "Edits update every instance" : `Linked to ${selectedComponent.name}`}</small></span></div>{selectedNode.componentRole === "main" && <button className="canvas-reset-overrides" type="button" onClick={createComponentVariant}>Add variant</button>}</section>}
          {selectedNode.type === "component" && selectedComponent?.variantSetId && (() => {
            const propertyName = Object.keys(selectedComponent.variantProperties ?? {})[0] ?? "State";
            const propertyValue = selectedComponent.variantProperties?.[propertyName] ?? "Default";
            const variants = components.filter((component) => component.variantSetId === selectedComponent.variantSetId);
            return <section className="canvas-inspector-section"><h3>Variant</h3>{selectedNode.componentRole === "instance" ? <label><span>{propertyName}</span><select aria-label="Component variant" value={selectedComponent.id} onChange={(event) => switchSelectedVariant(event.target.value)}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.variantProperties?.[propertyName] ?? variant.name}</option>)}</select></label> : <div className="canvas-typography-fields"><label><span>Property</span><input aria-label="Variant property" value={propertyName} onChange={(event) => updateSelectedVariant(event.target.value, propertyValue)} /></label><label><span>Value</span><input aria-label="Variant value" value={propertyValue} onChange={(event) => updateSelectedVariant(propertyName, event.target.value)} /></label></div>}<small className="canvas-field-hint">Switching variants keeps overrides for matching internal layers.</small></section>;
          })()}
          {selectedNode.type !== "component" && <section className="canvas-inspector-section"><h3>Layer</h3><label><span>Name</span><input value={selectedNode.name ?? nodeLabel(selectedNode)} onChange={(event) => patchSelected({ name: event.target.value })} /></label></section>}
          <section className="canvas-inspector-section"><h3>Position</h3><div className="canvas-property-grid">
            <label><span>X</span><input aria-label="X position" type="number" value={Math.round(selectedNode.x)} onChange={(event) => patchSelected({ x: Number(event.target.value) })} /></label>
            <label><span>Y</span><input aria-label="Y position" type="number" value={Math.round(selectedNode.y)} onChange={(event) => patchSelected({ y: Number(event.target.value) })} /></label>
            <label><span>W</span><input aria-label="Width" type="number" min={selectedNode.type === "line" || selectedNode.type === "path" || selectedNode.type === "arrow" ? 1 : 24} value={Math.round(selectedNode.width)} onChange={(event) => patchSelected({ width: Math.max(selectedNode.type === "line" || selectedNode.type === "path" || selectedNode.type === "arrow" ? 1 : 24, Number(event.target.value)) })} /></label>
            <label><span>H</span><input aria-label="Height" type="number" min={selectedNode.type === "line" || selectedNode.type === "path" || selectedNode.type === "arrow" ? 1 : 24} value={Math.round(selectedNode.height)} onChange={(event) => patchSelected({ height: Math.max(selectedNode.type === "line" || selectedNode.type === "path" || selectedNode.type === "arrow" ? 1 : 24, Number(event.target.value)) })} /></label>
            <label><span>°</span><input aria-label="Rotation" type="number" value={Math.round(selectedNode.rotation ?? 0)} onChange={(event) => patchSelected({ rotation: normalizedAngle(Number(event.target.value)) })} /></label>
          </div>{selectedNode.parentId && <label className="canvas-toggle-row"><input type="checkbox" checked={selectedNode.layoutPosition === "absolute"} onChange={(event) => patchSelected({ layoutPosition: event.target.checked ? "absolute" : "static" })} /><span>Absolute in parent</span></label>}</section>
          <section className="canvas-inspector-section"><h3>Hierarchy</h3><label><span>Parent</span><select aria-label="Parent frame" value={selectedNode.parentId ?? ""} onChange={(event) => reparentSelected(event.target.value || undefined)}><option value="">Page root</option>{nodes.filter((node) => node.type === "frame" && node.id !== selectedNode.id && !descendantIds(nodes, [selectedNode.id]).includes(node.id)).map((frame) => <option value={frame.id} key={frame.id}>{frame.name ?? nodeLabel(frame)}</option>)}</select></label><small className="canvas-field-hint">Drag layers to reorder. Hold Shift while dropping on a frame to nest.</small></section>
          {selectedNode.type !== "component" && selectedNode.maskId && <section className="canvas-inspector-section"><button className="canvas-reset-overrides" type="button" onClick={releaseSelectedMask}>Release mask</button></section>}
          {selectedNode.type !== "component" && selectedNode.type !== "line" && selectedNode.type !== "arrow" && selectedNode.type !== "image" && (selectedNode.type !== "path" || selectedNode.pathClosed) && <section className="canvas-inspector-section"><h3>Fill paint</h3>
            {selectedNode.fillStyleId && <div className="canvas-connector-status"><span>Linked to {paintStyles.find((style) => style.id === selectedNode.fillStyleId)?.name ?? "color style"}</span><button type="button" onClick={() => patchSelected({ fillStyleId: undefined })}>Detach style</button></div>}
            <label><span>Type</span><select aria-label="Fill type" value={selectedNode.fillGradient ? "linear" : "solid"} onChange={(event) => patchSelected({ fillGradient: event.target.value === "linear" ? { type: "linear", angle: 90, stops: [{ offset: 0, color: selectedNode.color }, { offset: 1, color: "#ffffff" }] } : undefined })}><option value="solid">Solid</option><option value="linear">Linear gradient</option></select></label>
            {selectedNode.fillGradient && <><label><span>Angle</span><input aria-label="Gradient angle" type="number" min="0" max="359" value={selectedNode.fillGradient.angle} onChange={(event) => patchSelected({ fillGradient: { ...selectedNode.fillGradient!, angle: normalizedAngle(Number(event.target.value)) } })} /></label><div className="canvas-typography-fields">
              <label className="canvas-color-field"><span>Start</span><span><input aria-label="Gradient start color" type="color" value={selectedNode.fillGradient.stops[0]?.color ?? selectedNode.color} onChange={(event) => patchSelected({ fillGradient: { ...selectedNode.fillGradient!, stops: [{ ...(selectedNode.fillGradient!.stops[0] ?? { offset: 0 }), color: event.target.value }, ...(selectedNode.fillGradient!.stops.slice(1).length ? selectedNode.fillGradient!.stops.slice(1) : [{ offset: 1, color: "#ffffff" }])] } })} /></span></label>
              <label className="canvas-color-field"><span>End</span><span><input aria-label="Gradient end color" type="color" value={selectedNode.fillGradient.stops.at(-1)?.color ?? "#ffffff"} onChange={(event) => patchSelected({ fillGradient: { ...selectedNode.fillGradient!, stops: [...selectedNode.fillGradient!.stops.slice(0, -1), { ...(selectedNode.fillGradient!.stops.at(-1) ?? { offset: 1 }), color: event.target.value }] } })} /></span></label>
            </div></>}
          </section>}
          {selectedNode.type === "boolean" && <section className="canvas-inspector-section"><h3>Boolean group</h3><label><span>Operation</span><select aria-label="Boolean operation" value={selectedNode.booleanOperation} onChange={(event) => patchSelected({ booleanOperation: event.target.value as CanvasPrimitiveNode["booleanOperation"] })}><option value="union">Union</option><option value="difference">Subtract</option><option value="intersection">Intersect</option><option value="exclusion">Exclude</option></select></label><div className="canvas-guide-actions"><button type="button" onClick={() => { setEditingBooleanId(selectedNode.id); setSelectedIds(nodes.filter((node) => node.parentId === selectedNode.id).slice(0, 1).map((node) => node.id)); }}>Edit contents</button><button type="button" onClick={flattenSelectedBoolean}>Flatten</button><button type="button" onClick={releaseSelectedBoolean}>Release</button></div><small className="canvas-field-hint">The source shapes stay editable until you flatten the group.</small></section>}
          {editingBooleanId && selectedNode.parentId === editingBooleanId && <section className="canvas-inspector-section"><div className="canvas-connector-status"><span>Editing boolean contents</span><button type="button" onClick={() => { setSelectedIds([editingBooleanId]); setEditingBooleanId(null); }}>Done</button></div></section>}
          {selectedNode.parentId && nodes.some((node) => node.id === selectedNode.parentId && node.type === "frame" && !node.layout) && <section className="canvas-inspector-section"><h3>Constraints</h3><div className="canvas-typography-fields"><label><span>Horizontal</span><select aria-label="Horizontal constraint" value={selectedNode.constraintH ?? "left"} onChange={(event) => patchSelected({ constraintH: event.target.value as CanvasNode["constraintH"] })}><option value="left">Left</option><option value="right">Right</option><option value="left-right">Left & right</option><option value="center">Center</option><option value="scale">Scale</option></select></label><label><span>Vertical</span><select aria-label="Vertical constraint" value={selectedNode.constraintV ?? "top"} onChange={(event) => patchSelected({ constraintV: event.target.value as CanvasNode["constraintV"] })}><option value="top">Top</option><option value="bottom">Bottom</option><option value="top-bottom">Top & bottom</option><option value="center">Center</option><option value="scale">Scale</option></select></label></div><small className="canvas-field-hint">Controls how this layer responds when its frame is resized.</small></section>}
          {selectedNode.type === "text" && <section className="canvas-inspector-section"><h3>Typography</h3>{selectedNode.textStyleId && <div className="canvas-connector-status"><span>Linked to {textStyles.find((style) => style.id === selectedNode.textStyleId)?.name ?? "text style"}</span><button type="button" onClick={() => patchSelected({ textStyleId: undefined })}>Detach style</button></div>}<label><span>Font family</span><select aria-label="Font family" value={selectedNode.fontFamily ?? "Atkinson Hyperlegible Next"} onChange={(event) => patchSelected({ fontFamily: event.target.value })}><option>Atkinson Hyperlegible Next</option><option>Source Serif 4</option><option value="system-ui">System UI</option><option>Georgia</option><option value="ui-monospace">Monospace</option></select></label><label><span>Text</span><textarea value={selectedNode.text} onChange={(event) => patchSelected({ text: event.target.value })} /></label><div className="canvas-typography-fields"><label><span>Size</span><input aria-label="Font size" type="number" min="6" max="240" value={selectedNode.fontSize ?? 26} onChange={(event) => patchSelected({ fontSize: Math.min(240, Math.max(6, Number(event.target.value))) })} /></label><label><span>Weight</span><select aria-label="Font weight" value={selectedNode.fontWeight ?? 620} onChange={(event) => patchSelected({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="620">Semibold</option><option value="700">Bold</option></select></label><label><span>Line height</span><input aria-label="Line height" type="number" min="0.8" max="3" step="0.1" value={selectedNode.lineHeight ?? 1.2} onChange={(event) => patchSelected({ lineHeight: Number(event.target.value) })} /></label><label><span>Tracking</span><input aria-label="Letter spacing" type="number" min="-10" max="50" value={selectedNode.letterSpacing ?? 0} onChange={(event) => patchSelected({ letterSpacing: Number(event.target.value) })} /></label></div><div className="canvas-segmented"><button className={selectedNode.textAlign !== "center" && selectedNode.textAlign !== "right" ? "active" : ""} onClick={() => patchSelected({ textAlign: "left" })}>Left</button><button className={selectedNode.textAlign === "center" ? "active" : ""} onClick={() => patchSelected({ textAlign: "center" })}>Center</button><button className={selectedNode.textAlign === "right" ? "active" : ""} onClick={() => patchSelected({ textAlign: "right" })}>Right</button><button className={selectedNode.fontStyle === "italic" ? "active" : ""} onClick={() => patchSelected({ fontStyle: selectedNode.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em></button></div><small className="canvas-field-hint">Resize the text box to control wrapping. Double-click to edit in place.</small></section>}
          {selectedNode.type !== "component" && (selectedNode.type === "path" || selectedNode.type === "arrow") && <section className="canvas-inspector-section"><h3>Vector path</h3>{selectedPathPoint && <div className="canvas-vector-node-editor"><small>Node {selectedPathPointIndex! + 1}</small><div className="canvas-segmented"><button type="button" className={(selectedPathPoint.nodeType ?? "corner") === "corner" ? "active" : ""} onClick={() => setSelectedPathNodeType("corner")}>Corner</button><button type="button" className={selectedPathPoint.nodeType === "smooth" ? "active" : ""} onClick={() => setSelectedPathNodeType("smooth")}>Curve</button></div><div className="canvas-guide-actions"><button type="button" onClick={addPathPointAfterSelection}>Split segment</button><button type="button" disabled={(selectedNode.points?.length ?? 0) <= 2} onClick={deleteSelectedPathPoint}>Delete node</button></div><small className="canvas-field-hint">Drag a handle to shape the curve. Hold Alt to break handle symmetry.</small></div>}{selectedNode.type === "path" && <><label><span>Smoothing</span><div className="canvas-range-field"><input aria-label="Path smoothing" type="range" min="0" max="100" value={Math.round((selectedNode.pathSmoothing ?? 0) * 100)} onChange={(event) => patchSelected({ pathSmoothing: Number(event.target.value) / 100 })} /><output>{Math.round((selectedNode.pathSmoothing ?? 0) * 100)}%</output></div></label><label className="canvas-toggle-row"><input type="checkbox" checked={Boolean(selectedNode.pathClosed)} onChange={(event) => patchSelected({ pathClosed: event.target.checked })} /><span>Close path</span></label></>}<div className="canvas-typography-fields"><label><span>Start</span><select aria-label="Start cap" value={selectedNode.startCap ?? "none"} onChange={(event) => patchSelected({ startCap: event.target.value as CanvasPrimitiveNode["startCap"] })}><option value="none">None</option><option value="round">Round</option><option value="arrow">Arrow</option></select></label><label><span>End</span><select aria-label="End cap" value={selectedNode.type === "arrow" ? "arrow" : selectedNode.endCap ?? "none"} onChange={(event) => patchSelected({ endCap: event.target.value as CanvasPrimitiveNode["endCap"] })}><option value="none">None</option><option value="round">Round</option><option value="arrow">Arrow</option></select></label></div>{selectedNode.type === "arrow" && <div className="canvas-connector-status"><span>{selectedNode.startBindingId ? "Start linked" : "Start free"}</span><span>{selectedNode.endBindingId ? "End linked" : "End free"}</span>{(selectedNode.startBindingId || selectedNode.endBindingId) && <button type="button" onClick={() => patchSelected({ startBindingId: undefined, endBindingId: undefined })}>Detach endpoints</button>}</div>}</section>}
          {selectedNode.type !== "component" && <section className="canvas-inspector-section"><h3>Appearance</h3>{selectedNode.type !== "line" && selectedNode.type !== "arrow" && selectedNode.type !== "image" && (selectedNode.type !== "path" || selectedNode.pathClosed) && <label className="canvas-color-field"><span>{selectedNode.type === "text" ? "Text color" : "Fill"}</span><span><input type="color" value={selectedNode.color} onChange={(event) => patchSelected({ color: event.target.value })} /><code>{selectedNode.color.toUpperCase()}</code></span></label>}{selectedNode.type !== "text" && selectedNode.type !== "image" && <><label className="canvas-color-field"><span>Stroke</span><span><input type="color" value={selectedNode.strokeColor ?? "#17181c"} onChange={(event) => patchSelected({ strokeColor: event.target.value, strokeWidth: Math.max(1, selectedNode.strokeWidth ?? 1) })} /><code>{(selectedNode.strokeColor ?? "#17181c").toUpperCase()}</code></span></label><div className="canvas-typography-fields"><label><span>Width</span><input aria-label="Stroke width" type="number" min="0" max="64" value={selectedNode.strokeWidth ?? 0} onChange={(event) => patchSelected({ strokeWidth: Math.max(0, Number(event.target.value)) })} /></label><label><span>Dash</span><input aria-label="Stroke dash" type="number" min="0" max="64" value={selectedNode.strokeDash ?? 0} onChange={(event) => patchSelected({ strokeDash: Math.max(0, Number(event.target.value)) })} /></label></div></>}<label><span>Opacity</span><div className="canvas-range-field"><input type="range" min="0" max="100" value={Math.round((selectedNode.opacity ?? 1) * 100)} onChange={(event) => patchSelected({ opacity: Number(event.target.value) / 100 })} /><output>{Math.round((selectedNode.opacity ?? 1) * 100)}%</output></div></label>{(selectedNode.type === "rectangle" || selectedNode.type === "frame") && <label><span>Corner radius</span><input type="number" min="0" value={selectedNode.radius ?? 0} onChange={(event) => patchSelected({ radius: Math.max(0, Number(event.target.value)) })} /></label>}<label className="canvas-toggle-row"><input type="checkbox" checked={Boolean(selectedNode.shadow)} onChange={(event) => patchSelected({ shadow: event.target.checked ? { color: "#101828", x: 0, y: 8, blur: 18, opacity: .2 } : undefined })} /><span>Drop shadow</span></label>{selectedNode.shadow && <div className="canvas-property-grid"><label><span>Y</span><input aria-label="Shadow Y" type="number" value={selectedNode.shadow.y} onChange={(event) => patchSelected({ shadow: { ...selectedNode.shadow!, y: Number(event.target.value) } })} /></label><label><span>B</span><input aria-label="Shadow blur" type="number" min="0" value={selectedNode.shadow.blur} onChange={(event) => patchSelected({ shadow: { ...selectedNode.shadow!, blur: Math.max(0, Number(event.target.value)) } })} /></label></div>}</section>}
          {selectedNode.type === "frame" && <section className="canvas-inspector-section"><h3>Frame</h3><label className="canvas-toggle-row"><input type="checkbox" checked={Boolean(selectedNode.clipContent)} onChange={(event) => patchSelected({ clipContent: event.target.checked })} /><span>Clip contents</span></label><label className="canvas-toggle-row"><input type="checkbox" checked={Boolean(selectedNode.layout)} onChange={toggleAutoLayout} /><span>Enable auto layout</span></label>{selectedNode.layout && <><div className="canvas-segmented"><button className={selectedNode.layout.direction === "row" ? "active" : ""} onClick={() => patchFrameLayout({ direction: "row" })}>Row</button><button className={selectedNode.layout.direction === "column" ? "active" : ""} onClick={() => patchFrameLayout({ direction: "column" })}>Column</button></div><div className="canvas-typography-fields"><label><span>Gap</span><input aria-label="Layout gap" type="number" min="0" value={selectedNode.layout.gap} onChange={(event) => patchFrameLayout({ gap: Math.max(0, Number(event.target.value)) })} /></label><label><span>Padding</span><input aria-label="Layout padding" type="number" min="0" value={selectedNode.layout.padding} onChange={(event) => patchFrameLayout({ padding: Math.max(0, Number(event.target.value)) })} /></label><label><span>Align</span><select aria-label="Layout alignment" value={selectedNode.layout.align} onChange={(event) => patchFrameLayout({ align: event.target.value as "start" | "center" | "end" })}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label><label><span>Distribute</span><select aria-label="Layout distribution" value={selectedNode.layout.justify} onChange={(event) => patchFrameLayout({ justify: event.target.value as "start" | "center" | "end" | "space-between" })}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option><option value="space-between">Space between</option></select></label><label><span>Sizing</span><select aria-label="Layout sizing" value={selectedNode.layout.sizing} onChange={(event) => patchFrameLayout({ sizing: event.target.value as "fixed" | "hug" })}><option value="fixed">Fixed</option><option value="hug">Hug contents</option></select></label>{selectedNode.layout.wrap && <label><span>Cross gap</span><input aria-label="Layout cross gap" type="number" min="0" value={selectedNode.layout.crossGap ?? selectedNode.layout.gap} onChange={(event) => patchFrameLayout({ crossGap: Math.max(0, Number(event.target.value)) })} /></label>}</div><label className="canvas-toggle-row"><input aria-label="Wrap auto-layout children" type="checkbox" checked={Boolean(selectedNode.layout.wrap)} disabled={selectedNode.layout.sizing === "hug"} onChange={(event) => patchFrameLayout({ wrap: event.target.checked, crossGap: event.target.checked ? selectedNode.layout!.crossGap ?? selectedNode.layout!.gap : selectedNode.layout!.crossGap })} /><span>Wrap children</span></label>{selectedNode.layout.sizing === "hug" && <small className="canvas-field-hint">Use fixed sizing to wrap children across rows or columns.</small>}</>}</section>}
          {selectedNode.type === "frame" && <section className="canvas-inspector-section"><h3>Layout grids</h3><div className="canvas-guide-actions"><button type="button" onClick={() => addFrameLayoutGrid("square")}><Plus size={12} /> Square</button><button type="button" onClick={() => addFrameLayoutGrid("columns")}><Plus size={12} /> Columns</button><button type="button" onClick={() => addFrameLayoutGrid("rows")}><Plus size={12} /> Rows</button></div>{selectedNode.layoutGrids?.map((grid) => <div className="canvas-guide-row" key={grid.id}><select aria-label={`Grid ${grid.id} type`} value={grid.type} onChange={(event) => patchFrameLayoutGrid(grid.id, { type: event.target.value as "square" | "columns" | "rows" })}><option value="square">Square</option><option value="columns">Columns</option><option value="rows">Rows</option></select><input aria-label={`Grid ${grid.type} size`} type="number" min="1" max={grid.type === "square" ? 10_000 : 100} value={grid.type === "square" ? grid.size ?? 8 : grid.count ?? 12} onChange={(event) => patchFrameLayoutGrid(grid.id, grid.type === "square" ? { size: Number(event.target.value) } : { count: Number(event.target.value) })} /><input aria-label={`Grid ${grid.type} color`} type="color" value={grid.color} onChange={(event) => patchFrameLayoutGrid(grid.id, { color: event.target.value })} /><button type="button" aria-label={`Delete ${grid.type} grid`} onClick={() => removeFrameLayoutGrid(grid.id)}><Trash size={11} /></button></div>)}</section>}
          {selectedNode.type === "component" && selectedComponent && <section className="canvas-inspector-section"><h3>Component properties</h3>{selectedComponent.nodes.map((source) => {
            const effective = effectivePrimitive(source, selectedNode);
            return <div className="canvas-component-property" key={source.id}>
              <strong>{source.name ?? nodeLabel(source)}</strong>
              {source.type === "text" && <label><span>Text</span><input value={effective.text ?? ""} onChange={(event) => patchComponentPrimitive(source.id, { text: event.target.value })} /></label>}
              {source.type !== "image" && <label className="canvas-color-field"><span>{source.type === "text" ? "Text color" : "Fill"}</span><span><input aria-label={`${source.name ?? nodeLabel(source)} color`} type="color" value={effective.color} onChange={(event) => patchComponentPrimitive(source.id, { color: event.target.value })} /><code>{effective.color.toUpperCase()}</code></span></label>}
              <label><span>Opacity</span><div className="canvas-range-field"><input aria-label={`${source.name ?? nodeLabel(source)} opacity`} type="range" min="0" max="100" value={Math.round((effective.opacity ?? 1) * 100)} onChange={(event) => patchComponentPrimitive(source.id, { opacity: Number(event.target.value) / 100 })} /><output>{Math.round((effective.opacity ?? 1) * 100)}%</output></div></label>
            </div>;
          })}{selectedNode.componentRole === "instance" && Object.keys(selectedNode.overrides ?? {}).length > 0 && <button className="canvas-reset-overrides" type="button" onClick={resetSelectedOverrides}>Reset overrides</button>}</section>}
          <section className="canvas-inspector-section canvas-prototype-section">
            <h3><span>Prototype</span><button type="button" disabled={usedPrototypeTriggers.size >= 3} onClick={addPrototypeInteraction}><Plus size={12} /> Interaction</button></h3>
            <label className="canvas-toggle-row"><input aria-label="Fix layer when prototype scrolls" type="checkbox" checked={Boolean(selectedNode.fixedInPrototype)} onChange={(event) => patchSelected({ fixedInPrototype: event.target.checked || undefined })} /><span>Fix when scrolling</span></label>
            <label><span>Smart animate key</span><input aria-label="Smart animate key" maxLength={240} placeholder={selectedNode.name ?? nodeLabel(selectedNode)} value={selectedNode.prototypeKey ?? ""} onChange={(event) => patchSelected({ prototypeKey: event.target.value || undefined })} /></label>
            <p className="canvas-field-hint">Matching keys work at any depth. Unique top-level names are matched automatically.</p>
            {(selectedNode.interactions ?? []).map((interaction, index) => <div className="canvas-prototype-interaction" key={interaction.id}>
              <header><strong>Interaction {index + 1}</strong><button type="button" aria-label={`Delete interaction ${index + 1}`} onClick={() => removePrototypeInteraction(interaction.id)}><Trash size={12} /></button></header>
              <div className="canvas-typography-fields">
                <label><span>Trigger</span><select aria-label={`Interaction ${index + 1} trigger`} value={interaction.trigger} onChange={(event) => {
                  const trigger = event.target.value as CanvasPrototypeInteraction["trigger"];
                  patchPrototypeInteraction(interaction.id, { trigger, delay: trigger === "after-delay" ? interaction.delay ?? 500 : undefined });
                }}><option value="click" disabled={interaction.trigger !== "click" && usedPrototypeTriggers.has("click")}>On click</option><option value="hover" disabled={interaction.trigger !== "hover" && usedPrototypeTriggers.has("hover")}>On hover</option><option value="after-delay" disabled={interaction.trigger !== "after-delay" && usedPrototypeTriggers.has("after-delay")}>After delay</option></select></label>
                <label><span>Action</span><select aria-label={`Interaction ${index + 1} action`} value={interaction.action} onChange={(event) => {
                  const action = event.target.value as CanvasPrototypeInteraction["action"];
                  const opensDestination = action === "navigate" || action === "open-overlay" || action === "toggle-overlay";
                  const opensOverlay = action === "open-overlay" || action === "toggle-overlay";
                  const destinationPageId = opensDestination ? interaction.destinationPageId ?? pages.find((page) => page.id !== activePageId)?.id : undefined;
                  patchPrototypeInteraction(interaction.id, {
                    action,
                    destinationPageId,
                    url: action === "open-url" ? interaction.url : undefined,
                    transition: opensDestination ? opensOverlay && interaction.transition?.type === "smart" ? { type: "dissolve", duration: interaction.transition.duration, easing: interaction.transition.easing } : interaction.transition ?? { type: "dissolve", duration: 180, easing: "ease-out" } : undefined,
                    overlay: opensOverlay ? interaction.overlay ?? { position: "center", background: "dim", closeOnOutsideClick: true } : undefined,
                  });
                }}><option value="navigate">Navigate to</option><option value="open-overlay">Open overlay</option><option value="toggle-overlay">Toggle overlay</option><option value="close-overlay">Close overlay</option><option value="back">Previous screen</option><option value="open-url">Open URL</option></select></label>
              </div>
              {interaction.trigger === "after-delay" && <label><span>Delay (ms)</span><input aria-label={`Interaction ${index + 1} delay`} type="number" min="0" max="60000" step="50" value={interaction.delay ?? 500} onChange={(event) => patchPrototypeInteraction(interaction.id, { delay: Math.max(0, Math.min(60_000, Number(event.target.value))) })} /></label>}
              {(interaction.action === "navigate" || interaction.action === "open-overlay" || interaction.action === "toggle-overlay") && <label><span>Destination</span><select aria-label={`Interaction ${index + 1} destination`} value={interaction.destinationPageId ?? ""} onChange={(event) => patchPrototypeInteraction(interaction.id, { destinationPageId: event.target.value || undefined })}><option value="">Choose a page</option>{pages.filter((page) => page.id !== activePageId).map((page) => <option value={page.id} key={page.id}>{page.name}</option>)}</select></label>}
              {interaction.action === "open-url" && <label><span>URL</span><input key={`${interaction.id}:${interaction.url ?? ""}`} aria-label={`Interaction ${index + 1} URL`} type="url" defaultValue={interaction.url ?? ""} placeholder="https://example.com" onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (!value) { patchPrototypeInteraction(interaction.id, { url: undefined }); return; }
                try {
                  const parsed = new URL(value);
                  if (parsed.protocol === "http:" || parsed.protocol === "https:") patchPrototypeInteraction(interaction.id, { url: parsed.toString() });
                  else event.currentTarget.value = interaction.url ?? "";
                } catch { event.currentTarget.value = interaction.url ?? ""; }
              }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>}
              {(interaction.action === "open-overlay" || interaction.action === "toggle-overlay") && <><div className="canvas-typography-fields">
                <label><span>Position</span><select aria-label={`Interaction ${index + 1} overlay position`} value={interaction.overlay?.position ?? "center"} onChange={(event) => patchPrototypeInteraction(interaction.id, { overlay: { ...(interaction.overlay ?? { background: "dim", closeOnOutsideClick: true }), position: event.target.value as NonNullable<CanvasPrototypeInteraction["overlay"]>["position"] } })}><option value="center">Center</option><option value="top-left">Top left</option><option value="top-center">Top</option><option value="top-right">Top right</option><option value="center-left">Left</option><option value="center-right">Right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom</option><option value="bottom-right">Bottom right</option></select></label>
                <label><span>Background</span><select aria-label={`Interaction ${index + 1} overlay background`} value={interaction.overlay?.background ?? "dim"} onChange={(event) => patchPrototypeInteraction(interaction.id, { overlay: { ...(interaction.overlay ?? { position: "center", closeOnOutsideClick: true }), background: event.target.value as "none" | "dim" } })}><option value="dim">Dim</option><option value="none">None</option></select></label>
              </div><label className="canvas-toggle-row"><input aria-label={`Interaction ${index + 1} close outside`} type="checkbox" checked={interaction.overlay?.closeOnOutsideClick ?? true} onChange={(event) => patchPrototypeInteraction(interaction.id, { overlay: { ...(interaction.overlay ?? { position: "center", background: "dim" }), closeOnOutsideClick: event.target.checked } })} /><span>Close when clicking outside</span></label></>}
              {(interaction.action === "navigate" || interaction.action === "open-overlay" || interaction.action === "toggle-overlay") && <div className="canvas-typography-fields">
                <label><span>Transition</span><select aria-label={`Interaction ${index + 1} transition`} value={interaction.transition?.type ?? "instant"} onChange={(event) => patchPrototypeInteraction(interaction.id, { transition: { ...(interaction.transition ?? { duration: 180, easing: "ease-out" }), type: event.target.value as NonNullable<CanvasPrototypeInteraction["transition"]>["type"], direction: event.target.value === "slide" ? interaction.transition?.direction ?? "left" : undefined } })}><option value="instant">Instant</option><option value="dissolve">Dissolve</option><option value="slide">Slide</option>{interaction.action === "navigate" && <option value="smart">Smart animate</option>}</select></label>
                {interaction.transition?.type !== "instant" && <label><span>Duration</span><input aria-label={`Interaction ${index + 1} duration`} type="number" min="0" max="5000" step="10" value={interaction.transition?.duration ?? 180} onChange={(event) => patchPrototypeInteraction(interaction.id, { transition: { ...(interaction.transition ?? { type: "dissolve", easing: "ease-out" }), duration: Math.max(0, Math.min(5000, Number(event.target.value))) } })} /></label>}
                {interaction.transition?.type === "slide" && <label><span>Direction</span><select aria-label={`Interaction ${index + 1} direction`} value={interaction.transition.direction ?? "left"} onChange={(event) => patchPrototypeInteraction(interaction.id, { transition: { ...interaction.transition!, direction: event.target.value as "left" | "right" | "up" | "down" } })}><option value="left">Left</option><option value="right">Right</option><option value="up">Up</option><option value="down">Down</option></select></label>}
              </div>}
            </div>)}
            {!selectedNode.interactions?.length && <p className="canvas-field-hint">Add a click, hover, or timed action, then play the prototype without leaving Studio.</p>}
          </section>
          <section className="canvas-inspector-section canvas-order-actions"><h3>Layer order</h3><div><button onClick={() => reorderSelected("forward")}>Forward</button><button onClick={() => reorderSelected("backward")}>Backward</button><button onClick={() => reorderSelected("front")}>To front</button><button onClick={() => reorderSelected("back")}>To back</button></div></section>
          {selectedNode.groupId && <section className="canvas-inspector-section"><button className="canvas-reset-overrides" type="button" onClick={ungroupSelected}>Ungroup selection</button></section>}
          {selectedNode.type !== "component" && selectedNode.type !== "boolean" && <section className="canvas-inspector-section"><button className="canvas-component-action" onClick={createComponentFromSelection}><DiamondsFour size={15} /><span><strong>Create component</strong><small>Reuse this layer as an asset</small></span></button></section>}
          <div className="canvas-inspector-actions"><button type="button" onClick={selectedNode.type === "component" && selectedNode.componentRole === "instance" ? detachSelectedInstance : duplicateSelected}>{selectedNode.type === "component" && selectedNode.componentRole === "instance" ? <><LinkBreak size={14} /> Detach</> : selectedNode.type === "component" ? <><DiamondsFour size={14} /> Instance</> : <><Copy size={14} /> Duplicate</>}</button><button type="button" onClick={toggleSelectedLock}>{selectedNode.locked ? <><LockSimpleOpen size={14} /> Unlock</> : <><LockSimple size={14} /> Lock</>}</button><button className="danger" type="button" onClick={removeSelected}><Trash size={14} /> Delete</button></div>
        </> : <div className="canvas-inspector-empty"><Selection size={22} /><strong>Nothing selected</strong><p>Shift-click or drag a marquee to select multiple layers.</p><label className="canvas-snap-setting"><input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapMode(event.target.checked)} /><span><GridFour size={14} /><span><strong>Snap to 8 px grid</strong><small>Hold Ctrl/⌘ to bypass all snapping</small></span></span></label></div>}
        <section className="canvas-inspector-section canvas-prototype-viewport-settings"><h3>Prototype viewport</h3><label className="canvas-toggle-row"><input aria-label="Enable prototype scrolling" type="checkbox" checked={Boolean(activePage?.prototypeViewport)} onChange={(event) => patchActivePrototypeViewport(event.target.checked ? { width: canvasFrame.width, height: Math.max(64, Math.min(canvasFrame.height, 844)), direction: "vertical", preservePosition: false } : undefined)} /><span>Enable scrolling</span></label>{activePage?.prototypeViewport && <><label><span>Direction</span><select aria-label="Prototype scroll direction" value={activePage.prototypeViewport.direction} onChange={(event) => {
          const direction = event.target.value as NonNullable<CanvasPage["prototypeViewport"]>["direction"];
          patchActivePrototypeViewport({ ...activePage.prototypeViewport!, direction, width: direction === "vertical" ? canvasFrame.width : activePage.prototypeViewport!.width, height: direction === "horizontal" ? canvasFrame.height : activePage.prototypeViewport!.height });
        }}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="both">Both directions</option></select></label><div className="canvas-property-grid"><label><span>W</span><input aria-label="Prototype viewport width" type="number" min="64" max={canvasFrame.width} disabled={activePage.prototypeViewport.direction === "vertical"} value={Math.round(activePage.prototypeViewport.width)} onChange={(event) => patchActivePrototypeViewport({ ...activePage.prototypeViewport!, width: Math.min(canvasFrame.width, Math.max(64, Number(event.target.value))) })} /></label><label><span>H</span><input aria-label="Prototype viewport height" type="number" min="64" max={canvasFrame.height} disabled={activePage.prototypeViewport.direction === "horizontal"} value={Math.round(activePage.prototypeViewport.height)} onChange={(event) => patchActivePrototypeViewport({ ...activePage.prototypeViewport!, height: Math.min(canvasFrame.height, Math.max(64, Number(event.target.value))) })} /></label></div><label className="canvas-toggle-row"><input aria-label="Remember prototype scroll position" type="checkbox" checked={activePage.prototypeViewport.preservePosition} onChange={(event) => patchActivePrototypeViewport({ ...activePage.prototypeViewport!, preservePosition: event.target.checked })} /><span>Remember position when returning</span></label><p className="canvas-field-hint">The page size is the full scrollable content. Fixed layers stay pinned to this viewport.</p></>}</section>
        <section className="canvas-inspector-section canvas-page-settings"><h3>Page</h3><label><span>Preset</span><select aria-label="Page size preset" value={currentPagePreset} onChange={(event) => {
          const preset = canvasPagePresets.find((candidate) => candidate.id === event.target.value);
          if (preset) resizeActivePageFrame(preset.width, preset.height, true);
        }}><option value="custom">Custom</option>{canvasPagePresets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {preset.width} × {preset.height}</option>)}</select></label><div className="canvas-property-grid"><label><span>W</span><input aria-label="Page width" type="number" min="64" max="100000" value={Math.round(canvasFrame.width)} onChange={(event) => resizeActivePageFrame(Number(event.target.value), canvasFrame.height)} /></label><label><span>H</span><input aria-label="Page height" type="number" min="64" max="100000" value={Math.round(canvasFrame.height)} onChange={(event) => resizeActivePageFrame(canvasFrame.width, Number(event.target.value))} /></label></div><button className="canvas-reset-overrides" type="button" onClick={() => resizeActivePageFrame(canvasFrame.height, canvasFrame.width, true)}>Swap orientation</button><label className="canvas-color-field"><span>Background</span><span><input aria-label="Page background" type="color" value={pageAppState.viewBackgroundColor} onChange={(event) => patchWorkspaceAppState({ viewBackgroundColor: event.target.value })} /><code>{pageAppState.viewBackgroundColor.toUpperCase()}</code></span></label></section>
        <section className="canvas-inspector-section canvas-guide-settings"><h3>Rulers & guides</h3><div className="canvas-guide-actions"><button type="button" onClick={() => addRulerGuide("x")}><Plus size={12} /> Vertical</button><button type="button" onClick={() => addRulerGuide("y")}><Plus size={12} /> Horizontal</button></div><label className="canvas-toggle-row"><input type="checkbox" checked={rulersVisible} onChange={(event) => patchWorkspaceAppState({ rulersVisible: event.target.checked })} /><span>Show rulers</span></label><label className="canvas-toggle-row"><input type="checkbox" checked={guidesVisible} onChange={(event) => patchWorkspaceAppState({ guidesVisible: event.target.checked })} /><span>Show guides</span></label>{rulerGuides.map((guide) => <div className="canvas-guide-row" key={guide.id}><select aria-label={`Guide ${guide.axis} axis`} value={guide.axis} onChange={(event) => patchRulerGuide(guide.id, { axis: event.target.value as "x" | "y" })}><option value="x">X</option><option value="y">Y</option></select><input aria-label={`Guide ${guide.axis} position`} type="number" value={Math.round(guide.position)} onChange={(event) => patchRulerGuide(guide.id, { position: Number(event.target.value) })} /><input aria-label={`Guide ${guide.axis} color`} type="color" value={guide.color ?? "#2563eb"} onChange={(event) => patchRulerGuide(guide.id, { color: event.target.value })} /><button type="button" aria-label={`Delete guide ${guide.axis} ${guide.position}`} onClick={() => removeRulerGuide(guide.id)}><Trash size={11} /></button></div>)}</section>
        <section className="canvas-export-actions"><label className="canvas-toggle-row"><input type="checkbox" checked={transparentExport} onChange={(event) => setTransparentExport(event.target.checked)} /><span>Transparent export</span></label><button type="button" onClick={() => exportSvg(false)}><DownloadSimple size={14} /> SVG</button><button type="button" onClick={() => void exportPng(false)}><DownloadSimple size={14} /> PNG</button>{selectedBounds && <><button type="button" onClick={() => exportSvg(true)}><DownloadSimple size={14} /> SVG selection</button><button type="button" onClick={() => void exportPng(true)}><DownloadSimple size={14} /> PNG selection</button></>}</section>
      </aside>
    </div>
  );
}
