import { ArrowLeft, ArrowSquareOut, CaretLeft, Play, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderCanvasSvg } from "../../../shared/artifact-export";
import type { CanvasArtifactContent, CanvasElement, CanvasPage, CanvasPrototypeFlow, CanvasPrototypeInteraction, CanvasPrototypeOverlay } from "../../../shared/types";
import { nodeLabel } from "./canvas-model";
import { canvasPrototypeLayerMatches } from "./canvas-prototype";

interface CanvasPrototypePreviewProps {
  title: string;
  content: CanvasArtifactContent;
  pages: CanvasPage[];
  flows: CanvasPrototypeFlow[];
  initialFlowId?: string;
  onClose: () => void;
}

interface PrototypeOverlayInstance {
  id: string;
  pageId: string;
  options: CanvasPrototypeOverlay;
  transition?: CanvasPrototypeInteraction["transition"];
}

const defaultOverlay: CanvasPrototypeOverlay = { position: "center", background: "dim", closeOnOutsideClick: true };

function interactionFor(node: CanvasElement, trigger: CanvasPrototypeInteraction["trigger"]): CanvasPrototypeInteraction | undefined {
  return node.interactions?.find((interaction) => interaction.trigger === trigger);
}

function transitionClass(transition?: CanvasPrototypeInteraction["transition"]): string {
  const type = transition?.type ?? "instant";
  const direction = transition?.direction ?? "left";
  if (type === "smart") return "dissolve";
  return type === "slide" ? `slide-${direction}` : type;
}

function validExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function hotspotRect(node: CanvasElement, elements: CanvasElement[]): { x: number; y: number; width: number; height: number } | null {
  let rect = { x: node.x, y: node.y, width: node.width, height: node.height };
  const intersect = (boundary: CanvasElement): boolean => {
    const left = Math.max(rect.x, boundary.x);
    const top = Math.max(rect.y, boundary.y);
    const right = Math.min(rect.x + rect.width, boundary.x + boundary.width);
    const bottom = Math.min(rect.y + rect.height, boundary.y + boundary.height);
    if (right <= left || bottom <= top) return false;
    rect = { x: left, y: top, width: right - left, height: bottom - top };
    return true;
  };
  const byId = new Map(elements.map((element) => [element.id, element]));
  const visited = new Set<string>();
  let parentId = node.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent || parent.hidden) return null;
    if (parent.type !== "component" && parent.type === "frame" && parent.clipContent && !intersect(parent)) return null;
    parentId = parent.parentId;
  }
  if (node.type !== "component" && node.maskId) {
    const mask = byId.get(node.maskId);
    if (!mask || mask.hidden || !intersect(mask)) return null;
  }
  return rect;
}

function timedInteractions(page: CanvasPage): CanvasPrototypeInteraction[] {
  return page.elements.flatMap((node) => {
    if (node.hidden || !hotspotRect(node, page.elements)) return [];
    return node.interactions?.filter((interaction) => interaction.trigger === "after-delay") ?? [];
  });
}

function pageSvg(content: CanvasArtifactContent, page: CanvasPage, title: string, elementIds?: string[], transparent = false): string {
  return renderCanvasSvg({ ...content, frame: page.frame, elements: page.elements, activePageId: page.id, appState: page.appState }, `${title} — ${page.name}`, { elementIds, transparent });
}

