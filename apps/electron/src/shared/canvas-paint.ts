import type { CanvasLinearGradient } from "./types";

export function canvasGradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) / 2;
  const y = Math.sin(radians) / 2;
  return { x1: .5 - x, y1: .5 - y, x2: .5 + x, y2: .5 + y };
}

export function normalizedCanvasGradient(gradient: CanvasLinearGradient): CanvasLinearGradient {
  return {
    type: "linear",
    angle: ((gradient.angle % 360) + 360) % 360,
    stops: gradient.stops
      .map((stop) => ({ ...stop, offset: Math.min(1, Math.max(0, stop.offset)), opacity: stop.opacity === undefined ? undefined : Math.min(1, Math.max(0, stop.opacity)) }))
      .sort((first, second) => first.offset - second.offset),
  };
}
