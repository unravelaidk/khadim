/**
 * Webview zoom controls via keyboard shortcuts.
 * Cmd/Ctrl +/- to zoom, Cmd/Ctrl+0 to reset.
 */
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.3;
const STEP = 0.15;

let currentZoom = 1;

const isMac = navigator.platform.toUpperCase().includes("MAC");

function clamp(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

function applyZoom(next: number) {
  currentZoom = next;
  (document.body.style as any).zoom = `${next}`;
}

export function initWebviewZoom() {
  window.addEventListener("keydown", (e) => {
    if (!(isMac ? e.metaKey : e.ctrlKey)) return;

    let next = currentZoom;
    if (e.key === "-") next -= STEP;
    if (e.key === "=" || e.key === "+") next += STEP;
    if (e.key === "0") next = 1;

    if (next !== currentZoom) {
      e.preventDefault();
      applyZoom(clamp(next));
    }
  });
}
