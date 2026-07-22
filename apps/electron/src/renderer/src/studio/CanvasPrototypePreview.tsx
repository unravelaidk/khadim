import { ArrowLeft, ArrowSquareOut, CaretLeft, Play, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderCanvasSvg } from "../../../shared/artifact-export";
import type { CanvasArtifactContent, CanvasElement, CanvasPage, CanvasPrototypeInteraction } from "../../../shared/types";
import { nodeLabel } from "./canvas-model";

interface CanvasPrototypePreviewProps {
  title: string;
  content: CanvasArtifactContent;
  pages: CanvasPage[];
  startPageId: string;
  onClose: () => void;
}

function interactionFor(node: CanvasElement, trigger: CanvasPrototypeInteraction["trigger"]): CanvasPrototypeInteraction | undefined {
  return node.interactions?.find((interaction) => interaction.trigger === trigger);
}

function transitionClass(transition?: CanvasPrototypeInteraction["transition"]): string {
  const type = transition?.type ?? "instant";
  const direction = transition?.direction ?? "left";
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

export function CanvasPrototypePreview({ title, content, pages, startPageId, onClose }: CanvasPrototypePreviewProps): React.JSX.Element {
  const initialId = pages.some((page) => page.id === startPageId) ? startPageId : pages[0]?.id;
  const [history, setHistory] = useState<string[]>(initialId ? [initialId] : []);
  const [transition, setTransition] = useState<CanvasPrototypeInteraction["transition"]>();
  const dialogRef = useRef<HTMLElement>(null);
  const activePageId = history.at(-1);
  const page = pages.find((candidate) => candidate.id === activePageId) ?? pages[0];

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
    const dialog = dialogRef.current;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowLeft" && history.length > 1) { event.preventDefault(); setTransition(undefined); setHistory((current) => current.slice(0, -1)); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history.length, onClose]);

  const svg = useMemo(() => page ? renderCanvasSvg({
    ...content,
    frame: page.frame,
    elements: page.elements,
    activePageId: page.id,
    appState: page.appState,
  }, `${title} — ${page.name}`) : "", [content, page, title]);

  function run(interaction: CanvasPrototypeInteraction): void {
    if (interaction.action === "back") {
      setTransition(undefined);
      setHistory((current) => current.length > 1 ? current.slice(0, -1) : current);
      return;
    }
    if (interaction.action === "open-url") {
      const url = validExternalUrl(interaction.url);
      if (url) void window.khadim.shell.openExternal(url);
      return;
    }
    if (!interaction.destinationPageId || !pages.some((candidate) => candidate.id === interaction.destinationPageId)) return;
    setTransition(interaction.transition);
    setHistory((current) => [...current, interaction.destinationPageId!]);
  }

  if (!page) return <div className="canvas-prototype-preview"><button type="button" onClick={onClose}>Close preview</button></div>;

  return (
    <section ref={dialogRef} className="canvas-prototype-preview" role="dialog" aria-modal="true" aria-label="Canvas prototype preview" aria-describedby="canvas-prototype-help" tabIndex={-1}>
      <header>
        <span><Play weight="fill" size={13} /><strong>{page.name}</strong><small>{history.length > 1 ? `${history.length - 1} screens deep` : "Starting screen"}</small></span>
        <div>
          <button type="button" aria-label="Previous prototype screen" disabled={history.length <= 1} onClick={() => { setTransition(undefined); setHistory((current) => current.slice(0, -1)); }}><CaretLeft size={15} /></button>
          <button type="button" aria-label="Close prototype preview" onClick={onClose}><X size={15} /></button>
        </div>
      </header>
      <div className="canvas-prototype-matte">
        <div
          className={`canvas-prototype-screen ${transitionClass(transition)}`}
          key={`${page.id}:${history.length}`}
          style={{ aspectRatio: `${page.frame.width} / ${page.frame.height}`, background: page.appState.viewBackgroundColor, animationDuration: transition ? `${transition.duration}ms` : undefined, animationTimingFunction: transition?.easing }}
        >
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`${page.name} prototype screen`} draggable={false} />
          {page.elements.filter((node) => !node.hidden && node.interactions?.length).map((node) => {
            const click = interactionFor(node, "click");
            const hover = interactionFor(node, "hover");
            const interaction = click ?? hover;
            if (!interaction) return null;
            const rect = hotspotRect(node, page.elements);
            if (!rect) return null;
            return <button
              className="canvas-prototype-hotspot"
              key={node.id}
              type="button"
              aria-label={`Run ${node.name ?? nodeLabel(node)} ${interaction.trigger} interaction`}
              style={{
                left: `${rect.x / page.frame.width * 100}%`,
                top: `${rect.y / page.frame.height * 100}%`,
                width: `${rect.width / page.frame.width * 100}%`,
                height: `${rect.height / page.frame.height * 100}%`,
                transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
              }}
              onClick={() => run(click ?? hover!)}
              onPointerEnter={hover ? () => run(hover) : undefined}
              onFocus={hover ? () => run(hover) : undefined}
            ><span>{interaction.action === "back" ? <ArrowLeft size={12} /> : interaction.action === "open-url" ? <ArrowSquareOut size={12} /> : <Play size={12} />}</span></button>;
          })}
        </div>
      </div>
      <p id="canvas-prototype-help">Activate highlighted hotspots to run interactions. Press Escape to return to the editor.</p>
    </section>
  );
}
