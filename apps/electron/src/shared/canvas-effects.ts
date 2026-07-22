import type { CanvasEffectStyle, CanvasPrimitiveElement, CanvasShadow, CanvasShadowEffect } from "./types";

type ShadowSource = Pick<CanvasPrimitiveElement, "id" | "shadow" | "shadows"> | Pick<CanvasEffectStyle, "id" | "shadow" | "shadows">;

/** Materializes the authoritative stack while keeping legacy single-shadow documents readable. */
export function canvasElementShadows(source: ShadowSource): CanvasShadowEffect[] {
  if (source.shadows !== undefined) return source.shadows;
  if (!source.shadow) return [];
  return [{ ...source.shadow, blur: source.shadow.blur * 2, id: `legacy-shadow-${source.id}`, visible: true, type: "drop", spread: 0 }];
}

/** Mirrors the topmost visible drop shadow for older readers. Inner-only stacks have no legacy equivalent. */
export function canvasLegacyShadowMirror(shadows: CanvasShadowEffect[]): CanvasShadow | undefined {
  for (let index = shadows.length - 1; index >= 0; index -= 1) {
    const shadow = shadows[index];
    if (shadow.visible && shadow.type === "drop") {
      const { color, x, y, opacity } = shadow;
      const blur = shadow.id.startsWith("legacy-shadow-") ? shadow.blur / 2 : shadow.blur;
      return { color, x, y, blur, opacity };
    }
  }
  return undefined;
}

/** Conservative symmetric padding for culling and selection exports. Inner shadows never expand bounds. */
export function canvasShadowOutset(source: ShadowSource): number {
  return canvasElementShadows(source).reduce((maximum, shadow) => {
    if (!shadow.visible || shadow.type !== "drop") return maximum;
    return Math.max(maximum, Math.max(0, shadow.spread) + shadow.blur + Math.abs(shadow.x) + Math.abs(shadow.y));
  }, 0);
}

export function canvasShadowFilterId(id: string): string {
  const encoded = Array.from(id, (character) => character.codePointAt(0)!.toString(16)).join("-");
  return `canvas-shadow-${encoded}`;
}

function shadowStage(effect: CanvasShadowEffect, index: number, scale: number): { markup: string; result: string } {
  const base = `canvas-shadow-stage-${index}`;
  const spread = Math.abs(effect.spread * scale);
  const blur = Math.max(0, effect.blur * scale / 2);
  const x = effect.x * scale;
  const y = effect.y * scale;
  const color = /^#[0-9a-f]{3,8}$/i.test(effect.color) ? effect.color : "#000000";
  if (effect.type === "drop") {
    const spreadResult = `${base}-spread`;
    const spreadMarkup = spread > 0 ? `<feMorphology in="SourceAlpha" operator="${effect.spread >= 0 ? "dilate" : "erode"}" radius="${spread}" result="${spreadResult}"/>` : "";
    const input = spreadMarkup ? spreadResult : "SourceAlpha";
    return {
      result: base,
      markup: `${spreadMarkup}<feGaussianBlur in="${input}" stdDeviation="${blur}" result="${base}-blur"/><feOffset in="${base}-blur" dx="${x}" dy="${y}" result="${base}-offset"/><feFlood flood-color="${color}" flood-opacity="${Math.min(1, Math.max(0, effect.opacity))}" result="${base}-color"/><feComposite in="${base}-color" in2="${base}-offset" operator="in" result="${base}"/>`,
    };
  }
  const spreadResult = `${base}-spread`;
  const spreadMarkup = spread > 0 ? `<feMorphology in="SourceAlpha" operator="${effect.spread >= 0 ? "erode" : "dilate"}" radius="${spread}" result="${spreadResult}"/>` : "";
  const input = spreadMarkup ? spreadResult : "SourceAlpha";
  return {
    result: base,
    markup: `${spreadMarkup}<feComponentTransfer in="${input}" result="${base}-inverse"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="${base}-inverse" stdDeviation="${blur}" result="${base}-blur"/><feOffset in="${base}-blur" dx="${x}" dy="${y}" result="${base}-offset"/><feComposite in="${base}-offset" in2="SourceAlpha" operator="in" result="${base}-mask"/><feFlood flood-color="${color}" flood-opacity="${Math.min(1, Math.max(0, effect.opacity))}" result="${base}-color"/><feComposite in="${base}-color" in2="${base}-mask" operator="in" result="${base}"/>`,
  };
}

/** SVG filter shared by editor-independent exports and prototype markup. */
export function canvasShadowFilterDefinition(
  source: ShadowSource,
  id: string,
  scale = 1,
  bounds?: { x: number; y: number; width: number; height: number },
  sourceOutset = 0,
): string {
  const effects = canvasElementShadows(source).filter((shadow) => shadow.visible);
  if (!effects.length) return "";
  const stages = effects.map((effect, index) => ({ effect, ...shadowStage(effect, index, scale) }));
  const drops = stages.filter(({ effect }) => effect.type === "drop");
  const inners = stages.filter(({ effect }) => effect.type === "inner");
  const merge = [...drops, { result: "SourceGraphic" }, ...inners].map(({ result }) => `<feMergeNode in="${result}"/>`).join("");
  const signalOutset = effects.reduce((maximum, shadow) => Math.max(maximum, Math.abs(shadow.spread) + shadow.blur * 2 + Math.abs(shadow.x) + Math.abs(shadow.y)), 0) * scale;
  const outset = sourceOutset + Math.max(canvasShadowOutset(source) * scale, signalOutset);
  const region = bounds
    ? ` filterUnits="userSpaceOnUse" x="${bounds.x - outset}" y="${bounds.y - outset}" width="${Math.max(1, bounds.width + outset * 2)}" height="${Math.max(1, bounds.height + outset * 2)}"`
    : ' x="-200%" y="-200%" width="500%" height="500%"';
  return `<filter id="${id}"${region} color-interpolation-filters="sRGB">${stages.map(({ markup }) => markup).join("")}<feMerge>${merge}</feMerge></filter>`;
}