function svgSource(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function CanvasPrototypePreview({ title, content, pages, flows, initialFlowId, onClose }: CanvasPrototypePreviewProps): React.JSX.Element {
  const initialFlow = flows.find((flow) => flow.id === initialFlowId) ?? flows[0];
  const initialId = pages.some((page) => page.id === initialFlow?.startPageId) ? initialFlow.startPageId : pages[0]?.id;
  const [activeFlowId, setActiveFlowId] = useState(initialFlow?.id ?? "");
  const [history, setHistory] = useState<string[]>(initialId ? [initialId] : []);
  const [transition, setTransition] = useState<CanvasPrototypeInteraction["transition"]>();
  const [transitionSourcePageId, setTransitionSourcePageId] = useState<string>();
  const [overlays, setOverlays] = useState<PrototypeOverlayInstance[]>([]);
  const dialogRef = useRef<HTMLElement>(null);
  const headerBackRef = useRef<HTMLButtonElement>(null);
  const overlayLayerRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef(overlays);
  const overlayFocusRef = useRef(new Map<string, HTMLElement>());
  const executedTimersRef = useRef(new Set<string>());
  overlaysRef.current = overlays;
  const activePageId = history.at(-1);
  const page = pages.find((candidate) => candidate.id === activePageId) ?? pages[0];
  const activeFlow = flows.find((flow) => flow.id === activeFlowId) ?? flows[0];
  const topOverlay = overlays.at(-1);
  const overlayPage = topOverlay ? pages.find((candidate) => candidate.id === topOverlay.pageId) : undefined;

  const focusPreview = useCallback(() => window.setTimeout(() => dialogRef.current?.focus(), 0), []);
  const closeTopOverlay = useCallback(() => {
    const closing = overlaysRef.current.at(-1);
    if (!closing) return;
    const returnFocus = overlayFocusRef.current.get(closing.id);
    overlayFocusRef.current.delete(closing.id);
    setOverlays((current) => current.slice(0, -1));
    window.setTimeout(() => (returnFocus?.isConnected ? returnFocus : dialogRef.current)?.focus(), 0);
  }, []);

  const run = useCallback((interaction: CanvasPrototypeInteraction): void => {
    if (interaction.action === "close-overlay") { closeTopOverlay(); return; }
    if (interaction.action === "back") {
      executedTimersRef.current.clear();
      setTransition(undefined);
      setTransitionSourcePageId(undefined);
      setOverlays([]);
      setHistory((current) => current.length > 1 ? current.slice(0, -1) : current);
      focusPreview();
      return;
    }
    if (interaction.action === "open-url") {
      const url = validExternalUrl(interaction.url);
      if (url) void window.khadim.shell.openExternal(url);
      return;
    }
    if (!interaction.destinationPageId || !pages.some((candidate) => candidate.id === interaction.destinationPageId)) return;
    if (interaction.action === "open-overlay" || interaction.action === "toggle-overlay") {
      if (interaction.action === "toggle-overlay" && overlaysRef.current.at(-1)?.pageId === interaction.destinationPageId) {
        closeTopOverlay();
        return;
      }
      const instance: PrototypeOverlayInstance = { id: crypto.randomUUID(), pageId: interaction.destinationPageId, options: interaction.overlay ?? defaultOverlay, transition: interaction.transition };
      if (document.activeElement instanceof HTMLElement) overlayFocusRef.current.set(instance.id, document.activeElement);
      setOverlays((current) => [...current, instance]);
      return;
    }
    executedTimersRef.current.clear();
    setTransition(interaction.transition);
    setTransitionSourcePageId(page?.id);
    setOverlays([]);
    setHistory((current) => [...current, interaction.destinationPageId!]);
    focusPreview();
  }, [closeTopOverlay, focusPreview, page?.id, pages]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layout = dialog?.closest(".canvas-layout");
    const stage = dialog?.parentElement;
    const inertTargets = [
      ...Array.from(layout?.children ?? []).filter((element) => element !== stage),
      ...Array.from(stage?.children ?? []).filter((element) => element !== dialog),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    const priorInert = inertTargets.map((element) => element.inert);
    inertTargets.forEach((element) => { element.inert = true; });
    dialog?.focus();
    return () => {
      inertTargets.forEach((element, index) => { element.inert = priorInert[index]; });
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (!topOverlay) return;
    const timeout = window.setTimeout(() => {
      const firstHotspot = overlayLayerRef.current?.querySelector<HTMLElement>(".canvas-prototype-hotspot");
      (firstHotspot ?? headerBackRef.current)?.focus();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [topOverlay?.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (overlaysRef.current.length) closeTopOverlay(); else onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        if (overlaysRef.current.length) { event.preventDefault(); closeTopOverlay(); return; }
        if (history.length > 1) {
          event.preventDefault();
          executedTimersRef.current.clear();
          setTransition(undefined);
          setTransitionSourcePageId(undefined);
          setHistory((current) => current.slice(0, -1));
          focusPreview();
        }
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((element) => !element.closest("[inert]"));
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTopOverlay, focusPreview, history.length, onClose]);

  useEffect(() => {
    const timedPage = overlayPage ?? page;
    if (!timedPage) return;
    const layerKey = topOverlay ? `overlay:${topOverlay.id}` : `flow:${activeFlowId}:page:${history.length}:${timedPage.id}`;
    const timers = timedInteractions(timedPage).flatMap((interaction) => {
      const key = `${layerKey}:${interaction.id}`;
      if (executedTimersRef.current.has(key)) return [];
      return [window.setTimeout(() => {
        executedTimersRef.current.add(key);
        run(interaction);
      }, interaction.delay ?? 0)];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeFlowId, history.length, overlayPage, page, run, topOverlay]);

  const svg = useMemo(() => page ? pageSvg(content, page, title) : "", [content, page, title]);
  const overlaySvg = useMemo(() => overlayPage ? pageSvg(content, overlayPage, title) : "", [content, overlayPage, title]);
  const transitionSourcePage = pages.find((candidate) => candidate.id === transitionSourcePageId);
  const smartMatches = useMemo(() => transition?.type === "smart" ? canvasPrototypeLayerMatches(transitionSourcePage, page) : [], [page, transition?.type, transitionSourcePage]);
  const smartActive = transition?.type === "smart" && smartMatches.length > 0;
  const smartDestinationIds = useMemo(() => new Set(smartMatches.flatMap((match) => match.destinationElementIds)), [smartMatches]);
  const smartSourceIds = useMemo(() => new Set(smartMatches.flatMap((match) => match.sourceElementIds)), [smartMatches]);
  const smartDestinationBaseSvg = useMemo(() => smartActive && page ? pageSvg(content, page, title, page.elements.filter((element) => !smartDestinationIds.has(element.id)).map((element) => element.id)) : "", [content, page, smartActive, smartDestinationIds, title]);
  const smartSourceBaseSvg = useMemo(() => smartActive && transitionSourcePage ? pageSvg(content, transitionSourcePage, title, transitionSourcePage.elements.filter((element) => !smartSourceIds.has(element.id)).map((element) => element.id)) : "", [content, smartActive, smartSourceIds, title, transitionSourcePage]);
  const smartLayers = useMemo(() => smartActive && page && transitionSourcePage ? smartMatches.map((match) => ({
    ...match,
    sourceSvg: pageSvg(content, transitionSourcePage, title, match.sourceElementIds, true),
    destinationSvg: pageSvg(content, page, title, match.destinationElementIds, true),
  })) : [], [content, page, smartActive, smartMatches, title, transitionSourcePage]);

  function switchFlow(flowId: string): void {
    const flow = flows.find((candidate) => candidate.id === flowId);
    if (!flow || !pages.some((candidate) => candidate.id === flow.startPageId)) return;
    executedTimersRef.current.clear();
    setActiveFlowId(flow.id);
    setHistory([flow.startPageId]);
    setTransition(undefined);
    setTransitionSourcePageId(undefined);
    setOverlays([]);
    focusPreview();
  }

  function smartLayerStyle(source: CanvasElement, destination: CanvasElement, role: "source" | "destination"): React.CSSProperties {
    if (!page) return {};
    const frame = page.frame;
    const from = role === "source" ? source : destination;
    const to = role === "source" ? destination : source;
    const deltaX = (to.x + to.width / 2 - from.x - from.width / 2) / frame.width * 100;
    const deltaY = (to.y + to.height / 2 - from.y - from.height / 2) / frame.height * 100;
    const scaleX = to.width / Math.max(1, from.width);
    const scaleY = to.height / Math.max(1, from.height);
    const rotation = (to.rotation ?? 0) - (from.rotation ?? 0);
    return {
      transformOrigin: `${(from.x + from.width / 2) / frame.width * 100}% ${(from.y + from.height / 2) / frame.height * 100}%`,
      "--smart-transform": `translate(${deltaX}%, ${deltaY}%) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
    } as React.CSSProperties;
  }

  function renderHotspots(targetPage: CanvasPage, keyPrefix: string): React.ReactNode {
    return targetPage.elements.filter((node) => !node.hidden && node.interactions?.length).map((node) => {
      const click = interactionFor(node, "click");
      const hover = interactionFor(node, "hover");
      const interaction = click ?? hover;
      if (!interaction) return null;
      const rect = hotspotRect(node, targetPage.elements);
      if (!rect) return null;
      return <button
        className="canvas-prototype-hotspot"
        key={`${keyPrefix}:${node.id}`}
        type="button"
        aria-label={`Run ${node.name ?? nodeLabel(node)} ${interaction.trigger} interaction`}
        style={{
          left: `${rect.x / targetPage.frame.width * 100}%`,
          top: `${rect.y / targetPage.frame.height * 100}%`,
          width: `${rect.width / targetPage.frame.width * 100}%`,
          height: `${rect.height / targetPage.frame.height * 100}%`,
          transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
        }}
        onClick={() => run(click ?? hover!)}
        onPointerEnter={hover ? () => run(hover) : undefined}
        onFocus={hover ? () => run(hover) : undefined}
      ><span>{interaction.action === "back" ? <ArrowLeft size={12} /> : interaction.action === "open-url" ? <ArrowSquareOut size={12} /> : interaction.action === "close-overlay" ? <X size={12} /> : <Play size={12} />}</span></button>;
    });
  }

  if (!page) return <div className="canvas-prototype-preview"><button type="button" onClick={onClose}>Close preview</button></div>;
  const overlayWidth = overlayPage ? Math.min(92, Math.max(16, overlayPage.frame.width / page.frame.width * 100)) : 0;

  return (
    <section ref={dialogRef} className="canvas-prototype-preview" role="dialog" aria-modal="true" aria-label="Canvas prototype preview" aria-describedby="canvas-prototype-help" tabIndex={-1}>
      <header>
        <span><Play weight="fill" size={13} /><strong>{overlayPage ? `${page.name} · ${overlayPage.name}` : page.name}</strong><small>{overlayPage ? "Overlay open" : history.length > 1 ? `${history.length - 1} screens deep` : "Starting screen"}</small></span>
        <div>
          {flows.length > 1 && <select aria-label="Preview prototype flow" value={activeFlowId} onChange={(event) => switchFlow(event.target.value)}>{flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select>}
          <button ref={headerBackRef} type="button" aria-label={overlayPage ? "Close prototype overlay" : "Previous prototype screen"} disabled={!overlayPage && history.length <= 1} onClick={() => {
            if (overlayPage) { closeTopOverlay(); return; }
            executedTimersRef.current.clear();
            setTransition(undefined);
            setTransitionSourcePageId(undefined);
            setHistory((current) => current.slice(0, -1));
            focusPreview();
          }}><CaretLeft size={15} /></button>
          <button type="button" aria-label="Close prototype preview" onClick={onClose}><X size={15} /></button>
        </div>
      </header>
      <output className="sr-only" aria-live="polite" aria-atomic="true">{activeFlow?.name ?? "Prototype"}: {page.name}{overlayPage ? `. ${overlayPage.name} overlay open.` : "."}</output>
      <div className="canvas-prototype-matte">
        <div className="canvas-prototype-stage" style={{ aspectRatio: `${page.frame.width} / ${page.frame.height}` }}>
          <div
            className={`canvas-prototype-screen ${smartActive ? "smart" : transitionClass(transition)}`}
            inert={Boolean(topOverlay)}
            key={`${page.id}:${history.length}`}
            style={{ background: page.appState.viewBackgroundColor, animationDuration: transition ? `${transition.duration}ms` : undefined, animationTimingFunction: transition?.easing, "--prototype-duration": transition ? `${transition.duration}ms` : undefined, "--prototype-easing": transition?.easing } as React.CSSProperties}
          >
            {smartActive ? <>
              <img className="canvas-prototype-smart-base" src={svgSource(smartDestinationBaseSvg)} alt={`${page.name} prototype screen`} draggable={false} />
              <img className="canvas-prototype-smart-source-base" src={svgSource(smartSourceBaseSvg)} alt="" aria-hidden="true" draggable={false} />
              {smartLayers.map((match) => <span className="canvas-prototype-smart-pair" aria-hidden="true" key={match.key}>
                <img className="canvas-prototype-smart-source" src={svgSource(match.sourceSvg)} alt="" draggable={false} style={smartLayerStyle(match.source, match.destination, "source")} />
                <img className="canvas-prototype-smart-destination" src={svgSource(match.destinationSvg)} alt="" draggable={false} style={smartLayerStyle(match.source, match.destination, "destination")} />
              </span>)}
            </> : <img src={svgSource(svg)} alt={`${page.name} prototype screen`} draggable={false} />}
            {renderHotspots(page, "page")}
          </div>
          {topOverlay && overlayPage && <div ref={overlayLayerRef} className={`canvas-prototype-overlay-layer ${topOverlay.options.position} ${topOverlay.options.background}`}>
            {topOverlay.options.closeOnOutsideClick
              ? <button className="canvas-prototype-overlay-dismiss" type="button" aria-label={`Close ${overlayPage.name} overlay`} onClick={closeTopOverlay} />
              : <span className="canvas-prototype-overlay-dismiss" aria-hidden="true" />}
            <div
              className={`canvas-prototype-overlay-screen ${transitionClass(topOverlay.transition)}`}
              role="region"
              aria-label={`${overlayPage.name} overlay`}
              style={{ width: `${overlayWidth}%`, aspectRatio: `${overlayPage.frame.width} / ${overlayPage.frame.height}`, background: overlayPage.appState.viewBackgroundColor, animationDuration: topOverlay.transition ? `${topOverlay.transition.duration}ms` : undefined, animationTimingFunction: topOverlay.transition?.easing }}
            >
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(overlaySvg)}`} alt={`${overlayPage.name} overlay screen`} draggable={false} />
              {renderHotspots(overlayPage, `overlay:${topOverlay.id}`)}
            </div>
          </div>}
        </div>
      </div>
      <p id="canvas-prototype-help">Activate highlighted hotspots to run interactions. Escape closes the active overlay, then returns to the editor.</p>
    </section>
  );
}
